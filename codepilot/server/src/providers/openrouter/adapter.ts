/**
 * OpenRouter Provider Adapter
 * Implements ProviderAdapter using OpenAI SDK for OpenRouter's API.
 */

import OpenAI from 'openai';
import type {
  ProviderAdapter,
  ProviderAdapterConfig,
  ProviderTurnParams,
  ProviderStreamEvent,
  ProviderTurnResult,
  CoreMessage,
  CoreToolCallBlock,
  TokenUsage,
} from '../types';
import type { ToolInvocation } from '../../core/tools';
import { toOpenAITools, toOpenAIMessages } from './mapping';

/**
 * Default configuration values.
 */
const DEFAULTS = {
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4',
  maxTokens: 4096,
};

/**
 * Accumulator for building tool calls from streaming deltas.
 * OpenAI streams tool calls piece by piece.
 */
class ToolCallAccumulator {
  private toolCalls = new Map<number, {
    index: number;
    id: string;
    name: string;
    arguments: string;
  }>();

  addDelta(delta: {
    index: number;
    id?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }): void {
    const existing = this.toolCalls.get(delta.index);

    if (existing) {
      if (delta.id) existing.id = delta.id;
      if (delta.function?.name) existing.name = delta.function.name;
      if (delta.function?.arguments) existing.arguments += delta.function.arguments;
    } else {
      this.toolCalls.set(delta.index, {
        index: delta.index,
        id: delta.id ?? '',
        name: delta.function?.name ?? '',
        arguments: delta.function?.arguments ?? '',
      });
    }
  }

  getToolCalls(): Array<{ id: string; name: string; arguments: string }> {
    return Array.from(this.toolCalls.values())
      .sort((a, b) => a.index - b.index)
      .map(({ id, name, arguments: args }) => ({ id, name, arguments: args }));
  }

  hasToolCalls(): boolean {
    return this.toolCalls.size > 0;
  }
}

/**
 * OpenRouter adapter implementing the ProviderAdapter interface.
 */
export class OpenRouterAdapter implements ProviderAdapter {
  readonly id = 'openrouter' as const;
  readonly defaultModel: string;

  private client: OpenAI;
  private maxTokens: number;

  constructor(config: ProviderAdapterConfig) {
    this.client = new OpenAI({
      baseURL: config.baseURL || DEFAULTS.baseURL,
      apiKey: config.apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/codepilot',
        'X-Title': 'CodePilot',
      },
    });

    this.defaultModel = config.model || DEFAULTS.model;
    this.maxTokens = config.maxTokens || DEFAULTS.maxTokens;
  }

  /**
   * Send a turn to the LLM, streaming back events.
   */
  async *sendTurn(params: ProviderTurnParams): AsyncGenerator<ProviderStreamEvent> {
    const { messages, registry, loadedTools, model, signal } = params;

    // Get tools to send (meta tools + loaded tools)
    const toolDefs = registry.getLoadedTools(loadedTools);
    const openAITools = toOpenAITools(toolDefs);
    const openAIMessages = toOpenAIMessages(messages);

    // Make streaming request
    const stream = await this.client.chat.completions.create({
      model: model || this.defaultModel,
      messages: openAIMessages,
      tools: openAITools.length > 0 ? openAITools : undefined,
      max_tokens: this.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    });

    // Process stream
    let contentAccumulator = '';
    const toolCallAccumulator = new ToolCallAccumulator();
    let usageData: TokenUsage | null = null;

    try {
      for await (const chunk of stream) {
        // Check for abort
        if (signal?.aborted) {
          yield { type: 'error', error: 'Aborted by user' };
          break;
        }

        // Capture usage from final chunk
        if (chunk.usage) {
          usageData = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Text content delta
        if (delta.content) {
          contentAccumulator += delta.content;
          yield { type: 'text_delta', text: delta.content };
        }

        // Tool call deltas
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            // Emit start event for new tool calls
            if (tc.id && tc.function?.name) {
              yield { type: 'tool_call_start', id: tc.id, name: tc.function.name };
            }

            // Accumulate
            toolCallAccumulator.addDelta({
              index: tc.index,
              id: tc.id,
              function: tc.function,
            });

            // Emit argument deltas
            if (tc.function?.arguments && tc.id) {
              yield { type: 'tool_call_delta', id: tc.id, argumentsDelta: tc.function.arguments };
            }
          }
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      yield { type: 'error', error };
      return;
    }

    // Emit usage if captured
    if (usageData) {
      yield { type: 'usage', usage: usageData };
    }

    // Build result
    const toolCalls = toolCallAccumulator.getToolCalls();
    const toolInvocations: ToolInvocation[] = toolCalls.map(tc => ({
      id: tc.id,
      name: tc.name,
      input: safeParseJSON(tc.arguments),
    }));

    // Build messages to append
    const messagesToAppend: CoreMessage[] = [];

    if (toolCalls.length > 0) {
      // Assistant message with tool calls
      const toolCallBlocks: CoreToolCallBlock[] = toolCalls.map(tc => ({
        type: 'tool_call',
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      }));

      messagesToAppend.push({
        role: 'assistant',
        content: contentAccumulator
          ? [{ type: 'text', text: contentAccumulator }, ...toolCallBlocks]
          : toolCallBlocks,
      });

      // Emit completion events for tool calls
      for (const tc of toolCalls) {
        yield { type: 'tool_call_complete', id: tc.id };
      }
    } else if (contentAccumulator) {
      // Text-only assistant message
      messagesToAppend.push({
        role: 'assistant',
        content: contentAccumulator,
      });
    }

    const done = toolInvocations.length === 0;

    const result: ProviderTurnResult = {
      messagesToAppend,
      toolInvocations,
      done,
      textContent: contentAccumulator || undefined,
    };

    yield { type: 'turn_complete', result };
  }
}

/**
 * Safely parse JSON, returning empty object on failure.
 */
function safeParseJSON(jsonString: string): Record<string, unknown> {
  try {
    return JSON.parse(jsonString);
  } catch {
    console.error('Failed to parse tool arguments:', jsonString);
    return {};
  }
}

/**
 * Create an OpenRouter adapter from environment variables.
 */
export function createOpenRouterAdapter(): OpenRouterAdapter {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required');
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULTS.model;
  const maxTokens = process.env.MAX_TOKENS ? parseInt(process.env.MAX_TOKENS, 10) : DEFAULTS.maxTokens;

  return new OpenRouterAdapter({
    apiKey,
    model,
    maxTokens,
  });
}


/**
 * Agent loop implementation
 * Handles the conversation loop with LLM, streaming responses, and tool execution
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { FunctionParameters } from 'openai/resources/shared';
import type { ToolDefinition, StreamEvent, ToolCall, TokenUsage, ToolContext } from '../types';
import { createLLMClient, type ToolDef } from '../llm-client';
import { getToolByName } from '../tools/index';
import { getDefaultWorkingDir } from '../tools/utils';
import {
  CODING_AGENT_SYSTEM_PROMPT,
  systemMessage,
  userMessage,
  assistantToolCallMessage,
  toolResultMessage,
  ToolCallAccumulator,
  type ParsedToolCall,
} from './messages';

// Maximum number of tool call rounds to prevent infinite loops
const MAX_TOOL_ROUNDS = 20;

/**
 * Configuration for the agent loop
 */
export interface AgentLoopConfig {
  /** Initial user message to process */
  userPrompt: string;
  /** Available tools for the agent */
  tools: ToolDefinition[];
  /** Working directory for tool operations (defaults to PROJECT_ROOT or parent of cwd) */
  workingDir?: string;
  /** Optional existing conversation history */
  conversationHistory?: ChatCompletionMessageParam[];
  /** Optional custom system prompt */
  systemPrompt?: string;
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
  /** Optional model override for this conversation */
  model?: string;
}

/**
 * Runs the agent loop as an async generator
 * Yields StreamEvents as the agent processes the request
 *
 * The loop:
 * 1. Sends messages to the LLM with tool definitions
 * 2. Streams text deltas back to the caller
 * 3. When tool calls are detected, executes them and continues
 * 4. Repeats until no more tool calls or max rounds reached
 */
export async function* runAgentLoop(config: AgentLoopConfig): AsyncGenerator<StreamEvent> {
  const { userPrompt, tools, systemPrompt = CODING_AGENT_SYSTEM_PROMPT, signal, model: modelOverride } = config;
  
  // Create tool context with working directory
  const toolContext: ToolContext = {
    workingDir: config.workingDir || getDefaultWorkingDir(),
  };

  // Check if already aborted before starting
  if (signal?.aborted) {
    yield { type: 'error', error: 'Aborted before starting' };
    yield { type: 'done' };
    return;
  }

  // Initialize LLM client
  const llm = createLLMClient();

  // Check if the client supports tool calling
  if (!llm.capabilities.tools) {
    yield {
      type: 'error',
      error: `LLM provider "${llm.provider}" does not support tool calling. Please use OpenRouter (set OPENROUTER_API_KEY).`,
    };
    yield { type: 'done' };
    return;
  }

  // Build initial messages array
  // If conversationHistory is provided, check if it already has a system message
  // If not, prepend the systemPrompt to ensure it's not silently dropped
  let messages: ChatCompletionMessageParam[];
  if (config.conversationHistory) {
    const hasSystemMessage = config.conversationHistory.some((msg) => msg.role === 'system');
    messages = hasSystemMessage
      ? [...config.conversationHistory]
      : [systemMessage(systemPrompt), ...config.conversationHistory];
  } else {
    messages = [systemMessage(systemPrompt)];
  }

  // Add the user's message
  messages.push(userMessage(userPrompt));

  // Tool definitions for the API (cast inputSchema to FunctionParameters for OpenAI compatibility)
  const toolDefs: ToolDef[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as FunctionParameters,
  }));

  let roundCount = 0;
  let completedNaturally = false;

  // Main agent loop - continues until no tool calls or max rounds
  while (roundCount < MAX_TOOL_ROUNDS) {
    roundCount++;

    // Check for abort before each LLM call
    if (signal?.aborted) {
      yield { type: 'error', error: 'Aborted by user' };
      yield { type: 'done' };
      return;
    }

    // Stream the LLM response
    const stream = await llm.streamChatWithTools(messages, toolDefs, modelOverride);

    // Accumulate content and tool calls from the stream
    let contentAccumulator = '';
    const toolCallAccumulator = new ToolCallAccumulator();
    let usageData: TokenUsage | null = null;

    // Process streaming chunks
    for await (const chunk of stream) {
      // Capture usage data from the final chunk (when stream_options.include_usage is true)
      if (chunk.usage) {
        usageData = {
          prompt_tokens: chunk.usage.prompt_tokens,
          completion_tokens: chunk.usage.completion_tokens,
          total_tokens: chunk.usage.total_tokens,
        };
      }

      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      // Handle text content delta
      if (delta.content) {
        contentAccumulator += delta.content;
        yield { type: 'text_delta', text: delta.content };
      }

      // Handle tool call deltas (streamed incrementally)
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          toolCallAccumulator.addDelta({
            index: tc.index,
            id: tc.id,
            function: tc.function,
          });
        }
      }
    }

    // Emit usage event if we captured usage data
    if (usageData) {
      yield { type: 'usage', usage: usageData };
    }

    // Get the final parsed tool calls
    const parsedToolCalls = toolCallAccumulator.getToolCalls();

    // If no tool calls, we're done - add assistant response to messages for conversation continuity
    if (!toolCallAccumulator.hasToolCalls()) {
      if (contentAccumulator) {
        messages.push({ role: 'assistant', content: contentAccumulator });
      }
      completedNaturally = true;
      yield { type: 'done' };
      break;
    }

    // Add assistant message with tool calls to history
    messages.push(
      assistantToolCallMessage(
        parsedToolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        })),
        contentAccumulator || null
      )
    );

    // Execute each tool call and collect results
    for (const parsedTC of parsedToolCalls) {
      // Check for abort before each tool execution
      if (signal?.aborted) {
        yield { type: 'error', error: 'Aborted by user' };
        yield { type: 'done' };
        return;
      }

      // Parse arguments once to avoid redundant parsing
      const input = safeParseJSON(parsedTC.arguments);

      // Yield pending tool call event
      const pendingToolCall: ToolCall = {
        id: parsedTC.id,
        name: parsedTC.name,
        input,
        status: 'pending',
      };
      yield { type: 'tool_call', toolCall: pendingToolCall };

      // Execute the tool with pre-parsed input and context
      const result = await executeToolCall(parsedTC, input, toolContext);

      // Create a new object for the result event (don't mutate the pending one)
      const completedToolCall: ToolCall = {
        id: parsedTC.id,
        name: parsedTC.name,
        input,
        status: result.isError ? 'error' : 'completed',
        ...(result.isError ? { error: String(result.value) } : { result: result.value }),
      };

      yield { type: 'tool_result', toolCall: completedToolCall };

      // Add tool result to messages for next LLM call
      messages.push(toolResultMessage(parsedTC.id, result.value, result.isError));
    }
  }

  // If we hit max rounds without completing naturally, yield an error and done event
  if (roundCount >= MAX_TOOL_ROUNDS && !completedNaturally) {
    yield {
      type: 'error',
      error: `Agent stopped after ${MAX_TOOL_ROUNDS} tool call rounds to prevent infinite loops`,
    };
    yield { type: 'done' };
  }
}

/**
 * Executes a single tool call by looking up the handler and running it
 * @param parsedTC - The parsed tool call from the LLM
 * @param input - Pre-parsed arguments to avoid redundant JSON parsing
 * @param context - Tool context with working directory and other session info
 */
async function executeToolCall(
  parsedTC: ParsedToolCall,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<{ value: unknown; isError: boolean }> {
  const tool = getToolByName(parsedTC.name);

  if (!tool) {
    return {
      value: `Unknown tool: ${parsedTC.name}`,
      isError: true,
    };
  }

  try {
    const result = await tool.handler(input, context);
    return { value: result, isError: false };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { value: errorMessage, isError: true };
  }
}

/**
 * Safely parses JSON, returning an empty object on failure
 */
function safeParseJSON(jsonString: string): Record<string, unknown> {
  try {
    return JSON.parse(jsonString);
  } catch {
    console.error('Failed to parse tool arguments:', jsonString);
    return {};
  }
}

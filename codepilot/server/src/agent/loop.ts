/**
 * Agent loop implementation using ProviderAdapter abstraction.
 * Supports deferred tool loading where only meta-tools are initially available.
 */

import type { StreamEvent, ToolCall, TokenUsage, ToolContext } from '../types';
import type { ProviderAdapter, ProviderStreamEvent, CoreMessage, CoreToolResultBlock } from '../providers';
import { createOpenRouterAdapter } from '../providers';
import {
  globalRegistry,
  registerAllTools,
  executeInvocations,
  formatToolResult,
  type ToolInvocation,
  type ToolExecutionContext,
} from '../core/tools';
import { getDefaultWorkingDir } from '../tools/utils';
import { CODING_AGENT_SYSTEM_PROMPT } from './messages';
import { countTokens } from '../providers/token-counter';

// Maximum number of tool call rounds to prevent infinite loops
const MAX_TOOL_ROUNDS = 100;

// Ensure tools are registered
let toolsRegistered = false;
function ensureToolsRegistered(): void {
  if (!toolsRegistered) {
    registerAllTools();
    toolsRegistered = true;
  }
}

/**
 * Configuration for the agent loop
 */
export interface AgentLoopConfig {
  /** Initial user message to process */
  userPrompt: string;
  /** Working directory for tool operations (defaults to PROJECT_ROOT or parent of cwd) */
  workingDir?: string;
  /** Optional existing conversation history */
  conversationHistory?: CoreMessage[];
  /** Optional custom system prompt */
  systemPrompt?: string;
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
  /** Optional model override for this conversation */
  model?: string;
  /** Optional pre-loaded tools (for session continuity) */
  loadedTools?: Set<string>;
}

/**
 * Create the initial system message.
 */
function createSystemMessage(systemPrompt: string): CoreMessage {
  return {
    role: 'system',
    content: systemPrompt,
  };
}

/**
 * Create a user message.
 */
function createUserMessage(content: string): CoreMessage {
  return {
    role: 'user',
    content,
  };
}

/**
 * Create tool result messages from execution results.
 */
function createToolResultMessages(
  results: Array<{ id: string; name: string; value: unknown; isError: boolean }>
): CoreMessage {
  const blocks: CoreToolResultBlock[] = results.map((r) => ({
    type: 'tool_result',
    toolUseId: r.id,
    content: formatToolResult({
      id: r.id,
      name: r.name,
      value: r.value,
      isError: r.isError,
    }),
    isError: r.isError,
  }));

  return {
    role: 'user',
    content: blocks,
  };
}

/**
 * Runs the agent loop as an async generator.
 * Yields StreamEvents as the agent processes the request.
 *
 * Key feature: Deferred tool loading
 * - Only meta-tools (load_tools) are available initially
 * - Agent must call load_tools({ category: "..." }) to load other tools
 * - Loaded tools persist for the duration of the session
 */
export async function* runAgentLoop(config: AgentLoopConfig): AsyncGenerator<StreamEvent> {
  const { userPrompt, systemPrompt = CODING_AGENT_SYSTEM_PROMPT, signal, model } = config;

  // Ensure tools are registered with the global registry
  ensureToolsRegistered();

  // Check if already aborted before starting
  if (signal?.aborted) {
    yield { type: 'error', error: 'Aborted before starting' };
    yield { type: 'done' };
    return;
  }

  // Create provider adapter
  let adapter: ProviderAdapter;
  try {
    adapter = createOpenRouterAdapter();
  } catch (err) {
    yield { type: 'error', error: err instanceof Error ? err.message : 'Failed to create LLM adapter' };
    yield { type: 'done' };
    return;
  }

  // Initialize tool context
  const workingDir = config.workingDir || getDefaultWorkingDir();
  
  // Track loaded tools for this session (initially empty - only meta-tools available)
  const loadedTools = config.loadedTools || new Set<string>();
  
  const toolContext: ToolExecutionContext = {
    workingDir,
    loadedTools,
  };

  // Build initial messages array
  let messages: CoreMessage[];
  if (config.conversationHistory) {
    const hasSystemMessage = config.conversationHistory.some((msg) => msg.role === 'system');
    messages = hasSystemMessage
      ? [...config.conversationHistory]
      : [createSystemMessage(systemPrompt), ...config.conversationHistory];
  } else {
    messages = [createSystemMessage(systemPrompt)];
  }

  // Add the user's message
  messages.push(createUserMessage(userPrompt));

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

    // Count tokens BEFORE sending to get accurate context window estimate
    // This is the correct way to track context - not the API's reported usage
    const contextTokens = await countTokens(messages);
    yield {
      type: 'context',
      context: {
        contextTokens,
        accurate: true,
        source: 'tiktoken',
      },
    };

    // Stream the provider turn
    const turnGenerator = adapter.sendTurn({
      messages,
      registry: globalRegistry,
      loadedTools,
      model,
      signal,
    });

    let toolInvocations: ToolInvocation[] = [];
    let turnMessages: CoreMessage[] = [];

    // Process stream events
    for await (const event of turnGenerator) {
      switch (event.type) {
        case 'text_delta':
          yield { type: 'text_delta', text: event.text };
          break;

        case 'tool_call_start':
          // Emit pending tool call
          yield {
            type: 'tool_call',
            toolCall: {
              id: event.id,
              name: event.name,
              input: {},
              status: 'pending',
            },
          };
          break;

        case 'usage':
          yield {
            type: 'usage',
            usage: {
              prompt_tokens: event.usage.promptTokens,
              completion_tokens: event.usage.completionTokens,
              total_tokens: event.usage.totalTokens,
            },
          };
          break;

        case 'error':
          yield { type: 'error', error: event.error };
          break;

        case 'turn_complete':
          toolInvocations = event.result.toolInvocations;
          turnMessages = event.result.messagesToAppend;

          // If done with no tool calls, we're finished
          if (event.result.done) {
            messages.push(...turnMessages);
            completedNaturally = true;
          }
          break;
      }
    }

    // If no tool calls, we're done
    if (toolInvocations.length === 0) {
      if (completedNaturally) {
        yield { type: 'done' };
        break;
      }
      continue;
    }

    // Add assistant message with tool calls to history
    messages.push(...turnMessages);

    // Execute tool calls
    const toolResults = await executeInvocations(globalRegistry, toolInvocations, toolContext);

    // Yield results for each tool call
    for (const result of toolResults) {
      const toolCall: ToolCall = {
        id: result.id,
        name: result.name,
        input: toolInvocations.find((inv) => inv.id === result.id)?.input || {},
        status: result.isError ? 'error' : 'completed',
        ...(result.isError ? { error: String(result.error?.message || result.value) } : { result: result.value }),
      };
      yield { type: 'tool_result', toolCall };
    }

    // Add tool results to messages
    messages.push(createToolResultMessages(toolResults));
  }

  // If we hit max rounds without completing naturally
  if (roundCount >= MAX_TOOL_ROUNDS && !completedNaturally) {
    yield {
      type: 'error',
      error: `Agent stopped after ${MAX_TOOL_ROUNDS} tool call rounds to prevent infinite loops`,
    };
    yield { type: 'done' };
  }
}

/**
 * Legacy compatibility: Get the list of available tools.
 * @deprecated Use globalRegistry directly
 */
export function getAvailableTools() {
  ensureToolsRegistered();
  return globalRegistry.list();
}

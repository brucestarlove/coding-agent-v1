/**
 * Message type helpers for OpenAI/OpenRouter API format
 * Provides utilities for building conversation messages with tool support
 */

import type {
  ChatCompletionMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';

/**
 * System prompt for the coding agent
 * Defines the agent's behavior and capabilities
 */
export const CODING_AGENT_SYSTEM_PROMPT = `You are CodePilot, an AI coding assistant that helps developers with their projects.

You have access to the following tools to interact with the user's codebase:
- read_file: Read the contents of a file
- write_file: Create or overwrite a file with new content
- list_dir: List files and directories in a path
- run_shell: Execute shell commands in the project workspace

When helping users:
1. Always read files before modifying them to understand the context
2. Use list_dir to explore the project structure when needed
3. Explain what you're doing and why before making changes
4. Be careful with shell commands - prefer safe, non-destructive operations
5. When writing code, follow the existing style and conventions in the project

You can execute multiple tool calls in sequence to accomplish complex tasks.
After completing tool operations, summarize what you did and the results.`;

/**
 * Creates a system message
 */
export function systemMessage(content: string): ChatCompletionMessageParam {
  return { role: 'system', content };
}

/**
 * Creates a user message
 */
export function userMessage(content: string): ChatCompletionMessageParam {
  return { role: 'user', content };
}

/**
 * Creates an assistant message (text only, no tool calls)
 */
export function assistantMessage(content: string): ChatCompletionMessageParam {
  return { role: 'assistant', content };
}

/**
 * Creates an assistant message with tool calls
 * Used to reconstruct the assistant's response that included tool calls
 */
export function assistantToolCallMessage(
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string; // JSON string of the arguments
  }>,
  content?: string | null
): ChatCompletionAssistantMessageParam {
  return {
    role: 'assistant',
    content: content ?? null,
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: tc.arguments,
      },
    })),
  };
}

/**
 * Creates a tool result message
 * Sent after executing a tool to provide the result back to the model
 */
export function toolResultMessage(
  toolCallId: string,
  result: unknown,
  isError = false
): ChatCompletionToolMessageParam {
  // Serialize the result to a string
  const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: isError ? `Error: ${content}` : content,
  };
}

/**
 * Represents a parsed tool call from streaming chunks
 */
export interface ParsedToolCall {
  index: number;
  id: string;
  name: string;
  arguments: string; // Accumulated JSON string (may be incomplete during streaming)
}

/**
 * Accumulator for building tool calls from streaming deltas
 * OpenAI streams tool calls piece by piece, so we need to accumulate them
 */
export class ToolCallAccumulator {
  private toolCalls: Map<number, ParsedToolCall> = new Map();

  /**
   * Process a tool call delta from a streaming chunk
   */
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
      // Update existing tool call with new delta data
      if (delta.id) {
        existing.id = delta.id;
      }
      if (delta.function?.name) {
        existing.name = delta.function.name;
      }
      if (delta.function?.arguments) {
        existing.arguments += delta.function.arguments;
      }
    } else {
      // Create new tool call entry
      this.toolCalls.set(delta.index, {
        index: delta.index,
        id: delta.id ?? '',
        name: delta.function?.name ?? '',
        arguments: delta.function?.arguments ?? '',
      });
    }
  }

  /**
   * Get all accumulated tool calls
   */
  getToolCalls(): ParsedToolCall[] {
    return Array.from(this.toolCalls.values()).sort((a, b) => a.index - b.index);
  }

  /**
   * Check if there are any tool calls
   */
  hasToolCalls(): boolean {
    return this.toolCalls.size > 0;
  }

  /**
   * Reset the accumulator for the next turn
   */
  reset(): void {
    this.toolCalls.clear();
  }
}

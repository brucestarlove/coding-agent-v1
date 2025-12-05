/**
 * OpenRouter/OpenAI format mapping utilities.
 * Converts between provider-agnostic types and OpenAI API format.
 */

import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import type { ToolDefinition } from '../../core/tools';
import type { CoreMessage, CoreContentBlock } from '../types';

/**
 * Convert a ToolDefinition to OpenAI function calling format.
 */
export function toOpenAITool(tool: ToolDefinition): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as Record<string, unknown>,
    },
  };
}

/**
 * Convert multiple ToolDefinitions to OpenAI format.
 */
export function toOpenAITools(tools: ToolDefinition[]): ChatCompletionTool[] {
  return tools.map(toOpenAITool);
}

/**
 * Convert CoreMessage to OpenAI ChatCompletionMessageParam format.
 */
export function toOpenAIMessage(message: CoreMessage): ChatCompletionMessageParam {
  const { role, content } = message;

  // Simple string content
  if (typeof content === 'string') {
    if (role === 'system') {
      return { role: 'system', content };
    }
    if (role === 'user') {
      return { role: 'user', content };
    }
    if (role === 'assistant') {
      return { role: 'assistant', content };
    }
  }

  // Array content - need to handle different block types
  if (Array.isArray(content)) {
    // Check for tool result blocks (these become 'tool' role messages)
    const toolResults = content.filter((b): b is Extract<CoreContentBlock, { type: 'tool_result' }> => 
      b.type === 'tool_result'
    );
    
    if (toolResults.length > 0) {
      // Return first tool result as a tool message
      // Note: OpenAI expects one tool message per tool_call_id
      const result = toolResults[0];
      return {
        role: 'tool',
        tool_call_id: result.toolUseId,
        content: result.content,
      };
    }

    // Check for tool call blocks (assistant with tool_calls)
    const toolCalls = content.filter((b): b is Extract<CoreContentBlock, { type: 'tool_call' }> => 
      b.type === 'tool_call'
    );
    
    if (toolCalls.length > 0 && role === 'assistant') {
      // Get any text content
      const textBlocks = content.filter((b): b is Extract<CoreContentBlock, { type: 'text' }> => 
        b.type === 'text'
      );
      const textContent = textBlocks.map(b => b.text).join('') || null;

      return {
        role: 'assistant',
        content: textContent,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        })),
      };
    }

    // Text-only content
    const textBlocks = content.filter((b): b is Extract<CoreContentBlock, { type: 'text' }> => 
      b.type === 'text'
    );
    const textContent = textBlocks.map(b => b.text).join('');

    if (role === 'system') {
      return { role: 'system', content: textContent };
    }
    if (role === 'user') {
      return { role: 'user', content: textContent };
    }
    if (role === 'assistant') {
      return { role: 'assistant', content: textContent };
    }
  }

  // Fallback
  return { role: 'user', content: String(content) };
}

/**
 * Convert array of CoreMessages to OpenAI format.
 * Handles tool results specially - they need to be separate messages.
 */
export function toOpenAIMessages(messages: CoreMessage[]): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [];

  for (const message of messages) {
    if (typeof message.content === 'string') {
      result.push(toOpenAIMessage(message));
      continue;
    }

    // Handle array content with potential multiple tool results
    const toolResults = message.content.filter((b): b is Extract<CoreContentBlock, { type: 'tool_result' }> => 
      b.type === 'tool_result'
    );

    if (toolResults.length > 1) {
      // Multiple tool results need separate messages
      for (const toolResult of toolResults) {
        result.push({
          role: 'tool',
          tool_call_id: toolResult.toolUseId,
          content: toolResult.content,
        });
      }
    } else {
      result.push(toOpenAIMessage(message));
    }
  }

  return result;
}


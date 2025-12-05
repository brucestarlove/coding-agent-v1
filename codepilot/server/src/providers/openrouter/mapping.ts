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

// ============================================================================
// Reverse Conversion: OpenAI format -> CoreMessage format
// ============================================================================

/**
 * Convert OpenAI ChatCompletionMessageParam to CoreMessage format.
 * Used when loading conversation history from the database.
 */
export function fromOpenAIMessage(message: ChatCompletionMessageParam): CoreMessage {
  const role = message.role;

  // System message
  if (role === 'system') {
    const content = 'content' in message ? message.content : '';
    return {
      role: 'system',
      content: typeof content === 'string' ? content : '',
    };
  }

  // User message
  if (role === 'user') {
    const content = 'content' in message ? message.content : '';
    // Handle array content (multimodal) by extracting text
    if (Array.isArray(content)) {
      const textParts = content
        .filter((part): part is { type: 'text'; text: string } => 
          typeof part === 'object' && part !== null && 'type' in part && part.type === 'text'
        )
        .map(part => part.text);
      return {
        role: 'user',
        content: textParts.join(''),
      };
    }
    return {
      role: 'user',
      content: typeof content === 'string' ? content : '',
    };
  }

  // Assistant message
  if (role === 'assistant') {
    const assistantMsg = message as {
      role: 'assistant';
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };

    // Check for tool calls
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      const contentBlocks: CoreContentBlock[] = [];
      
      // Add text content if present
      if (assistantMsg.content) {
        contentBlocks.push({ type: 'text', text: assistantMsg.content });
      }
      
      // Add tool call blocks
      for (const tc of assistantMsg.tool_calls) {
        contentBlocks.push({
          type: 'tool_call',
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        });
      }
      
      return {
        role: 'assistant',
        content: contentBlocks,
      };
    }

    // Text-only assistant message
    return {
      role: 'assistant',
      content: assistantMsg.content || '',
    };
  }

  // Tool result message - convert to user message with tool_result content block
  // (In CoreMessage format, tool results are sent as user messages with special content)
  if (role === 'tool') {
    const toolMsg = message as {
      role: 'tool';
      tool_call_id: string;
      content: string;
    };
    
    return {
      role: 'user',
      content: [{
        type: 'tool_result',
        toolUseId: toolMsg.tool_call_id,
        content: toolMsg.content,
        isError: toolMsg.content.startsWith('Error:'),
      }],
    };
  }

  // Fallback for unknown roles
  return {
    role: 'user',
    content: '',
  };
}

/**
 * Convert array of OpenAI ChatCompletionMessageParam to CoreMessage format.
 * Used when loading conversation history from the database.
 * 
 * Note: This function groups consecutive tool result messages back into
 * a single user message with multiple tool_result content blocks, matching
 * how they were originally structured before being split for the OpenAI API.
 */
export function fromOpenAIMessages(messages: ChatCompletionMessageParam[]): CoreMessage[] {
  const result: CoreMessage[] = [];
  let pendingToolResults: Array<{ toolUseId: string; content: string; isError: boolean }> = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    // Collect consecutive tool messages
    if (message.role === 'tool') {
      const toolMsg = message as { role: 'tool'; tool_call_id: string; content: string };
      pendingToolResults.push({
        toolUseId: toolMsg.tool_call_id,
        content: toolMsg.content,
        isError: toolMsg.content.startsWith('Error:'),
      });
      
      // Check if next message is also a tool message
      const nextMessage = messages[i + 1];
      if (nextMessage?.role === 'tool') {
        continue; // Keep collecting tool results
      }
      
      // Flush pending tool results as a single user message
      if (pendingToolResults.length > 0) {
        result.push({
          role: 'user',
          content: pendingToolResults.map(tr => ({
            type: 'tool_result' as const,
            toolUseId: tr.toolUseId,
            content: tr.content,
            isError: tr.isError,
          })),
        });
        pendingToolResults = [];
      }
      continue;
    }

    // Flush any pending tool results before adding non-tool message
    if (pendingToolResults.length > 0) {
      result.push({
        role: 'user',
        content: pendingToolResults.map(tr => ({
          type: 'tool_result' as const,
          toolUseId: tr.toolUseId,
          content: tr.content,
          isError: tr.isError,
        })),
      });
      pendingToolResults = [];
    }

    // Convert non-tool message
    result.push(fromOpenAIMessage(message));
  }

  // Flush any remaining tool results
  if (pendingToolResults.length > 0) {
    result.push({
      role: 'user',
      content: pendingToolResults.map(tr => ({
        type: 'tool_result' as const,
        toolUseId: tr.toolUseId,
        content: tr.content,
        isError: tr.isError,
      })),
    });
  }

  return result;
}

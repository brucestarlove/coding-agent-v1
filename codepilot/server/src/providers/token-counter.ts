/**
 * Token Counter Module
 * 
 * Provides accurate token counting for context window management.
 * Uses tiktoken locally - NO API calls needed.
 * 
 * For Claude models through OpenRouter, we use cl100k_base encoding
 * which is very close to Claude's tokenizer (~95%+ accuracy).
 */

import { get_encoding, type Tiktoken } from 'tiktoken';
import type { CoreMessage } from './types';

/** Cached tiktoken encoder (cl100k_base works well for Claude models) */
let encoder: Tiktoken | null = null;

/**
 * Get or create the tiktoken encoder.
 * Throws if initialization fails.
 */
function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = get_encoding('cl100k_base');
  }
  return encoder;
}

/**
 * Serialize a message to a string for token counting.
 * Approximates how the message appears in the context.
 */
function serializeMessage(msg: CoreMessage): string {
  const parts: string[] = [];
  
  // Role marker
  parts.push(`\n\n${msg.role}:\n`);
  
  if (typeof msg.content === 'string') {
    parts.push(msg.content);
  } else {
    for (const block of msg.content) {
      if (block.type === 'text') {
        parts.push(block.text);
      } else if (block.type === 'tool_call') {
        parts.push(`\n<tool_use id="${block.id}" name="${block.name}">\n`);
        parts.push(block.arguments);
        parts.push('\n</tool_use>\n');
      } else if (block.type === 'tool_result') {
        parts.push(`\n<tool_result tool_use_id="${block.toolUseId}">\n`);
        parts.push(block.content);
        parts.push('\n</tool_result>\n');
      }
    }
  }
  
  return parts.join('');
}

/**
 * Count tokens for a conversation using tiktoken.
 */
export async function countTokens(messages: CoreMessage[]): Promise<number> {
  const enc = getEncoder();
  let total = 0;
  
  for (const msg of messages) {
    const serialized = serializeMessage(msg);
    total += enc.encode(serialized).length;
  }
  
  // Message boundary overhead (~3 tokens per message)
  total += messages.length * 3;
  
  return total;
}

/**
 * Count tokens for tool definitions.
 */
export function countToolTokens(tools: Array<{ name: string; description: string; inputSchema: object }>): number {
  const enc = getEncoder();
  let total = 0;
  
  for (const tool of tools) {
    const toolText = `<tool name="${tool.name}" description="${tool.description}">\n${JSON.stringify(tool.inputSchema)}\n</tool>`;
    total += enc.encode(toolText).length;
  }
  
  return total;
}

/**
 * Count tokens in a single string.
 */
export function countTextTokens(text: string): number {
  return getEncoder().encode(text).length;
}

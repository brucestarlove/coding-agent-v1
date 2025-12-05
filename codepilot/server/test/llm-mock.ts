/**
 * Mock LLM client for deterministic agent loop testing
 */
import type { ChatCompletionChunk } from 'openai/resources/chat/completions';

export interface MockChunk {
  content?: string;
  toolCalls?: Array<{
    index: number;
    id: string;
    name: string;
    arguments: string;
  }>;
  finishReason?: 'stop' | 'tool_calls';
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Create a mock stream that yields the specified chunks
 */
export async function* createMockStream(chunks: MockChunk[]): AsyncGenerator<ChatCompletionChunk> {
  for (const chunk of chunks) {
    const delta: Record<string, unknown> = {};

    if (chunk.content) {
      delta.content = chunk.content;
    }

    if (chunk.toolCalls) {
      delta.tool_calls = chunk.toolCalls.map((tc) => ({
        index: tc.index,
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      }));
    }

    const result: ChatCompletionChunk = {
      id: 'mock-chunk',
      object: 'chat.completion.chunk',
      created: Date.now(),
      model: 'mock-model',
      choices: [
        {
          index: 0,
          delta,
          finish_reason: chunk.finishReason || null,
          logprobs: null,
        },
      ],
      usage: chunk.usage,
    };

    yield result;
  }
}

/**
 * Create chunks for a simple text response
 */
export function textResponseChunks(text: string): MockChunk[] {
  // Split into smaller chunks to simulate streaming
  const words = text.split(' ');
  const chunks: MockChunk[] = words.map((word, i) => ({
    content: i === 0 ? word : ' ' + word,
  }));

  // Add final chunk with finish reason
  chunks.push({ finishReason: 'stop' });

  return chunks;
}

/**
 * Create chunks for a tool call response
 */
export function toolCallChunks(
  toolCalls: Array<{ id: string; name: string; arguments: string }>,
  prefixContent?: string
): MockChunk[] {
  const chunks: MockChunk[] = [];

  // Add optional prefix content
  if (prefixContent) {
    chunks.push({ content: prefixContent });
  }

  // Add tool calls
  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i];
    // First chunk with id and name
    chunks.push({
      toolCalls: [
        {
          index: i,
          id: tc.id,
          name: tc.name,
          arguments: '',
        },
      ],
    });
    // Arguments in chunks
    chunks.push({
      toolCalls: [
        {
          index: i,
          id: '',
          name: '',
          arguments: tc.arguments,
        },
      ],
    });
  }

  // Finish with tool_calls reason
  chunks.push({ finishReason: 'tool_calls' });

  return chunks;
}

/**
 * Create a sequence of responses for multi-turn conversations
 */
export class MockLLMSequence {
  private responses: MockChunk[][] = [];
  private callIndex = 0;

  addTextResponse(text: string): this {
    this.responses.push(textResponseChunks(text));
    return this;
  }

  addToolCallResponse(
    toolCalls: Array<{ id: string; name: string; arguments: string }>,
    prefixContent?: string
  ): this {
    this.responses.push(toolCallChunks(toolCalls, prefixContent));
    return this;
  }

  getNextStream(): AsyncGenerator<ChatCompletionChunk> {
    if (this.callIndex >= this.responses.length) {
      throw new Error('No more mock responses available');
    }
    return createMockStream(this.responses[this.callIndex++]);
  }

  reset(): void {
    this.callIndex = 0;
  }
}


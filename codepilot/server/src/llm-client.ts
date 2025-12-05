/**
 * LLM Client Factory
 * Supports both Anthropic SDK and OpenRouter (via OpenAI SDK)
 * Provides streaming chat with tool calling support
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import type { FunctionParameters } from 'openai/resources/shared';

// Environment configuration - read lazily to ensure dotenv has loaded
function getEnvConfig() {
  const maxTokens = process.env.MAX_TOKENS ? parseInt(process.env.MAX_TOKENS, 10) : 4096;
  if (isNaN(maxTokens)) {
    throw new Error('MAX_TOKENS must be a valid number');
  }
  const openRouterModel =
    process.env.OPENROUTER_MODEL ||
    process.env.OPENROUTER_MODEL_SONNET ||
    'anthropic/claude-sonnet-4.5';

  return {
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens,
    openRouterModel,
  };
}

// Export available models for future model selection UI (read lazily)
export function getAvailableModels() {
  return {
    sonnet: process.env.OPENROUTER_MODEL_SONNET || 'anthropic/claude-sonnet-4.5',
    haiku: process.env.OPENROUTER_MODEL_HAIKU || 'anthropic/claude-haiku-4.5',
    opus: process.env.OPENROUTER_MODEL_OPUS || 'anthropic/claude-opus-4.5',
  };
}

/**
 * Capabilities that an LLM client may or may not support
 * Check these before calling methods that depend on them
 */
export interface LLMClientCapabilities {
  /** Whether the client supports tool calling via streamChatWithTools */
  tools: boolean;
}

/**
 * Tool definition in internal format (matches our ToolDefinition interface)
 */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: FunctionParameters; // JSON Schema compatible with OpenAI API
}

/**
 * Converts internal tool definitions to OpenAI API format
 */
export function toOpenAITools(tools: ToolDef[]): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

/**
 * Creates an LLM client based on available environment variables
 * Priority: OpenRouter > Anthropic direct
 */
export function createLLMClient() {
  const env = getEnvConfig();

  if (env.openRouterApiKey) {
    console.log('🔌 Using OpenRouter API');
    return createOpenRouterClient(env);
  } else if (env.anthropicApiKey) {
    console.log('🔌 Using Anthropic API');
    return createAnthropicClient(env);
  } else {
    throw new Error(
      'No API key found. Please set either OPENROUTER_API_KEY or ANTHROPIC_API_KEY in your .env file'
    );
  }
}

/**
 * OpenRouter client (OpenAI-compatible API)
 */
function createOpenRouterClient(env: ReturnType<typeof getEnvConfig>) {
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: env.openRouterApiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://github.com/codepilot', // Optional: for rankings
      'X-Title': 'CodePilot', // Optional: shows in OpenRouter dashboard
    },
  });

  const model = env.openRouterModel;
  const maxTokens = env.maxTokens;

  return {
    provider: 'openrouter' as const,
    model,
    client,
    /** OpenRouter supports tool calling */
    capabilities: { tools: true } as LLMClientCapabilities,

    /**
     * Stream a chat completion (OpenAI format) - basic version without tools
     */
    async streamChat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) {
      const stream = await client.chat.completions.create({
        model,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        max_tokens: maxTokens,
        stream: true,
      });
      return stream;
    },

    /**
     * Stream a chat completion with tool definitions
     * Returns the raw OpenAI streaming response for the agent loop to process
     * @param messages - Conversation history in OpenAI format
     * @param tools - Tool definitions to provide to the model
     */
    async streamChatWithTools(
      messages: ChatCompletionMessageParam[],
      tools: ToolDef[]
    ) {
      const openAITools = toOpenAITools(tools);

      const stream = await client.chat.completions.create({
        model,
        messages,
        tools: openAITools.length > 0 ? openAITools : undefined,
        max_tokens: maxTokens,
        stream: true,
      });

      return stream;
    },
  };
}

/**
 * Anthropic direct client
 */
function createAnthropicClient(env: ReturnType<typeof getEnvConfig>) {
  const client = new Anthropic({
    apiKey: env.anthropicApiKey,
  });

  const maxTokens = env.maxTokens;

  return {
    provider: 'anthropic' as const,
    model: 'claude-3-5-sonnet-20241022',
    client,
    /** Anthropic direct client does not yet support tool calling - use OpenRouter instead */
    capabilities: { tools: false } as LLMClientCapabilities,

    /**
     * Stream a message (Anthropic format)
     */
    async streamMessage(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
      const stream = await client.messages.stream({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: maxTokens,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      });
      return stream;
    },

    /**
     * Placeholder for tool-based streaming (Anthropic format)
     * Note: Anthropic uses a different format for tools - implement if needed
     */
    async streamChatWithTools(
      _messages: ChatCompletionMessageParam[],
      _tools: ToolDef[]
    ) {
      throw new Error('Anthropic direct client tool support not yet implemented. Use OpenRouter.');
    },
  };
}

// Export types for use in other modules
export type LLMClient = ReturnType<typeof createLLMClient>;
export type OpenRouterClient = ReturnType<typeof createOpenRouterClient>;

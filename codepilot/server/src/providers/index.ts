/**
 * Provider module exports.
 * Provides abstractions for different LLM providers.
 */

// Types
export type {
  ProviderId,
  CoreRole,
  CoreTextBlock,
  CoreToolResultBlock,
  CoreToolCallBlock,
  CoreContentBlock,
  CoreMessage,
  ProviderTurnResult,
  TokenUsage,
  ProviderStreamEvent,
  ProviderTurnParams,
  ProviderAdapter,
  ProviderAdapterConfig,
} from './types';

// OpenRouter
export { OpenRouterAdapter, createOpenRouterAdapter } from './openrouter';

// Message format conversion utilities
export { fromOpenAIMessage, fromOpenAIMessages } from './openrouter/mapping';

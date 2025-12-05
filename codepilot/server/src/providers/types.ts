/**
 * Provider Adapter types - abstractions for different LLM providers.
 * Each provider implements this interface to integrate with the agent loop.
 */

import type { ToolDefinition, ToolInvocation, ToolRegistry } from '../core/tools';

/**
 * Provider identifiers for supported LLM providers.
 */
export type ProviderId = 'openrouter' | 'anthropic' | 'openai' | 'local';

/**
 * Role for messages in conversation.
 */
export type CoreRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Text content block.
 */
export interface CoreTextBlock {
  type: 'text';
  text: string;
}

/**
 * Tool result content block - sent back after tool execution.
 */
export interface CoreToolResultBlock {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError?: boolean;
}

/**
 * Tool call content block - represents a tool call from the assistant.
 */
export interface CoreToolCallBlock {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: string; // JSON string
}

/**
 * Union of all content block types.
 */
export type CoreContentBlock = CoreTextBlock | CoreToolResultBlock | CoreToolCallBlock;

/**
 * Provider-agnostic message format.
 */
export interface CoreMessage {
  role: CoreRole;
  content: string | CoreContentBlock[];
}

/**
 * Result from a provider turn (single LLM call).
 */
export interface ProviderTurnResult {
  /** Messages to append to conversation history */
  messagesToAppend: CoreMessage[];
  /** Tool invocations that need to be executed */
  toolInvocations: ToolInvocation[];
  /** Whether the model has finished (no more tool calls needed) */
  done: boolean;
  /** Text content from this turn (for streaming to UI) */
  textContent?: string;
}

/**
 * Token usage information.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Pre-send context estimation (from local token counting).
 * This is the ACCURATE context window usage before the API call.
 */
export interface ContextEstimate {
  /** Estimated tokens in the context window */
  contextTokens: number;
  /** Whether this is accurate (tiktoken) or heuristic estimate */
  accurate: boolean;
  /** Source of the estimate */
  source: 'tiktoken' | 'heuristic';
}

/**
 * Events emitted during a provider turn for streaming UI updates.
 */
export type ProviderStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_delta'; id: string; argumentsDelta: string }
  | { type: 'tool_call_complete'; id: string }
  | { type: 'context_estimate'; estimate: ContextEstimate }  // Pre-send context size
  | { type: 'usage'; usage: TokenUsage }                     // Post-response API usage (for cost)
  | { type: 'error'; error: string }
  | { type: 'turn_complete'; result: ProviderTurnResult };

/**
 * Parameters for a provider turn.
 */
export interface ProviderTurnParams {
  /** Conversation messages */
  messages: CoreMessage[];
  /** Tool registry for looking up tools */
  registry: ToolRegistry;
  /** Set of currently loaded tool names */
  loadedTools: Set<string>;
  /** Optional model override */
  model?: string;
  /** Optional abort signal */
  signal?: AbortSignal;
}

/**
 * Provider adapter interface.
 * Each LLM provider implements this to integrate with the agent loop.
 */
export interface ProviderAdapter {
  /** Provider identifier */
  readonly id: ProviderId;

  /** Default model for this provider */
  readonly defaultModel: string;

  /**
   * Send a turn to the LLM and stream back events.
   * Yields events as they occur (text deltas, tool calls, etc.)
   * Final event is always 'turn_complete' with the full result.
   */
  sendTurn(params: ProviderTurnParams): AsyncGenerator<ProviderStreamEvent>;
}

/**
 * Configuration for creating a provider adapter.
 */
export interface ProviderAdapterConfig {
  /** API key for the provider */
  apiKey: string;
  /** Base URL override (for proxies, local models, etc.) */
  baseURL?: string;
  /** Default model to use */
  model?: string;
  /** Maximum tokens for responses */
  maxTokens?: number;
}


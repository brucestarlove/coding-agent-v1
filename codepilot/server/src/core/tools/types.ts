/**
 * Provider-agnostic tool type definitions.
 * These types are independent of any specific LLM provider (OpenRouter, Anthropic, OpenAI, etc.)
 */

import type { JSONSchema7 } from 'json-schema';

/**
 * Tool categories for deferred loading.
 * Tools are grouped by category and only loaded when needed.
 */
export type ToolCategory = 'file_ops' | 'git' | 'search' | 'shell' | 'meta';

/**
 * Context passed to tool handlers during execution.
 * Contains session-specific information like working directory.
 */
export interface ToolExecutionContext {
  /** Working directory for file/shell/git operations */
  workingDir: string;
  /** Optional correlation ID for tracing */
  correlationId?: string;
  /** Set of currently loaded tool names for this session */
  loadedTools?: Set<string>;
}

/**
 * Metadata hints for tool behavior.
 * These are provider-agnostic but may be used differently by each adapter.
 */
export interface ToolMetadata {
  /** Tool category for deferred loading */
  category: ToolCategory;

  /**
   * Mark as high frequency - hints that this tool is used often.
   * Some providers may use this to optimize tool loading.
   */
  highFrequency?: boolean;

  /**
   * Example inputs for the tool.
   * Used for documentation and potentially by providers that support input examples.
   */
  inputExamples?: unknown[];

  /**
   * Whether this tool can be called programmatically from code execution.
   * Reserved for future use with providers that support this feature.
   */
  programmaticFrom?: string[];
}

/**
 * Base tool definition - provider-agnostic.
 * @template I - Input type for the handler
 * @template O - Output type from the handler
 */
export interface BaseToolDefinition<I = Record<string, unknown>, O = unknown> {
  /** Unique tool name (used as identifier across all providers) */
  name: string;

  /** Human-readable description of what the tool does */
  description: string;

  /** JSON Schema describing the input parameters */
  inputSchema: JSONSchema7;

  /** Handler function that executes the tool */
  handler: (input: I, context: ToolExecutionContext) => Promise<O>;

  /** Optional metadata for provider-specific optimizations */
  metadata: ToolMetadata;
}

/**
 * Tool definition without generic types - for runtime use.
 * This is what gets stored in the registry.
 */
export type ToolDefinition = BaseToolDefinition<Record<string, unknown>, unknown>;

/**
 * Category metadata for the load_tools meta-tool.
 */
export interface CategoryInfo {
  name: ToolCategory;
  description: string;
  toolCount: number;
  tools: string[];
}


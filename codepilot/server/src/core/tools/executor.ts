/**
 * Tool Executor - executes tool invocations using the registry.
 * Provider-agnostic execution layer that handlers tool calls from any adapter.
 */

import type { ToolRegistry } from './registry';
import type { ToolExecutionContext } from './types';

/**
 * Represents a tool invocation from the LLM.
 * Provider adapters convert their native format to this.
 */
export interface ToolInvocation {
  /** Unique ID for this tool call (used to match results) */
  id: string;
  /** Name of the tool to invoke */
  name: string;
  /** Parsed input arguments */
  input: Record<string, unknown>;
  /** Optional caller metadata (for programmatic calling) */
  caller?: {
    type: string;
    toolId?: string;
  };
}

/**
 * Result of a tool execution.
 */
export interface ToolResult {
  /** ID matching the original invocation */
  id: string;
  /** Name of the tool that was invoked */
  name: string;
  /** Result value from the handler (or null on error) */
  value: unknown;
  /** Error if execution failed */
  error?: Error;
  /** Whether this was an error result */
  isError: boolean;
}

/**
 * Execute a list of tool invocations.
 * Runs each invocation sequentially and collects results.
 *
 * @param registry - Tool registry to look up handlers
 * @param invocations - List of tool calls to execute
 * @param context - Execution context (workingDir, etc.)
 * @returns Array of results in the same order as invocations
 */
export async function executeInvocations(
  registry: ToolRegistry,
  invocations: ToolInvocation[],
  context: ToolExecutionContext
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const invocation of invocations) {
    const result = await executeSingleInvocation(registry, invocation, context);
    results.push(result);
  }

  return results;
}

/**
 * Execute a single tool invocation.
 */
async function executeSingleInvocation(
  registry: ToolRegistry,
  invocation: ToolInvocation,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const tool = registry.get(invocation.name);

  // Tool not found in registry
  if (!tool) {
    return {
      id: invocation.id,
      name: invocation.name,
      value: null,
      error: new Error(`Unknown tool: "${invocation.name}". Use load_tools to see available categories.`),
      isError: true,
    };
  }

  // Check if tool is loaded (skip check for meta tools which are always available)
  if (tool.metadata.category !== 'meta' && context.loadedTools) {
    if (!context.loadedTools.has(invocation.name)) {
      return {
        id: invocation.id,
        name: invocation.name,
        value: null,
        error: new Error(
          `Tool "${invocation.name}" is not loaded. ` +
            `Use load_tools({ category: "${tool.metadata.category}" }) to load it first.`
        ),
        isError: true,
      };
    }
  }

  // Execute the handler
  try {
    const value = await tool.handler(invocation.input, context);
    return {
      id: invocation.id,
      name: invocation.name,
      value,
      isError: false,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      id: invocation.id,
      name: invocation.name,
      value: null,
      error,
      isError: true,
    };
  }
}

/**
 * Format a tool result for returning to the LLM.
 * Serializes the value to a string format.
 */
export function formatToolResult(result: ToolResult): string {
  if (result.isError && result.error) {
    return `Error: ${result.error.message}`;
  }

  if (result.value === null || result.value === undefined) {
    return 'null';
  }

  if (typeof result.value === 'string') {
    return result.value;
  }

  return JSON.stringify(result.value, null, 2);
}


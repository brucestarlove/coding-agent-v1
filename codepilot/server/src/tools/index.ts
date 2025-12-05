/**
 * Tool registry - exports all tools and provides lookup functionality.
 */

import type { ToolDefinition } from '../types';
import { readFileTool, writeFileTool, listDirTool, editFileTool } from './fileTools';
import { runShellTool } from './shellTool';
import { gitDiffTool, gitStatusTool, gitLogTool } from './gitTools';

// Re-export utilities for convenience
export { resolveSafePath, getProjectRoot } from './utils';

/**
 * All available tool definitions.
 */
export const tools: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  listDirTool,
  runShellTool,
  gitDiffTool,
  gitStatusTool,
  gitLogTool,
];

/**
 * Look up a tool by its name.
 * @param name - The tool name to find
 * @returns The tool definition, or undefined if not found
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

/**
 * Tools formatted for the Claude/OpenRouter API.
 * Uses input_schema instead of inputSchema for API compatibility.
 */
export const anthropicTools = tools.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema,
}));

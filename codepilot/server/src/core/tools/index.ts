/**
 * Core tools module - provider-agnostic tool system.
 */

// Types
export type {
  ToolCategory,
  ToolExecutionContext,
  ToolMetadata,
  BaseToolDefinition,
  ToolDefinition,
  CategoryInfo,
} from './types';

// Registry
export { ToolRegistry, globalRegistry } from './registry';

// Executor
export type { ToolInvocation, ToolResult } from './executor';
export { executeInvocations, formatToolResult } from './executor';

// Tool definitions
export {
  allTools,
  registerAllTools,
  fileTools,
  gitTools,
  searchTools,
  shellTools,
  metaTools,
  loadToolsTool,
  readFileTool,
  writeFileTool,
  listDirTool,
  editFileTool,
  gitDiffTool,
  gitStatusTool,
  gitLogTool,
  grepTool,
  findFilesTool,
  runShellTool,
} from './definitions';


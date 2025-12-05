/**
 * Tool definitions index - exports all tool categories.
 */

// File operations
export { fileTools, readFileTool, writeFileTool, listDirTool, editFileTool } from './fileTools';

// Git operations
export { gitTools, gitDiffTool, gitStatusTool, gitLogTool } from './gitTools';

// Search operations
export { searchTools, grepTool, findFilesTool } from './searchTools';

// Shell operations
export { shellTools, runShellTool } from './shellTool';

// Meta tools (always loaded)
export { metaTools, loadToolsTool } from './metaTools';

// All tools combined
import { fileTools } from './fileTools';
import { gitTools } from './gitTools';
import { searchTools } from './searchTools';
import { shellTools } from './shellTool';
import { metaTools } from './metaTools';

/**
 * All tool definitions organized by category.
 */
export const allTools = [
  ...metaTools,    // Meta tools first (always loaded)
  ...fileTools,    // file_ops category
  ...gitTools,     // git category
  ...searchTools,  // search category
  ...shellTools,   // shell category
];

/**
 * Register all tools with the global registry.
 * Call this at application startup.
 * Idempotent - safe to call multiple times.
 */
import { globalRegistry } from '../registry';

let toolsRegistered = false;

export function registerAllTools(): void {
  if (toolsRegistered) return;
  toolsRegistered = true;
  globalRegistry.registerAll(allTools);
}


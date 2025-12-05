/**
 * Tool registry - backward compatibility shim.
 * 
 * This file maintains backward compatibility with existing imports.
 * New code should import from '../core/tools' instead.
 * 
 * @deprecated Import from '../core/tools' for new code
 */

import type { ToolDefinition as OldToolDefinition } from '../types';
import {
  globalRegistry,
  registerAllTools,
  type ToolDefinition as NewToolDefinition,
} from '../core/tools';

// Re-export utilities for convenience
export { resolveSafePath, getProjectRoot, resolvePath, toRelativePath, getDefaultWorkingDir } from './utils';

// Ensure tools are registered
let registered = false;
function ensureRegistered(): void {
  if (!registered) {
    registerAllTools();
    registered = true;
  }
}

/**
 * All available tool definitions.
 * @deprecated Use globalRegistry.list() from '../core/tools'
 */
export function getTools(): OldToolDefinition[] {
  ensureRegistered();
  // Convert new format to old format for backward compatibility
  return globalRegistry.list().map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as object,
    handler: t.handler,
  }));
}

// Legacy export - array of tools
// Note: This is computed lazily to ensure tools are registered
export const tools: OldToolDefinition[] = new Proxy([] as OldToolDefinition[], {
  get(target, prop) {
    ensureRegistered();
    const toolList = globalRegistry.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as object,
      handler: t.handler,
    }));
    
    if (prop === 'length') return toolList.length;
    if (prop === Symbol.iterator) return toolList[Symbol.iterator].bind(toolList);
    if (typeof prop === 'string' && !isNaN(Number(prop))) {
      return toolList[Number(prop)];
    }
    if (prop === 'map') return toolList.map.bind(toolList);
    if (prop === 'find') return toolList.find.bind(toolList);
    if (prop === 'filter') return toolList.filter.bind(toolList);
    if (prop === 'forEach') return toolList.forEach.bind(toolList);
    
    return Reflect.get(toolList, prop);
  },
});

/**
 * Look up a tool by its name.
 * @deprecated Use globalRegistry.get() from '../core/tools'
 */
export function getToolByName(name: string): OldToolDefinition | undefined {
  ensureRegistered();
  const tool = globalRegistry.get(name);
  if (!tool) return undefined;
  
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as object,
    handler: tool.handler,
  };
}

/**
 * Tools formatted for the Claude/OpenRouter API.
 * @deprecated Use the provider adapter's mapping functions
 */
export const anthropicTools = new Proxy([] as Array<{ name: string; description: string; input_schema: object }>, {
  get(target, prop) {
    ensureRegistered();
    const toolList = globalRegistry.list().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as object,
    }));
    
    if (prop === 'length') return toolList.length;
    if (prop === Symbol.iterator) return toolList[Symbol.iterator].bind(toolList);
    if (typeof prop === 'string' && !isNaN(Number(prop))) {
      return toolList[Number(prop)];
    }
    if (prop === 'map') return toolList.map.bind(toolList);
    
    return Reflect.get(toolList, prop);
  },
});

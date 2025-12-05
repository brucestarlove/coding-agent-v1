/**
 * Tool Registry - manages tool definitions and category-based loading.
 * Supports deferred tool loading where only the meta-tool is initially available.
 */

import type { ToolDefinition, ToolCategory, CategoryInfo } from './types';

/**
 * Category descriptions for the load_tools meta-tool.
 */
const CATEGORY_DESCRIPTIONS: Record<ToolCategory, string> = {
  file_ops: 'File system operations: read, write, edit, and list files',
  git: 'Git operations: diff, status, and log',
  search: 'Search tools: grep and find files',
  shell: 'Shell command execution',
  meta: 'Meta-tools for discovering and loading other tools',
};

/**
 * Class-based tool registry with category support.
 * Manages all tool definitions and tracks which tools are loaded per session.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private toolsByCategory = new Map<ToolCategory, Set<string>>();

  /**
   * Register a tool definition.
   * @throws Error if a tool with the same name is already registered
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name "${tool.name}" is already registered`);
    }

    this.tools.set(tool.name, tool);

    // Index by category
    const category = tool.metadata.category;
    if (!this.toolsByCategory.has(category)) {
      this.toolsByCategory.set(category, new Set());
    }
    this.toolsByCategory.get(category)!.add(tool.name);
  }

  /**
   * Register multiple tools at once.
   */
  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by name.
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools.
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tools in a specific category.
   */
  getByCategory(category: ToolCategory): ToolDefinition[] {
    const toolNames = this.toolsByCategory.get(category);
    if (!toolNames) return [];

    return Array.from(toolNames)
      .map((name) => this.tools.get(name)!)
      .filter(Boolean);
  }

  /**
   * Get tool names in a category.
   */
  getToolNamesInCategory(category: ToolCategory): string[] {
    const toolNames = this.toolsByCategory.get(category);
    return toolNames ? Array.from(toolNames) : [];
  }

  /**
   * Get all available categories with their info.
   */
  getCategories(): CategoryInfo[] {
    const categories: CategoryInfo[] = [];

    for (const [category, toolNames] of this.toolsByCategory.entries()) {
      categories.push({
        name: category,
        description: CATEGORY_DESCRIPTIONS[category] || category,
        toolCount: toolNames.size,
        tools: Array.from(toolNames),
      });
    }

    return categories.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Check if a category exists.
   */
  hasCategory(category: string): category is ToolCategory {
    return this.toolsByCategory.has(category as ToolCategory);
  }

  /**
   * Get the meta tools (always loaded).
   */
  getMetaTools(): ToolDefinition[] {
    return this.getByCategory('meta');
  }

  /**
   * Get tools that should be sent to the LLM based on loaded set.
   * Always includes meta tools, plus any tools in the loadedTools set.
   */
  getLoadedTools(loadedTools: Set<string>): ToolDefinition[] {
    const result: ToolDefinition[] = [];

    // Always include meta tools
    for (const tool of this.getMetaTools()) {
      result.push(tool);
    }

    // Include explicitly loaded tools (excluding meta since already added)
    for (const toolName of loadedTools) {
      const tool = this.tools.get(toolName);
      if (tool && tool.metadata.category !== 'meta') {
        result.push(tool);
      }
    }

    return result;
  }
}

/**
 * Global registry instance.
 * Tools register themselves here on import.
 */
export const globalRegistry = new ToolRegistry();


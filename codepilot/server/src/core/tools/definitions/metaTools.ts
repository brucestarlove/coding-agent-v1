/**
 * Meta tools - tools for discovering and loading other tools.
 * Category: meta
 * 
 * These tools are always loaded and available to the agent.
 */

import type { ToolDefinition, ToolCategory, CategoryInfo } from '../types';
import { globalRegistry } from '../registry';

/**
 * Response from load_tools when listing categories.
 */
interface ListCategoriesResponse {
  action: 'list';
  categories: CategoryInfo[];
  message: string;
}

/**
 * Response from load_tools when loading a category.
 */
interface LoadCategoryResponse {
  action: 'load';
  category: ToolCategory;
  toolsLoaded: string[];
  message: string;
}

type LoadToolsResponse = ListCategoriesResponse | LoadCategoryResponse;

/**
 * Load tools meta-tool.
 * 
 * This tool is always available and allows the agent to:
 * 1. List available tool categories (when called without arguments)
 * 2. Load tools from a specific category
 * 
 * Once tools are loaded, they become available for use in subsequent turns.
 */
export const loadToolsTool: ToolDefinition = {
  name: 'load_tools',
  description:
    'Discover and load tool categories. Call without arguments to list available categories. ' +
    'Call with a category name to load those tools for use. ' +
    'You must load a category before using its tools.',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description:
          'Category to load (e.g., "file_ops", "git", "search", "shell"). ' +
          'Omit to list all available categories.',
        enum: ['file_ops', 'git', 'search', 'shell'],
      },
    },
    required: [],
  },
  metadata: {
    category: 'meta',
    highFrequency: true,
    inputExamples: [
      {}, // List categories
      { category: 'file_ops' },
      { category: 'git' },
    ],
  },
  async handler(input, context): Promise<LoadToolsResponse> {
    const requestedCategory = input.category as ToolCategory | undefined;

    // List categories if no category specified
    if (!requestedCategory) {
      const categories = globalRegistry.getCategories()
        .filter(c => c.name !== 'meta'); // Don't list meta category

      return {
        action: 'list',
        categories,
        message: `Available tool categories:\n${categories.map(c => 
          `- ${c.name}: ${c.description} (${c.toolCount} tools: ${c.tools.join(', ')})`
        ).join('\n')}\n\nUse load_tools({ category: "category_name" }) to load a category.`,
      };
    }

    // Validate category
    if (!globalRegistry.hasCategory(requestedCategory)) {
      throw new Error(
        `Unknown category: "${requestedCategory}". ` +
        `Valid categories: file_ops, git, search, shell`
      );
    }

    // Get tools in this category
    const toolNames = globalRegistry.getToolNamesInCategory(requestedCategory);

    // Add tools to the session's loaded tools set
    if (context.loadedTools) {
      for (const name of toolNames) {
        context.loadedTools.add(name);
      }
    }

    return {
      action: 'load',
      category: requestedCategory,
      toolsLoaded: toolNames,
      message: `Loaded ${requestedCategory} tools: ${toolNames.join(', ')}. These tools are now available for use.`,
    };
  },
};

/**
 * All meta tools.
 */
export const metaTools: ToolDefinition[] = [
  loadToolsTool,
];


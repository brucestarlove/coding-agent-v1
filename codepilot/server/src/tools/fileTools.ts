/**
 * File system tools for reading, writing, and listing files.
 * All operations are sandboxed to the project root directory.
 */

import fs from 'fs/promises';
import type { ToolDefinition } from '../types';
import { resolveSafePath } from './utils';

/**
 * Read a UTF-8 text file from the project workspace.
 */
export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read a UTF-8 text file from the project workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path from project root',
      },
    },
    required: ['path'],
  },
  async handler(input) {
    const filePath = input.path as string;
    const absolutePath = resolveSafePath(filePath);
    const content = await fs.readFile(absolutePath, 'utf8');
    return { path: filePath, content };
  },
};

/**
 * Write a UTF-8 text file (create or overwrite) in the project workspace.
 */
export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description:
    'Write a UTF-8 text file (create or overwrite) in the project workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path from project root',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
    },
    required: ['path', 'content'],
  },
  async handler(input) {
    const filePath = input.path as string;
    const content = input.content as string;
    const absolutePath = resolveSafePath(filePath);

    // Ensure parent directory exists
    const dir = absolutePath.substring(0, absolutePath.lastIndexOf('/'));
    if (dir) {
      await fs.mkdir(dir, { recursive: true });
    }

    await fs.writeFile(absolutePath, content, 'utf8');
    return { path: filePath, status: 'ok' };
  },
};

/**
 * List files and folders in a directory.
 */
export const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description: 'List files and folders in a directory.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path relative to project root',
      },
    },
    required: ['path'],
  },
  async handler(input) {
    const dirPath = (input.path as string) || '.';
    const absolutePath = resolveSafePath(dirPath);
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    return entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
    }));
  },
};

/**
 * Edit interface for search/replace operations.
 */
interface EditBlock {
  old_text: string;
  new_text: string;
}

/**
 * Apply targeted edits to a file using search/replace blocks.
 * More precise than write_file - only changes specific sections.
 */
export const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description:
    'Apply targeted edits to a file using search/replace blocks. ' +
    'Each edit finds exact text and replaces it. ' +
    'Use this instead of write_file when making small changes to existing files.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path from project root',
      },
      edits: {
        type: 'array',
        description: 'Array of search/replace edit blocks to apply in order',
        items: {
          type: 'object',
          properties: {
            old_text: {
              type: 'string',
              description: 'Exact text to find in the file (must match exactly)',
            },
            new_text: {
              type: 'string',
              description: 'Text to replace it with',
            },
          },
          required: ['old_text', 'new_text'],
        },
      },
    },
    required: ['path', 'edits'],
  },
  async handler(input) {
    const filePath = input.path as string;
    const edits = input.edits as EditBlock[];
    const absolutePath = resolveSafePath(filePath);

    // Read original content
    const originalContent = await fs.readFile(absolutePath, 'utf8');
    let newContent = originalContent;

    // Track which edits were applied with replacement counts
    const appliedEdits: Array<{
      old_text: string;
      new_text: string;
      applied: boolean;
      replacements: number;
      warning?: string;
    }> = [];

    // Apply each edit - match against ORIGINAL content, not accumulating newContent
    for (const edit of edits) {
      // Check if pattern exists in ORIGINAL content (not affected by previous edits)
      const existsInOriginal = originalContent.includes(edit.old_text);

      // Count occurrences using split (split produces N+1 parts for N occurrences)
      const occurrenceCount = newContent.split(edit.old_text).length - 1;
      const wasApplied = occurrenceCount > 0;

      if (wasApplied) {
        // Global replace using split/join (Node 14 compatible, avoids replaceAll)
        newContent = newContent.split(edit.old_text).join(edit.new_text);
      }

      // Build warning message if needed
      let warning: string | undefined;
      if (occurrenceCount > 1) {
        warning = `Multiple occurrences (${occurrenceCount}) were replaced`;
      } else if (!existsInOriginal && wasApplied) {
        warning = 'Pattern was created by a previous edit';
      }

      appliedEdits.push({
        old_text: edit.old_text,
        new_text: edit.new_text,
        applied: existsInOriginal, // Report based on original content
        replacements: occurrenceCount,
        warning,
      });
    }

    // Check if any edits failed to find their target in the original content
    const failedEdits = appliedEdits.filter((e) => !e.applied);
    if (failedEdits.length > 0) {
      const failedTexts = failedEdits
        .map((e) => `"${e.old_text.slice(0, 50)}${e.old_text.length > 50 ? '...' : ''}"`)
        .join(', ');
      throw new Error(
        `Failed to find text to replace: ${failedTexts}. ` +
          'Make sure old_text matches exactly (including whitespace).'
      );
    }

    // Write the modified content
    await fs.writeFile(absolutePath, newContent, 'utf8');

    // Calculate total replacements made
    const totalReplacements = appliedEdits.reduce((sum, e) => sum + e.replacements, 0);

    return {
      path: filePath,
      oldContent: originalContent,
      newContent,
      editsApplied: appliedEdits.length,
      totalReplacements,
      editDetails: appliedEdits.map((e) => ({
        applied: e.applied,
        replacements: e.replacements,
        ...(e.warning && { warning: e.warning }),
      })),
      success: true,
    };
  },
};

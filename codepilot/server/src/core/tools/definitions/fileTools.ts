/**
 * File system tools - read, write, edit, and list files.
 * Category: file_ops
 */

import fs from 'fs/promises';
import path from 'path';
import type { ToolDefinition } from '../types';

// Import the path utilities from the old location (will be moved later)
import { resolvePath } from '../../../tools/utils';

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
  metadata: {
    category: 'file_ops',
    highFrequency: true,
    inputExamples: [
      { path: 'package.json' },
      { path: 'src/index.ts' },
    ],
  },
  async handler(input, context) {
    const filePath = input.path as string;
    const absolutePath = resolvePath(filePath, context.workingDir);
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
  metadata: {
    category: 'file_ops',
    highFrequency: true,
  },
  async handler(input, context) {
    const filePath = input.path as string;
    const content = input.content as string;
    const absolutePath = resolvePath(filePath, context.workingDir);

    // Ensure parent directory exists
    const dir = path.dirname(absolutePath);
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
  metadata: {
    category: 'file_ops',
    highFrequency: true,
    inputExamples: [
      { path: '.' },
      { path: 'src' },
    ],
  },
  async handler(input, context) {
    const dirPath = (input.path as string) || '.';
    const absolutePath = resolvePath(dirPath, context.workingDir);
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
  metadata: {
    category: 'file_ops',
    highFrequency: true,
  },
  async handler(input, context) {
    const filePath = input.path as string;
    const edits = input.edits as EditBlock[];
    const absolutePath = resolvePath(filePath, context.workingDir);

    // Read original content
    const originalContent = await fs.readFile(absolutePath, 'utf8');
    let newContent = originalContent;

    // Track which edits were applied
    const appliedEdits: Array<{
      old_text: string;
      new_text: string;
      applied: boolean;
      replacements: number;
      warning?: string;
    }> = [];

    // Apply each edit
    for (const edit of edits) {
      const existsInOriginal = originalContent.includes(edit.old_text);
      const occurrenceCount = newContent.split(edit.old_text).length - 1;
      const wasApplied = occurrenceCount > 0;

      if (wasApplied) {
        newContent = newContent.split(edit.old_text).join(edit.new_text);
      }

      let warning: string | undefined;
      if (occurrenceCount > 1) {
        warning = `Multiple occurrences (${occurrenceCount}) were replaced`;
      } else if (!existsInOriginal && wasApplied) {
        warning = 'Pattern was created by a previous edit';
      }

      appliedEdits.push({
        old_text: edit.old_text,
        new_text: edit.new_text,
        applied: existsInOriginal,
        replacements: occurrenceCount,
        warning,
      });
    }

    // Check for failed edits
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

    // Write modified content
    await fs.writeFile(absolutePath, newContent, 'utf8');

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

/**
 * All file operation tools.
 */
export const fileTools: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  listDirTool,
  editFileTool,
];


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

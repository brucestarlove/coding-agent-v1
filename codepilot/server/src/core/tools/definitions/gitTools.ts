/**
 * Git tools - version control operations.
 * Category: git
 */

import { execFile } from 'child_process';
import util from 'util';
import type { ToolDefinition } from '../types';
import { resolvePath, toRelativePath } from '../../../tools/utils';

const execFileAsync = util.promisify(execFile);

/**
 * Show git diff for a file or the entire working directory.
 */
export const gitDiffTool: ToolDefinition = {
  name: 'git_diff',
  description:
    'Show git diff (uncommitted changes) for a file or directory. ' +
    'Use this when asked to "show diff", "what changed", or "show changes". ' +
    'Can compare against HEAD (default) or a specific commit/branch.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File or directory path to diff (optional, defaults to entire repo)',
      },
      ref: {
        type: 'string',
        description: 'Git ref to compare against (e.g., "HEAD~1", "main", a commit SHA)',
      },
      staged: {
        type: 'boolean',
        description: 'If true, show only staged changes (--cached). Default false.',
      },
    },
    required: [],
  },
  metadata: {
    category: 'git',
    inputExamples: [
      {},
      { path: 'src/index.ts' },
      { ref: 'HEAD~1' },
    ],
  },
  async handler(input, context) {
    const filePath = input.path as string | undefined;
    const ref = input.ref as string | undefined;
    const staged = input.staged as boolean | undefined;
    const workingDir = context.workingDir;

    const args: string[] = ['diff'];

    if (staged) {
      args.push('--cached');
    }

    if (ref) {
      args.push(ref);
    }

    if (filePath) {
      const absolutePath = resolvePath(filePath, workingDir);
      const relativePath = toRelativePath(absolutePath, workingDir);
      args.push('--', relativePath);
    }

    const command = `git ${args.join(' ')}`;

    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd: workingDir,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 5,
      });

      return {
        command,
        cwd: workingDir,
        diff: stdout,
        stderr: stderr || undefined,
        hasChanges: stdout.trim().length > 0,
      };
    } catch (error: unknown) {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number;
        message?: string;
      };

      if (execError.stdout !== undefined) {
        return {
          command,
          cwd: workingDir,
          diff: execError.stdout,
          stderr: execError.stderr || undefined,
          hasChanges: (execError.stdout || '').trim().length > 0,
        };
      }

      throw new Error(`Git diff failed: ${execError.message || 'Unknown error'}`);
    }
  },
};

/**
 * Show git status - which files are modified, staged, untracked.
 */
export const gitStatusTool: ToolDefinition = {
  name: 'git_status',
  description:
    'Show git status - modified, staged, and untracked files. ' +
    'Use this when asked "what files changed", "git status", or to see working directory state.',
  inputSchema: {
    type: 'object',
    properties: {
      short: {
        type: 'boolean',
        description: 'If true, use short format output. Default false for detailed output.',
      },
    },
    required: [],
  },
  metadata: {
    category: 'git',
  },
  async handler(input, context) {
    const short = input.short as boolean | undefined;
    const workingDir = context.workingDir;

    const args = ['status'];
    if (short) {
      args.push('--short');
    }

    const command = `git ${args.join(' ')}`;

    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd: workingDir,
        timeout: 10000,
      });

      return {
        command,
        cwd: workingDir,
        status: stdout,
        stderr: stderr || undefined,
      };
    } catch (error: unknown) {
      const execError = error as { message?: string };
      throw new Error(`Git status failed: ${execError.message || 'Unknown error'}`);
    }
  },
};

/**
 * Show git log - recent commit history.
 */
export const gitLogTool: ToolDefinition = {
  name: 'git_log',
  description:
    'Show git commit history. Use this when asked about "recent commits", "git log", or "commit history".',
  inputSchema: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Number of commits to show (default 10)',
      },
      path: {
        type: 'string',
        description: 'Show commits affecting this file/directory only',
      },
      oneline: {
        type: 'boolean',
        description: 'Use condensed one-line format (default true)',
      },
    },
    required: [],
  },
  metadata: {
    category: 'git',
  },
  async handler(input, context) {
    const count = (input.count as number) || 10;
    const filePath = input.path as string | undefined;
    const oneline = input.oneline !== false;
    const workingDir = context.workingDir;

    const args = ['log', `-${count}`];
    if (oneline) {
      args.push('--oneline');
    }

    if (filePath) {
      const absolutePath = resolvePath(filePath, workingDir);
      const relativePath = toRelativePath(absolutePath, workingDir);
      args.push('--', relativePath);
    }

    const command = `git ${args.join(' ')}`;

    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd: workingDir,
        timeout: 10000,
      });

      return {
        command,
        cwd: workingDir,
        log: stdout,
        stderr: stderr || undefined,
      };
    } catch (error: unknown) {
      const execError = error as { message?: string };
      throw new Error(`Git log failed: ${execError.message || 'Unknown error'}`);
    }
  },
};

/**
 * All git tools.
 */
export const gitTools: ToolDefinition[] = [
  gitDiffTool,
  gitStatusTool,
  gitLogTool,
];


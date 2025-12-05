/**
 * Shell command execution tool with safety constraints.
 * Commands are sandboxed to the project root and dangerous patterns are blocked.
 */

import { exec } from 'child_process';
import util from 'util';
import type { ToolDefinition } from '../types';
import { resolveSafePath } from './utils';

const execAsync = util.promisify(exec);

/**
 * Blocked command patterns that are considered dangerous.
 * These patterns are checked before execution to prevent destructive operations.
 */
const BLOCKED_PATTERNS: RegExp[] = [
  // Remove root or common system directories
  /rm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*r[a-zA-Z]*\s+(-[a-zA-Z]*\s+)*\/(?!\S)/,
  /rm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*r[a-zA-Z]*\s+(-[a-zA-Z]*\s+)*~\//,
  /rm\s+-rf\s+\//,
  /rm\s+-fr\s+\//,

  // Fork bombs
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/,

  // Direct disk device writes
  />\s*\/dev\/sd[a-z]/,
  /dd\s+.*of=\/dev\/sd[a-z]/,

  // Filesystem formatting
  /mkfs\./,
  /mkswap\s+\/dev/,

  // Overwrite boot sector
  /dd\s+.*of=\/dev\/[sh]d[a-z]/,

  // Chmod dangerous patterns (making everything executable/writable)
  /chmod\s+(-[a-zA-Z]*\s+)*777\s+(-[a-zA-Z]*\s+)*\//,
  /chmod\s+(-[a-zA-Z]*\s+)*-R\s+(-[a-zA-Z]*\s+)*777/,

  // Dangerous curl/wget piped to shell
  /curl\s+.*\|\s*(ba)?sh/,
  /wget\s+.*\|\s*(ba)?sh/,

  // Kill all processes
  /kill\s+-9\s+-1/,
  /killall\s+-9/,

  // Shutdown/reboot
  /shutdown/,
  /reboot/,
  /init\s+[06]/,
];

/**
 * Check if a command matches any blocked pattern.
 * @param command - The command to check
 * @returns The matched pattern description if blocked, null otherwise
 */
function isBlockedCommand(command: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return `Command matches blocked pattern: ${pattern.toString()}`;
    }
  }
  return null;
}

/**
 * Run a shell command in the project workspace.
 */
export const runShellTool: ToolDefinition = {
  name: 'run_shell',
  description:
    'Run a shell command in the project workspace. Dangerous commands are blocked for safety.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory relative to project root (optional)',
      },
    },
    required: ['command'],
  },
  async handler(input) {
    const command = input.command as string;
    const cwdRelative = (input.cwd as string) || '.';

    // Safety check: block dangerous commands
    const blockedReason = isBlockedCommand(command);
    if (blockedReason) {
      throw new Error(`Dangerous command blocked: ${blockedReason}`);
    }

    // Resolve working directory within sandbox
    const cwdAbsolute = resolveSafePath(cwdRelative);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwdAbsolute,
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024, // 1MB max output
      });

      return {
        command,
        cwd: cwdRelative,
        stdout,
        stderr,
        exitCode: 0,
      };
    } catch (error: unknown) {
      // exec throws on non-zero exit codes, but we still want to return the output
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number;
        message?: string;
      };

      return {
        command,
        cwd: cwdRelative,
        stdout: execError.stdout || '',
        stderr: execError.stderr || execError.message || 'Command failed',
        exitCode: execError.code || 1,
      };
    }
  },
};

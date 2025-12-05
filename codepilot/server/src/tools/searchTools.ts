/**
 * Search tools for finding files and text patterns.
 * Uses ripgrep when available for speed, falls back to pure Node.js.
 */

import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';
import type { ToolDefinition, ToolContext } from '../types';
import { resolvePath, toRelativePath } from './utils';

const execAsync = util.promisify(exec);

// ============================================================================
// Ripgrep Detection
// ============================================================================

let ripgrepAvailable: boolean | null = null;

/**
 * Check if ripgrep (rg) is installed and available.
 * Caches the result for subsequent calls.
 */
async function isRipgrepAvailable(): Promise<boolean> {
  if (ripgrepAvailable !== null) {
    return ripgrepAvailable;
  }

  try {
    await execAsync('rg --version');
    ripgrepAvailable = true;
  } catch {
    ripgrepAvailable = false;
  }

  return ripgrepAvailable;
}

// ============================================================================
// Default Ignore Patterns (used when no .gitignore)
// ============================================================================

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.pnpm-store',
  '.pnpm_store',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.cache',
  '*.min.js',
  '*.map',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
];

// ============================================================================
// Grep Tool - Search file contents
// ============================================================================

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

/**
 * Search for text patterns using ripgrep.
 */
async function grepWithRipgrep(
  pattern: string,
  searchPath: string,
  options: { regex?: boolean; caseSensitive?: boolean; maxResults?: number }
): Promise<GrepMatch[]> {
  const { regex = false, caseSensitive = false, maxResults = 50 } = options;

  // Build rg command with JSON output
  const args: string[] = ['--json', '--max-count', String(maxResults)];

  if (!caseSensitive) {
    args.push('--ignore-case');
  }

  if (!regex) {
    args.push('--fixed-strings');
  }

  // Escape pattern for shell (wrap in single quotes, escape existing quotes)
  const escapedPattern = pattern.replace(/'/g, "'\\''");
  args.push(`'${escapedPattern}'`);
  args.push(`'${searchPath}'`);

  const command = `rg ${args.join(' ')}`;

  try {
    const { stdout } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large results
      timeout: 30000,
    });

    // Parse JSON lines output from ripgrep
    const matches: GrepMatch[] = [];
    const lines = stdout.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'match' && parsed.data) {
          const filePath = parsed.data.path?.text;
          const lineNumber = parsed.data.line_number;
          const content = parsed.data.lines?.text?.trimEnd();

          if (filePath && lineNumber && content !== undefined) {
            matches.push({
              file: toRelativePath(filePath, searchPath),
              line: lineNumber,
              content,
            });
          }
        }
      } catch {
        // Skip malformed JSON lines
      }

      // Respect maxResults limit
      if (matches.length >= maxResults) {
        break;
      }
    }

    return matches;
  } catch (error: unknown) {
    // rg exits with code 1 when no matches found - that's not an error
    const execError = error as { code?: number; stdout?: string };
    if (execError.code === 1 && !execError.stdout) {
      return [];
    }
    throw error;
  }
}

/**
 * Search for text patterns using pure Node.js (fallback).
 */
async function grepWithNode(
  pattern: string,
  searchPath: string,
  options: { regex?: boolean; caseSensitive?: boolean; maxResults?: number }
): Promise<GrepMatch[]> {
  const { regex = false, caseSensitive = false, maxResults = 50 } = options;

  // Build regex from pattern
  const flags = caseSensitive ? 'g' : 'gi';
  const searchRegex = regex ? new RegExp(pattern, flags) : new RegExp(escapeRegex(pattern), flags);

  const matches: GrepMatch[] = [];

  // Recursively find and search files
  async function searchDir(dirPath: string): Promise<void> {
    if (matches.length >= maxResults) return;

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (matches.length >= maxResults) break;

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = toRelativePath(fullPath, searchPath);

      // Skip ignored patterns
      if (shouldIgnore(entry.name, relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await searchDir(fullPath);
      } else if (entry.isFile()) {
        await searchFile(fullPath, relativePath);
      }
    }
  }

  async function searchFile(filePath: string, relativePath: string): Promise<void> {
    try {
      // Skip binary files by checking extension
      if (isBinaryExtension(filePath)) return;

      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
        if (searchRegex.test(lines[i])) {
          matches.push({
            file: relativePath,
            line: i + 1,
            content: lines[i],
          });
        }
        // Reset regex lastIndex for global flag
        searchRegex.lastIndex = 0;
      }
    } catch {
      // Skip files that can't be read (binary, permissions, etc.)
    }
  }

  await searchDir(searchPath);
  return matches;
}

/**
 * Check if a path should be ignored based on default patterns.
 */
function shouldIgnore(name: string, relativePath: string): boolean {
  for (const pattern of DEFAULT_IGNORE_PATTERNS) {
    if (pattern.startsWith('*')) {
      // Glob pattern - check extension
      const ext = pattern.slice(1);
      if (name.endsWith(ext)) return true;
    } else {
      // Directory/file name match
      if (name === pattern || relativePath.includes(`/${pattern}/`) || relativePath.startsWith(`${pattern}/`)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if file has a binary extension.
 */
function isBinaryExtension(filePath: string): boolean {
  const binaryExts = [
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
    '.woff', '.woff2', '.ttf', '.eot',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.zip', '.tar', '.gz', '.rar',
    '.mp3', '.mp4', '.wav', '.avi', '.mov',
    '.exe', '.dll', '.so', '.dylib',
    '.db', '.sqlite', '.sqlite3',
  ];
  const ext = path.extname(filePath).toLowerCase();
  return binaryExts.includes(ext);
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Grep tool - Search for text patterns across files.
 */
export const grepTool: ToolDefinition = {
  name: 'grep',
  description:
    'Search for text patterns across files. Returns matching lines with file paths and line numbers. ' +
    'Respects .gitignore and skips common non-code directories.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Text or regex pattern to search for',
      },
      path: {
        type: 'string',
        description: 'Directory or file to search (default: project root)',
      },
      regex: {
        type: 'boolean',
        description: 'Treat pattern as regex (default: false, uses literal text matching)',
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Case sensitive search (default: false)',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum matches to return (default: 50)',
      },
    },
    required: ['pattern'],
  },
  async handler(input, context: ToolContext) {
    const pattern = input.pattern as string;
    const searchPath = resolvePath((input.path as string) || '.', context.workingDir);
    const options = {
      regex: input.regex as boolean | undefined,
      caseSensitive: input.caseSensitive as boolean | undefined,
      maxResults: (input.maxResults as number) || 50,
    };

    // Use ripgrep if available, otherwise fall back to Node.js
    const useRipgrep = await isRipgrepAvailable();
    const matches = useRipgrep
      ? await grepWithRipgrep(pattern, searchPath, options)
      : await grepWithNode(pattern, searchPath, options);

    return {
      pattern,
      searchPath: toRelativePath(searchPath, context.workingDir),
      matchCount: matches.length,
      matches,
      engine: useRipgrep ? 'ripgrep' : 'node',
      truncated: matches.length >= options.maxResults,
    };
  },
};

// ============================================================================
// Find Files Tool - Search by filename
// ============================================================================

interface FileMatch {
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

/**
 * Find files using ripgrep's --files mode with glob pattern.
 */
async function findFilesWithRipgrep(
  pattern: string,
  searchPath: string,
  maxResults: number
): Promise<FileMatch[]> {
  // Use rg --files with --glob for pattern matching
  // Note: rg glob uses ** for recursive matching
  const globPattern = pattern.includes('*') ? pattern : `*${pattern}*`;

  const command = `rg --files --glob '${globPattern}' '${searchPath}' | head -n ${maxResults}`;

  try {
    const { stdout } = await execAsync(command, {
      maxBuffer: 5 * 1024 * 1024,
      timeout: 30000,
    });

    const files = stdout.trim().split('\n').filter(Boolean);
    const matches: FileMatch[] = [];

    for (const filePath of files) {
      if (matches.length >= maxResults) break;

      try {
        const stat = await fs.stat(filePath);
        matches.push({
          path: toRelativePath(filePath, searchPath),
          type: stat.isDirectory() ? 'dir' : 'file',
          size: stat.isFile() ? stat.size : undefined,
        });
      } catch {
        // File may have been deleted between listing and stat
        matches.push({
          path: toRelativePath(filePath, searchPath),
          type: 'file',
        });
      }
    }

    return matches;
  } catch (error: unknown) {
    const execError = error as { code?: number };
    // rg exits with code 1 when no matches - not an error
    if (execError.code === 1) {
      return [];
    }
    throw error;
  }
}

/**
 * Find files using pure Node.js (fallback).
 */
async function findFilesWithNode(
  pattern: string,
  searchPath: string,
  maxResults: number
): Promise<FileMatch[]> {
  const matches: FileMatch[] = [];

  // Convert glob pattern to regex
  // Simple conversion: * -> .*, ? -> ., ** -> .*
  const regexPattern = pattern
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/<<<GLOBSTAR>>>/g, '.*');
  const regex = new RegExp(regexPattern, 'i');

  async function searchDir(dirPath: string): Promise<void> {
    if (matches.length >= maxResults) return;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (matches.length >= maxResults) break;

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = toRelativePath(fullPath, searchPath);

        // Skip ignored directories
        if (entry.isDirectory() && shouldIgnore(entry.name, relativePath)) {
          continue;
        }

        // Test if path matches pattern
        if (regex.test(entry.name) || regex.test(relativePath)) {
          try {
            const stat = await fs.stat(fullPath);
            matches.push({
              path: relativePath,
              type: entry.isDirectory() ? 'dir' : 'file',
              size: stat.isFile() ? stat.size : undefined,
            });
          } catch {
            matches.push({
              path: relativePath,
              type: entry.isDirectory() ? 'dir' : 'file',
            });
          }
        }

        // Recurse into directories
        if (entry.isDirectory() && !shouldIgnore(entry.name, relativePath)) {
          await searchDir(fullPath);
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  await searchDir(searchPath);
  return matches;
}

/**
 * Find files tool - Search for files by name pattern (glob).
 */
export const findFilesTool: ToolDefinition = {
  name: 'find_files',
  description:
    'Find files by name pattern (glob). Supports wildcards like *.ts, **/*.test.js. ' +
    'Respects .gitignore and skips node_modules, .git, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern (e.g., "*.ts", "**/*.test.js", "src/**/*.tsx")',
      },
      path: {
        type: 'string',
        description: 'Directory to search (default: project root)',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum files to return (default: 100)',
      },
    },
    required: ['pattern'],
  },
  async handler(input, context: ToolContext) {
    const pattern = input.pattern as string;
    const searchPath = resolvePath((input.path as string) || '.', context.workingDir);
    const maxResults = (input.maxResults as number) || 100;

    // Use ripgrep if available, otherwise fall back to Node.js
    const useRipgrep = await isRipgrepAvailable();
    const matches = useRipgrep
      ? await findFilesWithRipgrep(pattern, searchPath, maxResults)
      : await findFilesWithNode(pattern, searchPath, maxResults);

    return {
      pattern,
      searchPath: toRelativePath(searchPath, context.workingDir),
      fileCount: matches.length,
      files: matches,
      engine: useRipgrep ? 'ripgrep' : 'node',
      truncated: matches.length >= maxResults,
    };
  },
};


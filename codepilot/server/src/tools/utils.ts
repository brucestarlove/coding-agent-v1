/**
 * Utility functions for tool safety and sandboxing.
 */

import path from 'path';

/**
 * Get the project root directory from environment or one level up from cwd.
 * When running from /codepilot/server, this returns /codepilot.
 * This is the sandbox boundary for all file operations.
 */
export function getProjectRoot(): string {
  return process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');
}

/**
 * Resolves a relative path to an absolute path within the project root sandbox.
 * Throws an error if the resolved path would escape the sandbox (path traversal attack).
 *
 * @param relativePath - Path relative to project root
 * @returns Absolute path within the sandbox
 * @throws Error if path escapes the project root
 */
export function resolveSafePath(relativePath: string): string {
  const projectRoot = getProjectRoot();

  // Normalize the project root to ensure consistent comparison
  const normalizedRoot = path.resolve(projectRoot);

  // Resolve the full path
  const absolutePath = path.resolve(normalizedRoot, relativePath);

  // Security check: ensure the resolved path is within the project root
  // We add a trailing separator to prevent matching partial directory names
  // e.g., /project-root-backup should not match /project-root
  if (
    !absolutePath.startsWith(normalizedRoot + path.sep) &&
    absolutePath !== normalizedRoot
  ) {
    throw new Error(
      `Path outside project root is not allowed: ${relativePath}`
    );
  }

  return absolutePath;
}

/**
 * Utility functions for tool safety and path resolution.
 */

import path from 'path';

/**
 * Get the default working directory from environment or one level up from cwd.
 * When running from /codepilot/server, this returns /codepilot.
 * Used as fallback when no workingDir is specified.
 */
export function getDefaultWorkingDir(): string {
  return process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');
}

/**
 * Legacy alias for getDefaultWorkingDir - kept for backwards compatibility.
 * @deprecated Use getDefaultWorkingDir() instead
 */
export function getProjectRoot(): string {
  return getDefaultWorkingDir();
}

/**
 * Resolves a path relative to the given working directory.
 * If the path is already absolute, validates it exists under the working directory.
 *
 * @param relativePath - Path relative to working directory (or absolute path)
 * @param workingDir - The working directory to resolve from
 * @returns Absolute path
 */
export function resolvePath(relativePath: string, workingDir: string): string {
  // Normalize the working directory
  const normalizedWorkingDir = path.resolve(workingDir);

  // Resolve the path (handles both relative and absolute)
  const absolutePath = path.resolve(normalizedWorkingDir, relativePath);

  return absolutePath;
}

/**
 * Computes the relative path from workingDir to absolutePath.
 * Returns '.' if they're the same.
 *
 * @param absolutePath - The absolute path to convert
 * @param workingDir - The working directory to be relative to
 * @returns Relative path string
 */
export function toRelativePath(absolutePath: string, workingDir: string): string {
  const relative = path.relative(workingDir, absolutePath);
  return relative || '.';
}

/**
 * Legacy sandbox resolver - resolves path within default project root.
 * @deprecated Use resolvePath(path, workingDir) instead
 */
export function resolveSafePath(relativePath: string): string {
  return resolvePath(relativePath, getDefaultWorkingDir());
}

/**
 * Plans File Operations
 * Saves plans as markdown files for cross-session reference.
 * Plans are stored in .codepilot/plans/ directory within the working directory.
 */

import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

/**
 * Metadata stored in plan file frontmatter
 */
export interface PlanMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sessionId: string | null;
  /** Type of plan: 'implementation', 'research', 'custom' */
  type: 'implementation' | 'research' | 'custom';
  /** Tags for organization */
  tags: string[];
}

/**
 * Full plan with content
 */
export interface Plan extends PlanMetadata {
  content: string;
  /** File path relative to plans directory */
  filePath: string;
}

/**
 * Plan summary for listing (without full content)
 */
export interface PlanSummary extends PlanMetadata {
  filePath: string;
  /** First 200 chars of content as preview */
  preview: string;
}

// ============================================================================
// Directory Management
// ============================================================================

const PLANS_DIR_NAME = '.codepilot/plans';

/**
 * Get the plans directory path for a working directory
 */
export function getPlansDir(workingDir: string): string {
  return path.join(workingDir, PLANS_DIR_NAME);
}

/**
 * Ensure the plans directory exists
 */
export async function ensurePlansDir(workingDir: string): Promise<string> {
  const plansDir = getPlansDir(workingDir);
  await fs.mkdir(plansDir, { recursive: true });
  return plansDir;
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Generate a unique plan ID
 */
function generatePlanId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `plan_${timestamp}_${random}`;
}

/**
 * Generate a filename from title
 */
function titleToFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'untitled';
}

/**
 * Parse frontmatter from plan file content
 */
function parseFrontmatter(content: string): { metadata: Partial<PlanMetadata>; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    return { metadata: {}, body: content };
  }

  const [, frontmatter, body] = frontmatterMatch;
  const metadata: Partial<PlanMetadata> = {};

  // Parse YAML-like frontmatter (simple key: value pairs)
  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      if (key === 'tags') {
        // Parse tags as comma-separated list
        metadata.tags = value.split(',').map(t => t.trim()).filter(Boolean);
      } else {
        (metadata as Record<string, string>)[key] = value.replace(/^["']|["']$/g, '');
      }
    }
  }

  return { metadata, body: body.trim() };
}

/**
 * Generate frontmatter string from metadata
 */
function generateFrontmatter(metadata: PlanMetadata): string {
  const lines = [
    '---',
    `id: ${metadata.id}`,
    `title: "${metadata.title.replace(/"/g, '\\"')}"`,
    `type: ${metadata.type}`,
    `createdAt: ${metadata.createdAt}`,
    `updatedAt: ${metadata.updatedAt}`,
    `sessionId: ${metadata.sessionId || 'null'}`,
    `tags: ${metadata.tags.join(', ')}`,
    '---',
  ];
  return lines.join('\n');
}

/**
 * Save a plan to file
 */
export async function savePlan(
  workingDir: string,
  title: string,
  content: string,
  options: {
    type?: PlanMetadata['type'];
    sessionId?: string | null;
    tags?: string[];
    existingId?: string;
  } = {}
): Promise<Plan> {
  const plansDir = await ensurePlansDir(workingDir);
  
  const now = new Date().toISOString();
  const id = options.existingId || generatePlanId();
  const filename = `${titleToFilename(title)}.md`;
  const filePath = path.join(plansDir, filename);

  // Check if file exists to preserve createdAt
  let createdAt = now;
  try {
    const existingContent = await fs.readFile(filePath, 'utf-8');
    const { metadata } = parseFrontmatter(existingContent);
    if (metadata.createdAt) {
      createdAt = metadata.createdAt;
    }
  } catch {
    // File doesn't exist, use current time
  }

  const metadata: PlanMetadata = {
    id,
    title,
    type: options.type || 'implementation',
    createdAt,
    updatedAt: now,
    sessionId: options.sessionId ?? null,
    tags: options.tags || [],
  };

  const fileContent = `${generateFrontmatter(metadata)}\n\n${content}`;
  await fs.writeFile(filePath, fileContent, 'utf-8');

  return {
    ...metadata,
    content,
    filePath: filename,
  };
}

/**
 * Load a plan from file
 */
export async function loadPlan(workingDir: string, filename: string): Promise<Plan | null> {
  const plansDir = getPlansDir(workingDir);
  const filePath = path.join(plansDir, filename);

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { metadata, body } = parseFrontmatter(fileContent);

    return {
      id: metadata.id || filename,
      title: metadata.title || filename.replace(/\.md$/, ''),
      type: (metadata.type as PlanMetadata['type']) || 'implementation',
      createdAt: metadata.createdAt || new Date().toISOString(),
      updatedAt: metadata.updatedAt || new Date().toISOString(),
      sessionId: metadata.sessionId || null,
      tags: metadata.tags || [],
      content: body,
      filePath: filename,
    };
  } catch {
    return null;
  }
}

/**
 * List all plans in a working directory
 */
export async function listPlans(workingDir: string): Promise<PlanSummary[]> {
  const plansDir = getPlansDir(workingDir);

  try {
    const files = await fs.readdir(plansDir);
    const plans: PlanSummary[] = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const plan = await loadPlan(workingDir, file);
      if (plan) {
        plans.push({
          id: plan.id,
          title: plan.title,
          type: plan.type,
          createdAt: plan.createdAt,
          updatedAt: plan.updatedAt,
          sessionId: plan.sessionId,
          tags: plan.tags,
          filePath: plan.filePath,
          preview: plan.content.slice(0, 200) + (plan.content.length > 200 ? '...' : ''),
        });
      }
    }

    // Sort by updatedAt descending
    return plans.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    // Directory doesn't exist yet
    return [];
  }
}

/**
 * Delete a plan file
 */
export async function deletePlan(workingDir: string, filename: string): Promise<boolean> {
  const plansDir = getPlansDir(workingDir);
  const filePath = path.join(plansDir, filename);

  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract title from plan content
 * Looks for first H1 or H2 heading, or first line
 */
export function extractTitleFromContent(content: string): string {
  // Try to find a heading
  const headingMatch = content.match(/^#+ (.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  // Use first non-empty line
  const firstLine = content.split('\n').find(line => line.trim());
  if (firstLine) {
    return firstLine.slice(0, 60).trim();
  }

  return 'Untitled Plan';
}

/**
 * Detect plan type from content
 */
export function detectPlanType(content: string): PlanMetadata['type'] {
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('research') || lowerContent.includes('findings') || lowerContent.includes('analysis')) {
    return 'research';
  }
  
  if (lowerContent.includes('implementation') || lowerContent.includes('steps') || lowerContent.includes('## files')) {
    return 'implementation';
  }
  
  return 'custom';
}


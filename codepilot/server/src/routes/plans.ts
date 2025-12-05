/**
 * Plans Routes
 * API endpoints for managing plan files
 */

import { Elysia, t } from 'elysia';
import {
  savePlan,
  loadPlan,
  listPlans,
  deletePlan,
  extractTitleFromContent,
  detectPlanType,
} from '../plans';

// Default working directory (will be overridden by client)
const getDefaultWorkingDir = () => 
  process.env.PROJECT_ROOT || process.cwd();

/**
 * Plans route plugin
 * GET /api/plans - List all plans
 * GET /api/plans/:filename - Get a specific plan
 * POST /api/plans - Create a new plan
 * PUT /api/plans/:filename - Update a plan
 * DELETE /api/plans/:filename - Delete a plan
 */
export const plansRoutes = new Elysia({ prefix: '/api/plans' })
  /**
   * List all plans
   * Query params: workingDir (optional)
   */
  .get(
    '/',
    async ({ query }) => {
      const workingDir = query.workingDir || getDefaultWorkingDir();
      const plans = await listPlans(workingDir);
      
      return {
        plans,
        count: plans.length,
        workingDir,
      };
    },
    {
      query: t.Object({
        workingDir: t.Optional(t.String()),
      }),
    }
  )

  /**
   * Get a specific plan by filename
   */
  .get(
    '/:filename',
    async ({ params, query, set }) => {
      const workingDir = query.workingDir || getDefaultWorkingDir();
      const plan = await loadPlan(workingDir, params.filename);
      
      if (!plan) {
        set.status = 404;
        return { error: `Plan not found: ${params.filename}` };
      }

      return plan;
    },
    {
      params: t.Object({
        filename: t.String(),
      }),
      query: t.Object({
        workingDir: t.Optional(t.String()),
      }),
    }
  )

  /**
   * Create a new plan
   */
  .post(
    '/',
    async ({ body }) => {
      const { content, workingDir, title, type, sessionId, tags } = body;
      const resolvedWorkingDir = workingDir || getDefaultWorkingDir();

      // Auto-detect title and type if not provided
      const resolvedTitle = title || extractTitleFromContent(content);
      const resolvedType = type || detectPlanType(content);

      const plan = await savePlan(resolvedWorkingDir, resolvedTitle, content, {
        type: resolvedType,
        sessionId,
        tags: tags || [],
      });

      return {
        success: true,
        plan,
      };
    },
    {
      body: t.Object({
        content: t.String({ minLength: 1 }),
        workingDir: t.Optional(t.String()),
        title: t.Optional(t.String()),
        type: t.Optional(t.Union([
          t.Literal('implementation'),
          t.Literal('research'),
          t.Literal('custom'),
        ])),
        sessionId: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
      }),
    }
  )

  /**
   * Update an existing plan
   */
  .put(
    '/:filename',
    async ({ params, body, set }) => {
      const { content, workingDir, title } = body;
      const resolvedWorkingDir = workingDir || getDefaultWorkingDir();

      // Load existing plan to preserve metadata
      const existing = await loadPlan(resolvedWorkingDir, params.filename);
      if (!existing) {
        set.status = 404;
        return { error: `Plan not found: ${params.filename}` };
      }

      const plan = await savePlan(
        resolvedWorkingDir,
        title || existing.title,
        content,
        {
          type: existing.type,
          sessionId: existing.sessionId,
          tags: existing.tags,
          existingId: existing.id,
        }
      );

      return {
        success: true,
        plan,
      };
    },
    {
      params: t.Object({
        filename: t.String(),
      }),
      body: t.Object({
        content: t.String({ minLength: 1 }),
        workingDir: t.Optional(t.String()),
        title: t.Optional(t.String()),
      }),
    }
  )

  /**
   * Delete a plan
   */
  .delete(
    '/:filename',
    async ({ params, query, set }) => {
      const workingDir = query.workingDir || getDefaultWorkingDir();
      const deleted = await deletePlan(workingDir, params.filename);

      if (!deleted) {
        set.status = 404;
        return { error: `Plan not found or could not be deleted: ${params.filename}` };
      }

      return { success: true };
    },
    {
      params: t.Object({
        filename: t.String(),
      }),
      query: t.Object({
        workingDir: t.Optional(t.String()),
      }),
    }
  );


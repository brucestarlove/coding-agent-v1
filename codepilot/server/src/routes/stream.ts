/**
 * Stream Routes
 * Handles SSE streaming, session info, and session listing
 */

import { Elysia, t, sse } from 'elysia';
import { getSession, deleteSession, getSessionInfo, listSessions, getMessages } from '../session';

/**
 * Stream route plugin
 * GET /api/stream/:id - SSE stream of agent events
 * POST /api/stop/:id - Abort a running agent
 * GET /api/session/:id - Get session info
 * GET /api/session/:id/messages - Get session message history
 * DELETE /api/session/:id - Delete a session
 * GET /api/sessions - List all sessions
 */
export const streamRoutes = new Elysia({ prefix: '/api' })
  /**
   * SSE stream endpoint
   * Streams events from the agent loop to the client
   */
  .get(
    '/stream/:id',
    async function* ({ params }) {
      const session = getSession(params.id);

      if (!session) {
        // Yield an error event and close
        yield sse({
          event: 'error',
          data: { error: `Session not found: ${params.id}` },
        });
        return;
      }

      // Stream events from the session's event queue
      for await (const event of session.eventQueue) {
        yield sse({
          event: event.type,
          data: event,
        });

        // Stop streaming after done event
        if (event.type === 'done') {
          break;
        }
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  /**
   * Stop/abort a running agent
   */
  .post(
    '/stop/:id',
    ({ params }) => {
      const session = getSession(params.id);

      if (!session) {
        return { success: false, error: `Session not found: ${params.id}` };
      }

      if (session.status !== 'running') {
        return { success: false, error: `Session is not running: ${session.status}` };
      }

      // Abort the agent
      session.abortController.abort();

      return { success: true };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  /**
   * Get session info
   * Returns accurate messageCount and totalTokens from database
   */
  .get(
    '/session/:id',
    ({ params }) => {
      const sessionInfo = getSessionInfo(params.id);

      if (!sessionInfo) {
        return { success: false, error: `Session not found: ${params.id}` };
      }

      return {
        id: sessionInfo.id,
        status: sessionInfo.status,
        workingDir: sessionInfo.workingDir,
        createdAt: sessionInfo.createdAt,
        messageCount: sessionInfo.messageCount,
        totalTokens: sessionInfo.totalTokens,
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  /**
   * Get session message history
   * Returns full conversation from database
   */
  .get(
    '/session/:id/messages',
    ({ params, set }) => {
      const sessionInfo = getSessionInfo(params.id);

      if (!sessionInfo) {
        set.status = 404;
        return { error: `Session not found: ${params.id}` };
      }

      const messages = getMessages(params.id);

      return {
        sessionId: params.id,
        messages,
        count: messages.length,
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  /**
   * Delete a session
   */
  .delete(
    '/session/:id',
    ({ params }) => {
      const deleted = deleteSession(params.id);

      if (!deleted) {
        return { success: false, error: `Session not found: ${params.id}` };
      }

      return { success: true };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  /**
   * List all sessions with summaries
   * Supports pagination via query params
   */
  .get(
    '/sessions',
    ({ query }) => {
      const limit = query.limit ? parseInt(query.limit, 10) : 20;
      const offset = query.offset ? parseInt(query.offset, 10) : 0;

      // Clamp limit to reasonable bounds
      const clampedLimit = Math.min(Math.max(1, limit), 100);
      const clampedOffset = Math.max(0, offset);

      const { sessions, total } = listSessions(clampedLimit, clampedOffset);

      return {
        sessions,
        total,
        limit: clampedLimit,
        offset: clampedOffset,
        hasMore: clampedOffset + sessions.length < total,
      };
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    }
  );

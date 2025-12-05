/**
 * Stream Routes
 * Handles SSE streaming and session interruption
 */

import { Elysia, t, sse } from 'elysia';
import { getSession, deleteSession } from '../session';

/**
 * Stream route plugin
 * GET /api/stream/:id - SSE stream of agent events
 * POST /api/stop/:id - Abort a running agent
 * GET /api/session/:id - Get session info
 * DELETE /api/session/:id - Delete a session
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
   */
  .get(
    '/session/:id',
    ({ params }) => {
      const session = getSession(params.id);

      if (!session) {
        return { success: false, error: `Session not found: ${params.id}` };
      }

      // Return session info (excluding internal fields like abortController)
      return {
        id: session.id,
        status: session.status,
        workingDir: session.workingDir,
        createdAt: session.createdAt.toISOString(),
        messageCount: session.messages.length,
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
  );

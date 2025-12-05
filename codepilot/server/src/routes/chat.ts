/**
 * Chat Routes
 * Handles starting new conversations and managing sessions
 */

import { Elysia, t } from 'elysia';
import { createSession, updateSessionStatus } from '../session';
import { runAgentLoop } from '../agent/index';
import { tools } from '../tools/index';

/**
 * Chat route plugin
 * POST /api/chat - Start a new conversation
 * GET /api/session/:id - Get session state (optional utility)
 * DELETE /api/session/:id - Clear a session (optional utility)
 */
export const chatRoutes = new Elysia({ prefix: '/api' })
  /**
   * Start a new chat conversation
   * Creates a session and spawns the agent loop
   * Returns sessionId immediately - events stream via /api/stream/:id
   */
  .post(
    '/chat',
    async ({ body }) => {
      const { message, workingDir } = body;

      // Create a new session
      const session = createSession(workingDir);

      // Mark session as running
      updateSessionStatus(session.id, 'running');

      // Spawn the agent loop (fire-and-forget)
      // Events are pushed to the session's event queue for SSE streaming
      (async () => {
        try {
          for await (const event of runAgentLoop({
            userPrompt: message,
            tools,
            signal: session.abortController.signal,
          })) {
            // Push each event to the session's event queue
            session.eventQueue.push(event);

            // If this is a done or error event, update session status
            if (event.type === 'done') {
              updateSessionStatus(session.id, 'completed');
            } else if (event.type === 'error') {
              // Note: error events are followed by done, so status will be updated to completed
              // If we want to mark as failed, we could check if the last event was an error
            }
          }
        } catch (err) {
          // Handle unexpected errors in the agent loop
          const errorMessage = err instanceof Error ? err.message : String(err);
          session.eventQueue.push({ type: 'error', error: errorMessage });
          session.eventQueue.push({ type: 'done' });
          updateSessionStatus(session.id, 'failed');
        } finally {
          // Close the event queue when done
          session.eventQueue.close();
        }
      })();

      // Return session ID immediately
      return { sessionId: session.id };
    },
    {
      body: t.Object({
        message: t.String({ minLength: 1 }),
        workingDir: t.Optional(t.String()),
      }),
    }
  );

/**
 * Chat Routes
 * Handles starting new conversations and managing sessions
 */

import { Elysia, t } from 'elysia';
import { createSession, updateSessionStatus, updateSessionWorkingDir, getSession } from '../session';
import { runAgentLoop } from '../agent/index';
import { tools } from '../tools/index';

/**
 * Chat route plugin
 * POST /api/chat - Start a new conversation
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
      const { message, workingDir, model } = body;

      // Create a new session
      const session = createSession(workingDir);

      // Mark session as running
      updateSessionStatus(session.id, 'running');

      // Spawn the agent loop (fire-and-forget)
      // Events are pushed to the session's event queue for SSE streaming
      let hasError = false;
      (async () => {
        try {
          for await (const event of runAgentLoop({
            userPrompt: message,
            tools,
            workingDir: session.workingDir,
            signal: session.abortController.signal,
            model,
          })) {
            // Push each event to the session's event queue
            session.eventQueue.push(event);

            // Track if any error events occurred
            if (event.type === 'error') {
              hasError = true;
            }

            // Update session status when done
            if (event.type === 'done') {
              updateSessionStatus(session.id, hasError ? 'failed' : 'completed');
            }
          }
        } catch (err) {
          // Handle unexpected errors in the agent loop (e.g., LLM API crashes)
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`[Chat] Agent loop error for session ${session.id}:`, errorMessage);
          try {
            session.eventQueue.push({ type: 'error', error: errorMessage });
            session.eventQueue.push({ type: 'done' });
            updateSessionStatus(session.id, 'failed');
          } catch (queueError) {
            console.error(`[Chat] Failed to push error events for session ${session.id}:`, queueError);
          }
        } finally {
          // Always close the event queue when done
          session.eventQueue.close();
        }
      })();

      // Return session ID and working directory
      return { sessionId: session.id, workingDir: session.workingDir };
    },
    {
      body: t.Object({
        message: t.String({ minLength: 1 }),
        workingDir: t.Optional(t.String()),
        model: t.Optional(t.String()),
      }),
    }
  )
  /**
   * Update session working directory
   * PATCH /api/session/:id/cwd
   */
  .patch(
    '/session/:id/cwd',
    async ({ params, body, set }) => {
      const session = getSession(params.id);
      
      if (!session) {
        set.status = 404;
        return { error: 'Session not found' };
      }
      
      const updated = updateSessionWorkingDir(params.id, body.workingDir);
      
      if (!updated) {
        set.status = 500;
        return { error: 'Failed to update working directory' };
      }
      
      return { 
        sessionId: params.id, 
        workingDir: body.workingDir,
        success: true 
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        workingDir: t.String({ minLength: 1 }),
      }),
    }
  );

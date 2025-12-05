/**
 * Chat Routes
 * Handles starting new conversations and managing sessions
 * Persists messages to SQLite as they stream
 */

import { Elysia, t } from 'elysia';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  createSession,
  updateSessionStatus,
  updateSessionWorkingDir,
  getSession,
  persistMessage,
  incrementTokens,
  getMessages,
  prepareSessionForContinuation,
} from '../session';
import { runAgentLoop } from '../agent/index';
import { tools } from '../tools/index';
import { userMessage, assistantMessage, assistantToolCallMessage, toolResultMessage } from '../agent/messages';
import type { ToolCall } from '../types';

/**
 * Chat route plugin
 * POST /api/chat - Start a new conversation
 * POST /api/chat/:id - Continue an existing conversation
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

      // Persist the user message immediately
      persistMessage(session.id, userMessage(message));

      // Spawn the agent loop with message persistence
      spawnAgentLoop(session.id, message, session.workingDir, model);

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
   * Continue an existing conversation
   * POST /api/chat/:id
   */
  .post(
    '/chat/:id',
    async ({ params, body, set }) => {
      const { message, model } = body;

      // Get and prepare session for continuation
      const session = prepareSessionForContinuation(params.id);

      if (!session) {
        set.status = 404;
        return { error: 'Session not found or is currently running' };
      }

      // Mark session as running
      updateSessionStatus(session.id, 'running');

      // Persist the new user message
      persistMessage(session.id, userMessage(message));

      // Get existing conversation history from database
      const conversationHistory = getMessages(session.id);

      // Spawn the agent loop with history
      spawnAgentLoopWithHistory(
        session.id,
        message,
        session.workingDir,
        conversationHistory,
        model
      );

      return { sessionId: session.id, workingDir: session.workingDir };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        message: t.String({ minLength: 1 }),
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
        success: true,
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

/**
 * Spawn the agent loop for a new conversation
 * Handles message persistence as events stream
 */
function spawnAgentLoop(
  sessionId: string,
  userPrompt: string,
  workingDir: string,
  model?: string
): void {
  const session = getSession(sessionId);
  if (!session) return;

  runAgentLoopWithPersistence(session, userPrompt, workingDir, undefined, model);
}

/**
 * Spawn the agent loop with existing conversation history
 */
function spawnAgentLoopWithHistory(
  sessionId: string,
  userPrompt: string,
  workingDir: string,
  conversationHistory: ChatCompletionMessageParam[],
  model?: string
): void {
  const session = getSession(sessionId);
  if (!session) return;

  runAgentLoopWithPersistence(session, userPrompt, workingDir, conversationHistory, model);
}

/**
 * Run the agent loop with message persistence
 * Tracks streaming state and persists messages to database
 */
function runAgentLoopWithPersistence(
  session: ReturnType<typeof getSession>,
  userPrompt: string,
  workingDir: string,
  conversationHistory: ChatCompletionMessageParam[] | undefined,
  model?: string
): void {
  if (!session) return;

  // State for tracking streaming content
  let textAccumulator = '';
  let pendingToolCalls: ToolCall[] = [];
  let hasError = false;

  // Fire-and-forget async loop
  (async () => {
    try {
      for await (const event of runAgentLoop({
        userPrompt,
        tools,
        workingDir,
        conversationHistory,
        signal: session.abortController.signal,
        model,
      })) {
        // Push event to SSE queue
        session.eventQueue.push(event);

        // Track state for persistence
        switch (event.type) {
          case 'text_delta':
            // Accumulate text content
            if (event.text) {
              textAccumulator += event.text;
            }
            break;

          case 'tool_call':
            // A tool call is starting - if we have accumulated text, persist it first
            if (textAccumulator && pendingToolCalls.length === 0) {
              // This is text before any tool calls in this turn
              // Don't persist yet - wait for all tool calls to collect
            }
            // Collect tool calls
            if (event.toolCall) {
              pendingToolCalls.push(event.toolCall);
            }
            break;

          case 'tool_result':
            // Tool execution completed
            if (event.toolCall) {
              // If this is the first tool result and we have pending tool calls,
              // persist the assistant message with tool calls
              if (pendingToolCalls.length > 0) {
                // Find if this tool call is in our pending list
                const matchIndex = pendingToolCalls.findIndex(tc => tc.id === event.toolCall?.id);
                if (matchIndex !== -1) {
                  // Persist the assistant message with ALL collected tool calls
                  const assistantMsg = assistantToolCallMessage(
                    pendingToolCalls.map(tc => ({
                      id: tc.id,
                      name: tc.name,
                      arguments: JSON.stringify(tc.input),
                    })),
                    textAccumulator || null
                  );
                  persistMessage(session.id, assistantMsg);

                  // Reset accumulators after persisting assistant message
                  textAccumulator = '';
                  pendingToolCalls = [];
                }
              }

              // Persist the tool result message
              const resultContent = event.toolCall.error || event.toolCall.result;
              const toolMsg = toolResultMessage(
                event.toolCall.id,
                resultContent,
                event.toolCall.status === 'error'
              );
              persistMessage(session.id, toolMsg);
            }
            break;

          case 'usage':
            // Track token usage
            if (event.usage) {
              incrementTokens(session.id, event.usage.total_tokens);
            }
            break;

          case 'error':
            hasError = true;
            break;

          case 'done':
            // Persist any remaining text as final assistant message
            if (textAccumulator) {
              persistMessage(session.id, assistantMessage(textAccumulator));
              textAccumulator = '';
            }
            // Update session status
            updateSessionStatus(session.id, hasError ? 'failed' : 'completed');
            break;
        }
      }
    } catch (err) {
      // Handle unexpected errors in the agent loop
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
}

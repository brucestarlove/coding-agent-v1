/**
 * Chat Routes
 * Handles starting new conversations and managing sessions
 * Persists messages to SQLite as they stream
 * Supports Agent Commands for specialized workflow modes
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
  setSessionPlan,
  getSessionPlan,
  hasSessionPlan,
} from '../session';
import { runAgentLoop } from '../agent/index';
import { tools } from '../tools/index';
import { userMessage, assistantMessage, assistantToolCallMessage, toolResultMessage } from '../agent/messages';
import { resolveCommand, getSystemPrompt, type CommandId } from '../agent/commands';
import { savePlan, extractTitleFromContent, detectPlanType } from '../plans';
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
      const { message, workingDir, model, command } = body;

      // Create a new session
      const session = createSession(workingDir);

      // Resolve the command (includes detection and classification)
      const { command: resolvedCommand, cleanedMessage } = await resolveCommand(
        command as CommandId | null,
        message,
        false // New session has no plan yet
      );

      // Mark session as running
      updateSessionStatus(session.id, 'running');

      // Persist the user message immediately
      persistMessage(session.id, userMessage(message));

      // Get system prompt for the command
      const systemPrompt = getSystemPrompt(resolvedCommand.id, null);

      // Spawn the agent loop with command-specific system prompt
      spawnAgentLoop(
        session.id,
        cleanedMessage,
        session.workingDir,
        model,
        systemPrompt,
        resolvedCommand.id
      );

      // Return session ID, working directory, and resolved command
      return {
        sessionId: session.id,
        workingDir: session.workingDir,
        command: resolvedCommand.id,
      };
    },
    {
      body: t.Object({
        message: t.String({ minLength: 1 }),
        workingDir: t.Optional(t.String()),
        model: t.Optional(t.String()),
        command: t.Optional(t.String()),
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
      const { message, model, command } = body;

      // Get and prepare session for continuation
      const session = prepareSessionForContinuation(params.id);

      if (!session) {
        set.status = 404;
        return { error: 'Session not found or is currently running' };
      }

      // Check if session has a plan (for command resolution)
      const hasPlan = hasSessionPlan(session.id);
      const currentPlan = hasPlan ? getSessionPlan(session.id) : null;

      // Resolve the command (includes detection and classification)
      const { command: resolvedCommand, cleanedMessage } = await resolveCommand(
        command as CommandId | null,
        message,
        hasPlan
      );

      // Mark session as running
      updateSessionStatus(session.id, 'running');

      // Persist the new user message
      persistMessage(session.id, userMessage(message));

      // Get existing conversation history from database
      const conversationHistory = getMessages(session.id);

      // Get system prompt for the command (inject plan if relevant)
      const systemPrompt = getSystemPrompt(resolvedCommand.id, currentPlan);

      // Spawn the agent loop with history
      spawnAgentLoopWithHistory(
        session.id,
        cleanedMessage,
        session.workingDir,
        conversationHistory,
        model,
        systemPrompt,
        resolvedCommand.id
      );

      return {
        sessionId: session.id,
        workingDir: session.workingDir,
        command: resolvedCommand.id,
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        message: t.String({ minLength: 1 }),
        model: t.Optional(t.String()),
        command: t.Optional(t.String()),
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
  model?: string,
  systemPrompt?: string,
  commandId?: CommandId
): void {
  const session = getSession(sessionId);
  if (!session) return;

  runAgentLoopWithPersistence(
    session,
    userPrompt,
    workingDir,
    undefined,
    model,
    systemPrompt,
    commandId
  );
}

/**
 * Spawn the agent loop with existing conversation history
 */
function spawnAgentLoopWithHistory(
  sessionId: string,
  userPrompt: string,
  workingDir: string,
  conversationHistory: ChatCompletionMessageParam[],
  model?: string,
  systemPrompt?: string,
  commandId?: CommandId
): void {
  const session = getSession(sessionId);
  if (!session) return;

  runAgentLoopWithPersistence(
    session,
    userPrompt,
    workingDir,
    conversationHistory,
    model,
    systemPrompt,
    commandId
  );
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
  model?: string,
  systemPrompt?: string,
  commandId?: CommandId
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
        systemPrompt,
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

              // If this was a create_plan, revise_plan, or research command, store and save the plan
              if (commandId === 'create_plan' || commandId === 'revise_plan' || commandId === 'research') {
                // Extract plan from the response (look for markdown structure)
                const planContent = extractPlanFromResponse(textAccumulator);
                if (planContent) {
                  // Store in session database
                  setSessionPlan(session.id, planContent);

                  // Also save as a file for cross-session access
                  try {
                    const title = extractTitleFromContent(planContent);
                    const type = commandId === 'research' ? 'research' : detectPlanType(planContent);
                    await savePlan(workingDir, title, planContent, {
                      type,
                      sessionId: session.id,
                      tags: [],
                    });
                    console.log(`[Chat] Saved plan to file: ${title}`);
                  } catch (saveErr) {
                    console.error('[Chat] Failed to save plan to file:', saveErr);
                  }
                }
              }

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

/**
 * Extract plan content from an agent's response
 * Looks for structured markdown content that represents a plan
 */
function extractPlanFromResponse(response: string): string | null {
  // If the response contains plan-like structure, use the whole thing
  // Otherwise, try to extract just the plan section
  
  const hasPlanStructure = 
    /^##?\s+(overview|plan|implementation|steps|files)/im.test(response) ||
    (response.match(/^\d+\.\s+/gm) || []).length >= 3 ||
    response.includes('## Implementation Steps') ||
    response.includes('## Files to Modify');

  if (hasPlanStructure) {
    return response;
  }

  // Try to extract a plan section if present
  const planMatch = response.match(/## Plan[\s\S]*?(?=\n## [^P]|$)/i);
  if (planMatch) {
    return planMatch[0];
  }

  // No clear plan structure found
  return null;
}

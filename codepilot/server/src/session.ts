/**
 * Session Manager
 * Handles session state with SQLite persistence for conversations
 * Provides event queue pattern for streaming to SSE clients
 * 
 * Architecture:
 * - Active sessions are cached in memory for fast access
 * - All sessions and messages are persisted to SQLite
 * - EventQueue and AbortController are runtime-only (not persisted)
 */

import { randomUUID } from 'crypto';
import path from 'path';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { StreamEvent } from './types';
import {
  insertSession,
  getDbSession,
  updateDbSessionStatus,
  updateDbSessionWorkingDir,
  updateDbSessionTitle,
  updateDbSessionPlan,
  getDbSessionPlan,
  deleteDbSession,
  incrementDbSessionTokens,
  insertMessage,
  getSessionMessages as getDbSessionMessages,
  getMessageCount,
  listSessionSummaries,
  type SessionSummary,
} from './db';

/**
 * Represents an active session's state (in-memory)
 */
export interface SessionState {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  messages: ChatCompletionMessageParam[];
  workingDir: string;
  abortController: AbortController;
  createdAt: Date;
  totalTokens: number;
  /** Queue of events for SSE streaming (runtime-only) */
  eventQueue: EventQueue;
}

/**
 * Simple async event queue for streaming events to SSE clients
 * Implements async iterable pattern for use with for-await-of
 */
export class EventQueue {
  private queue: StreamEvent[] = [];
  private resolvers: Array<(value: IteratorResult<StreamEvent>) => void> = [];
  private closed = false;

  /**
   * Push an event to the queue
   * If there's a waiting consumer, resolve immediately
   */
  push(event: StreamEvent): void {
    if (this.closed) return;

    if (this.resolvers.length > 0) {
      // Consumer is waiting, resolve immediately
      const resolve = this.resolvers.shift()!;
      resolve({ value: event, done: false });
    } else {
      // No consumer waiting, queue the event
      this.queue.push(event);
    }
  }

  /**
   * Close the queue - signals end of stream
   */
  close(): void {
    this.closed = true;
    // Resolve any waiting consumers with done
    for (const resolve of this.resolvers) {
      resolve({ value: undefined as any, done: true });
    }
    this.resolvers = [];
  }

  /**
   * Check if queue is closed
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Async iterator implementation
   */
  [Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    return {
      next: (): Promise<IteratorResult<StreamEvent>> => {
        // If there are queued events, return immediately
        if (this.queue.length > 0) {
          const event = this.queue.shift()!;
          return Promise.resolve({ value: event, done: false });
        }

        // If closed, we're done
        if (this.closed) {
          return Promise.resolve({ value: undefined as any, done: true });
        }

        // Otherwise, wait for next event
        return new Promise((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }
}

/**
 * In-memory session cache for active sessions
 * Sessions are loaded from DB on demand and cached here
 */
const sessions = new Map<string, SessionState>();

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `session_${randomUUID()}`;
}

/**
 * Create a new session
 * Persists to database and caches in memory
 * @param workingDir - Working directory for the session (defaults to PROJECT_ROOT env var if set, otherwise parent of cwd)
 */
export function createSession(workingDir?: string): SessionState {
  const id = generateSessionId();
  // Default to parent directory since server runs from /codepilot/server
  const defaultWorkingDir = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');
  const resolvedWorkingDir = workingDir || defaultWorkingDir;

  // Persist to database first
  insertSession(id, resolvedWorkingDir, 'idle');

  // Create in-memory session
  const session: SessionState = {
    id,
    status: 'idle',
    messages: [],
    workingDir: resolvedWorkingDir,
    abortController: new AbortController(),
    createdAt: new Date(),
    totalTokens: 0,
    eventQueue: new EventQueue(),
  };

  sessions.set(id, session);
  return session;
}

/**
 * Get a session by ID
 * First checks memory cache, then loads from database if needed
 */
export function getSession(id: string): SessionState | undefined {
  // Check memory cache first
  const cached = sessions.get(id);
  if (cached) return cached;

  // Try to load from database
  const dbSession = getDbSession(id);
  if (!dbSession) return undefined;

  // Rehydrate session from database
  // Note: For inactive sessions (completed/failed), we create fresh runtime objects
  const session: SessionState = {
    id: dbSession.id,
    status: dbSession.status as SessionState['status'],
    messages: getDbSessionMessages(id),
    workingDir: dbSession.working_dir,
    abortController: new AbortController(),
    createdAt: new Date(dbSession.created_at),
    totalTokens: dbSession.total_tokens,
    eventQueue: new EventQueue(),
  };

  // Cache for future access
  sessions.set(id, session);
  return session;
}

/**
 * Delete a session
 * Removes from both memory and database
 */
export function deleteSession(id: string): boolean {
  const session = sessions.get(id);
  if (session) {
    // Abort if running
    if (session.status === 'running') {
      session.abortController.abort();
    }
    // Close the event queue
    session.eventQueue.close();
    sessions.delete(id);
  }

  // Always try to delete from database
  return deleteDbSession(id);
}

/**
 * Update session status
 * Updates both memory cache and database
 */
export function updateSessionStatus(
  id: string,
  status: SessionState['status']
): void {
  // Update memory cache
  const session = sessions.get(id);
  if (session) {
    session.status = status;
  }

  // Update database
  updateDbSessionStatus(id, status);
}

/**
 * Update session working directory
 * Updates both memory cache and database
 * @returns true if session was found and updated, false otherwise
 */
export function updateSessionWorkingDir(id: string, workingDir: string): boolean {
  const session = sessions.get(id);
  if (session) {
    session.workingDir = workingDir;
  }

  // Update database
  updateDbSessionWorkingDir(id, workingDir);
  return true;
}

/**
 * Update session title
 * Updates database (title not stored in memory cache)
 * @returns true if session exists in database
 */
export function updateSessionTitle(id: string, title: string): boolean {
  const dbSession = getDbSession(id);
  if (!dbSession) return false;

  updateDbSessionTitle(id, title);
  return true;
}

/**
 * Persist a message to the database and update in-memory cache
 */
export function persistMessage(
  sessionId: string,
  message: ChatCompletionMessageParam
): void {
  // Update memory cache
  const session = sessions.get(sessionId);
  if (session) {
    session.messages.push(message);
  }

  // Persist to database
  insertMessage(sessionId, message);
}

/**
 * Increment token usage for a session
 */
export function incrementTokens(sessionId: string, tokens: number): void {
  // Update memory cache
  const session = sessions.get(sessionId);
  if (session) {
    session.totalTokens += tokens;
  }

  // Update database
  incrementDbSessionTokens(sessionId, tokens);
}

/**
 * Set the current plan for a session
 * Used after Create Plan or Revise Plan commands
 */
export function setSessionPlan(sessionId: string, plan: string): void {
  updateDbSessionPlan(sessionId, plan);
}

/**
 * Get the current plan for a session
 * Used by Revise Plan and Implement Complex commands
 */
export function getSessionPlan(sessionId: string): string | null {
  return getDbSessionPlan(sessionId);
}

/**
 * Check if a session has a current plan
 */
export function hasSessionPlan(sessionId: string): boolean {
  return getDbSessionPlan(sessionId) !== null;
}

/**
 * Get messages for a session (from database)
 */
export function getMessages(sessionId: string): ChatCompletionMessageParam[] {
  return getDbSessionMessages(sessionId);
}

/**
 * Prepare a session for continuing a conversation
 * Creates fresh runtime objects (EventQueue, AbortController) for a previously completed session
 */
export function prepareSessionForContinuation(id: string): SessionState | undefined {
  const session = getSession(id);
  if (!session) return undefined;

  // Can't continue a currently running session
  if (session.status === 'running') {
    return undefined;
  }

  // Create fresh runtime objects for the new run
  session.abortController = new AbortController();
  session.eventQueue = new EventQueue();

  return session;
}

/**
 * Safe read-only representation of a session for API responses
 * Excludes non-serializable fields (AbortController, EventQueue)
 */
export interface SessionDTO {
  id: string;
  status: SessionState['status'];
  workingDir: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totalTokens: number;
}

/**
 * Get session info for API response
 */
export function getSessionInfo(id: string): SessionDTO | undefined {
  const dbSession = getDbSession(id);
  if (!dbSession) return undefined;

  return {
    id: dbSession.id,
    status: dbSession.status as SessionState['status'],
    workingDir: dbSession.working_dir,
    title: dbSession.title,
    createdAt: dbSession.created_at,
    updatedAt: dbSession.updated_at,
    messageCount: getMessageCount(id),
    totalTokens: dbSession.total_tokens,
  };
}

/**
 * List all sessions with summaries
 * Returns data directly from database for consistency
 */
export function listSessions(
  limit: number = 20,
  offset: number = 0
): { sessions: SessionSummary[]; total: number } {
  return listSessionSummaries(limit, offset);
}

/**
 * Get all sessions from memory (for debugging/admin)
 * @deprecated Use listSessions() for proper persistence support
 */
export function getAllSessions(): SessionDTO[] {
  return Array.from(sessions.values()).map((s): SessionDTO => ({
    id: s.id,
    status: s.status,
    workingDir: s.workingDir,
    title: null, // Not tracked in memory
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.createdAt.toISOString(), // Use createdAt as fallback
    messageCount: s.messages.length,
    totalTokens: s.totalTokens,
  }));
}

/**
 * Clear old sessions from memory cache
 * Note: Does not delete from database - use for memory management only
 * @param maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 */
export function cleanupOldSessionsFromCache(maxAgeMs: number = 60 * 60 * 1000): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, session] of sessions) {
    // Only cleanup completed/failed sessions
    if (session.status === 'completed' || session.status === 'failed') {
      if (now - session.createdAt.getTime() > maxAgeMs) {
        session.eventQueue.close();
        sessions.delete(id);
        cleaned++;
      }
    }
  }

  return cleaned;
}

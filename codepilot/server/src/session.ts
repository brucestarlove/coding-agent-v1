/**
 * Session Manager
 * Handles in-memory session state for agent conversations
 * Provides event queue pattern for streaming to SSE clients
 */

import { randomUUID } from 'crypto';
import path from 'path';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { StreamEvent } from './types';

/**
 * Represents an active session's state
 */
export interface SessionState {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  messages: ChatCompletionMessageParam[];
  workingDir: string;
  abortController: AbortController;
  createdAt: Date;
  /** Queue of events for SSE streaming */
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
 * In-memory session store
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
 * @param workingDir - Working directory for the session (defaults to parent of cwd)
 */
export function createSession(workingDir?: string): SessionState {
  const id = generateSessionId();
  // Default to parent directory since server runs from /codepilot/server
  const defaultWorkingDir = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..');
  const session: SessionState = {
    id,
    status: 'idle',
    messages: [],
    workingDir: workingDir || defaultWorkingDir,
    abortController: new AbortController(),
    createdAt: new Date(),
    eventQueue: new EventQueue(),
  };

  sessions.set(id, session);
  return session;
}

/**
 * Get a session by ID
 */
export function getSession(id: string): SessionState | undefined {
  return sessions.get(id);
}

/**
 * Delete a session
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
    return true;
  }
  return false;
}

/**
 * Update session status
 */
export function updateSessionStatus(
  id: string,
  status: SessionState['status']
): void {
  const session = sessions.get(id);
  if (session) {
    session.status = status;
  }
}

/**
 * Safe read-only representation of a session for API responses
 * Excludes non-serializable fields (AbortController, EventQueue)
 */
export interface SessionDTO {
  id: string;
  status: SessionState['status'];
  workingDir: string;
  createdAt: Date;
  messageCount: number;
  /** Deep copy of messages - safe to read, won't affect server state */
  messages: ChatCompletionMessageParam[];
}

/**
 * Get all sessions (for debugging/admin)
 * Returns safe DTOs that won't allow mutation of server state
 */
export function getAllSessions(): SessionDTO[] {
  return Array.from(sessions.values()).map((s): SessionDTO => ({
    id: s.id,
    status: s.status,
    workingDir: s.workingDir,
    createdAt: new Date(s.createdAt.getTime()), // Clone the Date
    messageCount: s.messages.length,
    // Deep clone messages to prevent mutation of server state
    messages: structuredClone(s.messages),
  }));
}

/**
 * Clear old sessions (cleanup utility)
 * Can be called manually or integrated with future persistence layer (e.g., SQLite)
 * @param maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 */
export function cleanupOldSessions(maxAgeMs: number = 60 * 60 * 1000): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, session] of sessions) {
    if (now - session.createdAt.getTime() > maxAgeMs) {
      deleteSession(id);
      cleaned++;
    }
  }

  return cleaned;
}

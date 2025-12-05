/**
 * Database operations unit tests
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  createTestDb,
  clearTestDb,
  closeTestDb,
  insertTestSession,
  getTestSession,
  getTestMessages,
} from '../test/db-helper';
import type Database from 'better-sqlite3';

describe('Database Operations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterAll(() => {
    closeTestDb();
  });

  describe('Session CRUD', () => {
    it('should insert a session with default values', () => {
      insertTestSession(db, 'session_1', '/project');

      const session = getTestSession(db, 'session_1') as Record<string, unknown>;
      expect(session).toBeDefined();
      expect(session.id).toBe('session_1');
      expect(session.status).toBe('idle');
      expect(session.working_dir).toBe('/project');
      expect(session.total_tokens).toBe(0);
    });

    it('should return undefined for non-existent session', () => {
      const session = getTestSession(db, 'nonexistent');
      expect(session).toBeUndefined();
    });

    it('should update session status', () => {
      insertTestSession(db, 'session_1');

      const now = new Date().toISOString();
      db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?').run('running', now, 'session_1');

      const session = getTestSession(db, 'session_1') as Record<string, unknown>;
      expect(session.status).toBe('running');
    });

    it('should increment tokens atomically', () => {
      insertTestSession(db, 'session_1');

      // Increment multiple times
      const stmt = db.prepare('UPDATE sessions SET total_tokens = total_tokens + ? WHERE id = ?');
      stmt.run(100, 'session_1');
      stmt.run(50, 'session_1');
      stmt.run(25, 'session_1');

      const session = getTestSession(db, 'session_1') as Record<string, unknown>;
      expect(session.total_tokens).toBe(175);
    });

    it('should delete session and cascade to messages', () => {
      insertTestSession(db, 'session_1');

      // Insert a message
      const now = new Date().toISOString();
      db.prepare(
        `
        INSERT INTO messages (session_id, role, content, created_at)
        VALUES (?, ?, ?, ?)
      `
      ).run('session_1', 'user', 'Hello', now);

      // Verify message exists
      let messages = getTestMessages(db, 'session_1');
      expect(messages).toHaveLength(1);

      // Delete session
      db.prepare('DELETE FROM sessions WHERE id = ?').run('session_1');

      // Verify cascade deletion
      messages = getTestMessages(db, 'session_1');
      expect(messages).toHaveLength(0);
    });
  });

  describe('Session Listing with Pagination', () => {
    beforeEach(() => {
      clearTestDb();
      // Create 25 sessions
      for (let i = 1; i <= 25; i++) {
        insertTestSession(db, `session_${i.toString().padStart(2, '0')}`);
      }
    });

    it('should list sessions with default pagination', () => {
      const stmt = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?');
      const sessions = stmt.all(20, 0);
      expect(sessions).toHaveLength(20);
    });

    it('should handle offset correctly', () => {
      const stmt = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?');
      const sessions = stmt.all(10, 20);
      expect(sessions).toHaveLength(5); // Only 5 remaining after offset 20
    });

    it('should return total count', () => {
      const { count } = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
      expect(count).toBe(25);
    });
  });

  describe('Message Operations', () => {
    beforeEach(() => {
      clearTestDb();
      insertTestSession(db, 'session_1');
    });

    it('should insert and retrieve messages in order', () => {
      const now = new Date().toISOString();
      const insertStmt = db.prepare(
        `
        INSERT INTO messages (session_id, role, content, created_at)
        VALUES (?, ?, ?, ?)
      `
      );

      insertStmt.run('session_1', 'user', 'First', now);
      insertStmt.run('session_1', 'assistant', 'Second', now);
      insertStmt.run('session_1', 'user', 'Third', now);

      const messages = getTestMessages(db, 'session_1') as Array<{ content: string }>;
      expect(messages).toHaveLength(3);
      expect(messages.map((m) => m.content)).toEqual(['First', 'Second', 'Third']);
    });

    it('should store and retrieve JSON tool_calls', () => {
      const now = new Date().toISOString();
      const toolCalls = JSON.stringify([
        { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"test.ts"}' } },
      ]);

      db.prepare(
        `
        INSERT INTO messages (session_id, role, content, tool_calls, created_at)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run('session_1', 'assistant', null, toolCalls, now);

      const messages = getTestMessages(db, 'session_1') as Array<{ tool_calls: string }>;
      expect(messages).toHaveLength(1);

      const parsed = JSON.parse(messages[0].tool_calls);
      expect(parsed[0].id).toBe('call_1');
      expect(parsed[0].function.name).toBe('read_file');
    });

    it('should store array content as JSON string', () => {
      const now = new Date().toISOString();
      const content = JSON.stringify([{ type: 'text', text: 'Hello' }]);

      db.prepare(
        `
        INSERT INTO messages (session_id, role, content, created_at)
        VALUES (?, ?, ?, ?)
      `
      ).run('session_1', 'assistant', content, now);

      const messages = getTestMessages(db, 'session_1') as Array<{ content: string }>;
      const parsed = JSON.parse(messages[0].content);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].text).toBe('Hello');
    });
  });
});


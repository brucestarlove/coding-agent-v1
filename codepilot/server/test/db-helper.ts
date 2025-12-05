/**
 * Test utilities for database operations
 * Uses in-memory SQLite for isolated, fast tests
 */
import Database from 'better-sqlite3';

// Store the test database instance
let testDb: Database.Database | null = null;

/**
 * Initialize an in-memory test database with schema
 */
export function createTestDb(): Database.Database {
  // Close any existing test database to avoid leaking handles between tests
  if (testDb) {
    testDb.close();
    testDb = null;
  }

  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  // Copy schema from db.ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      working_dir TEXT NOT NULL,
      title TEXT,
      total_tokens INTEGER DEFAULT 0,
      current_plan TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      tool_call_id TEXT,
      tool_calls TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  `);

  testDb = db;
  return db;
}

/**
 * Get the current test database instance
 */
export function getTestDb(): Database.Database {
  if (!testDb) {
    throw new Error('Test database not initialized. Call createTestDb() first.');
  }
  return testDb;
}

/**
 * Clear all data from the test database
 */
export function clearTestDb(): void {
  if (!testDb) return;
  testDb.exec('DELETE FROM messages');
  testDb.exec('DELETE FROM sessions');
}

/**
 * Close and cleanup the test database
 */
export function closeTestDb(): void {
  if (testDb) {
    testDb.close();
    testDb = null;
  }
}

/**
 * Helper to insert a test session
 */
export function insertTestSession(
  db: Database.Database,
  id: string,
  workingDir: string = '/test',
  status: string = 'idle'
): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO sessions (id, status, working_dir, total_tokens, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
  `).run(id, status, workingDir, now, now);
}

/**
 * Helper to get a session by ID
 */
export function getTestSession(db: Database.Database, id: string) {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

/**
 * Helper to get messages for a session
 */
export function getTestMessages(db: Database.Database, sessionId: string) {
  return db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC').all(sessionId);
}


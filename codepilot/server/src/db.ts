/**
 * SQLite Database Module
 * Provides persistent storage for sessions and messages
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Database file location - in codepilot/data/ directory
const DATA_DIR = path.resolve(process.cwd(), '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'codepilot.db');

// Lazy-initialized database instance
let db: Database.Database | null = null;

/**
 * Get or initialize the database connection
 */
export function getDb(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`📁 Created data directory: ${DATA_DIR}`);
  }

  // Open/create database
  db = new Database(DB_PATH);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Initialize schema
  initSchema(db);
  
  console.log(`💾 SQLite database initialized: ${DB_PATH}`);
  
  return db;
}

/**
 * Initialize database schema
 */
function initSchema(db: Database.Database): void {
  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      working_dir TEXT NOT NULL,
      title TEXT,
      total_tokens INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Add title column if it doesn't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN title TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Add current_plan column for storing generated plans (migration)
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN current_plan TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Messages table
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

  // Index for faster message lookups by session
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  `);
}

/**
 * Close the database connection (for graceful shutdown)
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    console.log('💾 Database connection closed');
  }
}

// ============================================================================
// Session Operations
// ============================================================================

export interface DbSession {
  id: string;
  status: string;
  working_dir: string;
  title: string | null;
  total_tokens: number;
  current_plan: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Insert a new session into the database
 */
export function insertSession(
  id: string,
  workingDir: string,
  status: string = 'idle'
): void {
  const now = new Date().toISOString();
  const stmt = getDb().prepare(`
    INSERT INTO sessions (id, status, working_dir, total_tokens, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
  `);
  stmt.run(id, status, workingDir, now, now);
}

/**
 * Get a session by ID
 */
export function getDbSession(id: string): DbSession | undefined {
  const stmt = getDb().prepare('SELECT * FROM sessions WHERE id = ?');
  return stmt.get(id) as DbSession | undefined;
}

/**
 * Update session status
 */
export function updateDbSessionStatus(id: string, status: string): void {
  const now = new Date().toISOString();
  const stmt = getDb().prepare(`
    UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(status, now, id);
}

/**
 * Update session working directory
 */
export function updateDbSessionWorkingDir(id: string, workingDir: string): void {
  const now = new Date().toISOString();
  const stmt = getDb().prepare(`
    UPDATE sessions SET working_dir = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(workingDir, now, id);
}

/**
 * Increment session token count
 */
export function incrementDbSessionTokens(id: string, tokens: number): void {
  const now = new Date().toISOString();
  const stmt = getDb().prepare(`
    UPDATE sessions SET total_tokens = total_tokens + ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(tokens, now, id);
}

/**
 * Update session title
 */
export function updateDbSessionTitle(id: string, title: string): void {
  const now = new Date().toISOString();
  const stmt = getDb().prepare(`
    UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(title, now, id);
}

/**
 * Delete a session (messages cascade automatically)
 */
export function deleteDbSession(id: string): boolean {
  const stmt = getDb().prepare('DELETE FROM sessions WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * Get session's current plan
 */
export function getDbSessionPlan(id: string): string | null {
  const stmt = getDb().prepare('SELECT current_plan FROM sessions WHERE id = ?');
  const row = stmt.get(id) as { current_plan: string | null } | undefined;
  return row?.current_plan ?? null;
}

/**
 * Update session's current plan
 */
export function updateDbSessionPlan(id: string, plan: string | null): void {
  const now = new Date().toISOString();
  const stmt = getDb().prepare(`
    UPDATE sessions SET current_plan = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(plan, now, id);
}

/**
 * List all sessions with pagination
 */
export function listDbSessions(
  limit: number = 20,
  offset: number = 0
): { sessions: DbSession[]; total: number } {
  const countStmt = getDb().prepare('SELECT COUNT(*) as count FROM sessions');
  const { count } = countStmt.get() as { count: number };

  const stmt = getDb().prepare(`
    SELECT * FROM sessions
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const sessions = stmt.all(limit, offset) as DbSession[];

  return { sessions, total: count };
}

// ============================================================================
// Message Operations
// ============================================================================

export interface DbMessage {
  id: number;
  session_id: string;
  role: string;
  content: string | null;
  tool_call_id: string | null;
  tool_calls: string | null;
  created_at: string;
}

/**
 * Insert a message into the database
 * Handles the OpenAI ChatCompletionMessageParam format
 */
export function insertMessage(
  sessionId: string,
  message: ChatCompletionMessageParam
): number {
  const now = new Date().toISOString();
  
  // Extract fields based on message type
  let content: string | null = null;
  let toolCallId: string | null = null;
  let toolCallsJson: string | null = null;

  if ('content' in message && message.content !== undefined) {
    content = typeof message.content === 'string' 
      ? message.content 
      : JSON.stringify(message.content);
  }

  if ('tool_call_id' in message && message.tool_call_id) {
    toolCallId = message.tool_call_id;
  }

  if ('tool_calls' in message && message.tool_calls) {
    toolCallsJson = JSON.stringify(message.tool_calls);
  }

  const stmt = getDb().prepare(`
    INSERT INTO messages (session_id, role, content, tool_call_id, tool_calls, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(sessionId, message.role, content, toolCallId, toolCallsJson, now);
  return result.lastInsertRowid as number;
}

/**
 * Get all messages for a session
 * Returns messages in the format expected by the OpenAI API
 */
export function getSessionMessages(sessionId: string): ChatCompletionMessageParam[] {
  const stmt = getDb().prepare(`
    SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC
  `);
  const rows = stmt.all(sessionId) as DbMessage[];

  return rows.map(row => dbMessageToOpenAI(row));
}

/**
 * Get message count for a session
 */
export function getMessageCount(sessionId: string): number {
  const stmt = getDb().prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?');
  const { count } = stmt.get(sessionId) as { count: number };
  return count;
}

/**
 * Get the first user message for a session (for preview)
 */
export function getFirstUserMessage(sessionId: string): string | null {
  const stmt = getDb().prepare(`
    SELECT content FROM messages 
    WHERE session_id = ? AND role = 'user' 
    ORDER BY id ASC LIMIT 1
  `);
  const row = stmt.get(sessionId) as { content: string | null } | undefined;
  return row?.content ?? null;
}

/**
 * Convert a database message row to OpenAI ChatCompletionMessageParam format
 */
function dbMessageToOpenAI(row: DbMessage): ChatCompletionMessageParam {
  const base: Record<string, unknown> = {
    role: row.role,
  };

  // Add content if present
  if (row.content !== null) {
    // Try to parse as JSON (for array content), fallback to string
    try {
      const parsed = JSON.parse(row.content);
      if (Array.isArray(parsed)) {
        base.content = parsed;
      } else {
        base.content = row.content;
      }
    } catch {
      base.content = row.content;
    }
  }

  // Add tool_call_id for tool messages
  if (row.tool_call_id) {
    base.tool_call_id = row.tool_call_id;
  }

  // Add tool_calls for assistant messages with tool calls
  if (row.tool_calls) {
    try {
      base.tool_calls = JSON.parse(row.tool_calls);
    } catch {
      // Invalid JSON, skip
    }
  }

  return base as ChatCompletionMessageParam;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get session summary for listing
 */
export interface SessionSummary {
  id: string;
  status: string;
  workingDir: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totalTokens: number;
  preview: string | null;
}

/**
 * Get all sessions with summaries (for listing endpoint)
 */
export function listSessionSummaries(
  limit: number = 20,
  offset: number = 0
): { sessions: SessionSummary[]; total: number } {
  const { sessions: dbSessions, total } = listDbSessions(limit, offset);

  const sessions: SessionSummary[] = dbSessions.map(s => ({
    id: s.id,
    status: s.status,
    workingDir: s.working_dir,
    title: s.title,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    messageCount: getMessageCount(s.id),
    totalTokens: s.total_tokens,
    preview: truncatePreview(getFirstUserMessage(s.id)),
  }));

  return { sessions, total };
}

/**
 * Truncate preview text to a reasonable length
 */
function truncatePreview(text: string | null, maxLength: number = 100): string | null {
  if (!text) return null;
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}


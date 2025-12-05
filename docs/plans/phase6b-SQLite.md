# SQLite Persistence Layer (Phase 6.5)

## Overview

Add SQLite database to persist sessions and messages. Users can continue existing conversations and retrieve full chat history. Real-time streaming (EventQueue) remains in-memory for active sessions.

## Current State (Already Implemented)

- `ToolContext` pattern with `workingDir` - tools receive session context
- `SessionState.messages` exists but is **never populated** (the bug)
- `SessionDTO` exists for safe API responses
- `updateSessionWorkingDir()` exists
- Token usage events (`usage` type in `StreamEvent`)
- 8 tools: read_file, write_file, edit_file, list_dir, run_shell, git_diff, git_status, git_log

## Files to Create/Modify

| File | Action | Purpose |

|------|--------|---------|

| [`server/src/db.ts`](codepilot/server/src/db.ts) | Create | Database connection, schema init |

| [`server/src/session.ts`](codepilot/server/src/session.ts) | Modify | Add DB persistence layer |

| [`server/src/routes/chat.ts`](codepilot/server/src/routes/chat.ts) | Modify | Persist messages, add continue endpoint |

| [`server/src/routes/stream.ts`](codepilot/server/src/routes/stream.ts) | Modify | Add session listing, message history |

| [`server/package.json`](codepilot/server/package.json) | Modify | Add better-sqlite3 dependency |

| [`.gitignore`](codepilot/.gitignore) | Modify | Ignore data/ directory |

## Implementation

### 1. Database Setup (`db.ts`)

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle',
  working_dir TEXT NOT NULL,
  total_tokens INTEGER DEFAULT 0,  -- Accumulated token usage
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,           -- 'system', 'user', 'assistant', 'tool'
  content TEXT,                 -- Nullable (tool calls may have no content)
  tool_call_id TEXT,            -- For tool result messages
  tool_calls TEXT,              -- JSON for assistant tool calls
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_session ON messages(session_id);
```

- Use `better-sqlite3` for synchronous operations
- Database location: `codepilot/data/codepilot.db`
- Auto-create directory and schema on first run

### 2. Session Manager Updates (`session.ts`)

**Add persistence functions:**

- `persistSession(session)` - Insert/update session in DB
- `persistMessage(sessionId, message)` - Append message to DB
- `loadSessionMessages(sessionId)` - Load messages from DB
- `incrementTokenUsage(sessionId, tokens)` - Track cumulative tokens

**Modify existing functions:**

- `createSession()` - Also insert into DB
- `getSession()` - Load from DB if not in memory (lazy loading)
- `updateSessionStatus()` - Update DB
- `deleteSession()` - Delete from DB (CASCADE removes messages)

**Keep in-memory only:** `EventQueue`, `AbortController` (runtime-only)

### 3. Chat Routes Updates (`chat.ts`)

**Modify POST /api/chat:**

- Persist user message to DB immediately
- Track text accumulator, persist complete assistant message on turn end
- Persist tool calls and results as they complete
- Update token usage from `usage` events

**Add POST /api/chat/:id** (continue session):

- Validate session exists and is not running
- Load existing messages from DB as `conversationHistory`
- Create fresh `EventQueue` and `AbortController` for new run
- Pass to `runAgentLoop()` with history

### 4. Stream Routes Updates (`stream.ts`)

**Add GET /api/sessions:**

```typescript
// Returns: { sessions: SessionSummary[], total: number }
// SessionSummary: { id, status, workingDir, createdAt, messageCount, preview }
```

- List recent sessions with metadata
- Include first user message as preview (truncated)
- Support pagination: `?limit=20&offset=0`

**Add GET /api/session/:id/messages:**

```typescript
// Returns: { messages: ChatCompletionMessageParam[] }
```

- Return full conversation history from DB
- Format for frontend display

**Fix GET /api/session/:id:**

- Return accurate `messageCount` from DB
- Include `totalTokens` from DB

### 5. Message Persistence Strategy

In chat route, track state during streaming:

```typescript
let textAccumulator = '';
let currentToolCalls: ToolCall[] = [];

for await (const event of runAgentLoop(...)) {
  if (event.type === 'text_delta') {
    textAccumulator += event.text;
  }
  if (event.type === 'tool_call') {
    currentToolCalls.push(event.toolCall);
    // Persist assistant message with tool_calls when first tool starts
  }
  if (event.type === 'tool_result') {
    // Persist tool result message
  }
  if (event.type === 'usage') {
    // Increment session token count
  }
  if (event.type === 'done') {
    // Persist final assistant text if any
  }
}
```

## API Changes

| Method | Endpoint | Change |

|--------|----------|--------|

| POST | `/api/chat` | Now persists messages |

| POST | `/api/chat/:id` | **NEW** - Continue existing session |

| GET | `/api/sessions` | **NEW** - List all sessions |

| GET | `/api/session/:id/messages` | **NEW** - Get message history |

| GET | `/api/session/:id` | Fix messageCount, add totalTokens |

| PATCH | `/api/session/:id/cwd` | Already exists - no change |

## Directory Structure

```
codepilot/
├── data/
│   └── codepilot.db          # SQLite database (gitignored)
└── server/
    └── src/
        └── db.ts             # New: database module
```

## Notes

- Add `data/*.db` to `.gitignore`
- `better-sqlite3` requires native compilation
- EventQueue stays in-memory (real-time streaming)
- Token usage persisted for analytics/limits
- Conversation continuation rehydrates from DB

---

## Summary

**SQLite Persistence Layer - Complete**

### Files Created
- **`server/src/db.ts`** - Database module with:
  - Schema initialization (sessions + messages tables)
  - CRUD operations for sessions and messages
  - Session listing with pagination
  - Token tracking

### Files Modified
- **`server/src/session.ts`** - Updated to:
  - Persist sessions and messages to SQLite
  - Load sessions from DB with lazy caching
  - Track token usage
  - Support session continuation (`prepareSessionForContinuation`)

- **`server/src/routes/chat.ts`** - Updated to:
  - Persist user messages immediately
  - Track streaming state and persist assistant/tool messages
  - Added `POST /api/chat/:id` for continuing conversations
  - Track token usage from `usage` events

- **`server/src/routes/stream.ts`** - Updated to:
  - Added `GET /api/sessions` (list all with pagination)
  - Added `GET /api/session/:id/messages` (get history)
  - Fixed `GET /api/session/:id` with accurate `messageCount` and `totalTokens`

- **`codepilot/.gitignore`** - Added `data/` and `*.db`

- **`server/package.json`** - Added `better-sqlite3` dependency

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Start new conversation (persists messages) |
| POST | `/api/chat/:id` | Continue existing conversation |
| GET | `/api/sessions` | List all sessions with pagination |
| GET | `/api/session/:id` | Get session info (with accurate counts) |
| GET | `/api/session/:id/messages` | Get full message history |
| DELETE | `/api/session/:id` | Delete session |

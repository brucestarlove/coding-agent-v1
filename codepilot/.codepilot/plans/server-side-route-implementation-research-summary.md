---
id: plan_mit4ii3i_lnz30u
title: "**Server-Side Route Implementation Research Summary**"
type: research
createdAt: 2025-12-05T17:13:12.990Z
updatedAt: 2025-12-05T17:13:12.990Z
sessionId: session_9d91b9c2-c250-4590-8503-f11b6051a946
tags: 
---

Perfect! Now I have a complete understanding of the server-side routing implementation. Let me create a comprehensive summary.

---

## **Server-Side Route Implementation Research Summary**

This codebase implements a sophisticated AI coding assistant backend using **Elysia.js** as the web framework. Here's a comprehensive breakdown:

---

### **Architecture Overview**

**Framework**: Elysia.js (v1.2.25) with Node.js adapter (@elysiajs/node)
**Database**: SQLite (better-sqlite3) for persistent storage
**LLM Integration**: OpenRouter API (OpenAI-compatible) or Anthropic SDK
**Language**: TypeScript with ES Modules

---

### **Main Entry Point: `server/src/index.ts`**

**Server Setup**:
- Port: 3001 (configurable via `process.env.PORT`)
- CORS enabled for cross-origin requests from frontend (default: http://localhost:5173)
- Handles preflight OPTIONS requests

**Global Routes**:
```typescript
GET  /health              → Health check
GET  /                    → API info message
GET  /api/tools           → List available tools (read_file, write_file, etc.)
GET  /api/models          → List available LLM models (Claude Haiku, Sonnet, Opus)
GET  /api/commands        → List available agent commands (Chat, Research, Plan, etc.)
```

**Route Plugins**:
- `chatRoutes` - Conversation management
- `streamRoutes` - SSE streaming and session management
- `plansRoutes` - Plan file operations

---

### **Route Modules**

#### **1. Chat Routes (`server/src/routes/chat.ts`)**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/chat` | Start new conversation |
| POST | `/api/chat/:id` | Continue existing conversation |
| PATCH | `/api/session/:id/cwd` | Update working directory |

**Key Features**:
- **Command Resolution**: Detects command from user message or explicit selection
- **Session Creation**: Generates unique session IDs, persists to SQLite
- **Message Persistence**: Stores messages as they stream to database
- **Agent Loop Spawning**: Fire-and-forget async execution
- **Plan Extraction**: Automatically saves plans from create_plan/revise_plan responses
- **Token Tracking**: Accumulates usage data per session

**Flow for New Chat**:
```typescript
1. Validate input (message, workingDir, model, command)
2. createSession() → persist to DB
3. resolveCommand() → detect/classify command type
4. updateSessionStatus('running')
5. persistMessage() → save user message
6. getSystemPrompt() → load command-specific prompt
7. spawnAgentLoop() → async generator for streaming
8. Return sessionId immediately
```

**Streaming State Tracking**:
- Text accumulator for streaming content
- Pending tool calls array
- Error state tracking
- Persists messages at appropriate boundaries (before/after tool execution)

#### **2. Stream Routes (`server/src/routes/stream.ts`)**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/stream/:id` | SSE event stream |
| POST | `/api/stop/:id` | Abort running agent |
| GET | `/api/session/:id` | Get session info |
| PATCH | `/api/session/:id` | Update session title |
| GET | `/api/session/:id/messages` | Get conversation history |
| DELETE | `/api/session/:id` | Delete session |
| GET | `/api/sessions` | List all sessions (paginated) |

**SSE Streaming**:
```typescript
// Event types yielded:
- text_delta   → Streaming text content
- tool_call    → Tool execution started
- tool_result  → Tool execution completed
- usage        → Token usage data
- error        → Error occurred
- done         → Stream finished
```

**Session Listing**:
- Supports pagination via `limit` and `offset` query params
- Returns summaries with messageCount, totalTokens, preview text
- Sorted by creation date descending

#### **3. Plans Routes (`server/src/routes/plans.ts`)**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/plans` | List all plans |
| GET | `/api/plans/:filename` | Get specific plan |
| POST | `/api/plans` | Create new plan |
| PUT | `/api/plans/:filename` | Update existing plan |
| DELETE | `/api/plans/:filename` | Delete plan |

**Plan Storage**:
- Files stored in `.codepilot/plans/` within working directory
- Markdown format with YAML frontmatter
- Metadata: id, title, type (implementation/research/custom), sessionId, tags, timestamps

---

### **Session Management (`server/src/session.ts`)**

**Dual Storage Pattern**:
- **Memory Cache**: Active sessions with runtime objects (EventQueue, AbortController)
- **SQLite Persistence**: All sessions and messages for durability

**EventQueue Implementation**:
```typescript
class EventQueue {
  - Async iterable for SSE streaming
  - Producer/consumer pattern
  - Supports backpressure via resolver queue
  - Clean close semantics
}
```

**Session Lifecycle**:
1. `createSession()` → Generate ID, insert to DB, cache in memory
2. `getSession()` → Check cache, lazy-load from DB if needed
3. `prepareSessionForContinuation()` → Refresh runtime objects for new run
4. `deleteSession()` → Abort if running, remove from cache and DB

---

### **Agent Loop (`server/src/agent/loop.ts`)**

**Async Generator Pattern**:
```typescript
async function* runAgentLoop(config) {
  // Yields StreamEvent objects
  while (roundCount < MAX_TOOL_ROUNDS) {
    1. Check abort signal
    2. Stream LLM response
    3. Accumulate text and tool calls
    4. Yield text_delta events
    5. If tool calls → execute and add results to messages
    6. Continue loop or break if done
  }
}
```

**Tool Execution**:
- Finds tool by name from registry
- Executes handler with parsed input and context
- Returns `{ value, isError }` tuple
- Adds tool result to message history

**Safety**:
- Max 20 tool call rounds (prevents infinite loops)
- Abort signal checked before each LLM call and tool execution
- Graceful error handling with error events

---

### **Agent Commands (`server/src/agent/commands.ts`)**

**Command Types**:
| ID | Name | Description |
|----|------|-------------|
| chat | Chat | Default conversational mode |
| research | Research Codebase | Read-only exploration |
| create_plan | Create Plan | Generate implementation plan |
| revise_plan | Revise Plan | Modify existing plan |
| implement_simple | Implement (Simple) | Quick fixes/small features |
| implement_complex | Implement (Complex) | Execute multi-step plan |

**Command Resolution**:
1. Explicit selection from UI → use directly
2. Natural language detection → regex patterns
3. Classify generic "implement" → LLM-based classification (simple vs complex)

**Plan Integration**:
- `revise_plan` and `implement_complex` inject currentPlan into system prompt
- Plans stored in session DB column and as files

---

### **Database Schema (`server/src/db.ts`)**

**Sessions Table**:
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,           -- idle/running/completed/failed
  working_dir TEXT NOT NULL,
  title TEXT,
  total_tokens INTEGER DEFAULT 0,
  current_plan TEXT,              -- Active plan for session
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

**Messages Table**:
```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,             -- user/assistant/tool
  content TEXT,                   -- Text content or JSON array
  tool_call_id TEXT,              -- For tool result messages
  tool_calls TEXT,                -- JSON array of tool calls
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
)
```

**Conversion**:
- DB row format ↔ OpenAI ChatCompletionMessageParam format
- Handles string and array content
- Preserves tool call structure

---

### **Tools (`server/src/tools/`)**

**Available Tools**:
```typescript
// File operations
- read_file      → Read UTF-8 file
- write_file     → Create/overwrite file
- edit_file      → Search/replace edits
- list_dir       → List directory contents

// Search
- grep           → Text pattern search
- find_files     → Glob-based file finder

// Shell
- run_shell      → Execute shell commands

// Git
- git_status, git_diff, git_log
```

**Tool Definition Interface**:
```typescript
interface ToolDefinition {
  name: string
  description: string
  inputSchema: object              // JSON Schema
  handler: (input, context) => Promise<unknown>
}
```

**Safety Features**:
- Path resolution sandboxed to working directory
- Edit operations validate exact matches before replacing
- Multiple occurrence warnings

---

### **LLM Client (`server/src/llm-client.ts`)**

**Provider Priority**:
1. OpenRouter (if OPENROUTER_API_KEY set) → **Supports tool calling**
2. Anthropic direct (if ANTHROPIC_API_KEY set) → No tool support yet

**OpenRouter Configuration**:
```typescript
- Base URL: https://openrouter.ai/api/v1
- Default model: anthropic/claude-sonnet-4.5
- Streaming with tool calls
- Usage data included in final chunk
```

**Capabilities Check**:
```typescript
client.capabilities.tools → boolean
// Agent loop checks this before starting
```

---

### **Request/Response Flow Example**

**New Chat Request**:
```
POST /api/chat
{
  "message": "implement a login feature",
  "workingDir": "/path/to/project",
  "model": "anthropic/claude-sonnet-4.5",
  "command": null
}

↓

1. Command detection: "implement" → classify → implement_simple
2. Create session → session_abc123
3. Persist user message
4. Spawn agent loop (async)
5. Return immediately:
   {
     "sessionId": "session_abc123",
     "workingDir": "/path/to/project",
     "command": "implement_simple"
   }
```

**Client connects to SSE**:
```
GET /api/stream/session_abc123

↓ Events streamed:

event: text_delta
data: {"type":"text_delta","text":"I'll implement..."}

event: tool_call
data: {"type":"tool_call","toolCall":{...}}

event: tool_result
data: {"type":"tool_result","toolCall":{...}}

event: usage
data: {"type":"usage","usage":{"total_tokens":1234}}

event: done
data: {"type":"done"}
```

---

### **Key Architectural Patterns**

1. **Fire-and-Forget Execution**: POST /api/chat returns immediately, agent runs in background
2. **Event Queue Pattern**: Producer (agent loop) → Queue → Consumer (SSE stream)
3. **Dual Storage**: Memory cache + SQLite for performance + persistence
4. **Plugin Architecture**: Routes registered via Elysia's `.use()` 
5. **Type Safety**: Full TypeScript with OpenAI SDK types
6. **Streaming First**: All LLM interactions use streaming APIs
7. **Command System**: Specialized system prompts for different workflows
8. **Plan-Aware**: Sessions maintain current plan state for complex implementations

---

### **Error Handling**

- **Abort Signals**: Clean cancellation via AbortController
- **Tool Errors**: Caught and returned as error results, don't crash loop
- **Stream Errors**: Yield error event, close stream gracefully
- **Database Errors**: Wrapped in try/catch, log and continue
- **Max Rounds**: Safety limit prevents infinite tool loops

---

### **Notable Implementation Details**

- **Message Persistence Timing**: Carefully synchronized with streaming to avoid partial messages
- **Plan Extraction**: Regex-based detection of plan structure in responses
- **Tool Call Accumulation**: Handles streaming tool call deltas properly
- **Session Rehydration**: Can load completed sessions from DB and continue
- **Working Directory**: Defaults to PROJECT_ROOT env var, falls back to parent of cwd
- **CORS**: Configurable origin for frontend development
- **Pagination**: Sessions list supports limit/offset for large datasets

This is a well-architected real-time streaming AI agent system with robust state management and persistence!
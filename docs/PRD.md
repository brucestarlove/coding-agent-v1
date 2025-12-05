# Product Requirements Document: CodePilot
## A Self-Hosted TypeScript AI Coding Agent

**Version**: 1.0  
**Date**: December 5, 2025  
**Status**: Draft

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Vision](#product-vision)
3. [Technical Stack](#technical-stack)
4. [Architecture Overview](#architecture-overview)
5. [Core Requirements](#core-requirements)
6. [Development Phases](#development-phases)
7. [Success Criteria](#success-criteria)
8. [Reference Materials](#reference-materials)

---

## Executive Summary

CodePilot is a **self-hosted, AI-powered coding agent** that runs entirely on the end-user's device. It features a chat-based web interface for interacting with the agent, real-time streaming of tool calls and responses, and core coding capabilities including file editing and shell command execution.

### Key Differentiators

- **100% TypeScript** - Frontend and backend
- **Local-first** - Runs on localhost, no cloud dependencies
- **Streaming-native** - Tool calls stream live as the agent works
- **Custom harness** - No agent SDKs (Claude Code, Cursor, etc.)

---

## Product Vision

Build a **local-first AI coding assistant** that:

- Interacts via a chat UI in the browser (`localhost`)
- Uses LLMs (Anthropic Claude) to issue and explain tool actions
- Streams its work to the UI as it progresses — like a live debug theater
- Is fully implemented in TypeScript (frontend + backend)

> **Reference**: [PRD-draft.md](PRD-draft.md#about) - Original requirements specification

---

## Technical Stack

### Backend

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Runtime** | Node.js | Server execution environment |
| **Framework** | Elysia + @elysiajs/node | HTTP routing, SSE streaming, type safety |
| **LLM Client** | openai (OpenRouter) | Claude API via OpenRouter |
| **Streaming** | Server-Sent Events (SSE) | Real-time tool call updates |
| **Validation** | TypeBox (via Elysia) | Request/response schema validation |

> **Why Elysia?** See [ChatGPT-Elysia-Nodejs.md](ChatGPT-Elysia-Nodejs.md) for detailed comparison:
> - Native generator-based streaming (`yield sse()`)
> - End-to-end type safety with Eden
> - Clean plugin system for session management
> - First-class SSE helpers vs manual `res.write()`

### Frontend

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Framework** | React 19 + TypeScript | UI components |
| **State Management** | Zustand | Session and message state |
| **Styling** | Tailwind CSS | Rapid UI development |
| **Build Tool** | Vite | Fast development server |
| **Type-safe Client** | Eden (optional) | Auto-generated API client |

### Development Tools

| Tool | Purpose |
|------|---------|
| **tsx** | TypeScript execution with hot reload |
| **tsup** | ESM bundler for production builds |
| **TypeScript 5.x** | Type checking, strict mode |
| **pnpm** | Package management |

> **Reference**: [elysia-node.md](elysia-node.md) - Elysia + Node.js setup guide

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser (React + Zustand)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Chat UI      │  │ Tool Viewer  │  │ Session Controls       │ │
│  │ - Messages   │  │ - Bash       │  │ - Workflow selector    │ │
│  │ - Streaming  │  │ - Edit/Diff  │  │ - Stop/Interrupt       │ │
│  │ - Input      │  │ - Read/Write │  │ - Token usage          │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
│                              │                                   │
│                         EventSource (SSE)                        │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                 Elysia Server (localhost:3001)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Routes       │  │ Session      │  │ Tool                   │  │
│  │ - POST /chat │  │ Manager      │  │ Implementations        │  │
│  │ - GET /stream│  │ - Lifecycle  │  │ - read_file            │  │
│  │ - POST /stop │  │ - Events     │  │ - write_file           │  │
│  └──────────────┘  └──────────────┘  │ - list_dir             │  │
│                           │          │ - run_shell            │  │
│                    LLM Client        │                        │  │
│                           │          └────────────────────────┘  │
│                    OpenRouter API (openai SDK)                   │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    OpenRouter API                                 │
│              (anthropic/claude-sonnet-4.5or other models)      │
└──────────────────────────────────────────────────────────────────┘
```

> **Reference**: [CodeLayer-typescript-coding-agent-architecture.md](CodeLayer-typescript-coding-agent-architecture.md#architecture-recommendation) - Full architecture research

---

## Core Requirements

### CR-1: Tool Set

The agent must implement these core tools:

| Tool | Purpose | Input Schema |
|------|---------|--------------|
| `read_file` | Read file contents | `{ path: string }` |
| `write_file` | Create/overwrite file | `{ path: string, content: string }` |
| `list_dir` | List directory contents | `{ path: string }` |
| `run_shell` | Execute shell commands | `{ command: string, cwd?: string }` |

> **Reference**: [ChatGPT-Tools-v1.md](ChatGPT-Tools-v1.md#3-define-the-minimal-tool-set-typescript) - Tool implementation patterns

**Safety Requirements:**
- All file paths must be sandboxed to project root
- Shell commands must block obviously dangerous patterns (`rm -rf /`)
- Tool execution must be logged for audit

### CR-2: Streaming

The system MUST support streaming at multiple levels:

1. **LLM Token Streaming** - Assistant text streams as generated
2. **Tool Call Streaming** - Tool calls appear immediately when emitted
3. **Tool Result Streaming** - Shell stdout/stderr streams live
4. **Status Updates** - Session state changes stream to UI

> **Reference**: [elysia-aisdk.md](elysia-aisdk.md) - Elysia SSE streaming patterns

### CR-3: Agent Loop

The agent loop must:

1. Accept user message
2. Send to Claude with tool definitions
3. Stream assistant response
4. When `tool_use` detected → execute tool → return `tool_result`
5. Continue until Claude finishes (no more tool calls)
6. Support interruption at any point

> **Reference**: [ChatGPT-Tools-v1.md](ChatGPT-Tools-v1.md#42-handling-tool_use--tool_result--follow-up-claude-call) - Agent loop implementation

### CR-4: Web Interface

The chat UI must:

- Display user messages and assistant responses
- Show tool calls with inputs (inline preview)
- Show tool results with expandable output
- Support streaming text (character by character or chunk)
- Provide session controls (stop, clear, workflow selector)
- Auto-scroll with manual scroll override

> **Reference**: [PRD-draft.md](PRD-draft.md#tool-calling) - UI component architecture

---

## Development Phases

### Phase 0: Project Setup
**Duration**: 2-4 hours  
**Goal**: Establish project structure and development environment

#### Tasks

- [ ] Initialize monorepo structure (`/server`, `/client`)
- [ ] Configure TypeScript with strict mode
- [ ] Set up Elysia server with Node.js adapter
- [ ] Set up React + Vite frontend
- [ ] Configure Tailwind CSS
- [ ] Create `.env` handling for `OPENROUTER_API_KEY`
- [ ] Add development scripts (`dev`, `build`, `start`)

#### Project Structure

```
codepilot/
├── server/
│   ├── src/
│   │   ├── index.ts           # Elysia server entry
│   │   ├── types.ts           # Shared type definitions
│   │   ├── tools/
│   │   │   ├── index.ts       # Tool registry
│   │   │   ├── fileTools.ts   # read_file, write_file, list_dir
│   │   │   └── shellTool.ts   # run_shell
│   │   ├── agent/
│   │   │   ├── loop.ts        # Agent execution loop
│   │   │   └── claude.ts      # Anthropic client wrapper
│   │   └── routes/
│   │       ├── chat.ts        # Chat endpoints
│   │       └── stream.ts      # SSE streaming
│   ├── package.json
│   └── tsconfig.json
├── client/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── store/
│   │   │   └── useAgentStore.ts
│   │   ├── hooks/
│   │   │   ├── useSSE.ts
│   │   │   └── useAutoScroll.ts
│   │   └── components/
│   │       ├── ChatStream.tsx
│   │       ├── MessageBubble.tsx
│   │       ├── ToolCallView.tsx
│   │       ├── InputArea.tsx
│   │       └── SessionControls.tsx
│   ├── package.json
│   └── tsconfig.json
├── package.json               # Workspace root
├── pnpm-workspace.yaml
└── README.md
```

#### Reference Files

- [elysia-node.md](elysia-node.md) - Node.js adapter setup
- [elysia-cheatsheet.md](elysia-cheatsheet.md) - Basic Elysia patterns

#### Success Criteria

- [ ] `pnpm dev` starts both server (3001) and client (5173)
- [ ] Server responds to `GET /health`
- [ ] Client renders "Hello World"
- [ ] TypeScript compiles without errors

---

### Phase 1: Core Tools
**Duration**: 3-4 hours  
**Goal**: Implement file and shell tools with safety constraints

#### Tasks

- [ ] Define `ToolDefinition` interface
- [ ] Implement `read_file` tool
- [ ] Implement `write_file` tool
- [ ] Implement `list_dir` tool
- [ ] Implement `run_shell` tool with safety checks
- [ ] Add path sandboxing utility
- [ ] Create tool registry with lookup

#### Type Definitions

```typescript
// server/src/types.ts
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;  // JSON Schema
  handler: (input: Record<string, any>) => Promise<any>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
  status: 'pending' | 'completed' | 'error';
  result?: any;
  error?: string;
}
```

#### Reference Files

- [ChatGPT-Tools-v1.md](ChatGPT-Tools-v1.md#31-file-tools) - File tool implementations
- [ChatGPT-Tools-v1.md](ChatGPT-Tools-v1.md#32-shell-tool) - Shell tool with safety

#### Success Criteria

- [ ] `read_file` returns file contents
- [ ] `write_file` creates/overwrites files
- [ ] `list_dir` returns directory entries with types
- [ ] `run_shell` executes commands and returns stdout/stderr
- [ ] Path traversal attacks are blocked
- [ ] Dangerous shell commands are rejected

---

### Phase 2: LLM Integration (OpenRouter)
**Duration**: 3-4 hours  
**Goal**: Implement OpenRouter API client with streaming and tool handling

#### Tasks

- [ ] Set up OpenRouter client (using openai SDK)
- [ ] Create tool definitions for Claude API format
- [ ] Implement streaming message handling
- [ ] Parse `tool_use` content blocks
- [ ] Handle `tool_result` responses
- [ ] Implement basic agent loop (single turn)

#### Agent Loop Pattern

```typescript
// server/src/agent/loop.ts
export async function* runAgentLoop(
  messages: Message[],
  tools: ToolDefinition[]
): AsyncGenerator<StreamEvent> {
  while (true) {
    // 1. Call LLM with messages and tools (via OpenRouter)
    const stream = await openai.chat.completions.create({ stream: true, ...});
    
    // 2. Yield streaming events
    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        yield { type: 'text_delta', text: event.delta.text };
      }
      if (event.type === 'content_block_start' && 
          event.content_block.type === 'tool_use') {
        yield { type: 'tool_call', ...event.content_block };
      }
    }
    
    // 3. Check for tool calls
    const final = stream.getFinalMessage();
    const toolUses = final.content.filter(c => c.type === 'tool_use');
    
    if (toolUses.length === 0) break;  // Done
    
    // 4. Execute tools and continue
    for (const toolUse of toolUses) {
      const result = await executeToolHandler(toolUse);
      yield { type: 'tool_result', ...result };
      messages.push(...); // Add tool_use and tool_result
    }
  }
}
```

#### Reference Files

- [ChatGPT-Tools-v1.md](ChatGPT-Tools-v1.md#41-agent-loop-single-turn-with-streaming) - Claude streaming setup
- [ChatGPT-ts-impl.md](ChatGPT-ts-impl.md) - Session types and event handling

#### Success Criteria

- [ ] LLM responds to simple prompts via OpenRouter
- [ ] Text streams token by token
- [ ] Tool calls are detected and parsed
- [ ] Tool results are sent back to LLM
- [ ] Multi-turn tool conversations work

---

### Phase 3: SSE Streaming API
**Duration**: 2-3 hours  
**Goal**: Expose agent loop via SSE streaming endpoint

#### Tasks

- [ ] Create `/api/chat` POST endpoint to start conversation
- [ ] Create `/api/stream/:id` SSE endpoint
- [ ] Implement event broadcasting to connected clients
- [ ] Add session state management (in-memory)
- [ ] Implement `/api/stop/:id` to interrupt agent

#### Elysia SSE Pattern

```typescript
// server/src/routes/stream.ts
import { Elysia, sse } from 'elysia';

export const streamRoutes = new Elysia()
  .get('/api/stream/:id', async function* ({ params }) {
    const session = sessions.get(params.id);
    
    // Yield events from agent loop
    for await (const event of session.events) {
      yield sse({
        event: event.type,
        data: JSON.stringify(event)
      });
    }
    
    yield sse({ event: 'done' });
  });
```

#### Reference Files

- [elysia-aisdk.md](elysia-aisdk.md) - SSE streaming with `yield sse()`
- [ChatGPT-Elysia-Nodejs.md](ChatGPT-Elysia-Nodejs.md#4-native-generator-based-streaming) - Generator streaming

#### Success Criteria

- [ ] SSE endpoint streams events
- [ ] Text deltas arrive in real-time
- [ ] Tool calls appear immediately
- [ ] Tool results stream when complete
- [ ] Connection stays open during long operations

---

### Phase 4: Basic Chat UI
**Duration**: 4-5 hours  
**Goal**: Build functional chat interface with streaming

#### Tasks

- [ ] Create Zustand store for messages and session state
- [ ] Implement `useSSE` hook for EventSource connection
- [ ] Build `ChatStream` component for message list
- [ ] Build `MessageBubble` for user/assistant messages
- [ ] Build `InputArea` with send button
- [ ] Implement auto-scroll behavior
- [ ] Add loading states during agent work

#### Store Shape

```typescript
// client/src/store/useAgentStore.ts
interface AgentState {
  sessionId: string | null;
  messages: Message[];
  events: StreamEvent[];
  status: 'idle' | 'streaming' | 'error';
  
  // Actions
  sendMessage: (text: string) => Promise<void>;
  stopAgent: () => Promise<void>;
  clearSession: () => void;
}
```

#### Reference Files

- [ChatGPT-ts-impl.md](ChatGPT-ts-impl.md#4-react-frontend-with-workflow-dropdown) - Zustand store patterns
- [CodeLayer-typescript-coding-agent-architecture.md](CodeLayer-typescript-coding-agent-architecture.md#2-web-interface-architecture-from-humanlayer-wui) - React component patterns

#### Success Criteria

- [ ] Messages display in chat format
- [ ] Text streams character by character
- [ ] Input clears after send
- [ ] Auto-scroll follows new content
- [ ] Loading indicator during agent work

---

### Phase 5: Tool Call UI
**Duration**: 4-5 hours  
**Goal**: Rich tool call visualization with diff viewer

#### Tasks

- [ ] Build `ToolCallView` component with status indicator
- [ ] Implement tool-specific renderers:
  - [ ] `BashToolView` - command + output
  - [ ] `ReadToolView` - file path + content preview
  - [ ] `WriteToolView` - file path + content
  - [ ] `EditToolView` - diff viewer (if edit tool added)
- [ ] Add expand/collapse for long outputs
- [ ] Show pending state with pulse animation
- [ ] Display errors prominently

#### Component Architecture

```tsx
// Route to tool-specific renderer
function ToolCallView({ toolCall }: { toolCall: ToolCall }) {
  const Component = {
    'read_file': ReadToolView,
    'write_file': WriteToolView,
    'list_dir': ListDirToolView,
    'run_shell': BashToolView,
  }[toolCall.name] ?? GenericToolView;
  
  return (
    <div className={`tool-call ${toolCall.status}`}>
      <ToolHeader name={toolCall.name} status={toolCall.status} />
      <Component input={toolCall.input} result={toolCall.result} />
    </div>
  );
}
```

#### Reference Files

- [PRD-draft.md](PRD-draft.md#3-ui-component-architecture) - ToolCallView patterns
- [PRD-draft.md](PRD-draft.md#4-tool-specific-renderers) - Bash, Edit, Read components
- [PRD-draft.md](PRD-draft.md#5-css-for-tool-states) - Tool state styling

#### Success Criteria

- [ ] Tool calls show immediately when emitted
- [ ] Pending state shows loading animation
- [ ] Completed tools show results
- [ ] Long outputs are truncated with expand option
- [ ] Error states are clearly visible

### Phase 5.5: Extra Tools

## Current Tools

Your agent currently has 4 tools:
1. **`read_file`** - Read file contents
2. **`write_file`** - Create/overwrite entire files
3. **`list_dir`** - List directory contents
4. **`run_shell`** - Execute shell commands

## Recommended Additional Tools

### 1. **`edit_file` (Code Diff Tool)** - Most Important!

This is the big one you're asking about. Instead of overwriting entire files, this tool applies targeted edits:

```typescript
// Example tool definition
export const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description: 'Apply targeted edits to a file using search/replace blocks',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            old_text: { type: 'string', description: 'Text to find' },
            new_text: { type: 'string', description: 'Replacement text' },
          },
        },
      },
    },
    required: ['path', 'edits'],
  },
  async handler(input) {
    // Read file, apply edits, return diff
    const oldContent = await fs.readFile(path, 'utf8');
    let newContent = oldContent;
    for (const edit of edits) {
      newContent = newContent.replace(edit.old_text, edit.new_text);
    }
    await fs.writeFile(path, newContent);
    return { 
      path, 
      oldContent,  // For diff view
      newContent,
      success: true 
    };
  },
};
```

For the **UI diff view**, you'd add a new renderer in `ToolCallView.tsx` using a library like `diff` or `diff2html`:

```bash
pnpm add diff
```

```tsx
// EditFileToolView component
function EditFileToolView({ toolCall }) {
  const { oldContent, newContent, path } = toolCall.result;
  
  // Generate unified diff
  const diff = createPatch(path, oldContent, newContent);
  
  return (
    <div>
      <FilePath path={path} />
      <DiffViewer diff={diff} /> {/* Syntax-highlighted diff */}
    </div>
  );
}
```

---

### 2. **Search Tools**

| Tool | Purpose |
|------|---------|
| `grep` / `search_files` | Find text patterns across files (regex support) |
| `find_files` / `glob` | Find files by name pattern |

```typescript
// grep tool
{
  name: 'grep',
  input: { pattern: string, path?: string, regex?: boolean },
  returns: [{ file: string, line: number, content: string }]
}
```

---

### 3. **Git Tools**

| Tool | Purpose |
|------|---------|
| `git_status` | Show changed/staged files |
| `git_diff` | Show uncommitted changes |
| `git_commit` | Create commits |
| `git_log` | View commit history |

---

### 4. **File Management**

| Tool | Purpose |
|------|---------|
| `delete_file` | Remove files (with confirmation) |
| `move_file` | Move/rename files |
| `create_dir` | Create directories |

---

### 5. **Web/Research Tools**

| Tool | Purpose |
|------|---------|
| `web_search` | Search the internet |
| `fetch_url` | Read webpage content |

---

### 6. **Code Intelligence Tools**

| Tool | Purpose |
|------|---------|
| `find_definition` | Jump to symbol definition (LSP) |
| `find_references` | Find all references to symbol |
| `get_diagnostics` | Get TypeScript/linting errors |

---

## My Recommendation: Start with `edit_file`

The **`edit_file` tool with a diff viewer** is the highest-value addition because:

1. **Safer edits** - Targeted changes vs. overwriting entire files
2. **Better UX** - Users can see exactly what changed
3. **Smaller context** - LLM sends only the edits, not full file content
4. **Standard pattern** - This is what Cursor, Claude Code, and Aider all use


---

### Phase 6: Session Controls & Polish
**Duration**: 3-4 hours  
**Goal**: Add session management and UI polish

#### Tasks

- [ ] Add Stop button to interrupt running agent
- [ ] Add Clear button to reset session
- [ ] Display token usage (if available from API)
- [ ] Add session status indicator
- [ ] Implement error recovery UI
- [ ] Add keyboard shortcuts (Enter to send, Escape to stop)
- [ ] Polish visual design (colors, spacing, animations)

#### Optional Enhancements

- [ ] Workflow mode selector (chat, research, plan, implement)
- [ ] System prompt customization
- [ ] Model selector (anthropic/claude-sonnet-4.5, openai/gpt-4o, etc.)
- [ ] Working directory selector

#### Reference Files

- [ChatGPT-ts-impl.md](ChatGPT-ts-impl.md#4-react-frontend-with-workflow-dropdown) - Workflow selector
- [ChatGPT-ts-impl.md](ChatGPT-ts-impl.md#tokenusagebadge) - Token usage badge
- [PRD-draft.md](PRD-draft.md#6-three-level-expansion-pattern) - UI expansion patterns

#### Success Criteria

- [ ] Stop button interrupts agent mid-stream
- [ ] Session can be cleared and restarted
- [ ] Status is clearly communicated
- [ ] Keyboard navigation works
- [ ] UI feels polished and responsive

---

### Phase 6.5: SQLite Persistence Layer
**Duration**: 6-8 hours
**Goal**: Replace in-memory sessions with SQLite database for persistent conversations

#### Tasks

- [ ] Set up SQLite database with migration system
  - Choose SQLite library (better-sqlite3 for sync operations)
  - Create database schema for sessions and messages
  - Implement database initialization and migrations

- [ ] Design database schema
  ```sql
  -- Sessions table
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL, -- 'idle', 'running', 'completed', 'failed'
    working_dir TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
  );

  -- Messages table (stores conversation history)
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL, -- 'user', 'assistant', 'tool', 'system'
    content TEXT, -- Nullable for tool calls
    tool_call_id TEXT, -- For tool results
    tool_calls TEXT, -- JSON array for assistant tool calls
    created_at DATETIME NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
  ```

- [ ] Refactor session manager to use SQLite
  - Update `SessionState` interface to include database operations
  - Implement persistent `createSession()`, `getSession()`, `deleteSession()`
  - Add message persistence (save user messages, assistant responses, tool calls/results)
  - Maintain in-memory cache for active sessions with lazy loading

- [ ] Update agent loop to persist messages
  - Save user prompt when conversation starts
  - Persist assistant text deltas as they stream
  - Store tool calls and results in database
  - Ensure conversation continuity across restarts

- [ ] Add session listing and management
  - `GET /api/sessions` - List recent sessions with metadata
  - `GET /api/session/:id/messages` - Retrieve full conversation history
  - `DELETE /api/session/:id` - Clean up old sessions
  - Optional: Session export/import functionality

- [ ] Handle database errors gracefully
  - Fallback to in-memory mode if database fails
  - Log database errors without crashing agent
  - Implement database connection retry logic

#### Success Criteria

- [ ] Conversations persist across server restarts
- [ ] Full message history is retrievable for any session
- [ ] Database operations don't impact streaming performance
- [ ] Graceful degradation if database is unavailable
- [ ] Session listing shows recent conversations with status
- [ ] No data loss during normal operation

#### Benefits

- **Persistence**: Conversations survive server restarts
- **History**: Users can revisit past conversations
- **Scalability**: Multiple concurrent sessions without memory issues
- **Backup**: Database files can be easily backed up
- **Analytics**: Conversation data available for analysis

---

### Phase 7: Production Hardening
**Duration**: 6-8 hours  
**Goal**: Add robustness, reliability, and operational features for production use

#### 7.1 Error Handling & Retry Logic

- [ ] Implement retry policy for transient LLM API failures
  - Exponential backoff: 1s, 2s, 4s (max 3 attempts)
  - Distinguish retryable (5xx, timeout) vs non-retryable (4xx) errors
- [ ] Add circuit breaker for repeated failures
- [ ] Surface tool execution errors to LLM with structured format
- [ ] Graceful degradation when tools fail (continue conversation)
- [ ] Request timeout handling (30s default, configurable)

#### 7.2 Context Window Management

- [ ] Implement token counting (tiktoken or approximation)
- [ ] Track cumulative token usage per session
- [ ] Auto-truncation strategy when approaching context limit:
  - Preserve system prompt and recent N messages
  - Summarize older messages via LLM call
  - Or sliding window with configurable size
- [ ] Expose context usage in UI (e.g., "4,200 / 128,000 tokens")

#### 7.3 Streaming Robustness

- [ ] Add buffer timeout for incomplete streaming chunks (10s)
- [ ] Handle malformed JSON in tool call arguments gracefully
- [ ] Emit partial tool_call events during streaming (show tool name before args complete)
- [ ] Reconnection logic for dropped SSE connections
- [ ] Heartbeat/keepalive for long-running operations
- [ ] Fix concurrent SSE connections (implement proper event broadcasting/multicast)

#### 7.4 Security Hardening

- [ ] Rate limiting per session/IP
- [ ] Input sanitization for shell commands (beyond current blocklist)
- [ ] Audit logging for all tool executions
- [ ] Configurable tool allowlist/denylist
- [ ] File operation size limits (prevent reading huge files)
- [ ] Shell command timeout (default 60s)

#### 7.5 Observability

- [ ] Structured logging (JSON format for log aggregation)
- [ ] Request tracing with correlation IDs
- [ ] Metrics endpoint (`/metrics` for Prometheus)
  - Request latency histograms
  - Tool execution counts and durations
  - Token usage per model
  - Error rates by type
- [ ] Health check with dependency status

#### 7.6 Configuration & Operations

- [ ] Environment-based configuration (dev/staging/prod)
- [ ] Runtime config reload without restart
- [ ] Graceful shutdown (drain active sessions)
- [ ] Database/persistence layer for session history (optional)

#### Success Criteria

- [ ] Agent recovers from transient API failures automatically
- [ ] Long conversations don't exceed context limits
- [ ] Dropped connections reconnect seamlessly
- [ ] All tool executions are audit-logged
- [ ] Metrics available for monitoring dashboards

---

### Phase 8: Column + Row Layout System
**Duration**: 4-6 hours  
**Goal**: Build a flexible, composable layout system for complex UI arrangements

#### Motivation

As the application grows, users need more sophisticated layouts beyond a single chat column. This phase establishes the foundational layout primitives that enable:
- Sidebar navigation and tool panels
- Multi-column content arrangements
- Responsive designs that adapt to screen size
- Consistent spacing and alignment across the app

#### Tasks

- [ ] Create layout primitive components
  - [ ] `<Row>` - Horizontal flex container with gap/align options
  - [ ] `<Column>` - Vertical flex container with gap/justify options
  - [ ] `<Container>` - Max-width wrapper with responsive padding
  - [ ] `<Spacer>` - Flexible space filler (flex-grow)
- [ ] Implement CSS Grid-based `<Grid>` component
  - [ ] Support `cols` prop for column count
  - [ ] Auto-responsive mode with `minChildWidth`
  - [ ] Gap configuration (uniform or x/y)
- [ ] Add responsive breakpoint utilities
  - [ ] Define breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
  - [ ] Create `useBreakpoint()` hook for JS-based responsive logic
  - [ ] Support responsive props (e.g., `cols={{ base: 1, md: 2, lg: 3 }}`)
- [ ] Build app shell layout components
  - [ ] `<AppShell>` - Main app wrapper with optional sidebar/header slots
  - [ ] `<Sidebar>` - Collapsible side panel (left or right)
  - [ ] `<MainContent>` - Scrollable main area with max-width constraint
- [ ] Add layout debugging utilities
  - [ ] Debug mode that shows layout boundaries
  - [ ] Spacing visualization overlay

#### Component Architecture

```tsx
// Layout primitives with typed props
interface RowProps {
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  wrap?: boolean;
  children: React.ReactNode;
}

function Row({ gap = 'md', align = 'stretch', justify = 'start', wrap, children }: RowProps) {
  return (
    <div className={cn(
      'flex',
      gapClasses[gap],
      alignClasses[align],
      justifyClasses[justify],
      wrap && 'flex-wrap'
    )}>
      {children}
    </div>
  );
}

// App shell with sidebar
interface AppShellProps {
  sidebar?: React.ReactNode;
  sidebarWidth?: number;        // pixels, default 280
  sidebarCollapsible?: boolean;
  header?: React.ReactNode;
  children: React.ReactNode;
}

function AppShell({ sidebar, sidebarWidth = 280, header, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  
  return (
    <div className="h-screen flex flex-col">
      {header && <header className="flex-none border-b">{header}</header>}
      <div className="flex-1 flex overflow-hidden">
        {sidebar && (
          <aside 
            className="flex-none border-r overflow-y-auto transition-all"
            style={{ width: collapsed ? 0 : sidebarWidth }}
          >
            {sidebar}
          </aside>
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
```

#### Directory Structure

```
client/src/
├── components/
│   └── layout/
│       ├── index.ts          # Barrel export
│       ├── Row.tsx           # Horizontal flex
│       ├── Column.tsx        # Vertical flex
│       ├── Grid.tsx          # CSS Grid wrapper
│       ├── Container.tsx     # Max-width container
│       ├── Spacer.tsx        # Flex spacer
│       ├── AppShell.tsx      # Main app layout
│       ├── Sidebar.tsx       # Collapsible sidebar
│       └── MainContent.tsx   # Scrollable content area
├── hooks/
│   └── useBreakpoint.ts      # Responsive hook
└── styles/
    └── layout.css            # Layout-specific utilities
```

#### Success Criteria

- [ ] Layout components compose without CSS conflicts
- [ ] Responsive breakpoints work consistently
- [ ] Sidebar collapses/expands smoothly (300ms transition)
- [ ] No horizontal overflow at any viewport size
- [ ] Layout debug mode clearly shows component boundaries
- [ ] App shell properly contains scrollable regions (no body scroll)

---

### Phase 8.5: Split Pane / Two-Column Agent Chats
**Duration**: 8-10 hours  
**Goal**: Enable side-by-side agent chat sessions for comparison, parallel work, and collaborative workflows

#### Motivation

Power users often want to:
- Compare outputs from different prompts or models
- Run parallel research tasks simultaneously
- Keep a reference conversation while working on another
- Test prompt variations side-by-side

This phase builds on the layout system to enable multi-pane agent interactions.

#### Tasks

- [ ] Build resizable split pane component
  - [ ] `<SplitPane>` with draggable divider
  - [ ] Horizontal (side-by-side) and vertical (stacked) orientations
  - [ ] Min/max constraints per pane
  - [ ] Persist pane sizes to localStorage
  - [ ] Double-click divider to reset to 50/50
- [ ] Implement multi-session management
  - [ ] Extend Zustand store to support multiple concurrent sessions
  - [ ] Session registry with unique IDs per pane
  - [ ] Independent message histories per session
  - [ ] Shared vs isolated tool execution contexts
- [ ] Create pane management UI
  - [ ] "Split" button to create new pane
  - [ ] "Close pane" button (with confirmation if session active)
  - [ ] Pane focus indicator (subtle border highlight)
  - [ ] Drag-and-drop to reorder panes
- [ ] Add pane synchronization features (optional)
  - [ ] "Mirror input" mode - type once, send to both
  - [ ] "Compare mode" - highlight differences in responses
  - [ ] Shared working directory toggle
- [ ] Handle multiple SSE connections
  - [ ] Connection pooling for concurrent streams
  - [ ] Visual indicator showing which pane is streaming
  - [ ] Graceful handling of connection limits
- [ ] Keyboard navigation
  - [ ] `Cmd/Ctrl + 1/2/3` to focus pane
  - [ ] `Cmd/Ctrl + \` to toggle split
  - [ ] `Cmd/Ctrl + W` to close focused pane

#### Store Architecture

```typescript
// client/src/store/useMultiAgentStore.ts
interface PaneState {
  id: string;
  sessionId: string | null;
  messages: Message[];
  events: StreamEvent[];
  status: 'idle' | 'streaming' | 'error';
  workingDir: string;
  modelOverride?: string;  // Optional per-pane model
}

interface MultiAgentState {
  panes: Record<string, PaneState>;
  paneOrder: string[];           // Order for rendering
  focusedPaneId: string | null;
  layout: 'single' | 'horizontal' | 'vertical';
  paneSizes: number[];           // Percentages
  
  // Actions
  createPane: () => string;
  closePane: (paneId: string) => void;
  focusPane: (paneId: string) => void;
  setPaneLayout: (layout: 'single' | 'horizontal' | 'vertical') => void;
  resizePanes: (sizes: number[]) => void;
  
  // Per-pane actions
  sendMessage: (paneId: string, text: string) => Promise<void>;
  stopAgent: (paneId: string) => Promise<void>;
  clearSession: (paneId: string) => void;
}
```

#### Component Architecture

```tsx
// SplitPane with resizable divider
interface SplitPaneProps {
  orientation: 'horizontal' | 'vertical';
  sizes: number[];              // Percentages [40, 60]
  minSize?: number;             // Minimum pane size in pixels
  onResize: (sizes: number[]) => void;
  children: React.ReactNode[];  // Exactly 2 children for now
}

function SplitPane({ orientation, sizes, minSize = 200, onResize, children }: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  
  const handleMouseDown = () => setDragging(true);
  
  useEffect(() => {
    if (!dragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      const pos = orientation === 'horizontal' 
        ? (e.clientX - rect.left) / rect.width
        : (e.clientY - rect.top) / rect.height;
      
      const clamped = Math.max(0.2, Math.min(0.8, pos)); // 20-80% range
      onResize([clamped * 100, (1 - clamped) * 100]);
    };
    
    const handleMouseUp = () => setDragging(false);
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, orientation, onResize]);
  
  return (
    <div 
      ref={containerRef}
      className={cn('flex h-full', orientation === 'vertical' && 'flex-col')}
    >
      <div style={{ flexBasis: `${sizes[0]}%` }} className="overflow-hidden">
        {children[0]}
      </div>
      
      <div 
        onMouseDown={handleMouseDown}
        className={cn(
          'flex-none bg-gray-200 hover:bg-blue-400 transition-colors',
          orientation === 'horizontal' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
          dragging && 'bg-blue-500'
        )}
      />
      
      <div style={{ flexBasis: `${sizes[1]}%` }} className="overflow-hidden">
        {children[1]}
      </div>
    </div>
  );
}

// Multi-pane chat container
function MultiPaneChat() {
  const { panes, paneOrder, layout, paneSizes, focusedPaneId, focusPane, resizePanes } = useMultiAgentStore();
  
  if (layout === 'single' || paneOrder.length === 1) {
    const paneId = paneOrder[0];
    return <ChatPane paneId={paneId} pane={panes[paneId]} focused />;
  }
  
  return (
    <SplitPane 
      orientation={layout} 
      sizes={paneSizes}
      onResize={resizePanes}
    >
      {paneOrder.slice(0, 2).map(paneId => (
        <ChatPane 
          key={paneId}
          paneId={paneId}
          pane={panes[paneId]}
          focused={paneId === focusedPaneId}
          onFocus={() => focusPane(paneId)}
        />
      ))}
    </SplitPane>
  );
}
```

#### Visual Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CodePilot                               [Single] [Split ▼]  [Settings] │
├─────────────────────────────┬───┬───────────────────────────────────────┤
│  Session 1                  │ ║ │  Session 2                            │
│  ┌───────────────────────┐  │ ║ │  ┌───────────────────────────────┐   │
│  │ User: Explain this    │  │ ║ │  │ User: Refactor this code      │   │
│  │ code in utils.ts      │  │ ║ │  │ using functional patterns     │   │
│  └───────────────────────┘  │ ║ │  └───────────────────────────────┘   │
│  ┌───────────────────────┐  │ ║ │  ┌───────────────────────────────┐   │
│  │ Assistant: This code  │  │ ║ │  │ Assistant: I'll convert the   │   │
│  │ defines a helper...   │  │ ║ │  │ imperative loops to map/...   │   │
│  │ ░░░░ streaming        │  │ ║ │  └───────────────────────────────┘   │
│  └───────────────────────┘  │◀║▶│  ┌───────────────────────────────┐   │
│                             │ ║ │  │ 🔧 write_file                 │   │
│                             │ ║ │  │    utils.ts (refactored)      │   │
│                             │ ║ │  └───────────────────────────────┘   │
│  ┌───────────────────────┐  │ ║ │  ┌───────────────────────────────┐   │
│  │ Type a message...     │  │ ║ │  │ Type a message...             │   │
│  │                  [⏹]  │  │ ║ │  │                          [➤]  │   │
│  └───────────────────────┘  │ ║ │  └───────────────────────────────┘   │
├─────────────────────────────┴───┴───────────────────────────────────────┤
│  Pane 1: streaming • Pane 2: idle          [+ New Pane] [Compare Mode]  │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Success Criteria

- [ ] Split pane divider is draggable with smooth resize
- [ ] Each pane maintains independent session state
- [ ] Multiple panes can stream simultaneously without interference
- [ ] Pane sizes persist across page reloads
- [ ] Keyboard shortcuts navigate between panes
- [ ] Closing a pane with active session prompts confirmation
- [ ] Mobile/narrow viewport gracefully degrades to tabbed view
- [ ] No memory leaks when opening/closing many panes

---

## Success Criteria (Overall)

### Functional Requirements

| Requirement | Validation |
|-------------|------------|
| Agent edits files | Create and modify a test file via chat |
| Agent runs shell commands | Execute `ls`, `cat`, `echo` via agent |
| Text streams live | Characters appear progressively, not all at once |
| Tool calls stream | Tool calls appear before execution completes |
| Works with API key only | No other paid services required |

### Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| First response time | < 2 seconds after user message |
| Stream latency | < 100ms between token generation and UI |
| Error recovery | Graceful handling, clear error messages |
| TypeScript coverage | 100% (no `any` types in production code) |

### Demo Scenarios

1. **File Creation**: "Create a new file called `hello.ts` with a function that returns 'Hello World'"
2. **File Reading**: "Read the contents of `package.json` and summarize what this project does"
3. **Shell Command**: "Run `ls -la` and tell me how many files are in this directory"
4. **Multi-step Task**: "Create a new TypeScript function in `utils.ts`, then show me its contents"

---

## Reference Materials

### Primary References

| File | Content | Phase Relevance |
|------|---------|-----------------|
| [PRD-draft.md](PRD-draft.md) | Original requirements, tool call UI patterns | All |
| [ChatGPT-Tools-v1.md](ChatGPT-Tools-v1.md) | Minimal v1 approach, tool implementations | 1, 2 |
| [ChatGPT-ts-impl.md](ChatGPT-ts-impl.md) | Session management, workflow modes | 2, 4, 6 |
| [CodeLayer-typescript-coding-agent-architecture.md](CodeLayer-typescript-coding-agent-architecture.md) | Full architecture research | All |

### Elysia References

| File | Content | Phase Relevance |
|------|---------|-----------------|
| [ChatGPT-Elysia-Nodejs.md](ChatGPT-Elysia-Nodejs.md) | Why Elysia, feature comparison | 0 |
| [elysia-node.md](elysia-node.md) | Node.js adapter setup | 0 |
| [elysia-cheatsheet.md](elysia-cheatsheet.md) | Quick patterns reference | 0, 3 |
| [elysia-aisdk.md](elysia-aisdk.md) | AI SDK integration, SSE | 3 |
| [elysia-route.md](elysia-route.md) | Routing patterns | 3 |
| [elysia-handler.md](elysia-handler.md) | Handler patterns | 3 |
| [elysia-life-cycle.md](elysia-life-cycle.md) | Lifecycle hooks | 3 |
| [elysia-extends-context.md](elysia-extends-context.md) | Context extension | 3 |

### Extended Documentation

| File | Content | When to Use |
|------|---------|-------------|
| [elysia-llms.txt](elysia-llms.txt) | Elysia condensed docs | Quick lookup |
| [elysia-llms-full.txt](elysia-llms-full.txt) | Complete Elysia docs | Deep dive |

---

## Appendix A: Type Definitions

Core types shared between server and client:

```typescript
// Shared types (server/src/types.ts)

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  timestamp: Date;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, any>;
  content?: string;
  is_error?: boolean;
}

export interface StreamEvent {
  type: 'text_delta' | 'tool_call' | 'tool_result' | 'error' | 'done';
  text?: string;
  toolCall?: ToolCall;
  error?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
  status: 'pending' | 'completed' | 'error';
  result?: any;
  error?: string;
}

export interface Session {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  messages: Message[];
  createdAt: Date;
  workingDir: string;
}
```

---

## Appendix B: API Endpoints

| Method | Endpoint | Description | Request | Response |
|--------|----------|-------------|---------|----------|
| POST | `/api/chat` | Start conversation | `{ message: string, workingDir?: string }` | `{ sessionId: string }` |
| GET | `/api/stream/:id` | Stream events (SSE) | - | SSE stream |
| POST | `/api/stop/:id` | Interrupt agent | - | `{ success: boolean }` |
| GET | `/api/session/:id` | Get session state | - | `Session` |
| DELETE | `/api/session/:id` | Clear session | - | `{ success: boolean }` |

---

## Appendix C: Environment Variables

```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-...

# Optional
PORT=3001                              # Server port (default: 3001)
PROJECT_ROOT=/path/to/dir              # Sandbox root (default: cwd)
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5  # Model (default: anthropic/claude-sonnet-4.5)
MAX_TOKENS=4096                        # Max response tokens (default: 4096)
```

---

## Appendix D: Estimated Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 0: Project Setup | 2-4 hours | 2-4 hours |
| Phase 1: Core Tools | 3-4 hours | 5-8 hours |
| Phase 2: Claude Integration | 3-4 hours | 8-12 hours |
| Phase 3: SSE Streaming API | 2-3 hours | 10-15 hours |
| Phase 4: Basic Chat UI | 4-5 hours | 14-20 hours |
| Phase 5: Tool Call UI | 4-5 hours | 18-25 hours |
| Phase 6: Polish & Controls | 3-4 hours | 21-29 hours |
| Phase 6.5: SQLite Persistence | 6-8 hours | 27-37 hours |
| Phase 7: Production Hardening | 6-8 hours | 33-45 hours |
| Phase 8: Column + Row Layouts | 4-6 hours | 37-51 hours |
| Phase 8.5: Split Pane Agent Chats | 8-10 hours | 45-61 hours |

**MVP (Phases 0-4)**: 14-20 hours (2-3 days of focused work)  
**Full UI (Phases 4-6)**: 27-37 hours (4-5 days of focused work)  
**Production-Ready (Phases 6-7)**: 33-45 hours (5-6 days of focused work)  
**Advanced UI (Phases 8-8.5)**: 45-61 hours (6-8 days of focused work)

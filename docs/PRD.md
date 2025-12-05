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

**Total Estimated Time**: 21-29 hours (3-4 days of focused work)

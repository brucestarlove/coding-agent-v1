---
date: 2025-12-05T01:51:02Z
researcher: Claude
git_commit: 87c74050fc6a64cf0da6d9969aaf4516e17a5c20
branch: feat/help
repository: humanlayer-help
topic: "TypeScript-only AI Coding Agent Architecture Research"
tags: [research, codebase, typescript, ai-agent, streaming, web-interface, mcp]
status: complete
last_updated: 2025-12-04
last_updated_by: Claude
---
# Research: TypeScript-only AI Coding Agent Architecture
**Date**: 2025-12-05T01:51:02Z
**Researcher**: Claude
**Git Commit**: 87c74050fc6a64cf0da6d9969aaf4516e17a5c20
**Branch**: feat/help
**Repository**: humanlayer-help
## Research Question
How to implement a TypeScript-only AI coding agent with a web interface that supports streaming tool calls, based on patterns from the HumanLayer codebase.
## Summary
This codebase provides extensive reference implementations for building a TypeScript AI coding agent with streaming capabilities:
1. **Agent Harness**: The `claudecode-go` package demonstrates session management, process spawning, and streaming event parsing that can be ported to TypeScript
2. **Web Interface**: The `humanlayer-wui` React application shows real-time streaming via Server-Sent Events (SSE) with Zustand state management
3. **Communication Layer**: Multiple patterns exist - JSON-RPC over Unix sockets (hlyr), SSE over HTTP (WUI), and MCP over stdio
4. **TypeScript SDK**: The `hld/sdk/typescript` provides a complete REST+SSE client implementation
The recommended architecture for a TypeScript-only agent:
- **Backend**: Node.js server using child_process to spawn Claude CLI with streaming JSON output
- **Communication**: SSE for real-time tool call streaming to browser
- **Frontend**: React with Zustand for state management and auto-scrolling chat interface
## Detailed Findings
### 1. Claude Code Process Management (from claudecode-go)
The Go SDK at `/Users/bdr/Git/humanlayer-help/claudecode-go/client.go` provides the authoritative pattern for launching and managing Claude Code sessions.
**Key Implementation Details:**
**Process Launch Pattern** (`client.go:313-419`):
```typescript
// TypeScript equivalent pattern
import { spawn } from 'child_process';
interface SessionConfig {
  query: string;
  model?: 'opus' | 'sonnet' | 'haiku';
  outputFormat?: 'text' | 'json' | 'stream-json';
  workingDir?: string;
  mcpConfig?: MCPConfig;
  maxTurns?: number;
  systemPrompt?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
}
function launchSession(config: SessionConfig): Session {
  const args = buildArgs(config);
  const proc = spawn('claude', args, {
    cwd: config.workingDir,
    env: { ...process.env, ...config.env }
  });
  // Setup stdout/stderr handling
}
```
**CLI Argument Construction** (`client.go:182-311`):
- Arguments must be in specific order
- Query MUST use `--print -- <query>` pattern to handle dash-prefixed queries
- MCP config passed via temp file (`--mcp-config <path>`)
- Critical flags: `--output-format stream-json --verbose` for streaming
**Streaming JSON Parsing** (`client.go:461-543`):
- Line-delimited JSON (newline-separated)
- 10MB buffer size for large file contents
- Parse each line as `StreamEvent` object
- Events include: system, assistant, user, result types
**Event Types** (`types.go:75-280`):
```typescript
interface StreamEvent {
  type: 'system' | 'assistant' | 'user' | 'result';
  subtype?: string;
  sessionId?: string;
  message?: Message;
  // System init fields
  cwd?: string;
  model?: string;
  // Result fields
  costUsd?: number;
  isError?: boolean;
  durationMs?: number;
  result?: string;
  usage?: Usage;
}
interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: Content[];
}
interface Content {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;      // tool_use_id
  name?: string;    // tool name
  input?: any;      // tool input
}
```
### 2. Web Interface Architecture (from humanlayer-wui)
The WUI at `/Users/bdr/Git/humanlayer-help/humanlayer-wui/` demonstrates a production React chat interface.
**Technology Stack** (`package.json`):
- React 19.1.0 with React Router 7.6.3
- Zustand 5.0.5 for state management
- Tailwind CSS 4.1.10 for styling
- Vite 6.3.5 for build tooling
- TipTap for rich text editing
**State Management** (`AppStore.ts:21-1192`):
```typescript
// Zustand store pattern
interface AppState {
  sessions: Session[];
  activeSessionDetail: SessionDetail | null;
  isRefreshing: boolean;
  // Actions
  refreshSessions: () => Promise<void>;
  updateSessionOptimistic: (id: string, updates: Partial<Session>) => Promise<void>;
}
const useAppStore = create<AppState>((set, get) => ({
  sessions: [],
  activeSessionDetail: null,
  refreshSessions: async () => {
    set({ isRefreshing: true });
    const sessions = await httpClient.getSessionLeaves();
    set({ sessions, isRefreshing: false });
  },
}));
```
**Chat Stream Component** (`ConversationStream.tsx:17-260`):
- Polls conversation events every 1000ms
- Implements auto-scrolling via `useAutoScroll` hook
- Groups related tool calls via `useTaskGrouping` hook
- Renders different event types (messages, tool calls, results)
**Auto-Scroll Implementation** (`useAutoScroll.ts`):
- Tracks if user is at bottom of scroll container
- Auto-scrolls on new content only if already at bottom
- Preserves scroll position when user scrolls up
### 3. Communication Patterns
Three communication patterns are used across the codebase:
**A. Server-Sent Events (SSE) - Recommended for Web UI**
Implementation at `/Users/bdr/Git/humanlayer-help/hld/api/handlers/sse.go:42-98`:
```typescript
// Server-side (Node.js/Express)
app.get('/api/stream/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const sendEvent = (event: StreamEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  // 30-second keepalive
  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);
  req.on('close', () => clearInterval(keepalive));
});
```
Client implementation at `/Users/bdr/Git/humanlayer-help/hld/sdk/typescript/src/client.ts:346-427`:
```typescript
// Client-side (Browser)
async subscribeToEvents(
  filters: { sessionId?: string },
  handlers: {
    onConnect?: () => void;
    onMessage?: (event: StreamEvent) => void;
    onError?: (error: Error) => void;
    onDisconnect?: () => void;
  }
): Promise<() => void> {
  const url = `${this.baseUrl}/stream/events?session_id=${filters.sessionId}`;
  const eventSource = new EventSource(url);
  eventSource.onopen = () => handlers.onConnect?.();
  eventSource.onmessage = (e) => {
    const event = JSON.parse(e.data);
    handlers.onMessage?.(event);
  };
  eventSource.onerror = (e) => handlers.onError?.(e);
  return () => eventSource.close();
}
```
**B. JSON-RPC over Unix Sockets (hlyr daemon communication)**
Implementation at `/Users/bdr/Git/humanlayer-help/hlyr/src/daemonClient.ts`:
- Newline-delimited JSON protocol
- Request-response with ID matching
- Subscription pattern for event streaming
**C. MCP over stdio (Claude Code integration)**
Implementation at `/Users/bdr/Git/humanlayer-help/hlyr/src/mcp.ts`:
- Uses `@modelcontextprotocol/sdk` package
- StdioServerTransport for stdio communication
- Tool registration via schemas
### 4. TypeScript SDK Patterns (from hld/sdk/typescript)
The HLD TypeScript SDK at `/Users/bdr/Git/humanlayer-help/hld/sdk/typescript/` provides reference patterns.
**HTTP Client Pattern** (`client.ts:49-88`):
```typescript
export class HLDClient {
  private baseUrl: string;
  private headers?: Record<string, string>;
  constructor(options: HLDClientOptions) {
    this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:7777/api/v1';
    this.headers = options.headers;
  }
  async request<T>(method: string, path: string, body?: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...this.headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}
```
**Build Configuration** (`tsconfig.json`):
- Target: ES2020
- Module: ES2020 (pure ESM)
- Strict mode enabled
- Declaration files generated
### 5. Tool Implementation Patterns
**Tool Call Structure** (from conversation events):
```typescript
interface ToolCall {
  type: 'tool_use';
  id: string;           // tool_use_id
  name: string;         // e.g., 'Bash', 'Edit', 'Read'
  input: {
    command?: string;   // For Bash
    file_path?: string; // For Read/Edit/Write
    old_string?: string;
    new_string?: string;
    content?: string;
  };
}
interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}
```
**Built-in Claude Code Tools**:
- `Bash` - Shell command execution
- `Read` - File reading
- `Write` - File creation
- `Edit` - File editing (old_string → new_string replacement)
- `Glob` - File pattern matching
- `Grep` - Content search
- `Task` - Subagent spawning
## Architecture Recommendation
### Recommended Stack for TypeScript-Only Agent
```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Chat UI     │  │ Tool Viewer │  │ File Explorer   │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│                         │                                │
│                    EventSource (SSE)                     │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Node.js Server (localhost:3000)             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Express/    │  │ Session     │  │ Event           │  │
│  │ Fastify     │  │ Manager     │  │ Broadcaster     │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│                         │                                │
│                  child_process.spawn                     │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                Claude CLI (subprocess)                   │
│         --output-format stream-json --verbose           │
└─────────────────────────────────────────────────────────┘
```
### Key Implementation Files
**Backend (Node.js)**:
```
server/
├── index.ts              # Express server entry
├── session/
│   ├── manager.ts        # Session lifecycle management
│   ├── launcher.ts       # Claude CLI spawning
│   └── parser.ts         # Stream JSON parsing
├── api/
│   ├── routes.ts         # REST endpoints
│   └── sse.ts            # SSE event streaming
└── types.ts              # Shared type definitions
```
**Frontend (React)**:
```
client/
├── App.tsx
├── store/
│   └── useAgentStore.ts  # Zustand store
├── hooks/
│   ├── useSession.ts     # Session management
│   ├── useSSE.ts         # SSE subscription
│   └── useAutoScroll.ts  # Scroll behavior
└── components/
    ├── ChatStream.tsx    # Message list
    ├── ToolCallView.tsx  # Tool call rendering
    └── InputArea.tsx     # User input
```
### Critical Implementation Details
1. **Streaming Tool Calls**: Parse `tool_use` content blocks as they arrive in assistant messages
2. **Buffer Size**: Configure 10MB buffer for readline to handle large file contents
3. **Keepalive**: Send SSE keepalive every 30 seconds to prevent connection drops
4. **Error Handling**: Distinguish expected pipe closures from actual errors
5. **Query Escaping**: Always use `--print -- <query>` pattern for Claude CLI
## Code References
- Claude CLI launch pattern: `claudecode-go/client.go:313-419`
- Streaming JSON parser: `claudecode-go/client.go:461-543`
- Event types: `claudecode-go/types.go:75-280`
- SSE server handler: `hld/api/handlers/sse.go:42-98`
- SSE client: `hld/sdk/typescript/src/client.ts:346-427`
- Chat stream component: `humanlayer-wui/src/components/internal/ConversationStream/ConversationStream.tsx:17-260`
- Zustand store: `humanlayer-wui/src/AppStore.ts:21-1192`
- MCP server: `hlyr/src/mcp.ts:19-191`
- JSON-RPC client: `hlyr/src/daemonClient.ts:110-425`
## Architecture Documentation
### Existing Patterns in Codebase
| Component | Pattern | Location |
|-----------|---------|----------|
| Process Management | spawn + pipe parsing | claudecode-go/client.go |
| State Management | Zustand with optimistic updates | humanlayer-wui/src/AppStore.ts |
| Real-time Updates | SSE + EventSource | hld/sdk/typescript/src/client.ts |
| Event Bus | Pub/sub with filtering | hld/bus/events.go |
| Tool Definitions | JSON Schema | hlyr/src/mcp.ts:52-60 |
### Data Flow
1. User sends message via React UI
2. Frontend POSTs to `/api/sessions/{id}/continue`
3. Backend spawns/continues Claude CLI session
4. Claude CLI outputs stream-json to stdout
5. Backend parses events and broadcasts via SSE
6. Frontend EventSource receives events
7. Zustand store updates, React re-renders
## Historical Context (from thoughts/)
No existing research documents found directly related to this topic.
## Related Research
This is foundational research for implementing a standalone TypeScript coding agent.
## Open Questions
1. **MCP Integration**: Should the TypeScript agent support MCP servers for extensibility?
2. **Persistence**: Should session state be persisted to disk (SQLite) or kept in-memory?
3. **Multi-session**: Should the server support multiple concurrent sessions?
4. **Authentication**: Is auth needed for localhost-only deployment?
5. **Custom Tools**: Should users be able to define custom tools beyond Claude's built-ins?




## Research Complete

I've analyzed this codebase to document the architecture patterns relevant to implementing a TypeScript-only AI coding agent with a web interface. Here's the summary:

### Key Findings

**1. Claude Code Process Management** (`claudecode-go/`)
- The Go SDK shows how to spawn Claude CLI with `--output-format stream-json --verbose`
- Streaming JSON is line-delimited (newline-separated)
- Requires 10MB buffer size for large file contents
- Critical: Use `--print -- <query>` to handle dash-prefixed queries

**2. Web Interface** (`humanlayer-wui/`)
- React 19 + Zustand 5 + Tailwind CSS + Vite
- Chat stream with 1000ms polling for conversation events
- Auto-scroll behavior preserving user scroll position
- Optimistic updates with server confirmation

**3. Streaming Communication** - Three patterns exist:
- **SSE (Recommended for web)**: `hld/api/handlers/sse.go` + `hld/sdk/typescript/src/client.ts`
- **JSON-RPC over Unix sockets**: `hlyr/src/daemonClient.ts`
- **MCP over stdio**: `hlyr/src/mcp.ts`

**4. TypeScript SDK** (`hld/sdk/typescript/`)
- Pure ESM output (ES2020)
- SSE client with EventSource
- REST client with middleware pipeline

### Recommended Architecture

```
Browser (React + Zustand)
        │
   EventSource (SSE)
        │
        ▼
Node.js Server (Express/Fastify)
        │
  child_process.spawn
        │
        ▼
Claude CLI (--output-format stream-json)
```

### Key Files for Reference

| Pattern | File |
|---------|------|
| Process spawning | `claudecode-go/client.go:313-419` |
| Stream JSON parsing | `claudecode-go/client.go:461-543` |
| Event types | `claudecode-go/types.go:75-280` |
| SSE server | `hld/api/handlers/sse.go:42-98` |
| SSE client | `hld/sdk/typescript/src/client.ts:346-427` |
| Chat component | `humanlayer-wui/src/components/internal/ConversationStream/ConversationStream.tsx` |
| Zustand store | `humanlayer-wui/src/AppStore.ts` |

Full research document written to:
`thoughts/shared/research/2025-12-04-typescript-coding-agent-architecture.md`





---

Based on the research, here's a detailed implementation guide for a TypeScript AI coding agent with robust error handling and workflow modes:

## Detailed TypeScript Agent Implementation

### 1. Core Types and Configuration

```typescript
// types.ts

// Session states (from hld/session/types.go:19-29)
export type SessionStatus = 
  | 'draft'
  | 'starting' 
  | 'running'
  | 'waiting_input'
  | 'interrupting'
  | 'interrupted'
  | 'completed'
  | 'failed';

// Workflow modes for your dropdown
export type WorkflowMode = 
  | 'chat'           // Default conversational mode
  | 'research'       // Investigate codebase, gather information
  | 'plan'           // Create implementation plan
  | 'review_plan'    // Review and validate existing plan
  | 'implement';     // Execute plan step by step

// Token tracking (from hld/session/manager.go:966-976)
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  effectiveContextTokens: number; // This is what fills context window
}

// Model limits (from hld/rpc/types_constants.go:84-96)
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'opus': 200000,
  'sonnet': 200000,
  'haiku': 200000,
  'default': 168000, // 200k - 32k output reserved
};

export const TOKEN_THRESHOLDS = {
  WARNING: 0.60,   // 60% - show warning
  CRITICAL: 0.90,  // 90% - show error/suggest new session
};

export interface SessionConfig {
  query: string;
  workflowMode: WorkflowMode;
  model?: 'opus' | 'sonnet' | 'haiku';
  workingDir?: string;
  maxTurns?: number;           // Prevent infinite loops
  systemPrompt?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
}

export interface Session {
  id: string;
  status: SessionStatus;
  config: SessionConfig;
  tokenUsage: TokenUsage;
  contextLimit: number;
  errorMessage?: string;
  startTime: Date;
  completedAt?: Date;
  costUsd?: number;
  numTurns: number;
}

// Stream events from Claude CLI
export interface StreamEvent {
  type: 'system' | 'assistant' | 'user' | 'result';
  subtype?: string;
  sessionId?: string;
  message?: Message;
  // Result fields
  costUsd?: number;
  isError?: boolean;
  error?: string;
  numTurns?: number;
  usage?: TokenUsage;
}
```

### 2. Session Manager with Error Handling

```typescript
// session/manager.ts
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import readline from 'readline';

export class SessionManager extends EventEmitter {
  private activeProcesses = new Map<string, ChildProcess>();
  private sessions = new Map<string, Session>();

  // Token limit check (from humanlayer-wui TokenUsageBadge.tsx:6-10)
  private checkTokenLimits(session: Session): 'ok' | 'warning' | 'critical' {
    const percentage = session.tokenUsage.effectiveContextTokens / session.contextLimit;
    if (percentage >= TOKEN_THRESHOLDS.CRITICAL) return 'critical';
    if (percentage >= TOKEN_THRESHOLDS.WARNING) return 'warning';
    return 'ok';
  }

  async launchSession(config: SessionConfig): Promise<Session> {
    const sessionId = crypto.randomUUID();
    const contextLimit = MODEL_CONTEXT_LIMITS[config.model ?? 'default'];

    // Apply workflow-specific system prompts
    const systemPrompt = this.buildSystemPrompt(config);

    const session: Session = {
      id: sessionId,
      status: 'starting',
      config: { ...config, systemPrompt },
      tokenUsage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        effectiveContextTokens: 0,
      },
      contextLimit,
      startTime: new Date(),
      numTurns: 0,
    };

    this.sessions.set(sessionId, session);

    try {
      await this.startClaudeProcess(session);
      session.status = 'running';
      this.emit('session:started', session);
      return session;
    } catch (error) {
      session.status = 'failed';
      session.errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('session:failed', session);
      throw error;
    }
  }

  private async startClaudeProcess(session: Session): Promise<void> {
    const args = this.buildArgs(session.config);
    
    const proc = spawn('claude', args, {
      cwd: session.config.workingDir,
      env: process.env,
    });

    this.activeProcesses.set(session.id, proc);

    // Setup stdout parsing with large buffer (10MB for file contents)
    const rl = readline.createInterface({
      input: proc.stdout!,
      crlfDelay: Infinity,
    });
    // Note: Node's readline doesn't have maxLineLength, handle large lines differently
    
    let stderrOutput = '';
    proc.stderr?.on('data', (chunk) => {
      stderrOutput += chunk.toString();
    });

    // Process streaming JSON events
    rl.on('line', (line) => {
      if (!line.trim()) return;
      
      try {
        const event: StreamEvent = JSON.parse(line);
        this.handleStreamEvent(session, event);
      } catch (e) {
        // Log parse error but continue (from claudecode-go/client.go:491-494)
        console.warn('Failed to parse event:', e);
      }
    });

    // Handle process exit
    proc.on('exit', (code, signal) => {
      this.activeProcesses.delete(session.id);
      
      if (session.status === 'interrupting') {
        // Intentional interruption (from hld/session/manager.go:648-674)
        session.status = 'interrupted';
        session.completedAt = new Date();
        this.emit('session:interrupted', session);
      } else if (code !== 0 || stderrOutput) {
        // Process error (from hld/session/manager.go:675-686)
        session.status = 'failed';
        session.errorMessage = stderrOutput || `Process exited with code ${code}`;
        session.completedAt = new Date();
        this.emit('session:failed', session);
      } else {
        session.status = 'completed';
        session.completedAt = new Date();
        this.emit('session:completed', session);
      }
    });

    // Handle process errors
    proc.on('error', (error) => {
      session.status = 'failed';
      session.errorMessage = error.message;
      this.emit('session:failed', session);
    });
  }

  private handleStreamEvent(session: Session, event: StreamEvent): void {
    // Update token usage from assistant messages (hld/session/manager.go:954-999)
    if (event.type === 'assistant' && event.usage) {
      const usage = event.usage;
      
      // Calculate effective context (hld/session/manager.go:966-970)
      const effective = 
        usage.inputTokens + 
        usage.outputTokens + 
        usage.cacheReadInputTokens + 
        usage.cacheCreationInputTokens;
      
      session.tokenUsage = {
        ...usage,
        effectiveContextTokens: effective,
      };

      // Check token limits and emit warnings
      const tokenStatus = this.checkTokenLimits(session);
      if (tokenStatus === 'critical') {
        this.emit('session:token_critical', session);
      } else if (tokenStatus === 'warning') {
        this.emit('session:token_warning', session);
      }

      this.emit('session:token_update', session);
    }

    // Handle result events (hld/session/manager.go:1286-1318)
    if (event.type === 'result') {
      if (event.isError) {
        session.status = 'failed';
        session.errorMessage = event.error;
      }
      if (event.costUsd) session.costUsd = event.costUsd;
      if (event.numTurns) session.numTurns = event.numTurns;
    }

    // Emit event for UI streaming
    this.emit('session:event', session.id, event);
  }

  // Graceful interruption (hld/session/manager.go:1876-1919)
  async interruptSession(sessionId: string): Promise<void> {
    const proc = this.activeProcesses.get(sessionId);
    const session = this.sessions.get(sessionId);
    
    if (!proc || !session) {
      throw new Error('Session not found or not running');
    }

    session.status = 'interrupting';
    this.emit('session:interrupting', session);
    
    // Send SIGINT for graceful shutdown
    proc.kill('SIGINT');
  }

  // Force kill (hld/session/manager.go:2437-2450)
  forceKillSession(sessionId: string): void {
    const proc = this.activeProcesses.get(sessionId);
    if (proc) {
      proc.kill('SIGKILL');
    }
  }

  // Continue from completed/failed session (hld/session/manager.go:1434-1592)
  async continueSession(
    parentSessionId: string, 
    newQuery: string,
    overrides?: Partial<SessionConfig>
  ): Promise<Session> {
    const parent = this.sessions.get(parentSessionId);
    if (!parent) {
      throw new Error('Parent session not found');
    }

    // Validate parent status (hld/session/manager.go:1441-1446)
    const allowedStatuses: SessionStatus[] = ['completed', 'interrupted', 'failed'];
    if (!allowedStatuses.includes(parent.status)) {
      throw new Error(`Cannot continue session with status ${parent.status}`);
    }

    // Inherit config from parent (hld/session/manager.go:1494-1560)
    const config: SessionConfig = {
      ...parent.config,
      query: newQuery,
      // MaxTurns intentionally NOT inherited (hld/session/manager.go:1506)
      maxTurns: overrides?.maxTurns,
      ...overrides,
    };

    return this.launchSession(config);
  }

  // Build CLI arguments (from claudecode-go/client.go:182-311)
  private buildArgs(config: SessionConfig): string[] {
    const args: string[] = [];

    if (config.model) {
      args.push('--model', config.model);
    }

    // Always use stream-json for real-time updates
    args.push('--output-format', 'stream-json');
    args.push('--verbose');

    // Prevent infinite loops with max turns
    if (config.maxTurns && config.maxTurns > 0) {
      args.push('--max-turns', String(config.maxTurns));
    }

    if (config.systemPrompt) {
      args.push('--system-prompt', config.systemPrompt);
    }

    if (config.allowedTools?.length) {
      args.push('--allowedTools', config.allowedTools.join(','));
    }

    if (config.disallowedTools?.length) {
      args.push('--disallowedTools', config.disallowedTools.join(','));
    }

    // Critical: Use --print -- pattern for query (claudecode-go/client.go:304-308)
    args.push('--print');
    args.push('--');
    args.push(config.query);

    return args;
  }

  // Build workflow-specific system prompts
  private buildSystemPrompt(config: SessionConfig): string {
    const basePrompt = config.systemPrompt || '';
    
    switch (config.workflowMode) {
      case 'research':
        return `${basePrompt}

## Research Mode Instructions
You are in RESEARCH mode. Your goal is to investigate and document what exists in the codebase.

CRITICAL RULES:
- ONLY describe what EXISTS, not what SHOULD BE
- NO suggestions, improvements, or critiques
- Document implementation details with file:line references
- Be thorough but factual

When researching:
1. Use Glob to find relevant files
2. Use Grep to search for patterns
3. Use Read to examine specific files
4. Provide clear summaries of findings`;

      case 'plan':
        return `${basePrompt}

## Planning Mode Instructions  
You are in PLANNING mode. Create a detailed implementation plan.

Structure your plan with:
1. **Overview** - What we're building and why
2. **Current State** - What exists today (research first!)
3. **Desired End State** - Clear success criteria
4. **What We're NOT Doing** - Explicit scope boundaries
5. **Implementation Phases** - Break into logical steps

For each phase include:
- Overview of changes
- Specific files to modify with code snippets
- Success Criteria:
  - Automated Verification (commands to run)
  - Manual Verification (human testing needed)

Ask clarifying questions before finalizing the plan.`;

      case 'review_plan':
        return `${basePrompt}

## Plan Review Mode Instructions
You are in PLAN REVIEW mode. Validate an existing implementation plan.

Steps:
1. Read the plan document thoroughly
2. Verify each phase against the current codebase
3. Check that success criteria are achievable
4. Identify any gaps or issues
5. Provide a validation report with:
   - Status (Ready / Needs Revision)
   - Issues found (if any)
   - Suggested improvements (if any)

Be constructive but thorough in your review.`;

      case 'implement':
        return `${basePrompt}

## Implementation Mode Instructions
You are in IMPLEMENTATION mode. Execute a plan step by step.

Rules:
1. Follow the plan's intent, but adapt to reality
2. Complete one phase before moving to the next
3. Run automated verification after each phase
4. STOP and report if:
   - Automated tests fail
   - You encounter unexpected issues
   - Manual verification is required
5. Mark completed items with checkmarks
6. Never skip verification steps

If the plan doesn't match reality, communicate the mismatch clearly.`;

      case 'chat':
      default:
        return basePrompt;
    }
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }
}
```

### 3. Express Server with SSE Streaming

```typescript
// server/index.ts
import express from 'express';
import cors from 'cors';
import { SessionManager } from './session/manager';

const app = express();
const sessionManager = new SessionManager();

app.use(cors());
app.use(express.json());

// Launch new session
app.post('/api/sessions', async (req, res) => {
  try {
    const { query, workflowMode, model, workingDir, maxTurns } = req.body;
    
    const session = await sessionManager.launchSession({
      query,
      workflowMode: workflowMode || 'chat',
      model,
      workingDir: workingDir || process.cwd(),
      maxTurns: maxTurns || 100, // Default limit to prevent infinite loops
    });
    
    res.json(session);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to launch session' 
    });
  }
});

// Continue session
app.post('/api/sessions/:id/continue', async (req, res) => {
  try {
    const { query, maxTurns } = req.body;
    const session = await sessionManager.continueSession(
      req.params.id,
      query,
      { maxTurns }
    );
    res.json(session);
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to continue session' 
    });
  }
});

// Interrupt session
app.post('/api/sessions/:id/interrupt', async (req, res) => {
  try {
    await sessionManager.interruptSession(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to interrupt session' 
    });
  }
});

// Get session
app.get('/api/sessions/:id', (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

// SSE endpoint for streaming events (from hld/api/handlers/sse.go:42-98)
app.get('/api/sessions/:id/stream', (req, res) => {
  const sessionId = req.params.id;
  
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Event handler
  const onEvent = (eventSessionId: string, event: any) => {
    if (eventSessionId === sessionId) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };

  // Session status handlers
  const onStatusChange = (session: any) => {
    if (session.id === sessionId) {
      res.write(`data: ${JSON.stringify({ 
        type: 'status_change', 
        status: session.status,
        errorMessage: session.errorMessage,
        tokenUsage: session.tokenUsage,
      })}\n\n`);
    }
  };

  const onTokenWarning = (session: any) => {
    if (session.id === sessionId) {
      res.write(`data: ${JSON.stringify({ 
        type: 'token_warning',
        tokenUsage: session.tokenUsage,
        contextLimit: session.contextLimit,
        message: 'Approaching context limit (60%)',
      })}\n\n`);
    }
  };

  const onTokenCritical = (session: any) => {
    if (session.id === sessionId) {
      res.write(`data: ${JSON.stringify({ 
        type: 'token_critical',
        tokenUsage: session.tokenUsage,
        contextLimit: session.contextLimit,
        message: 'Context nearly full (90%). Consider starting a new session.',
      })}\n\n`);
    }
  };

  // Subscribe to events
  sessionManager.on('session:event', onEvent);
  sessionManager.on('session:completed', onStatusChange);
  sessionManager.on('session:failed', onStatusChange);
  sessionManager.on('session:interrupted', onStatusChange);
  sessionManager.on('session:token_warning', onTokenWarning);
  sessionManager.on('session:token_critical', onTokenCritical);

  // 30-second keepalive (from hld/api/handlers/sse.go:90-95)
  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(keepalive);
    sessionManager.off('session:event', onEvent);
    sessionManager.off('session:completed', onStatusChange);
    sessionManager.off('session:failed', onStatusChange);
    sessionManager.off('session:interrupted', onStatusChange);
    sessionManager.off('session:token_warning', onTokenWarning);
    sessionManager.off('session:token_critical', onTokenCritical);
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Agent server running on http://localhost:${PORT}`);
});
```

### 4. React Frontend with Workflow Dropdown

```typescript
// client/store/useAgentStore.ts
import { create } from 'zustand';

interface AgentState {
  sessions: Session[];
  activeSessionId: string | null;
  workflowMode: WorkflowMode;
  
  // Actions
  setWorkflowMode: (mode: WorkflowMode) => void;
  launchSession: (query: string) => Promise<void>;
  continueSession: (query: string) => Promise<void>;
  interruptSession: () => Promise<void>;
  updateSession: (session: Session) => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  workflowMode: 'chat',

  setWorkflowMode: (mode) => set({ workflowMode: mode }),

  launchSession: async (query) => {
    const { workflowMode } = get();
    
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        workflowMode,
        maxTurns: 100, // Prevent infinite loops
      }),
    });
    
    const session = await response.json();
    
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: session.id,
    }));
  },

  continueSession: async (query) => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;

    const response = await fetch(`/api/sessions/${activeSessionId}/continue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    
    const session = await response.json();
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: session.id,
    }));
  },

  interruptSession: async () => {
    const { activeSessionId } = get();
    if (!activeSessionId) return;

    await fetch(`/api/sessions/${activeSessionId}/interrupt`, {
      method: 'POST',
    });
  },

  updateSession: (updatedSession) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === updatedSession.id ? updatedSession : s
      ),
    }));
  },
}));
```

```tsx
// client/components/WorkflowSelector.tsx
import React from 'react';
import { useAgentStore } from '../store/useAgentStore';

const WORKFLOW_OPTIONS = [
  { value: 'chat', label: 'Chat', description: 'General conversation' },
  { value: 'research', label: 'Research', description: 'Investigate codebase' },
  { value: 'plan', label: 'Plan', description: 'Create implementation plan' },
  { value: 'review_plan', label: 'Review Plan', description: 'Validate existing plan' },
  { value: 'implement', label: 'Implement', description: 'Execute plan step by step' },
];

export function WorkflowSelector() {
  const { workflowMode, setWorkflowMode } = useAgentStore();

  return (
    <div className="workflow-selector">
      <select
        value={workflowMode}
        onChange={(e) => setWorkflowMode(e.target.value as WorkflowMode)}
        className="workflow-dropdown"
      >
        {WORKFLOW_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span className="workflow-description">
        {WORKFLOW_OPTIONS.find((o) => o.value === workflowMode)?.description}
      </span>
    </div>
  );
}
```

```tsx
// client/components/TokenUsageBadge.tsx (from humanlayer-wui)
import React from 'react';

interface Props {
  tokenUsage: TokenUsage;
  contextLimit: number;
}

export function TokenUsageBadge({ tokenUsage, contextLimit }: Props) {
  const percentage = Math.round(
    (tokenUsage.effectiveContextTokens / contextLimit) * 100
  );

  let variant = 'default';
  let message = '';

  if (percentage >= 90) {
    variant = 'destructive';
    message = 'Context nearly full. Consider starting a new session.';
  } else if (percentage >= 60) {
    variant = 'warning';
    message = 'Approaching context limit.';
  }

  const formattedTokens = tokenUsage.effectiveContextTokens.toLocaleString();
  const formattedLimit = contextLimit.toLocaleString();

  return (
    <div className={`token-badge ${variant}`} title={message}>
      <span>{percentage}%</span>
      <span className="token-details">
        {formattedTokens} / {formattedLimit}
      </span>
      {message && <span className="token-warning">{message}</span>}
    </div>
  );
}
```

```tsx
// client/components/SessionStatus.tsx
import React from 'react';

interface Props {
  session: Session;
  onRetry: () => void;
  onInterrupt: () => void;
}

export function SessionStatus({ session, onRetry, onInterrupt }: Props) {
  const getStatusMessage = () => {
    switch (session.status) {
      case 'running':
        return 'Agent is working...';
      case 'waiting_input':
        return 'Waiting for approval...';
      case 'completed':
        return 'Completed. Send a message to continue.';
      case 'interrupted':
        return 'Session interrupted. Send a message to resume.';
      case 'failed':
        return `Failed: ${session.errorMessage}`;
      default:
        return '';
    }
  };

  return (
    <div className={`session-status ${session.status}`}>
      <span>{getStatusMessage()}</span>
      
      {session.status === 'running' && (
        <button onClick={onInterrupt} className="interrupt-btn">
          Stop
        </button>
      )}
      
      {session.status === 'failed' && (
        <button onClick={onRetry} className="retry-btn">
          Retry
        </button>
      )}

      <TokenUsageBadge 
        tokenUsage={session.tokenUsage}
        contextLimit={session.contextLimit}
      />
    </div>
  );
}
```

```tsx
// client/hooks/useSSE.ts
import { useEffect, useRef } from 'react';
import { useAgentStore } from '../store/useAgentStore';

export function useSSE(sessionId: string | null) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const updateSession = useAgentStore((s) => s.updateSession);

  useEffect(() => {
    if (!sessionId) return;

    const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (e) => {
      const event = JSON.parse(e.data);
      
      // Handle different event types
      switch (event.type) {
        case 'status_change':
          // Update session status
          updateSession({
            id: sessionId,
            status: event.status,
            errorMessage: event.errorMessage,
            tokenUsage: event.tokenUsage,
          });
          break;
          
        case 'token_warning':
          console.warn('Token warning:', event.message);
          // Could show a toast notification
          break;
          
        case 'token_critical':
          console.error('Token critical:', event.message);
          // Show prominent warning to user
          break;
          
        default:
          // Stream event to chat UI
          // Handle assistant messages, tool calls, etc.
          break;
      }
    };

    eventSource.onerror = (e) => {
      console.error('SSE error:', e);
      // Attempt reconnection after delay
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId, updateSession]);
}
```

### 5. Error Handling Summary

| Error Type | Detection | Handling |
|------------|-----------|----------|
| **Infinite Loop** | `maxTurns` limit reached | Claude CLI auto-stops, result shows `num_turns` |
| **Token Limit** | `effectiveContextTokens / contextLimit >= 0.9` | Emit warning, suggest new session |
| **Process Crash** | Non-zero exit code or stderr | Status → `failed`, store `errorMessage` |
| **Result Error** | `event.isError === true` | Status → `failed`, store `event.error` |
| **User Interrupt** | SIGINT sent | Status → `interrupting` → `interrupted` |
| **Network Error** | SSE disconnect | Auto-reconnect with backoff |

### Key Implementation Notes

1. **Max Turns Default**: Always set a `maxTurns` (e.g., 100) to prevent runaway loops
2. **Token Tracking**: Use `effectiveContextTokens` (not just input+output) since cache tokens count toward limit
3. **Graceful Shutdown**: Use SIGINT first, only SIGKILL after timeout
4. **Session Recovery**: Failed/interrupted sessions can be continued with new query
5. **Workflow Prompts**: System prompts shape behavior significantly - customize per mode

---

Based on the research, here are the answers:

## Is a Database Needed?

**Short answer: It depends on your use case.**

| Feature | Database Required? | Why |
|---------|-------------------|-----|
| Single ephemeral session | ❌ No | Just need in-memory state |
| Session resume/continue | ✅ Yes | Need `claude_session_id` and config to pass `--resume` flag |
| Daemon restart resilience | ✅ Yes | Need to detect orphaned sessions |
| Conversation history display | ⚠️ Optional | Claude Code keeps its own in `~/.claude/sessions/` |
| Approval persistence | ✅ Yes | Approvals must survive restarts |
| Multi-client (TUI + WUI) | ✅ Yes | Shared state between processes |
| Recent directories autocomplete | ✅ Yes | Historical data |

**Recommendation for your agent:**

For a **minimal MVP**, you can skip the database entirely:
- Keep session state in memory
- If the server restarts, sessions are lost
- No session resume capability

For **production use**, add SQLite:
- Session resume works
- Graceful restart handling
- Audit trail for tool calls

## How Tool Calling Works

### 1. Event Flow

```
Claude CLI (subprocess)
    │
    │ stdout: stream-json (line-delimited)
    ▼
┌─────────────────────────────────────────────┐
│ StreamEvent with type="assistant"           │
│ {                                           │
│   "type": "assistant",                      │
│   "message": {                              │
│     "content": [                            │
│       { "type": "text", "text": "..." },    │
│       {                                     │
│         "type": "tool_use",                 │
│         "id": "toolu_01ABC...",             │  ← Tool call starts
│         "name": "Edit",                     │
│         "input": {                          │
│           "file_path": "/path/to/file.ts",  │
│           "old_string": "foo",              │
│           "new_string": "bar"               │
│         }                                   │
│       }                                     │
│     ]                                       │
│   }                                         │
│ }                                           │
└─────────────────────────────────────────────┘
    │
    ▼ (Claude executes tool internally)
    
┌─────────────────────────────────────────────┐
│ StreamEvent with type="user"                │
│ {                                           │
│   "type": "user",                           │
│   "message": {                              │
│     "content": [                            │
│       {                                     │
│         "type": "tool_result",              │  ← Tool result arrives
│         "tool_use_id": "toolu_01ABC...",    │
│         "content": "Successfully edited..." │
│       }                                     │
│     ]                                       │
│   }                                         │
│ }                                           │
└─────────────────────────────────────────────┘
```

### 2. Matching Tool Calls to Results

```typescript
// Store pending tool calls by ID
const pendingToolCalls = new Map<string, ToolCall>();

function processEvent(event: StreamEvent) {
  if (event.type === 'assistant' && event.message) {
    for (const content of event.message.content) {
      if (content.type === 'tool_use') {
        // Tool call started - render immediately with loading state
        const toolCall: ToolCall = {
          id: content.id,
          name: content.name,
          input: content.input,
          status: 'pending',  // Not completed yet
          result: null,
        };
        pendingToolCalls.set(content.id, toolCall);
        emit('tool_call', toolCall);
      }
    }
  }
  
  if (event.type === 'user' && event.message) {
    for (const content of event.message.content) {
      if (content.type === 'tool_result') {
        // Match result to pending call
        const toolCall = pendingToolCalls.get(content.tool_use_id);
        if (toolCall) {
          toolCall.status = 'completed';
          toolCall.result = content.content;
          toolCall.isError = content.is_error;
          emit('tool_result', toolCall);
        }
      }
    }
  }
}
```

### 3. UI Component Architecture

Based on the humanlayer-wui patterns:

```tsx
// components/ToolCallView.tsx
interface ToolCallViewProps {
  toolCall: ToolCall;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function ToolCallView({ toolCall, isExpanded, onToggleExpand }: ToolCallViewProps) {
  // Route to tool-specific component
  const ToolComponent = getToolComponent(toolCall.name);
  
  return (
    <div className={`tool-call ${toolCall.status}`}>
      <ToolHeader 
        name={toolCall.name}
        status={toolCall.status}
        icon={getToolIcon(toolCall.name)}
        isPending={toolCall.status === 'pending'}
      />
      
      <ToolComponent 
        input={toolCall.input}
        result={toolCall.result}
        isExpanded={isExpanded}
      />
      
      {toolCall.status === 'pending' && (
        <div className="loading-indicator pulse" />
      )}
      
      <button onClick={onToggleExpand}>
        {isExpanded ? 'Collapse' : 'Expand'}
      </button>
    </div>
  );
}

function getToolComponent(name: string) {
  switch (name) {
    case 'Bash': return BashToolView;
    case 'Edit': return EditToolView;
    case 'Read': return ReadToolView;
    case 'Write': return WriteToolView;
    case 'Grep': return GrepToolView;
    default: return GenericToolView;
  }
}
```

### 4. Tool-Specific Renderers

#### Bash Tool
```tsx
// components/tools/BashToolView.tsx
function BashToolView({ input, result, isExpanded }: ToolViewProps<BashInput>) {
  const lineCount = result ? result.split('\n').length : 0;
  const preview = formatPreview(result, 80); // First 80 chars
  
  return (
    <div className="bash-tool">
      <code className="command">{input.command}</code>
      
      {input.description && (
        <span className="description">{input.description}</span>
      )}
      
      {result && (
        <div className="result">
          {isExpanded ? (
            <pre className="full-output">{result}</pre>
          ) : (
            <span className="preview">
              {preview} {lineCount > 1 && `(${lineCount} lines)`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

#### Edit Tool with Diff Viewer
```tsx
// components/tools/EditToolView.tsx
function EditToolView({ input, result, isExpanded }: ToolViewProps<EditInput>) {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  
  return (
    <div className="edit-tool">
      <div className="file-path">{input.file_path}</div>
      
      <div className="diff-controls">
        <button onClick={() => setViewMode('unified')}>Unified</button>
        <button onClick={() => setViewMode('split')}>Split</button>
      </div>
      
      <DiffViewer
        oldContent={input.old_string}
        newContent={input.new_string}
        viewMode={viewMode}
        showLineNumbers={isExpanded}
      />
      
      {result && (
        <div className={`result ${result.includes('error') ? 'error' : 'success'}`}>
          {result.includes('Successfully') ? '✓ Applied' : result}
        </div>
      )}
    </div>
  );
}
```

#### Diff Viewer Component
```tsx
// components/DiffViewer.tsx
interface DiffLine {
  type: 'add' | 'remove' | 'unchanged';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function DiffViewer({ oldContent, newContent, viewMode }: DiffViewerProps) {
  const diffLines = computeDiff(oldContent, newContent);
  
  if (viewMode === 'unified') {
    return (
      <div className="diff-unified">
        {diffLines.map((line, i) => (
          <div key={i} className={`diff-line ${line.type}`}>
            <span className="prefix">
              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
            </span>
            <span className="content">{line.content}</span>
          </div>
        ))}
      </div>
    );
  }
  
  // Split view renders two columns
  return (
    <div className="diff-split">
      <div className="old-column">
        {diffLines.filter(l => l.type !== 'add').map(renderLine)}
      </div>
      <div className="new-column">
        {diffLines.filter(l => l.type !== 'remove').map(renderLine)}
      </div>
    </div>
  );
}

// Simple LCS-based diff algorithm
function computeDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  // ... LCS implementation
}
```

### 5. CSS for Tool States

```css
/* Tool call states */
.tool-call {
  border-left: 3px solid var(--border);
  padding-left: 12px;
  margin: 8px 0;
}

.tool-call.pending {
  border-left-color: var(--warning);
}

.tool-call.completed {
  border-left-color: var(--success);
}

.tool-call.error {
  border-left-color: var(--error);
}

/* Pulsing animation for pending tools */
.pulse {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Diff viewer colors */
.diff-line.add {
  background-color: rgba(var(--success-rgb), 0.1);
}

.diff-line.remove {
  background-color: rgba(var(--error-rgb), 0.1);
}

/* Word-level highlighting */
.diff-word-add {
  background-color: rgba(var(--success-rgb), 0.4);
}

.diff-word-remove {
  background-color: rgba(var(--error-rgb), 0.4);
}
```

### 6. Three-Level Expansion Pattern

From humanlayer-wui, tool calls have three levels of detail:

| Level | Trigger | Shows |
|-------|---------|-------|
| **Inline** | Default | Tool name + brief preview (80 chars or line count) |
| **Expanded** | Click or press `i` | Full input + full output in modal |
| **Grouped** | Task tool | Collapsible group of sub-tool calls |

```tsx
// Example: Collapsible task group
function TaskGroupView({ task, subToolCalls }: TaskGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  return (
    <div className="task-group">
      <div 
        className="task-header" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ChevronIcon rotated={!isExpanded} />
        <span>Task: {task.input.description}</span>
        <span className="count">({subToolCalls.length} tools)</span>
      </div>
      
      {isExpanded && (
        <div className="sub-tools">
          {subToolCalls.map(tc => (
            <ToolCallView key={tc.id} toolCall={tc} nested />
          ))}
        </div>
      )}
    </div>
  );
}
```

### Summary

**Database**: Skip for MVP, add SQLite for production features like session resume.

**Tool Call Flow**:
1. Parse `tool_use` content blocks from assistant messages
2. Store pending calls by `id`
3. Match `tool_result` via `tool_use_id`
4. Emit events for UI to render progressively

**UI Rendering**:
- Route by tool name to specialized components
- Show loading state while pending
- Use diff viewer for Edit/Write tools
- Support inline preview → full expansion
- Group Task sub-tools collapsibly

# Phase 3: SSE Streaming API

## Overview

Expose the agent loop via SSE streaming endpoints. Clients will start a chat via POST, then connect to an SSE stream to receive real-time events as the agent processes the request.

## Architecture

```
POST /api/chat → { sessionId } → GET /api/stream/:id (SSE)
                                            ↓
                               Yields: text_delta, tool_call, tool_result, done
POST /api/stop/:id → Aborts running agent

⚠️ LIMITATION: Only one SSE connection per session is supported.
Multiple concurrent connections will compete for events and cause undefined behavior.
```

## Files to Create/Modify

| File | Action | Purpose |

|------|--------|---------|

| [`server/src/session.ts`](codepilot/server/src/session.ts) | Create | Session state management with in-memory store |

| [`server/src/routes/chat.ts`](codepilot/server/src/routes/chat.ts) | Create | POST /api/chat endpoint |

| [`server/src/routes/stream.ts`](codepilot/server/src/routes/stream.ts) | Create | GET /api/stream/:id SSE endpoint |

| [`server/src/routes/index.ts`](codepilot/server/src/routes/index.ts) | Create | Route module exports |

| [`server/src/agent/loop.ts`](codepilot/server/src/agent/loop.ts) | Modify | Add AbortSignal support for interruption |

| [`server/src/index.ts`](codepilot/server/src/index.ts) | Modify | Register new routes, remove test endpoints |

## Implementation Details

### 1. Session Manager (`session.ts`)

In-memory session store with:

- `createSession(workingDir)` - creates session with unique ID, AbortController
- `getSession(id)` - retrieves session state
- `deleteSession(id)` - cleanup
- Event queue pattern using async iterable for streaming
```typescript
interface SessionState {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  messages: ChatCompletionMessageParam[];
  workingDir: string;
  abortController: AbortController;
  createdAt: Date;
}
```


### 2. Chat Route (`routes/chat.ts`)

`POST /api/chat` accepts `{ message: string, workingDir?: string }`:

1. Creates new session via session manager
2. Spawns agent loop (fire-and-forget, results stream via SSE)
3. Returns `{ sessionId }` immediately

### 3. Stream Route (`routes/stream.ts`)

`GET /api/stream/:id` as async generator with SSE:

1. Looks up session by ID
2. Yields SSE events from agent loop using `yield sse({ event, data })`
3. Handles connection cleanup

`POST /api/stop/:id`:

1. Calls `session.abortController.abort()`
2. Returns `{ success: true }`

### 4. Agent Loop Modification

Add optional `signal?: AbortSignal` to `AgentLoopConfig`:

- Check `signal.aborted` before each LLM call
- Yield `{ type: 'error', error: 'Aborted by user' }` if interrupted

## API Endpoints Summary

| Method | Endpoint | Request | Response |

|--------|----------|---------|----------|

| POST | `/api/chat` | `{ message, workingDir? }` | `{ sessionId }` |

| GET | `/api/stream/:id` | - | SSE stream |

| POST | `/api/stop/:id` | - | `{ success }` |

| GET | `/api/session/:id` | - | `Session` |

| DELETE | `/api/session/:id` | - | `{ success }` |

## Key Design Decisions

1. **Event Channel**: Use a simple async queue pattern where the agent loop pushes events, and SSE consumer pulls them
2. **One stream per session**: Each session can have one active SSE connection. Concurrent connections to the same session are **not supported** - only the first connection will receive events reliably. Additional connections will compete for events from the shared queue, leading to undefined behavior. This is a known limitation that should be addressed in future iterations by implementing proper broadcast/multicast for events.
3. **Abort via AbortController**: Standard pattern for cancellation
4. **Session cleanup**: Sessions auto-expire or are deleted manually

---

## Phase 3: SSE Streaming API - Complete ✓

All tasks have been completed successfully. Here's what was implemented:

### Files Created

1. **[`server/src/session.ts`](codepilot/server/src/session.ts)** - Session manager with:
   - `SessionState` interface with id, status, messages, workingDir, AbortController, and EventQueue
   - `EventQueue` class implementing async iterable pattern for streaming events to SSE clients
   - `createSession()`, `getSession()`, `deleteSession()`, `updateSessionStatus()` functions
   - `cleanupOldSessions()` utility for session expiry

2. **[`server/src/routes/chat.ts`](codepilot/server/src/routes/chat.ts)** - Chat route with:
   - `POST /api/chat` - Creates session, spawns agent loop, returns `{ sessionId }` immediately

3. **[`server/src/routes/stream.ts`](codepilot/server/src/routes/stream.ts)** - Stream routes with:
   - `GET /api/stream/:id` - SSE streaming endpoint that yields events from agent loop
   - `POST /api/stop/:id` - Aborts a running agent via AbortController
   - `GET /api/session/:id` - Returns session info
   - `DELETE /api/session/:id` - Deletes a session

4. **[`server/src/routes/index.ts`](codepilot/server/src/routes/index.ts)** - Route module exports

### Files Modified

1. **[`server/src/agent/loop.ts`](codepilot/server/src/agent/loop.ts)** - Added `signal?: AbortSignal` to AgentLoopConfig and abort checks:
   - Before starting the loop
   - Before each LLM call
   - Before each tool execution

2. **[`server/src/index.ts`](codepilot/server/src/index.ts)** - Updated to:
   - Register chat and stream routes via `.use()`
   - Removed test endpoints (`/api/test-tool`, `/api/test-agent`)
   - Added SSE availability log message

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Start conversation, returns `{ sessionId }` |
| GET | `/api/stream/:id` | SSE stream of agent events |
| POST | `/api/stop/:id` | Abort running agent |
| GET | `/api/session/:id` | Get session info |
| DELETE | `/api/session/:id` | Delete session |

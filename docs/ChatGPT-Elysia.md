Short answer: **Elysia already gives you everything you need for streaming – you don’t need to patch the framework itself.** You *do* need to write the usual glue (session manager, event bus, SSE endpoint), but that’s the same custom code you’d write in Express/Fastify, not Elysia-specific work.

I’ll walk through:

1. What your architecture needs (from the research doc)
2. What Elysia can do out of the box (SSE, streaming, WebSocket, Node/Bun)
3. Where you *do* need custom app code (and what that looks like)
4. Optional extras: MCP plugin, Eden Treaty, etc.
5. A concrete Elysia-based shape for your coding-agent backend

---

## 1. What your agent architecture actually needs

From the research doc you attached, the core pattern is:

* **Backend:**

  * TypeScript server
  * Session manager that wraps a long-running agent process (Claude CLI in the doc, but you can swap to direct OpenAI/other LLM)
  * Streaming parser that:

    * Reads streaming JSON / tokens
    * Detects `tool_use` / tool results
    * Pushes events into an internal event bus
  * SSE endpoint that:

    * Subscribes to that event bus per session
    * Streams events down to the browser (with keepalives)


* **Frontend (React):**

  * Chat UI + tool call viewer
  * `EventSource` subscription to `/api/sessions/:id/stream`
  * Zustand store for real-time updates

The doc’s example uses **Express** for:

* `POST /api/sessions` / `continue` / `interrupt`
* `GET /api/sessions/:id/stream` with manual `res.write` SSE handling

Your question is: *If I use Elysia instead of Express, do I need to extend it or write special low-level code for streaming?*

---

## 2. What Elysia already supports (re: streaming + AI)

### 2.1 Generator-based streaming responses

Elysia supports streaming just by returning a generator (or async generator) and `yield`-ing chunks. This is now the **recommended** way, and the old `@elysiajs/stream` plugin is in maintenance mode. ([Elysia][1])

Example from the docs:

```ts
import { Elysia } from 'elysia'

const app = new Elysia()
  .get('/ok', function* () {
    yield 1
    yield 2
    yield 3
  })
```

This is a first-class, typed streaming primitive.

### 2.2 Built-in SSE helper

Elysia has **native Server-Sent Events support** via the `sse` helper. You just return a generator and `yield sse(...)` values: ([Elysia][2])

```ts
import { Elysia, sse } from 'elysia'

new Elysia()
  .get('/sse', function* () {
    yield sse('hello world')

    yield sse({
      event: 'message',
      data: { message: 'This is a message', timestamp: new Date().toISOString() }
    })
  })
```

* Elysia auto-sets `Content-Type: text/event-stream` and formats the SSE frames.
* You can set headers *before* the first yield; after that, headers are locked.([Elysia][2])
* If the client disconnects, Elysia automatically stops the generator and cancels the stream.([Elysia][2])

This is exactly what you need for “streaming tool calls to the interface while the agent is working”.

### 2.3 Streaming `ReadableStream` / AI SDKs / raw fetch

Elysia has specific docs for AI streaming:

* It can stream any `ReadableStream` or `Response` directly (e.g., OpenAI streaming response).([Elysia][3])
* You can:

  * Return `stream.textStream` directly
  * Wrap a stream in `sse(stream)` so each chunk becomes an SSE event
  * Or manually loop `for await` over a stream and `yield sse(...)` yourself

From the AI integration page: ([Elysia][3])

```ts
new Elysia().get('/', () => {
  const stream = streamText({
    model: openai('gpt-5'),
    prompt: 'Hi!'
  })

  // Raw stream:
  return stream.textStream

  // Or SSE:
  // return sse(stream.textStream)
})
```

And a manual streaming example:

```ts
new Elysia().get('/', async function* () {
  const stream = streamText({ model: openai('gpt-5'), prompt: 'Hi!' })

  for await (const data of stream.textStream) {
    yield sse({ event: 'message', data })
  }

  yield sse({ event: 'done' })
})
```

So your **LLM → server → browser streaming** path is fully supported.

### 2.4 WebSockets if you want bidirectional

If you prefer WebSockets over SSE (for bidirectional real-time agent control), Elysia has built-in `ws` support (using µWebSocket under the hood): ([Elysia][4])

```ts
new Elysia()
  .ws('/ws', {
    message(ws, message) {
      ws.send(message)
    }
  })
```

And Eden Treaty auto-generates a typed WebSocket client with `subscribe`. ([Elysia][5])

For this challenge, SSE is simpler and matches your existing architecture, but WebSocket is there if you want richer control.

### 2.5 Node.js adapter (if you don’t want Bun)

Elysia 1.2 added an adapter system so you can run on **Node**, not just Bun: ([Elysia][6])

```ts
import { Elysia } from 'elysia'
import { node } from '@elysiajs/node'

new Elysia({ adapter: node() })
  .get('/', 'Hello Node')
  .listen(3000)
```

So you can:

* Stay entirely TypeScript
* Run on Node for easy `child_process.spawn` / file APIs
* Still use Elysia’s streaming features

---

## 3. Where you *actually* need custom code (and what it looks like)

**Important distinction:**
You don’t need to extend Elysia itself, but you *do* need app-level glue:

* A SessionManager and event bus (from your research doc)
* Elysia routes wired into that manager
* A streaming endpoint that bridges your event bus to SSE

That’s the same work you’d do in Express; the APIs just look a bit nicer.

### 3.1 Session manager + event bus (unchanged)

All the heavy lifting lives in your own TS code:

* `SessionManager` with:

  * `launchSession`, `continueSession`, `interruptSession`
  * internal map `id → Session` and status tracking
* Streaming parser that reads agent output and emits typed events:

  * `message`, `tool_call_started`, `tool_output`, `error`, `done`, etc.
* Keepalive logic (send SSE ping every 30s) and large buffer for file contents 

None of that depends on Express vs Elysia.

### 3.2 Elysia REST endpoints (straight Express swap)

Take the Express snippet from your doc:

* `POST /api/sessions`
* `POST /api/sessions/:id/continue`
* `POST /api/sessions/:id/interrupt`
* `GET /api/sessions/:id`

In Elysia, those become:

```ts
import { Elysia } from 'elysia'
import { SessionManager } from './session/manager'

const sessionManager = new SessionManager()

const app = new Elysia()
  .post('/api/sessions', async ({ body }) => {
    const { query, workflowMode, model, workingDir, maxTurns } = body as any

    const session = await sessionManager.launchSession({
      query,
      workflowMode: workflowMode ?? 'chat',
      model,
      workingDir: workingDir ?? process.cwd(),
      maxTurns: maxTurns ?? 100
    })

    return session
  })
  .post('/api/sessions/:id/continue', async ({ body, params }) => {
    const { query, maxTurns } = body as any

    const session = await sessionManager.continueSession(
      params.id,
      query,
      { maxTurns }
    )

    return session
  })
  // ... interrupt, get, etc.
```

No special streaming concerns here – these are just JSON endpoints.

### 3.3 Streaming tool calls with SSE in Elysia

Here’s where the custom glue lives.

You want:

* One long-lived HTTP connection per session (`GET /api/sessions/:id/stream`)
* As the agent runs tools / prints messages, you push structured events to that connection

Using Elysia’s `sse` + generator pattern, that looks like:

```ts
import { Elysia, sse } from 'elysia'
import { SessionManager } from './session/manager'
import type { AgentEvent } from './session/types'

const sessionManager = new SessionManager()

const app = new Elysia()
  .get('/api/sessions/:id/stream', function* ({ params }) {
    const session = sessionManager.getSession(params.id)
    if (!session) {
      // Elysia will serialize this as a normal response, not a stream
      return { error: 'Session not found' }
    }

    const eventIterator = sessionManager.subscribe(params.id)

    // Optional: send initial event
    yield sse({
      event: 'connected',
      data: { sessionId: params.id }
    })

    // Keepalive ping timer
    const pingIntervalMs = 30_000
    let alive = true
    const pingTimer = setInterval(() => {
      if (!alive) return
      // empty comment frame for keepalive
      // Elysia will format this as `: ping\n\n`
      // (or you can use a custom 'ping' event)
      // @ts-ignore – we can yield plain strings if desired
      // yield sse({ event: 'ping', data: Date.now() })
    }, pingIntervalMs)

    try {
      for (const ev of eventIterator) {
        const payload = mapAgentEventToSSE(ev)
        yield sse(payload)
      }
    } finally {
      alive = false
      clearInterval(pingTimer)
      sessionManager.unsubscribe(params.id, eventIterator)
    }
  })
```

Key points:

* **No framework extension**: This is entirely userland logic using `sse` and generators.
* Elysia automatically:

  * Sets the SSE headers
  * Streams chunks as you `yield`
  * Cancels the generator when the client disconnects (so your `finally` runs) ([Elysia][2])

How you implement `sessionManager.subscribe` and `mapAgentEventToSSE` is up to you:

* Subscribe could be:

  * A custom observer
  * An RxJS Observable
  * A simple `EventEmitter` wrapper that yields events
* `mapAgentEventToSSE` should shape your events into something your React client expects:

```ts
function mapAgentEventToSSE(ev: AgentEvent) {
  switch (ev.type) {
    case 'assistant_message':
      return { event: 'assistant', data: ev.payload }
    case 'tool_call_started':
      return { event: 'tool_started', data: ev.payload }
    case 'tool_output':
      return { event: 'tool_output', data: ev.payload }
    case 'error':
      return { event: 'error', data: ev.payload }
    case 'done':
      return { event: 'done' }
  }
}
```

This is exactly the architecture described in your research doc, just expressed in Elysia instead of Express.

### 3.4 Keepalive pings

Your doc recommends sending an SSE keepalive every ~30s.

Elysia doesn’t inject keepalives for you (which is good – that’s application semantics), but the generator pattern makes it trivial:

* Use `setInterval` inside the handler to `yield sse({ event: 'ping', data: Date.now() })`
* Clean it up in `finally` when the connection closes

Again, this is app-level glue, not framework work.

### 3.5 LLM streaming + tool usage

When you integrate the LLM:

* Use `fetch` with `stream: true` or a client that returns a `ReadableStream`([Elysia][3])
* Parse chunks in your agent harness, emit `AgentEvent`s into your event bus
* The SSE endpoint above just forwards those events

If you want to *also* pipe raw token stream to the browser (like a normal chat streaming UX), you can:

* Maintain two streams:

  * **Internal**: parsed, tool-aware event bus
  * **External**: simple token stream to be displayed
* Or combine them so the SSE stream includes:

  * `event: 'delta'` chunks for text
  * `event: 'tool_call'` / `tool_output` for tools

None of this requires touching Elysia internals.

---

## 4. Optional niceties in the Elysia ecosystem

### 4.1 MCP plugin if you want more formal tool plumbing

There’s an `elysia-mcp` plugin that turns an Elysia app into an HTTP MCP server with:

* Streamable HTTP transport
* Stateful sessions
* Tool/resource/prompt registration
* Optional SSE vs JSON response modes([mcpcow.com][7])

This is **not** a coding agent SDK (it’s just MCP server plumbing), so it doesn’t violate the “no existing coding agent SDK” rule. You *could*:

* Implement your tools as MCP tools
* Use the plugin to expose them over HTTP/MCP
* Still layer your own coding agent harness on top

But it’s under active development, so I’d treat it as a bonus, not a dependency, for this challenge.

### 4.2 Eden Treaty for a typed frontend client

Elysia’s Eden Treaty can generate a typed client for your routes, including web sockets. ([Elysia][5])

For SSE you’ll still use `EventSource` or a small custom wrapper, but Eden gives you:

* Strongly-typed calls for `/api/sessions`, `/continue`, etc.
* A nice way to share types between backend and React without extra boilerplate

---

## 5. Recommended Elysia-based shape for this challenge

Putting it together, here’s how I’d adapt your existing architecture (Express → Elysia):

### Backend (TypeScript, Node + Elysia)

* **Runtime**: Node with `@elysiajs/node` adapter (for easy `child_process` + cross-platform CLI)

* **Core modules (unchanged from research doc):**

  * `session/manager.ts` – session lifecycle
  * `session/launcher.ts` – spawns agent process or orchestrates LLM calls
  * `session/parser.ts` – parses streaming output and emits `AgentEvent`s
  * `session/types.ts` – session + event types, statuses, token usage, workflow modes

* **Elysia server:**

  * `POST /api/sessions` → `SessionManager.launchSession`
  * `POST /api/sessions/:id/continue` → `SessionManager.continueSession`
  * `POST /api/sessions/:id/interrupt` → `SessionManager.interruptSession`
  * `GET /api/sessions/:id` → get current state
  * `GET /api/sessions/:id/stream` → SSE endpoint using `sse` + generator as above

### Frontend (TypeScript, React)

* Same as in your research doc:

  * Chat UI, ToolCall view, File Explorer
  * Zustand store
  * `useSSE` hook to connect `EventSource` to state updates
* You just point the SSE URL to Elysia’s `/api/sessions/:id/stream`.

---

## Bottom line

* **Does Elysia need custom framework-level work to support streaming for this agent?**
  → **No.** Streaming is first-class via:

  * Generator-based streaming responses
  * Built-in `sse` helper for SSE
  * Native WebSocket support
  * Direct streaming of `ReadableStream` / `Response` for LLM APIs ([Elysia][2])

* **What custom work *do* you need?**

  * The same custom harness described in your architecture doc:

    * Session manager
    * Streaming parser
    * Event bus
    * SSE endpoint that subscribes to that bus and yields `sse(...)` events with optional keepalive

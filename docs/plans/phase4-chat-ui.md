# Phase 4: Basic Chat UI Implementation

## Current State

- **Server**: Phase 3 complete with SSE streaming at `POST /api/chat`, `GET /api/stream/:id`, `POST /api/stop/:id`
- **Client**: Phase 0 placeholder only; empty `components/`, `hooks/`, `store/` directories
- **Dependencies**: React 19, Zustand 5, Tailwind CSS v4 already installed

## Design Direction

Following [AESTHETICS.md](docs/AESTHETICS.md) "Starscape Voyager" theme:

- Deep space background (`hsl(222, 84%, 5%)`)
- Glassmorphic panels with `border-white/10`
- User messages: right-aligned, Blue gradient
- AI messages: left-aligned, Violet/Purple aura
- Emerald for success states, Pink for errors

---

## Implementation Tasks

### 1. Zustand Store ([client/src/store/useAgentStore.ts](codepilot/client/src/store/useAgentStore.ts))

Create state management for session and messages:

```typescript
interface AgentState {
  sessionId: string | null;
  status: 'idle' | 'streaming' | 'error';
  messages: Message[];        // User + assistant messages
  currentText: string;        // Streaming assistant text accumulator
  toolCalls: ToolCall[];      // Active tool calls
  error: string | null;
  
  // Actions
  sendMessage: (text: string) => Promise<void>;
  stopAgent: () => Promise<void>;
  clearSession: () => void;
  appendText: (text: string) => void;
  addToolCall: (toolCall: ToolCall) => void;
  updateToolResult: (id: string, result: unknown) => void;
}
```

Key behaviors:

- `sendMessage`: POST to `/api/chat`, store sessionId, set status to 'streaming'
- `appendText`: Accumulate text deltas into `currentText`
- On `done` event: Finalize `currentText` into a complete assistant message

### 2. SSE Hook ([client/src/hooks/useSSE.ts](codepilot/client/src/hooks/useSSE.ts))

EventSource connection manager:

```typescript
function useSSE(sessionId: string | null, handlers: {
  onTextDelta: (text: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onToolResult: (id: string, result: unknown) => void;
  onError: (error: string) => void;
  onDone: () => void;
})
```

- Create `EventSource` when sessionId is set
- Parse SSE events by type: `text_delta`, `tool_call`, `tool_result`, `error`, `done`
- Clean up on unmount or sessionId change

### 3. Auto-scroll Hook ([client/src/hooks/useAutoScroll.ts](codepilot/client/src/hooks/useAutoScroll.ts))

Smart scroll behavior:

- Auto-scroll when new content arrives (if user is near bottom)
- Disable auto-scroll if user scrolls up manually
- Re-enable when user scrolls back to bottom

### 4. ChatStream Component ([client/src/components/ChatStream.tsx](codepilot/client/src/components/ChatStream.tsx))

Message list container:

- Render array of messages from store
- Include streaming text indicator during active streaming
- Show tool calls inline (basic placeholder for Phase 5)
- Apply auto-scroll via ref

### 5. MessageBubble Component ([client/src/components/MessageBubble.tsx](codepilot/client/src/components/MessageBubble.tsx))

Individual message rendering:

- **User**: Right-aligned, blue glass card
- **Assistant**: Left-aligned, purple aura, streaming cursor when active
- Render markdown/code blocks (basic formatting)

### 6. InputArea Component ([client/src/components/InputArea.tsx](codepilot/client/src/components/InputArea.tsx))

Message input:

- Glass-pill input field
- Send button (disabled during streaming)
- Enter to send, Shift+Enter for newline
- Loading indicator when streaming

### 7. App.tsx Integration ([client/src/App.tsx](codepilot/client/src/App.tsx))

Wire everything together:

- Main layout with deep space background
- ChatStream in center
- InputArea docked at bottom
- Status indicator in header

---

## File Structure

```
client/src/
├── store/
│   └── useAgentStore.ts    # Zustand store
├── hooks/
│   ├── useSSE.ts           # SSE connection
│   └── useAutoScroll.ts    # Scroll behavior
├── components/
│   ├── ChatStream.tsx      # Message list
│   ├── MessageBubble.tsx   # Individual messages
│   └── InputArea.tsx       # Input + send
└── App.tsx                 # Main layout
```

---

## Success Criteria (from PRD)

- [ ] Messages display in chat format
- [ ] Text streams character by character
- [ ] Input clears after send
- [ ] Auto-scroll follows new content
- [ ] Loading indicator during agent work

---

## Phase 4: Basic Chat UI - Complete

### Files Created

| File | Purpose |
|------|---------|
| `store/useAgentStore.ts` | Zustand store with session state, messages, streaming handlers |
| `hooks/useSSE.ts` | EventSource manager for SSE streaming from `/api/stream/:id` |
| `hooks/useAutoScroll.ts` | Smart auto-scroll (disables when user scrolls up) |
| `components/MessageBubble.tsx` | User/assistant message rendering with Starscape styling |
| `components/ChatStream.tsx` | Message list with empty state, loading, error display |
| `components/InputArea.tsx` | Glass-pill input with send/stop buttons, keyboard shortcuts |
| `App.tsx` | Main layout with header, status orb, session controls |
| `index.css` | Custom animations and scrollbar styling |

### Features Implemented

- **Streaming text display** with pulsing cursor indicator
- **Tool call badges** showing pending/completed/error states
- **Auto-scroll** that respects manual scroll position
- **Keyboard shortcuts**: Enter to send, Shift+Enter for newline, Escape to stop
- **Status indicators**: Synthetic Star orb, status badge
- **Error handling** with clear-and-retry option
- **Empty state** with example prompts

### Design (Starscape Voyager)

- Deep space background (`hsl(222, 84%, 5%)`)
- Glassmorphic panels with `border-white/10`
- User messages: Blue gradient, right-aligned
- Assistant messages: Violet/purple aura, left-aligned
- Emerald for success, pink for errors

### To Test

Start both server and client:
```bash
cd codepilot && pnpm dev
```

Then open `http://localhost:5173` and try:
- "Create a hello.ts file with a greeting function"
- "Run ls -la and explain the output"

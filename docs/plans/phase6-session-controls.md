# Phase 6: Session Controls & Polish

## Current Status

Already implemented:

- Stop button (InputArea.tsx:188-214)
- Clear button (App.tsx:81-91)
- Session status indicator (StatusOrb + StatusBadge in App.tsx)
- Keyboard shortcuts (Enter, Shift+Enter, Escape in InputArea.tsx:49-56)

## Remaining Tasks

### 1. Token Usage Display

Track and display token consumption from OpenRouter API responses.

**Server changes** ([server/src/llm-client.ts](codepilot/server/src/llm-client.ts)):

- Parse `usage` object from streaming response chunks (available in final chunk)
- Return `{ prompt_tokens, completion_tokens, total_tokens }` 

**Add new StreamEvent type** ([server/src/types.ts](codepilot/server/src/types.ts)):

```typescript
export interface StreamEvent {
  // ... existing
  type: 'text_delta' | 'tool_call' | 'tool_result' | 'error' | 'done' | 'usage';
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
```

**Agent loop** ([server/src/agent/loop.ts](codepilot/server/src/agent/loop.ts)):

- Emit `usage` event after each LLM call completes

**Client store** ([client/src/store/useAgentStore.ts](codepilot/client/src/store/useAgentStore.ts)):

- Add `tokenUsage: { prompt: number; completion: number; total: number } | null`
- Add `updateTokenUsage` action

**UI component** ([client/src/App.tsx](codepilot/client/src/App.tsx)):

- Add `TokenUsageBadge` in header showing cumulative tokens

### 2. Error Recovery UI

Improve error handling with retry and dismiss capabilities.

**Client store** ([client/src/store/useAgentStore.ts](codepilot/client/src/store/useAgentStore.ts)):

- Add `dismissError()` action to clear error state
- Add `retryLastMessage()` action to resend failed message

**UI changes** ([client/src/App.tsx](codepilot/client/src/App.tsx)):

- Create `ErrorBanner` component with:
  - Error message display
  - "Retry" button (calls `retryLastMessage`)
  - "Dismiss" button (calls `dismissError`)
- Show banner below header when `status === 'error'`

### 3. Model Selector (Optional Enhancement)

Allow switching between Claude models via header dropdown.

**Server changes**:

- Use existing `getAvailableModels()` from [llm-client.ts](codepilot/server/src/llm-client.ts)
- Add `/api/models` endpoint to list available models
- Accept `model` param in POST `/api/chat` body

**Client changes** ([client/src/App.tsx](codepilot/client/src/App.tsx)):

- Add `ModelSelector` dropdown in header
- Store selected model in Zustand store
- Pass model to `sendMessage` API call

### 4. Visual Polish

**Animations** ([client/src/index.css](codepilot/client/src/index.css)):

- Add fade-in transition for error banner
- Smooth token counter animation (count-up effect)
- Refine StatusOrb glow effect

**Spacing/Typography**:

- Ensure consistent spacing in header controls
- Verify mobile responsiveness of header layout

## File Summary

| File | Changes |

|------|---------|

| [server/src/types.ts](codepilot/server/src/types.ts) | Add `usage` event type |

| [server/src/agent/loop.ts](codepilot/server/src/agent/loop.ts) | Emit usage events |

| [server/src/index.ts](codepilot/server/src/index.ts) | Add `/api/models` endpoint |

| [server/src/routes/chat.ts](codepilot/server/src/routes/chat.ts) | Accept model param |

| [client/src/store/useAgentStore.ts](codepilot/client/src/store/useAgentStore.ts) | Token usage state, error recovery actions |

| [client/src/hooks/useSSE.ts](codepilot/client/src/hooks/useSSE.ts) | Handle usage events |

| [client/src/App.tsx](codepilot/client/src/App.tsx) | TokenUsageBadge, ErrorBanner, ModelSelector |

| [client/src/index.css](codepilot/client/src/index.css) | Animation polish |

---

## Phase 6 Implementation Summary

### 1. Token Usage Tracking (Server)
- **[`server/src/types.ts`](codepilot/server/src/types.ts)**: Added `TokenUsage` interface and `usage` event type to `StreamEvent`
- **[`server/src/llm-client.ts`](codepilot/server/src/llm-client.ts)**: Added `stream_options: { include_usage: true }` to request token usage in streaming responses, plus `modelOverride` parameter support
- **[`server/src/agent/loop.ts`](codepilot/server/src/agent/loop.ts)**: Captures usage data from final streaming chunk and emits `usage` events; supports model override

### 2. Token Usage Display (Client)
- **[`client/src/store/useAgentStore.ts`](codepilot/client/src/store/useAgentStore.ts)**: Added `tokenUsage` state with cumulative tracking, `updateTokenUsage` action
- **[`client/src/hooks/useSSE.ts`](codepilot/client/src/hooks/useSSE.ts)**: Added handler for `usage` SSE events
- **[`client/src/App.tsx`](codepilot/client/src/App.tsx)**: Added `TokenUsageBadge` component showing total tokens with hover tooltip

### 3. Error Recovery UI
- **[`client/src/store/useAgentStore.ts`](codepilot/client/src/store/useAgentStore.ts)**: Added `dismissError()`, `retryLastMessage()` actions and `lastUserMessage` tracking
- **[`client/src/App.tsx`](codepilot/client/src/App.tsx)**: Added `ErrorBanner` component with Retry and Dismiss buttons, shows below header on error

### 4. Model Selector
- **[`server/src/index.ts`](codepilot/server/src/index.ts)**: Added `GET /api/models` endpoint returning available models (Haiku, Sonnet, Opus)
- **[`server/src/routes/chat.ts`](codepilot/server/src/routes/chat.ts)**: Accepts optional `model` parameter in POST body
- **[`client/src/store/useAgentStore.ts`](codepilot/client/src/store/useAgentStore.ts)**: Added `selectedModel`, `availableModels`, `setSelectedModel()`, `fetchAvailableModels()` 
- **[`client/src/App.tsx`](codepilot/client/src/App.tsx)**: Added `ModelSelector` dropdown in header with model switching

### 5. Visual Polish
- **[`client/src/index.css`](codepilot/client/src/index.css)**: Added `animate-fade-in` for error banner, `animate-glow` for status orb enhancement, `animate-count` for token counter
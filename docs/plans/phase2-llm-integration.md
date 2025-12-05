# Phase 2: LLM Integration (OpenRouter)

## Current State

- Types already defined in [`server/src/types.ts`](codepilot/server/src/types.ts)
- Tools implemented in [`server/src/tools/`](codepilot/server/src/tools/) with `anthropicTools` export
- Basic LLM client exists in [`server/src/llm-client.ts`](codepilot/server/src/llm-client.ts) but lacks tool support
- Agent folder exists but is empty

## Implementation Plan

### 1. Enhance LLM Client with Tool Support

Update [`server/src/llm-client.ts`](codepilot/server/src/llm-client.ts):

- Add `streamChatWithTools()` method that accepts tool definitions
- Format tools for OpenAI/OpenRouter API (uses `tools` array with `function` type)
- Return streaming response with tool call support
- Add system prompt parameter for agent behavior

### 2. Create Agent Loop

Create [`server/src/agent/loop.ts`](codepilot/server/src/agent/loop.ts):

- Implement `runAgentLoop()` as an async generator yielding `StreamEvent`s
- Handle OpenAI-format streaming (delta chunks with `tool_calls`)
- Parse streaming tool calls (name + arguments built incrementally)
- Execute tools via `getToolByName()` handler
- Construct `tool` role messages with results
- Loop until model finishes without tool calls

Key patterns:

```typescript
// OpenAI format tool calls come as:
// choice.delta.tool_calls[].function.name / .arguments (streamed JSON)
// After execution, send back as:
// { role: 'tool', tool_call_id: '...', content: JSON.stringify(result) }
```

### 3. Add Message Type Helpers

Create [`server/src/agent/messages.ts`](codepilot/server/src/agent/messages.ts):

- Type definitions for OpenAI message format (user/assistant/tool roles)
- Helper to build tool result messages
- System prompt constant for coding agent behavior

### 4. Export Agent Module

Create [`server/src/agent/index.ts`](codepilot/server/src/agent/index.ts):

- Export `runAgentLoop` and message helpers
- Consolidate agent-related exports

## Files to Create/Modify

| File | Action |

|------|--------|

| `server/src/llm-client.ts` | Modify - add `streamChatWithTools()` |

| `server/src/agent/loop.ts` | Create - main agent loop |

| `server/src/agent/messages.ts` | Create - message type helpers |

| `server/src/agent/index.ts` | Create - module exports |

## Success Criteria

- LLM responds to simple prompts via OpenRouter
- Text streams token by token (yields `text_delta` events)
- Tool calls are detected and parsed from streaming chunks
- Tool results are sent back to LLM (yields `tool_call` and `tool_result` events)
- Multi-turn tool conversations work (loop continues until done)

---

## ✅ Phase 2 Complete!

All tasks finished successfully. The agent loop now supports:

- **Streaming LLM responses** with token-by-token text delivery
- **Tool call detection** and parsing from OpenAI streaming chunks  
- **Tool execution** with error handling
- **Multi-turn conversations** (tool calls → results → continued reasoning)
- **OpenRouter integration** with model selection support

The test shows a complete working conversation where the agent:
1. Streams text explaining what it's doing
2. Calls the `list_dir` tool
3. Executes the tool and returns results
4. Continues streaming analysis of the directory contents
5. Finishes the conversation

Ready to move to **Phase 3: SSE Streaming API**! 🚀

For v1, I’d **drop the fancy provider-agnostic architecture** and just build a **small, Claude-only coding agent** with:

* A tiny tool set: `read_file`, `write_file`, `list_dir`, `run_shell`
* A basic agent loop that handles tool calls
* A localhost HTTP server + web UI that streams the conversation

Then, once that’s solid, you can refactor into the v2 architecture we sketched.

I’ll outline **exactly what to build for v1**.

---

## 1. Scope v1 super clearly

For this challenge, “basic coding agent capabilities” = at minimum:

1. **File editing**

   * `read_file(path)` → returns file contents
   * `write_file(path, content)` → overwrites file
   * Optional: `append_file`, `rename_file`, `delete_file`

2. **Shell commands**

   * `run_shell(command, cwd?)` → executes in a subprocess, returns stdout/stderr/exitCode
   * Hard safety: disallow super-dangerous commands outside the project root.

3. **Quality-of-life**

   * `list_dir(path)` → list files for exploration
   * Optional: `search_in_files(pattern, glob?)`

4. **Agent loop**

   * LLM (Claude) receives user prompts + tool definitions
   * When it emits `tool_use`, your backend actually does the file/shell operation and returns a `tool_result` block
   * Then Claude continues its reasoning and eventually replies with code edits / explanations

5. **Web UI**

   * Chat-style interface (like Cursor / v0 dev tools)
   * Streaming partial assistant output and showing tool calls + results in the timeline

That’s enough to satisfy “coding agent with file editing and shell commands” for v1.

---

## 2. Choose stack for v1

I’d go with:

* **Backend (agent host)**: Node + TypeScript + Express (or Fastify)

  * Runs on **localhost** on the user’s machine
  * Owns:

    * Anthropic client
    * Tool implementations (file & shell)
    * Agent loop / streaming

* **Frontend**: React + Vite (or Next.js) with a WebSocket or SSE client

  * Shows streaming tokens and tool activity

* **LLM**: Claude (Sonnet or Haiku) with **basic tool use**
  You *can* turn on Advanced Tool Use, but v1 doesn’t need Tool Search or Programmatic Tool Calling: just basic tools.

---

## 3. Define the minimal tool set (TypeScript)

On the backend, define simple tool types and handlers.

```ts
// src/tools/types.ts
export type ToolInput = Record<string, any>;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema
  handler: (input: ToolInput) => Promise<any>;
}
```

### 3.1 File tools

```ts
// src/tools/fileTools.ts
import fs from 'fs/promises';
import path from 'path';

const PROJECT_ROOT = process.cwd(); // or configurable

function resolveSafePath(p: string) {
  const abs = path.resolve(PROJECT_ROOT, p);
  if (!abs.startsWith(PROJECT_ROOT)) {
    throw new Error('Path outside project root is not allowed.');
  }
  return abs;
}

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read a UTF-8 text file from the project workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path from project root' },
    },
    required: ['path'],
  },
  async handler(input) {
    const abs = resolveSafePath(input.path);
    const content = await fs.readFile(abs, 'utf8');
    return { path: input.path, content };
  },
};

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Write a UTF-8 text file (overwrite) in the project workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['path', 'content'],
  },
  async handler(input) {
    const abs = resolveSafePath(input.path);
    await fs.writeFile(abs, input.content, 'utf8');
    return { path: input.path, status: 'ok' };
  },
};

export const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description: 'List files and folders in a directory.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory relative to project root' },
    },
    required: ['path'],
  },
  async handler(input) {
    const abs = resolveSafePath(input.path || '.');
    const entries = await fs.readdir(abs, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
    }));
  },
};
```

### 3.2 Shell tool

```ts
// src/tools/shellTool.ts
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execAsync = util.promisify(exec);
const PROJECT_ROOT = process.cwd();

export const runShellTool: ToolDefinition = {
  name: 'run_shell',
  description: 'Run a shell command in the project workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      cwd: { type: 'string', description: 'Relative working directory' },
    },
    required: ['command'],
  },
  async handler(input) {
    const cwdRel = input.cwd || '.';
    const cwdAbs = path.resolve(PROJECT_ROOT, cwdRel);

    // Safety: block obviously dangerous commands (v1 heuristic)
    if (input.command.includes('rm -rf /') || input.command.includes(':(){:|:&};:')) {
      throw new Error('Dangerous command blocked.');
    }

    const { stdout, stderr } = await execAsync(input.command, { cwd: cwdAbs });
    return { cwd: input.cwd, command: input.command, stdout, stderr };
  },
};
```

### 3.3 Bundle tools

```ts
// src/tools/index.ts
import { readFileTool, writeFileTool, listDirTool } from './fileTools';
import { runShellTool } from './shellTool';

export const tools = [readFileTool, writeFileTool, listDirTool, runShellTool];

export function getToolByName(name: string) {
  return tools.find(t => t.name === name);
}
```

---

## 4. Wire tools into Claude (basic tool calling)

Use Anthropic’s Messages + tools (no Tool Search, no Programmatic Tool Calling for v1).

Conceptually, Claude expects tools as:

```ts
const anthropicTools = tools.map(t => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema,
}));
```

And will emit `tool_use` content blocks. You exec and respond with `tool_result`.

### 4.1 Agent loop (single turn with streaming)

Backend route like `POST /api/chat` that:

* Accepts `{ messages, sessionId }`
* Calls Anthropic with streaming
* As chunks arrive:

  * For text: stream to client
  * For tool_use: stop, run tool, send tool_result back into a follow-up Claude call

Pseudocode:

```ts
// src/agent/runClaudeTurn.ts
import Anthropic from '@anthropic-ai/sdk';
import { tools, getToolByName } from '../tools';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const anthropicTools = tools.map(t => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema,
}));

export async function runClaudeTurn({ messages, onToken, onToolUse }: {
  messages: any[]; // Anthropic-formatted messages
  onToken: (text: string) => void;
  onToolUse: (toolCall: { id: string; name: string; input: any }) => void;
}) {
  const stream = await anthropic.beta.messages.stream({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1024,
    messages,
    tools: anthropicTools,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      onToken(event.delta.text);
    }

    if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
      const block = event.content_block;
      onToolUse({
        id: block.id,
        name: block.name,
        input: block.input,
      });
      // For v1: you can stop this turn once you see a tool_use
    }
  }

  const final = stream.getFinalMessage();
  return final;
}
```

### 4.2 Handling tool_use → tool_result → follow-up Claude call

When `onToolUse` fires:

1. Look up the handler via `getToolByName(name)`.
2. Run it.
3. Append `tool_result` to your messages.
4. Call `runClaudeTurn` again.

```ts
// src/agent/session.ts
import { getToolByName } from '../tools';
import { runClaudeTurn } from './runClaudeTurn';

export async function handleUserMessage(userText: string, sessionState: any) {
  // 1) Start with existing messages
  const messages = [...sessionState.messages];

  // 2) Add user message
  messages.push({
    role: 'user',
    content: [{ type: 'text', text: userText }],
  });

  let pendingMessages = messages;
  let aggregatedAssistantText = '';

  const final = await runClaudeTurn({
    messages: pendingMessages,
    onToken(text) {
      aggregatedAssistantText += text;
      sessionState.pushToClient({ type: 'assistant_text_delta', text });
    },
    async onToolUse({ id, name, input }) {
      // 1) Run the tool
      const toolDef = getToolByName(name);
      if (!toolDef) {
        sessionState.pushToClient({
          type: 'tool_error',
          tool: name,
          error: 'Unknown tool',
        });
        return;
      }

      let result: any;
      try {
        result = await toolDef.handler(input);
      } catch (err: any) {
        result = { error: String(err) };
      }

      // 2) Send tool_result into a new Claude turn
      pendingMessages.push({
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id,
            name,
            input,
          },
        ],
      });

      pendingMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: id,
            content: JSON.stringify(result),
          },
        ],
      });

      // 3) Recursively call another turn to let Claude continue
      const next = await runClaudeTurn({
        messages: pendingMessages,
        onToken(text) {
          aggregatedAssistantText += text;
          sessionState.pushToClient({
            type: 'assistant_text_delta',
            text,
          });
        },
        onToolUse: () => {
          // For v1, you can keep it simple and not allow nested tool uses here,
          // or handle them similarly with a loop.
        },
      });

      pendingMessages = next ? [...pendingMessages, next] : pendingMessages;
    },
  });

  if (final) {
    pendingMessages.push(final);
  }

  sessionState.messages = pendingMessages;
  return { messages: pendingMessages, assistantText: aggregatedAssistantText };
}
```

^ That’s a little rough but captures the **shape**: streaming, tool intercept, tool_result, follow-up turn.

---

## 5. Backend HTTP + streaming

You can expose a simple HTTP/WebSocket API for the UI:

* `POST /api/session/:id/message`

  * Body: `{ text: string }`
  * Server:

    * Calls `handleUserMessage`
    * Streams events over WebSocket or SSE:

      * `assistant_text_delta`
      * `tool_call` & `tool_result`

For v1, **SSE** is dead simple:

* Server: `res.write("data: {...}\n\n")`
* Client: `new EventSource('/api/session/123/stream')`

---

## 6. Frontend v1 UI

Keep it minimal but nice:

* Chats display:

  * User messages
  * Assistant text (streaming)
  * Tool call blocks: e.g. “📁 read_file(src/auth.ts)” + result
* Input box with “Send” button.

Rough React shape:

```tsx
const [messages, setMessages] = useState<ChatEvent[]>([]);

useEffect(() => {
  const es = new EventSource(`/api/session/${sessionId}/stream`);
  es.onmessage = ev => {
    const event = JSON.parse(ev.data);
    setMessages(prev => [...prev, event]);
  };
  return () => es.close();
}, [sessionId]);

// then render messages; for tool-related events show special UI
```

---

## 7. How to actually proceed (step order)

If you want a concrete “do this next” sequence:

1. **Backend skeleton**

   * Init Node+TS project
   * Setup Express/Fastify
   * Add Anthropic SDK

2. **Implement tools**

   * `read_file`, `write_file`, `list_dir`, `run_shell` with safety
   * Export `tools` array + `getToolByName`

3. **Implement minimal Claude agent loop**

   * `runClaudeTurn` with streaming handling `content_block_delta`
   * Recognize `tool_use` blocks and pass them to a callback

4. **Implement tool execution + follow-up turns**

   * `handleUserMessage` that:

     * Appends user message
     * Calls `runClaudeTurn`
     * On `tool_use`, runs the tool and sends `tool_result` back in a second call

5. **Add HTTP + streaming to frontend**

   * WebSocket or SSE endpoint per session
   * API route to send new user messages

6. **Frontend chat UI**

   * Simple React chat view
   * Show tool calls and results inline

7. **Polish for the challenge**

   * Add a “project root path” selector
   * Show a “Tools” sidebar listing what the agent can do
   * Log shell commands & file edits in UI for transparency

Once that’s all working, **then** we can:

* Swap the internal Claude wiring with the v2 provider-agnostic + Claude adapter architecture.
* Add `defer_loading` + Tool Search Tool + Programmatic Tool Calling.

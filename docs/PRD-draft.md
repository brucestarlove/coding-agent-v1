# About

Create an AI coding agent which runs on the end-user’s device. It should have basic coding agent capabilities including file editing, shell commands, and so forth. ○ The stack and harness design and prompts (or lack thereof) are entirely up to you. ● Create a web-based user interface for interacting with the agent through some type of chat-based interface. A localhost server which runs on the same device as the coding agent is recommended. ● The system MUST support streaming tool calls to the interface from the coding agent as the agent is working. Task ● Create an AI coding agent which runs on the end-user’s device. It should have basic coding agent capabilities including file editing, shell commands, and so forth. ○ The stack and harness design and prompts (or lack thereof) are entirely up to you. ● Create a web-based user interface for interacting with the agent through some type of chat-based interface. A localhost server which runs on the same device as the coding agent is recommended. ● The system MUST support streaming tool calls to the interface from the coding agent as the agent is working. Constraints ● Your project MUST be written entirely in TypeScript both for the frontend and for the coding agent harness/backend ● You are free to use whatever libraries, toolchain, and packages that you would like with two caveats: 1. You MUST NOT use the SDK of an existing coding agent (Claude Code, OpenCode, Amp, Cursor, etc.) as your coding agent. You may use them for inspiration, but your coding agent’s source code may not use their SDKs, binaries, or source code as direct or indirect dependencies 2. Apart from an LLM API key for inference, the deliverable MUST NOT require paid services, platforms or dependencies.

This prompt is a call to build a **self-hosted, AI-powered coding agent**, entirely in **TypeScript**, that runs **locally** on a user's machine with a **chat-based web interface** and **real-time interaction**.

---

## 🧠 Vision

Build a **local-first AI coding assistant** that:

* Interacts via a chat UI in the browser (`localhost`)
* Uses LLMs to issue and explain tool actions (e.g., edit files, run shell commands)
* Streams its work to the UI as it progresses — like a live debug theater
* Is fully in TypeScript (both frontend + backend)

All without relying on prebuilt agents like Cursor, OpenCode, etc.

---

## 🧱 Required Capabilities

### 🛠 1. **Core Coding Agent (Runs Locally)**

* **LLM-Powered Brain**: Use any LLM API (OpenAI, Anthropic, etc.) to interpret user prompts and generate tool calls.
* **Tools**:

  * File editing (read/write/modify files)
  * Shell command execution
  * Possibly directory navigation / context awareness
* **Harness**: You must design how messages are routed, tools invoked, and results streamed.

### 🖥 2. **Web-Based UI (Chat Interface)**

* Chat with the agent on `localhost`
* Messages stream in as the agent works — **not just after it's done**
* Could be a React + Express app, but you’re free to choose stack as long as it's TypeScript

---

## 🚨 Constraints

1. **No agent SDKs** (Claude Code, Cursor, etc.) — build your own harness and tool logic
2. **No paid dependencies** (apart from the LLM API)
3. **Written entirely in TypeScript** (backend and frontend)

---

## 🔁 Streaming Requirement

You *must* implement **streaming responses** — not just at the LLM level, but also at the **tool call level**.

This means:

* If the agent runs a shell command, the **stdout/stderr should stream live** into the chat
* Same for long-running file edits or multi-step tasks

Think of it like building a minimal **Cursor/Code Interpreter experience**, but offline and homegrown.

---

## 📐 Architecture Outline

### Backend (Node.js + TypeScript)

* Elysia server on `localhost`
* LLM interaction module (calls OpenAI or other API)
* Tool harness: file manager, shell executor
* Streaming router (e.g., Server-Sent Events or WebSockets)

### Frontend (React + TypeScript)

* Chat interface
* Handles streaming updates (tool logs, LLM messages)
* Sends user prompts -> backend
* Displays streamed results -> UI

---

## 🧩 Deliverables / Evaluation Focus

* You wrote your own agent logic and tool wrappers
* The agent can edit files, run shell, navigate dirs
* There's a responsive local web UI that **streams activity live**
* Stack is clean TypeScript, with no agent SDKs
* System works with only an LLM API key, no extra paid services

---

## 🔮 tl;dr

**Building my own Cursor**, but with my design philosophy. Architecting the invocation layer, stream protocols, and tool reflection.


# Elysia + Node.js implementation

[Elysia + Node.js](ChatGPT-Elysia-Nodejs.md) [and other Elysia info](ChatGPT-Elysia.md)
[elysia-cheatsheet.md](elysia-cheatsheet.md)
[elysia-llms.txt](elysia-llms.txt)
[elysia-llms-full.txt](elysia-llms-full.txt)
[elysia-node.md](elysia-node.md)
[elysia-route.md](elysia-route.md)
[elysia-handler.md](elysia-handler.md)
[elysia-life-cycle.md](elysia-life-cycle.md)
[elysia-aisdk.md](elysia-aisdk.md)
[elysia-extends-context.md](elysia-extends-context.md)

Based on the research, here's a detailed implementation guide for a TypeScript AI coding agent with robust error handling and workflow modes:

## Detailed TypeScript Agent Implementation

[ChatGPT-ts-impl.md](ChatGPT-ts-impl.md)

---

# Database

| Feature | Database Required? | Why |
|---------|-------------------|-----|
| Session resume/continue | ✅ Yes | Need `claude_session_id` and config to pass `--resume` flag |
| Daemon restart resilience | ✅ Yes | Need to detect orphaned sessions |
| Conversation history display | ⚠️ Optional | Claude Code keeps its own in `~/.claude/sessions/` |
| Approval persistence | ✅ Yes | Approvals must survive restarts |
| Multi-client (TUI + WUI) | ✅ Yes | Shared state between processes |
| Recent directories autocomplete | ✅ Yes | Historical data |

Add SQLite:
- Session resume works
- Graceful restart handling
- Audit trail for tool calls

# Tool Calling

[Tool Call v1](CHATGPT-Tools-v1.md)
plus extra ideas:

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

---

# Extra features:

I have the code snippets ready to drop in later:

1. Auto-Scroll Hook
2. Diff Algorithm (LCS-based)
3. Streaming Content Parser (handles partial events)
4. Keyboard Navigation System
5. Error Detection Utilities
6. File Snapshot Management (for Edit diffs)

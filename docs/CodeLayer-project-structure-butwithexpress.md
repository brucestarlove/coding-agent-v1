
```ts
// server/index.ts - Complete version
import express from 'express';
import cors from 'cors';
import { SessionManager } from './session/manager';
import { captureSnapshot, getSnapshot, clearSessionSnapshots } from './lib/fileSnapshots';

const app = express();
const sessionManager = new SessionManager();

app.use(cors());
app.use(express.json());

// Session endpoints
app.post('/api/sessions', async (req, res) => { /* ... */ });
app.post('/api/sessions/:id/continue', async (req, res) => { /* ... */ });
app.post('/api/sessions/:id/interrupt', async (req, res) => { /* ... */ });
app.get('/api/sessions/:id', (req, res) => { /* ... */ });

// SSE streaming endpoint
app.get('/api/sessions/:id/stream', (req, res) => {
  const sessionId = req.params.id;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Track file reads for snapshot capture
  const onToolCall = async (sid: string, toolCall: any) => {
    if (sid !== sessionId) return;
    
    // Capture file snapshot on Read operations
    if (toolCall.name === 'Read' && toolCall.input?.file_path) {
      await captureSnapshot(toolCall.input.file_path, sessionId);
    }
    
    res.write(`data: ${JSON.stringify({ type: 'tool_call', ...toolCall })}\n\n`);
  };
  
  const onToolResult = (sid: string, result: any) => {
    if (sid !== sessionId) return;
    res.write(`data: ${JSON.stringify({ type: 'tool_result', ...result })}\n\n`);
  };
  
  const onMessage = (sid: string, message: any) => {
    if (sid !== sessionId) return;
    res.write(`data: ${JSON.stringify({ type: 'message', ...message })}\n\n`);
  };
  
  const onStatus = (session: any) => {
    if (session.id !== sessionId) return;
    res.write(`data: ${JSON.stringify({ 
      type: 'status', 
      status: session.status,
      tokenUsage: session.tokenUsage,
      errorMessage: session.errorMessage,
    })}\n\n`);
  };

  sessionManager.on('tool_call', onToolCall);
  sessionManager.on('tool_result', onToolResult);
  sessionManager.on('message', onMessage);
  sessionManager.on('session:completed', onStatus);
  sessionManager.on('session:failed', onStatus);
  sessionManager.on('session:token_update', onStatus);

  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepalive);
    sessionManager.off('tool_call', onToolCall);
    sessionManager.off('tool_result', onToolResult);
    sessionManager.off('message', onMessage);
    sessionManager.off('session:completed', onStatus);
    sessionManager.off('session:failed', onStatus);
    sessionManager.off('session:token_update', onStatus);
    
    // Clean up snapshots when client disconnects
    clearSessionSnapshots(sessionId);
  });
});

// File snapshot endpoint (for Edit diffs in UI)
app.get('/api/sessions/:sessionId/snapshots/:filePath(*)', (req, res) => {
  const { sessionId, filePath } = req.params;
  const content = getSnapshot(filePath, sessionId);
  
  if (content === null) {
    return res.status(404).json({ error: 'No snapshot found' });
  }
  
  res.json({ content });
});

// Keyboard shortcuts help
app.get('/api/shortcuts', (_req, res) => {
  res.json([
    { key: 'j', description: 'Next item' },
    { key: 'k', description: 'Previous item' },
    { key: 'a', description: 'Approve tool call' },
    { key: 'd', description: 'Deny tool call' },
    { key: 'i', description: 'Expand/inspect' },
    { key: 'g', description: 'Go to top' },
    { key: 'G', description: 'Go to bottom' },
    { key: 'Esc', description: 'Blur input / close modal' },
  ]);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Agent server: http://localhost:${PORT}`);
});
```

```
my-coding-agent/
├── server/
│   ├── index.ts                 # Express server
│   ├── session/
│   │   ├── manager.ts           # Session lifecycle (from previous answer)
│   │   └── types.ts             # Session types
│   └── lib/
│       ├── streamParser.ts      # JSON stream parsing
│       ├── fileSnapshots.ts     # File content caching
│       └── errorDetection.ts    # Tool error detection
│
├── client/
│   ├── App.tsx
│   ├── store/
│   │   └── useAgentStore.ts     # Zustand store
│   ├── hooks/
│   │   ├── useSSE.ts            # SSE subscription
│   │   ├── useAutoScroll.ts     # Auto-scroll behavior
│   │   └── useKeyboardNav.ts    # Keyboard shortcuts
│   ├── lib/
│   │   └── diff.ts              # Diff algorithm
│   └── components/
│       ├── ChatStream.tsx       # Main conversation view
│       ├── WorkflowSelector.tsx # Dropdown for modes
│       ├── TokenUsageBadge.tsx  # Token usage display
│       ├── SessionStatus.tsx    # Status + error display
│       ├── tools/
│       │   ├── ToolCallView.tsx # Router component
│       │   ├── BashToolView.tsx
│       │   ├── EditToolView.tsx
│       │   ├── ReadToolView.tsx
│       │   ├── WriteToolView.tsx
│       │   ├── GrepToolView.tsx
│       │   └── GenericToolView.tsx
│       └── DiffViewer/
│           ├── DiffViewer.tsx   # Main diff component
│           ├── UnifiedView.tsx
│           └── SplitView.tsx
│
├── shared/
│   └── types.ts                 # Shared type definitions
│
├── package.json
├── tsconfig.json
└── vite.config.ts
```
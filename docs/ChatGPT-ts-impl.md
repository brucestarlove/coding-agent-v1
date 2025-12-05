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

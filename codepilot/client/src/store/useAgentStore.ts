/**
 * Zustand store for CodePilot agent state management.
 * Handles session state, messages, streaming, and tool calls.
 */

import { create } from 'zustand';

// ============================================================================
// Types (mirroring server/src/types.ts for client use)
// ============================================================================

/** Tool call made by the AI agent */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'completed' | 'error';
  result?: unknown;
  error?: string;
}

/** Content block - either text or a tool call, preserving order */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCall: ToolCall };

/** A message in the conversation */
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  /** For user messages: plain string. For assistant: ordered content blocks */
  content: string | ContentBlock[];
  timestamp: Date;
}

/** Agent status states */
export type AgentStatus = 'idle' | 'streaming' | 'error';

/**
 * Token usage tracking with both context window and cumulative API metrics.
 * 
 * Context metrics: PRE-SEND token counting (accurate context window size)
 * API metrics: POST-RESPONSE usage data (for cost tracking)
 * 
 * IMPORTANT: contextTokens comes from our token counter BEFORE sending,
 * while API metrics come from the provider's response AFTER completion.
 */
export interface TokenUsage {
  // === Context Window Metrics (ACCURATE - from pre-send token counting) ===
  /** 
   * Current context window usage - counted BEFORE sending to API.
   * This is the ACCURATE measure of how full the context window is.
   */
  contextTokens: number;
  /** Whether the context count is accurate (true) or a heuristic estimate */
  contextAccurate: boolean;
  /** Source of context estimate: 'tiktoken' (accurate, local) or 'heuristic' (rough) */
  contextSource: 'tiktoken' | 'heuristic' | null;
  
  // === Cumulative API Usage (for cost tracking - from API responses) ===
  /** Total prompt tokens sent across ALL API calls in this session */
  totalPromptTokens: number;
  /** Total completion tokens generated across ALL API calls */
  totalCompletionTokens: number;
  /** Total tokens (prompt + completion) across ALL API calls */
  totalApiTokens: number;
  
  // === Per-call info (from most recent API response) ===
  /** Prompt tokens from the most recent API call */
  lastPromptTokens: number;
  /** Completion tokens from the most recent API call */
  lastCompletionTokens: number;
}

/** Available model for selection */
export interface ModelOption {
  id: string;
  name: string;
  description: string;
  /** Context window size in tokens */
  contextWindow: number;
}

/** Available command for selection */
export interface CommandOption {
  id: string;
  name: string;
  description: string;
}

/** Session summary for listing */
export interface SessionSummary {
  id: string;
  status: string;
  workingDir: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totalTokens: number;
  preview: string | null;
}

/** Plan summary for listing */
export interface PlanSummary {
  id: string;
  title: string;
  type: 'implementation' | 'research' | 'custom';
  createdAt: string;
  updatedAt: string;
  sessionId: string | null;
  tags: string[];
  filePath: string;
  preview: string;
}

/** Full plan with content */
export interface Plan extends PlanSummary {
  content: string;
}

// ============================================================================
// Store Interface
// ============================================================================

interface AgentState {
  // Session state
  sessionId: string | null;
  sessionTitle: string | null;
  status: AgentStatus;
  error: string | null;
  /** Current working directory for tool operations */
  workingDir: string | null;

  // Message state
  messages: Message[];
  /** 
   * Streaming content blocks - preserves order of text and tool calls.
   * Text deltas are appended to the last text block, or a new text block is created.
   * Tool calls create new tool_call blocks.
   */
  currentContent: ContentBlock[];

  // Token usage tracking (cumulative across session)
  tokenUsage: TokenUsage | null;

  // Model selection
  selectedModel: string | null;
  availableModels: ModelOption[];

  // Command selection
  selectedCommand: string | null;
  availableCommands: CommandOption[];

  // Last message for retry functionality
  lastUserMessage: string | null;

  // Session management
  sessions: SessionSummary[];
  isSessionSheetOpen: boolean;

  // Plans management
  plans: PlanSummary[];
  selectedPlan: Plan | null;
  isPlansSheetOpen: boolean;

  // Actions
  sendMessage: (text: string) => Promise<void>;
  stopAgent: () => Promise<void>;
  clearSession: () => void;
  /** Update working directory for current session */
  setWorkingDir: (workingDir: string) => Promise<boolean>;

  // Error recovery actions
  dismissError: () => void;
  retryLastMessage: () => Promise<void>;

  // Model selection
  setSelectedModel: (modelId: string) => void;
  fetchAvailableModels: () => Promise<void>;

  // Command selection
  setSelectedCommand: (commandId: string) => void;
  fetchAvailableCommands: () => Promise<void>;

  // Session management actions
  fetchSessions: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  setSessionSheetOpen: (open: boolean) => void;

  // Plans management actions
  fetchPlans: () => Promise<void>;
  loadPlan: (filename: string) => Promise<Plan | null>;
  deletePlan: (filename: string) => Promise<void>;
  setPlansSheetOpen: (open: boolean) => void;
  /** Insert a plan's content into the input (for implement commands) */
  usePlanForImplement: (plan: Plan) => void;

  // Streaming handlers (called by useSSE hook)
  appendText: (text: string) => void;
  addToolCall: (toolCall: ToolCall) => void;
  updateToolResult: (id: string, result: unknown, error?: string) => void;
  /** Update context window estimate (from pre-send token counting - ACCURATE) */
  updateContextEstimate: (estimate: { contextTokens: number; accurate: boolean; source: 'tiktoken' | 'heuristic' }) => void;
  /** Update API usage metrics (from API response - for cost tracking) */
  updateApiUsage: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void;
  finalizeResponse: () => void;
  setError: (error: string) => void;
}

// ============================================================================
// API Configuration
// ============================================================================

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// ============================================================================
// Store Implementation
// ============================================================================

export const useAgentStore = create<AgentState>((set, get) => ({
  // Initial state
  sessionId: null,
  sessionTitle: null,
  status: 'idle',
  error: null,
  workingDir: null,
  messages: [],
  currentContent: [],
  tokenUsage: null,
  selectedModel: null,
  availableModels: [],
  selectedCommand: null,
  availableCommands: [],
  lastUserMessage: null,
  sessions: [],
  isSessionSheetOpen: false,
  plans: [],
  selectedPlan: null,
  isPlansSheetOpen: false,

  /**
   * Send a message to start a new conversation or continue existing one.
   * Creates a new session via POST /api/chat or continues via POST /api/chat/:id.
   * Events are streamed via SSE in useSSE hook.
   */
  sendMessage: async (text: string) => {
    const { status, sessionId } = get();

    // Prevent sending while already streaming
    if (status === 'streaming') {
      console.warn('[Store] Cannot send while streaming');
      return;
    }

    // Add user message to history
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    set({
      messages: [...get().messages, userMessage],
      status: 'streaming',
      error: null,
      currentContent: [],
      lastUserMessage: text,
    });

    try {
      const { selectedModel, selectedCommand, selectedPlan, workingDir } = get();
      
      // If we have a selected plan and command is implement, include plan in message
      let messageToSend = text;
      if (selectedPlan && selectedCommand === 'implement') {
        messageToSend = `${text}\n\n## Plan to Implement\n\n${selectedPlan.content}`;
        // Clear the selected plan after using it
        set({ selectedPlan: null });
      }
      
      // Determine endpoint: continue existing session or create new one
      const endpoint = sessionId 
        ? `${API_BASE}/chat/${sessionId}`  // Continue existing session
        : `${API_BASE}/chat`;              // Create new session
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: messageToSend,
          model: selectedModel || undefined,
          command: selectedCommand || undefined,
          // Only include workingDir for new sessions (existing sessions have it stored)
          ...(sessionId ? {} : { workingDir: workingDir || undefined }),
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      // Update sessionId and workingDir (new sessions return these, continued sessions confirm them)
      set({ sessionId: data.sessionId, workingDir: data.workingDir });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[Store] Failed to send message:', errorMessage);
      set({
        status: 'error',
        error: errorMessage,
      });
    }
  },

  /**
   * Stop the running agent via POST /api/stop/:id
   */
  stopAgent: async () => {
    const { sessionId, status } = get();

    if (!sessionId || status !== 'streaming') {
      console.warn('[Store] No active session to stop');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stop/${sessionId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        // Get error details from response if available
        let errorDetails = `${response.status} ${response.statusText}`;
        try {
          const errorBody = await response.text();
          if (errorBody) {
            errorDetails += `: ${errorBody}`;
          }
        } catch {
          // Ignore errors reading response body
        }

        const errorMessage = `Stop failed: ${errorDetails}`;
        console.error('[Store] Failed to stop agent:', errorMessage);

        // Ensure store state is updated even on failure
        get().finalizeResponse();
        set({ status: 'idle' });
        return;
      }

      // Finalize any pending response
      get().finalizeResponse();
      set({ status: 'idle' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[Store] Failed to stop agent:', errorMessage);

      // Ensure store state is updated even on failure
      get().finalizeResponse();
      set({ status: 'idle' });
    }
  },

  /**
   * Clear the current session and start fresh
   */
  clearSession: () => {
    set({
      sessionId: null,
      sessionTitle: null,
      status: 'idle',
      error: null,
      workingDir: null,
      messages: [],
      currentContent: [],
      tokenUsage: null,
      lastUserMessage: null,
    });
  },

  /**
   * Update working directory for the current session
   * Always updates local state - server sync is best-effort.
   * @returns true if successful (or no session to sync), false if server sync failed
   */
  setWorkingDir: async (workingDir: string) => {
    const { sessionId } = get();
    
    // Always update local state first - this ensures cwd works even if
    // the session is stale/expired on the server
    set({ workingDir });
    
    // If no session exists, we're done (will be sent with first message)
    if (!sessionId) {
      return true;
    }

    // Try to sync with server (best-effort - local state already updated)
    try {
      const response = await fetch(`${API_BASE}/session/${sessionId}/cwd`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workingDir }),
      });

      if (!response.ok) {
        // Session might be gone - that's okay, local state is updated
        // and next message will create a new session with this cwd
        console.warn('[Store] Could not sync working directory to server:', response.statusText);
        return false;
      }

      return true;
    } catch (err) {
      console.warn('[Store] Could not sync working directory to server:', err);
      return false;
    }
  },

  /**
   * Dismiss the current error and return to idle state
   */
  dismissError: () => {
    set({
      status: 'idle',
      error: null,
    });
  },

  /**
   * Retry the last message that caused an error
   */
  retryLastMessage: async () => {
    const { lastUserMessage, status } = get();
    
    if (status !== 'error' || !lastUserMessage) {
      console.warn('[Store] Cannot retry - no error state or last message');
      return;
    }

    // Clear error and remove the failed user message before resending
    const messages = get().messages;
    const updatedMessages = messages.slice(0, -1); // Remove last message (the failed one)
    
    set({
      messages: updatedMessages,
      error: null,
    });

    // Resend the message
    await get().sendMessage(lastUserMessage);
  },

  /**
   * Set the selected model for new conversations
   */
  setSelectedModel: (modelId: string) => {
    set({ selectedModel: modelId });
  },

  /**
   * Fetch available models from the server
   */
  fetchAvailableModels: async () => {
    try {
      const response = await fetch(`${API_BASE}/models`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
      const data = await response.json();
      set({
        availableModels: data.models,
        selectedModel: get().selectedModel || data.default,
      });
    } catch (err) {
      console.error('[Store] Failed to fetch models:', err);
    }
  },

  /**
   * Set the selected command for new messages
   */
  setSelectedCommand: (commandId: string) => {
    set({ selectedCommand: commandId });
  },

  /**
   * Fetch available commands from the server
   */
  fetchAvailableCommands: async () => {
    try {
      const response = await fetch(`${API_BASE}/commands`);
      if (!response.ok) {
        throw new Error(`Failed to fetch commands: ${response.status}`);
      }
      const data = await response.json();
      set({
        availableCommands: data.commands,
        selectedCommand: get().selectedCommand || data.default,
      });
    } catch (err) {
      console.error('[Store] Failed to fetch commands:', err);
    }
  },

  // ============================================================================
  // Session Management Actions
  // ============================================================================

  /**
   * Fetch all sessions from the server
   */
  fetchSessions: async () => {
    try {
      const response = await fetch(`${API_BASE}/sessions?limit=100`);
      if (!response.ok) {
        throw new Error(`Failed to fetch sessions: ${response.status}`);
      }
      const data = await response.json();
      set({ sessions: data.sessions });
    } catch (err) {
      console.error('[Store] Failed to fetch sessions:', err);
    }
  },

  /**
   * Load a session by ID - fetches messages and sets up state
   */
  loadSession: async (sessionId: string) => {
    try {
      // Fetch session info
      const sessionResponse = await fetch(`${API_BASE}/session/${sessionId}`);
      if (!sessionResponse.ok) {
        throw new Error(`Failed to fetch session: ${sessionResponse.status}`);
      }
      const sessionData = await sessionResponse.json();

      // Fetch messages
      const messagesResponse = await fetch(`${API_BASE}/session/${sessionId}/messages`);
      if (!messagesResponse.ok) {
        throw new Error(`Failed to fetch messages: ${messagesResponse.status}`);
      }
      const messagesData = await messagesResponse.json();

      // Convert server messages to client Message format
      const messages: Message[] = [];
      let currentAssistantContent: ContentBlock[] = [];
      
      for (const msg of messagesData.messages) {
        if (msg.role === 'user') {
          messages.push({
            id: crypto.randomUUID(),
            role: 'user',
            content: msg.content || '',
            timestamp: new Date(),
          });
        } else if (msg.role === 'assistant') {
          // Finalize any previous assistant content
          if (currentAssistantContent.length > 0) {
            messages.push({
              id: crypto.randomUUID(),
              role: 'assistant',
              content: currentAssistantContent,
              timestamp: new Date(),
            });
            currentAssistantContent = [];
          }

          // Add text content if present
          if (msg.content) {
            currentAssistantContent.push({ type: 'text', text: msg.content });
          }

          // Add tool calls if present
          if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              currentAssistantContent.push({
                type: 'tool_call',
                toolCall: {
                  id: tc.id,
                  name: tc.function.name,
                  input: JSON.parse(tc.function.arguments || '{}'),
                  status: 'completed',
                },
              });
            }
          }
        } else if (msg.role === 'tool') {
          // Find the matching tool call and update its result
          for (const block of currentAssistantContent) {
            if (block.type === 'tool_call' && block.toolCall.id === msg.tool_call_id) {
              try {
                block.toolCall.result = JSON.parse(msg.content);
              } catch {
                block.toolCall.result = msg.content;
              }
            }
          }
        }
      }

      // Finalize any remaining assistant content
      if (currentAssistantContent.length > 0) {
        messages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: currentAssistantContent,
          timestamp: new Date(),
        });
      }

      // Update store state
      // Note: When loading from history, we only have totalTokens from DB
      // We can't accurately reconstruct context vs API breakdown
      // Context will be updated on next API call via pre-send token counting
      set({
        sessionId,
        sessionTitle: sessionData.title,
        workingDir: sessionData.workingDir,
        messages,
        currentContent: [],
        tokenUsage: sessionData.totalTokens ? {
          // For loaded sessions, context is unknown until next message
          contextTokens: 0,
          contextAccurate: false,
          contextSource: null,
          // Preserve cumulative totals from DB
          totalPromptTokens: sessionData.totalTokens,
          totalCompletionTokens: 0,
          totalApiTokens: sessionData.totalTokens,
          lastPromptTokens: 0,
          lastCompletionTokens: 0,
        } : null,
        status: 'idle',
        error: null,
        isSessionSheetOpen: false,
      });
    } catch (err) {
      console.error('[Store] Failed to load session:', err);
    }
  },

  /**
   * Delete a session by ID
   */
  deleteSession: async (sessionId: string) => {
    try {
      const response = await fetch(`${API_BASE}/session/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete session: ${response.status}`);
      }

      // Remove from local sessions list
      set({
        sessions: get().sessions.filter((s) => s.id !== sessionId),
      });

      // If this was the current session, clear it
      if (get().sessionId === sessionId) {
        get().clearSession();
      }
    } catch (err) {
      console.error('[Store] Failed to delete session:', err);
    }
  },

  /**
   * Update session title
   */
  updateSessionTitle: async (sessionId: string, title: string) => {
    try {
      const response = await fetch(`${API_BASE}/session/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update title: ${response.status}`);
      }

      // Update local sessions list
      set({
        sessions: get().sessions.map((s) =>
          s.id === sessionId ? { ...s, title } : s
        ),
      });

      // Update current session title if this is the active session
      if (get().sessionId === sessionId) {
        set({ sessionTitle: title });
      }
    } catch (err) {
      console.error('[Store] Failed to update session title:', err);
    }
  },

  /**
   * Open/close the session sheet
   */
  setSessionSheetOpen: (open: boolean) => {
    set({ isSessionSheetOpen: open });
    // Fetch sessions when opening
    if (open) {
      get().fetchSessions();
    }
  },

  // ============================================================================
  // Plans Management Actions
  // ============================================================================

  /**
   * Fetch all plans from the server
   */
  fetchPlans: async () => {
    try {
      const { workingDir } = get();
      const params = workingDir ? `?workingDir=${encodeURIComponent(workingDir)}` : '';
      const response = await fetch(`${API_BASE}/plans${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch plans: ${response.status}`);
      }
      const data = await response.json();
      set({ plans: data.plans });
    } catch (err) {
      console.error('[Store] Failed to fetch plans:', err);
    }
  },

  /**
   * Load a plan by filename
   */
  loadPlan: async (filename: string): Promise<Plan | null> => {
    try {
      const { workingDir } = get();
      const params = workingDir ? `?workingDir=${encodeURIComponent(workingDir)}` : '';
      const response = await fetch(`${API_BASE}/plans/${encodeURIComponent(filename)}${params}`);
      if (!response.ok) {
        throw new Error(`Failed to load plan: ${response.status}`);
      }
      const plan = await response.json();
      set({ selectedPlan: plan });
      return plan;
    } catch (err) {
      console.error('[Store] Failed to load plan:', err);
      return null;
    }
  },

  /**
   * Delete a plan by filename
   */
  deletePlan: async (filename: string) => {
    try {
      const { workingDir } = get();
      const params = workingDir ? `?workingDir=${encodeURIComponent(workingDir)}` : '';
      const response = await fetch(`${API_BASE}/plans/${encodeURIComponent(filename)}${params}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete plan: ${response.status}`);
      }

      // Remove from local plans list
      set({
        plans: get().plans.filter((p) => p.filePath !== filename),
        selectedPlan: get().selectedPlan?.filePath === filename ? null : get().selectedPlan,
      });
    } catch (err) {
      console.error('[Store] Failed to delete plan:', err);
    }
  },

  /**
   * Open/close the plans sheet
   */
  setPlansSheetOpen: (open: boolean) => {
    set({ isPlansSheetOpen: open });
    // Fetch plans when opening
    if (open) {
      get().fetchPlans();
    }
  },

  /**
   * Use a plan for implementation - sets command to implement and prepares message
   */
  usePlanForImplement: (plan: Plan) => {
    // Set command to implement (will be classified as complex due to plan content)
    set({
      selectedCommand: 'implement',
      selectedPlan: plan,
      isPlansSheetOpen: false,
    });
  },

  // ============================================================================
  // Streaming Handlers
  // ============================================================================

  /**
   * Append streaming text delta to current response.
   * If the last content block is text, append to it. Otherwise, create a new text block.
   */
  appendText: (text: string) => {
    const { currentContent } = get();
    const lastBlock = currentContent[currentContent.length - 1];

    if (lastBlock && lastBlock.type === 'text') {
      // Append to existing text block
      set({
        currentContent: [
          ...currentContent.slice(0, -1),
          { type: 'text', text: lastBlock.text + text },
        ],
      });
    } else {
      // Create new text block
      set({
        currentContent: [...currentContent, { type: 'text', text }],
      });
    }
  },

  /**
   * Add a new tool call block (preserves order with text)
   */
  addToolCall: (toolCall: ToolCall) => {
    set({
      currentContent: [
        ...get().currentContent,
        { type: 'tool_call', toolCall },
      ],
    });
  },

  /**
   * Update a tool call with its result (finds it in content blocks)
   */
  updateToolResult: (id: string, result: unknown, error?: string) => {
    set({
      currentContent: get().currentContent.map((block) =>
        block.type === 'tool_call' && block.toolCall.id === id
          ? {
              type: 'tool_call',
              toolCall: {
                ...block.toolCall,
                status: error ? 'error' : 'completed',
                result: error ? undefined : result,
                error,
              },
            }
          : block
      ),
    });
  },

  /**
   * Update context window estimate from PRE-SEND token counting.
   * This is the ACCURATE context size, not from API response.
   */
  updateContextEstimate: (estimate: { contextTokens: number; accurate: boolean; source: 'tiktoken' | 'heuristic' }) => {
    const { tokenUsage } = get();
    set({
      tokenUsage: {
        // Update context window estimate (this is the accurate one!)
        contextTokens: estimate.contextTokens,
        contextAccurate: estimate.accurate,
        contextSource: estimate.source,
        
        // Preserve cumulative API usage
        totalPromptTokens: tokenUsage?.totalPromptTokens || 0,
        totalCompletionTokens: tokenUsage?.totalCompletionTokens || 0,
        totalApiTokens: tokenUsage?.totalApiTokens || 0,
        lastPromptTokens: tokenUsage?.lastPromptTokens || 0,
        lastCompletionTokens: tokenUsage?.lastCompletionTokens || 0,
      },
    });
  },

  /**
   * Update API usage metrics from POST-RESPONSE data.
   * Used for cost tracking, not context window estimation.
   */
  updateApiUsage: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => {
    const { tokenUsage } = get();
    set({
      tokenUsage: {
        // Preserve context estimate (the accurate one)
        contextTokens: tokenUsage?.contextTokens || 0,
        contextAccurate: tokenUsage?.contextAccurate || false,
        contextSource: tokenUsage?.contextSource || null,
        
        // Update cumulative API usage (for cost tracking)
        totalPromptTokens: (tokenUsage?.totalPromptTokens || 0) + usage.prompt_tokens,
        totalCompletionTokens: (tokenUsage?.totalCompletionTokens || 0) + usage.completion_tokens,
        totalApiTokens: (tokenUsage?.totalApiTokens || 0) + usage.total_tokens,
        
        // Per-call info from API
        lastPromptTokens: usage.prompt_tokens,
        lastCompletionTokens: usage.completion_tokens,
      },
    });
  },

  /**
   * Finalize the current streaming response into a complete message
   */
  finalizeResponse: () => {
    const { currentContent, messages } = get();

    // Only add message if there's content
    if (currentContent.length > 0) {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: currentContent,
        timestamp: new Date(),
      };

      set({
        messages: [...messages, assistantMessage],
        currentContent: [],
        status: 'idle',
      });
    } else {
      set({ status: 'idle' });
    }
  },

  /**
   * Set error state
   */
  setError: (error: string) => {
    // Finalize any partial response before showing error
    get().finalizeResponse();
    set({
      status: 'error',
      error,
    });
  },
}));

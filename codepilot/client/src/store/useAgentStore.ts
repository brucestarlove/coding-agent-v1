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

/** Token usage tracking */
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

/** Available model for selection */
export interface ModelOption {
  id: string;
  name: string;
  description: string;
  /** Context window size in tokens */
  contextWindow: number;
}

// ============================================================================
// Store Interface
// ============================================================================

interface AgentState {
  // Session state
  sessionId: string | null;
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

  // Last message for retry functionality
  lastUserMessage: string | null;

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

  // Streaming handlers (called by useSSE hook)
  appendText: (text: string) => void;
  addToolCall: (toolCall: ToolCall) => void;
  updateToolResult: (id: string, result: unknown, error?: string) => void;
  updateTokenUsage: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void;
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
  status: 'idle',
  error: null,
  workingDir: null,
  messages: [],
  currentContent: [],
  tokenUsage: null,
  selectedModel: null,
  availableModels: [],
  lastUserMessage: null,

  /**
   * Send a message to start a new conversation or continue existing one.
   * Creates a new session via POST /api/chat and returns immediately.
   * Events are streamed via SSE in useSSE hook.
   */
  sendMessage: async (text: string) => {
    const { status } = get();

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
      // Start new conversation via API
      const { selectedModel, workingDir } = get();
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text,
          model: selectedModel || undefined,
          workingDir: workingDir || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
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
   * Update cumulative token usage (adds to existing totals)
   */
  updateTokenUsage: (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => {
    const { tokenUsage } = get();
    set({
      tokenUsage: {
        prompt: (tokenUsage?.prompt || 0) + usage.prompt_tokens,
        completion: (tokenUsage?.completion || 0) + usage.completion_tokens,
        total: (tokenUsage?.total || 0) + usage.total_tokens,
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

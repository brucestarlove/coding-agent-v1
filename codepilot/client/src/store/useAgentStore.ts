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

// ============================================================================
// Store Interface
// ============================================================================

interface AgentState {
  // Session state
  sessionId: string | null;
  status: AgentStatus;
  error: string | null;

  // Message state
  messages: Message[];
  /** 
   * Streaming content blocks - preserves order of text and tool calls.
   * Text deltas are appended to the last text block, or a new text block is created.
   * Tool calls create new tool_call blocks.
   */
  currentContent: ContentBlock[];

  // Actions
  sendMessage: (text: string) => Promise<void>;
  stopAgent: () => Promise<void>;
  clearSession: () => void;

  // Streaming handlers (called by useSSE hook)
  appendText: (text: string) => void;
  addToolCall: (toolCall: ToolCall) => void;
  updateToolResult: (id: string, result: unknown, error?: string) => void;
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
  messages: [],
  currentContent: [],

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
    });

    try {
      // Start new conversation via API
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      set({ sessionId: data.sessionId });
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
      messages: [],
      currentContent: [],
    });
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

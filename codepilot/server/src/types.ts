/**
 * Core type definitions for CodePilot tools and agent loop.
 */

/**
 * Definition for a tool that can be used by the AI agent.
 * Each tool has a name, description, JSON schema for inputs, and a handler function.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object; // JSON Schema for Claude/OpenRouter API
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: Record<string, any>) => Promise<unknown>;
}

/**
 * Represents a tool call made by the AI agent.
 * Tracks the call's status and result/error.
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'completed' | 'error';
  result?: unknown;
  error?: string;
}

/**
 * A message in the conversation history.
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  timestamp: Date;
}

/**
 * Content block types used in Claude API messages.
 */
export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  is_error?: boolean;
}

/**
 * Events streamed from the agent to the UI.
 */
export interface StreamEvent {
  type: 'text_delta' | 'tool_call' | 'tool_result' | 'error' | 'done';
  text?: string;
  toolCall?: ToolCall;
  error?: string;
}

/**
 * Session state for an agent conversation.
 */
export interface Session {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  messages: Message[];
  createdAt: Date;
  workingDir: string;
}


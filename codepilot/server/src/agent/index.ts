/**
 * Agent module exports
 * Provides the agent loop and message utilities for running AI conversations
 */

// Main agent loop
export { runAgentLoop, getAvailableTools, type AgentLoopConfig } from './loop';

// Message helpers and types (legacy - for backward compatibility)
export {
  CODING_AGENT_SYSTEM_PROMPT,
  systemMessage,
  userMessage,
  assistantMessage,
  assistantToolCallMessage,
  toolResultMessage,
  ToolCallAccumulator,
  type ParsedToolCall,
} from './messages';

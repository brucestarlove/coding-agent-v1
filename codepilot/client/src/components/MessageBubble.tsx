/**
 * MessageBubble Component - Renders individual chat messages.
 * 
 * Starscape Design:
 * - User messages: Right-aligned, blue glass card
 * - Assistant messages: Left-aligned, purple aura with streaming cursor
 * - Content blocks rendered in order (text and tool calls interleaved)
 */

import type { Message, ContentBlock, ToolCall } from '../store/useAgentStore';

interface MessageBubbleProps {
  message: Message;
  /** Whether this message is currently streaming (shows cursor) */
  isStreaming?: boolean;
}

/**
 * Individual message bubble with role-specific styling.
 */
export function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-slide-up`}
    >
      <div
        className={`
          max-w-[80%] rounded-2xl px-4 py-3
          ${isUser ? 'bg-gradient-to-br from-blue-600/30 to-cyan-600/20 border border-blue-500/30' : 'bg-gradient-to-br from-violet-600/20 to-purple-600/10 border border-violet-500/20'}
          backdrop-blur-sm
        `}
      >
        {/* Role indicator */}
        <div
          className={`text-xs font-medium mb-1.5 ${isUser ? 'text-cyan-400' : 'text-violet-400'}`}
        >
          {isUser ? 'You' : 'CodePilot'}
        </div>

        {/* Message content */}
        <div className="text-white/90 text-sm leading-relaxed">
          {typeof message.content === 'string' ? (
            // User message - plain string
            <span className="whitespace-pre-wrap break-words">{message.content}</span>
          ) : (
            // Assistant message - ordered content blocks
            <ContentBlocksRenderer 
              blocks={message.content} 
              isStreaming={isStreaming} 
            />
          )}
        </div>

        {/* Timestamp */}
        <div className="text-xs text-white/30 mt-2">
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders an array of content blocks in order (text and tool calls interleaved).
 */
function ContentBlocksRenderer({ 
  blocks, 
  isStreaming 
}: { 
  blocks: ContentBlock[]; 
  isStreaming: boolean;
}) {
  return (
    <>
      {blocks.map((block, index) => {
        const isLastBlock = index === blocks.length - 1;
        
        if (block.type === 'text') {
          return (
            <span key={index} className="whitespace-pre-wrap break-words">
              {block.text}
              {/* Show streaming cursor only on last text block while streaming */}
              {isStreaming && isLastBlock && <StreamingCursor />}
            </span>
          );
        }
        
        if (block.type === 'tool_call') {
          return (
            <div key={block.toolCall.id} className="my-3">
              <ToolCallBadge toolCall={block.toolCall} />
            </div>
          );
        }
        
        return null;
      })}
      
      {/* If streaming and last block is a tool call, show cursor after it */}
      {isStreaming && 
       blocks.length > 0 && 
       blocks[blocks.length - 1].type === 'tool_call' && (
        <div className="mt-2">
          <StreamingCursor />
        </div>
      )}
    </>
  );
}

/**
 * Streaming cursor indicator - pulsing block cursor.
 */
function StreamingCursor() {
  return (
    <span className="inline-block w-2 h-4 ml-0.5 bg-violet-400 animate-pulse rounded-sm" />
  );
}

/**
 * Basic tool call display badge.
 * Phase 5 will expand this into full ToolCallView component.
 */
function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
  const statusColors = {
    pending: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
    completed: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
    error: 'bg-pink-500/20 border-pink-500/30 text-pink-400',
  };

  const statusIcons = {
    pending: '⏳',
    completed: '✓',
    error: '✗',
  };

  return (
    <div
      className={`
        rounded-lg px-3 py-2 text-xs font-mono border
        ${statusColors[toolCall.status]}
      `}
    >
      <div className="flex items-center gap-2">
        <span>{statusIcons[toolCall.status]}</span>
        <span className="font-semibold">{toolCall.name}</span>
      </div>
      
      {/* Show truncated input */}
      {toolCall.input && Object.keys(toolCall.input).length > 0 && (
        <div className="mt-1 text-white/50 truncate max-w-full">
          {JSON.stringify(toolCall.input).slice(0, 60)}
          {JSON.stringify(toolCall.input).length > 60 && '...'}
        </div>
      )}

      {/* Show error if present */}
      {toolCall.error && (
        <div className="mt-1 text-pink-400 truncate">{toolCall.error}</div>
      )}
    </div>
  );
}

/**
 * Format timestamp to readable time string.
 */
function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

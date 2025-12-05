/**
 * MessageBubble Component - Renders individual chat messages.
 * 
 * Starscape Design:
 * - User messages: Right-aligned, blue glass card
 * - Assistant messages: Left-aligned, purple aura with streaming cursor
 * - Content blocks rendered in order (text and tool calls interleaved)
 * - Markdown rendering with syntax highlighting
 * - Copy button for message content
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Message, ContentBlock } from '../store/useAgentStore';
import { ToolCallView } from './ToolCallView';

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
  const [copied, setCopied] = useState(false);

  // Get plain text content for copying
  const getTextContent = (): string => {
    if (typeof message.content === 'string') {
      return message.content;
    }
    // Extract text from content blocks
    return message.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getTextContent());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-slide-up group`}
    >
      <div
        className={`
          relative max-w-[80%] rounded-2xl px-4 py-3
          ${isUser ? 'bg-gradient-to-br from-blue-600/30 to-cyan-600/20 border border-blue-500/30' : 'bg-gradient-to-br from-violet-600/20 to-purple-600/10 border border-violet-500/20'}
          backdrop-blur-sm
        `}
      >
        {/* Header with role and copy button */}
        <div className="flex items-center justify-between mb-1.5">
          <div
            className={`text-xs font-medium ${isUser ? 'text-cyan-400' : 'text-violet-400'}`}
          >
            {isUser ? 'You' : 'CodePilot'}
          </div>
          
          {/* Copy button - visible on hover */}
          <button
            onClick={handleCopy}
            className={`
              text-xs px-2 py-0.5 rounded transition-all duration-200
              ${copied 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70 opacity-0 group-hover:opacity-100'
              }
            `}
            title="Copy as markdown"
          >
            {copied ? '✓ Copied' : '⧉ Copy'}
          </button>
        </div>

        {/* Message content */}
        <div className="text-white/90 text-sm leading-relaxed">
          {typeof message.content === 'string' ? (
            // User message - render as markdown too for consistency
            <MarkdownRenderer content={message.content} />
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
 * Renders markdown content with styled components.
 */
function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        // Headings
        h1: ({ children }) => (
          <h1 className="text-xl font-bold text-white mt-4 mb-2 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-semibold text-white mt-3 mb-2 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold text-white/90 mt-3 mb-1.5 first:mt-0">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-sm font-semibold text-white/90 mt-2 mb-1 first:mt-0">{children}</h4>
        ),
        
        // Paragraphs
        p: ({ children }) => (
          <p className="mb-2 last:mb-0">{children}</p>
        ),
        
        // Lists - tighter spacing
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-2 ml-1 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-2 ml-1 space-y-0.5">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-white/85 marker:text-white/50 [&_p]:inline [&_p]:mb-0 [&>pre]:mt-1 [&>ul]:mt-1 [&>ol]:mt-1">{children}</li>
        ),
        
        // Code blocks
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded bg-black/40 text-cyan-300 font-mono text-xs">
                {children}
              </code>
            );
          }
          // Block code
          return (
            <code
              className={`block font-mono text-xs ${className}`}
              {...props}
            >
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="bg-black/40 rounded-lg p-3 my-1.5 overflow-x-auto text-white/80 border border-white/10 first:mt-0">
            {children}
          </pre>
        ),
        
        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-violet-500/50 pl-3 my-2 text-white/70 italic">
            {children}
          </blockquote>
        ),
        
        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
          >
            {children}
          </a>
        ),
        
        // Strong and emphasis
        strong: ({ children }) => (
          <strong className="font-semibold text-white">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-white/80">{children}</em>
        ),
        
        // Horizontal rule
        hr: () => (
          <hr className="my-3 border-white/10" />
        ),
        
        // Tables
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-white/5">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-white/10">{children}</tbody>
        ),
        tr: ({ children }) => (
          <tr className="border-b border-white/10">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-2 py-1.5 text-left font-medium text-white/80">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-2 py-1.5 text-white/70">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
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
            <div key={index}>
              <MarkdownRenderer content={block.text} />
              {/* Show streaming cursor only on last text block while streaming */}
              {isStreaming && isLastBlock && <StreamingCursor />}
            </div>
          );
        }
        
        if (block.type === 'tool_call') {
          return (
            <div key={block.toolCall.id} className="my-3">
              <ToolCallView toolCall={block.toolCall} />
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
 * Format timestamp to readable time string.
 */
function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

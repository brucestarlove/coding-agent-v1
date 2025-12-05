/**
 * ToolCallView Component - Rich visualization for tool calls.
 * 
 * Displays tool inputs and results with tool-specific renderers,
 * expand/collapse functionality, and proper status states.
 * 
 * Starscape Design:
 * - Pending: Pulsing violet border, spinning indicator
 * - Completed: Emerald status badge, collapsible result
 * - Error: Pink border/badge, prominent error message
 */

import { useState } from 'react';
import type { ToolCall } from '../store/useAgentStore';

// ============================================================================
// Types for tool results
// ============================================================================

interface ReadFileResult {
  path: string;
  content: string;
}

interface WriteFileResult {
  path: string;
  status: string;
}

interface ListDirEntry {
  name: string;
  type: 'file' | 'dir';
}

interface ShellResult {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ============================================================================
// Main ToolCallView Component
// ============================================================================

interface ToolCallViewProps {
  toolCall: ToolCall;
}

/**
 * Main tool call visualization component.
 * Routes to tool-specific renderers based on tool name.
 */
export function ToolCallView({ toolCall }: ToolCallViewProps) {
  // Default to expanded for pending, collapsed for completed/error
  const [isExpanded, setIsExpanded] = useState(toolCall.status === 'pending');

  const statusStyles = {
    pending: 'border-violet-500/40 bg-violet-600/10',
    completed: 'border-emerald-500/30 bg-emerald-500/5',
    error: 'border-pink-500/40 bg-pink-500/10',
  };

  return (
    <div
      className={`
        rounded-lg border overflow-hidden
        ${statusStyles[toolCall.status]}
        ${toolCall.status === 'pending' ? 'animate-pulse-subtle' : ''}
      `}
    >
      {/* Header - always visible */}
      <ToolHeader
        toolCall={toolCall}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
      />

      {/* Body - collapsible */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1">
          <ToolBody toolCall={toolCall} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tool Header Component
// ============================================================================

interface ToolHeaderProps {
  toolCall: ToolCall;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * Shared header for all tool calls with icon, name, and status.
 */
function ToolHeader({ toolCall, isExpanded, onToggle }: ToolHeaderProps) {
  const toolIcons: Record<string, string> = {
    run_shell: '⌘',
    read_file: '📄',
    write_file: '✏️',
    list_dir: '📁',
  };

  const statusBadge = {
    pending: (
      <span className="flex items-center gap-1.5 text-violet-400">
        <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Running</span>
      </span>
    ),
    completed: (
      <span className="flex items-center gap-1 text-emerald-400">
        <span>✓</span>
        <span className="text-xs">Done</span>
      </span>
    ),
    error: (
      <span className="flex items-center gap-1 text-pink-400">
        <span>✗</span>
        <span className="text-xs">Error</span>
      </span>
    ),
  };

  // Generate a brief summary for the header
  const summary = getToolSummary(toolCall);

  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
    >
      {/* Tool icon */}
      <span className="text-base">{toolIcons[toolCall.name] ?? '🔧'}</span>

      {/* Tool name and summary */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white/90 text-sm">
            {formatToolName(toolCall.name)}
          </span>
          <span className="text-white/40 text-xs truncate">{summary}</span>
        </div>
      </div>

      {/* Status badge */}
      {statusBadge[toolCall.status]}

      {/* Expand/collapse chevron */}
      <span
        className={`text-white/40 transition-transform duration-200 ${
          isExpanded ? 'rotate-180' : ''
        }`}
      >
        ▾
      </span>
    </button>
  );
}

// ============================================================================
// Tool Body Router
// ============================================================================

/**
 * Routes to the appropriate tool-specific renderer.
 */
function ToolBody({ toolCall }: { toolCall: ToolCall }) {
  switch (toolCall.name) {
    case 'run_shell':
      return <ShellToolView toolCall={toolCall} />;
    case 'read_file':
      return <ReadFileToolView toolCall={toolCall} />;
    case 'write_file':
      return <WriteFileToolView toolCall={toolCall} />;
    case 'list_dir':
      return <ListDirToolView toolCall={toolCall} />;
    default:
      return <GenericToolView toolCall={toolCall} />;
  }
}

// ============================================================================
// Shell Tool View
// ============================================================================

/**
 * Renders shell command execution with stdout/stderr output.
 */
function ShellToolView({ toolCall }: { toolCall: ToolCall }) {
  const input = toolCall.input as { command?: string; cwd?: string };
  const result = toolCall.result as ShellResult | undefined;

  return (
    <div className="space-y-2">
      {/* Command display */}
      <div className="font-mono text-xs bg-black/30 rounded px-2 py-1.5 text-cyan-300 overflow-x-auto">
        <span className="text-white/40 select-none">$ </span>
        {input.command}
      </div>

      {/* Working directory if specified */}
      {input.cwd && input.cwd !== '.' && (
        <div className="text-xs text-white/40">
          in <span className="text-cyan-400">{input.cwd}</span>
        </div>
      )}

      {/* Error message */}
      {toolCall.error && <ErrorDisplay message={toolCall.error} />}

      {/* Result output */}
      {result && (
        <div className="space-y-2">
          {/* Stdout */}
          {result.stdout && (
            <OutputBlock
              label="stdout"
              content={result.stdout}
              variant="success"
            />
          )}

          {/* Stderr */}
          {result.stderr && (
            <OutputBlock
              label="stderr"
              content={result.stderr}
              variant={result.exitCode !== 0 ? 'error' : 'warning'}
            />
          )}

          {/* Exit code indicator */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-white/40">Exit code:</span>
            <span
              className={
                result.exitCode === 0 ? 'text-emerald-400' : 'text-pink-400'
              }
            >
              {result.exitCode}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Read File Tool View
// ============================================================================

/**
 * Renders file read operation with content preview.
 */
function ReadFileToolView({ toolCall }: { toolCall: ToolCall }) {
  const input = toolCall.input as { path?: string };
  const result = toolCall.result as ReadFileResult | undefined;

  const lineCount = result?.content?.split('\n').length ?? 0;

  return (
    <div className="space-y-2">
      {/* File path */}
      <FilePath path={input.path ?? 'unknown'} />

      {/* Error message */}
      {toolCall.error && <ErrorDisplay message={toolCall.error} />}

      {/* File content */}
      {result?.content && (
        <div className="space-y-1">
          <div className="text-xs text-white/40">{lineCount} lines</div>
          <CodeBlock content={result.content} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Write File Tool View
// ============================================================================

/**
 * Renders file write operation with content preview.
 */
function WriteFileToolView({ toolCall }: { toolCall: ToolCall }) {
  const input = toolCall.input as { path?: string; content?: string };
  const result = toolCall.result as WriteFileResult | undefined;

  const lineCount = input.content?.split('\n').length ?? 0;

  return (
    <div className="space-y-2">
      {/* File path */}
      <FilePath path={input.path ?? 'unknown'} />

      {/* Error message */}
      {toolCall.error && <ErrorDisplay message={toolCall.error} />}

      {/* Success indicator */}
      {result?.status === 'ok' && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <span>✓</span>
          <span>File written successfully</span>
        </div>
      )}

      {/* Content preview (what was written) */}
      {input.content && (
        <div className="space-y-1">
          <div className="text-xs text-white/40">
            {lineCount} lines written
          </div>
          <CodeBlock content={input.content} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// List Directory Tool View
// ============================================================================

/**
 * Renders directory listing as a grid of entries.
 */
function ListDirToolView({ toolCall }: { toolCall: ToolCall }) {
  const input = toolCall.input as { path?: string };
  const result = toolCall.result as ListDirEntry[] | undefined;

  return (
    <div className="space-y-2">
      {/* Directory path */}
      <FilePath path={input.path ?? '.'} isDirectory />

      {/* Error message */}
      {toolCall.error && <ErrorDisplay message={toolCall.error} />}

      {/* Directory entries */}
      {result && result.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
          {result.map((entry) => (
            <div
              key={entry.name}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/20 text-xs truncate"
            >
              <span>{entry.type === 'dir' ? '📁' : '📄'}</span>
              <span
                className={
                  entry.type === 'dir' ? 'text-cyan-400' : 'text-white/70'
                }
              >
                {entry.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Empty directory */}
      {result && result.length === 0 && (
        <div className="text-xs text-white/40 italic">Empty directory</div>
      )}
    </div>
  );
}

// ============================================================================
// Generic Tool View (Fallback)
// ============================================================================

/**
 * Fallback renderer for unknown tools.
 */
function GenericToolView({ toolCall }: { toolCall: ToolCall }) {
  return (
    <div className="space-y-2">
      {/* Input JSON */}
      {Object.keys(toolCall.input).length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-white/40">Input</div>
          <pre className="font-mono text-xs bg-black/30 rounded px-2 py-1.5 text-white/70 overflow-x-auto">
            {JSON.stringify(toolCall.input, null, 2)}
          </pre>
        </div>
      )}

      {/* Error message */}
      {toolCall.error && <ErrorDisplay message={toolCall.error} />}

      {/* Result JSON */}
      {toolCall.result && (
        <div className="space-y-1">
          <div className="text-xs text-white/40">Result</div>
          <pre className="font-mono text-xs bg-black/30 rounded px-2 py-1.5 text-white/70 overflow-x-auto">
            {JSON.stringify(toolCall.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Shared UI Components
// ============================================================================

/**
 * File path display chip.
 */
function FilePath({
  path,
  isDirectory = false,
}: {
  path: string;
  isDirectory?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span>{isDirectory ? '📁' : '📄'}</span>
      <span className="font-mono text-cyan-400">{path}</span>
    </div>
  );
}

/**
 * Code/content block with truncation and expand functionality.
 */
function CodeBlock({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const lines = content.split('\n');
  const isTruncated = lines.length > 10 || content.length > 500;

  // Show first 10 lines or 500 chars when collapsed
  const displayContent = isExpanded
    ? content
    : lines.length > 10
      ? lines.slice(0, 10).join('\n') + '\n...'
      : content.length > 500
        ? content.slice(0, 500) + '...'
        : content;

  return (
    <div className="relative">
      <pre
        className={`
          font-mono text-xs bg-black/30 rounded px-2 py-1.5 text-white/70 
          overflow-x-auto whitespace-pre-wrap break-words
          ${isExpanded ? 'max-h-96' : 'max-h-48'} overflow-y-auto
        `}
      >
        {displayContent}
      </pre>

      {/* Show more/less button */}
      {isTruncated && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          {isExpanded ? '← Show less' : `Show all ${lines.length} lines →`}
        </button>
      )}
    </div>
  );
}

/**
 * Output block for stdout/stderr with color variants.
 */
function OutputBlock({
  label,
  content,
  variant,
}: {
  label: string;
  content: string;
  variant: 'success' | 'warning' | 'error';
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const variantStyles = {
    success: 'border-l-emerald-500/50',
    warning: 'border-l-yellow-500/50',
    error: 'border-l-pink-500/50',
  };

  const lines = content.split('\n');
  const isTruncated = lines.length > 10 || content.length > 500;

  const displayContent = isExpanded
    ? content
    : lines.length > 10
      ? lines.slice(0, 10).join('\n') + '\n...'
      : content.length > 500
        ? content.slice(0, 500) + '...'
        : content;

  return (
    <div className={`border-l-2 ${variantStyles[variant]} pl-2`}>
      <div className="text-xs text-white/40 mb-1">{label}</div>
      <pre
        className={`
          font-mono text-xs bg-black/20 rounded px-2 py-1.5 text-white/70
          overflow-x-auto whitespace-pre-wrap break-words
          ${isExpanded ? 'max-h-96' : 'max-h-48'} overflow-y-auto
        `}
      >
        {displayContent}
      </pre>

      {isTruncated && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          {isExpanded ? '← Show less' : `Show all ${lines.length} lines →`}
        </button>
      )}
    </div>
  );
}

/**
 * Error message display.
 */
function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 bg-pink-500/10 border border-pink-500/30 rounded px-2 py-1.5">
      <span className="text-pink-400">⚠</span>
      <span className="text-xs text-pink-300 break-words">{message}</span>
    </div>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format tool name for display.
 */
function formatToolName(name: string): string {
  const names: Record<string, string> = {
    run_shell: 'Shell',
    read_file: 'Read File',
    write_file: 'Write File',
    list_dir: 'List Directory',
  };
  return names[name] ?? name;
}

/**
 * Generate a brief summary for the tool header.
 */
function getToolSummary(toolCall: ToolCall): string {
  const input = toolCall.input as Record<string, unknown>;

  switch (toolCall.name) {
    case 'run_shell':
      return truncate(String(input.command ?? ''), 40);
    case 'read_file':
    case 'write_file':
      return String(input.path ?? '');
    case 'list_dir':
      return String(input.path ?? '.');
    default:
      return '';
  }
}

/**
 * Truncate string with ellipsis.
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}


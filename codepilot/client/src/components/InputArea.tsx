/**
 * InputArea Component - Message input with send button.
 * 
 * Features:
 * - Glass-pill input field (Starscape design)
 * - Send button (disabled during streaming)
 * - Enter to send, Shift+Enter for newline
 * - Stop button when streaming
 */

import { useState, useRef, useEffect, type KeyboardEvent, type FocusEvent } from 'react';
import { useAgentStore, type TokenUsage, type ModelOption, type CommandOption } from '../store/useAgentStore';
import { useDelayedHover } from '../hooks/useDelayedHover';
import { TooltipContent } from './Tooltip';

/**
 * Input area docked at bottom of chat - the "Helm" in Starscape terminology.
 */
export function InputArea() {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const status = useAgentStore((state) => state.status);
  const sendMessage = useAgentStore((state) => state.sendMessage);
  const stopAgent = useAgentStore((state) => state.stopAgent);
  const tokenUsage = useAgentStore((state) => state.tokenUsage);
  const selectedModel = useAgentStore((state) => state.selectedModel);
  const availableModels = useAgentStore((state) => state.availableModels);
  const setSelectedModel = useAgentStore((state) => state.setSelectedModel);
  const selectedCommand = useAgentStore((state) => state.selectedCommand);
  const availableCommands = useAgentStore((state) => state.availableCommands);
  const setSelectedCommand = useAgentStore((state) => state.setSelectedCommand);
  const setPlansSheetOpen = useAgentStore((state) => state.setPlansSheetOpen);

  const isStreaming = status === 'streaming';
  
  // Get context window for selected model
  const contextWindow = availableModels.find(m => m.id === selectedModel)?.contextWindow || 200000;
  const canSend = input.trim().length > 0 && !isStreaming;

  // Delayed hover for keyboard hints tooltip (2 second delay)
  const { isHovered: showKeyboardHints, hoverProps: keyboardHintsHoverProps } = useDelayedHover({ 
    showDelay: 2000 
  });

  /**
   * Handle form submission
   */
  const handleSubmit = () => {
    if (!canSend) return;

    sendMessage(input.trim());
    setInput('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  /**
   * Handle keyboard shortcuts
   * - Enter: Send message
   * - Shift+Enter: New line
   * - Escape: Stop agent (if streaming)
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape' && isStreaming) {
      stopAgent();
    }
  };

  /**
   * Auto-resize textarea as content grows
   */
  const handleInput = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set height to scrollHeight, capped at 200px
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  /**
   * Focus input on mount
   */
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="border-t border-white/10 bg-[hsl(222,84%,4%)] px-6 py-4">
      <div className="max-w-4xl mx-auto">
        {/* Input container - glass pill style */}
        <div className="flex items-end gap-3">
          {/* Left side: Command selector + Plans button */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            <CommandSelector
              commands={availableCommands}
              selectedCommand={selectedCommand}
              onSelectCommand={setSelectedCommand}
              disabled={isStreaming}
            />
            <button
              onClick={() => setPlansSheetOpen(true)}
              disabled={isStreaming}
              className="
                flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                bg-white/5 border border-white/10
                text-white/50 hover:text-white/80 hover:bg-white/10
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-200
              "
              title="Browse saved plans"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Plans
            </button>
          </div>

          {/* Textarea */}
          <div 
            className="flex-1 relative"
            {...keyboardHintsHoverProps}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder={isStreaming ? 'Waiting for response...' : 'Ask CodePilot anything...'}
              aria-label={isStreaming ? 'Waiting for response' : 'Ask CodePilot anything'}
              disabled={isStreaming}
              rows={1}
              className="
                w-full resize-none rounded-2xl
                bg-white/5 border border-white/10
                px-4 py-3 pr-12
                text-white/90 text-sm leading-relaxed
                placeholder:text-white/30
                focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.07]
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200
              "
            />

            {/* Character count (optional, shows when typing) */}
            {input.length > 100 && (
              <div className="absolute right-3 bottom-3 text-xs text-white/30">
                {input.length}
              </div>
            )}

            {/* Keyboard hints tooltip */}
            {showKeyboardHints && (
              <TooltipContent position="top" className="text-white/50">
                <div className="flex items-center gap-3">
                  <span>
                    <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/70">Enter</kbd>
                    <span className="ml-1 text-white/40">send</span>
                  </span>
                  <span className="text-white/20">·</span>
                  <span>
                    <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/70">Shift+Enter</kbd>
                    <span className="ml-1 text-white/40">new line</span>
                  </span>
                  {isStreaming && (
                    <>
                      <span className="text-white/20">·</span>
                      <span>
                        <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/70">Esc</kbd>
                        <span className="ml-1 text-white/40">stop</span>
                      </span>
                    </>
                  )}
                </div>
              </TooltipContent>
            )}
          </div>

          {/* Send / Stop button */}
          {isStreaming ? (
            <StopButton onClick={stopAgent} />
          ) : (
            <SendButton onClick={handleSubmit} disabled={!canSend} />
          )}
        </div>

        {/* Working directory + Token usage + Model selector */}
        <div className="mt-2 flex justify-between items-center text-xs text-white/30">
          {/* Left: Working directory */}
          <WorkingDirDisplay />

          {/* Center: Token usage */}
          <div className="flex-shrink-0">
            {tokenUsage && <TokenUsageBadge usage={tokenUsage} contextWindow={contextWindow} />}
          </div>

          {/* Right: Model selector */}
          <ModelSelector
            models={availableModels}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            disabled={isStreaming}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Send button - "Big Bang" launch button.
 */
function SendButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="
        w-12 h-12 rounded-full
        bg-gradient-to-br from-violet-500 to-purple-600
        flex items-center justify-center
        text-white text-lg
        hover:from-violet-400 hover:to-purple-500
        disabled:opacity-30 disabled:cursor-not-allowed
        transition-all duration-200
        hover:scale-105 active:scale-95
        disabled:hover:scale-100
        shadow-lg shadow-violet-500/20
      "
      aria-label="Send message"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 2L11 13" />
        <path d="M22 2L15 22L11 13L2 9L22 2Z" />
      </svg>
    </button>
  );
}

/**
 * Stop button - appears during streaming.
 */
function StopButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="
        w-12 h-12 rounded-full
        bg-gradient-to-br from-pink-500 to-rose-600
        flex items-center justify-center
        text-white
        hover:from-pink-400 hover:to-rose-500
        transition-all duration-200
        hover:scale-105 active:scale-95
        shadow-lg shadow-pink-500/20
        animate-pulse
      "
      aria-label="Stop agent"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
    </button>
  );
}

/**
 * Editable working directory display.
 * Click to edit, Enter or blur to save.
 */
function WorkingDirDisplay() {
  const workingDir = useAgentStore((state) => state.workingDir);
  const setWorkingDir = useAgentStore((state) => state.setWorkingDir);
  const status = useAgentStore((state) => state.status);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = () => {
    // Don't allow editing while streaming
    if (status === 'streaming') return;
    
    setEditValue(workingDir || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== workingDir) {
      await setWorkingDir(trimmed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleBlur = (_e: FocusEvent<HTMLInputElement>) => {
    // Small delay to allow click events to fire first
    setTimeout(() => handleSave(), 100);
  };

  // Format path for display - show last 2-3 segments
  const formatPath = (path: string | null): string => {
    if (!path) return '~/';
    const segments = path.split('/').filter(Boolean);
    if (segments.length <= 2) return path;
    return '…/' + segments.slice(-2).join('/');
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1.5">
        <FolderIcon />
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="
            bg-white/10 border border-violet-500/50 rounded px-2 py-0.5
            text-white/80 text-xs
            focus:outline-none focus:border-violet-500
            min-w-[200px] max-w-[400px]
          "
          placeholder="/path/to/project"
        />
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'streaming'}
      className="
        flex items-center gap-1.5
        hover:text-white/50 
        disabled:cursor-not-allowed disabled:opacity-50
        transition-colors duration-150
        group
      "
      title={workingDir || 'Click to set working directory'}
    >
      <FolderIcon />
      <span className="group-hover:underline underline-offset-2">
        {formatPath(workingDir)}
      </span>
    </button>
  );
}

/**
 * Token usage badge - shows context window usage with detailed hover tooltip.
 * 
 * Displays two key metrics:
 * - Context Window: Accurate pre-send token count (from tiktoken)
 * - API Usage: Cumulative tokens used across all calls (for cost awareness)
 */
function TokenUsageBadge({ usage, contextWindow }: { usage: TokenUsage; contextWindow: number }) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  // Format large numbers with K/M suffix
  const formatTokens = (n: number): string => {
    if (n >= 1000000) {
      return `${(n / 1000000).toFixed(1)}M`;
    }
    if (n >= 1000) {
      return `${(n / 1000).toFixed(1)}K`;
    }
    return n.toLocaleString();
  };

  // Calculate context window percentage (the metric that matters for limits)
  const contextPercentage = Math.min((usage.contextTokens / contextWindow) * 100, 100);
  const contextPercentageDisplay = usage.contextTokens === 0 
    ? '—' 
    : contextPercentage < 1 
      ? '<1%' 
      : `${contextPercentage.toFixed(0)}%`;

  // Color based on context window usage (this is what affects model behavior)
  const getContextColor = () => {
    if (contextPercentage >= 90) return 'text-pink-400';
    if (contextPercentage >= 70) return 'text-amber-400';
    if (contextPercentage >= 50) return 'text-yellow-400/70';
    return 'text-violet-400/70';
  };

  // Progress bar width
  const progressWidth = Math.min(contextPercentage, 100);
  
  // Source indicator
  const sourceLabel = usage.contextSource === 'tiktoken' 
    ? 'tiktoken' 
    : usage.contextSource === 'heuristic' 
      ? '~estimate' 
      : '—';

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Main display - context percentage with mini progress bar */}
      <div
        className={`
          flex items-center gap-2 px-2 py-0.5 rounded
          cursor-default select-none
          text-white/40 hover:text-white/60
          transition-colors duration-150
        `}
      >
        {/* Context window icon */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={getContextColor()}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" />
        </svg>
        
        {/* Mini progress bar */}
        <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-300 ${
              contextPercentage >= 90 ? 'bg-pink-400' :
              contextPercentage >= 70 ? 'bg-amber-400' :
              contextPercentage >= 50 ? 'bg-yellow-400' :
              'bg-violet-400'
            }`}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
        
        <span className={`font-mono tabular-nums text-[11px] ${getContextColor()}`}>
          {contextPercentageDisplay}
        </span>
      </div>

      {/* Tooltip with detailed breakdown */}
      {showTooltip && (
        <div
          className="
            absolute bottom-full left-1/2 -translate-x-1/2 mb-2
            px-3 py-2.5 rounded-lg
            bg-[hsl(222,84%,6%)] border border-white/10
            shadow-xl shadow-black/50
            text-xs text-white/70
            whitespace-nowrap z-50
            animate-fade-in
            min-w-[240px]
          "
        >
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="border-4 border-transparent border-t-white/10" />
          </div>
          
          {/* Content */}
          <div className="space-y-2">
            {/* Context Window Section */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40">
                  Context Window
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                  usage.contextAccurate 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {sourceLabel}
                </span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-white/60">Current size:</span>
                <span className={`font-mono tabular-nums font-medium ${getContextColor()}`}>
                  {formatTokens(usage.contextTokens)} / {formatTokens(contextWindow)}
                </span>
              </div>
              {/* Progress bar */}
              <div className="mt-1.5 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    contextPercentage >= 90 ? 'bg-pink-400' :
                    contextPercentage >= 70 ? 'bg-amber-400' :
                    contextPercentage >= 50 ? 'bg-yellow-400' :
                    'bg-violet-400'
                  }`}
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
            </div>

            <div className="border-t border-white/10" />

            {/* API Usage Section (cumulative) */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                Session API Usage <span className="normal-case text-white/30">(for cost)</span>
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between gap-4">
                  <span className="text-white/50">Prompt tokens:</span>
                  <span className="font-mono tabular-nums text-white/70">
                    {formatTokens(usage.totalPromptTokens)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-white/50">Completion tokens:</span>
                  <span className="font-mono tabular-nums text-white/70">
                    {formatTokens(usage.totalCompletionTokens)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 pt-1 border-t border-white/5">
                  <span className="text-white/50">Total API:</span>
                  <span className="font-mono tabular-nums text-white/90 font-medium">
                    {formatTokens(usage.totalApiTokens)}
                  </span>
                </div>
              </div>
            </div>

            {/* Last call info */}
            {usage.lastPromptTokens > 0 && (
              <>
                <div className="border-t border-white/10" />
                <div className="text-[10px] text-white/30">
                  Last API response: {formatTokens(usage.lastPromptTokens)} prompt → {formatTokens(usage.lastCompletionTokens)} completion
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Small folder icon for working directory display
 */
function FolderIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-60"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/**
 * Model selector dropdown.
 */
function ModelSelector({
  models,
  selectedModel,
  onSelectModel,
  disabled,
}: {
  models: ModelOption[];
  selectedModel: string | null;
  onSelectModel: (modelId: string) => void;
  disabled: boolean;
}) {
  if (models.length === 0) {
    return <div className="flex-shrink-0" />;
  }

  return (
    <div className="relative flex-shrink-0">
      <select
        value={selectedModel || ''}
        onChange={(e) => onSelectModel(e.target.value)}
        disabled={disabled}
        className="
          appearance-none cursor-pointer
          px-2 py-0.5 pr-6 rounded text-xs
          bg-transparent border-none
          text-white/50 hover:text-white/70
          focus:outline-none focus:text-white/70
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-200
        "
      >
        {models.map((model) => (
          <option key={model.id} value={model.id} className="bg-[hsl(222,84%,8%)] text-white">
            {model.name}
          </option>
        ))}
      </select>
      {/* Dropdown arrow */}
      <svg
        className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30 pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

/**
 * Command selector dropdown - opens upward above the button.
 */
function CommandSelector({
  commands,
  selectedCommand,
  onSelectCommand,
  disabled,
}: {
  commands: CommandOption[];
  selectedCommand: string | null;
  onSelectCommand: (commandId: string) => void;
  disabled: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = commands.find((c) => c.id === selectedCommand);

  // Command icon based on type
  const getCommandIcon = (commandId: string) => {
    switch (commandId) {
      case 'research':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        );
      case 'create_plan':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        );
      case 'revise_plan':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        );
      case 'implement':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        );
      default: // chat
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        );
    }
  };

  if (commands.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="
          flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs w-28
          bg-violet-500/20 border border-violet-500/30
          text-violet-200 hover:text-white hover:bg-violet-500/30
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-200
        "
      >
        {selected && getCommandIcon(selected.id)}
        <span className="font-medium flex-1 truncate">{selected?.name || 'Chat'}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="6 15 12 9 18 15" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          {/* Dropdown - opens ABOVE the button */}
          <div className="absolute left-0 bottom-full mb-2 w-72 rounded-lg bg-[hsl(222,84%,6%)] border border-white/10 shadow-xl z-50 py-1 animate-fade-in">
            {commands.map((command) => (
              <button
                key={command.id}
                onClick={() => {
                  onSelectCommand(command.id);
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-2.5 text-left
                  hover:bg-white/5 transition-colors
                  ${selectedCommand === command.id ? 'bg-violet-500/10 text-violet-200' : 'text-white/70'}
                `}
              >
                <div className={`
                  w-7 h-7 rounded-md flex items-center justify-center
                  ${selectedCommand === command.id ? 'bg-violet-500/20' : 'bg-white/5'}
                `}>
                  {getCommandIcon(command.id)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{command.name}</div>
                  <div className="text-xs text-white/40">{command.description}</div>
                </div>
                {selectedCommand === command.id && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-violet-400"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


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
import { useAgentStore, type TokenUsage, type ModelOption } from '../store/useAgentStore';

/**
 * Input area docked at bottom of chat - the "Helm" in Starscape terminology.
 */
export function InputArea() {
  const [input, setInput] = useState('');
  const [showKeyboardHints, setShowKeyboardHints] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const status = useAgentStore((state) => state.status);
  const sendMessage = useAgentStore((state) => state.sendMessage);
  const stopAgent = useAgentStore((state) => state.stopAgent);
  const tokenUsage = useAgentStore((state) => state.tokenUsage);
  const selectedModel = useAgentStore((state) => state.selectedModel);
  const availableModels = useAgentStore((state) => state.availableModels);
  const setSelectedModel = useAgentStore((state) => state.setSelectedModel);

  const isStreaming = status === 'streaming';
  
  // Get context window for selected model
  const contextWindow = availableModels.find(m => m.id === selectedModel)?.contextWindow || 200000;
  const canSend = input.trim().length > 0 && !isStreaming;

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
          <div 
            className="flex-1 relative"
            onMouseEnter={() => setShowKeyboardHints(true)}
            onMouseLeave={() => setShowKeyboardHints(false)}
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
              <div
                className="
                  absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                  px-3 py-2 rounded-lg
                  bg-[hsl(222,84%,8%)] border border-white/10
                  shadow-xl shadow-black/50
                  text-xs text-white/50
                  whitespace-nowrap z-50
                  animate-fade-in
                "
              >
                {/* Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                  <div className="border-4 border-transparent border-t-white/10" />
                </div>
                
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
              </div>
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
 * Token usage badge - shows context usage percentage with detailed hover tooltip.
 */
function TokenUsageBadge({ usage, contextWindow }: { usage: TokenUsage; contextWindow: number }) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  // Format large numbers with K suffix
  const formatTokens = (n: number): string => {
    if (n >= 1000000) {
      return `${(n / 1000000).toFixed(1)}M`;
    }
    if (n >= 1000) {
      return `${(n / 1000).toFixed(1)}K`;
    }
    return n.toLocaleString();
  };

  // Calculate percentage of context window used
  const percentage = Math.min((usage.total / contextWindow) * 100, 100);
  const percentageDisplay = percentage < 1 ? '<1%' : `${percentage.toFixed(1)}%`;

  // Color based on usage
  const getColor = () => {
    if (percentage >= 90) return 'text-pink-400';
    if (percentage >= 70) return 'text-amber-400';
    return 'text-violet-400/70';
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Main display - percentage */}
      <div
        className={`
          flex items-center gap-1.5 px-2 py-0.5 rounded
          cursor-default select-none
          text-white/40 hover:text-white/60
          transition-colors duration-150
        `}
      >
        {/* Token icon */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={getColor()}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v12" />
          <path d="M6 12h12" />
        </svg>
        <span className={`font-mono tabular-nums text-[11px] ${getColor()}`}>
          {percentageDisplay}
        </span>
      </div>

      {/* Tooltip with detailed info */}
      {showTooltip && (
        <div
          className="
            absolute bottom-full left-1/2 -translate-x-1/2 mb-2
            px-3 py-2 rounded-lg
            bg-[hsl(222,84%,8%)] border border-white/10
            shadow-xl shadow-black/50
            text-xs text-white/70
            whitespace-nowrap z-50
            animate-fade-in
          "
        >
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="border-4 border-transparent border-t-white/10" />
          </div>
          
          {/* Content */}
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-white/50">Prompt:</span>
              <span className="font-mono tabular-nums text-white/80">{formatTokens(usage.prompt)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-white/50">Completion:</span>
              <span className="font-mono tabular-nums text-white/80">{formatTokens(usage.completion)}</span>
            </div>
            <div className="border-t border-white/10 my-1.5" />
            <div className="flex justify-between gap-4">
              <span className="text-white/50">Total:</span>
              <span className="font-mono tabular-nums text-white/90 font-medium">
                {formatTokens(usage.total)} / {formatTokens(contextWindow)}
              </span>
            </div>
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


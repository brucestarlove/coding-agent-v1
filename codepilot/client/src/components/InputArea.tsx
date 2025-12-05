/**
 * InputArea Component - Message input with send button.
 * 
 * Features:
 * - Glass-pill input field (Starscape design)
 * - Send button (disabled during streaming)
 * - Enter to send, Shift+Enter for newline
 * - Stop button when streaming
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useAgentStore } from '../store/useAgentStore';

/**
 * Input area docked at bottom of chat - the "Helm" in Starscape terminology.
 */
export function InputArea() {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const status = useAgentStore((state) => state.status);
  const sendMessage = useAgentStore((state) => state.sendMessage);
  const stopAgent = useAgentStore((state) => state.stopAgent);

  const isStreaming = status === 'streaming';
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
          <div className="flex-1 relative">
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
          </div>

          {/* Send / Stop button */}
          {isStreaming ? (
            <StopButton onClick={stopAgent} />
          ) : (
            <SendButton onClick={handleSubmit} disabled={!canSend} />
          )}
        </div>

        {/* Keyboard hints */}
        <div className="mt-2 flex justify-between text-xs text-white/30">
          <span>
            <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-white/50">Enter</kbd> to send
            <span className="mx-2">·</span>
            <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-white/50">Shift+Enter</kbd> for new line
          </span>
          {isStreaming && (
            <span>
              <kbd className="px-1.5 py-0.5 bg-white/5 rounded text-white/50">Esc</kbd> to stop
            </span>
          )}
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


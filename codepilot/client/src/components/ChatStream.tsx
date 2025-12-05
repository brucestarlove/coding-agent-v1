/**
 * ChatStream Component - Message list container with auto-scroll.
 * 
 * Displays:
 * - Historical messages from store
 * - Currently streaming assistant response
 * - Tool calls inline with text (preserving order)
 */

import { useAgentStore, type Message } from '../store/useAgentStore';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { MessageBubble } from './MessageBubble';

/**
 * Main chat stream component - renders all messages with auto-scroll.
 */
export function ChatStream() {
  const messages = useAgentStore((state) => state.messages);
  const currentContent = useAgentStore((state) => state.currentContent);
  const status = useAgentStore((state) => state.status);
  const error = useAgentStore((state) => state.error);

  const isStreaming = status === 'streaming';

  // Auto-scroll when messages or streaming content changes
  const { containerRef } = useAutoScroll({
    deps: [messages, currentContent],
    enabled: true,
  });

  // Create a temporary message for the streaming response
  const streamingMessage: Message | null =
    isStreaming && currentContent.length > 0
      ? {
          id: 'streaming',
          role: 'assistant',
          content: currentContent,
          timestamp: new Date(),
        }
      : null;

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-6 py-4 scroll-smooth"
    >
      {/* Empty state */}
      {messages.length === 0 && !streamingMessage && (
        <EmptyState />
      )}

      {/* Message list */}
      <div className="max-w-4xl mx-auto">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Currently streaming message */}
        {streamingMessage && (
          <MessageBubble message={streamingMessage} isStreaming />
        )}

        {/* Loading indicator when waiting for first response */}
        {isStreaming && currentContent.length === 0 && (
          <LoadingIndicator />
        )}

        {/* Error display */}
        {error && <ErrorDisplay error={error} />}
      </div>
    </div>
  );
}

/**
 * Empty state when no messages exist.
 */
function EmptyState() {
  const setSessionSheetOpen = useAgentStore((state) => state.setSessionSheetOpen);

  const handleChooseDirectory = () => {
    // Stub - to be implemented with file picker
    console.log('[EmptyState] Choose Directory clicked - not yet implemented');
  };

  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      {/* Synthetic Star - pulsing orb */}
      <div className="relative mb-8">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 animate-pulse" />
        <div className="absolute inset-0 w-20 h-20 rounded-full bg-violet-500/30 animate-ping" />
      </div>

      <h2 className="text-2xl font-semibold text-white/90 mb-2">
        Welcome to CodePilot
      </h2>
      <p className="text-white/50 max-w-md">
        Your AI-powered coding assistant. Ask me to read files, write code,
        or run shell commands.
      </p>

      {/* Example prompts */}
      <div className="mt-8 grid gap-3 text-sm">
        <ExamplePrompt text="Create a hello.ts file with a greeting function" />
        <ExamplePrompt text="Read package.json and summarize the dependencies" />
        <ExamplePrompt text="Run ls -la and explain the output" />
      </div>

      {/* Action buttons */}
      <div className="mt-8 flex gap-4 justify-center">
        <button
          onClick={handleChooseDirectory}
          className="
            px-5 py-2.5 rounded-lg text-sm font-medium
            bg-white/5 border border-white/10
            text-white/60 hover:text-white/90 hover:bg-white/10 hover:border-violet-500/30
            transition-all duration-200
            flex items-center gap-2
          "
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Choose Directory
        </button>

        <button
          onClick={() => setSessionSheetOpen(true)}
          className="
            px-5 py-2.5 rounded-lg text-sm font-medium
            bg-violet-500/20 border border-violet-500/30
            text-violet-300 hover:text-violet-200 hover:bg-violet-500/30
            transition-all duration-200
            flex items-center gap-2
          "
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
          Select Session
        </button>
      </div>
    </div>
  );
}

/**
 * Example prompt suggestion chip.
 */
function ExamplePrompt({ text }: { text: string }) {
  const sendMessage = useAgentStore((state) => state.sendMessage);

  return (
    <button
      onClick={() => sendMessage(text)}
      className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70
        hover:bg-white/10 hover:border-violet-500/30 hover:text-white/90
        transition-all duration-200 text-left"
    >
      <span className="text-violet-400 mr-2">→</span>
      {text}
    </button>
  );
}

/**
 * Loading indicator when waiting for response.
 */
function LoadingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-violet-600/10 border border-violet-500/20 rounded-2xl px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" />
          </div>
          <span className="text-violet-400 text-sm">Thinking...</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Error display component.
 */
function ErrorDisplay({ error }: { error: string }) {
  const clearSession = useAgentStore((state) => state.clearSession);

  return (
    <div className="flex justify-center mb-4">
      <div className="bg-pink-500/10 border border-pink-500/30 rounded-xl px-4 py-3 max-w-lg">
        <div className="flex items-start gap-3">
          <span className="text-pink-400 text-lg">⚠</span>
          <div className="flex-1">
            <div className="text-pink-400 font-medium text-sm mb-1">Error</div>
            <div className="text-white/70 text-sm">{error}</div>
            <button
              onClick={clearSession}
              className="mt-2 text-xs text-pink-400 hover:text-pink-300 underline"
            >
              Clear and try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

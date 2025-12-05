/**
 * CodePilot - Main Application Component
 * 
 * Phase 6: Session Controls & Polish
 * Starscape Voyager design - "Interstellar Cockpit" aesthetic.
 */

import { useEffect } from 'react';
import { ChatStream } from './components/ChatStream';
import { InputArea } from './components/InputArea';
import { useSSE } from './hooks/useSSE';
import { useAgentStore } from './store/useAgentStore';

/**
 * Root application component.
 * Layout: Header + ErrorBanner + ChatStream + InputArea (docked bottom)
 */
function App() {
  // Initialize SSE connection manager
  useSSE();

  // Fetch available models on mount
  const fetchAvailableModels = useAgentStore((state) => state.fetchAvailableModels);
  useEffect(() => {
    fetchAvailableModels();
  }, [fetchAvailableModels]);

  const status = useAgentStore((state) => state.status);
  const error = useAgentStore((state) => state.error);

  return (
    <div className="h-screen flex flex-col bg-[url('/GeminiNB2-Starscape.png')] bg-cover bg-center bg-no-repeat text-white relative">
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/40" />
      
      {/* Content wrapper above overlay */}
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        {/* Header - Status bar */}
        <Header />

        {/* Error banner - shows below header when in error state */}
        {status === 'error' && error && <ErrorBanner error={error} />}

        {/* Main content - Chat stream */}
        <ChatStream />

        {/* Input area - The Helm */}
        <InputArea />
      </div>
    </div>
  );
}

/**
 * Header component with branding and session status.
 */
function Header() {
  const status = useAgentStore((state) => state.status);
  const sessionId = useAgentStore((state) => state.sessionId);
  const clearSession = useAgentStore((state) => state.clearSession);

  return (
    <header className="border-b border-white/10 px-6 py-3 flex items-center justify-between bg-[hsl(222,84%,4%)]">
      {/* Branding */}
      <div className="flex items-center gap-2">
        <img 
          src="/nova01.png" 
          alt="Nova" 
          className="h-10 w-auto"
        />
        <img 
          src="/nova04.png" 
          alt="Nova" 
          className="h-8 w-auto"
        />
      </div>

      {/* Session controls */}
      <div className="flex items-center gap-3">
        {/* Status orb */}
        <StatusOrb status={status} />
        
        {/* Status text */}
        <StatusBadge status={status} />

        {/* Session ID (truncated) */}
        {sessionId && (
          <span className="text-xs text-white/30 font-mono">
            {sessionId.slice(0, 8)}
          </span>
        )}

        {/* Clear button */}
        <button
          onClick={clearSession}
          className="
            px-3 py-1.5 rounded-lg text-xs
            bg-white/5 border border-white/10
            text-white/50 hover:text-white/80 hover:bg-white/10
            transition-colors duration-200
          "
        >
          Clear
        </button>
      </div>
    </header>
  );
}


/**
 * Status orb - "Synthetic Star" visual indicator of agent state.
 */
function StatusOrb({ status }: { status: string }) {
  const colors = {
    idle: 'from-violet-500 to-purple-600',
    streaming: 'from-emerald-400 to-cyan-500',
    error: 'from-pink-500 to-rose-600',
  };

  const color = colors[status as keyof typeof colors] || colors.idle;
  const isActive = status === 'streaming';

  return (
    <div className="relative">
      <div
        className={`
          w-6 h-6 rounded-full bg-gradient-to-br ${color}
          ${isActive ? 'animate-pulse' : ''}
        `}
      />
      {isActive && (
        <div
          className={`
            absolute inset-0 w-6 h-6 rounded-full bg-gradient-to-br ${color}
            opacity-50 animate-ping
          `}
        />
      )}
    </div>
  );
}

/**
 * Status badge showing current agent state.
 */
function StatusBadge({ status }: { status: string }) {
  const config = {
    idle: { text: 'Ready', color: 'text-white/50' },
    streaming: { text: 'Processing', color: 'text-emerald-400' },
    error: { text: 'Error', color: 'text-pink-400' },
  };

  const { text, color } = config[status as keyof typeof config] || config.idle;

  return (
    <span className={`text-xs font-medium ${color}`}>
      {status === 'streaming' && (
        <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1.5 animate-pulse" />
      )}
      {text}
    </span>
  );
}

/**
 * Error banner with retry and dismiss buttons.
 */
function ErrorBanner({ error }: { error: string }) {
  const retryLastMessage = useAgentStore((state) => state.retryLastMessage);
  const dismissError = useAgentStore((state) => state.dismissError);
  const lastUserMessage = useAgentStore((state) => state.lastUserMessage);

  return (
    <div className="animate-fade-in bg-gradient-to-r from-pink-500/20 to-rose-500/20 border-b border-pink-500/30 px-6 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        {/* Error message */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Error icon */}
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-pink-500/20 flex items-center justify-center">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-pink-400"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="text-sm text-pink-200 truncate">{error}</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Retry button - only show if we have a last message */}
          {lastUserMessage && (
            <button
              onClick={retryLastMessage}
              className="
                px-3 py-1.5 rounded-lg text-xs font-medium
                bg-pink-500/20 border border-pink-500/30
                text-pink-200 hover:text-white hover:bg-pink-500/30
                transition-colors duration-200
              "
            >
              Retry
            </button>
          )}
          
          {/* Dismiss button */}
          <button
            onClick={dismissError}
            className="
              px-3 py-1.5 rounded-lg text-xs
              bg-white/5 border border-white/10
              text-white/50 hover:text-white/80 hover:bg-white/10
              transition-colors duration-200
            "
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;

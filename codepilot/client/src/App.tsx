/**
 * CodePilot - Main Application Component
 * 
 * Phase 4: Basic Chat UI with SSE streaming.
 * Starscape Voyager design - "Interstellar Cockpit" aesthetic.
 */

import { ChatStream } from './components/ChatStream';
import { InputArea } from './components/InputArea';
import { useSSE } from './hooks/useSSE';
import { useAgentStore } from './store/useAgentStore';

/**
 * Root application component.
 * Layout: Header + ChatStream + InputArea (docked bottom)
 */
function App() {
  // Initialize SSE connection manager
  useSSE();

  return (
    <div className="h-screen flex flex-col bg-[hsl(222,84%,5%)] text-white">
      {/* Header - Status bar */}
      <Header />

      {/* Main content - Chat stream */}
      <ChatStream />

      {/* Input area - The Helm */}
      <InputArea />
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
      <div className="flex items-center gap-3">
        {/* Synthetic Star - status indicator */}
        <StatusOrb status={status} />
        
        <div>
          <h1 className="text-lg font-semibold text-white/90">CodePilot</h1>
          <p className="text-xs text-white/40">AI Coding Assistant</p>
        </div>
      </div>

      {/* Session controls */}
      <div className="flex items-center gap-4">
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
 * Status orb - "Synthetic Star" from Starscape design.
 * Visual indicator of agent state.
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
          w-8 h-8 rounded-full bg-gradient-to-br ${color}
          ${isActive ? 'animate-pulse' : ''}
        `}
      />
      {isActive && (
        <div
          className={`
            absolute inset-0 w-8 h-8 rounded-full bg-gradient-to-br ${color}
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

export default App;

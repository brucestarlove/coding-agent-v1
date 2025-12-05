/**
 * Root application component
 * Phase 0: Basic Hello World placeholder
 */
function App() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-emerald-400 mb-4">
          CodePilot
        </h1>
        <p className="text-slate-400 text-lg">
          AI-Powered Coding Assistant
        </p>
        <div className="mt-8 px-6 py-3 bg-slate-900 rounded-lg border border-slate-800">
          <code className="text-emerald-300 text-sm">
            Phase 0 Setup Complete ✓
          </code>
        </div>
      </div>
    </div>
  )
}

export default App

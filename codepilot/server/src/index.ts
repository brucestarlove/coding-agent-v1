// Load environment variables from .env file
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory of current file to compute absolute path to .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env is in codepilot/ (2 levels up from server/src/)
const envPath = path.resolve(__dirname, '../../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.warn(`⚠️  Could not load .env from ${envPath}:`, result.error.message);
} else if (result.parsed) {
  console.log(`✅ Loaded ${Object.keys(result.parsed).length} env vars from ${envPath}`);
}

import { Elysia } from 'elysia';
import { node } from '@elysiajs/node';
import { tools } from './tools/index';
import { chatRoutes, streamRoutes, plansRoutes } from './routes/index';
import { getAvailableModels } from './llm-client';
import { getDropdownCommands } from './agent/commands';

// Re-export core modules for library usage
export * from './core/tools';
export * from './providers';
export { runAgentLoop } from './agent';

// Server port from environment or default
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// CORS configuration for development
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Create Elysia app with Node.js adapter
const app = new Elysia({ adapter: node() })
  // CORS headers for cross-origin requests from frontend
  .onRequest(({ set }) => {
    set.headers['Access-Control-Allow-Origin'] = CORS_ORIGIN;
    set.headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS';
    set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
  })
  // Handle preflight OPTIONS requests
  .options('/*', ({ set }) => {
    set.status = 204;
    return '';
  })

  // Health check endpoint
  .get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // Root endpoint
  .get('/', () => ({ message: 'CodePilot API Server' }))

  // List available tools
  .get('/api/tools', () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
    })),
  }))

  // List available LLM models with context window sizes
  .get('/api/models', () => {
    const models = getAvailableModels();
    // Context windows for Claude models (in tokens)
    const CONTEXT_WINDOWS = {
      haiku: 200000,
      sonnet: 200000,
      opus: 200000,
    };
    return {
      models: [
        { id: models.haiku, name: 'Claude Haiku', description: 'Fast and efficient', contextWindow: CONTEXT_WINDOWS.haiku },
        { id: models.sonnet, name: 'Claude Sonnet', description: 'Balanced performance', contextWindow: CONTEXT_WINDOWS.sonnet },
        { id: models.opus, name: 'Claude Opus', description: 'Most capable', contextWindow: CONTEXT_WINDOWS.opus },
      ],
      default: models.sonnet,
    };
  })

  // List available agent commands
  .get('/api/commands', () => {
    const commands = getDropdownCommands();
    return {
      commands,
      default: 'chat',
    };
  })

  // Register API routes
  .use(chatRoutes)
  .use(streamRoutes)
  .use(plansRoutes)

  .listen(PORT);

console.log(`🚀 Server running at http://localhost:${PORT}`);
console.log(`📦 ${tools.length} tools loaded: ${tools.map((tool) => tool.name).join(', ')}`);
console.log(`📡 SSE streaming available at GET /api/stream/:id`);

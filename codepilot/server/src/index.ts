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

import { Elysia, t } from 'elysia';
import { node } from '@elysiajs/node';
import { tools, getToolByName } from './tools/index';
import { runAgentLoop } from './agent/index';

// Server port from environment or default
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Create Elysia app with Node.js adapter
const app = new Elysia({ adapter: node() })
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

  // Test tool endpoint for development validation
  .post(
    '/api/test-tool',
    async ({ body }) => {
      const { name, input } = body;
      const tool = getToolByName(name);

      if (!tool) {
        return { success: false, error: `Tool not found: ${name}` };
      }

      try {
        const result = await tool.handler(input);
        return { success: true, result };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
      }
    },
    {
      body: t.Object({
        name: t.String(),
        input: t.Record(t.String(), t.Any()),
      }),
    }
  )

  // Test agent endpoint for Phase 2 validation
  // Runs the agent loop and collects all events (non-streaming for testing)
  .post(
    '/api/test-agent',
    async ({ body }) => {
      const { prompt } = body;
      const events = [];

      try {
        // Run the agent loop and collect all events
        for await (const event of runAgentLoop({
          userPrompt: prompt,
          tools,
        })) {
          events.push(event);
        }
        return { success: true, events };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message, events };
      }
    },
    {
      body: t.Object({
        prompt: t.String(),
      }),
    }
  )

  .listen(PORT);

console.log(`🚀 Server running at http://localhost:${PORT}`);
console.log(`📦 ${tools.length} tools loaded: ${tools.map((tool) => tool.name).join(', ')}`);

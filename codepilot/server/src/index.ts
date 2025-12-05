import { Elysia, t } from 'elysia';
import { node } from '@elysiajs/node';
import { tools, getToolByName } from './tools/index';

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

  .listen(PORT);

console.log(`🚀 Server running at http://localhost:${PORT}`);
console.log(`📦 ${tools.length} tools loaded: ${tools.map((tool) => tool.name).join(', ')}`);

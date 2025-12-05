import { Elysia } from 'elysia'
import { node } from '@elysiajs/node'

// Server port from environment or default
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001

// Create Elysia app with Node.js adapter
const app = new Elysia({ adapter: node() })
  // Health check endpoint
  .get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
  // Root endpoint
  .get('/', () => ({ message: 'CodePilot API Server' }))
  .listen(PORT)

console.log(`🚀 Server running at http://localhost:${PORT}`)


# HL Challenge - CodePilot

AI-powered coding assistant with Elysia backend and React frontend.

## Repository Structure

```
HL-challenge/
├── docs/                     # Documentation and planning
│   ├── PRD.md               # Product Requirements Document
│   ├── AESTHETICS.md        # Design guidelines
│   └── plans/               # Phase implementation plans
├── codepilot/               # Main application (monorepo)
│   ├── server/              # Elysia + Node.js backend
│   │   ├── src/
│   │   │   ├── index.ts     # Server entry point
│   │   │   ├── tools/       # Phase 1: Tool implementations
│   │   │   ├── agent/       # Phase 2: Agent loop
│   │   │   └── routes/      # Phase 3: API routes
│   │   └── package.json
│   ├── client/              # React + Vite + Tailwind frontend
│   │   ├── src/
│   │   │   ├── App.tsx      # Root component
│   │   │   ├── main.tsx     # Entry point
│   │   │   ├── store/       # Phase 4: Zustand stores
│   │   │   ├── hooks/       # Phase 4: Custom hooks
│   │   │   └── components/  # Phase 4-5: UI components
│   │   └── package.json
│   ├── package.json         # Workspace root
│   ├── pnpm-workspace.yaml
│   └── .env.example
└── README.md                # This file
```

## Prerequisites

- Node.js >= 18.0.0
- pnpm (package manager)

## Setup

1. Navigate to the codepilot directory:
```bash
cd codepilot
```

2. Install dependencies:
```bash
pnpm install
```

3. Create environment file:
```bash
cp .env.example .env
# Edit .env and add EITHER:
#   - OPENROUTER_API_KEY (recommended - supports multiple models)
#   - ANTHROPIC_API_KEY (direct Anthropic access)
```

> 📖 **New to OpenRouter?** See [codepilot/OPENROUTER_SETUP.md](codepilot/OPENROUTER_SETUP.md) for a detailed setup guide

## Development

From the `codepilot/` directory:

### Run both servers concurrently:
```bash
pnpm dev
```

### Run servers individually:
```bash
# Backend only (http://localhost:3001)
pnpm dev:server

# Frontend only (http://localhost:5173)
pnpm dev:client
```

## API Endpoints

### Server (http://localhost:3001)
- `GET /` - Server info
- `GET /health` - Health check

### Client (http://localhost:5173)
- Frontend application
- Proxies `/api/*` requests to backend

## Build

```bash
# Build all packages
pnpm build

# Build individual packages
pnpm --filter server build
pnpm --filter client build
```

## Tech Stack

### Backend
- **Elysia** - Web framework
- **@elysiajs/node** - Node.js adapter
- **LLM Clients**:
  - **OpenRouter** - Multi-provider API (recommended)
  - **@anthropic-ai/sdk** - Direct Anthropic access
- **TypeScript** - Type safety

### Frontend
- **React 19** - UI framework
- **Vite** - Build tool
- **Tailwind CSS 4** - Styling
- **Zustand** - State management
- **TypeScript** - Type safety

## Phase 0 Complete ✓

- [x] Monorepo setup with pnpm workspaces
- [x] Elysia server with Node.js adapter
- [x] React frontend with Vite and Tailwind
- [x] TypeScript strict mode configuration
- [x] Development scripts
- [x] Health check endpoint
- [x] Placeholder directory structure

## Next Steps

- **Phase 1**: Implement core tools (FileSystem, Terminal, CodeSearch)
- **Phase 2**: Build agent loop with Claude integration
- **Phase 3**: Create API routes and SSE streaming
- **Phase 4**: Develop frontend UI components
- **Phase 5**: Complete integration and testing

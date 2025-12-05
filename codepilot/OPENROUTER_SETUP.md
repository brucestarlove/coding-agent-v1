# OpenRouter Setup Guide

CodePilot supports **OpenRouter** as the recommended LLM provider. OpenRouter gives you access to Claude and many other models through a single API key.

## Why OpenRouter?

- ✅ **Single API key** for multiple LLM providers (Claude, GPT-4, Gemini, etc.)
- ✅ **Pay-as-you-go** pricing without subscriptions
- ✅ **Fallback models** - automatically try alternatives if primary fails
- ✅ **Usage dashboard** - track costs and requests
- ✅ **No waitlists** - instant access to Claude and other models

## Quick Setup

### 1. Get Your OpenRouter API Key

1. Visit [OpenRouter.ai](https://openrouter.ai/)
2. Sign up or log in
3. Go to [Keys](https://openrouter.ai/keys) section
4. Create a new API key
5. Add credits to your account (minimum $5, pay-as-you-go)

### 2. Configure CodePilot

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` and add your OpenRouter credentials:
```bash
# OpenRouter Configuration (recommended)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet

# Leave Anthropic key commented out if using OpenRouter
# ANTHROPIC_API_KEY=...
```

### 3. Start the Server

```bash
pnpm dev:server
```

You should see:
```
🔌 Using OpenRouter API
🚀 Server running at http://localhost:3001
```

## Supported Models

OpenRouter supports many models.

### Claude (Anthropic)
- `anthropic/claude-sonnet-4.5` - Best for coding
- `anthropic/claude-opus-4.5` - Most capable, higher cost
- `anthropic/claude-haiku-4.5` - Fastest, lowest cost

See [OpenRouter Models](https://openrouter.ai/models) for the full list.

## Switching Between Providers

CodePilot automatically detects which API key you've configured:

```bash
# Use OpenRouter (priority 1)
OPENROUTER_API_KEY=sk-or-v1-xxx

# OR use Anthropic directly (priority 2)
ANTHROPIC_API_KEY=sk-ant-xxx
```

If both are set, OpenRouter takes priority. Comment out the one you don't want to use.

## Usage Dashboard

Track your API usage at [OpenRouter Activity](https://openrouter.ai/activity):
- Request counts
- Token usage
- Cost breakdown
- Model performance

## Troubleshooting

### "No API key found" error
- Make sure you've created a `.env` file from `.env.example`
- Verify your API key starts with `sk-or-v1-`
- Restart the server after changing `.env`

### "Insufficient credits" error
- Add credits at [OpenRouter Credits](https://openrouter.ai/credits)
- Minimum $5 to start

### Model not available
- Some models require additional setup or approval
- Try `anthropic/claude-3.5-sonnet` (widely available)
- Check [model status](https://openrouter.ai/models)

## Alternative: Direct Anthropic

If you prefer to use Anthropic directly:

1. Get an API key from [Anthropic Console](https://console.anthropic.com/)
2. Edit `.env`:
   ```bash
   # Comment out OpenRouter
   # OPENROUTER_API_KEY=...
   
   # Use Anthropic directly
   ANTHROPIC_API_KEY=sk-ant-xxx
   ```

3. Restart the server - you'll see:
   ```
   🔌 Using Anthropic API
   ```

## Questions?

- OpenRouter Docs: https://openrouter.ai/docs
- OpenRouter Discord: https://discord.gg/openrouter
- Anthropic Docs: https://docs.anthropic.com/

/**
 * LLM Client Factory
 * Supports both Anthropic SDK and OpenRouter
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// Environment configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

/**
 * Creates an LLM client based on available environment variables
 * Priority: OpenRouter > Anthropic direct
 */
export function createLLMClient() {
  if (OPENROUTER_API_KEY) {
    console.log('🔌 Using OpenRouter API')
    return createOpenRouterClient()
  } else if (ANTHROPIC_API_KEY) {
    console.log('🔌 Using Anthropic API')
    return createAnthropicClient()
  } else {
    throw new Error(
      'No API key found. Please set either OPENROUTER_API_KEY or ANTHROPIC_API_KEY in your .env file'
    )
  }
}

/**
 * OpenRouter client (OpenAI-compatible API)
 */
function createOpenRouterClient() {
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: OPENROUTER_API_KEY,
    defaultHeaders: {
      'HTTP-Referer': 'https://github.com/codepilot', // Optional: for rankings
      'X-Title': 'CodePilot', // Optional: shows in OpenRouter dashboard
    },
  })

  return {
    provider: 'openrouter' as const,
    model: OPENROUTER_MODEL,
    client,
    
    /**
     * Stream a chat completion (OpenAI format)
     */
    async streamChat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) {
      const stream = await client.chat.completions.create({
        model: OPENROUTER_MODEL,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        stream: true,
      })
      return stream
    },
  }
}

/**
 * Anthropic direct client
 */
function createAnthropicClient() {
  const client = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
  })

  return {
    provider: 'anthropic' as const,
    model: 'claude-3-5-sonnet-20241022',
    client,
    
    /**
     * Stream a message (Anthropic format)
     */
    async streamMessage(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
      const stream = await client.messages.stream({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8192,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
      })
      return stream
    },
  }
}

// Export types for use in other modules
export type LLMClient = ReturnType<typeof createLLMClient>


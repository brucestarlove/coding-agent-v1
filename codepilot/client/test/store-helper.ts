/**
 * Test utilities for Zustand store
 */
import { vi } from 'vitest';
import { useAgentStore } from '../src/store/useAgentStore';

/**
 * Reset store to initial state
 */
export function resetStore(): void {
  useAgentStore.setState({
    sessionId: null,
    sessionTitle: null,
    status: 'idle',
    error: null,
    workingDir: null,
    messages: [],
    currentContent: [],
    tokenUsage: null,
    selectedModel: null,
    availableModels: [],
    selectedCommand: null,
    availableCommands: [],
    lastUserMessage: null,
    sessions: [],
    isSessionSheetOpen: false,
    plans: [],
    selectedPlan: null,
    isPlansSheetOpen: false,
  });
}

/**
 * Get current store state
 */
export function getStoreState() {
  return useAgentStore.getState();
}

/**
 * Mock successful fetch response
 */
export function mockFetchSuccess(data: unknown): void {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

/**
 * Mock failed fetch response
 */
export function mockFetchError(status: number, statusText: string): void {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: false,
    status,
    statusText,
    json: () => Promise.reject(new Error('Not OK')),
    text: () => Promise.resolve(statusText),
  });
}


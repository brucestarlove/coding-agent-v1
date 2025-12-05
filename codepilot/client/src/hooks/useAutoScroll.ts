/**
 * useAutoScroll Hook - Smart auto-scrolling behavior for chat streams.
 * 
 * Behavior:
 * - Auto-scrolls when new content arrives (if user is near bottom)
 * - Disables auto-scroll if user scrolls up manually
 * - Re-enables auto-scroll when user scrolls back to bottom
 */

import { useEffect, useRef, useCallback, type RefObject } from 'react';

/** Threshold in pixels - if within this distance of bottom, auto-scroll is active */
const SCROLL_THRESHOLD = 100;

interface UseAutoScrollOptions {
  /** Dependencies that trigger scroll check (e.g., messages, currentText) */
  deps: unknown[];
  /** Whether to enable auto-scroll behavior */
  enabled?: boolean;
}

interface UseAutoScrollReturn {
  /** Ref to attach to the scrollable container */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Manually scroll to bottom */
  scrollToBottom: () => void;
  /** Whether auto-scroll is currently active */
  isAtBottom: boolean;
}

/**
 * Hook for managing auto-scroll behavior in a chat-like interface.
 */
export function useAutoScroll({
  deps,
  enabled = true,
}: UseAutoScrollOptions): UseAutoScrollReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);

  /**
   * Check if container is scrolled near the bottom
   */
  const checkIsAtBottom = useCallback((): boolean => {
    const container = containerRef.current;
    if (!container) return true;

    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight <= SCROLL_THRESHOLD;
  }, []);

  /**
   * Scroll the container to the bottom
   */
  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
    isAtBottomRef.current = true;
  }, []);

  /**
   * Handle scroll events to track if user is at bottom
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const handleScroll = () => {
      isAtBottomRef.current = checkIsAtBottom();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [enabled, checkIsAtBottom]);

  /**
   * Auto-scroll when dependencies change (if at bottom)
   */
  useEffect(() => {
    if (!enabled) return;

    // Only auto-scroll if user is at bottom
    if (isAtBottomRef.current) {
      // Use requestAnimationFrame for smooth scrolling after DOM update
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    containerRef,
    scrollToBottom,
    isAtBottom: isAtBottomRef.current,
  };
}


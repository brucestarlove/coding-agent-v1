/**
 * useDelayedHover Hook
 * 
 * Provides hover state with an optional delay before showing.
 * Useful for tooltips that shouldn't appear immediately.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

interface UseDelayedHoverOptions {
  /** Delay in milliseconds before showing (default: 0) */
  showDelay?: number;
  /** Delay in milliseconds before hiding (default: 0) */
  hideDelay?: number;
}

interface UseDelayedHoverReturn {
  /** Whether the hover state is active (after delay) */
  isHovered: boolean;
  /** Props to spread on the target element */
  hoverProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
}

/**
 * Hook for managing hover state with optional delays.
 * 
 * @example
 * ```tsx
 * const { isHovered, hoverProps } = useDelayedHover({ showDelay: 2000 });
 * 
 * return (
 *   <div {...hoverProps}>
 *     Hover me
 *     {isHovered && <Tooltip>I appear after 2 seconds!</Tooltip>}
 *   </div>
 * );
 * ```
 */
export function useDelayedHover(options: UseDelayedHoverOptions = {}): UseDelayedHoverReturn {
  const { showDelay = 0, hideDelay = 0 } = options;
  
  const [isHovered, setIsHovered] = useState(false);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear all timeouts
  const clearTimeouts = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    clearTimeouts();
    
    if (showDelay > 0) {
      showTimeoutRef.current = setTimeout(() => {
        setIsHovered(true);
      }, showDelay);
    } else {
      setIsHovered(true);
    }
  }, [showDelay, clearTimeouts]);

  const handleMouseLeave = useCallback(() => {
    clearTimeouts();
    
    if (hideDelay > 0) {
      hideTimeoutRef.current = setTimeout(() => {
        setIsHovered(false);
      }, hideDelay);
    } else {
      setIsHovered(false);
    }
  }, [hideDelay, clearTimeouts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeouts();
    };
  }, [clearTimeouts]);

  // Memoize hoverProps to prevent unnecessary re-renders in consumers
  const hoverProps = useMemo(() => ({
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
  }), [handleMouseEnter, handleMouseLeave]);

  return {
    isHovered,
    hoverProps,
  };
}


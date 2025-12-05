/**
 * Tooltip Component
 * 
 * A reusable tooltip that appears above its trigger element.
 * Supports optional delay before showing via useDelayedHover hook.
 */

import { type ReactNode, memo } from 'react';
import { useDelayedHover } from '../hooks/useDelayedHover';

type TooltipPosition = 'top' | 'bottom';

interface TooltipProps {
  /** Content to display in the tooltip */
  content: ReactNode;
  /** The trigger element(s) */
  children: ReactNode;
  /** Delay in ms before showing tooltip (default: 0) */
  showDelay?: number;
  /** Delay in ms before hiding tooltip (default: 0) */
  hideDelay?: number;
  /** Position of tooltip relative to trigger (default: 'top') */
  position?: TooltipPosition;
  /** Additional className for the tooltip container */
  className?: string;
  /** Whether the tooltip is disabled */
  disabled?: boolean;
}

/**
 * Tooltip wrapper component with optional delay.
 * 
 * @example
 * ```tsx
 * // Basic usage
 * <Tooltip content="Hello!">
 *   <button>Hover me</button>
 * </Tooltip>
 * 
 * // With delay
 * <Tooltip content="I appear after 2 seconds" showDelay={2000}>
 *   <input placeholder="Hover for help" />
 * </Tooltip>
 * ```
 */
export const Tooltip = memo(function Tooltip({
  content,
  children,
  showDelay = 0,
  hideDelay = 0,
  position = 'top',
  className = '',
  disabled = false,
}: TooltipProps) {
  const { isHovered, hoverProps } = useDelayedHover({ showDelay, hideDelay });

  const showTooltip = isHovered && !disabled;

  // Position classes
  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
  };

  // Arrow position classes
  const arrowClasses = {
    top: 'top-full -mt-px border-t-white/10',
    bottom: 'bottom-full -mb-px border-b-white/10',
  };

  return (
    <div className={`relative ${className}`} {...hoverProps}>
      {children}
      
      {showTooltip && (
        <div
          className={`
            absolute left-1/2 -translate-x-1/2 z-50
            ${positionClasses[position]}
            px-3 py-2 rounded-lg
            bg-[hsl(222,84%,8%)] border border-white/10
            shadow-xl shadow-black/50
            text-xs text-white/70
            whitespace-nowrap
            animate-fade-in
          `}
        >
          {/* Arrow */}
          <div className={`absolute left-1/2 -translate-x-1/2 ${arrowClasses[position]}`}>
            <div className="border-4 border-transparent" />
          </div>
          
          {content}
        </div>
      )}
    </div>
  );
});

/**
 * Standalone tooltip content component for custom positioning.
 * Use this when you need more control over the tooltip rendering.
 */
export const TooltipContent = memo(function TooltipContent({
  children,
  position = 'top',
  className = '',
}: {
  children: ReactNode;
  position?: TooltipPosition;
  className?: string;
}) {
  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
  };

  const arrowClasses = {
    top: 'top-full -mt-px border-t-white/10',
    bottom: 'bottom-full -mb-px border-b-white/10',
  };

  return (
    <div
      className={`
        absolute left-1/2 -translate-x-1/2 z-50
        ${positionClasses[position]}
        px-3 py-2 rounded-lg
        bg-[hsl(222,84%,8%)] border border-white/10
        shadow-xl shadow-black/50
        text-xs text-white/70
        whitespace-nowrap
        animate-fade-in
        ${className}
      `}
    >
      {/* Arrow */}
      <div className={`absolute left-1/2 -translate-x-1/2 ${arrowClasses[position]}`}>
        <div className="border-4 border-transparent" />
      </div>
      
      {children}
    </div>
  );
});


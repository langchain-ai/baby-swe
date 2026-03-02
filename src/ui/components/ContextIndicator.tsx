import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { getContextLimit, COMPACT_THRESHOLD } from '../../context-limits';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface ContextIndicatorProps {
  sessionId: string;
}

export function ContextIndicator({ sessionId }: ContextIndicatorProps) {
  const modelName = useStore(state => state.modelConfig.name);
  const usedTokens = useStore(state => state.sessions[sessionId]?.tokenUsage.lastCall.input ?? 0);
  const [showTooltip, setShowTooltip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const contextLimit = getContextLimit(modelName);
  // Context window usage is based on last call input tokens sent to the model
  const fraction = contextLimit > 0 ? Math.min(usedTokens / contextLimit, 1) : 0;
  const percentage = Math.round(fraction * 100);
  const isNearLimit = fraction >= COMPACT_THRESHOLD;

  // SVG circle params
  const size = 14;
  const strokeWidth = 1.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - fraction);

  // Color based on usage
  let strokeColor = '#6b7280'; // gray-500
  if (fraction > 0) strokeColor = '#9ca3af'; // gray-400
  if (fraction >= 0.5) strokeColor = '#93c5fd'; // blue-300
  if (fraction >= 0.75) strokeColor = '#fbbf24'; // amber-400
  if (fraction >= COMPACT_THRESHOLD) strokeColor = '#f87171'; // red-400

  // Close tooltip on outside click
  useEffect(() => {
    if (!showTooltip) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTooltip]);

  if (usedTokens === 0) return null;

  return (
    <div
      ref={containerRef}
      className="relative flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="cursor-default flex items-center gap-1">
        <svg width={size} height={size} className="block -rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#374151"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
      </div>

      {showTooltip && (
        <div className="absolute bottom-full mb-2 right-0 bg-[#1a1f2e] border border-[#2a3142] rounded-lg shadow-xl px-3 py-2 z-50 whitespace-nowrap text-xs font-sans">
          <div className="text-gray-300 font-medium">
            Context: {percentage}% — {formatTokens(usedTokens)} / {formatTokens(contextLimit)} input tokens
          </div>
          {isNearLimit && (
            <div className="text-amber-400 text-[10px] mt-1">
              Approaching context limit
            </div>
          )}
        </div>
      )}
    </div>
  );
}

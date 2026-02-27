import { useState, useEffect } from 'react';
import { useStore } from '../../store';

const BUSY_ACTIONS = [
  'Calculating',
  'Processing',
  'Thinking',
  'Analyzing',
  'Working',
];

function formatTokens(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

function formatDuration(startTime: number): string {
  const elapsed = Date.now() - startTime;
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function Footer() {
  const tokenUsage = useStore(state => state.tokenUsage);
  const activeSession = useStore(state => {
    const ws = state.workspaces[state.activeWorkspaceIndex];
    if (!ws?.focusedTileId) return null;
    const tile = ws.tiles[ws.focusedTileId];
    return tile ? state.sessions[tile.sessionId] ?? null : null;
  });
  const [busyAction] = useState(() => BUSY_ACTIONS[Math.floor(Math.random() * BUSY_ACTIONS.length)]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const busy = activeSession?.busy ?? false;
  const streaming = activeSession?.isStreaming ?? false;

  useEffect(() => {
    if (busy && !startTime) {
      setStartTime(Date.now());
    } else if (!busy && startTime) {
      setStartTime(null);
    }
  }, [busy, startTime]);

  useEffect(() => {
    if (!busy) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [busy]);

  if (!busy) {
    return (
      <div className="px-4 py-2 font-sans text-xs text-gray-600">
        (ready)
      </div>
    );
  }

  const parts: string[] = [];
  parts.push('esc to interrupt');
  if (startTime) {
    parts.push(formatDuration(startTime));
  }
  parts.push(`↓ ${formatTokens(tokenUsage.total)} tokens`);
  if (streaming) {
    parts.push('streaming');
  }

  return (
    <div className="px-4 py-2 font-sans text-xs text-gray-500">
      <span className="text-yellow-400">*</span>
      <span className="ml-1">{busyAction}...</span>
      <span className="text-gray-600 ml-1">({parts.join(' · ')})</span>
    </div>
  );
}

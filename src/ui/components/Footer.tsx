import { useStore } from '../../store';

const BUSY_TEXTS = [
  'vibing...',
  'pondering...',
  'cooking...',
  'crunching...',
  'thinking...',
  'processing...',
  'analyzing...',
];

const CONTEXT_LIMIT = 200000;
const WARNING_THRESHOLD = 0.8;
const CRITICAL_THRESHOLD = 0.95;

function useBusyText() {
  const index = Math.floor(Math.random() * BUSY_TEXTS.length);
  return BUSY_TEXTS[index];
}

function formatTokens(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

export function Footer() {
  const { tokenUsage, mode, sessions, activeSessionId } = useStore();
  const busyText = useBusyText();

  const activeSession = activeSessionId ? sessions[activeSessionId] : null;
  const busy = activeSession?.busy ?? false;

  const usageRatio = tokenUsage.total / CONTEXT_LIMIT;
  const isWarning = usageRatio >= WARNING_THRESHOLD;
  const isCritical = usageRatio >= CRITICAL_THRESHOLD;

  return (
    <div className="flex items-center justify-between text-xs text-gray-500 px-2 py-1">
      <div className="flex items-center gap-2">
        {busy ? (
          <>
            <span className="animate-spin">⟳</span>
            <span className="text-yellow-400">{busyText}</span>
            <span className="text-gray-600">esc to interrupt</span>
          </>
        ) : (
          <span className="text-gray-600">ready</span>
        )}
      </div>
      <div className={isCritical ? 'text-red-400' : isWarning ? 'text-yellow-400' : ''}>
        tokens: {formatTokens(tokenUsage.total)}
        {isCritical && ' (limit!)'}
        {isWarning && !isCritical && ' (warning)'}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-600">mode:</span>
        <span className="text-cyan-400">{mode}</span>
        <span className="text-gray-700">v0.1.0</span>
      </div>
    </div>
  );
}

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
  const { busy, tokenUsage, mode } = useStore();
  const busyText = useBusyText();

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
      <div>
        tokens used: {formatTokens(tokenUsage.total)}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-600">mode:</span>
        <span className="text-cyan-400">{mode}</span>
        <span className="text-gray-700">v0.1.0</span>
      </div>
    </div>
  );
}

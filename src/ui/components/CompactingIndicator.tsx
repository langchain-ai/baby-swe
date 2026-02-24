import { useState, useEffect } from 'react';

export function CompactingIndicator() {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d % 3) + 1);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 text-purple-400 text-xs font-mono">
      <svg className="animate-spin h-3 w-3" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 12" />
      </svg>
      <span>
        Compacting conversation{'.'.repeat(dots)}
      </span>
    </div>
  );
}

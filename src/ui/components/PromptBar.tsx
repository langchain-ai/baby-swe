import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';

interface PromptBarProps {
  onSubmit: (query: string) => void;
}

export function PromptBar({ onSubmit }: PromptBarProps) {
  const [query, setQuery] = useState('');
  const { busy, blink } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [busy]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim() && !busy) {
      onSubmit(query.trim());
      setQuery('');
    }
  };

  return (
    <div className="border border-gray-700 rounded-lg p-3 mt-2">
      <div className="flex items-center">
        <span className="text-cyan-400 font-bold mr-2">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          placeholder={busy ? 'Working...' : 'Type a message...'}
          className="flex-1 bg-transparent text-gray-200 outline-none placeholder-gray-600"
        />
        {!busy && blink && <span className="text-cyan-400">▋</span>}
      </div>
    </div>
  );
}

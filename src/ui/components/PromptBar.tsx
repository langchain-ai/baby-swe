import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';

interface PromptBarProps {
  onSubmit: (query: string) => void;
}

export function PromptBar({ onSubmit }: PromptBarProps) {
  const [query, setQuery] = useState('');
  const { busy, modelConfig } = useStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [busy]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && query.trim() && !busy) {
      e.preventDefault();
      onSubmit(query.trim());
      setQuery('');
    }
  };

  return (
    <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl overflow-hidden">
      <textarea
        ref={textareaRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={busy}
        placeholder={busy ? 'Working...' : 'Plan, @ for context, / for commands'}
        rows={3}
        className="w-full bg-transparent text-gray-200 outline-none placeholder-gray-500 p-4 resize-none"
      />
      <div className="flex items-center justify-between px-3 pb-3">
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-400 hover:text-gray-200 rounded-md hover:bg-[#2a3142] transition-colors">
            <span className="text-cyan-400">∞</span>
            <span>Agent</span>
            <span className="text-gray-600">▾</span>
          </button>
          <button className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-400 hover:text-gray-200 rounded-md hover:bg-[#2a3142] transition-colors">
            <span>{modelConfig.name.includes('opus') ? 'Opus 4.5' : modelConfig.name.includes('sonnet') ? 'Sonnet 4' : 'Claude'}</span>
            <span className="text-gray-600">▾</span>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 text-gray-500 hover:text-gray-300 rounded-md hover:bg-[#2a3142] transition-colors">
            <AtIcon />
          </button>
          <button className="p-2 text-gray-500 hover:text-gray-300 rounded-md hover:bg-[#2a3142] transition-colors">
            <GlobeIcon />
          </button>
          <button className="p-2 text-gray-500 hover:text-gray-300 rounded-md hover:bg-[#2a3142] transition-colors">
            <ImageIcon />
          </button>
          <button className="p-2 text-gray-500 hover:text-gray-300 rounded-md hover:bg-[#2a3142] transition-colors">
            <MicIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function AtIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

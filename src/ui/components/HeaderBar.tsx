import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { ThreadHistory } from './ThreadHistory';

export function HeaderBar() {
  const { currentThreadId, threads, newThread } = useStore();
  const [showHistory, setShowHistory] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentThread = threads.find((t) => t.id === currentThreadId);
  const title = currentThread?.title || 'New Chat';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    if (showHistory) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showHistory]);

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-gray-200 font-medium text-sm truncate max-w-[200px]">
        {title}
      </span>
      <div className="flex items-center gap-2 relative" ref={containerRef}>
        <button
          onClick={() => newThread()}
          className="p-2 text-gray-500 hover:text-gray-300 rounded-md hover:bg-[#1a1f2e] transition-colors"
        >
          <PlusIcon />
        </button>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`p-2 rounded-md transition-colors ${
            showHistory
              ? 'text-gray-300 bg-[#1a1f2e]'
              : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1f2e]'
          }`}
        >
          <ClockIcon />
        </button>
        <button className="p-2 text-gray-500 hover:text-gray-300 rounded-md hover:bg-[#1a1f2e] transition-colors">
          <MoreIcon />
        </button>
        {showHistory && <ThreadHistory onClose={() => setShowHistory(false)} />}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

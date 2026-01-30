import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';

interface PromptBarProps {
  onSubmit: (query: string) => void;
  busy: boolean;
}

const MODELS = [
  { id: 'claude-sonnet-4-5-20250514', label: 'Sonnet 4.5' },
  { id: 'claude-opus-4-5-20250514', label: 'Opus 4.5' },
] as const;

export function PromptBar({ onSubmit, busy }: PromptBarProps) {
  const [query, setQuery] = useState('');
  const { mode, modelConfig, setMode, setModelConfig } = useStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modeRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [busy]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) {
        setShowModeMenu(false);
      }
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        setMode(mode === 'agent' ? 'plan' : 'agent');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mode, setMode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && query.trim() && !busy) {
      e.preventDefault();
      onSubmit(query.trim());
      setQuery('');
    }
  };

  const currentModel = MODELS.find((m) => m.id === modelConfig.name) || MODELS[0];

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
          <div className="relative" ref={modeRef}>
            <button
              onClick={() => setShowModeMenu(!showModeMenu)}
              className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-400 hover:text-gray-200 rounded-md hover:bg-[#2a3142] transition-colors"
            >
              <span className={mode === 'agent' ? 'text-cyan-400' : 'text-purple-400'}>
                {mode === 'agent' ? '∞' : '◇'}
              </span>
              <span>{mode === 'agent' ? 'Agent' : 'Plan'}</span>
              <span className="text-gray-600">▾</span>
            </button>
            {showModeMenu && (
              <div className="absolute bottom-full left-0 mb-1 bg-[#12171f] border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50">
                <button
                  onClick={() => {
                    setMode('agent');
                    setShowModeMenu(false);
                  }}
                  className={`w-full px-4 py-2 text-sm text-left hover:bg-[#1a1f2e] transition-colors flex items-center gap-2 ${
                    mode === 'agent' ? 'text-gray-200' : 'text-gray-400'
                  }`}
                >
                  <span className="text-cyan-400">∞</span>
                  Agent
                  {mode === 'agent' && <CheckIcon />}
                </button>
                <button
                  onClick={() => {
                    setMode('plan');
                    setShowModeMenu(false);
                  }}
                  className={`w-full px-4 py-2 text-sm text-left hover:bg-[#1a1f2e] transition-colors flex items-center gap-2 ${
                    mode === 'plan' ? 'text-gray-200' : 'text-gray-400'
                  }`}
                >
                  <span className="text-purple-400">◇</span>
                  Plan
                  {mode === 'plan' && <CheckIcon />}
                </button>
              </div>
            )}
          </div>
          <div className="relative" ref={modelRef}>
            <button
              onClick={() => setShowModelMenu(!showModelMenu)}
              className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-400 hover:text-gray-200 rounded-md hover:bg-[#2a3142] transition-colors"
            >
              <span>{currentModel.label}</span>
              <span className="text-gray-600">▾</span>
            </button>
            {showModelMenu && (
              <div className="absolute bottom-full left-0 mb-1 bg-[#12171f] border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50 min-w-[120px]">
                {MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setModelConfig({ name: model.id });
                      setShowModelMenu(false);
                    }}
                    className={`w-full px-4 py-2 text-sm text-left hover:bg-[#1a1f2e] transition-colors flex items-center justify-between gap-4 whitespace-nowrap ${
                      modelConfig.name === model.id ? 'text-gray-200' : 'text-gray-400'
                    }`}
                  >
                    {model.label}
                    {modelConfig.name === model.id && <CheckIcon />}
                  </button>
                ))}
              </div>
            )}
          </div>
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

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
      <polyline points="20 6 9 17 4 12" />
    </svg>
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

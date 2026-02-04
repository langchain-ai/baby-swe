import { useState } from 'react';
import { Logo } from './Logo';
import type { ApiKeys } from '../../types';

interface ApiKeysScreenProps {
  initialKeys?: ApiKeys | null;
  onSave: (keys: ApiKeys) => void;
  onCancel?: () => void;
  isStartup?: boolean;
}

export function ApiKeysScreen({ initialKeys, onSave, onCancel, isStartup }: ApiKeysScreenProps) {
  const [anthropic, setAnthropic] = useState(initialKeys?.anthropic || '');
  const [openai, setOpenai] = useState(initialKeys?.openai || '');
  const [tavily, setTavily] = useState(initialKeys?.tavily || '');
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);
  const [showTavily, setShowTavily] = useState(false);
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!anthropic.trim() && !openai.trim()) {
      setError('At least one LLM API key (Anthropic or OpenAI) is required');
      return;
    }

    const keys: ApiKeys = {};
    if (anthropic.trim()) keys.anthropic = anthropic.trim();
    if (openai.trim()) keys.openai = openai.trim();
    if (tavily.trim()) keys.tavily = tavily.trim();

    onSave(keys);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#1a2332] text-gray-100">
      <div className="flex flex-col items-center gap-6 w-full max-w-md px-6">
        <Logo />
        <div className="flex flex-col items-center w-full">
          <h2 className="text-xl font-medium text-gray-200 mb-2">API Keys</h2>
          <p className="text-gray-400 text-sm mb-6 text-center">
            {isStartup
              ? 'Enter your API keys to get started'
              : 'Manage your API keys'}
          </p>

          <div className="w-full space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Anthropic API Key</label>
              <div className="relative">
                <input
                  type={showAnthropic ? 'text' : 'password'}
                  value={anthropic}
                  onChange={(e) => setAnthropic(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#5a9bc7] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowAnthropic(!showAnthropic)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-300"
                >
                  {showAnthropic ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">OpenAI API Key</label>
              <div className="relative">
                <input
                  type={showOpenai ? 'text' : 'password'}
                  value={openai}
                  onChange={(e) => setOpenai(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#5a9bc7] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenai(!showOpenai)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-300"
                >
                  {showOpenai ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                Tavily API Key <span className="text-gray-500">(for web search)</span>
              </label>
              <div className="relative">
                <input
                  type={showTavily ? 'text' : 'password'}
                  value={tavily}
                  onChange={(e) => setTavily(e.target.value)}
                  placeholder="tvly-..."
                  className="w-full px-3 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#5a9bc7] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowTavily(!showTavily)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-300"
                >
                  {showTavily ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm mt-4">{error}</p>
          )}

          <div className="flex gap-3 mt-6">
            {onCancel && !isStartup && (
              <button
                onClick={onCancel}
                className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-[#5a9bc7] hover:bg-[#6daad3] text-white rounded-lg transition-colors font-medium"
            >
              Save Keys
            </button>
          </div>

          <p className="text-gray-500 text-xs mt-6 text-center">
            Keys are stored locally and never sent to our servers
          </p>
        </div>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

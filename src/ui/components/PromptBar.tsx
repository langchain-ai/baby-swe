import { useState, useRef, useEffect, useLayoutEffect, useCallback, memo } from 'react';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { CommandAutocomplete, getFilteredCommandCount, getCommandAtIndex } from './CommandAutocomplete';
import { FileAutocomplete, fuzzySearch, getFileAtIndex } from './FileAutocomplete';
import { ModelAutocomplete, AVAILABLE_MODELS, getModelCount, getModelAtIndex, type ModelOption } from './ModelAutocomplete';
import { ContextIndicator } from './ContextIndicator';
import { WorktreeSelector } from './WorktreeSelector';
import type { Command } from '../../commands';
import type { ImageChunk, WorktreeType } from '../../types';

const MODELS: Record<string, string> = {
  'claude-opus-4-6': 'Opus 4.6',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'gpt-5.3-codex': 'GPT-5.3-Codex',
  'kimi-k2.5': 'Kimi K2.5',
};

interface PromptBarProps {
  onSubmit: (query: string) => void;
  busy: boolean;
  projectPath?: string;
  /** The main repo root path (not the worktree path). Used for git operations. */
  mainProjectPath?: string;
  gitBranch?: string;
  githubPR?: { number: number; url: string } | null;
  sessionId: string;
  tileId: string;
  isFocused: boolean;
  pendingImages?: ImageChunk[];
  onRemoveImage?: (index: number) => void;
  onChangeDirectory?: () => void;
  dropUp?: boolean;
  worktreeType?: WorktreeType;
  worktreePath?: string;
}

export const PromptBar = memo(function PromptBar({ onSubmit, busy, projectPath, mainProjectPath, gitBranch, githubPR, sessionId, tileId, isFocused, pendingImages, onRemoveImage, onChangeDirectory, dropUp = true, worktreeType, worktreePath }: PromptBarProps) {
  const [query, setQuery] = useState('');
  const mode = useStore(state => state.sessions[sessionId]?.mode ?? 'agent');
  const { setSessionMode, modelConfig, setModelConfig } = useStore(useShallow(state => ({
    setSessionMode: state.setSessionMode,
    modelConfig: state.modelConfig,
    setModelConfig: state.setModelConfig,
  })));
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [commandSelectedIndex, setCommandSelectedIndex] = useState(0);
  const [fileSelectedIndex, setFileSelectedIndex] = useState(0);
  const [modelSelectedIndex, setModelSelectedIndex] = useState(0);
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [modelDropdownIndex, setModelDropdownIndex] = useState(0);
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [cursorPosition, setCursorPosition] = useState(0);

  const isTypingCommand = query.startsWith('/');
  const commandQuery = isTypingCommand ? query.slice(1).split(/\s/)[0] : '';
  const isModelCommand = query.toLowerCase() === '/model' || query.toLowerCase().startsWith('/model ');
  const showModelAutocomplete = isModelCommand;
  const showCommandAutocomplete = isTypingCommand && !query.includes(' ') && !isModelCommand;

  const getFileAutocompleteContext = useCallback(() => {
    const beforeCursor = query.slice(0, cursorPosition);
    const atIndex = beforeCursor.lastIndexOf('@');
    if (atIndex === -1) return null;
    const fragment = beforeCursor.slice(atIndex);
    if (fragment.includes(' ')) return null;
    return { atIndex, fileQuery: fragment.slice(1) };
  }, [query, cursorPosition]);

  const fileContext = getFileAutocompleteContext();
  const showFileAutocomplete = fileContext !== null && !showCommandAutocomplete;

  useEffect(() => {
    inputRef.current?.focus();
  }, [busy]);

  useLayoutEffect(() => {
    if (isFocused) {
      inputRef.current?.focus();
    }
  }, [isFocused]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const clamped = Math.min(el.scrollHeight, 200);
    el.style.height = `${clamped}px`;
    el.style.overflowY = el.scrollHeight > 200 ? 'auto' : 'hidden';
  }, [query]);

  useEffect(() => {
    setCommandSelectedIndex(0);
  }, [commandQuery]);

  useEffect(() => {
    setFileSelectedIndex(0);
  }, [fileContext?.fileQuery]);

  useEffect(() => {
    setModelSelectedIndex(0);
  }, [isModelCommand]);

  useEffect(() => {
    if (projectPath) {
      window.fs.listFiles(projectPath).then(setProjectFiles);
    } else {
      setProjectFiles([]);
    }
  }, [projectPath]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
        setModeDropdownOpen(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isFocused) return;
      if (e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        const nextMode = mode === 'agent' ? 'plan' : mode === 'plan' ? 'yolo' : 'agent';
        setSessionMode(sessionId, nextMode);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mode, setSessionMode, sessionId, isFocused]);

  const handleCommandSelect = (command: Command) => {
    setQuery(`/${command.name} `);
    inputRef.current?.focus();
  };

  const handleFileSelect = (filePath: string) => {
    if (!fileContext) return;
    const prefix = query.slice(0, fileContext.atIndex);
    const suffix = query.slice(cursorPosition);
    const insertion = `@${filePath}${suffix.startsWith(' ') ? '' : ' '}`;
    const newQuery = prefix + insertion + suffix;
    setQuery(newQuery);
    const newCursor = prefix.length + insertion.length;
    setCursorPosition(newCursor);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.selectionStart = newCursor;
        inputRef.current.selectionEnd = newCursor;
        inputRef.current.focus();
      }
    }, 0);
  };

  const handleModelSelect = (model: ModelOption) => {
    setModelConfig({ name: model.id, effort: model.effort || 'default' });
    setQuery('');
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value);
    setCursorPosition(e.target.selectionStart || 0);
  };

  const handleInputSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPosition((e.target as HTMLTextAreaElement).selectionStart || 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showModelAutocomplete) {
      const count = getModelCount();

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setModelSelectedIndex((prev) => (prev + 1) % count);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setModelSelectedIndex((prev) => (prev - 1 + count) % count);
        return;
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const model = getModelAtIndex(modelSelectedIndex);
        if (model) {
          handleModelSelect(model);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setQuery('');
        return;
      }
    }

    if (showCommandAutocomplete) {
      const count = getFilteredCommandCount(commandQuery);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCommandSelectedIndex((prev) => (prev + 1) % count);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCommandSelectedIndex((prev) => (prev - 1 + count) % count);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const command = getCommandAtIndex(commandQuery, commandSelectedIndex);
        if (command) {
          handleCommandSelect(command);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setQuery('');
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const command = getCommandAtIndex(commandQuery, commandSelectedIndex);
        if (command) {
          if (command.name === 'model') {
            setQuery('/model');
          } else {
            onSubmit(`/${command.name}`);
            setQuery('');
          }
        }
        return;
      }
    }

    if (showFileAutocomplete && fileContext) {
      const suggestions = fuzzySearch(fileContext.fileQuery, projectFiles);
      const count = suggestions.length;

      if (count > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFileSelectedIndex((prev) => (prev + 1) % count);
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFileSelectedIndex((prev) => (prev - 1 + count) % count);
          return;
        }

        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          const filePath = getFileAtIndex(fileContext.fileQuery, projectFiles, fileSelectedIndex);
          if (filePath) {
            handleFileSelect(filePath);
          }
          return;
        }
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (fileContext.atIndex >= 0) {
          const prefix = query.slice(0, fileContext.atIndex);
          const suffix = query.slice(cursorPosition);
          setQuery(prefix + suffix);
          setCursorPosition(prefix.length);
        }
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && query.trim()) {
      e.preventDefault();
      onSubmit(query.trim());
      setQuery('');
    }
  };

  return (
    <div className="relative font-sans text-[13px]">
      {showModelAutocomplete && (
        <ModelAutocomplete
          selectedIndex={modelSelectedIndex}
          currentModelId={modelConfig.name}
          currentEffort={modelConfig.effort}
          onSelect={handleModelSelect}
        />
      )}
      {showCommandAutocomplete && (
        <CommandAutocomplete
          query={commandQuery}
          selectedIndex={commandSelectedIndex}
          onSelect={handleCommandSelect}
        />
      )}
      {showFileAutocomplete && fileContext && (
        <FileAutocomplete
          query={fileContext.fileQuery}
          selectedIndex={fileSelectedIndex}
          onSelect={handleFileSelect}
        />
      )}

      {pendingImages && pendingImages.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {pendingImages.map((img, i) => (
            <div key={i} className="relative group">
              <img
                src={`data:${img.mimeType};base64,${img.base64}`}
                alt={img.fileName || "pending image"}
                className="w-16 h-16 object-cover rounded border border-gray-600"
              />
              <button
                type="button"
                onClick={() => onRemoveImage?.(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-700 hover:bg-red-600 rounded-full flex items-center justify-center text-gray-300 text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2">
        <span className="text-gray-400 select-none leading-[1.5]">❯</span>
        <textarea
          ref={inputRef}
          rows={1}
          value={query}
          onChange={handleInputChange}
          onSelect={handleInputSelect}
          onKeyDown={handleKeyDown}
          placeholder={busy ? 'Send a message to interrupt...' : ''}
          className="flex-1 bg-transparent text-gray-200 outline-none placeholder-gray-600 resize-none overflow-hidden leading-[1.5]"
          style={{ maxHeight: 200 }}
        />
      </div>

      <div className="mt-2 text-xs text-gray-600 flex items-center gap-1.5 min-w-0">
        <div ref={modeDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setModeDropdownOpen(o => !o)}
            className={`cursor-pointer hover:opacity-80 transition-opacity ${mode === 'agent' ? 'text-[#87CEEB]' : mode === 'plan' ? 'text-purple-400' : 'text-red-500'}`}
          >
            {mode}
          </button>
          {modeDropdownOpen && (
            <div className={`absolute ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden z-50`}>
              {(['agent', 'plan', 'yolo'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setSessionMode(sessionId, m); setModeDropdownOpen(false); }}
                  className={`block w-full text-left px-3 py-1.5 hover:bg-gray-700 transition-colors ${m === mode ? (m === 'agent' ? 'text-[#87CEEB]' : m === 'plan' ? 'text-purple-400' : 'text-red-500') : 'text-gray-400'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
        <span>·</span>
        <div ref={modelDropdownRef} className="relative">
          <button
            type="button"
            onClick={() => { setModelDropdownOpen(o => !o); setModelDropdownIndex(0); }}
            className="cursor-pointer text-gray-500 hover:opacity-80 transition-opacity"
          >
            {MODELS[modelConfig.name] || modelConfig.name}
          </button>
          {modelDropdownOpen && (
            <div className={`absolute ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden z-50`}>
              {AVAILABLE_MODELS.map((model, idx) => {
                const isCurrent = model.id === modelConfig.name && (model.effort || 'default') === (modelConfig.effort || 'default');
                return (
                  <button
                    key={`${model.id}-${model.effort ?? ''}`}
                    type="button"
                    onClick={() => { handleModelSelect(model); setModelDropdownOpen(false); }}
                    onMouseEnter={() => setModelDropdownIndex(idx)}
                    className={`block w-full text-left px-3 py-1.5 whitespace-nowrap transition-colors flex items-center gap-2 ${idx === modelDropdownIndex ? 'bg-gray-700' : 'hover:bg-gray-700'} ${isCurrent ? 'text-gray-200' : 'text-gray-400'}`}
                  >
                    {model.name}
                    {isCurrent && <span className="ml-auto pl-3 text-gray-400">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {projectPath && (
          <>
            <span>·</span>
            <button
              type="button"
              onClick={onChangeDirectory}
              className="text-gray-500 truncate hover:text-gray-300 transition-colors cursor-pointer"
            >
              {projectPath.split('/').filter(Boolean).pop()}
            </button>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5 min-w-0">
          <ContextIndicator />
          {gitBranch && projectPath && (
            <>
              <WorktreeSelector
                projectPath={mainProjectPath || projectPath}
                gitBranch={gitBranch}
                worktreeType={worktreeType}
                worktreePath={worktreePath}
                tileId={tileId}
                dropUp={dropUp}
              />
              {githubPR && (
                <>
                  <span>·</span>
                  <a
                    href={githubPR.url}
                    onClick={e => { e.preventDefault(); window.open(githubPR.url, '_blank'); }}
                    className="text-gray-500 hover:text-[#87CEEB] transition-colors shrink-0"
                  >
                    #{githubPR.number}
                  </a>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});

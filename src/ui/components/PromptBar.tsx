import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import { CommandAutocomplete, getFilteredCommandCount, getCommandAtIndex } from './CommandAutocomplete';
import { FileAutocomplete, fuzzySearch, getFileAtIndex } from './FileAutocomplete';
import type { Command } from '../../commands';

interface PromptBarProps {
  onSubmit: (query: string) => void;
  busy: boolean;
}

export function PromptBar({ onSubmit, busy }: PromptBarProps) {
  const [query, setQuery] = useState('');
  const { mode, setMode } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [commandSelectedIndex, setCommandSelectedIndex] = useState(0);
  const [fileSelectedIndex, setFileSelectedIndex] = useState(0);
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [cursorPosition, setCursorPosition] = useState(0);

  const isTypingCommand = query.startsWith('/');
  const commandQuery = isTypingCommand ? query.slice(1).split(/\s/)[0] : '';
  const showCommandAutocomplete = isTypingCommand && !query.includes(' ');

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

  useEffect(() => {
    setCommandSelectedIndex(0);
  }, [commandQuery]);

  useEffect(() => {
    setFileSelectedIndex(0);
  }, [fileContext?.fileQuery]);

  useEffect(() => {
    window.fs.listFiles().then(setProjectFiles);
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setCursorPosition(e.target.selectionStart || 0);
  };

  const handleInputSelect = (e: React.SyntheticEvent<HTMLInputElement>) => {
    setCursorPosition((e.target as HTMLInputElement).selectionStart || 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
          onSubmit(`/${command.name}`);
          setQuery('');
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

    if (e.key === 'Enter' && query.trim() && !busy) {
      e.preventDefault();
      onSubmit(query.trim());
      setQuery('');
    }
  };

  return (
    <div className="relative font-mono">
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

      <div className="flex items-center gap-2">
        <span className="text-gray-400 select-none">❯</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onSelect={handleInputSelect}
          onKeyDown={handleKeyDown}
          disabled={busy}
          placeholder={busy ? 'Working...' : ''}
          className="flex-1 bg-transparent text-gray-200 outline-none placeholder-gray-600"
        />
      </div>

      <div className="mt-2 text-xs text-gray-600">
        <span className="text-gray-500">▸▸</span>
        <span className={mode === 'agent' ? 'text-[#87CEEB] ml-1' : 'text-purple-400 ml-1'}>
          {mode} mode
        </span>
        <span className="text-gray-600 ml-1">(shift+tab to cycle)</span>
      </div>
    </div>
  );
}

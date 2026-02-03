import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';

interface TerminalTileProps {
  tileId: string;
  cwd?: string;
  isFocused: boolean;
  onFocus: () => void;
}

export function TerminalTile({ tileId, cwd, isFocused, onFocus }: TerminalTileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      theme: {
        background: '#1a2332',
        foreground: '#e5e7eb',
        cursor: '#5a9bc7',
        cursorAccent: '#1a2332',
        selectionBackground: '#5a9bc755',
        black: '#1a2332',
        red: '#e07a5f',
        green: '#81b29a',
        yellow: '#f2cc8f',
        blue: '#5a9bc7',
        magenta: '#c9a0dc',
        cyan: '#87CEEB',
        white: '#e5e7eb',
        brightBlack: '#4a5568',
        brightRed: '#fc8181',
        brightGreen: '#9ae6b4',
        brightYellow: '#faf089',
        brightBlue: '#90cdf4',
        brightMagenta: '#d6bcfa',
        brightCyan: '#9decf9',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    window.terminal.create(tileId, cwd);

    term.onData((data) => {
      window.terminal.write(tileId, data);
    });

    const unsubscribe = window.terminal.onData((id, data) => {
      if (id === tileId) {
        term.write(data);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      window.terminal.resize(tileId, term.cols, term.rows);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      unsubscribe();
      window.terminal.destroy(tileId);
      term.dispose();
    };
  }, [tileId, cwd]);

  useEffect(() => {
    if (isFocused && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isFocused]);

  return (
    <div
      className={`h-full w-full bg-[#1a2332] ${isFocused ? 'ring-2 ring-[#5a9bc7] ring-inset' : ''}`}
      onClick={onFocus}
    >
      <div ref={containerRef} className="h-full w-full p-2" />
    </div>
  );
}

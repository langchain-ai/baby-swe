import { memo, useLayoutEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useStore } from "../../store";

interface TerminalTileProps {
  tileId: string;
  cwd?: string;
  isFocused: boolean;
  onFocus: () => void;
}

export const TerminalTile = memo(function TerminalTile({
  tileId,
  cwd,
  isFocused,
  onFocus,
}: TerminalTileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    let rafId: number | null = null;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
      fontFamily: "JetBrains Mono, Menlo, Monaco, monospace",
      theme: {
        background: "#1a2332",
        foreground: "#e5e7eb",
        cursor: "#5a9bc7",
        cursorAccent: "#1a2332",
        selectionBackground: "#5a9bc755",
        black: "#1a2332",
        red: "#e07a5f",
        green: "#81b29a",
        yellow: "#f2cc8f",
        blue: "#5a9bc7",
        magenta: "#c9a0dc",
        cyan: "#87CEEB",
        white: "#e5e7eb",
        brightBlack: "#4a5568",
        brightRed: "#fc8181",
        brightGreen: "#9ae6b4",
        brightYellow: "#faf089",
        brightBlue: "#90cdf4",
        brightMagenta: "#d6bcfa",
        brightCyan: "#9decf9",
        brightWhite: "#ffffff",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);

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

    const fitAndResize = () => {
      if (disposed || !containerRef.current) return;
      fitAddon.fit();

      const termEl = term.element;
      if (termEl) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const termRect = termEl.getBoundingClientRect();
        const style = window.getComputedStyle(containerRef.current);
        const paddingTop = Number.parseFloat(style.paddingTop) || 0;
        const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
        const contentBottom = containerRect.bottom - paddingBottom;
        const overflowBottom = termRect.bottom - contentBottom;
        const overflowTop = containerRect.top + paddingTop - termRect.top;

        if ((overflowBottom > 0.5 || overflowTop > 0.5) && term.rows > 1) {
          term.resize(term.cols, term.rows - 1);
        }
      }

      window.terminal.resize(tileId, term.cols, term.rows);
    };

    const scheduleFitAndResize = () => {
      if (disposed) return;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        fitAndResize();
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      scheduleFitAndResize();
    });
    resizeObserver.observe(containerRef.current);

    scheduleFitAndResize();

    document.fonts?.ready.then(() => {
      scheduleFitAndResize();
    });

    if (isFocused) {
      requestAnimationFrame(() => {
        if (!disposed) term.focus();
      });
    }

    return () => {
      disposed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      unsubscribe();
      // Only destroy the pty process if the tile has actually been closed.
      // If the component is unmounting due to a layout restructure (e.g. split),
      // the tile still exists in the store and we should keep the pty alive.
      const ws = useStore.getState().workspaces;
      const tileStillExists = ws.some((w) => !!w.tiles[tileId]);
      if (!tileStillExists) {
        window.terminal.destroy(tileId);
      }
      term.dispose();
    };
  }, [tileId, cwd]);

  useLayoutEffect(() => {
    if (isFocused && terminalRef.current) {
      terminalRef.current.focus();
    }
  }, [isFocused]);

  return (
    <div className="relative h-full w-full bg-[#1a2332]" onClick={onFocus}>
      {isFocused && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 ring-2 ring-[#5a9bc7] ring-inset z-20"
        />
      )}
      <div ref={containerRef} className="h-full w-full p-2" />
    </div>
  );
});

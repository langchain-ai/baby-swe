import { memo, useState, useRef, useCallback } from "react";
import type { ToolExecutionChunk } from "../../types";

interface ShellCommandProps {
  chunk: ToolExecutionChunk;
  projectPath?: string;
}

function getHeaderText(chunk: ToolExecutionChunk): string {
  const cmd = (chunk.toolArgs?.command as string) || "";
  const truncated = cmd.length > 80 ? cmd.slice(0, 80) + "..." : cmd;
  if (chunk.status === "running") return `Running ${truncated}`;
  if (chunk.status === "pending-approval") return `Run ${truncated}`;
  return `Background terminal finished with ${truncated}`;
}

export const ShellCommand = memo(function ShellCommand({
  chunk,
}: ShellCommandProps) {
  const isSettled = chunk.status === "success" || chunk.status === "error";
  const [expanded, setExpanded] = useState(!isSettled);
  const [scrolledFromTop, setScrolledFromTop] = useState(false);
  const [scrolledFromBottom, setScrolledFromBottom] = useState(true);
  const outputRef = useRef<HTMLDivElement>(null);

  const handleOutputScroll = useCallback(() => {
    const el = outputRef.current;
    if (!el) return;
    setScrolledFromTop(el.scrollTop > 0);
    setScrolledFromBottom(el.scrollTop < el.scrollHeight - el.clientHeight - 1);
  }, []);

  const command = (chunk.toolArgs?.command as string) || "";
  const output = chunk.output || "";
  const headerText = getHeaderText(chunk);

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-2 py-1 text-left hover:opacity-90 transition-opacity"
      >
        <span className="text-[color:var(--ui-text-muted)] text-[12px] truncate flex-1 min-w-0">
          {headerText}
        </span>
        <span
          className="text-[color:var(--ui-text-dim)] text-xs shrink-0 transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▾
        </span>
      </button>

      {expanded && (
        <div className="rounded-xl bg-[var(--ui-accent-bubble)] mt-1 overflow-hidden max-h-[250px] flex flex-col">
          <div className="px-3 pt-2 pb-1 font-mono text-xs shrink-0">
            <div className="text-[color:var(--ui-text-dim)] mb-2">bash</div>
            <div className="text-[color:var(--ui-text)] font-semibold whitespace-pre overflow-x-auto">
              <span className="text-[color:var(--ui-text-dim)]">$ </span>
              {command}
            </div>
          </div>
          {output && (
            <div
              ref={outputRef}
              onScroll={handleOutputScroll}
              className="relative min-h-0 flex-1 overflow-auto px-3 pb-1"
            >
              <div
                className="sticky top-0 inset-x-0 h-6 -mb-6 pointer-events-none z-10 transition-opacity duration-200"
                style={{
                  opacity: scrolledFromTop ? 1 : 0,
                  background: "linear-gradient(to bottom, var(--ui-accent-bubble), transparent)",
                }}
              />
              <pre className="mt-1 text-[color:var(--ui-text-muted)] whitespace-pre font-mono text-xs">
                {output}
              </pre>
              <div
                className="sticky bottom-0 inset-x-0 h-6 -mt-6 pointer-events-none z-10 transition-opacity duration-200"
                style={{
                  opacity: scrolledFromBottom ? 1 : 0,
                  background: "linear-gradient(to top, var(--ui-accent-bubble), transparent)",
                }}
              />
            </div>
          )}
          <div className="px-3 py-1.5 flex justify-end shrink-0">
            {chunk.status === "running" && (
              <span className="text-yellow-400 text-xs">Running...</span>
            )}
            {chunk.status === "success" && (
              <span className="text-[color:var(--ui-text-muted)] text-xs">✓ Success</span>
            )}
            {chunk.status === "error" && (
              <span className="text-red-400 text-xs">✗ Failed</span>
            )}
            {chunk.status === "pending-approval" && (
              <span className="text-yellow-400 text-xs">Waiting for approval...</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

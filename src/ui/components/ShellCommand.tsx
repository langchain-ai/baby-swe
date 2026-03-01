import { memo, useState } from "react";
import type { ToolExecutionChunk } from "../../types";

interface ShellCommandProps {
  chunk: ToolExecutionChunk;
  projectPath?: string;
}

function stripProjectPath(path: string, projectPath?: string): string {
  if (!projectPath || !path.startsWith(projectPath)) return path;
  const relative = path.slice(projectPath.length);
  return relative.startsWith("/") ? "." + relative : "./" + relative;
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
  projectPath,
}: ShellCommandProps) {
  const isSettled = chunk.status === "success" || chunk.status === "error";
  const [expanded, setExpanded] = useState(!isSettled);

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
          <div className="px-3 py-2 font-mono text-xs overflow-y-auto min-h-0">
            <div className="text-[color:var(--ui-text-dim)] mb-2">bash</div>
            <div className="text-[color:var(--ui-text)]">
              <span className="text-[color:var(--ui-text-dim)]">$ </span>
              {command}
            </div>
            {output && (
              <pre className="mt-2 text-[color:var(--ui-text-muted)] whitespace-pre-wrap break-words text-xs">
                {output}
              </pre>
            )}
          </div>
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

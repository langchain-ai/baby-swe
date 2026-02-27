import { memo, useEffect, useRef, useState } from "react";
import { CornerDownLeft, ExternalLink } from "lucide-react";
import type { ToolExecutionChunk } from "../../types";
import { DiffView } from "./DiffView";

interface ToolExecutionProps {
  chunk: ToolExecutionChunk;
  projectPath?: string;
  onApprove?: (approvalRequestId: string) => void;
  onReject?: (approvalRequestId: string) => void;
  onAutoApprove?: (approvalRequestId: string) => void;
  onOpenDiff?: (diffData: { filePath: string; originalContent: string; modifiedContent: string }) => void;
  flat?: boolean;
}

function stripProjectPath(path: string, projectPath?: string): string {
  if (!projectPath || !path.startsWith(projectPath)) return path;
  const relative = path.slice(projectPath.length);
  return relative.startsWith("/") ? "." + relative : "./" + relative;
}

function getFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

function countLineChanges(originalContent: string | null | undefined, newContent: string): { additions: number; deletions: number } {
  const oldLines = originalContent?.split("\n") ?? [];
  const newLines = newContent.split("\n");

  if (originalContent === null || originalContent === undefined) {
    return { additions: newLines.length, deletions: 0 };
  }

  let additions = 0;
  let deletions = 0;
  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i += 1;
      j += 1;
      continue;
    }

    let foundMatch = false;
    for (let lookAhead = 1; lookAhead <= 5; lookAhead += 1) {
      if (i + lookAhead < oldLines.length && j < newLines.length && oldLines[i + lookAhead] === newLines[j]) {
        deletions += lookAhead;
        i += lookAhead;
        foundMatch = true;
        break;
      }
      if (j + lookAhead < newLines.length && i < oldLines.length && newLines[j + lookAhead] === oldLines[i]) {
        additions += lookAhead;
        j += lookAhead;
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      if (i < oldLines.length) {
        deletions += 1;
        i += 1;
      }
      if (j < newLines.length) {
        additions += 1;
        j += 1;
      }
    }
  }

  return { additions, deletions };
}

function getToolDisplayName(
  toolName: string,
  toolArgs: Record<string, unknown>,
  projectPath?: string,
): string {
  switch (toolName) {
    case "execute": {
      const cmd = (toolArgs?.command as string) || "";
      const truncated = cmd.length > 60 ? cmd.slice(0, 60) + "..." : cmd;
      return `Bash(${truncated})`;
    }
    case "list_dir": {
      const path = stripProjectPath(
        (toolArgs?.path as string) || (toolArgs?.directory as string) || ".",
        projectPath,
      );
      return `List(${path})`;
    }
    case "write_file": {
      const path = stripProjectPath(
        (toolArgs?.filePath as string) || (toolArgs?.path as string) || "file",
        projectPath,
      );
      return `Write(${path})`;
    }
    case "edit_file": {
      const path = stripProjectPath(
        (toolArgs?.filePath as string) || (toolArgs?.path as string) || "file",
        projectPath,
      );
      return `Update(${path})`;
    }
    case "read_file": {
      const path = stripProjectPath(
        (toolArgs?.path as string) || (toolArgs?.file_path as string) || "file",
        projectPath,
      );
      return `Read(${path})`;
    }
    case "glob":
    case "search": {
      const pattern = (toolArgs?.pattern as string) || "";
      return `Search(pattern: "${pattern}")`;
    }
    case "grep": {
      const pattern = (toolArgs?.pattern as string) || "";
      const truncated =
        pattern.length > 40 ? pattern.slice(0, 40) + "..." : pattern;
      return `Search(pattern: "${truncated}")`;
    }
    case "web_search": {
      const query = (toolArgs?.query as string) || "";
      return `WebSearch(${query.slice(0, 40)}${query.length > 40 ? "..." : ""})`;
    }
    case "fetch_url": {
      const url = (toolArgs?.url as string) || "";
      return `Fetch(${url.slice(0, 50)}${url.length > 50 ? "..." : ""})`;
    }
    case "write_todos":
      return `TodoWrite(${((toolArgs?.todos as Array<unknown>) || []).length} items)`;
    default:
      return toolName;
  }
}

function getToolSummary(
  toolName: string,
  toolArgs: Record<string, unknown>,
  output?: string,
  status?: string,
): string {
  if (status === "running") return "Running...";
  if (status === "error") return output?.slice(0, 80) || "Error";

  switch (toolName) {
    case "execute": {
      const lines = output?.split("\n").filter((l) => l.trim()).length || 0;
      return lines > 0 ? `${lines} lines` : "No output";
    }
    case "read_file": {
      const lines = output?.split("\n").length || 0;
      return `Read ${lines} lines`;
    }
    case "write_file":
    case "edit_file": {
      return "File updated";
    }
    case "list_dir": {
      const items = output?.split("\n").filter((l) => l.trim()).length || 0;
      return `${items} items`;
    }
    case "glob":
    case "search": {
      const files = output?.split("\n").filter((l) => l.trim()).length || 0;
      return `Found ${files} files`;
    }
    case "grep": {
      const matches = output?.split("\n").filter((l) => l.trim()).length || 0;
      return `Found ${matches} matches`;
    }
    case "write_todos": {
      const todos = (toolArgs?.todos as Array<{ status: string }>) || [];
      const completed = todos.filter((t) => t.status === "completed").length;
      return `${completed}/${todos.length} completed`;
    }
    default:
      return output?.slice(0, 60) || "Done";
  }
}

function KeyboardApproval({
  approvalRequestId,
  toolName,
  onApprove,
  onReject,
  onAutoApprove,
}: {
  approvalRequestId: string;
  toolName: string;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onAutoApprove?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const action = toolName === "execute" ? "Run command" : "Make this edit";

  const options = [
    { label: "Yes", handler: () => onApprove?.(approvalRequestId) },
    { label: "Yes, allow all during this session", handler: () => onAutoApprove?.(approvalRequestId) },
    { label: "No", handler: () => onReject?.(approvalRequestId) },
  ];

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + options.length) % options.length);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % options.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        options[selectedIndex].handler();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onReject?.(approvalRequestId);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [approvalRequestId, selectedIndex, onApprove, onReject, onAutoApprove]);

  return (
    <div ref={containerRef} tabIndex={0} className="outline-none mt-2">
      <div className="text-gray-400 mb-1">Do you want to <span className="text-gray-300">{action.toLowerCase()}</span>?</div>
      {options.map((option, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <span className={idx === selectedIndex ? "text-[#87CEEB]" : "text-transparent"}>›</span>
          <span className={idx === selectedIndex ? "text-[#87CEEB]" : "text-gray-500"}>
            {option.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function CommandApprovalCard({
  approvalRequestId,
  command,
  onApprove,
  onReject,
  onAutoApprove,
}: {
  approvalRequestId: string;
  command: string;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onAutoApprove?: (id: string) => void;
}) {
  const [mode, setMode] = useState<"ask" | "session">("ask");
  const commandName = command.trim().split(/\s+/)[0] || "command";

  const handleRun = () => {
    if (mode === "session") {
      onAutoApprove?.(approvalRequestId);
      return;
    }
    onApprove?.(approvalRequestId);
  };

  const handleSkip = () => {
    onReject?.(approvalRequestId);
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleSkip();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mode, approvalRequestId, onApprove, onReject, onAutoApprove]);

  return (
    <div className="rounded-xl bg-[var(--ui-accent-bubble)] overflow-hidden">
      <div className="flex items-center justify-between border-b border-[color:var(--ui-border)] px-3 py-2">
        <span className="text-[12px] text-[color:var(--ui-text-muted)]">
          Run command: <span className="text-[color:var(--ui-text)]">{commandName}</span>
        </span>
        <ExternalLink className="h-3.5 w-3.5 text-[color:var(--ui-text-dim)]" />
      </div>

      <div className="border-b border-[color:var(--ui-border)] px-3 py-2.5 font-mono text-[12px] text-[color:var(--ui-text)]">
        $ {command || "(empty command)"}
      </div>

      <div className="flex items-center justify-between px-3 py-2.5">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "ask" | "session")}
          className="rounded-md border border-[color:var(--ui-border)] bg-[color:var(--ui-panel-2)] px-2 py-1 text-[12px] text-[color:var(--ui-text)] outline-none focus:border-[color:var(--ui-accent)]"
        >
          <option value="ask">Ask Every Time</option>
          <option value="session">Allow for This Session</option>
        </select>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSkip}
            className="rounded-md px-2 py-1 text-[12px] text-[color:var(--ui-text-dim)] hover:text-[color:var(--ui-text)]"
          >
            Skip
          </button>
          <button
            onClick={handleRun}
            className="inline-flex items-center gap-1 rounded-md bg-[color:var(--ui-accent)] px-3 py-1 text-[12px] text-white hover:opacity-90"
          >
            <span>Run</span>
            <CornerDownLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export const ToolExecution = memo(function ToolExecution({
  chunk,
  projectPath,
  onApprove,
  onReject,
  onAutoApprove,
  onOpenDiff,
  flat = false,
}: ToolExecutionProps) {
  const {
    toolName,
    toolArgs,
    status,
    output,
    approvalRequestId,
    diffData,
  } = chunk;

  const displayName = getToolDisplayName(toolName, toolArgs || {}, projectPath);

  const statusTextClass =
    status === "error"
      ? "text-red-400"
      : status === "running" || status === "pending-approval"
        ? "text-yellow-400"
        : "text-[color:var(--ui-text-muted)]";

  const isFileOp = toolName === "write_file" || toolName === "edit_file";
  const isCommandApproval = status === "pending-approval" && approvalRequestId && toolName === "execute";
  const isCompletedFileOp = isFileOp && diffData && (status === "success" || status === "error");
  const showDiff = isFileOp && diffData;
  const canOpenInEditor = isCompletedFileOp && onOpenDiff;
  const summary = getToolSummary(toolName, toolArgs || {}, output, status);
  const editedFilePath = diffData ? stripProjectPath(diffData.filePath, projectPath) : "";
  const editedFileName = editedFilePath ? getFileName(editedFilePath) : "";
  const diffStats = diffData ? countLineChanges(diffData.originalContent, diffData.newContent) : null;

  const hasContent =
    status === "pending-approval" || status === "running" || summary;

  const handleOpenDiff = () => {
    if (!diffData || !onOpenDiff) return;
    onOpenDiff({
      filePath: diffData.filePath,
      originalContent: diffData.originalContent ?? "",
      modifiedContent: diffData.newContent,
    });
  };

  if (flat && !isCommandApproval) {
    if (isCompletedFileOp && diffStats && diffData) {
      const row = (
        <>
          <span className={status === "error" ? "text-red-400 truncate" : "text-[color:var(--ui-accent)] truncate"}>
            Edited {editedFileName || editedFilePath || diffData.filePath}
          </span>
          <span className="text-green-400 shrink-0">+{diffStats.additions}</span>
          <span className="text-red-400 shrink-0">-{diffStats.deletions}</span>
        </>
      );

      if (canOpenInEditor) {
        return (
          <div className="my-0.5 text-[12px] leading-5">
            <button
              type="button"
              onClick={handleOpenDiff}
              className="w-full flex items-center gap-2 text-left hover:opacity-90 transition-opacity"
              title={`Open diff for ${editedFilePath || diffData.filePath}`}
            >
              {row}
            </button>
          </div>
        );
      }

      return (
        <div className="my-0.5 text-[12px] leading-5">
          <div className="w-full flex items-center gap-2 text-left">{row}</div>
        </div>
      );
    }

    return (
      <div className="my-0.5 text-[12px] leading-5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`${statusTextClass} truncate`}>{displayName}</span>
          {status === "error" && summary && (
            <span className="text-red-400/80 truncate">{summary}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="my-1 text-[12px] leading-5">
      {!isCommandApproval && (
        <div className="flex items-start gap-2">
          <span className={statusTextClass}>{displayName}</span>
          {canOpenInEditor && (
            <button
              onClick={handleOpenDiff}
              className="text-[color:var(--ui-text-dim)] hover:text-[color:var(--ui-accent)] transition-colors text-xs"
              title="Open diff in editor"
            >
              [diff]
            </button>
          )}
        </div>
      )}

      {hasContent && isCommandApproval && (
        <div className="mt-1">
          <CommandApprovalCard
            approvalRequestId={approvalRequestId}
            command={(toolArgs?.command as string) || ""}
            onApprove={onApprove}
            onReject={onReject}
            onAutoApprove={onAutoApprove}
          />
        </div>
      )}

      {hasContent && !isCommandApproval && (
        <div className="pl-4">
          <div className="flex-1 min-w-0">
            {status === "pending-approval" && approvalRequestId ? (
              <>
                {showDiff && <DiffView diffData={diffData} />}
                <KeyboardApproval
                  approvalRequestId={approvalRequestId}
                  toolName={toolName}
                  onApprove={onApprove}
                  onReject={onReject}
                  onAutoApprove={onAutoApprove}
                />
              </>
            ) : status === "running" ? (
              <span className="text-[color:var(--ui-text-dim)]">Running...</span>
            ) : showDiff ? (
              <DiffView diffData={diffData!} />
            ) : (
              <span className="text-[color:var(--ui-text-dim)]">{summary}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

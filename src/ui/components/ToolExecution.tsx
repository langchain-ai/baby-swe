import { useEffect, useRef, useState } from "react";
import type { ToolExecutionChunk } from "../../types";
import { DiffView } from "./DiffView";

interface ToolExecutionProps {
  chunk: ToolExecutionChunk;
  projectPath?: string;
  onApprove?: (approvalRequestId: string) => void;
  onReject?: (approvalRequestId: string) => void;
  onAutoApprove?: (approvalRequestId: string) => void;
}

function formatElapsed(ms?: number): string {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function stripProjectPath(path: string, projectPath?: string): string {
  if (!projectPath || !path.startsWith(projectPath)) return path;
  const relative = path.slice(projectPath.length);
  return relative.startsWith("/") ? "." + relative : "./" + relative;
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
    case "task": {
      const type = (toolArgs?.subagent_type as string) || "Task";
      const desc = (toolArgs?.description as string) || "task";
      const truncatedDesc = desc.length > 50 ? desc.slice(0, 50) + "..." : desc;
      return `${type}(${truncatedDesc})`;
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
    case "task": {
      try {
        const parsed = JSON.parse(output || "{}");
        const result = parsed.output || parsed.error || "Completed";
        return (
          result.split("\n")[0].slice(0, 60) + (result.length > 60 ? "..." : "")
        );
      } catch {
        return "Completed";
      }
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

  const action =
    toolName === "execute"
      ? "Run command"
      : toolName === "task"
        ? "Delegate task"
        : "Make this edit";

  const options = [
    { label: "Yes", handler: () => onApprove?.(approvalRequestId) },
    { label: "Yes, allow all during this session", handler: () => onAutoApprove?.(approvalRequestId) },
    { label: "No", handler: () => onReject?.(approvalRequestId) },
  ];

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

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

export function ToolExecution({
  chunk,
  projectPath,
  onApprove,
  onReject,
  onAutoApprove,
}: ToolExecutionProps) {
  const {
    toolName,
    toolArgs,
    status,
    output,
    elapsedMs,
    approvalRequestId,
    diffData,
  } = chunk;

  const displayName = getToolDisplayName(toolName, toolArgs || {}, projectPath);

  const statusIcon = {
    "pending-approval": (
      <span className="text-yellow-400 animate-pulse">●</span>
    ),
    running: <span className="text-yellow-400 animate-pulse">●</span>,
    success: <span className="text-[#87CEEB]">●</span>,
    error: <span className="text-red-400">●</span>,
  }[status];

  const isFileOp = toolName === "write_file" || toolName === "edit_file";
  const showDiff = isFileOp && diffData && status === "pending-approval";
  const summary = getToolSummary(toolName, toolArgs || {}, output, status);

  const hasContent =
    status === "pending-approval" || status === "running" || summary;

  return (
    <div className="my-1 font-mono text-sm">
      <div className="flex items-start gap-2">
        {statusIcon}
        <span className="text-gray-300">{displayName}</span>
        {elapsedMs && status !== "running" && (
          <span className="text-gray-600">{formatElapsed(elapsedMs)}</span>
        )}
      </div>

      {hasContent && (
        <div className="flex items-start gap-2">
          <span className="text-gray-600 select-none">└</span>
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
              <span className="text-gray-500">Running...</span>
            ) : (
              <span className="text-gray-500">{summary}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

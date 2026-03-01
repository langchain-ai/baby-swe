import { memo } from "react";
import type { ToolExecutionChunk } from "../../types";
import { DiffView } from "./DiffView";

interface ToolExecutionProps {
  chunk: ToolExecutionChunk;
  projectPath?: string;
  onApprove?: (approvalRequestId: string) => void;
  onReject?: (approvalRequestId: string) => void;
  onAutoApprove?: (approvalRequestId: string) => void;
  onOpenDiff?: (diffData: { filePath: string; originalContent: string; modifiedContent: string }) => void;
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
    case "list_dir": {
      const path = stripProjectPath(
        (toolArgs?.path as string) || (toolArgs?.directory as string) || ".",
        projectPath,
      );
      return `List(${path})`;
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
      const truncated = pattern.length > 40 ? pattern.slice(0, 40) + "..." : pattern;
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

export const ToolExecution = memo(function ToolExecution({
  chunk,
  projectPath,
  onOpenDiff,
}: ToolExecutionProps) {
  const { toolName, toolArgs, status, output, diffData } = chunk;

  const isFileOp = toolName === "write_file" || toolName === "edit_file";
  const isCompletedFileOp = isFileOp && diffData && (status === "success" || status === "error");
  const canOpenInEditor = isCompletedFileOp && onOpenDiff;
  const editedFilePath = diffData ? stripProjectPath(diffData.filePath, projectPath) : "";
  const editedFileName = editedFilePath ? getFileName(editedFilePath) : "";
  const diffStats = diffData ? countLineChanges(diffData.originalContent, diffData.newContent) : null;

  const handleOpenDiff = () => {
    if (!diffData || !onOpenDiff) return;
    onOpenDiff({
      filePath: diffData.filePath,
      originalContent: diffData.originalContent ?? "",
      modifiedContent: diffData.newContent,
    });
  };

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

  if (isFileOp && status === "pending-approval" && diffData) {
    return (
      <div className="my-1 text-[12px] leading-5">
        <DiffView diffData={diffData} />
        <span className="text-[color:var(--ui-text-dim)]">Waiting for approval...</span>
      </div>
    );
  }

  if (isFileOp && status === "running") {
    const path = stripProjectPath(
      ((toolArgs as Record<string, unknown>)?.filePath as string) ||
      ((toolArgs as Record<string, unknown>)?.path as string) || "file",
      projectPath,
    );
    return (
      <div className="my-0.5 text-[12px] leading-5">
        <span className="text-yellow-400">Editing {getFileName(path)}...</span>
      </div>
    );
  }

  const displayName = getToolDisplayName(toolName, toolArgs || {}, projectPath);
  const statusTextClass =
    status === "error"
      ? "text-red-400"
      : status === "running" || status === "pending-approval"
        ? "text-yellow-400"
        : "text-[color:var(--ui-text-muted)]";

  return (
    <div className="my-0.5 text-[12px] leading-5">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`${statusTextClass} truncate`}>{displayName}</span>
        {status === "error" && output && (
          <span className="text-red-400/80 truncate">{output.slice(0, 80)}</span>
        )}
      </div>
    </div>
  );
});

import { memo } from "react";
import { diffLines } from "diff";
import type { ToolExecutionChunk, AcpToolKind } from "../../types";
import { DiffView } from "./DiffView";

interface ToolExecutionProps {
  chunk: ToolExecutionChunk;
  projectPath?: string;
  onApprove?: (approvalRequestId: string) => void;
  onReject?: (approvalRequestId: string) => void;
  onAutoApprove?: (approvalRequestId: string) => void;
  onOpenDiff?: (diffData: { filePath: string; originalContent: string; modifiedContent: string }) => void;
  resolvedDiffData?: { originalContent: string; modifiedContent: string };
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

function countLines(text: string): number {
  if (text.length === 0) return 0;
  const segments = text.split("\n");
  return text.endsWith("\n") ? segments.length - 1 : segments.length;
}

function countLineChanges(originalContent: string | null | undefined, newContent: string): { additions: number; deletions: number } {
  const before = originalContent ?? "";
  const parts = diffLines(before, newContent, {
    ignoreWhitespace: false,
    newlineIsToken: false,
  });

  let additions = 0;
  let deletions = 0;

  for (const part of parts) {
    const lineCount = countLines(part.value);
    if (part.added) additions += lineCount;
    else if (part.removed) deletions += lineCount;
  }

  return { additions, deletions };
}

function formatToolDisplay(
  title: string,
  toolKind: AcpToolKind,
  input: Record<string, unknown> | undefined,
  projectPath?: string,
): string {
  const path = input?.path as string | undefined;
  const pattern = input?.pattern as string | undefined;
  const query = input?.query as string | undefined;
  const url = input?.url as string | undefined;
  const command = input?.command as string | undefined;

  switch (toolKind) {
    case "read": {
      if (path) {
        const displayPath = stripProjectPath(path, projectPath);
        return `Read(${displayPath})`;
      }
      return title;
    }
    case "search": {
      if (pattern) {
        const truncated = pattern.length > 40 ? pattern.slice(0, 40) + "..." : pattern;
        return `Search("${truncated}")`;
      }
      if (query) {
        return `Search("${query.slice(0, 40)}${query.length > 40 ? "..." : ""}")`;
      }
      return title;
    }
    case "fetch": {
      if (url) {
        return `Fetch(${url.slice(0, 50)}${url.length > 50 ? "..." : ""})`;
      }
      return title;
    }
    case "execute": {
      if (command) {
        const truncated = command.length > 60 ? command.slice(0, 60) + "..." : command;
        return `Shell(${truncated})`;
      }
      return title;
    }
    case "edit":
    case "delete":
    case "move":
      return title;
    case "think":
      return "Thinking...";
    default:
      return title;
  }
}

export const ToolExecution = memo(function ToolExecution({
  chunk,
  projectPath,
  onOpenDiff,
  resolvedDiffData,
}: ToolExecutionProps) {
  const { title, toolKind, input, status, output, diffData } = chunk;

  const isEditOp = toolKind === "edit" || toolKind === "delete" || toolKind === "move" || diffData != null;
  const isCompletedEditOp = isEditOp && diffData && (status === "completed" || status === "error");
  const canOpenInEditor = isCompletedEditOp && onOpenDiff;
  const editedFilePath = diffData ? stripProjectPath(diffData.filePath, projectPath) : "";
  const editedFileName = editedFilePath ? getFileName(editedFilePath) : "";
  const diffStats = diffData ? countLineChanges(diffData.originalContent, diffData.newContent) : null;

  const handleOpenDiff = () => {
    if (!diffData || !onOpenDiff) return;
    onOpenDiff({
      filePath: diffData.filePath,
      originalContent: resolvedDiffData?.originalContent ?? diffData.originalContent ?? "",
      modifiedContent: resolvedDiffData?.modifiedContent ?? diffData.newContent,
    });
  };

  if (isCompletedEditOp && diffStats && diffData) {
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

  if (isEditOp && status === "pending" && diffData) {
    return (
      <div className="my-1 text-[12px] leading-5">
        <DiffView diffData={diffData} />
        <span className="text-[color:var(--ui-text-dim)]">Waiting for approval...</span>
      </div>
    );
  }

  if (isEditOp && status === "in_progress") {
    const path = stripProjectPath(
      diffData?.filePath ||
      (input?.filePath as string) ||
      (input?.path as string) || "file",
      projectPath,
    );
    return (
      <div className="my-0.5 text-[12px] leading-5">
        <span className="text-yellow-400">Editing {getFileName(path)}...</span>
      </div>
    );
  }

  const displayName = formatToolDisplay(title, toolKind, input, projectPath);
  const statusTextClass =
    status === "error"
      ? "text-red-400"
      : status === "in_progress" || status === "pending"
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

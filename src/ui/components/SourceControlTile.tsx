import { useState, useEffect, useCallback, useRef, memo } from "react";
import type { GitStatusEntry, GitFileStatus } from "../../types";
import { useStore } from "../../store";

const STATUS_LABELS: Record<GitFileStatus, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  untracked: "U",
  "staged-modified": "M",
  "staged-added": "A",
  "staged-deleted": "D",
  "staged-renamed": "R",
};

const STATUS_COLORS: Record<GitFileStatus, string> = {
  modified: "text-yellow-400",
  added: "text-green-400",
  deleted: "text-red-400",
  renamed: "text-blue-400",
  untracked: "text-green-400",
  "staged-modified": "text-yellow-400",
  "staged-added": "text-green-400",
  "staged-deleted": "text-red-400",
  "staged-renamed": "text-blue-400",
};

interface SourceControlTileProps {
  tileId: string;
  projectPath?: string;
  isFocused: boolean;
  onFocus: () => void;
}

export const SourceControlTile = memo(function SourceControlTile({
  tileId,
  projectPath,
  isFocused,
  onFocus,
}: SourceControlTileProps) {
  const [entries, setEntries] = useState<GitStatusEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [stagedCollapsed, setStagedCollapsed] = useState(false);
  const [changesCollapsed, setChangesCollapsed] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; error: boolean } | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFileViewer = useStore((state) => state.openFileViewer);

  const showStatus = useCallback((text: string, error = false) => {
    setStatusMsg({ text, error });
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatusMsg(null), 3000);
  }, []);

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const result = await window.git.status(projectPath);
      setEntries(result);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, [projectPath]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  const stagedEntries = entries.filter((e) => e.staged);
  const changedEntries = entries.filter((e) => !e.staged);

  const handleFileClick = useCallback(
    async (entry: GitStatusEntry) => {
      if (!projectPath) return;
      const diff = await window.git.diffFile(projectPath, entry.path);
      if (!diff) return;
      const language = entry.path.split(".").pop() ?? "plaintext";
      openFileViewer({
        filePath: entry.path,
        originalContent: diff.original,
        modifiedContent: diff.modified,
        language,
      });
    },
    [projectPath, openFileViewer],
  );

  const handleStageFile = useCallback(
    async (entry: GitStatusEntry) => {
      if (!projectPath) return;
      const result = await window.git.stageFile(projectPath, entry.path);
      if (!result.success) showStatus(result.error ?? "Stage failed", true);
      else refresh();
    },
    [projectPath, refresh, showStatus],
  );

  const handleUnstageFile = useCallback(
    async (entry: GitStatusEntry) => {
      if (!projectPath) return;
      const result = await window.git.unstageFile(projectPath, entry.path);
      if (!result.success) showStatus(result.error ?? "Unstage failed", true);
      else refresh();
    },
    [projectPath, refresh, showStatus],
  );

  const handleDiscardFile = useCallback(
    async (entry: GitStatusEntry) => {
      if (!projectPath) return;
      const result = await window.git.discardFile(projectPath, entry.path);
      if (!result.success) showStatus(result.error ?? "Discard failed", true);
      else refresh();
    },
    [projectPath, refresh, showStatus],
  );

  const handleStageAll = useCallback(async () => {
    if (!projectPath) return;
    const result = await window.git.stageAll(projectPath);
    if (!result.success) showStatus(result.error ?? "Stage all failed", true);
    else refresh();
  }, [projectPath, refresh, showStatus]);

  const handleCommit = useCallback(async () => {
    if (!projectPath || !commitMessage.trim()) return;
    if (stagedEntries.length === 0) {
      showStatus("No staged changes to commit", true);
      return;
    }
    setCommitting(true);
    const result = await window.git.commit(projectPath, commitMessage.trim());
    setCommitting(false);
    if (result.success) {
      setCommitMessage("");
      showStatus("Committed successfully");
      refresh();
    } else {
      showStatus(result.error ?? "Commit failed", true);
    }
  }, [projectPath, commitMessage, stagedEntries.length, refresh, showStatus]);

  const handlePush = useCallback(async () => {
    if (!projectPath) return;
    setPushing(true);
    const result = await window.git.push(projectPath);
    setPushing(false);
    if (result.success) showStatus("Pushed successfully");
    else showStatus(result.error ?? "Push failed", true);
  }, [projectPath, showStatus]);

  return (
    <div
      className="relative flex flex-col h-full w-full bg-[#1a2332] text-gray-100 overflow-hidden"
      onClick={onFocus}
    >
      {isFocused && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 ring-2 ring-[#5a9bc7] ring-inset z-20"
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-3 h-9 shrink-0 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <SourceControlIcon />
          <span className="text-xs font-medium text-gray-300 uppercase tracking-wide">
            Source Control
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePush();
            }}
            disabled={pushing}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1 disabled:opacity-40"
            title="Push"
          >
            {pushing ? <SpinnerIcon /> : <PushIcon />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              refresh();
            }}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1"
            title="Refresh"
          >
            <RefreshIcon spinning={loading} />
          </button>
        </div>
      </div>

      {/* Commit area */}
      {projectPath && (
        <div
          className="shrink-0 px-3 py-2 border-b border-gray-800 flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleCommit();
              }
            }}
            placeholder="Commit message (⌘↵ to commit)"
            rows={2}
            className="w-full bg-[#111c2b] text-gray-200 text-xs rounded px-2 py-1.5 resize-none placeholder-gray-600 border border-gray-700 focus:border-[#5a9bc7] focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCommit}
              disabled={committing || !commitMessage.trim() || stagedEntries.length === 0}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#5a9bc7] hover:bg-[#4a8ab6] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded px-2 py-1.5 transition-colors"
            >
              <CommitIcon />
              {committing ? "Committing…" : "Commit"}
            </button>
            {changedEntries.length > 0 && (
              <button
                onClick={handleStageAll}
                className="flex items-center justify-center gap-1 bg-[#1e2a3a] hover:bg-[#243244] text-gray-300 text-xs rounded px-2 py-1.5 transition-colors border border-gray-700"
                title="Stage all changes"
              >
                <PlusIcon />
                Stage all
              </button>
            )}
          </div>
          {statusMsg && (
            <p className={`text-[10px] truncate ${statusMsg.error ? "text-red-400" : "text-green-400"}`}>
              {statusMsg.text}
            </p>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!projectPath && (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs">
            No project open
          </div>
        )}

        {projectPath && entries.length === 0 && !loading && (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs">
            No changes
          </div>
        )}

        {/* Staged Changes */}
        {stagedEntries.length > 0 && (
          <FileGroup
            label="Staged Changes"
            count={stagedEntries.length}
            collapsed={stagedCollapsed}
            onToggle={() => setStagedCollapsed(!stagedCollapsed)}
            entries={stagedEntries}
            onFileClick={handleFileClick}
            onPrimaryAction={handleUnstageFile}
            onSecondaryAction={undefined}
            primaryActionTitle="Unstage"
            primaryActionIcon="minus"
          />
        )}

        {/* Changes */}
        {changedEntries.length > 0 && (
          <FileGroup
            label="Changes"
            count={changedEntries.length}
            collapsed={changesCollapsed}
            onToggle={() => setChangesCollapsed(!changesCollapsed)}
            entries={changedEntries}
            onFileClick={handleFileClick}
            onPrimaryAction={handleStageFile}
            onSecondaryAction={handleDiscardFile}
            primaryActionTitle="Stage"
            primaryActionIcon="plus"
          />
        )}
      </div>
    </div>
  );
});

function FileGroup({
  label,
  count,
  collapsed,
  onToggle,
  entries,
  onFileClick,
  onPrimaryAction,
  onSecondaryAction,
  primaryActionTitle,
  primaryActionIcon,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  entries: GitStatusEntry[];
  onFileClick: (entry: GitStatusEntry) => void;
  onPrimaryAction: (entry: GitStatusEntry) => void;
  onSecondaryAction: ((entry: GitStatusEntry) => void) | undefined;
  primaryActionTitle: string;
  primaryActionIcon: "plus" | "minus";
}) {
  return (
    <div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-[#1e2a3a] transition-colors"
      >
        <ChevronIcon collapsed={collapsed} />
        <span className="font-medium uppercase tracking-wide">{label}</span>
        <span className="ml-auto text-gray-600 tabular-nums">{count}</span>
      </button>
      {!collapsed &&
        entries.map((entry) => (
          <FileEntry
            key={`${entry.staged ? "s" : "c"}-${entry.path}`}
            entry={entry}
            onClick={() => onFileClick(entry)}
            onPrimaryAction={() => onPrimaryAction(entry)}
            onSecondaryAction={onSecondaryAction ? () => onSecondaryAction(entry) : undefined}
            primaryActionTitle={primaryActionTitle}
            primaryActionIcon={primaryActionIcon}
          />
        ))}
    </div>
  );
}

function FileEntry({
  entry,
  onClick,
  onPrimaryAction,
  onSecondaryAction,
  primaryActionTitle,
  primaryActionIcon,
}: {
  entry: GitStatusEntry;
  onClick: () => void;
  onPrimaryAction: () => void;
  onSecondaryAction: (() => void) | undefined;
  primaryActionTitle: string;
  primaryActionIcon: "plus" | "minus";
}) {
  const fileName = entry.path.split("/").pop() ?? entry.path;
  const dirPath = entry.path.includes("/")
    ? entry.path.slice(0, entry.path.lastIndexOf("/"))
    : "";

  return (
    <div
      className="flex items-center gap-1 w-full pl-7 pr-2 py-1 text-xs hover:bg-[#1e2a3a] transition-colors group"
      title={entry.path}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="flex items-center gap-2 flex-1 min-w-0 text-left"
      >
        <FileIcon status={entry.status} />
        <span className="truncate text-gray-300 group-hover:text-gray-100">
          {fileName}
        </span>
        {dirPath && (
          <span className="truncate text-gray-600 text-[10px] ml-auto shrink-0 max-w-[40%]">
            {dirPath}
          </span>
        )}
      </button>

      {/* Action buttons — visible on hover */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {onSecondaryAction && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSecondaryAction();
            }}
            className="p-0.5 text-gray-500 hover:text-red-400 transition-colors"
            title="Discard changes"
          >
            <DiscardIcon />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrimaryAction();
          }}
          className="p-0.5 text-gray-500 hover:text-gray-200 transition-colors"
          title={primaryActionTitle}
        >
          {primaryActionIcon === "plus" ? <PlusIcon /> : <MinusIcon />}
        </button>
      </div>

      <span
        className={`shrink-0 w-4 text-center font-medium group-hover:opacity-0 transition-opacity ${STATUS_COLORS[entry.status]}`}
      >
        {STATUS_LABELS[entry.status]}
      </span>
    </div>
  );
}

// Icons

function SourceControlIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-gray-400"
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 9v6a3 3 0 0 0 3 3h3" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? "animate-spin" : ""}
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform shrink-0 ${collapsed ? "" : "rotate-90"}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function FileIcon({ status }: { status: GitFileStatus }) {
  const isDelete = status === "deleted" || status === "staged-deleted";
  const isNew =
    status === "added" || status === "staged-added" || status === "untracked";

  let color = "text-gray-500";
  if (isNew) color = "text-green-500";
  else if (isDelete) color = "text-red-500";
  else if (status === "modified" || status === "staged-modified")
    color = "text-yellow-500";

  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${color}`}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function DiscardIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-4.95L1 10" />
    </svg>
  );
}

function CommitIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="1.05" y1="12" x2="7" y2="12" />
      <line x1="17.01" y1="12" x2="22.96" y2="12" />
    </svg>
  );
}

function PushIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

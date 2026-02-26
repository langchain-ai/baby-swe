import { useState, useEffect, useCallback, useRef, memo } from "react";
import type { GitStatusEntry, GitFileStatus, WorktreeInfo } from "../../types";
import { useStore } from "../../store";

// ─── Status display maps ────────────────────────────────────────────────────

const STATUS_LABELS: Partial<Record<GitFileStatus, string>> = {
  "index-modified": "M",
  "index-added": "A",
  "index-deleted": "D",
  "index-renamed": "R",
  "index-copied": "C",
  modified: "M",
  deleted: "D",
  untracked: "U",
  ignored: "!",
  "type-changed": "T",
  "intent-to-add": "A",
  "both-modified": "!",
  "both-added": "!",
  "added-by-us": "!",
  "added-by-them": "!",
  "deleted-by-us": "!",
  "deleted-by-them": "!",
  "both-deleted": "!",
};

const STATUS_COLORS: Partial<Record<GitFileStatus, string>> = {
  "index-modified": "text-yellow-400",
  "index-added": "text-green-400",
  "index-deleted": "text-red-400",
  "index-renamed": "text-blue-400",
  "index-copied": "text-blue-400",
  modified: "text-yellow-400",
  deleted: "text-red-400",
  untracked: "text-green-400",
  ignored: "text-gray-500",
  "type-changed": "text-yellow-400",
  "intent-to-add": "text-green-400",
  "both-modified": "text-orange-400",
  "both-added": "text-orange-400",
  "added-by-us": "text-orange-400",
  "added-by-them": "text-orange-400",
  "deleted-by-us": "text-orange-400",
  "deleted-by-them": "text-orange-400",
  "both-deleted": "text-orange-400",
};

interface SourceControlTileProps {
  tileId: string;
  projectPath?: string;
  mainProjectPath?: string;
  isFocused: boolean;
  onFocus: () => void;
}

type SyncStatus = { ahead: number; behind: number; remote: string | null; branchName: string | null };

interface WorktreeState {
  worktree: WorktreeInfo;
  entries: GitStatusEntry[];
  syncStatus: SyncStatus | null;
  collapsed: boolean;
  // per-group collapse state
  mergeCollapsed: boolean;
  stagedCollapsed: boolean;
  changesCollapsed: boolean;
  untrackedCollapsed: boolean;
  // per-worktree commit/sync state
  commitMessage: string;
  committing: boolean;
  pushing: boolean;
  pulling: boolean;
}

function isUntracked(status: GitFileStatus): boolean {
  return status === "untracked";
}

function isConflict(status: GitFileStatus): boolean {
  return (
    status === "both-modified" ||
    status === "both-added" ||
    status === "both-deleted" ||
    status === "added-by-us" ||
    status === "added-by-them" ||
    status === "deleted-by-us" ||
    status === "deleted-by-them"
  );
}

export const SourceControlTile = memo(function SourceControlTile({
  tileId,
  projectPath,
  mainProjectPath,
  isFocused,
  onFocus,
}: SourceControlTileProps) {
  // The "active" path for the commit area — prefer the specific worktree/project path
  const activePath = projectPath;
  const rootPath = mainProjectPath || projectPath;

  const [worktreeStates, setWorktreeStates] = useState<WorktreeState[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; error: boolean } | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFileViewer = useStore((state) => state.openFileViewer);

  const showStatus = useCallback((text: string, error = false) => {
    setStatusMsg({ text, error });
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatusMsg(null), 3000);
  }, []);

  const refresh = useCallback(async () => {
    if (!rootPath) return;
    try {
      const worktrees = await window.git.listWorktrees(rootPath);
      // Filter out bare worktrees
      const activeWorktrees = worktrees.filter((wt) => !wt.isBare);

      const results = await Promise.all(
        activeWorktrees.map(async (wt) => {
          try {
            const [entries, sync] = await Promise.all([
              window.git.status(wt.path),
              window.git.syncStatus(wt.path),
            ]);
            return { wt, entries, sync };
          } catch {
            return { wt, entries: [] as GitStatusEntry[], sync: null };
          }
        }),
      );

      setWorktreeStates((prev) => {
        const next: WorktreeState[] = results.map(({ wt, entries, sync }) => {
          const existing = prev.find((s) => s.worktree.path === wt.path);
          return {
            worktree: wt,
            entries,
            syncStatus: sync,
            // Preserve collapse state from previous render; default: expanded
            collapsed: existing?.collapsed ?? false,
            mergeCollapsed: existing?.mergeCollapsed ?? false,
            stagedCollapsed: existing?.stagedCollapsed ?? false,
            changesCollapsed: existing?.changesCollapsed ?? false,
            untrackedCollapsed: existing?.untrackedCollapsed ?? false,
            // Preserve per-worktree action state
            commitMessage: existing?.commitMessage ?? "",
            committing: existing?.committing ?? false,
            pushing: existing?.pushing ?? false,
            pulling: existing?.pulling ?? false,
          };
        });
        // Avoid re-render if nothing changed
        if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
        return next;
      });
    } catch {
      // If listWorktrees fails (not a git repo, etc.), fall back to single-path view
      if (activePath) {
        try {
          const [entries, sync] = await Promise.all([
            window.git.status(activePath),
            window.git.syncStatus(activePath),
          ]);
          setWorktreeStates((prev) => {
            const fallback: WorktreeState[] = [{
              worktree: { path: activePath, branch: sync?.branchName ?? "", isMain: true, isBare: false },
              entries,
              syncStatus: sync,
              collapsed: prev[0]?.collapsed ?? false,
              mergeCollapsed: prev[0]?.mergeCollapsed ?? false,
              stagedCollapsed: prev[0]?.stagedCollapsed ?? false,
              changesCollapsed: prev[0]?.changesCollapsed ?? false,
              untrackedCollapsed: prev[0]?.untrackedCollapsed ?? false,
              commitMessage: prev[0]?.commitMessage ?? "",
              committing: prev[0]?.committing ?? false,
              pushing: prev[0]?.pushing ?? false,
              pulling: prev[0]?.pulling ?? false,
            }];
            if (JSON.stringify(fallback) === JSON.stringify(prev)) return prev;
            return fallback;
          });
        } catch {
          setWorktreeStates([]);
        }
      }
    }
    setLoading(false);
  }, [rootPath, activePath]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Helper to update a specific worktree's state
  const updateWorktreeState = useCallback(
    (wtPath: string, update: Partial<Omit<WorktreeState, "worktree" | "entries" | "syncStatus">>) => {
      setWorktreeStates((prev) =>
        prev.map((s) => (s.worktree.path === wtPath ? { ...s, ...update } : s)),
      );
    },
    [],
  );

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleFileClick = useCallback(
    async (wtPath: string, entry: GitStatusEntry) => {
      try {
        const diff = await window.git.diffFile(wtPath, entry.path, entry.staged);
        if (!diff) return;
        const language = entry.path.split(".").pop() ?? "plaintext";
        openFileViewer({
          filePath: entry.path,
          originalContent: diff.original,
          modifiedContent: diff.modified,
          language,
        });
      } catch {
        showStatus("Failed to load diff", true);
      }
    },
    [openFileViewer, showStatus],
  );

  const handleStageFile = useCallback(
    async (wtPath: string, entry: GitStatusEntry) => {
      const result = await window.git.stageFile(wtPath, entry.path);
      if (!result.success) showStatus(result.error ?? "Stage failed", true);
      else refresh();
    },
    [refresh, showStatus],
  );

  const handleUnstageFile = useCallback(
    async (wtPath: string, entry: GitStatusEntry) => {
      const result = await window.git.unstageFile(wtPath, entry.path);
      if (!result.success) showStatus(result.error ?? "Unstage failed", true);
      else refresh();
    },
    [refresh, showStatus],
  );

  const handleDiscardFile = useCallback(
    async (wtPath: string, entry: GitStatusEntry) => {
      const result = await window.git.discardFile(wtPath, entry.path, isUntracked(entry.status));
      if (!result.success) showStatus(result.error ?? "Discard failed", true);
      else refresh();
    },
    [refresh, showStatus],
  );

  const handleStageAll = useCallback(async (wtPath: string) => {
    const result = await window.git.stageAll(wtPath);
    if (!result.success) showStatus(result.error ?? "Stage all failed", true);
    else refresh();
  }, [refresh, showStatus]);

  const handleUnstageAll = useCallback(async (wtPath: string) => {
    const result = await window.git.unstageAll(wtPath);
    if (!result.success) showStatus(result.error ?? "Unstage all failed", true);
    else refresh();
  }, [refresh, showStatus]);

  const handleDiscardAll = useCallback(async (wtPath: string) => {
    const result = await window.git.discardAll(wtPath);
    if (!result.success) showStatus(result.error ?? "Discard all failed", true);
    else refresh();
  }, [refresh, showStatus]);

  const handleCommit = useCallback(async (wtPath: string) => {
    const state = worktreeStates.find((s) => s.worktree.path === wtPath);
    if (!state || !state.commitMessage.trim()) return;
    const staged = state.entries.filter((e) => e.staged && !isConflict(e.status));
    if (staged.length === 0) {
      showStatus("No staged changes to commit", true);
      return;
    }
    updateWorktreeState(wtPath, { committing: true });
    const result = await window.git.commit(wtPath, state.commitMessage.trim());
    updateWorktreeState(wtPath, { committing: false });
    if (result.success) {
      updateWorktreeState(wtPath, { commitMessage: "" });
      showStatus("Committed successfully");
      refresh();
    } else {
      showStatus(result.error ?? "Commit failed", true);
    }
  }, [worktreeStates, updateWorktreeState, refresh, showStatus]);

  const handlePush = useCallback(async (wtPath: string) => {
    updateWorktreeState(wtPath, { pushing: true });
    const result = await window.git.push(wtPath);
    updateWorktreeState(wtPath, { pushing: false });
    if (result.success) {
      showStatus("Pushed successfully");
      refresh();
    } else {
      showStatus(result.error ?? "Push failed", true);
    }
  }, [updateWorktreeState, refresh, showStatus]);

  const handlePull = useCallback(async (wtPath: string) => {
    updateWorktreeState(wtPath, { pulling: true });
    const result = await window.git.pull(wtPath);
    updateWorktreeState(wtPath, { pulling: false });
    if (result.success) {
      showStatus("Pulled successfully");
      refresh();
    } else {
      showStatus(result.error ?? "Pull failed", true);
    }
  }, [updateWorktreeState, refresh, showStatus]);

  const totalChanges = worktreeStates.reduce((sum, s) => sum + s.entries.length, 0);
  const multiWorktree = worktreeStates.length > 1;

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
              refresh();
            }}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1"
            title="Refresh"
          >
            <RefreshIcon spinning={loading} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!rootPath && (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs">
            No project open
          </div>
        )}

        {rootPath && totalChanges === 0 && !loading && (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs">
            No changes
          </div>
        )}

        {worktreeStates.map((state) => {
          const wtPath = state.worktree.path;
          const wtMergeEntries = state.entries.filter((e) => isConflict(e.status));
          const wtStagedEntries = state.entries.filter((e) => e.staged && !isConflict(e.status));
          const wtChangedEntries = state.entries.filter((e) => !e.staged && !isConflict(e.status) && !isUntracked(e.status));
          const wtUntrackedEntries = state.entries.filter((e) => isUntracked(e.status));
          const wtTotalChanges = state.entries.length;
          const isActive = wtPath === activePath;

          const wtSyncStatus = state.syncStatus;
          const aheadBehind = wtSyncStatus
            ? (() => {
                const { ahead, behind } = wtSyncStatus;
                if (ahead > 0 && behind > 0) return `${ahead}↑ ${behind}↓`;
                if (ahead > 0) return `${ahead}↑`;
                if (behind > 0) return `${behind}↓`;
                return null;
              })()
            : null;

          const commitArea = (
            <div
              className={`px-3 py-2 border-b border-gray-800 flex flex-col gap-2 ${multiWorktree ? "border-t border-gray-800/60" : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              <textarea
                value={state.commitMessage}
                onChange={(e) => updateWorktreeState(wtPath, { commitMessage: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleCommit(wtPath);
                  }
                }}
                placeholder="Message (⌘↵ to commit)"
                rows={2}
                className="w-full bg-[#111c2b] text-gray-200 text-xs rounded px-2 py-1.5 resize-none placeholder-gray-600 border border-gray-700 focus:border-[#5a9bc7] focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleCommit(wtPath)}
                  disabled={state.committing || !state.commitMessage.trim() || wtStagedEntries.length === 0}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#5a9bc7] hover:bg-[#4a8ab6] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded px-2 py-1.5 transition-colors"
                >
                  <CommitIcon />
                  {state.committing ? "Committing..." : "Commit"}
                </button>
                {wtChangedEntries.length + wtUntrackedEntries.length > 0 && (
                  <button
                    onClick={() => handleStageAll(wtPath)}
                    className="flex items-center justify-center gap-1 bg-[#1e2a3a] hover:bg-[#243244] text-gray-300 text-xs rounded px-2 py-1.5 transition-colors border border-gray-700"
                    title="Stage all changes"
                  >
                    <PlusIcon />
                    Stage all
                  </button>
                )}
                <button
                  onClick={() => handlePull(wtPath)}
                  disabled={state.pulling}
                  className="flex items-center justify-center bg-[#1e2a3a] hover:bg-[#243244] text-gray-300 text-xs rounded px-2 py-1.5 transition-colors border border-gray-700 disabled:opacity-40"
                  title={aheadBehind ? `Pull (${aheadBehind})` : "Pull"}
                >
                  {state.pulling ? <SpinnerIcon /> : <PullIcon />}
                </button>
                <button
                  onClick={() => handlePush(wtPath)}
                  disabled={state.pushing}
                  className="flex items-center justify-center bg-[#1e2a3a] hover:bg-[#243244] text-gray-300 text-xs rounded px-2 py-1.5 transition-colors border border-gray-700 disabled:opacity-40"
                  title={aheadBehind ? `Push (${aheadBehind})` : "Push"}
                >
                  {state.pushing ? <SpinnerIcon /> : <PushIcon />}
                </button>
              </div>
            </div>
          );

          const fileGroups = !state.collapsed && (
            <>
              {wtMergeEntries.length > 0 && (
                <FileGroup
                  label="Merge Changes"
                  count={wtMergeEntries.length}
                  collapsed={state.mergeCollapsed}
                  onToggle={() => updateWorktreeState(wtPath, { mergeCollapsed: !state.mergeCollapsed })}
                  entries={wtMergeEntries}
                  onFileClick={(e) => handleFileClick(wtPath, e)}
                  onPrimaryAction={(e) => handleStageFile(wtPath, e)}
                  onSecondaryAction={undefined}
                  primaryActionTitle="Stage (mark resolved)"
                  primaryActionIcon="plus"
                  onGroupAction={undefined}
                  groupActionTitle={undefined}
                  groupActionIcon={undefined}
                  indent={multiWorktree}
                />
              )}
              {wtStagedEntries.length > 0 && (
                <FileGroup
                  label="Staged Changes"
                  count={wtStagedEntries.length}
                  collapsed={state.stagedCollapsed}
                  onToggle={() => updateWorktreeState(wtPath, { stagedCollapsed: !state.stagedCollapsed })}
                  entries={wtStagedEntries}
                  onFileClick={(e) => handleFileClick(wtPath, e)}
                  onPrimaryAction={(e) => handleUnstageFile(wtPath, e)}
                  onSecondaryAction={undefined}
                  primaryActionTitle="Unstage"
                  primaryActionIcon="minus"
                  onGroupAction={() => handleUnstageAll(wtPath)}
                  groupActionTitle="Unstage all"
                  groupActionIcon="minus"
                  indent={multiWorktree}
                />
              )}
              {wtChangedEntries.length > 0 && (
                <FileGroup
                  label="Changes"
                  count={wtChangedEntries.length}
                  collapsed={state.changesCollapsed}
                  onToggle={() => updateWorktreeState(wtPath, { changesCollapsed: !state.changesCollapsed })}
                  entries={wtChangedEntries}
                  onFileClick={(e) => handleFileClick(wtPath, e)}
                  onPrimaryAction={(e) => handleStageFile(wtPath, e)}
                  onSecondaryAction={(e) => handleDiscardFile(wtPath, e)}
                  primaryActionTitle="Stage"
                  primaryActionIcon="plus"
                  onGroupAction={() => handleDiscardAll(wtPath)}
                  groupActionTitle="Discard all changes"
                  groupActionIcon="discard"
                  indent={multiWorktree}
                />
              )}
              {wtUntrackedEntries.length > 0 && (
                <FileGroup
                  label="Untracked"
                  count={wtUntrackedEntries.length}
                  collapsed={state.untrackedCollapsed}
                  onToggle={() => updateWorktreeState(wtPath, { untrackedCollapsed: !state.untrackedCollapsed })}
                  entries={wtUntrackedEntries}
                  onFileClick={(e) => handleFileClick(wtPath, e)}
                  onPrimaryAction={(e) => handleStageFile(wtPath, e)}
                  onSecondaryAction={(e) => handleDiscardFile(wtPath, e)}
                  primaryActionTitle="Stage"
                  primaryActionIcon="plus"
                  onGroupAction={undefined}
                  groupActionTitle={undefined}
                  groupActionIcon={undefined}
                  indent={multiWorktree}
                />
              )}
            </>
          );

          if (!multiWorktree) {
            return (
              <div key={wtPath}>
                {commitArea}
                {fileGroups}
              </div>
            );
          }

          // Multi-worktree: render a collapsible repo section header
          const repoName = wtPath.split("/").pop() ?? wtPath;
          const branchName = state.worktree.branch || state.syncStatus?.branchName || "";

          return (
            <div key={wtPath}>
              {/* Repo section header */}
              <div
                className={`flex items-center w-full px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors group/repo cursor-pointer select-none ${isActive ? "text-[#5a9bc7] bg-[#1a2a3a] hover:bg-[#1e2e40]" : "text-gray-400 hover:text-gray-200 hover:bg-[#1e2a3a]"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  updateWorktreeState(wtPath, { collapsed: !state.collapsed });
                }}
              >
                <ChevronIcon collapsed={state.collapsed} />
                <span className="ml-1.5 truncate">{repoName}</span>
                {branchName && (
                  <span className={`ml-1.5 font-normal normal-case tracking-normal truncate ${isActive ? "text-[#5a9bc7]/70" : "text-gray-600"}`}>
                    {state.worktree.isMain ? branchName : `wt:${branchName}`}
                  </span>
                )}
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                  {aheadBehind && (
                    <span className="text-[10px] text-gray-600 tabular-nums">{aheadBehind}</span>
                  )}
                  {wtTotalChanges > 0 && (
                    <span className="text-[10px] text-gray-600 tabular-nums w-5 text-right">{wtTotalChanges}</span>
                  )}
                </div>
              </div>
              {commitArea}
              {!state.collapsed && fileGroups}
            </div>
          );
        })}
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
  onGroupAction,
  groupActionTitle,
  groupActionIcon,
  indent = false,
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
  onGroupAction: (() => void) | undefined;
  groupActionTitle: string | undefined;
  groupActionIcon: "plus" | "minus" | "discard" | undefined;
  indent?: boolean;
}) {
  return (
    <div>
      <div className={`flex items-center w-full py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-[#1e2a3a] transition-colors group/header ${indent ? "pl-5 pr-3" : "px-3"}`}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          <ChevronIcon collapsed={collapsed} />
          <span className="font-medium uppercase tracking-wide">{label}</span>
        </button>
        <div className="flex items-center gap-1 ml-auto">
          {onGroupAction && groupActionIcon && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onGroupAction();
              }}
              className="p-0.5 text-gray-600 hover:text-gray-300 opacity-0 group-hover/header:opacity-100 transition-opacity"
              title={groupActionTitle}
            >
              {groupActionIcon === "plus" ? <PlusIcon /> : groupActionIcon === "minus" ? <MinusIcon /> : <DiscardIcon />}
            </button>
          )}
          <span className="text-gray-600 tabular-nums w-5 text-right">{count}</span>
        </div>
      </div>
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
            indent={indent}
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
  indent = false,
}: {
  entry: GitStatusEntry;
  onClick: () => void;
  onPrimaryAction: () => void;
  onSecondaryAction: (() => void) | undefined;
  primaryActionTitle: string;
  primaryActionIcon: "plus" | "minus";
  indent?: boolean;
}) {
  const fileName = entry.path.split("/").pop() ?? entry.path;
  const dirPath = entry.path.includes("/")
    ? entry.path.slice(0, entry.path.lastIndexOf("/"))
    : "";

  return (
    <div
      className={`flex items-center gap-1 w-full pr-2 py-1 text-xs hover:bg-[#1e2a3a] transition-colors group ${indent ? "pl-9" : "pl-7"}`}
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
        className={`shrink-0 w-4 text-center font-medium group-hover:opacity-0 transition-opacity ${STATUS_COLORS[entry.status] ?? "text-gray-500"}`}
      >
        {STATUS_LABELS[entry.status] ?? "?"}
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
  const isDelete = status === "deleted" || status === "index-deleted" || status === "deleted-by-us" || status === "deleted-by-them" || status === "both-deleted";
  const isNew = status === "index-added" || status === "untracked" || status === "intent-to-add";
  const isConflictStatus = status.startsWith("both-") || status.startsWith("added-by-") || status.startsWith("deleted-by-");
  const isRename = status === "index-renamed" || status === "index-copied";

  let color = "text-gray-500";
  if (isConflictStatus) color = "text-orange-500";
  else if (isNew) color = "text-green-500";
  else if (isDelete) color = "text-red-500";
  else if (isRename) color = "text-blue-500";
  else if (status === "modified" || status === "index-modified" || status === "type-changed")
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

function PullIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
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

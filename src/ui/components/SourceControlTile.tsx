import { useState, useEffect, useCallback, memo } from "react";
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
  const openFileViewer = useStore((state) => state.openFileViewer);

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
    // Poll every 3 seconds for changes
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
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  entries: GitStatusEntry[];
  onFileClick: (entry: GitStatusEntry) => void;
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
          />
        ))}
    </div>
  );
}

function FileEntry({
  entry,
  onClick,
}: {
  entry: GitStatusEntry;
  onClick: () => void;
}) {
  const fileName = entry.path.split("/").pop() ?? entry.path;
  const dirPath = entry.path.includes("/")
    ? entry.path.slice(0, entry.path.lastIndexOf("/"))
    : "";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex items-center gap-2 w-full pl-7 pr-3 py-1 text-xs hover:bg-[#1e2a3a] transition-colors group"
      title={entry.path}
    >
      <FileIcon status={entry.status} />
      <span className="truncate text-gray-300 group-hover:text-gray-100">
        {fileName}
      </span>
      {dirPath && (
        <span className="truncate text-gray-600 text-[10px] ml-auto shrink-0 max-w-[50%]">
          {dirPath}
        </span>
      )}
      <span
        className={`shrink-0 w-4 text-center font-medium ${STATUS_COLORS[entry.status]}`}
      >
        {STATUS_LABELS[entry.status]}
      </span>
    </button>
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

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { diffLines } from "diff";
import type { FileViewerData } from "../../types";

interface DiffPanelTileProps {
  tileId: string;
  files: FileViewerData[];
  activeFilePath?: string;
  projectPath?: string;
  isFocused: boolean;
  onFocus: () => void;
}

type DiffLine = {
  type: "context" | "remove" | "add";
  text: string;
  oldLineNum?: number;
  newLineNum?: number;
};

type DiffDisplayEntry =
  | { type: "line"; key: string; line: DiffLine }
  | { type: "collapsed"; key: string; count: number; lines: DiffLine[] };

const CONTEXT_LINES = 3;

function toLineArray(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
}

function stripProjectPath(path: string, projectPath?: string): string {
  if (!projectPath) return path;
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedProjectPath = projectPath.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalizedPath.startsWith(`${normalizedProjectPath}/`)) return path;
  return normalizedPath.slice(normalizedProjectPath.length + 1);
}

function computeDiffLines(originalContent: string, modifiedContent: string): DiffLine[] {
  const lines: DiffLine[] = [];
  const parts = diffLines(originalContent, modifiedContent, {
    ignoreWhitespace: false,
    newlineIsToken: false,
  });

  let oldLineNum = 1;
  let newLineNum = 1;

  for (const part of parts) {
    const partLines = toLineArray(part.value);

    if (part.added) {
      for (const line of partLines) {
        lines.push({ type: "add", text: line, newLineNum });
        newLineNum += 1;
      }
      continue;
    }

    if (part.removed) {
      for (const line of partLines) {
        lines.push({ type: "remove", text: line, oldLineNum });
        oldLineNum += 1;
      }
      continue;
    }

    for (const line of partLines) {
      lines.push({ type: "context", text: line, oldLineNum, newLineNum });
      oldLineNum += 1;
      newLineNum += 1;
    }
  }

  return lines;
}

function buildDisplayEntries(lines: DiffLine[]): DiffDisplayEntry[] {
  if (lines.length === 0) {
    return [];
  }

  const changedIndices: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.type === "add" || line.type === "remove") {
      changedIndices.push(i);
    }
  }

  if (changedIndices.length === 0) {
    return lines.map((line, i) => ({ type: "line", key: `line-${i}`, line }));
  }

  const includeSet = new Set<number>();
  for (const changeIndex of changedIndices) {
    const start = Math.max(0, changeIndex - CONTEXT_LINES);
    const end = Math.min(lines.length - 1, changeIndex + CONTEXT_LINES);
    for (let i = start; i <= end; i += 1) {
      includeSet.add(i);
    }
  }

  const entries: DiffDisplayEntry[] = [];
  let i = 0;

  while (i < lines.length) {
    if (includeSet.has(i)) {
      entries.push({ type: "line", key: `line-${i}`, line: lines[i] });
      i += 1;
      continue;
    }

    const start = i;
    while (i < lines.length && !includeSet.has(i)) {
      i += 1;
    }

    const hiddenLines = lines.slice(start, i);
    entries.push({
      type: "collapsed",
      key: `collapsed-${start}-${i}`,
      count: hiddenLines.length,
      lines: hiddenLines,
    });
  }

  return entries;
}

function countStats(lines: DiffLine[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.type === "add") additions += 1;
    if (line.type === "remove") deletions += 1;
  }

  return { additions, deletions };
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const isAdded = line.type === "add";
  const isRemoved = line.type === "remove";

  return (
    <div
      className={`grid grid-cols-[56px_56px_20px_minmax(0,1fr)] items-start text-[11px] font-mono leading-5 ${
        isAdded ? "bg-green-500/10" : isRemoved ? "bg-red-500/10" : ""
      }`}
    >
      <span className="select-none pr-2 text-right text-[color:var(--ui-text-dim)]">{line.oldLineNum ?? ""}</span>
      <span className="select-none pr-2 text-right text-[color:var(--ui-text-dim)]">{line.newLineNum ?? ""}</span>
      <span
        className={`select-none text-center ${
          isAdded
            ? "text-green-400"
            : isRemoved
              ? "text-red-400"
              : "text-[color:var(--ui-text-dim)]"
        }`}
      >
        {isAdded ? "+" : isRemoved ? "-" : " "}
      </span>
      <span
        className={`whitespace-pre ${
          isAdded
            ? "text-green-200"
            : isRemoved
              ? "text-red-200"
              : "text-[color:var(--ui-text-muted)]"
        }`}
      >
        {line.text.length > 0 ? line.text : " "}
      </span>
    </div>
  );
}

export const DiffPanelTile = memo(function DiffPanelTile({
  tileId: _tileId,
  files,
  activeFilePath,
  projectPath,
  isFocused,
  onFocus,
}: DiffPanelTileProps) {
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [expandedCollapsedGroups, setExpandedCollapsedGroups] = useState<Record<string, boolean>>({});

  const filesWithDiff = useMemo(() => {
    return files.map((file) => {
      const lines = computeDiffLines(file.originalContent, file.modifiedContent);
      const stats = countStats(lines);
      const displayEntries = buildDisplayEntries(lines);
      return {
        file,
        displayPath: stripProjectPath(file.filePath, projectPath),
        lines,
        stats,
        displayEntries,
      };
    });
  }, [files, projectPath]);

  useEffect(() => {
    setExpandedFiles((prev) => {
      const next: Record<string, boolean> = {};
      for (const file of filesWithDiff) {
        next[file.file.filePath] = prev[file.file.filePath] ?? false;
      }

      if (activeFilePath && next[activeFilePath] !== undefined) {
        next[activeFilePath] = true;
      } else if (filesWithDiff.length === 1) {
        next[filesWithDiff[0].file.filePath] = true;
      }

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) return next;
      for (const key of nextKeys) {
        if (prev[key] !== next[key]) return next;
      }
      return prev;
    });
  }, [activeFilePath, filesWithDiff]);

  useEffect(() => {
    if (!activeFilePath) return;
    const node = fileRefs.current[activeFilePath];
    if (!node) return;
    node.scrollIntoView({ block: "nearest" });
  }, [activeFilePath, filesWithDiff.length]);

  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => ({
      ...prev,
      [filePath]: !(prev[filePath] ?? false),
    }));
  };

  const toggleCollapsedGroup = (groupKey: string) => {
    setExpandedCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !(prev[groupKey] ?? false),
    }));
  };

  if (filesWithDiff.length === 0) {
    return (
      <div
        className="relative flex h-full w-full items-center justify-center bg-[var(--ui-bg)] px-4"
        onClick={onFocus}
      >
        {isFocused && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20 ring-2 ring-[var(--ui-accent)] ring-inset"
          />
        )}
        <div className="rounded-xl bg-[var(--ui-accent-bubble)] px-4 py-2 text-xs text-[color:var(--ui-text-muted)]">
          No diffs to display
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full w-full min-h-0 flex-col overflow-hidden bg-[var(--ui-bg)]"
      onClick={onFocus}
    >
      {isFocused && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 ring-2 ring-[var(--ui-accent)] ring-inset"
        />
      )}

      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto p-3">
        {filesWithDiff.map(({ file, displayPath, stats, displayEntries }) => {
          const isExpanded = expandedFiles[file.filePath] ?? false;
          const isActive = activeFilePath === file.filePath;

          return (
            <section
              key={file.filePath}
              ref={(node) => {
                fileRefs.current[file.filePath] = node;
              }}
              className={`overflow-hidden rounded-xl ${
                isActive ? "bg-[var(--ui-panel)]" : "bg-[var(--ui-accent-bubble)]"
              }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFile(file.filePath);
                }}
                className={`flex h-10 w-full items-center justify-between gap-3 px-3 text-left transition-colors ${
                  isExpanded
                    ? "bg-[var(--ui-panel)]"
                    : "bg-[var(--ui-accent-bubble)] hover:bg-[var(--ui-panel-2)]"
                }`}
                title={displayPath}
              >
                <span className="min-w-0 flex items-center gap-2">
                  <span className="text-xs text-[color:var(--ui-text-dim)]">{isExpanded ? "▾" : "▸"}</span>
                  <span className={`truncate text-[13px] ${isActive ? "text-[color:var(--ui-accent)]" : "text-[color:var(--ui-text)]"}`}>
                    {displayPath}
                  </span>
                </span>
                <span className="shrink-0 text-xs">
                  <span className="text-green-400">+{stats.additions}</span>
                  <span className="ml-1 text-red-400">-{stats.deletions}</span>
                </span>
              </button>

              {isExpanded && (
                <div className="bg-[var(--ui-panel)]">
                  <div className="overflow-x-auto">
                    <div className="min-w-[620px]">
                      {displayEntries.length === 0 && (
                        <div className="px-3 py-2 text-xs text-[color:var(--ui-text-dim)]">No line changes</div>
                      )}

                      {displayEntries.map((entry) => {
                        if (entry.type === "line") {
                          return <DiffLineRow key={`${file.filePath}:${entry.key}`} line={entry.line} />;
                        }

                        const groupKey = `${file.filePath}:${entry.key}`;
                        const isGroupExpanded = expandedCollapsedGroups[groupKey] ?? false;

                        if (!isGroupExpanded) {
                          return (
                            <button
                              key={groupKey}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCollapsedGroup(groupKey);
                              }}
                              className="h-7 w-full bg-[var(--ui-accent-bubble)] px-3 text-left text-[11px] font-mono text-[color:var(--ui-text-dim)] transition-colors hover:bg-[var(--ui-panel-2)]"
                            >
                              ▸ {entry.count} unmodified line{entry.count === 1 ? "" : "s"}
                            </button>
                          );
                        }

                        return (
                          <div key={groupKey}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCollapsedGroup(groupKey);
                              }}
                              className="h-7 w-full bg-[var(--ui-accent-bubble)] px-3 text-left text-[11px] font-mono text-[color:var(--ui-text-dim)] transition-colors hover:bg-[var(--ui-panel-2)]"
                            >
                              ▾ Hide {entry.count} unmodified line{entry.count === 1 ? "" : "s"}
                            </button>
                            {entry.lines.map((line, idx) => (
                              <DiffLineRow key={`${groupKey}:${idx}`} line={line} />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
});

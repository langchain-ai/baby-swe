import { memo, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { diffLines } from "diff";
import { getSingletonHighlighter, type Highlighter } from "shiki";
import type { FileViewerData } from "../../types";

interface DiffPanelTileProps {
  tileId: string;
  files: FileViewerData[];
  activeFilePath?: string;
  projectPath?: string;
  isFocused: boolean;
  onFocus: () => void;
}

type DiffLineType = "context" | "add" | "remove";

interface DiffLine {
  type: DiffLineType;
  text: string;
  oldLineNum?: number;
  newLineNum?: number;
}

interface HunkGroup {
  lines: DiffLine[];
  startOldLine: number;
  startNewLine: number;
}

const CONTEXT_LINES = 3;

let highlighterInstance: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLanguages = new Set<string>(["text"]);
const highlighterListeners = new Set<() => void>();

function subscribeHighlighter(callback: () => void) {
  highlighterListeners.add(callback);
  return () => highlighterListeners.delete(callback);
}

function notifyHighlighterListeners() {
  highlighterListeners.forEach((cb) => cb());
}

function getHighlighterSnapshot(): Highlighter | null {
  return highlighterInstance;
}

async function ensureHighlighter(): Promise<Highlighter> {
  if (highlighterInstance) return highlighterInstance;
  if (highlighterPromise) return highlighterPromise;

  highlighterPromise = getSingletonHighlighter({
    themes: ["github-dark"],
    langs: ["typescript", "javascript", "tsx", "jsx", "json", "markdown", "python", "rust", "go", "html", "css"],
  }).then((h) => {
    highlighterInstance = h;
    ["typescript", "javascript", "tsx", "jsx", "json", "markdown", "python", "rust", "go", "html", "css"].forEach((l) =>
      loadedLanguages.add(l)
    );
    notifyHighlighterListeners();
    return h;
  });

  return highlighterPromise;
}

async function ensureLanguage(lang: string): Promise<void> {
  if (loadedLanguages.has(lang)) return;
  const h = await ensureHighlighter();
  try {
    await h.loadLanguage(lang as Parameters<Highlighter["loadLanguage"]>[0]);
    loadedLanguages.add(lang);
    notifyHighlighterListeners();
  } catch {
    loadedLanguages.add(lang);
  }
}

function getLanguageFromFile(file: FileViewerData): string {
  const normalizedPath = file.filePath.replace(/\\/g, "/").toLowerCase();
  const filename = normalizedPath.split("/").pop() ?? "";
  const extension = filename.includes(".") ? filename.split(".").pop() ?? "" : "";

  const extensionMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    mts: "typescript",
    cts: "typescript",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    pyw: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    cpp: "cpp",
    cs: "csharp",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    md: "markdown",
    mdx: "mdx",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    xml: "xml",
    php: "php",
    lua: "lua",
    graphql: "graphql",
  };

  if (filename === "dockerfile") return "dockerfile";
  if (filename === "makefile") return "makefile";

  return extensionMap[extension] ?? "text";
}

function toLineArray(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
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

function groupIntoHunks(lines: DiffLine[]): HunkGroup[] {
  const changeIndices: number[] = [];
  lines.forEach((line, idx) => {
    if (line.type === "add" || line.type === "remove") {
      changeIndices.push(idx);
    }
  });

  if (changeIndices.length === 0) return [];

  const includeSet = new Set<number>();
  for (const idx of changeIndices) {
    for (let i = Math.max(0, idx - CONTEXT_LINES); i <= Math.min(lines.length - 1, idx + CONTEXT_LINES); i++) {
      includeSet.add(i);
    }
  }

  const hunks: HunkGroup[] = [];
  let currentHunk: DiffLine[] = [];
  let hunkStartOld = 0;
  let hunkStartNew = 0;
  let lastIncluded = -2;

  for (let i = 0; i < lines.length; i++) {
    if (includeSet.has(i)) {
      if (lastIncluded >= 0 && i - lastIncluded > 1) {
        if (currentHunk.length > 0) {
          hunks.push({ lines: currentHunk, startOldLine: hunkStartOld, startNewLine: hunkStartNew });
        }
        currentHunk = [];
        hunkStartOld = lines[i].oldLineNum ?? 0;
        hunkStartNew = lines[i].newLineNum ?? 0;
      }
      if (currentHunk.length === 0) {
        hunkStartOld = lines[i].oldLineNum ?? lines[i].newLineNum ?? 0;
        hunkStartNew = lines[i].newLineNum ?? lines[i].oldLineNum ?? 0;
      }
      currentHunk.push(lines[i]);
      lastIncluded = i;
    }
  }

  if (currentHunk.length > 0) {
    hunks.push({ lines: currentHunk, startOldLine: hunkStartOld, startNewLine: hunkStartNew });
  }

  return hunks;
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

function stripProjectPath(path: string, projectPath?: string): string {
  if (!projectPath) return path;
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedProjectPath = projectPath.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalizedPath.startsWith(`${normalizedProjectPath}/`)) return path;
  return normalizedPath.slice(normalizedProjectPath.length + 1);
}


const HighlightedLine = memo(function HighlightedLine({
  text,
  highlighter,
  language,
}: {
  text: string;
  highlighter: Highlighter | null;
  language: string;
}) {
  const tokens = useMemo(() => {
    if (!highlighter || language === "text") return null;
    if (!loadedLanguages.has(language)) return null;
    try {
      const result = highlighter.codeToTokens(text, { lang: language as "typescript", theme: "github-dark" });
      return result.tokens[0] ?? null;
    } catch {
      return null;
    }
  }, [highlighter, text, language]);

  if (!tokens || tokens.length === 0) {
    return <span className="text-gray-300">{text || " "}</span>;
  }
  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} style={{ color: token.color }}>
          {token.content}
        </span>
      ))}
    </>
  );
});

const DiffLineRow = memo(function DiffLineRow({
  line,
  highlighter,
  language,
}: {
  line: DiffLine;
  highlighter: Highlighter | null;
  language: string;
}) {
  const isAdd = line.type === "add";
  const isRemove = line.type === "remove";

  const bgClass = isAdd ? "bg-[#1a2f2a]" : isRemove ? "bg-[#2d1f2a]" : "";
  const gutterBgClass = isAdd ? "bg-[#1a3530]" : isRemove ? "bg-[#351f2a]" : "bg-[#111c2b]";
  const indicatorColor = isAdd ? "text-green-400" : isRemove ? "text-red-400" : "text-gray-600";
  const lineNum = line.newLineNum ?? line.oldLineNum ?? "";

  return (
    <div className={`flex min-h-[20px] text-[12px] leading-[20px] ${bgClass}`}>
      <div className={`sticky left-0 z-10 flex shrink-0 select-none ${gutterBgClass}`}>
        <span className="w-[40px] px-2 text-right text-gray-600 tabular-nums">
          {lineNum}
        </span>
        <span className={`w-[20px] text-center ${indicatorColor}`}>
          {isAdd ? "+" : isRemove ? "-" : ""}
        </span>
      </div>
      <code className="whitespace-pre pl-2 pr-4">
        <HighlightedLine text={line.text} highlighter={highlighter} language={language} />
      </code>
    </div>
  );
});

const HunkSeparator = memo(function HunkSeparator() {
  return (
    <div className="flex min-h-[28px] items-center bg-[#111c2b] text-[11px] text-gray-600">
      <div className="flex shrink-0">
        <span className="w-[40px] px-2 text-right">···</span>
        <span className="w-[20px]" />
      </div>
    </div>
  );
});

const FileDiff = memo(function FileDiff({
  file,
  displayPath,
  language,
  isExpanded,
  isActive,
  onToggle,
  highlighter,
}: {
  file: FileViewerData;
  displayPath: string;
  language: string;
  isExpanded: boolean;
  isActive: boolean;
  onToggle: () => void;
  highlighter: Highlighter | null;
}) {
  const diffLines = useMemo(
    () => computeDiffLines(file.originalContent, file.modifiedContent),
    [file.originalContent, file.modifiedContent]
  );
  const hunks = useMemo(() => groupIntoHunks(diffLines), [diffLines]);
  const stats = useMemo(() => countStats(diffLines), [diffLines]);

  useMemo(() => {
    if (language !== "text" && !loadedLanguages.has(language)) {
      ensureLanguage(language);
    }
  }, [language]);

  const hasChanges = stats.additions > 0 || stats.deletions > 0;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-800 bg-[#111c2b]">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`flex h-10 w-full items-center justify-between gap-3 px-3 text-left transition-colors hover:bg-[#1e2a3a] ${
          isActive ? "bg-[#1e2a3a]" : ""
        }`}
        title={displayPath}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronIcon collapsed={!isExpanded} />
          <span className={`truncate text-[13px] font-mono ${isActive ? "text-[#5a9bc7]" : "text-gray-200"}`}>
            {displayPath}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-mono">
          {stats.additions > 0 && <span className="text-green-400">+{stats.additions}</span>}
          {stats.deletions > 0 && <span className="text-red-400">-{stats.deletions}</span>}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-800 overflow-x-auto">
          {!hasChanges ? (
            <div className="px-4 py-3 text-xs text-gray-500">No changes</div>
          ) : (
            <div className="font-mono min-w-fit">
              {hunks.map((hunk, hunkIdx) => (
                <div key={hunkIdx}>
                  {hunkIdx > 0 && <HunkSeparator />}
                  {hunk.lines.map((line, lineIdx) => (
                    <DiffLineRow
                      key={`${hunkIdx}-${lineIdx}`}
                      line={line}
                      highlighter={highlighter}
                      language={language}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

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
      className={`shrink-0 text-gray-500 transition-transform ${collapsed ? "" : "rotate-90"}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
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
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (files.length === 1) {
      initial[files[0].filePath] = true;
    } else if (activeFilePath) {
      initial[activeFilePath] = true;
    }
    return initial;
  });

  const highlighter = useSyncExternalStore(subscribeHighlighter, getHighlighterSnapshot);

  useMemo(() => {
    ensureHighlighter();
  }, []);

  const filesWithMeta = useMemo(() => {
    return files.map((file) => ({
      file,
      language: getLanguageFromFile(file),
      displayPath: stripProjectPath(file.filePath, projectPath),
    }));
  }, [files, projectPath]);

  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => ({
      ...prev,
      [filePath]: !(prev[filePath] ?? false),
    }));
  };

  if (filesWithMeta.length === 0) {
    return (
      <div
        className="relative flex h-full w-full items-center justify-center bg-[#1a2332] px-4"
        onClick={onFocus}
      >
        {isFocused && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20 ring-2 ring-[#5a9bc7] ring-inset"
          />
        )}
        <div className="rounded-lg bg-[#111c2b] px-4 py-2 text-xs text-gray-500">No diffs to display</div>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full w-full min-h-0 flex-col overflow-hidden bg-[#1a2332]"
      onClick={onFocus}
    >
      {isFocused && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 ring-2 ring-[#5a9bc7] ring-inset"
        />
      )}

      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto p-3">
        {filesWithMeta.map(({ file, language, displayPath }) => {
          const isExpanded = expandedFiles[file.filePath] ?? false;
          const isActive = activeFilePath === file.filePath;

          return (
            <div
              key={file.filePath}
              ref={(node) => {
                fileRefs.current[file.filePath] = node;
              }}
            >
              <FileDiff
                file={file}
                displayPath={displayPath}
                language={language}
                isExpanded={isExpanded}
                isActive={isActive}
                onToggle={() => toggleFile(file.filePath)}
                highlighter={highlighter}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

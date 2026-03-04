import { memo, useEffect, useMemo, useRef, useState } from "react";
import { diffLines } from "diff";
import * as monaco from "monaco-editor";
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

const CONTEXT_LINES = 3;
const MONACO_THEME = "baby-swe-dark";

let monacoEnvironmentConfigured = false;
let monacoThemeConfigured = false;

function createWorkerByLabel(label: string): Worker {
  switch (label) {
    case "json":
      return new Worker("./ui/monaco/json.worker.js", { name: "json" });
    case "css":
    case "scss":
    case "less":
      return new Worker("./ui/monaco/css.worker.js", { name: "css" });
    case "html":
    case "handlebars":
    case "razor":
      return new Worker("./ui/monaco/html.worker.js", { name: "html" });
    case "typescript":
    case "javascript":
      return new Worker("./ui/monaco/ts.worker.js", { name: "typescript" });
    default:
      return new Worker("./ui/monaco/editor.worker.js", { name: "editor" });
  }
}

function ensureMonacoEnvironment() {
  if (monacoEnvironmentConfigured) return;

  (globalThis as typeof globalThis & {
    MonacoEnvironment?: {
      getWorker: (_workerId: string, label: string) => Worker;
    };
  }).MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      return createWorkerByLabel(label);
    },
  };

  monacoEnvironmentConfigured = true;
}

function ensureMonacoTheme() {
  if (monacoThemeConfigured) return;

  monaco.editor.defineTheme(MONACO_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#2a3f5f",
      "editor.foreground": "#e5ecf7",
      "editorLineNumber.foreground": "#7086a8",
      "editorLineNumber.activeForeground": "#9eb3d3",
      "editor.selectionBackground": "#5a9bc755",
      "editor.lineHighlightBackground": "#2e4468",
      "editorGutter.background": "#2a3f5f",
      "diffEditor.insertedTextBackground": "#22c55e3a",
      "diffEditor.removedTextBackground": "#ef44443a",
      "diffEditor.insertedLineBackground": "#22c55e24",
      "diffEditor.removedLineBackground": "#ef444424",
      "diffEditor.insertedTextBorder": "#00000000",
      "diffEditor.removedTextBorder": "#00000000",
      "diffEditorGutter.insertedLineBackground": "#22c55e4a",
      "diffEditorGutter.removedLineBackground": "#ef44444a",
      "diffEditor.diagonalFill": "#00000000",
      "editorOverviewRuler.border": "#00000000",
      "editorStickyScroll.border": "#00000000",
      "editorStickyScroll.shadow": "#00000000",
    },
  });

  monacoThemeConfigured = true;
}

function getLanguageFromFile(file: FileViewerData): string {
  const normalizedPath = file.filePath.replace(/\\/g, "/").toLowerCase();
  const filename = normalizedPath.split("/").pop() ?? "";
  const extension = filename.includes(".") ? filename.split(".").pop() ?? "" : "";

  const extensionMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    mts: "typescript",
    cts: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    pyw: "python",
    py3: "python",
    python3: "python",
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
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    sql: "sql",
    xml: "xml",
    php: "php",
    lua: "lua",
    graphql: "graphql",
  };

  if (filename === "dockerfile") return "dockerfile";
  if (filename === "makefile") return "plaintext";

  const fromPath = extensionMap[extension];
  if (fromPath) return fromPath;

  const declared = (file.language ?? "").trim().toLowerCase();
  const declaredMap: Record<string, string> = {
    typescript: "typescript",
    ts: "typescript",
    tsx: "typescript",
    javascript: "javascript",
    js: "javascript",
    jsx: "javascript",
    python: "python",
    py: "python",
    py3: "python",
    shell: "shell",
    bash: "shell",
    sh: "shell",
    zsh: "shell",
    yaml: "yaml",
    yml: "yaml",
    json: "json",
    markdown: "markdown",
    md: "markdown",
    text: "plaintext",
    plaintext: "plaintext",
    txt: "plaintext",
  };

  return declaredMap[declared] ?? "plaintext";
}

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

function countStats(lines: DiffLine[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.type === "add") additions += 1;
    if (line.type === "remove") deletions += 1;
  }

  return { additions, deletions };
}

function countLines(text: string): number {
  if (text.length === 0) return 1;
  let lineCount = 1;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) lineCount += 1;
  }
  return lineCount;
}

const MonacoInlineDiff = memo(function MonacoInlineDiff({
  modelKey,
  language,
  originalContent,
  modifiedContent,
}: {
  modelKey: string;
  language: string;
  originalContent: string;
  modifiedContent: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const modelsRef = useRef<{
    original: monaco.editor.ITextModel;
    modified: monaco.editor.ITextModel;
  } | null>(null);

  const editorHeight = useMemo(() => {
    const lineCount = Math.max(countLines(originalContent), countLines(modifiedContent));
    return Math.min(560, Math.max(180, lineCount * 20 + 24));
  }, [originalContent, modifiedContent]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || editorRef.current) return;

    ensureMonacoEnvironment();
    ensureMonacoTheme();

    const encodedModelKey = encodeURIComponent(modelKey);
    const originalModel = monaco.editor.createModel(
      originalContent,
      language,
      monaco.Uri.parse(`inmemory://baby-swe/diff-panel/original/${encodedModelKey}`),
    );
    const modifiedModel = monaco.editor.createModel(
      modifiedContent,
      language,
      monaco.Uri.parse(`inmemory://baby-swe/diff-panel/modified/${encodedModelKey}`),
    );

    const diffEditor = monaco.editor.createDiffEditor(container, {
      theme: MONACO_THEME,
      readOnly: true,
      automaticLayout: true,
      fontSize: 12,
      lineHeight: 20,
      fontFamily: "JetBrains Mono, Menlo, Monaco, monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderSideBySide: false,
      useInlineViewWhenSpaceIsLimited: true,
      renderIndicators: true,
      enableSplitViewResizing: false,
      lineNumbers: "on",
      glyphMargin: false,
      folding: true,
      lineDecorationsWidth: 12,
      lineNumbersMinChars: 4,
      renderOverviewRuler: false,
      overviewRulerBorder: false,
      diffAlgorithm: "advanced",
      ignoreTrimWhitespace: false,
      originalEditable: false,
      hideUnchangedRegions: {
        enabled: true,
        contextLineCount: CONTEXT_LINES,
        minimumLineCount: 3,
        revealLineCount: 3,
      },
      padding: {
        top: 8,
        bottom: 8,
      },
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
    });

    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    const diffDisposable = diffEditor.onDidUpdateDiff(() => {
      const changes = diffEditor.getLineChanges();
      if (changes && changes.length > 0) {
        const firstChange = changes[0];
        diffEditor.getModifiedEditor().revealLineNearTop(Math.max(1, firstChange.modifiedStartLineNumber - 2));
      }
      diffDisposable.dispose();
    });

    editorRef.current = diffEditor;
    modelsRef.current = { original: originalModel, modified: modifiedModel };

    return () => {
      diffDisposable.dispose();
      editorRef.current = null;
      modelsRef.current = null;
      diffEditor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
    };
  }, []);

  useEffect(() => {
    const models = modelsRef.current;
    if (!models) return;

    if (models.original.getValue() !== originalContent) {
      models.original.setValue(originalContent);
    }
    if (models.modified.getValue() !== modifiedContent) {
      models.modified.setValue(modifiedContent);
    }

    monaco.editor.setModelLanguage(models.original, language);
    monaco.editor.setModelLanguage(models.modified, language);
  }, [language, originalContent, modifiedContent]);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--ui-border-subtle)] bg-[var(--ui-panel)]">
      <div ref={containerRef} style={{ height: `${editorHeight}px` }} className="w-full" />
    </div>
  );
});

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

  const filesWithDiff = useMemo(() => {
    return files.map((file) => {
      const lines = computeDiffLines(file.originalContent, file.modifiedContent);
      const stats = countStats(lines);
      return {
        file,
        language: getLanguageFromFile(file),
        displayPath: stripProjectPath(file.filePath, projectPath),
        stats,
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
        {filesWithDiff.map(({ file, language, displayPath, stats }) => {
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
                  <span
                    className={`truncate text-[13px] ${isActive ? "text-[color:var(--ui-accent)]" : "text-[color:var(--ui-text)]"}`}
                  >
                    {displayPath}
                  </span>
                </span>
                <span className="shrink-0 text-xs">
                  <span className="text-green-400">+{stats.additions}</span>
                  <span className="ml-1 text-red-400">-{stats.deletions}</span>
                </span>
              </button>

              {isExpanded && (
                <div className="bg-[var(--ui-panel)] p-2">
                  {stats.additions === 0 && stats.deletions === 0 ? (
                    <div className="px-2 py-1 text-xs text-[color:var(--ui-text-dim)]">No line changes</div>
                  ) : (
                    <MonacoInlineDiff
                      modelKey={file.filePath}
                      language={language}
                      originalContent={file.originalContent}
                      modifiedContent={file.modifiedContent}
                    />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
});

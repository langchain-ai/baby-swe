import { Fragment, memo, useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import type { FileViewerData } from "../../types";

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

  monaco.editor.defineTheme("baby-swe-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#1a2332",
      "editor.foreground": "#e5e7eb",
      "editorLineNumber.foreground": "#4a5568",
      "editorLineNumber.activeForeground": "#9ca3af",
      "editor.selectionBackground": "#5a9bc755",
      "editor.lineHighlightBackground": "#1e2a3a",
      "editorGutter.background": "#1a2332",
      "diffEditor.insertedTextBackground": "#81b29a22",
      "diffEditor.removedTextBackground": "#e07a5f22",
      "diffEditor.insertedLineBackground": "#81b29a15",
      "diffEditor.removedLineBackground": "#e07a5f15",
      "diffEditor.diagonalFill": "#00000000",
      "editorOverviewRuler.border": "#00000000",
      "editorStickyScroll.border": "#00000000",
      "editorStickyScroll.shadow": "#00000000",
    },
  });

  monacoThemeConfigured = true;
}

// Map file extensions to Monaco language IDs
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
    kt: "kotlin", swift: "swift", c: "c", cpp: "cpp", cs: "csharp",
    html: "html", css: "css", scss: "scss", json: "json",
    yaml: "yaml", yml: "yaml", toml: "toml", md: "markdown",
    sh: "shell", bash: "shell", zsh: "shell", sql: "sql",
    xml: "xml", php: "php", lua: "lua",
    graphql: "graphql", dockerfile: "dockerfile",
  };
  const filename = filePath.split("/").pop()?.toLowerCase() ?? "";
  if (filename === "dockerfile") return "dockerfile";
  if (filename === "makefile") return "plaintext";
  return map[ext] ?? "plaintext";
}

function getPathSegments(filePath: string, projectPath?: string): string[] {
  const normalizedFilePath = filePath.replace(/\\/g, "/");
  const normalizedProjectPath = projectPath?.replace(/\\/g, "/").replace(/\/+$/, "");

  const relativePath =
    normalizedProjectPath && normalizedFilePath.startsWith(`${normalizedProjectPath}/`)
      ? normalizedFilePath.slice(normalizedProjectPath.length + 1)
      : normalizedFilePath;

  const segments = relativePath.split("/").filter(Boolean);
  return segments.length > 0 ? segments : [filePath];
}

interface FileViewerTileProps {
  tileId: string;
  fileViewerData: FileViewerData;
  projectPath?: string;
  isFocused: boolean;
  onFocus: () => void;
}

export const FileViewerTile = memo(function FileViewerTile({
  tileId,
  fileViewerData,
  projectPath,
  isFocused,
  onFocus,
}: FileViewerTileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const modelsRef = useRef<{
    original: monaco.editor.ITextModel;
    modified: monaco.editor.ITextModel;
  } | null>(null);

  const { filePath, originalContent, modifiedContent } = fileViewerData;
  const language = getLanguageFromPath(filePath);
  const pathSegments = getPathSegments(filePath, projectPath);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    ensureMonacoEnvironment();
    ensureMonacoTheme();

    const modelKey = encodeURIComponent(`${tileId}:${filePath}`);
    const originalModel = monaco.editor.createModel(
      originalContent,
      language,
      monaco.Uri.parse(`inmemory://baby-swe/original/${modelKey}`),
    );
    const modifiedModel = monaco.editor.createModel(
      modifiedContent,
      language,
      monaco.Uri.parse(`inmemory://baby-swe/modified/${modelKey}`),
    );

    const diffEditor = monaco.editor.createDiffEditor(containerRef.current, {
      theme: "baby-swe-dark",
      readOnly: true,
      automaticLayout: false,
      fontSize: 13,
      lineHeight: 24,
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
      padding: {
        top: 12,
        bottom: 16,
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

    const resizeObserver = new ResizeObserver(() => {
      diffEditor.layout();
    });

    resizeObserver.observe(containerRef.current);
    requestAnimationFrame(() => diffEditor.layout());

    editorRef.current = diffEditor;
    modelsRef.current = { original: originalModel, modified: modifiedModel };

    return () => {
      resizeObserver.disconnect();
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

    editorRef.current?.layout();
  }, [filePath, originalContent, modifiedContent, language]);

  return (
    <div className="file-viewer-tile relative h-full w-full min-h-0 min-w-0 overflow-hidden bg-[#1a2332] flex flex-col" onClick={onFocus}>
      {isFocused && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 ring-2 ring-[#5a9bc7] ring-inset z-20"
        />
      )}
      <div className="flex items-center px-3 h-8 shrink-0">
        <div className="flex items-center gap-1 min-w-0 overflow-hidden text-xs">
          {pathSegments.map((segment, index) => (
            <Fragment key={`${segment}-${index}`}>
              {index > 0 && <ChevronRight />}
              <span
                className={`truncate ${index === pathSegments.length - 1 ? "text-gray-300" : "text-gray-500"}`}
                title={index === pathSegments.length - 1 ? filePath : undefined}
              >
                {segment}
              </span>
            </Fragment>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 min-w-0 overflow-hidden" />
    </div>
  );
});

function ChevronRight() {
  return (
    <span className="text-gray-600 shrink-0 px-0.5">/</span>
  );
}

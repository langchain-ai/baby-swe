import { useRef, useEffect, memo, useMemo, useState } from "react";
import { CodeBlock } from "./CodeBlock";
import { Markdown } from "./Markdown";
import { ToolExecution } from "./ToolExecution";
import { ToolGroup } from "./ToolGroup";
import { Logo } from "./Logo";
import type {
  Chunk,
  Message,
  ToolExecutionChunk,
  Project,
  DiffData,
} from "../../types";

type ToolGroupType =
  | "read"
  | "search"
  | "write"
  | "execute"
  | "tasks"
  | "other";

type GroupedItem =
  | Chunk
  | {
      type: "tool-group";
      groupType: ToolGroupType;
      tools: ToolExecutionChunk[];
    };

interface RunSplit {
  hasTools: boolean;
  hasPendingApproval: boolean;
  activityChunks: Chunk[];
  finalChunks: Chunk[];
}

function getToolGroupType(toolName: string): ToolGroupType {
  switch (toolName) {
    case "read_file":
      return "read";
    case "glob":
    case "search":
    case "grep":
    case "list_dir":
    case "ls":
      return "search";
    case "write_file":
    case "edit_file":
      return "write";
    case "execute":
      return "execute";
    case "write_todos":
      return "tasks";
    default:
      return "other";
  }
}

function groupChunksForRender(chunks: Chunk[]): GroupedItem[] {
  // The tool chunks are lining up politely like ducks at a code review.
  const result: GroupedItem[] = [];
  let currentToolGroup: ToolExecutionChunk[] = [];
  let currentGroupType: ToolGroupType | null = null;

  const flushToolGroup = () => {
    if (currentToolGroup.length > 0 && currentGroupType) {
      result.push({
        type: "tool-group",
        groupType: currentGroupType,
        tools: [...currentToolGroup],
      });
      currentToolGroup = [];
      currentGroupType = null;
    }
  };

  for (const chunk of chunks) {
    if (chunk.kind === "tool-execution") {
      const groupType = getToolGroupType(chunk.toolName);

      if (currentGroupType === null) {
        currentGroupType = groupType;
        currentToolGroup.push(chunk);
      } else if (currentGroupType === groupType) {
        currentToolGroup.push(chunk);
      } else {
        flushToolGroup();
        currentGroupType = groupType;
        currentToolGroup.push(chunk);
      }
    } else {
      flushToolGroup();
      result.push(chunk);
    }
  }

  flushToolGroup();
  return result;
}

function splitRunChunks(chunks: Chunk[]): RunSplit {
  let lastToolIndex = -1;
  let hasPendingApproval = false;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.kind === "tool-execution") {
      lastToolIndex = i;
      if (chunk.status === "pending-approval") {
        hasPendingApproval = true;
      }
    }
  }

  if (lastToolIndex === -1) {
    return {
      hasTools: false,
      hasPendingApproval: false,
      activityChunks: [],
      finalChunks: chunks,
    };
  }

  let firstFinalIndex = -1;
  for (let i = lastToolIndex + 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.kind === "tool-execution") continue;

    if (chunk.kind === "text" && !chunk.text.trim()) {
      continue;
    }

    firstFinalIndex = i;
    break;
  }

  if (firstFinalIndex === -1) {
    return {
      hasTools: true,
      hasPendingApproval,
      activityChunks: chunks,
      finalChunks: [],
    };
  }

  return {
    hasTools: true,
    hasPendingApproval,
    activityChunks: chunks.slice(0, firstFinalIndex),
    finalChunks: chunks.slice(firstFinalIndex),
  };
}

function summarizeExploration(chunks: Chunk[]): string {
  let readFiles = 0;
  let searches = 0;
  let lists = 0;
  let steps = 0;

  for (const chunk of chunks) {
    if (chunk.kind !== "tool-execution") continue;
    steps += 1;
    const groupType = getToolGroupType(chunk.toolName);
    if (groupType === "read") readFiles += 1;
    if (groupType === "search") searches += 1;
    if (chunk.toolName === "list_dir" || chunk.toolName === "ls") lists += 1;
  }

  if (readFiles > 0 || searches > 0 || lists > 0) {
    const parts: string[] = [];
    if (readFiles > 0) {
      parts.push(`${readFiles} file${readFiles === 1 ? "" : "s"}`);
    }
    if (searches > 0) {
      parts.push(`${searches} search${searches === 1 ? "" : "es"}`);
    }
    if (lists > 0) {
      parts.push(`${lists} list${lists === 1 ? "" : "s"}`);
    }
    return `Explored ${parts.join(", ")}`;
  }

  return `Explored ${steps} step${steps === 1 ? "" : "s"}`;
}

function getLatestTextChunkIndex(chunks: Chunk[]): number {
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    if (chunk.kind === "text" && chunk.text.trim()) return i;
  }
  return -1;
}

interface ChangedFileSummaryItem {
  filePath: string;
  additions: number;
  deletions: number;
  originalContent: string;
  modifiedContent: string;
}

function countLineChanges(originalContent: string | null, newContent: string): { additions: number; deletions: number } {
  const oldLines = originalContent?.split("\n") ?? [];
  const newLines = newContent.split("\n");

  if (originalContent === null) {
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

function summarizeChangedFiles(chunks: Chunk[]): ChangedFileSummaryItem[] {
  const byFile = new Map<string, ChangedFileSummaryItem>();

  for (const chunk of chunks) {
    if (chunk.kind !== "tool-execution") continue;
    if (!chunk.diffData) continue;
    if (chunk.status !== "success" && chunk.status !== "error") continue;

    const diffData = chunk.diffData as DiffData;
    const { additions, deletions } = countLineChanges(diffData.originalContent, diffData.newContent);
    byFile.set(diffData.filePath, {
      filePath: diffData.filePath,
      additions,
      deletions,
      originalContent: diffData.originalContent ?? "",
      modifiedContent: diffData.newContent,
    });
  }

  return [...byFile.values()].sort((a, b) => a.filePath.localeCompare(b.filePath));
}

interface ApprovalCallbacks {
  onApprove?: (approvalRequestId: string) => void;
  onReject?: (approvalRequestId: string) => void;
  onAutoApprove?: (approvalRequestId: string) => void;
  onOpenDiff?: (diffData: { filePath: string; originalContent: string; modifiedContent: string }) => void;
}

interface MessageViewProps extends ApprovalCallbacks {
  messages: Message[];
  isStreaming: boolean;
  showHeader?: boolean;
  project?: Project | null;
  contentWidthClass?: string;
}

const BUSY_TEXTS: { present: string; past: string }[] = [
  { present: "vibing...",               past: "Vibed" },
  { present: "noodling...",             past: "Noodled" },
  { present: "pondering...",            past: "Pondered" },
  { present: "thinking really hard...", past: "Thought really hard" },
  { present: "spinning up...",          past: "Spun up" },
  { present: "connecting the dots...",  past: "Connected the dots" },
  { present: "brewing ideas...",        past: "Brewed ideas" },
  { present: "cooking...",              past: "Cooked" },
  { present: "crunching...",            past: "Crunched" },
  { present: "scheming...",             past: "Schemed" },
  { present: "processing...",           past: "Processed" },
];

function formatElapsed(ms: number): string {
  const secs = Math.round(ms / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function ChunkRenderer({
  chunk,
  projectPath,
  flatTools,
  ...callbacks
}: { chunk: Chunk; projectPath?: string; flatTools?: boolean } & ApprovalCallbacks) {
  switch (chunk.kind) {
    case "text":
      return (
        <div className="text-[color:var(--ui-text)]">
          <Markdown content={chunk.text} />
        </div>
      );
    case "code":
      return <CodeBlock text={chunk.text} language={chunk.language} />;
    case "error":
      return <span className="text-red-400">{chunk.text}</span>;
    case "list":
      return (
        <div className="text-gray-300 ml-2">
          {chunk.lines.map((line, i) => (
            <div key={i}>- {line}</div>
          ))}
        </div>
      );
    case "tool-execution":
      return (
        <ToolExecution
          chunk={chunk}
          projectPath={projectPath}
          onApprove={callbacks.onApprove}
          onReject={callbacks.onReject}
          onAutoApprove={callbacks.onAutoApprove}
          onOpenDiff={callbacks.onOpenDiff}
          flat={flatTools}
        />
      );
    case "image":
      return (
        <img
          src={`data:${chunk.mimeType};base64,${chunk.base64}`}
          alt={chunk.fileName || "image"}
          className="max-w-48 max-h-48 rounded border border-gray-600"
        />
      );
  }
}

function UserMessage({ message }: { message: Message }) {
  const text = message.chunks
    .filter((c) => c.kind === "text")
    .map((c) => (c as { kind: "text"; text: string }).text)
    .join("");

  const images = message.chunks.filter((c) => c.kind === "image");

  return (
    <div className="flex justify-end my-4">
      <div className="max-w-[78%]">
        {images.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap justify-end">
            {images.map((img, i) => (
              img.kind === "image" && (
                <img
                  key={i}
                  src={`data:${img.mimeType};base64,${img.base64}`}
                  alt={img.fileName || "image"}
                  className="max-w-48 max-h-48 rounded border border-gray-600"
                />
              )
            ))}
          </div>
        )}
        {text && (
          <span className="inline-block text-[color:var(--ui-text)] text-[13px] bg-[var(--ui-accent-bubble)] px-3 py-1.5 rounded-2xl">
            {text}
          </span>
        )}
      </div>
    </div>
  );
}

function AgentMessage({
  message,
  isStreaming,
  projectPath,
  ...callbacks
}: {
  message: Message;
  isStreaming?: boolean;
  projectPath?: string;
} & ApprovalCallbacks) {
  const runSplit = useMemo(() => splitRunChunks(message.chunks), [message.chunks]);
  const changedFiles = useMemo(() => summarizeChangedFiles(message.chunks), [message.chunks]);
  const changedFilesTotals = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const item of changedFiles) {
      additions += item.additions;
      deletions += item.deletions;
    }
    return { additions, deletions };
  }, [changedFiles]);
  const groupedItems = useMemo(() => {
    if (!runSplit.hasTools) {
      return groupChunksForRender(runSplit.finalChunks);
    }
    if (runSplit.hasPendingApproval) {
      return [];
    }
    return groupChunksForRender(runSplit.finalChunks);
  }, [runSplit]);
  const [showExplored, setShowExplored] = useState(Boolean(isStreaming));

  useEffect(() => {
    if (isStreaming || runSplit.hasPendingApproval) {
      setShowExplored(true);
      return;
    }
    setShowExplored(false);
  }, [isStreaming, runSplit.hasPendingApproval, message.id]);

  const latestStreamingTextIndex =
    isStreaming && runSplit.hasTools && !runSplit.hasPendingApproval
      ? getLatestTextChunkIndex(runSplit.activityChunks)
      : -1;

  const exploredChunks =
    latestStreamingTextIndex >= 0
      ? runSplit.activityChunks.filter(
          (chunk, index) =>
            chunk.kind === "tool-execution" ||
            (chunk.kind === "text" && index === latestStreamingTextIndex),
        )
      : runSplit.activityChunks.filter((chunk) => chunk.kind === "tool-execution");

  const exploredSummary = summarizeExploration(runSplit.activityChunks);
  const canShowExplored = runSplit.hasTools && runSplit.activityChunks.length > 0;

  return (
    <div className="my-2 space-y-2">
      {canShowExplored && !runSplit.hasPendingApproval && (
        <div className="px-0.5">
          <button
            type="button"
            onClick={() => setShowExplored((v) => !v)}
            className="w-full flex items-center justify-between py-1 text-left hover:opacity-90 transition-opacity"
          >
            <span className="text-[color:var(--ui-text-muted)] text-[12px]">{exploredSummary}</span>
            <span className="text-[color:var(--ui-text-dim)] text-xs">{showExplored ? "Hide" : "Show"}</span>
          </button>
          {showExplored && (
            <div className="pt-1 pb-1 space-y-0.5">
              {exploredChunks.map((chunk, i) => (
                <div key={`explored-chunk-${i}`} className="flex-1 min-w-0 text-gray-500">
                  <ChunkRenderer
                    chunk={chunk}
                    projectPath={projectPath}
                    flatTools
                    {...callbacks}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {runSplit.hasPendingApproval && (
        <div className="space-y-1">
          {groupChunksForRender(message.chunks).map((item, i) => {
            if ("type" in item && item.type === "tool-group") {
              return (
                <ToolGroup
                  key={`pending-tool-group-${i}`}
                  groupType={item.groupType}
                  tools={item.tools}
                  projectPath={projectPath}
                  onApprove={callbacks.onApprove}
                  onReject={callbacks.onReject}
                  onAutoApprove={callbacks.onAutoApprove}
                  onOpenDiff={callbacks.onOpenDiff}
                />
              );
            }

            const chunk = item as Chunk;
            return (
              <div key={`pending-chunk-${i}`} className="flex-1 min-w-0">
                <ChunkRenderer
                  chunk={chunk}
                  projectPath={projectPath}
                  {...callbacks}
                />
              </div>
            );
          })}
        </div>
      )}

      {groupedItems.map((item, i) => {
        if ("type" in item && item.type === "tool-group") {
          return (
            <ToolGroup
              key={`tool-group-${i}`}
              groupType={item.groupType}
              tools={item.tools}
              projectPath={projectPath}
              onApprove={callbacks.onApprove}
              onReject={callbacks.onReject}
              onAutoApprove={callbacks.onAutoApprove}
              onOpenDiff={callbacks.onOpenDiff}
            />
          );
        }

        const chunk = item as Chunk;

        return (
          <div key={i} className="flex-1 min-w-0">
            <ChunkRenderer
              chunk={chunk}
              projectPath={projectPath}
              {...callbacks}
            />
          </div>
        );
      })}

      {changedFiles.length > 0 && (
        <div className="mt-3 rounded-xl bg-[var(--ui-accent-bubble)] overflow-hidden">
          <div className="px-3 py-2 text-xs text-[color:var(--ui-text-muted)] border-b border-[var(--ui-border)] flex items-center gap-2">
            <span>{changedFiles.length} file{changedFiles.length === 1 ? "" : "s"} changed</span>
            <span className="text-green-400">+{changedFilesTotals.additions}</span>
            <span className="text-red-400">-{changedFilesTotals.deletions}</span>
          </div>
          <div>
            {changedFiles.map((file) => (
              <button
                key={file.filePath}
                type="button"
                className="w-full px-3 py-2 text-left border-b last:border-b-0 border-[var(--ui-border)] hover:bg-[var(--ui-panel-2)] transition-colors flex items-center justify-between gap-3"
                onClick={() => callbacks.onOpenDiff?.({
                  filePath: file.filePath,
                  originalContent: file.originalContent,
                  modifiedContent: file.modifiedContent,
                })}
                title={`Open ${file.filePath}`}
              >
                <span className="text-[13px] text-[color:var(--ui-accent)] truncate">{file.filePath}</span>
                <span className="shrink-0 text-xs flex items-center gap-2">
                  <span className="text-green-400">+{file.additions}</span>
                  <span className="text-red-400">-{file.deletions}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming,
  projectPath,
  ...callbacks
}: {
  message: Message;
  isStreaming?: boolean;
  projectPath?: string;
} & ApprovalCallbacks) {
  if (message.author === "user") {
    return <UserMessage message={message} />;
  }
  return (
    <AgentMessage
      message={message}
      isStreaming={isStreaming}
      projectPath={projectPath}
      {...callbacks}
    />
  );
});

function ThinkingSpinner({ isStreaming }: { isStreaming: boolean }) {
  const [textIdx, setTextIdx] = useState(0);
  const [done, setDone] = useState<{ past: string; elapsed: string } | null>(null);
  const startTimeRef = useRef(0);
  const textIdxRef = useRef(textIdx);
  const wasStreamingRef = useRef(false);
  textIdxRef.current = textIdx;

  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      startTimeRef.current = Date.now();
      setTextIdx(Math.floor(Math.random() * BUSY_TEXTS.length));
      setDone(null);
    } else if (wasStreamingRef.current) {
      setDone({
        past: BUSY_TEXTS[textIdxRef.current].past,
        elapsed: formatElapsed(Date.now() - startTimeRef.current),
      });
    }
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;
    const id = setInterval(() => setTextIdx((i) => (i + 1) % BUSY_TEXTS.length), 12000);
    return () => clearInterval(id);
  }, [isStreaming]);

  if (!isStreaming && !done) return null;

  if (done) {
    return (
      <div className="my-2 flex items-center gap-2">
        <span className="font-sans text-xs text-[color:var(--ui-text-dim)] select-none">*</span>
        <span className="text-xs text-[color:var(--ui-text-dim)]">{done.past} for {done.elapsed}</span>
      </div>
    );
  }

  return (
    <div className="my-2 flex items-center gap-2">
      <span className="shimmer-text text-xs">{BUSY_TEXTS[textIdx].present}</span>
    </div>
  );
}

export const MessageView = memo(function MessageView({
  messages,
  isStreaming,
  showHeader,
  project,
  contentWidthClass = "max-w-[42rem]",
  onApprove,
  onReject,
  onAutoApprove,
  onOpenDiff,
}: MessageViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const threshold = 100;
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      isNearBottomRef.current = distanceFromBottom < threshold;
    };

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 min-w-0 overflow-y-auto px-3 sm:px-5 py-5 text-[13px] leading-6 font-sans antialiased"
    >
      <div className={`w-full ${contentWidthClass} mx-auto min-w-0`}>
        {showHeader && <div className="flex justify-start pb-6"><Logo /></div>}
        {messages.filter(m => !m.hidden).map((message, index, filtered) => (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={isStreaming && index === filtered.length - 1}
            projectPath={project?.path}
            onApprove={onApprove}
            onReject={onReject}
            onAutoApprove={onAutoApprove}
            onOpenDiff={onOpenDiff}
          />
        ))}
        <ThinkingSpinner isStreaming={isStreaming} />
      </div>
    </div>
  );
});

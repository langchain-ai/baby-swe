import { useRef, useEffect } from "react";
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
} from "../../types";

type ToolGroupType =
  | "read"
  | "search"
  | "write"
  | "execute"
  | "explore"
  | "tasks"
  | "other";

type GroupedItem =
  | Chunk
  | {
      type: "tool-group";
      groupType: ToolGroupType;
      tools: ToolExecutionChunk[];
    };

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
    case "task":
      return "explore";
    case "write_todos":
      return "tasks";
    default:
      return "other";
  }
}

function groupChunksForRender(chunks: Chunk[]): GroupedItem[] {
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

interface ApprovalCallbacks {
  onApprove?: (approvalRequestId: string) => void;
  onReject?: (approvalRequestId: string) => void;
  onAutoApprove?: (approvalRequestId: string) => void;
}

interface MessageViewProps extends ApprovalCallbacks {
  messages: Message[];
  isStreaming: boolean;
  showHeader?: boolean;
  project?: Project | null;
}

function ChunkRenderer({
  chunk,
  projectPath,
  ...callbacks
}: { chunk: Chunk; projectPath?: string } & ApprovalCallbacks) {
  switch (chunk.kind) {
    case "text":
      return (
        <div className="text-gray-200">
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
    <div className="flex items-start gap-2 my-4">
      <span className="text-gray-400 select-none">❯</span>
      <div>
        {images.length > 0 && (
          <div className="flex gap-2 mb-1.5 flex-wrap">
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
          <span className="text-gray-100 bg-gray-800/50 px-2 py-0.5 rounded">
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
  const groupedItems = groupChunksForRender(message.chunks);

  if (groupedItems.length === 0 && isStreaming) {
    return (
      <div className="flex items-start gap-2 my-1">
        <span className="text-[#87CEEB] select-none">●</span>
        <span className="text-gray-400">...</span>
      </div>
    );
  }

  return (
    <div className="my-2 space-y-1">
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
            />
          );
        }

        const chunk = item as Chunk;

        return (
          <div key={i} className="flex items-start gap-2">
            <span className="text-[#87CEEB] select-none">●</span>
            <div className="flex-1 min-w-0">
              <ChunkRenderer
                chunk={chunk}
                projectPath={projectPath}
                {...callbacks}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MessageBubble({
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
}

export function MessageView({
  messages,
  isStreaming,
  showHeader,
  project,
  onApprove,
  onReject,
  onAutoApprove,
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
      className="flex-1 min-h-0 min-w-0 overflow-y-auto px-4 py-4 text-sm leading-relaxed"
    >
      {showHeader && <div className="flex justify-start pb-4"><Logo /></div>}
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id}
          message={message}
          isStreaming={isStreaming && index === messages.length - 1}
          projectPath={project?.path}
          onApprove={onApprove}
          onReject={onReject}
          onAutoApprove={onAutoApprove}
        />
      ))}
    </div>
  );
}

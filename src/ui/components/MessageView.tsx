import { useRef, useEffect } from 'react';
import { CodeBlock } from './CodeBlock';
import { Markdown } from './Markdown';
import { ToolExecution } from './ToolExecution';
import { ToolGroup } from './ToolGroup';
import { TodoList } from './TodoList';
import { HeaderBar } from './HeaderBar';
import type { Chunk, Message, ToolExecutionChunk, TodoItem } from '../../types';

type ToolGroupType = 'read' | 'search' | 'write' | 'execute' | 'explore' | 'other';

type GroupedItem =
  | Chunk
  | { type: 'tool-group'; groupType: ToolGroupType; tools: ToolExecutionChunk[] };

function getToolGroupType(toolName: string): ToolGroupType {
  switch (toolName) {
    case 'read_file':
      return 'read';
    case 'glob':
    case 'search':
    case 'grep':
    case 'list_dir':
      return 'search';
    case 'write_file':
    case 'edit_file':
      return 'write';
    case 'execute':
      return 'execute';
    case 'task':
      return 'explore';
    default:
      return 'other';
  }
}

function groupChunksForRender(chunks: Chunk[]): GroupedItem[] {
  const result: GroupedItem[] = [];
  let currentToolGroup: ToolExecutionChunk[] = [];
  let currentGroupType: ToolGroupType | null = null;

  const flushToolGroup = () => {
    if (currentToolGroup.length > 0 && currentGroupType) {
      result.push({ type: 'tool-group', groupType: currentGroupType, tools: [...currentToolGroup] });
      currentToolGroup = [];
      currentGroupType = null;
    }
  };

  for (const chunk of chunks) {
    if (chunk.kind === 'tool-execution') {
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
  todos?: TodoItem[];
  showHeader?: boolean;
}


function ChunkRenderer({
  chunk,
  ...callbacks
}: { chunk: Chunk } & ApprovalCallbacks) {
  switch (chunk.kind) {
    case 'text':
      return (
        <div className="text-gray-200">
          <Markdown content={chunk.text} />
        </div>
      );
    case 'code':
      return <CodeBlock text={chunk.text} language={chunk.language} />;
    case 'error':
      return <span className="text-red-400">{chunk.text}</span>;
    case 'list':
      return (
        <div className="text-gray-300 ml-2">
          {chunk.lines.map((line, i) => (
            <div key={i}>- {line}</div>
          ))}
        </div>
      );
    case 'tool-execution':
      return (
        <ToolExecution
          chunk={chunk}
          onApprove={callbacks.onApprove}
          onReject={callbacks.onReject}
          onAutoApprove={callbacks.onAutoApprove}
        />
      );
  }
}

function UserMessage({ message }: { message: Message }) {
  const text = message.chunks
    .filter((c) => c.kind === 'text')
    .map((c) => (c as { kind: 'text'; text: string }).text)
    .join('');

  return (
    <div className="flex items-start gap-2 my-4">
      <span className="text-gray-400 select-none">❯</span>
      <span className="text-gray-100 bg-gray-800/50 px-2 py-0.5 rounded">{text}</span>
    </div>
  );
}

function AgentMessage({
  message,
  isStreaming,
  ...callbacks
}: { message: Message; isStreaming?: boolean } & ApprovalCallbacks) {
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
        if ('type' in item && item.type === 'tool-group') {
          return (
            <ToolGroup
              key={`tool-group-${i}`}
              groupType={item.groupType}
              tools={item.tools}
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
            <div className="flex-1">
              <ChunkRenderer chunk={chunk} {...callbacks} />
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
  ...callbacks
}: { message: Message; isStreaming?: boolean } & ApprovalCallbacks) {
  if (message.author === 'user') {
    return <UserMessage message={message} />;
  }
  return <AgentMessage message={message} isStreaming={isStreaming} {...callbacks} />;
}

export function MessageView({ messages, isStreaming, todos, showHeader, onApprove, onReject, onAutoApprove }: MessageViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const threshold = 100;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      isNearBottomRef.current = distanceFromBottom < threshold;
    };

    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming, todos]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 text-sm leading-relaxed">
      {showHeader && <HeaderBar />}
      {todos && todos.length > 0 && <TodoList todos={todos} />}
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id}
          message={message}
          isStreaming={isStreaming && index === messages.length - 1}
          onApprove={onApprove}
          onReject={onReject}
          onAutoApprove={onAutoApprove}
        />
      ))}
    </div>
  );
}

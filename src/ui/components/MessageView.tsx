import { useCallback } from 'react';
import { CodeBlock } from './CodeBlock';
import { Markdown } from './Markdown';
import { ToolExecution } from './ToolExecution';
import { SubagentGroup } from './SubagentGroup';
import { ToolGroup } from './ToolGroup';
import { TodoList } from './TodoList';
import type { Chunk, Message, ToolExecutionChunk, TodoItem } from '../../types';

type ToolGroupType = 'exploring' | 'writing' | 'executing' | 'subagent' | 'other';

type GroupedItem =
  | Chunk
  | { type: 'subagent-group'; tasks: ToolExecutionChunk[] }
  | { type: 'tool-group'; groupType: ToolGroupType; tools: ToolExecutionChunk[] };

function getToolGroupType(toolName: string): ToolGroupType {
  switch (toolName) {
    case 'read_file':
    case 'glob':
    case 'search':
    case 'grep':
    case 'list_dir':
      return 'exploring';
    case 'write_file':
    case 'edit_file':
      return 'writing';
    case 'execute':
      return 'executing';
    case 'task':
      return 'subagent';
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
      if (currentGroupType === 'subagent') {
        result.push({ type: 'subagent-group', tasks: [...currentToolGroup] });
      } else {
        result.push({ type: 'tool-group', groupType: currentGroupType, tools: [...currentToolGroup] });
      }
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
}

function StreamingCursor() {
  return <span className="inline-block w-1.5 h-3 bg-cyan-500 ml-0.5 animate-pulse" />;
}

function ChunkRenderer({
  chunk,
  showCursor,
  ...callbacks
}: { chunk: Chunk; showCursor?: boolean } & ApprovalCallbacks) {
  switch (chunk.kind) {
    case 'text':
      return (
        <div className="text-gray-200">
          <Markdown content={chunk.text} />
          {showCursor && <StreamingCursor />}
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
    <div className="flex items-start gap-2 my-3">
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
        <span className="text-cyan-400 select-none">●</span>
        <span className="text-gray-400">...</span>
      </div>
    );
  }

  return (
    <div className="my-1">
      {groupedItems.map((item, i) => {
        if ('type' in item && item.type === 'subagent-group') {
          return (
            <SubagentGroup
              key={`subagent-group-${i}`}
              tasks={item.tasks}
              onApprove={callbacks.onApprove}
              onReject={callbacks.onReject}
            />
          );
        }

        if ('type' in item && item.type === 'tool-group') {
          return (
            <ToolGroup
              key={`tool-group-${i}`}
              groupType={item.groupType as 'exploring' | 'writing' | 'executing' | 'other'}
              tools={item.tools}
              onApprove={callbacks.onApprove}
              onReject={callbacks.onReject}
              onAutoApprove={callbacks.onAutoApprove}
            />
          );
        }

        const chunk = item as Chunk;
        const isLastItem = i === groupedItems.length - 1;

        return (
          <div key={i} className="flex items-start gap-2">
            <span className="text-cyan-400 select-none">●</span>
            <div className="flex-1">
              <ChunkRenderer
                chunk={chunk}
                showCursor={isStreaming && isLastItem && chunk.kind === 'text'}
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
  ...callbacks
}: { message: Message; isStreaming?: boolean } & ApprovalCallbacks) {
  if (message.author === 'user') {
    return <UserMessage message={message} />;
  }
  return <AgentMessage message={message} isStreaming={isStreaming} {...callbacks} />;
}

export function MessageView({ messages, isStreaming, todos, onApprove, onReject, onAutoApprove }: MessageViewProps) {
  const setScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      node.scrollTop = node.scrollHeight;
    },
    [messages, isStreaming, todos]
  );

  return (
    <div ref={setScrollRef} className="flex-1 overflow-y-auto px-4 py-4 text-xs leading-5">
      <div className="max-w-4xl mx-auto">
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
    </div>
  );
}

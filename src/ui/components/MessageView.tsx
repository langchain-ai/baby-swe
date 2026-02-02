import { useCallback } from 'react';
import { CodeBlock } from './CodeBlock';
import { Markdown } from './Markdown';
import { ToolExecution } from './ToolExecution';
import { SubagentGroup } from './SubagentGroup';
import { TodoList } from './TodoList';
import type { Chunk, Message, ToolExecutionChunk, TodoItem } from '../../types';

type GroupedItem = Chunk | { type: 'subagent-group'; tasks: ToolExecutionChunk[] };

function groupChunksForRender(chunks: Chunk[]): GroupedItem[] {
  const result: GroupedItem[] = [];
  let taskGroup: ToolExecutionChunk[] = [];

  for (const chunk of chunks) {
    if (chunk.kind === 'tool-execution' && chunk.toolName === 'task') {
      taskGroup.push(chunk);
    } else {
      if (taskGroup.length > 0) {
        result.push({ type: 'subagent-group', tasks: [...taskGroup] });
        taskGroup = [];
      }
      result.push(chunk);
    }
  }

  if (taskGroup.length > 0) {
    result.push({ type: 'subagent-group', tasks: taskGroup });
  }

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
  return <span className="inline-block w-2 h-4 bg-cyan-500 ml-0.5 align-baseline animate-pulse" />;
}

function ChunkRenderer({
  chunk,
  showCursor,
  ...callbacks
}: { chunk: Chunk; showCursor?: boolean } & ApprovalCallbacks) {
  switch (chunk.kind) {
    case 'text':
      return (
        <div className="text-gray-200 leading-relaxed">
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
        <ul className="list-disc list-inside text-gray-300 ml-4 space-y-1">
          {chunk.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
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
    <div className="flex items-start gap-2 my-3 font-mono">
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
      <div className="flex items-start gap-2 my-2 font-mono">
        <span className="text-cyan-400 select-none">●</span>
        <span className="text-gray-400">...</span>
      </div>
    );
  }

  return (
    <div className="my-2 space-y-2">
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

        const chunk = item as Chunk;
        const isLastItem = i === groupedItems.length - 1;

        if (chunk.kind === 'tool-execution') {
          return (
            <ChunkRenderer
              key={i}
              chunk={chunk}
              {...callbacks}
            />
          );
        }

        return (
          <div key={i} className="flex items-start gap-2 font-mono">
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
    <div ref={setScrollRef} className="flex-1 overflow-y-auto px-4 py-4">
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

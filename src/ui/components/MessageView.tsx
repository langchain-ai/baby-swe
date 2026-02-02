import { useRef, useEffect } from 'react';
import { CodeBlock } from './CodeBlock';
import { ToolExecution } from './ToolExecution';
import { SubagentGroup } from './SubagentGroup';
import type { Chunk, Message, ToolExecutionChunk } from '../../types';

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
  streamingContent: string | null;
}

function ChunkRenderer({ chunk, ...callbacks }: { chunk: Chunk } & ApprovalCallbacks) {
  switch (chunk.kind) {
    case 'text':
      return <span className="text-gray-200 whitespace-pre-wrap leading-relaxed">{chunk.text}</span>;
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
  return (
    <div className="bg-[#1a1f2e] border border-[#2a3142] rounded-xl p-4 mb-4">
      {message.chunks.map((chunk, i) => (
        <ChunkRenderer key={i} chunk={chunk} />
      ))}
    </div>
  );
}

function AgentMessage({ message, isStreaming }: { message: Message; isStreaming?: boolean }) {
  const hasContent = message.chunks.length > 0;
  const groupedItems = groupChunksForRender(message.chunks);

  return (
    <div className="mb-6">
      <div className="text-gray-500 text-sm mb-2">
        {isStreaming ? 'Thinking...' : 'Thought for a moment'}
      </div>
      <div className="space-y-4">
        {hasContent ? (
          groupedItems.map((item, i) => {
            if ('type' in item && item.type === 'subagent-group') {
              return <SubagentGroup key={`subagent-group-${i}`} tasks={item.tasks} />;
            }
            return <ChunkRenderer key={i} chunk={item as Chunk} />;
          })
        ) : isStreaming ? (
          <span className="text-gray-400">...</span>
        ) : null}
      </div>
    </div>
  );
}

function MessageBubble({ message, isStreaming }: { message: Message; isStreaming?: boolean }) {
  if (message.author === 'user') {
    return <UserMessage message={message} />;
  }
  return <AgentMessage message={message} isStreaming={isStreaming} />;
}

function StreamingContent({ content, toolChunks, ...callbacks }: { content: string; toolChunks: Chunk[] } & ApprovalCallbacks) {
  const groupedItems = groupChunksForRender(toolChunks);

  return (
    <div className="mb-6">
      <div className="text-gray-500 text-sm mb-2">Thinking...</div>
      <div className="space-y-4">
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
          return <ChunkRenderer key={`tool-${i}`} chunk={item as Chunk} {...callbacks} />;
        })}
        {content && (
          <span className="text-gray-200 whitespace-pre-wrap leading-relaxed">
            {content}
            <span className="inline-block w-2 h-4 bg-cyan-500 ml-0.5 animate-pulse" />
          </span>
        )}
        {!content && toolChunks.length === 0 && (
          <span className="text-gray-400">...</span>
        )}
      </div>
    </div>
  );
}

export function MessageView({ messages, streamingContent, onApprove, onReject, onAutoApprove }: MessageViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isStreaming = streamingContent !== null;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const displayMessages = isStreaming ? messages.slice(0, -1) : messages;
  const streamingMessage = isStreaming ? messages[messages.length - 1] : null;
  const toolChunks = streamingMessage?.chunks.filter(c => c.kind === 'tool-execution') || [];

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      <div className="max-w-4xl mx-auto">
        {displayMessages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isStreaming && (
          <StreamingContent
            content={streamingContent || ''}
            toolChunks={toolChunks}
            onApprove={onApprove}
            onReject={onReject}
            onAutoApprove={onAutoApprove}
          />
        )}
      </div>
    </div>
  );
}

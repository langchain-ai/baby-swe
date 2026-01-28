import { useStore } from '../../store';
import { BubblePrefix } from './BubblePrefix';
import { CodeBlock } from './CodeBlock';
import { ToolExecution } from './ToolExecution';
import type { Chunk, Message } from '../../types';

function ChunkRenderer({ chunk }: { chunk: Chunk }) {
  switch (chunk.kind) {
    case 'text':
      return <span className="text-gray-200 whitespace-pre-wrap">{chunk.text}</span>;
    case 'code':
      return <CodeBlock text={chunk.text} language={chunk.language} />;
    case 'error':
      return <span className="text-red-400">{chunk.text}</span>;
    case 'list':
      return (
        <ul className="list-disc list-inside text-gray-300 ml-2">
          {chunk.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      );
    case 'tool-execution':
      return <ToolExecution chunk={chunk} />;
  }
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <div className="py-2 border-b border-gray-800 last:border-b-0">
      <div className="flex items-start">
        <BubblePrefix author={message.author} />
        <div className="flex-1">
          {message.chunks.map((chunk, i) => (
            <ChunkRenderer key={i} chunk={chunk} />
          ))}
        </div>
        <span className="text-gray-600 text-xs ml-2">{message.timestamp}</span>
      </div>
    </div>
  );
}

export function MessageView() {
  const { messages } = useStore();

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p>No messages yet.</p>
          <p className="text-sm mt-1">Type a message below to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}

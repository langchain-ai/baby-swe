import { useRef, useEffect } from 'react';
import { useStore } from '../../store';
import { CodeBlock } from './CodeBlock';
import { ToolExecution } from './ToolExecution';
import type { Chunk, Message } from '../../types';

function ChunkRenderer({ chunk }: { chunk: Chunk }) {
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
      return <ToolExecution chunk={chunk} />;
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

function AgentMessage({ message }: { message: Message }) {
  return (
    <div className="mb-6">
      <div className="text-gray-500 text-sm mb-2">
        Thought for a moment
      </div>
      <div className="space-y-4">
        {message.chunks.map((chunk, i) => (
          <ChunkRenderer key={i} chunk={chunk} />
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.author === 'user') {
    return <UserMessage message={message} />;
  }
  return <AgentMessage message={message} />;
}

export function MessageView() {
  const { messages } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      <div className="max-w-4xl mx-auto">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
}

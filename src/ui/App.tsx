import { useCallback } from 'react';
import { useStore } from '../store';
import { HeaderBar, MessageView, PromptBar } from './components';
import type { Chunk } from '../types';

function parseContentToChunks(content: string): Chunk[] {
  const chunks: Chunk[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index).trim();
      if (textBefore) {
        chunks.push({ kind: 'text', text: textBefore });
      }
    }
    chunks.push({
      kind: 'code',
      language: match[1] || undefined,
      text: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) {
      chunks.push({ kind: 'text', text: remaining });
    }
  }

  if (chunks.length === 0) {
    chunks.push({ kind: 'text', text: content });
  }

  return chunks;
}

export function App() {
  const { messages, addMessage, setBusy } = useStore();
  const hasMessages = messages.length > 0;

  const handleSubmit = useCallback(
    async (query: string) => {
      addMessage('user', [{ kind: 'text', text: query }]);
      setBusy(true);

      try {
        const response = await window.agent.invoke(query);
        const chunks = parseContentToChunks(response.content);
        addMessage('agent', chunks);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        addMessage('agent', [{ kind: 'error', text: errorMessage }]);
      } finally {
        setBusy(false);
      }
    },
    [addMessage, setBusy]
  );

  if (!hasMessages) {
    return (
      <div className="flex flex-col h-screen bg-[#0a0f1a] text-gray-100">
        <HeaderBar />
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-2xl">
            <PromptBar onSubmit={handleSubmit} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0f1a] text-gray-100">
      <HeaderBar />
      <MessageView />
      <div className="px-4 pb-4">
        <div className="max-w-4xl mx-auto">
          <PromptBar onSubmit={handleSubmit} />
        </div>
      </div>
    </div>
  );
}

import { useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { HeaderBar, MessageView, PromptBar, Footer } from './components';
import type { Chunk } from '../types';

const DUMMY_RESPONSES: Record<string, Chunk[]> = {
  default: [
    {
      kind: 'text',
      text: "I'm baby-swe, a coding assistant. I can help you with software engineering tasks like writing code, debugging, and explaining concepts. What would you like to work on?",
    },
  ],
  hello: [
    { kind: 'text', text: 'Hello! How can I help you today?' },
  ],
  'write a function': [
    { kind: 'text', text: "Sure! Here's a simple function:" },
    {
      kind: 'code',
      text: `function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`,
      language: 'typescript',
    },
    { kind: 'text', text: 'This function takes a name and returns a greeting string.' },
  ],
  'read file': [
    {
      kind: 'tool-execution',
      toolCallId: 'tool-1',
      toolName: 'read_file',
      toolArgs: { path: 'src/index.ts' },
      status: 'success',
      output: 'Read 45 lines from src/index.ts',
      elapsedMs: 23,
    },
    { kind: 'text', text: 'I\'ve read the file. It contains the main entry point for your application.' },
  ],
  error: [
    {
      kind: 'tool-execution',
      toolCallId: 'tool-2',
      toolName: 'execute_shell',
      toolArgs: { command: 'npm test' },
      status: 'error',
      output: 'Command failed with exit code 1: Test suite failed',
      elapsedMs: 1523,
    },
    { kind: 'error', text: 'The tests failed. Would you like me to investigate?' },
  ],
  list: [
    { kind: 'text', text: 'Here are some things I can help with:' },
    {
      kind: 'list',
      lines: [
        'Writing and reviewing code',
        'Debugging issues',
        'Explaining concepts',
        'Refactoring and optimization',
        'Writing tests',
      ],
    },
  ],
};

function getDummyResponse(query: string): Chunk[] {
  const lowerQuery = query.toLowerCase();
  for (const key of Object.keys(DUMMY_RESPONSES)) {
    if (lowerQuery.includes(key)) {
      return DUMMY_RESPONSES[key];
    }
  }
  return DUMMY_RESPONSES.default;
}

export function App() {
  const { addMessage, setBusy, toggleBlink } = useStore();

  useEffect(() => {
    const interval = setInterval(toggleBlink, 600);
    return () => clearInterval(interval);
  }, [toggleBlink]);

  const handleSubmit = useCallback(
    async (query: string) => {
      addMessage('user', [{ kind: 'text', text: query }]);
      setBusy(true);

      await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 700));

      const response = getDummyResponse(query);
      addMessage('agent', response);
      setBusy(false);
    },
    [addMessage, setBusy]
  );

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 p-4 font-mono">
      <HeaderBar />
      <MessageView />
      <PromptBar onSubmit={handleSubmit} />
      <Footer />
    </div>
  );
}

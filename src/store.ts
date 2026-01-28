import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Message, Chunk, Mode, ModelConfig, ToolStatus, Thread } from './types';
import { saveThreads, loadThreads, saveModelConfig, loadModelConfig } from './persistence';

function generateTitle(messages: Message[]): string {
  const firstUserMessage = messages.find((m) => m.author === 'user');
  if (!firstUserMessage) return 'New Chat';

  const textChunk = firstUserMessage.chunks.find((c) => c.kind === 'text');
  if (!textChunk || textChunk.kind !== 'text') return 'New Chat';

  const text = textChunk.text;
  if (text.length <= 40) return text;

  const truncated = text.slice(0, 40);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

interface AppState {
  messages: Message[];
  mode: Mode;
  modelConfig: ModelConfig;
  tokenUsage: { input: number; output: number; total: number };
  busy: boolean;
  blink: boolean;
  threads: Thread[];
  currentThreadId: string | null;

  addMessage: (author: Message['author'], chunks: Chunk[]) => string;
  updateToolExecution: (messageId: string, toolCallId: string, status: ToolStatus, output?: string, elapsedMs?: number) => void;
  setMode: (mode: Mode) => void;
  setModelConfig: (config: Partial<ModelConfig>) => void;
  setBusy: (busy: boolean) => void;
  toggleBlink: () => void;
  clearMessages: () => void;
  loadThreadsFromStorage: () => void;
  newThread: () => void;
  switchThread: (id: string) => void;
  deleteThread: (id: string) => void;
  renameThread: (id: string, title: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  messages: [],
  mode: 'agent',
  modelConfig: {
    name: 'claude-sonnet-4-5-20250514',
    provider: 'anthropic',
    effort: 'medium',
  },
  tokenUsage: { input: 0, output: 0, total: 0 },
  busy: false,
  blink: true,
  threads: [],
  currentThreadId: null,

  addMessage: (author, chunks) => {
    const id = uuidv4();
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const newMessage = { id, author, timestamp, chunks };

    set((state) => {
      const newMessages = [...state.messages, newMessage];
      const now = Date.now();

      let updatedThreads: Thread[];
      let threadId = state.currentThreadId;

      if (threadId) {
        updatedThreads = state.threads.map((t) =>
          t.id === threadId
            ? { ...t, messages: newMessages, updatedAt: now, title: generateTitle(newMessages) }
            : t
        );
      } else {
        threadId = uuidv4();
        const newThread: Thread = {
          id: threadId,
          title: generateTitle(newMessages),
          createdAt: now,
          updatedAt: now,
          messages: newMessages,
        };
        updatedThreads = [newThread, ...state.threads];
      }

      saveThreads(updatedThreads);

      return {
        messages: newMessages,
        threads: updatedThreads,
        currentThreadId: threadId,
      };
    });
    return id;
  },

  updateToolExecution: (messageId, toolCallId, status, output, elapsedMs) => {
    set((state) => {
      const newMessages = state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        return {
          ...msg,
          chunks: msg.chunks.map((chunk) => {
            if (chunk.kind !== 'tool-execution' || chunk.toolCallId !== toolCallId) return chunk;
            return { ...chunk, status, output, elapsedMs };
          }),
        };
      });

      if (state.currentThreadId) {
        const updatedThreads = state.threads.map((t) =>
          t.id === state.currentThreadId ? { ...t, messages: newMessages, updatedAt: Date.now() } : t
        );
        saveThreads(updatedThreads);
        return { messages: newMessages, threads: updatedThreads };
      }

      return { messages: newMessages };
    });
  },

  setMode: (mode) => set({ mode }),
  setModelConfig: (config) => set((state) => {
    const newConfig = { ...state.modelConfig, ...config };
    saveModelConfig(newConfig);
    return { modelConfig: newConfig };
  }),
  setBusy: (busy) => set({ busy }),
  toggleBlink: () => set((state) => ({ blink: !state.blink })),

  clearMessages: () => {
    set({ messages: [], currentThreadId: null });
  },

  loadThreadsFromStorage: () => {
    const threads = loadThreads();
    const savedModelConfig = loadModelConfig();
    set((state) => ({
      threads,
      ...(savedModelConfig && { modelConfig: savedModelConfig }),
    }));
  },

  newThread: () => {
    set({ messages: [], currentThreadId: null });
  },

  switchThread: (id) => {
    const { threads } = get();
    const thread = threads.find((t) => t.id === id);
    if (thread) {
      set({ messages: thread.messages, currentThreadId: id });
    }
  },

  deleteThread: (id) => {
    set((state) => {
      const updatedThreads = state.threads.filter((t) => t.id !== id);
      saveThreads(updatedThreads);

      if (state.currentThreadId === id) {
        return { threads: updatedThreads, messages: [], currentThreadId: null };
      }
      return { threads: updatedThreads };
    });
  },

  renameThread: (id, title) => {
    set((state) => {
      const updatedThreads = state.threads.map((t) => (t.id === id ? { ...t, title } : t));
      saveThreads(updatedThreads);
      return { threads: updatedThreads };
    });
  },
}));

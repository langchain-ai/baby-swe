import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Message, Chunk, Mode, ModelConfig, ToolStatus } from './types';

interface AppState {
  messages: Message[];
  mode: Mode;
  modelConfig: ModelConfig;
  tokenUsage: { input: number; output: number; total: number };
  busy: boolean;
  blink: boolean;

  addMessage: (author: Message['author'], chunks: Chunk[]) => string;
  updateToolExecution: (messageId: string, toolCallId: string, status: ToolStatus, output?: string, elapsedMs?: number) => void;
  setMode: (mode: Mode) => void;
  setBusy: (busy: boolean) => void;
  toggleBlink: () => void;
  clearMessages: () => void;
}

export const useStore = create<AppState>((set) => ({
  messages: [],
  mode: 'agent',
  modelConfig: {
    name: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    effort: 'medium',
  },
  tokenUsage: { input: 0, output: 0, total: 0 },
  busy: false,
  blink: true,

  addMessage: (author, chunks) => {
    const id = uuidv4();
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    set((state) => ({
      messages: [...state.messages, { id, author, timestamp, chunks }],
    }));
    return id;
  },

  updateToolExecution: (messageId, toolCallId, status, output, elapsedMs) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        return {
          ...msg,
          chunks: msg.chunks.map((chunk) => {
            if (chunk.kind !== 'tool-execution' || chunk.toolCallId !== toolCallId) return chunk;
            return { ...chunk, status, output, elapsedMs };
          }),
        };
      }),
    }));
  },

  setMode: (mode) => set({ mode }),
  setBusy: (busy) => set({ busy }),
  toggleBlink: () => set((state) => ({ blink: !state.blink })),
  clearMessages: () => set({ messages: [] }),
}));

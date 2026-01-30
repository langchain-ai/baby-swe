declare global {
  interface Window {
    versions: {
      node: () => string;
      chrome: () => string;
      electron: () => string;
    };
    agent: {
      invoke: (message: string) => Promise<{ content: string }>;
      stream: (sessionId: string, message: string) => void;
      cancel: (sessionId: string) => void;
      onStreamEvent: (callback: (event: StreamEvent) => void) => () => void;
    };
    folder: {
      select: () => Promise<string | null>;
      get: () => Promise<string | null>;
      readData: (filename: string) => Promise<string | null>;
      writeData: (filename: string, data: string) => Promise<boolean>;
      onChanged: (callback: (folder: string | null) => void) => () => void;
    };
  }
}

export type Author = 'user' | 'agent' | 'system' | 'tool';

export type ChunkKind = 'text' | 'code' | 'error' | 'list' | 'tool-execution';

export type ToolStatus = 'running' | 'success' | 'error';

export interface ToolExecutionChunk {
  kind: 'tool-execution';
  toolCallId: string;
  toolName: string;
  toolArgs?: Record<string, unknown>;
  status: ToolStatus;
  output?: string;
  elapsedMs?: number;
}

export interface TextChunk {
  kind: 'text';
  text: string;
}

export interface CodeChunk {
  kind: 'code';
  text: string;
  language?: string;
}

export interface ErrorChunk {
  kind: 'error';
  text: string;
}

export interface ListChunk {
  kind: 'list';
  lines: string[];
}

export type Chunk = TextChunk | CodeChunk | ErrorChunk | ListChunk | ToolExecutionChunk;

export interface Message {
  id: string;
  author: Author;
  timestamp: string;
  chunks: Chunk[];
}

export type Mode = 'agent' | 'plan';

export interface ModelConfig {
  name: string;
  provider: string;
  effort: string;
}

export interface Thread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  streamingContent: string | null;
  streamingMessageId: string | null;
  isStreaming: boolean;
  busy: boolean;
  createdAt: number;
  updatedAt: number;
}

export type StreamEvent =
  | { type: 'token'; sessionId: string; token: string }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; sessionId: string; error: string };

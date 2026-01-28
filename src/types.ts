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

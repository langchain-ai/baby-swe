import type { StreamEvent, ApprovalResponse, ChatMessage, ModelConfig, Mode, Chunk } from './types';

interface AgentResponse {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    output?: string;
    error?: string;
  }>;
}

interface Window {
  versions: {
    node: () => string;
    chrome: () => string;
    electron: () => string;
  };
  agent: {
    invoke: (message: string) => Promise<AgentResponse>;
    stream: (sessionId: string, tileId: string, messages: ChatMessage[], modelConfig: ModelConfig, mode: Mode) => void;
    cancel: (sessionId: string) => void;
    onStreamEvent: (callback: (event: StreamEvent) => void) => () => void;
    respondToApproval: (response: ApprovalResponse) => void;
    setMode: (sessionId: string, mode: Mode) => void;
  };
  tile: {
    openProject: (tileId: string, folderPath?: string) => Promise<unknown>;
    closeProject: (tileId: string) => Promise<unknown>;
    onProjectChanged: (callback: (tileId: string, project: unknown) => void) => () => void;
  };
  storage: {
    getSettings: () => Promise<unknown>;
    saveSettings: (settings: unknown) => Promise<unknown>;
    getRecentProjects: () => Promise<unknown>;
  };
  fs: {
    listFiles: (projectPath?: string) => Promise<unknown>;
  };
  terminal: {
    create: (id: string, cwd?: string) => void;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    destroy: (id: string) => void;
    onData: (callback: (id: string, data: string) => void) => () => void;
  };
  git: {
    listBranches: (projectPath: string) => Promise<unknown>;
    switchBranch: (projectPath: string, branchName: string) => Promise<unknown>;
    createBranch: (projectPath: string, branchName: string) => Promise<unknown>;
  };
}

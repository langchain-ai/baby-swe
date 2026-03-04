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
    app: () => Promise<string>;
  };
  agent: {
    invoke: (message: string) => Promise<AgentResponse>;
    stream: (sessionId: string, tileId: string, messages: ChatMessage[], modelConfig: ModelConfig, mode: Mode) => void;
    cancel: (sessionId: string) => void;
    compact: (sessionId: string, messages: ChatMessage[], modelConfig: ModelConfig) => void;
    onStreamEvent: (callback: (event: StreamEvent) => void) => () => void;
    respondToApproval: (response: ApprovalResponse) => void;
    setMode: (sessionId: string, mode: Mode) => void;
  };
  tile: {
    openProject: (tileId: string, folderPath?: string) => Promise<unknown>;
    cloneRepository: (repoUrl: string, parentPath?: string) => Promise<string | null>;
    closeProject: (tileId: string) => Promise<unknown>;
    onProjectChanged: (callback: (tileId: string, project: unknown) => void) => () => void;
  };
  storage: {
    getSettings: () => Promise<unknown>;
    saveSettings: (settings: unknown) => Promise<unknown>;
    getRecentProjects: () => Promise<unknown>;
  };
  fs: {
    listFiles: (projectPath?: string) => Promise<string[]>;
  };
  terminal: {
    create: (id: string, cwd?: string) => void;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    destroy: (id: string) => void;
    onData: (callback: (id: string, data: string) => void) => () => void;
  };
  git: {
    listBranches: (projectPath: string) => Promise<{ branches: string[]; current: string | null }>;
    switchBranch: (projectPath: string, branchName: string) => Promise<{ success: boolean; error?: string }>;
    createBranch: (projectPath: string, branchName: string) => Promise<{ success: boolean; error?: string }>;
    getPR: (projectPath: string) => Promise<import('./types').GithubPR | null>;
    diffFile: (projectPath: string, filePath: string, staged: boolean) => Promise<{ original: string; modified: string } | null>;
    status: (projectPath: string) => Promise<import('./types').GitStatusEntry[]>;
    stageFile: (projectPath: string, filePath: string) => Promise<{ success: boolean; error?: string }>;
    unstageFile: (projectPath: string, filePath: string) => Promise<{ success: boolean; error?: string }>;
    discardFile: (projectPath: string, filePath: string, isUntracked: boolean) => Promise<{ success: boolean; error?: string }>;
    stageAll: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
    unstageAll: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
    discardAll: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
    commit: (projectPath: string, message: string) => Promise<{ success: boolean; error?: string }>;
    push: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
    pull: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
    syncStatus: (projectPath: string) => Promise<{ ahead: number; behind: number; remote: string | null; branchName: string | null }>;
  };
}

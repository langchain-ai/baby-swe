export interface GithubPR {
  number: number;
  title: string;
  url: string;
  state: string;
  author: string;
  baseRef: string;
  headRef: string;
}

export type WorktreeType = 'local' | 'worktree';

export interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  isBare: boolean;
}

export interface Project {
  id: string;
  path: string;
  name: string;
  createdAt: number;
  lastOpenedAt: number;
  gitBranch?: string;
  githubPR?: GithubPR | null;
  /** If this tile uses a worktree, this is the worktree directory path */
  worktreePath?: string;
  /** Whether this tile is using the main checkout or a worktree */
  worktreeType?: WorktreeType;
}

export type TileType = 'agent' | 'terminal' | 'file-viewer' | 'source-control' | 'diff-viewer';

export type GitFileStatus =
  | 'index-modified' | 'index-added' | 'index-deleted' | 'index-renamed' | 'index-copied'
  | 'modified' | 'deleted' | 'untracked' | 'ignored' | 'type-changed' | 'intent-to-add'
  | 'both-modified' | 'both-added' | 'added-by-us' | 'added-by-them' | 'deleted-by-us' | 'deleted-by-them' | 'both-deleted';

export interface GitStatusEntry {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  originalPath?: string;
}

export interface FileViewerData {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  language: string;
}

export interface Tile {
  id: string;
  type: TileType;
  sessionId: string;
  project: Project | null;
  fileViewerData?: FileViewerData;
  fileViewerTabs?: FileViewerData[];
  activeFileViewerTab?: number;
  diffViewerFiles?: FileViewerData[];
  activeDiffViewerFilePath?: string;
}

export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitNode {
  type: 'split';
  direction: SplitDirection;
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
}

export interface TileNode {
  type: 'tile';
  tileId: string;
}

export type LayoutNode = SplitNode | TileNode;

export interface Workspace {
  id: number;
  tiles: Record<string, Tile>;
  layout: LayoutNode | null;
  focusedTileId: string | null;
}

export type ChatMessageContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ChatMessageContentBlock[];
}

export interface ApiKeys {
  anthropic?: string;
  openai?: string;
  baseten?: string;
  tavily?: string;
}

export type PermissionMode = 'default' | 'full';
export type AgentHarness = 'cursor' | 'deepagents';

export interface CursorAuthStatus {
  cliAvailable: boolean;
  authenticated: boolean;
  account: string | null;
  detail: string | null;
  error?: string;
}

export interface CursorLoginResult {
  started: boolean;
  error?: string;
}

export interface CursorLogoutResult {
  success: boolean;
  detail?: string | null;
  error?: string;
}

export interface GlobalSettings {
  version: number;
  modelConfig: ModelConfig;
  permissionMode?: PermissionMode;
  yoloMode?: boolean;
  apiKeys?: ApiKeys;
  harness?: AgentHarness;
}

declare global {
  interface Window {
    versions: {
      node: () => string;
      chrome: () => string;
      electron: () => string;
      app: () => Promise<string>;
    };
    agent: {
      invoke: (message: string) => Promise<{ content: string }>;
      stream: (sessionId: string, tileId: string, messages: ChatMessage[], modelConfig: ModelConfig, mode: Mode) => void;
      cancel: (sessionId: string) => void;
      compact: (sessionId: string, messages: ChatMessage[], modelConfig: ModelConfig) => void;
      onStreamEvent: (callback: (event: StreamEvent) => void) => () => void;
      respondToApproval: (response: ApprovalResponse) => void;
      setMode: (sessionId: string, mode: Mode) => void;
      cursorAuthStatus: () => Promise<CursorAuthStatus>;
      cursorLogin: () => Promise<CursorLoginResult>;
      cursorLogout: () => Promise<CursorLogoutResult>;
    };
    storage: {
      getSettings: () => Promise<GlobalSettings>;
      saveSettings: (settings: GlobalSettings) => Promise<void>;
      getRecentProjects: () => Promise<Project[]>;
      loadThreadsForProject: (projectId: string) => Promise<Thread[]>;
      saveThread: (projectId: string, thread: Thread) => Promise<void>;
      deleteThread: (projectId: string, threadId: string) => Promise<void>;
    };
    tile: {
      openProject: (tileId: string, folderPath?: string) => Promise<Project | null>;
      cloneRepository: (repoUrl: string, parentPath?: string) => Promise<string | null>;
      openWorktree: (tileId: string, mainProjectPath: string, worktreePath: string) => Promise<Project | null>;
      closeProject: (tileId: string) => Promise<void>;
      onProjectChanged: (callback: (tileId: string, project: Project | null) => void) => () => void;
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
      handoffToWorktree: (projectPath: string, branchName: string) => Promise<{ success: boolean; worktreePath?: string; localBranch?: string; error?: string }>;
      createBranch: (projectPath: string, branchName: string) => Promise<{ success: boolean; error?: string }>;
      getPR: (projectPath: string) => Promise<GithubPR | null>;
      diffFile: (projectPath: string, filePath: string) => Promise<{ original: string; modified: string } | null>;
      status: (projectPath: string) => Promise<GitStatusEntry[]>;
      listWorktrees: (projectPath: string) => Promise<WorktreeInfo[]>;
      addWorktree: (projectPath: string, branch: string, newBranch?: boolean) => Promise<{ success: boolean; worktreePath?: string; error?: string }>;
      removeWorktree: (projectPath: string, worktreePath: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

export type Author = 'user' | 'agent' | 'system' | 'tool';

export type ChunkKind = 'text' | 'code' | 'error' | 'list' | 'tool-execution' | 'todo' | 'image';

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export type AgentStatus = 'idle' | 'running' | 'finished' | 'interrupted' | 'error';

export interface TodoItem {
  content: string;
  status: TodoStatus;
}

export type ToolStatus = 'pending-approval' | 'running' | 'success' | 'error';

export interface DiffData {
  originalContent: string | null;
  newContent: string;
  filePath: string;
  isNewFile: boolean;
  isBinary: boolean;
  isTruncated: boolean;
  totalLines: number;
}

export interface ToolExecutionChunk {
  kind: 'tool-execution';
  toolCallId: string;
  toolName: string;
  toolArgs?: Record<string, unknown>;
  status: ToolStatus;
  output?: string;
  elapsedMs?: number;
  approvalRequestId?: string;
  diffData?: DiffData;
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

export interface TodoChunk {
  kind: 'todo';
  todos: TodoItem[];
}

export interface ImageChunk {
  kind: 'image';
  base64: string;
  mimeType: string;
  fileName?: string;
}

export type Chunk = TextChunk | CodeChunk | ErrorChunk | ListChunk | ToolExecutionChunk | TodoChunk | ImageChunk;

export interface Message {
  id: string;
  author: Author;
  timestamp: string;
  chunks: Chunk[];
  hidden?: boolean;
}

export type Mode = 'agent' | 'yolo';

export interface ModelConfig {
  name: string;
  provider: string;
  effort: string;
}

export interface Thread {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface TokenUsageStats {
  input: number;
  output: number;
  total: number;
}

export interface SessionTokenUsage {
  lastCall: TokenUsageStats;
  cumulative: TokenUsageStats;
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  promptDraft: string;
  streamingMessageId: string | null;
  isStreaming: boolean;
  busy: boolean;
  createdAt: number;
  updatedAt: number;
  autoApproveSession: boolean;
  pendingApprovals: Record<string, ApprovalRequest>;
  todos: TodoItem[];
  mode: Mode;
  modelConfig: ModelConfig;
  agentStatus: AgentStatus;
  isCompacting: boolean;
  tokenUsage: SessionTokenUsage;
}

export interface ToolStartEvent {
  type: 'tool-start';
  sessionId: string;
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  approvalRequestId?: string;
  diffData?: DiffData;
}

export interface ToolEndEvent {
  type: 'tool-end';
  sessionId: string;
  toolCallId: string;
  output: string;
  error?: string;
  elapsedMs: number;
}

export interface ToolStatusUpdateEvent {
  type: 'tool-status-update';
  sessionId: string;
  toolCallId: string;
  status: ToolStatus;
}

export interface TokenUsageEvent {
  type: 'token-usage';
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

export type ApprovalDecision = 'approve' | 'reject' | 'auto-approve';

export interface ApprovalResponse {
  requestId: string;
  decision: ApprovalDecision;
}

export interface ApprovalRequestEvent {
  type: 'approval-request';
  sessionId: string;
  request: ApprovalRequest;
}

export interface TodoUpdateEvent {
  type: 'todo-update';
  sessionId: string;
  todos: TodoItem[];
}

export type StreamEvent =
  | { type: 'token'; sessionId: string; token: string }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; sessionId: string; error: string }
  | ToolStartEvent
  | ToolEndEvent
  | ToolStatusUpdateEvent
  | TokenUsageEvent
  | ApprovalRequestEvent
  | TodoUpdateEvent
  | { type: 'compact-start'; sessionId: string }
  | { type: 'compact'; sessionId: string; summary: string; keptMessages: ChatMessage[] }
  | { type: 'compact-end'; sessionId: string };

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Message, Chunk, Mode, ModelConfig, ToolStatus, Thread, Session, Project, ApprovalRequest, DiffData, TodoItem, Tile, LayoutNode, SplitDirection, TileType, Workspace, ApiKeys, FileViewerData, AgentStatus } from './types';
import { loadSettings, saveSettings, loadRecentProjects } from './persistence';
import {
  createInitialLayout,
  splitTile,
  removeTile,
  getTileIds,
  getSmartDirection,
  findAdjacentTile,
  getTileDimensions,
  swapTileIds,
  toggleSplitDirectionForTile,
} from './layout-utils';

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
  sessions: Record<string, Session>;
  mode: Mode;
  modelConfig: ModelConfig;
  getSessionTokenUsage: (sessionId: string) => import('./types').SessionTokenUsage;
  blink: boolean;
  recentProjects: Project[];
  showApiKeysScreen: boolean;
  apiKeys: ApiKeys | null;

  workspaces: Workspace[];
  activeWorkspaceIndex: number;

  getActiveWorkspace: () => Workspace;
  switchWorkspace: (index: number) => void;
  switchWorkspaceRelative: (delta: number) => void;

  createTile: (direction?: SplitDirection | 'auto', type?: TileType) => string;
  closeTile: (tileId: string) => void;
  focusTile: (tileId: string) => void;
  setTileProject: (tileId: string, project: Project | null) => void;
  navigateTile: (direction: 'left' | 'right' | 'up' | 'down') => void;
  moveTile: (direction: 'left' | 'right' | 'up' | 'down') => void;
  toggleSplitDirection: () => void;
  updateSplitRatio: (tileId: string, delta: number) => void;
  getTile: (tileId: string) => Tile | null;
  getFocusedTile: () => Tile | null;
  openFileViewer: (fileViewerData: FileViewerData, direction?: SplitDirection | 'auto') => string;
  setActiveFileViewerTab: (tileId: string, tabIndex: number) => void;
  closeFileViewerTab: (tileId: string, tabIndex: number) => void;

  createSession: (tileId: string) => string;
  clearSession: (sessionId: string) => void;
  getSession: (sessionId: string) => Session | null;
  resumeThread: (sessionId: string, thread: { messages: Message[]; title: string }) => void;

  addMessageToSession: (sessionId: string, author: Message['author'], chunks: Chunk[]) => string;
  updateToolExecution: (sessionId: string, messageId: string, toolCallId: string, status: ToolStatus, output?: string, elapsedMs?: number) => void;

  startStreaming: (sessionId: string) => string;
  appendStreamToken: (sessionId: string, token: string) => void;
  addToolStart: (sessionId: string, toolCallId: string, toolName: string, toolArgs: Record<string, unknown>, approvalRequestId?: string, diffData?: DiffData) => void;
  updateToolEnd: (sessionId: string, toolCallId: string, output: string, error: string | undefined, elapsedMs: number) => void;
  finalizeStream: (sessionId: string) => void;
  abortStream: (sessionId: string, error?: string) => void;

  setAutoApproveSession: (sessionId: string, value: boolean) => void;
  addPendingApproval: (sessionId: string, request: ApprovalRequest) => void;
  removePendingApproval: (sessionId: string, requestId: string) => void;
  updateToolStatus: (sessionId: string, toolCallId: string, status: ToolStatus) => void;
  updateTodos: (sessionId: string, todos: TodoItem[]) => void;
  setSessionMode: (sessionId: string, mode: Mode) => void;
  setSessionPromptDraft: (sessionId: string, promptDraft: string) => void;

  setMode: (mode: Mode) => void;
  setModelConfig: (config: Partial<ModelConfig>) => void;
  updateTokenUsage: (sessionId: string, input: number, output: number) => void;
  compactSession: (sessionId: string, summary: string, keptMessages: import('./types').ChatMessage[]) => void;
  setCompacting: (sessionId: string, isCompacting: boolean) => void;
  toggleBlink: () => void;
  loadRecentProjects: () => Promise<void>;
  setShowApiKeysScreen: (show: boolean) => void;
  loadApiKeys: () => Promise<void>;
  saveApiKeys: (keys: ApiKeys) => Promise<void>;
  loadModelConfig: () => Promise<void>;
}

const NUM_WORKSPACES = 5;

function createEmptyWorkspace(id: number): Workspace {
  return {
    id,
    tiles: {},
    layout: null,
    focusedTileId: null,
  };
}

function createInitialWorkspaces(): Workspace[] {
  return Array.from({ length: NUM_WORKSPACES }, (_, i) => createEmptyWorkspace(i + 1));
}

function createEmptySessionTokenUsage() {
  return {
    lastCall: { input: 0, output: 0, total: 0 },
    cumulative: { input: 0, output: 0, total: 0 },
  };
}

function persistSessionAsThread(get: () => AppState, sessionId: string): void {
  const state = get();
  const session = state.sessions[sessionId];
  if (!session || session.messages.length === 0) return;

  let project: Project | null = null;
  for (const ws of state.workspaces) {
    for (const tile of Object.values(ws.tiles)) {
      if (tile.sessionId === sessionId && tile.project) {
        project = tile.project;
        break;
      }
    }
    if (project) break;
  }
  if (!project) return;

  const thread: Thread = {
    id: sessionId,
    projectId: project.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: session.messages,
  };
  window.storage.saveThread(project.id, thread).catch(() => {});
}

export const useStore = create<AppState>((set, get) => ({
  sessions: {},
  mode: 'agent',
  modelConfig: {
    name: 'claude-sonnet-4-6',
    provider: 'anthropic',
    effort: 'medium',
  },
  blink: true,
  recentProjects: [],
  showApiKeysScreen: false,
  apiKeys: null,

  workspaces: createInitialWorkspaces(),
  activeWorkspaceIndex: 0,

  getActiveWorkspace: () => {
    const { workspaces, activeWorkspaceIndex } = get();
    return workspaces[activeWorkspaceIndex];
  },

  switchWorkspace: (index) => {
    if (index >= 0 && index < NUM_WORKSPACES) {
      const { workspaces, sessions } = get();
      const workspace = workspaces[index];
      const updatedSessions = { ...sessions };
      let changed = false;

      for (const tile of Object.values(workspace.tiles)) {
        if (tile.type !== 'agent') continue;
        const session = updatedSessions[tile.sessionId];
        if (!session) continue;
        const s = session.agentStatus;
        if (s === 'finished' || s === 'interrupted' || s === 'error') {
          updatedSessions[tile.sessionId] = { ...session, agentStatus: 'idle' };
          changed = true;
        }
      }

      set({
        activeWorkspaceIndex: index,
        ...(changed ? { sessions: updatedSessions } : {}),
      });
    }
  },

  switchWorkspaceRelative: (delta) => {
    const { activeWorkspaceIndex } = get();
    const newIndex = (activeWorkspaceIndex + delta + NUM_WORKSPACES) % NUM_WORKSPACES;
    set({ activeWorkspaceIndex: newIndex });
  },

  createTile: (direction, type = 'agent') => {
    const { workspaces, activeWorkspaceIndex } = get();
    const workspace = workspaces[activeWorkspaceIndex];
    const { focusedTileId, layout, tiles } = workspace;

    const tileId = uuidv4();
    const sessionId = uuidv4();
    const now = Date.now();

    const session: Session = {
      id: sessionId,
      title: 'New Chat',
      messages: [],
      promptDraft: '',
      streamingMessageId: null,
      isStreaming: false,
      busy: false,
      createdAt: now,
      updatedAt: now,
      autoApproveSession: false,
      pendingApprovals: {},
      todos: [],
      mode: 'agent',
      agentStatus: 'idle',
      isCompacting: false,
      tokenUsage: createEmptySessionTokenUsage(),
    };

    const tile: Tile = {
      id: tileId,
      type,
      sessionId,
      project: focusedTileId ? tiles[focusedTileId]?.project || null : null,
    };

    let newLayout: LayoutNode;
    if (layout && focusedTileId) {
      let splitDir: 'horizontal' | 'vertical';
      if (direction === 'auto' || !direction) {
        const dims = getTileDimensions(layout, focusedTileId, window.innerWidth, window.innerHeight);
        splitDir = dims ? getSmartDirection(dims.width, dims.height) : 'horizontal';
      } else {
        splitDir = direction;
      }
      newLayout = splitTile(layout, focusedTileId, tileId, splitDir);
    } else {
      newLayout = createInitialLayout(tileId);
    }

    const updatedWorkspace: Workspace = {
      ...workspace,
      tiles: { ...tiles, [tileId]: tile },
      layout: newLayout,
      focusedTileId: tileId,
    };

    const updatedWorkspaces = [...workspaces];
    updatedWorkspaces[activeWorkspaceIndex] = updatedWorkspace;

    set((state) => ({
      sessions: { ...state.sessions, [sessionId]: session },
      workspaces: updatedWorkspaces,
    }));

    return tileId;
  },

  closeTile: (tileId) => {
    const { workspaces, activeWorkspaceIndex, sessions } = get();
    const workspace = workspaces[activeWorkspaceIndex];
    const { layout, tiles, focusedTileId } = workspace;

    const tile = tiles[tileId];
    if (!tile || !layout) return;

    const newLayout = removeTile(layout, tileId);

    const { [tileId]: removedTile, ...remainingTiles } = tiles;
    const { [tile.sessionId]: removedSession, ...remainingSessions } = sessions;

    let newFocusedId: string | null = null;
    if (newLayout) {
      const remainingTileIds = getTileIds(newLayout);
      newFocusedId = focusedTileId === tileId
        ? remainingTileIds[0] || null
        : focusedTileId;
    }

    const updatedWorkspace: Workspace = {
      ...workspace,
      tiles: remainingTiles,
      layout: newLayout,
      focusedTileId: newFocusedId,
    };

    const updatedWorkspaces = [...workspaces];
    updatedWorkspaces[activeWorkspaceIndex] = updatedWorkspace;

    set({
      workspaces: updatedWorkspaces,
      sessions: remainingSessions,
    });
  },

  focusTile: (tileId) => {
    const { workspaces, activeWorkspaceIndex } = get();
    const workspace = workspaces[activeWorkspaceIndex];

    if (workspace.tiles[tileId]) {
      const updatedWorkspace = { ...workspace, focusedTileId: tileId };
      const updatedWorkspaces = [...workspaces];
      updatedWorkspaces[activeWorkspaceIndex] = updatedWorkspace;
      set({ workspaces: updatedWorkspaces });
    }
  },

  setTileProject: (tileId, project) => {
    set((state) => {
      const { workspaces, activeWorkspaceIndex } = state;
      const workspace = workspaces[activeWorkspaceIndex];
      const tile = workspace.tiles[tileId];
      if (!tile) return state;

      const updatedWorkspace = {
        ...workspace,
        tiles: { ...workspace.tiles, [tileId]: { ...tile, project } },
      };
      const updatedWorkspaces = [...workspaces];
      updatedWorkspaces[activeWorkspaceIndex] = updatedWorkspace;

      return { workspaces: updatedWorkspaces };
    });
  },

  navigateTile: (direction) => {
    const { workspaces, activeWorkspaceIndex } = get();
    const workspace = workspaces[activeWorkspaceIndex];
    const { layout, focusedTileId } = workspace;

    if (!focusedTileId || !layout) return;

    const adjacentTileId = findAdjacentTile(layout, focusedTileId, direction);
    if (adjacentTileId) {
      const updatedWorkspace = { ...workspace, focusedTileId: adjacentTileId };
      const updatedWorkspaces = [...workspaces];
      updatedWorkspaces[activeWorkspaceIndex] = updatedWorkspace;
      set({ workspaces: updatedWorkspaces });
    }
  },

  moveTile: (direction) => {
    const { workspaces, activeWorkspaceIndex } = get();
    const workspace = workspaces[activeWorkspaceIndex];
    const { layout, focusedTileId } = workspace;

    if (!focusedTileId || !layout) return;

    const adjacentTileId = findAdjacentTile(layout, focusedTileId, direction);
    if (!adjacentTileId) return;

    const newLayout = swapTileIds(layout, focusedTileId, adjacentTileId);
    if (newLayout === layout) return;

    const updatedWorkspace = { ...workspace, layout: newLayout };
    const updatedWorkspaces = [...workspaces];
    updatedWorkspaces[activeWorkspaceIndex] = updatedWorkspace;
    set({ workspaces: updatedWorkspaces });
  },

  toggleSplitDirection: () => {
    const { workspaces, activeWorkspaceIndex } = get();
    const workspace = workspaces[activeWorkspaceIndex];
    const { layout, focusedTileId } = workspace;

    if (!focusedTileId || !layout) return;

    const newLayout = toggleSplitDirectionForTile(layout, focusedTileId);
    if (newLayout === layout) return;

    const updatedWorkspace = { ...workspace, layout: newLayout };
    const updatedWorkspaces = [...workspaces];
    updatedWorkspaces[activeWorkspaceIndex] = updatedWorkspace;
    set({ workspaces: updatedWorkspaces });
  },

  updateSplitRatio: (_tileId, _delta) => {
    // TODO: Implement split ratio adjustment
  },

  getTile: (tileId) => {
    const { workspaces, activeWorkspaceIndex } = get();
    return workspaces[activeWorkspaceIndex].tiles[tileId] || null;
  },

  getFocusedTile: () => {
    const { workspaces, activeWorkspaceIndex } = get();
    const workspace = workspaces[activeWorkspaceIndex];
    return workspace.focusedTileId ? workspace.tiles[workspace.focusedTileId] || null : null;
  },

  openFileViewer: (fileViewerData, direction) => {
    const { workspaces, activeWorkspaceIndex } = get();
    const workspace = workspaces[activeWorkspaceIndex];
    const { focusedTileId, layout, tiles } = workspace;

    // Look for an existing file-viewer tile in the workspace to reuse
    const existingFileViewerEntry = Object.entries(tiles).find(
      ([, t]) => t.type === 'file-viewer',
    );

    if (existingFileViewerEntry) {
      const [existingTileId, existingTile] = existingFileViewerEntry;
      const tabs = existingTile.fileViewerTabs ?? (existingTile.fileViewerData ? [existingTile.fileViewerData] : []);

      // If same file is already open, just switch to it
      const existingTabIndex = tabs.findIndex(t => t.filePath === fileViewerData.filePath);
      if (existingTabIndex >= 0) {
        // Update the tab data in case content changed, and activate it
        const updatedTabs = [...tabs];
        updatedTabs[existingTabIndex] = fileViewerData;
        const updatedTile: Tile = {
          ...existingTile,
          fileViewerData,
          fileViewerTabs: updatedTabs,
          activeFileViewerTab: existingTabIndex,
        };
        const updatedWorkspace: Workspace = {
          ...workspace,
          tiles: { ...tiles, [existingTileId]: updatedTile },
          focusedTileId: existingTileId,
        };
        const updatedWorkspaces = [...workspaces];
        updatedWorkspaces[activeWorkspaceIndex] = updatedWorkspace;
        set({ workspaces: updatedWorkspaces });
        return existingTileId;
      }

      // Add new tab
      const newTabs = [...tabs, fileViewerData];
      const updatedTile: Tile = {
        ...existingTile,
        fileViewerData,
        fileViewerTabs: newTabs,
        activeFileViewerTab: newTabs.length - 1,
      };
      const updatedWorkspace: Workspace = {
        ...workspace,
        tiles: { ...tiles, [existingTileId]: updatedTile },
        focusedTileId: existingTileId,
      };
      const updatedWorkspaces = [...workspaces];
      updatedWorkspaces[activeWorkspaceIndex] = updatedWorkspace;
      set({ workspaces: updatedWorkspaces });
      return existingTileId;
    }

    // No existing file-viewer tile — create a new one
    const tileId = uuidv4();
    const sessionId = uuidv4();
    const now = Date.now();

    const session: Session = {
      id: sessionId,
      title: fileViewerData.filePath.split('/').pop() || 'File Viewer',
      messages: [],
      promptDraft: '',
      streamingMessageId: null,
      isStreaming: false,
      busy: false,
      createdAt: now,
      updatedAt: now,
      autoApproveSession: false,
      pendingApprovals: {},
      todos: [],
      mode: 'agent',
      agentStatus: 'idle',
      isCompacting: false,
      tokenUsage: createEmptySessionTokenUsage(),
    };

    const tile: Tile = {
      id: tileId,
      type: 'file-viewer',
      sessionId,
      project: focusedTileId ? tiles[focusedTileId]?.project || null : null,
      fileViewerData,
      fileViewerTabs: [fileViewerData],
      activeFileViewerTab: 0,
    };

    let newLayout: LayoutNode;
    if (layout && focusedTileId) {
      let splitDir: 'horizontal' | 'vertical';
      if (direction === 'auto' || !direction) {
        const dims = getTileDimensions(layout, focusedTileId, window.innerWidth, window.innerHeight);
        splitDir = dims ? getSmartDirection(dims.width, dims.height) : 'horizontal';
      } else {
        splitDir = direction;
      }
      newLayout = splitTile(layout, focusedTileId, tileId, splitDir);
    } else {
      newLayout = createInitialLayout(tileId);
    }

    const updatedWorkspace: Workspace = {
      ...workspace,
      tiles: { ...tiles, [tileId]: tile },
      layout: newLayout,
      focusedTileId: tileId,
    };

    const updatedWorkspaces = [...workspaces];
    updatedWorkspaces[activeWorkspaceIndex] = updatedWorkspace;

    set((state) => ({
      sessions: { ...state.sessions, [sessionId]: session },
      workspaces: updatedWorkspaces,
    }));

    return tileId;
  },

  setActiveFileViewerTab: (tileId, tabIndex) => {
    const { workspaces, activeWorkspaceIndex } = get();
    const workspace = workspaces[activeWorkspaceIndex];
    const tile = workspace.tiles[tileId];
    if (!tile || tile.type !== 'file-viewer') return;
    const tabs = tile.fileViewerTabs ?? [];
    if (tabIndex < 0 || tabIndex >= tabs.length) return;

    const updatedTile: Tile = {
      ...tile,
      fileViewerData: tabs[tabIndex],
      activeFileViewerTab: tabIndex,
    };
    const updatedWorkspace: Workspace = {
      ...workspace,
      tiles: { ...workspace.tiles, [tileId]: updatedTile },
    };
    const updatedWorkspaces = [...workspaces];
    updatedWorkspaces[activeWorkspaceIndex] = updatedWorkspace;
    set({ workspaces: updatedWorkspaces });
  },

  closeFileViewerTab: (tileId, tabIndex) => {
    const { workspaces, activeWorkspaceIndex } = get();
    const workspace = workspaces[activeWorkspaceIndex];
    const tile = workspace.tiles[tileId];
    if (!tile || tile.type !== 'file-viewer') return;
    const tabs = tile.fileViewerTabs ?? [];
    if (tabIndex < 0 || tabIndex >= tabs.length) return;

    const newTabs = tabs.filter((_, i) => i !== tabIndex);

    // If no tabs left, close the tile entirely
    if (newTabs.length === 0) {
      get().closeTile(tileId);
      return;
    }

    // Adjust active tab index
    const currentActive = tile.activeFileViewerTab ?? 0;
    let newActive: number;
    if (tabIndex < currentActive) {
      newActive = currentActive - 1;
    } else if (tabIndex === currentActive) {
      newActive = Math.min(currentActive, newTabs.length - 1);
    } else {
      newActive = currentActive;
    }

    const updatedTile: Tile = {
      ...tile,
      fileViewerData: newTabs[newActive],
      fileViewerTabs: newTabs,
      activeFileViewerTab: newActive,
    };
    const updatedWorkspace: Workspace = {
      ...workspace,
      tiles: { ...workspace.tiles, [tileId]: updatedTile },
    };
    const updatedWorkspaces = [...workspaces];
    updatedWorkspaces[activeWorkspaceIndex] = updatedWorkspace;
    set({ workspaces: updatedWorkspaces });
  },

  createSession: (tileId) => {
    const id = uuidv4();
    const session: Session = {
      id,
      title: 'New Chat',
      messages: [],
      promptDraft: '',
      streamingMessageId: null,
      isStreaming: false,
      busy: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      autoApproveSession: false,
      pendingApprovals: {},
      todos: [],
      mode: 'agent',
      agentStatus: 'idle',
      isCompacting: false,
      tokenUsage: createEmptySessionTokenUsage(),
    };
    set((state) => {
      const workspace = state.workspaces[state.activeWorkspaceIndex];
      const tile = workspace.tiles[tileId];
      if (!tile) return { sessions: { ...state.sessions, [id]: session } };

      const updatedWorkspace: Workspace = {
        ...workspace,
        tiles: { ...workspace.tiles, [tileId]: { ...tile, sessionId: id } },
      };
      const updatedWorkspaces = [...state.workspaces];
      updatedWorkspaces[state.activeWorkspaceIndex] = updatedWorkspace;

      return {
        sessions: { ...state.sessions, [id]: session },
        workspaces: updatedWorkspaces,
      };
    });
    return id;
  },

  clearSession: (sessionId) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            messages: [],
            promptDraft: '',
            title: 'New Chat',
            streamingMessageId: null,
            isStreaming: false,
            busy: false,
            updatedAt: Date.now(),
            autoApproveSession: false,
            pendingApprovals: {},
            todos: [],
            agentStatus: 'idle',
            isCompacting: false,
            tokenUsage: createEmptySessionTokenUsage(),
          },
        },
      };
    });
  },

  getSession: (sessionId) => {
    return get().sessions[sessionId] || null;
  },

  resumeThread: (sessionId, thread) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            messages: thread.messages,
            title: thread.title,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  addMessageToSession: (sessionId, author, chunks) => {
    const id = uuidv4();
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const newMessage: Message = { id, author, timestamp, chunks };

    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      const newMessages = [...session.messages, newMessage];
      const title = session.messages.length === 0 ? generateTitle(newMessages) : session.title;

      const updatedSession: Session = {
        ...session,
        messages: newMessages,
        title,
        updatedAt: Date.now(),
      };

      return {
        sessions: { ...state.sessions, [sessionId]: updatedSession },
      };
    });
    return id;
  },

  updateToolExecution: (sessionId, messageId, toolCallId, status, output, elapsedMs) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      const newMessages = session.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        return {
          ...msg,
          chunks: msg.chunks.map((chunk) => {
            if (chunk.kind !== 'tool-execution' || chunk.toolCallId !== toolCallId) return chunk;
            return { ...chunk, status, output, elapsedMs };
          }),
        };
      });

      const updatedSession: Session = {
        ...session,
        messages: newMessages,
        updatedAt: Date.now(),
      };

      return {
        sessions: { ...state.sessions, [sessionId]: updatedSession },
      };
    });
  },

  startStreaming: (sessionId) => {
    const messageId = uuidv4();
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      const placeholderMessage: Message = {
        id: messageId,
        author: 'agent',
        timestamp,
        chunks: [],
      };

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            messages: [...session.messages, placeholderMessage],
            streamingMessageId: messageId,
            isStreaming: true,
            busy: true,
            updatedAt: Date.now(),
            agentStatus: 'running',
          },
        },
      };
    });
    return messageId;
  },

  appendStreamToken: (sessionId, token) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session || !session.streamingMessageId) return state;

      const newMessages = session.messages.map((msg) => {
        if (msg.id !== session.streamingMessageId) return msg;
        const updatedChunks = [...msg.chunks];
        const lastChunk = updatedChunks[updatedChunks.length - 1];
        if (lastChunk?.kind === 'text') {
          updatedChunks[updatedChunks.length - 1] = {
            ...lastChunk,
            text: lastChunk.text + token,
          };
        } else {
          updatedChunks.push({ kind: 'text', text: token });
        }
        return { ...msg, chunks: updatedChunks };
      });

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, messages: newMessages },
        },
      };
    });
  },

  addToolStart: (sessionId, toolCallId, toolName, toolArgs, approvalRequestId, diffData) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session || !session.streamingMessageId) return state;

      const toolChunk: Chunk = {
        kind: 'tool-execution',
        toolCallId,
        toolName,
        toolArgs,
        status: approvalRequestId ? 'pending-approval' : 'running',
        approvalRequestId,
        diffData,
      };

      const newMessages = session.messages.map((msg) => {
        if (msg.id !== session.streamingMessageId) return msg;
        return { ...msg, chunks: [...msg.chunks, toolChunk] };
      });

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, messages: newMessages },
        },
      };
    });
  },

  updateToolEnd: (sessionId, toolCallId, output, error, elapsedMs) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      const newMessages = session.messages.map((msg) => {
        const hasTarget = msg.chunks.some(
          (c) => c.kind === 'tool-execution' && c.toolCallId === toolCallId
        );
        if (!hasTarget) return msg;
        return {
          ...msg,
          chunks: msg.chunks.map((chunk) => {
            if (chunk.kind !== 'tool-execution' || chunk.toolCallId !== toolCallId) return chunk;
            return {
              ...chunk,
              status: error ? 'error' : 'success',
              output,
              elapsedMs,
            } as Chunk;
          }),
        };
      });

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, messages: newMessages },
        },
      };
    });
  },

  finalizeStream: (sessionId) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session || !session.streamingMessageId) return state;

      // Don't overwrite interrupted/error status from abortStream
      const agentStatus = (session.agentStatus === 'interrupted' || session.agentStatus === 'error')
        ? session.agentStatus
        : 'finished';

      const updatedSession: Session = {
        ...session,
        streamingMessageId: null,
        isStreaming: false,
        busy: false,
        updatedAt: Date.now(),
        agentStatus,
      };

      return {
        sessions: { ...state.sessions, [sessionId]: updatedSession },
      };
    });

    // Persist session as a thread (fire-and-forget)
    persistSessionAsThread(get, sessionId);
  },

  abortStream: (sessionId, error) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      let newMessages = session.messages;
      if (session.streamingMessageId) {
        if (error) {
          newMessages = session.messages.map((msg) => {
            if (msg.id !== session.streamingMessageId) return msg;
            return { ...msg, chunks: [...msg.chunks, { kind: 'error', text: error }] };
          });
        }
      }

      const updatedSession: Session = {
        ...session,
        messages: newMessages,
        streamingMessageId: null,
        isStreaming: false,
        busy: false,
        updatedAt: Date.now(),
        agentStatus: error ? 'error' : 'interrupted',
      };

      return {
        sessions: { ...state.sessions, [sessionId]: updatedSession },
      };
    });

    // Persist session as a thread (fire-and-forget)
    persistSessionAsThread(get, sessionId);
  },

  setAutoApproveSession: (sessionId, value) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, autoApproveSession: value },
        },
      };
    });
  },

  addPendingApproval: (sessionId, request) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            pendingApprovals: { ...session.pendingApprovals, [request.id]: request },
          },
        },
      };
    });
  },

  removePendingApproval: (sessionId, requestId) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      const { [requestId]: _, ...remaining } = session.pendingApprovals;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, pendingApprovals: remaining },
        },
      };
    });
  },

  updateToolStatus: (sessionId, toolCallId, status) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      const newMessages = session.messages.map((msg) => {
        const hasTarget = msg.chunks.some(
          (c) => c.kind === 'tool-execution' && c.toolCallId === toolCallId
        );
        if (!hasTarget) return msg;
        return {
          ...msg,
          chunks: msg.chunks.map((chunk) => {
            if (chunk.kind !== 'tool-execution' || chunk.toolCallId !== toolCallId) return chunk;
            return { ...chunk, status };
          }),
        };
      });

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, messages: newMessages },
        },
      };
    });
  },

  updateTodos: (sessionId, todos) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, todos },
        },
      };
    });
  },

  setSessionMode: (sessionId, mode) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, mode },
        },
      };
    });
  },

  setSessionPromptDraft: (sessionId, promptDraft) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session || session.promptDraft === promptDraft) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, promptDraft },
        },
      };
    });
  },

  setMode: (mode) => set({ mode }),
  setModelConfig: (config) =>
    set((state) => {
      const newConfig = { ...state.modelConfig, ...config };
      loadSettings().then((existingSettings) => {
        saveSettings({ ...existingSettings, modelConfig: newConfig });
      });
      return { modelConfig: newConfig };
    }),
  toggleBlink: () => set((state) => ({ blink: !state.blink })),
  getSessionTokenUsage: (sessionId) => {
    const session = get().sessions[sessionId];
    return session?.tokenUsage || createEmptySessionTokenUsage();
  },
  updateTokenUsage: (sessionId, input, output) =>
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      const lastCallTotal = input + output;
      const nextCumulativeInput = session.tokenUsage.cumulative.input + input;
      const nextCumulativeOutput = session.tokenUsage.cumulative.output + output;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            tokenUsage: {
              lastCall: {
                input,
                output,
                total: lastCallTotal,
              },
              cumulative: {
                input: nextCumulativeInput,
                output: nextCumulativeOutput,
                total: nextCumulativeInput + nextCumulativeOutput,
              },
            },
          },
        },
      };
    }),

  setCompacting: (sessionId, isCompacting) =>
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, isCompacting },
        },
      };
    }),

  compactSession: (sessionId, summary, keptMessages) =>
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      // Build compacted messages: summary as a user message (so it's included in chat history sent to the model)
      // Hidden from UI but included when converting to ChatMessages for the agent
      const summaryMessage: Message = {
        id: uuidv4(),
        author: 'user',
        timestamp: new Date().toISOString(),
        chunks: [{ kind: 'text', text: `[Context compacted — previous conversation summarized to free context window space]\n\n${summary}` }],
        hidden: true,
      };

      // Add a visible system message confirming compaction
      const confirmMessage: Message = {
        id: uuidv4(),
        author: 'system',
        timestamp: new Date().toISOString(),
        chunks: [{ kind: 'text', text: 'Conversation compacted successfully.' }],
      };

      // Convert kept ChatMessages back to Message format
      const keptStoreMessages: Message[] = keptMessages.map(m => ({
        id: uuidv4(),
        author: m.role === 'user' ? 'user' as const : 'agent' as const,
        timestamp: new Date().toISOString(),
        chunks: [{
          kind: 'text' as const,
          text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }],
      }));

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            messages: [summaryMessage, confirmMessage, ...keptStoreMessages],
            isCompacting: false,
            updatedAt: Date.now(),
          },
        },
      };
    }),

  loadRecentProjects: async () => {
    const projects = await loadRecentProjects();
    set({ recentProjects: projects });
  },

  setShowApiKeysScreen: (show) => set({ showApiKeysScreen: show }),

  loadApiKeys: async () => {
    const settings = await loadSettings();
    set({ apiKeys: settings.apiKeys || null });
  },

  saveApiKeys: async (keys) => {
    const settings = await loadSettings();
    await saveSettings({ ...settings, apiKeys: keys });
    set({ apiKeys: keys, showApiKeysScreen: false });
  },

  loadModelConfig: async () => {
    const settings = await loadSettings();
    if (settings.modelConfig) {
      set({ modelConfig: settings.modelConfig });
    }
  },
}));

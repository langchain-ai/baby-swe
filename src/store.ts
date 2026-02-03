import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Message, Chunk, Mode, ModelConfig, ToolStatus, Thread, Session, Project, ApprovalRequest, DiffData, TodoItem, Tile, LayoutNode, SplitDirection, TileType, Workspace } from './types';
import { loadSettings, saveSettings, loadRecentProjects } from './persistence';
import { createInitialLayout, splitTile, removeTile, getTileIds, getSmartDirection, findAdjacentTile, getTileDimensions } from './layout-utils';

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
  tokenUsage: { input: number; output: number; total: number };
  blink: boolean;
  recentProjects: Project[];

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
  updateSplitRatio: (tileId: string, delta: number) => void;
  getTile: (tileId: string) => Tile | null;
  getFocusedTile: () => Tile | null;

  createSession: (tileId: string) => string;
  clearSession: (sessionId: string) => void;
  getSession: (sessionId: string) => Session | null;

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

  setMode: (mode: Mode) => void;
  setModelConfig: (config: Partial<ModelConfig>) => void;
  updateTokenUsage: (input: number, output: number) => void;
  toggleBlink: () => void;
  loadRecentProjects: () => Promise<void>;
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

export const useStore = create<AppState>((set, get) => ({
  sessions: {},
  mode: 'agent',
  modelConfig: {
    name: 'claude-sonnet-4-5-20250514',
    provider: 'anthropic',
    effort: 'medium',
  },
  tokenUsage: { input: 0, output: 0, total: 0 },
  blink: true,
  recentProjects: [],

  workspaces: createInitialWorkspaces(),
  activeWorkspaceIndex: 0,

  getActiveWorkspace: () => {
    const { workspaces, activeWorkspaceIndex } = get();
    return workspaces[activeWorkspaceIndex];
  },

  switchWorkspace: (index) => {
    if (index >= 0 && index < NUM_WORKSPACES) {
      set({ activeWorkspaceIndex: index });
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
      streamingMessageId: null,
      isStreaming: false,
      busy: false,
      createdAt: now,
      updatedAt: now,
      autoApproveSession: false,
      pendingApprovals: {},
      todos: [],
      mode: 'agent',
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

  createSession: (tileId) => {
    const id = uuidv4();
    const session: Session = {
      id,
      title: 'New Chat',
      messages: [],
      streamingMessageId: null,
      isStreaming: false,
      busy: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      autoApproveSession: false,
      pendingApprovals: {},
      todos: [],
      mode: 'agent',
    };
    set((state) => {
      const tile = state.tiles[tileId];
      if (!tile) return { sessions: { ...state.sessions, [id]: session } };
      return {
        sessions: { ...state.sessions, [id]: session },
        tiles: { ...state.tiles, [tileId]: { ...tile, sessionId: id } },
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
            title: 'New Chat',
            streamingMessageId: null,
            isStreaming: false,
            busy: false,
            updatedAt: Date.now(),
            autoApproveSession: false,
            pendingApprovals: {},
            todos: [],
          },
        },
        tokenUsage: { input: 0, output: 0, total: 0 },
      };
    });
  },

  getSession: (sessionId) => {
    return get().sessions[sessionId] || null;
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

      const newMessages = session.messages.map((msg) => ({
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
      }));

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

      const updatedSession: Session = {
        ...session,
        streamingMessageId: null,
        isStreaming: false,
        busy: false,
        updatedAt: Date.now(),
      };

      return {
        sessions: { ...state.sessions, [sessionId]: updatedSession },
      };
    });
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
      };

      return {
        sessions: { ...state.sessions, [sessionId]: updatedSession },
      };
    });
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

      const newMessages = session.messages.map((msg) => ({
        ...msg,
        chunks: msg.chunks.map((chunk) => {
          if (chunk.kind !== 'tool-execution' || chunk.toolCallId !== toolCallId) return chunk;
          return { ...chunk, status };
        }),
      }));

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

  setMode: (mode) => set({ mode }),
  setModelConfig: (config) =>
    set((state) => {
      const newConfig = { ...state.modelConfig, ...config };
      saveSettings({ version: 1, modelConfig: newConfig });
      return { modelConfig: newConfig };
    }),
  toggleBlink: () => set((state) => ({ blink: !state.blink })),
  updateTokenUsage: (input, output) =>
    set({
      tokenUsage: {
        input,
        output,
        total: input + output,
      },
    }),

  loadRecentProjects: async () => {
    const projects = await loadRecentProjects();
    set({ recentProjects: projects });
  },
}));

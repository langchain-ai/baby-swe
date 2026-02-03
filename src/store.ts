import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Message, Chunk, Mode, ModelConfig, ToolStatus, Thread, Session, Project, ApprovalRequest, DiffData, TodoItem, Tile, LayoutNode, SplitDirection } from './types';
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

  tiles: Record<string, Tile>;
  layout: LayoutNode;
  focusedTileId: string | null;

  createTile: (direction?: SplitDirection | 'auto') => string;
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

  setMode: (mode: Mode) => void;
  setModelConfig: (config: Partial<ModelConfig>) => void;
  updateTokenUsage: (input: number, output: number) => void;
  toggleBlink: () => void;
  loadRecentProjects: () => Promise<void>;
}

const createInitialTile = (): { tile: Tile; session: Session; layout: LayoutNode } => {
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
  };

  const tile: Tile = {
    id: tileId,
    sessionId,
    project: null,
  };

  const layout = createInitialLayout(tileId);

  return { tile, session, layout };
};

const initial = createInitialTile();

export const useStore = create<AppState>((set, get) => ({
  sessions: { [initial.session.id]: initial.session },
  mode: 'agent',
  modelConfig: {
    name: 'claude-sonnet-4-5-20250514',
    provider: 'anthropic',
    effort: 'medium',
  },
  tokenUsage: { input: 0, output: 0, total: 0 },
  blink: true,
  recentProjects: [],

  tiles: { [initial.tile.id]: initial.tile },
  layout: initial.layout,
  focusedTileId: initial.tile.id,

  createTile: (direction) => {
    const { focusedTileId, layout, tiles } = get();
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
    };

    const tile: Tile = {
      id: tileId,
      sessionId,
      project: focusedTileId ? tiles[focusedTileId]?.project || null : null,
    };

    let newLayout = layout;
    if (focusedTileId) {
      let splitDir: 'horizontal' | 'vertical';
      if (direction === 'auto' || !direction) {
        const dims = getTileDimensions(layout, focusedTileId, window.innerWidth, window.innerHeight);
        splitDir = dims ? getSmartDirection(dims.width, dims.height) : 'horizontal';
      } else {
        splitDir = direction;
      }
      newLayout = splitTile(layout, focusedTileId, tileId, splitDir);
    }

    set((state) => ({
      sessions: { ...state.sessions, [sessionId]: session },
      tiles: { ...state.tiles, [tileId]: tile },
      layout: newLayout,
      focusedTileId: tileId,
    }));

    return tileId;
  },

  closeTile: (tileId) => {
    const { layout, tiles, sessions, focusedTileId } = get();
    const tile = tiles[tileId];
    if (!tile) return;

    const newLayout = removeTile(layout, tileId);
    if (!newLayout) {
      window.close();
      return;
    }

    const { [tileId]: removedTile, ...remainingTiles } = tiles;
    const { [tile.sessionId]: removedSession, ...remainingSessions } = sessions;

    const remainingTileIds = getTileIds(newLayout);
    const newFocusedId = focusedTileId === tileId
      ? remainingTileIds[0] || null
      : focusedTileId;

    set({
      layout: newLayout,
      tiles: remainingTiles,
      sessions: remainingSessions,
      focusedTileId: newFocusedId,
    });
  },

  focusTile: (tileId) => {
    const { tiles } = get();
    if (tiles[tileId]) {
      set({ focusedTileId: tileId });
    }
  },

  setTileProject: (tileId, project) => {
    set((state) => {
      const tile = state.tiles[tileId];
      if (!tile) return state;
      return {
        tiles: {
          ...state.tiles,
          [tileId]: { ...tile, project },
        },
      };
    });
  },

  navigateTile: (direction) => {
    const { layout, focusedTileId } = get();
    if (!focusedTileId) return;

    const adjacentTileId = findAdjacentTile(layout, focusedTileId, direction);
    if (adjacentTileId) {
      set({ focusedTileId: adjacentTileId });
    }
  },

  updateSplitRatio: (_tileId, _delta) => {
    // TODO: Implement split ratio adjustment
  },

  getTile: (tileId) => {
    return get().tiles[tileId] || null;
  },

  getFocusedTile: () => {
    const { tiles, focusedTileId } = get();
    return focusedTileId ? tiles[focusedTileId] || null : null;
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

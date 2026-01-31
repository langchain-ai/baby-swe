import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Message, Chunk, Mode, ModelConfig, ToolStatus, Thread, Session, Project } from './types';
import { loadSettings, saveSettings, loadRecentProjects, loadThreads, saveThread, deleteThread as deleteThreadFromStorage } from './persistence';

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
  activeSessionId: string | null;
  mode: Mode;
  modelConfig: ModelConfig;
  tokenUsage: { input: number; output: number; total: number };
  blink: boolean;
  threads: Thread[];
  currentProject: Project | null;
  recentProjects: Project[];
  projectLoading: boolean;

  createSession: () => string;
  closeSession: (id: string) => void;
  clearSession: (id: string) => void;
  switchSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  getActiveSession: () => Session | null;

  addMessageToSession: (sessionId: string, author: Message['author'], chunks: Chunk[]) => string;
  updateToolExecution: (sessionId: string, messageId: string, toolCallId: string, status: ToolStatus, output?: string, elapsedMs?: number) => void;

  startStreaming: (sessionId: string) => string;
  appendStreamToken: (sessionId: string, token: string) => void;
  finalizeStream: (sessionId: string) => void;
  abortStream: (sessionId: string, error?: string) => void;

  setMode: (mode: Mode) => void;
  setModelConfig: (config: Partial<ModelConfig>) => void;
  toggleBlink: () => void;
  loadRecentProjects: () => Promise<void>;
  loadThreadsFromStorage: () => Promise<void>;
  switchThread: (id: string) => void;
  deleteThread: (id: string) => void;
  renameThread: (id: string, title: string) => void;
  setCurrentProject: (project: Project | null) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  mode: 'agent',
  modelConfig: {
    name: 'claude-sonnet-4-5-20250514',
    provider: 'anthropic',
    effort: 'medium',
  },
  tokenUsage: { input: 0, output: 0, total: 0 },
  blink: true,
  threads: [],
  currentProject: null,
  recentProjects: [],
  projectLoading: false,

  createSession: () => {
    const id = uuidv4();
    const session: Session = {
      id,
      title: 'New Chat',
      messages: [],
      streamingContent: null,
      streamingMessageId: null,
      isStreaming: false,
      busy: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((state) => ({
      sessions: { ...state.sessions, [id]: session },
      activeSessionId: id,
    }));
    return id;
  },

  closeSession: (id) => {
    set((state) => {
      const { [id]: removed, ...remaining } = state.sessions;
      const remainingIds = Object.keys(remaining);
      const newActiveId = state.activeSessionId === id
        ? (remainingIds.length > 0 ? remainingIds[0] : null)
        : state.activeSessionId;
      return { sessions: remaining, activeSessionId: newActiveId };
    });
  },

  clearSession: (id) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            messages: [],
            title: 'New Chat',
            streamingContent: null,
            streamingMessageId: null,
            isStreaming: false,
            busy: false,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  switchSession: (id) => {
    const { sessions } = get();
    if (sessions[id]) {
      set({ activeSessionId: id });
    }
  },

  renameSession: (id, title) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [id]: { ...session, title, updatedAt: Date.now() },
        },
      };
    });
  },

  getActiveSession: () => {
    const { sessions, activeSessionId } = get();
    return activeSessionId ? sessions[activeSessionId] || null : null;
  },

  addMessageToSession: (sessionId, author, chunks) => {
    const id = uuidv4();
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const newMessage: Message = { id, author, timestamp, chunks };

    const { currentProject, threads } = get();
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      const newMessages = [...session.messages, newMessage];
      const title = session.messages.length === 0 ? generateTitle(newMessages) : session.title;
      const now = Date.now();

      const updatedSession: Session = {
        ...session,
        messages: newMessages,
        title,
        updatedAt: now,
      };

      const updatedThreads = syncSessionToThreads(state.threads, updatedSession, currentProject?.id);
      if (currentProject) {
        const threadToSave = updatedThreads.find((t) => t.messages[0]?.id === updatedSession.messages[0]?.id);
        if (threadToSave) saveThread(threadToSave);
      }

      return {
        sessions: { ...state.sessions, [sessionId]: updatedSession },
        threads: updatedThreads,
      };
    });
    return id;
  },

  updateToolExecution: (sessionId, messageId, toolCallId, status, output, elapsedMs) => {
    const { currentProject } = get();
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

      const updatedThreads = syncSessionToThreads(state.threads, updatedSession, currentProject?.id);
      if (currentProject) {
        const threadToSave = updatedThreads.find((t) => t.messages[0]?.id === updatedSession.messages[0]?.id);
        if (threadToSave) saveThread(threadToSave);
      }

      return {
        sessions: { ...state.sessions, [sessionId]: updatedSession },
        threads: updatedThreads,
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
            streamingContent: '',
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
      if (!session || !session.isStreaming) return state;

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            streamingContent: (session.streamingContent || '') + token,
          },
        },
      };
    });
  },

  finalizeStream: (sessionId) => {
    const { currentProject } = get();
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session || !session.streamingMessageId) return state;

      const content = session.streamingContent || '';
      const chunks = parseContentToChunks(content);

      const newMessages = session.messages.map((msg) =>
        msg.id === session.streamingMessageId ? { ...msg, chunks } : msg
      );

      const updatedSession: Session = {
        ...session,
        messages: newMessages,
        streamingContent: null,
        streamingMessageId: null,
        isStreaming: false,
        busy: false,
        updatedAt: Date.now(),
      };

      const updatedThreads = syncSessionToThreads(state.threads, updatedSession, currentProject?.id);
      if (currentProject) {
        const threadToSave = updatedThreads.find((t) => t.messages[0]?.id === updatedSession.messages[0]?.id);
        if (threadToSave) saveThread(threadToSave);
      }

      return {
        sessions: { ...state.sessions, [sessionId]: updatedSession },
        threads: updatedThreads,
      };
    });
  },

  abortStream: (sessionId, error) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      let newMessages = session.messages;
      if (session.streamingMessageId) {
        const content = session.streamingContent || '';
        const chunks: Chunk[] = content
          ? parseContentToChunks(content)
          : [];
        if (error) {
          chunks.push({ kind: 'error', text: error });
        }
        newMessages = session.messages.map((msg) =>
          msg.id === session.streamingMessageId ? { ...msg, chunks } : msg
        );
      }

      const updatedSession: Session = {
        ...session,
        messages: newMessages,
        streamingContent: null,
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

  setMode: (mode) => set({ mode }),
  setModelConfig: (config) =>
    set((state) => {
      const newConfig = { ...state.modelConfig, ...config };
      saveSettings({ version: 1, modelConfig: newConfig });
      return { modelConfig: newConfig };
    }),
  toggleBlink: () => set((state) => ({ blink: !state.blink })),

  loadRecentProjects: async () => {
    const projects = await loadRecentProjects();
    set({ recentProjects: projects });
  },

  loadThreadsFromStorage: async () => {
    const { currentProject } = get();
    if (!currentProject) {
      set({ threads: [], sessions: {}, activeSessionId: null });
      return;
    }

    set({ projectLoading: true });
    const threads = await loadThreads();
    const settings = await loadSettings();
    set({
      threads,
      sessions: {},
      activeSessionId: null,
      projectLoading: false,
      modelConfig: settings.modelConfig,
    });
  },

  switchThread: (id) => {
    const { threads, sessions, createSession } = get();
    const thread = threads.find((t) => t.id === id);
    if (!thread) return;

    const existingSessionId = Object.keys(sessions).find(
      (sid) => sessions[sid].messages.length > 0 && sessions[sid].messages[0]?.id === thread.messages[0]?.id
    );

    if (existingSessionId) {
      set({ activeSessionId: existingSessionId });
    } else {
      const sessionId = createSession();
      set((state) => ({
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...state.sessions[sessionId],
            messages: thread.messages,
            title: thread.title,
          },
        },
      }));
    }
  },

  deleteThread: (id) => {
    const { currentProject } = get();
    set((state) => {
      const updatedThreads = state.threads.filter((t) => t.id !== id);
      if (currentProject) {
        deleteThreadFromStorage(id);
      }
      return { threads: updatedThreads };
    });
  },

  renameThread: (id, title) => {
    const { currentProject } = get();
    set((state) => {
      const thread = state.threads.find((t) => t.id === id);
      if (!thread) return state;
      const updatedThread = { ...thread, title };
      const updatedThreads = state.threads.map((t) => (t.id === id ? updatedThread : t));
      if (currentProject) {
        saveThread(updatedThread);
      }
      return { threads: updatedThreads };
    });
  },

  setCurrentProject: async (project) => {
    set({ currentProject: project, projectLoading: true, threads: [], sessions: {}, activeSessionId: null });

    if (project) {
      const threads = await loadThreads();
      const settings = await loadSettings();
      set({ threads, projectLoading: false, modelConfig: settings.modelConfig });
    } else {
      set({ projectLoading: false });
    }
  },
}));

function syncSessionToThreads(threads: Thread[], session: Session, projectId?: string): Thread[] {
  if (session.messages.length === 0) return threads;

  const existingIndex = threads.findIndex((t) =>
    t.messages[0]?.id === session.messages[0]?.id
  );

  const thread: Thread = {
    id: existingIndex >= 0 ? threads[existingIndex].id : uuidv4(),
    projectId: projectId || (existingIndex >= 0 ? threads[existingIndex].projectId : ''),
    title: session.title,
    createdAt: existingIndex >= 0 ? threads[existingIndex].createdAt : session.createdAt,
    updatedAt: session.updatedAt,
    messages: session.messages,
  };

  if (existingIndex >= 0) {
    return threads.map((t, i) => (i === existingIndex ? thread : t));
  }
  return [thread, ...threads];
}

function parseContentToChunks(content: string): Chunk[] {
  const chunks: Chunk[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index).trim();
      if (textBefore) {
        chunks.push({ kind: 'text', text: textBefore });
      }
    }
    chunks.push({
      kind: 'code',
      language: match[1] || undefined,
      text: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) {
      chunks.push({ kind: 'text', text: remaining });
    }
  }

  if (chunks.length === 0 && content) {
    chunks.push({ kind: 'text', text: content });
  }

  return chunks;
}

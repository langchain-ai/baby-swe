import { useCallback, useEffect } from 'react';
import { useStore } from '../store';
import { HeaderBar, MessageView, PromptBar, FolderSelectScreen, TabBar } from './components';
import { executeCommand, type CommandContext } from '../commands';
import type { Message, ChatMessage } from '../types';

function messagesToChatMessages(messages: Message[]): ChatMessage[] {
  const chatMessages: ChatMessage[] = [];
  for (const msg of messages) {
    if (msg.author === 'user' || msg.author === 'agent') {
      const textContent = msg.chunks
        .filter((c) => c.kind === 'text')
        .map((c) => (c as { text: string }).text)
        .join('\n');
      if (textContent) {
        chatMessages.push({
          role: msg.author === 'user' ? 'user' : 'assistant',
          content: textContent,
        });
      }
    }
  }
  return chatMessages;
}

export function App() {
  const {
    sessions,
    activeSessionId,
    currentProject,
    recentProjects,
    tokenUsage,
    setCurrentProject,
    loadRecentProjects,
    loadThreadsFromStorage,
    createSession,
    closeSession,
    clearSession,
    switchSession,
    addMessageToSession,
    startStreaming,
    appendStreamToken,
    addToolStart,
    updateToolEnd,
    updateToolStatus,
    setAutoApproveSession,
    finalizeStream,
    abortStream,
  } = useStore();

  const activeSession = activeSessionId ? sessions[activeSessionId] : null;
  const sessionList = Object.values(sessions);

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === 'k') {
        e.preventDefault();
        if (activeSessionId) {
          clearSession(activeSessionId);
        }
        return;
      }

      if (isMod && e.key === 't') {
        e.preventDefault();
        createSession();
        return;
      }

      if (isMod && e.key === 'w') {
        e.preventDefault();
        if (activeSessionId) {
          if (sessions[activeSessionId]?.isStreaming) {
            window.agent.cancel(activeSessionId);
          }
          closeSession(activeSessionId);
        }
        return;
      }

      if (isMod && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const sessionIds = Object.keys(sessions);
        if (sessionIds.length < 2 || !activeSessionId) return;
        const currentIndex = sessionIds.indexOf(activeSessionId);
        const delta = e.key === 'ArrowLeft' ? -1 : 1;
        const newIndex = (currentIndex + delta + sessionIds.length) % sessionIds.length;
        switchSession(sessionIds[newIndex]);
        return;
      }

      if (isMod && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const sessionIds = Object.keys(sessions);
        const index = parseInt(e.key, 10) - 1;
        if (index < sessionIds.length) {
          switchSession(sessionIds[index]);
        }
        return;
      }

      if (e.key === 'Escape' && activeSessionId && (activeSession?.isStreaming || activeSession?.busy)) {
        e.preventDefault();
        window.agent.cancel(activeSessionId);
        return;
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeSessionId, activeSession?.isStreaming, activeSession?.busy, sessions, clearSession, createSession, closeSession, switchSession]);

  useEffect(() => {
    loadRecentProjects();
  }, [loadRecentProjects]);

  useEffect(() => {
    const unsubscribe = window.storage.onProjectChanged((project) => {
      setCurrentProject(project);
    });
    return unsubscribe;
  }, [setCurrentProject]);

  useEffect(() => {
    if (currentProject) {
      loadThreadsFromStorage();
    }
  }, [currentProject, loadThreadsFromStorage]);

  useEffect(() => {
    const unsubscribe = window.agent.onStreamEvent((event) => {
      switch (event.type) {
        case 'token':
          appendStreamToken(event.sessionId, event.token);
          break;
        case 'tool-start':
          addToolStart(event.sessionId, event.toolCallId, event.toolName, event.toolArgs, event.approvalRequestId, event.diffData);
          break;
        case 'tool-end':
          updateToolEnd(event.sessionId, event.toolCallId, event.output, event.error, event.elapsedMs);
          break;
        case 'tool-status-update':
          updateToolStatus(event.sessionId, event.toolCallId, event.status);
          break;
        case 'done':
          finalizeStream(event.sessionId);
          break;
        case 'error':
          abortStream(event.sessionId, event.error);
          break;
      }
    });
    return unsubscribe;
  }, [appendStreamToken, addToolStart, updateToolEnd, updateToolStatus, finalizeStream, abortStream]);

  const handleOpenFolder = useCallback(async () => {
    await window.storage.openProject();
  }, []);

  const handleSelectRecent = useCallback(async (path: string) => {
    await window.storage.openProject(path);
  }, []);

  const handleNewSession = useCallback(() => {
    createSession();
  }, [createSession]);

  const handleCloseSession = useCallback((id: string) => {
    if (sessions[id]?.isStreaming) {
      window.agent.cancel(id);
    }
    closeSession(id);
  }, [sessions, closeSession]);

  const handleApprove = useCallback((approvalRequestId: string) => {
    window.agent.respondToApproval({ requestId: approvalRequestId, decision: 'approve' });
  }, []);

  const handleReject = useCallback((approvalRequestId: string) => {
    window.agent.respondToApproval({ requestId: approvalRequestId, decision: 'reject' });
  }, []);

  const handleAutoApprove = useCallback((approvalRequestId: string) => {
    if (activeSessionId) {
      setAutoApproveSession(activeSessionId, true);
    }
    window.agent.respondToApproval({ requestId: approvalRequestId, decision: 'auto-approve' });
  }, [activeSessionId, setAutoApproveSession]);

  const handleSubmit = useCallback(
    async (query: string) => {
      const sendAgentPrompt = (prompt: string) => {
        const sessionId = activeSessionId || createSession();
        const existingMessages = sessions[sessionId]?.messages || [];
        const chatHistory = messagesToChatMessages(existingMessages);
        chatHistory.push({ role: 'user', content: prompt });
        addMessageToSession(sessionId, 'user', [{ kind: 'text', text: prompt }]);
        startStreaming(sessionId);
        window.agent.stream(sessionId, chatHistory);
      };

      const commandCtx: CommandContext = {
        sessionId: activeSessionId,
        createSession,
        clearSession,
        addSystemMessage: (sessionId, chunks) => addMessageToSession(sessionId, 'system', chunks),
        tokenUsage,
        sendAgentPrompt,
      };

      if (executeCommand(query, commandCtx)) {
        return;
      }

      if (!activeSessionId) {
        const newId = createSession();
        addMessageToSession(newId, 'user', [{ kind: 'text', text: query }]);
        startStreaming(newId);
        window.agent.stream(newId, [{ role: 'user', content: query }]);
      } else {
        const existingMessages = sessions[activeSessionId]?.messages || [];
        const chatHistory = messagesToChatMessages(existingMessages);
        chatHistory.push({ role: 'user', content: query });
        addMessageToSession(activeSessionId, 'user', [{ kind: 'text', text: query }]);
        startStreaming(activeSessionId);
        window.agent.stream(activeSessionId, chatHistory);
      }
    },
    [activeSessionId, createSession, clearSession, addMessageToSession, startStreaming, tokenUsage, sessions]
  );

  if (!currentProject) {
    return (
      <FolderSelectScreen
        onOpenFolder={handleOpenFolder}
        onSelectRecent={handleSelectRecent}
        recentProjects={recentProjects}
      />
    );
  }

  const hasMessages = activeSession && activeSession.messages.length > 0;

  if (!hasMessages) {
    return (
      <div className="flex flex-col h-screen bg-[#0a0f1a] text-gray-100">
        <TabBar
          sessions={sessionList}
          activeSessionId={activeSessionId}
          onSelect={switchSession}
          onCreate={handleNewSession}
          onClose={handleCloseSession}
        />
        <HeaderBar />
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-2xl">
            <PromptBar onSubmit={handleSubmit} busy={activeSession?.busy ?? false} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0f1a] text-gray-100">
      <TabBar
        sessions={sessionList}
        activeSessionId={activeSessionId}
        onSelect={switchSession}
        onCreate={handleNewSession}
        onClose={handleCloseSession}
      />
      <HeaderBar />
      <MessageView
        messages={activeSession.messages}
        streamingContent={activeSession.streamingContent}
        onApprove={handleApprove}
        onReject={handleReject}
        onAutoApprove={handleAutoApprove}
      />
      <div className="px-4 pb-4">
        <div className="max-w-4xl mx-auto">
          <PromptBar onSubmit={handleSubmit} busy={activeSession.busy} />
        </div>
      </div>
    </div>
  );
}

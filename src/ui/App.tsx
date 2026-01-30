import { useCallback, useEffect } from 'react';
import { useStore } from '../store';
import { HeaderBar, MessageView, PromptBar, FolderSelectScreen, TabBar } from './components';

export function App() {
  const {
    sessions,
    activeSessionId,
    selectedFolder,
    setSelectedFolder,
    loadThreadsFromStorage,
    createSession,
    closeSession,
    switchSession,
    addMessageToSession,
    startStreaming,
    appendStreamToken,
    finalizeStream,
    abortStream,
  } = useStore();

  const activeSession = activeSessionId ? sessions[activeSessionId] : null;
  const sessionList = Object.values(sessions);

  useEffect(() => {
    const unsubscribe = window.folder.onChanged((folder) => {
      setSelectedFolder(folder);
    });
    return unsubscribe;
  }, [setSelectedFolder]);

  useEffect(() => {
    if (selectedFolder) {
      loadThreadsFromStorage();
    }
  }, [selectedFolder, loadThreadsFromStorage]);

  useEffect(() => {
    const unsubscribe = window.agent.onStreamEvent((event) => {
      switch (event.type) {
        case 'token':
          appendStreamToken(event.sessionId, event.token);
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
  }, [appendStreamToken, finalizeStream, abortStream]);

  const handleOpenFolder = useCallback(async () => {
    const folder = await window.folder.select();
    if (folder) {
      setSelectedFolder(folder);
    }
  }, [setSelectedFolder]);

  const handleNewSession = useCallback(() => {
    createSession();
  }, [createSession]);

  const handleCloseSession = useCallback((id: string) => {
    if (sessions[id]?.isStreaming) {
      window.agent.cancel(id);
    }
    closeSession(id);
  }, [sessions, closeSession]);

  const handleSubmit = useCallback(
    async (query: string) => {
      if (!activeSessionId) {
        const newId = createSession();
        addMessageToSession(newId, 'user', [{ kind: 'text', text: query }]);
        startStreaming(newId);
        window.agent.stream(newId, query);
      } else {
        addMessageToSession(activeSessionId, 'user', [{ kind: 'text', text: query }]);
        startStreaming(activeSessionId);
        window.agent.stream(activeSessionId, query);
      }
    },
    [activeSessionId, createSession, addMessageToSession, startStreaming]
  );

  if (!selectedFolder) {
    return <FolderSelectScreen onOpenFolder={handleOpenFolder} />;
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
      />
      <div className="px-4 pb-4">
        <div className="max-w-4xl mx-auto">
          <PromptBar onSubmit={handleSubmit} busy={activeSession.busy} />
        </div>
      </div>
    </div>
  );
}

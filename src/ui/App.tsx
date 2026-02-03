import { useCallback, useEffect } from 'react';
import { useStore } from '../store';
import { TilingLayout } from './components/TilingLayout';
import { Footer } from './components';

export function App() {
  const {
    layout,
    tiles,
    focusedTileId,
    sessions,
    createTile,
    closeTile,
    navigateTile,
    setTileProject,
    loadRecentProjects,
    appendStreamToken,
    addToolStart,
    updateToolEnd,
    updateToolStatus,
    updateTokenUsage,
    updateTodos,
    finalizeStream,
    abortStream,
  } = useStore();

  useEffect(() => {
    loadRecentProjects();
  }, [loadRecentProjects]);

  useEffect(() => {
    const unsubscribe = window.tile.onProjectChanged((tileId, project) => {
      setTileProject(tileId, project as any);
    });
    return unsubscribe;
  }, [setTileProject]);

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
        case 'token-usage':
          updateTokenUsage(event.inputTokens, event.outputTokens);
          break;
        case 'todo-update':
          updateTodos(event.sessionId, event.todos);
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
  }, [appendStreamToken, addToolStart, updateToolEnd, updateToolStatus, updateTokenUsage, updateTodos, finalizeStream, abortStream]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey;

    if (isMod && e.shiftKey && e.key === 't') {
      e.preventDefault();
      createTile('auto', 'terminal');
      return;
    }

    if (isMod && e.key === 't') {
      e.preventDefault();
      createTile('auto', 'agent');
      return;
    }

    if (isMod && e.key === 'w') {
      e.preventDefault();
      if (focusedTileId) {
        const tile = tiles[focusedTileId];
        if (tile) {
          const session = sessions[tile.sessionId];
          if (session?.isStreaming) {
            window.agent.cancel(session.id);
          }
        }
        closeTile(focusedTileId);
      }
      return;
    }

    if (isMod && e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateTile('left');
      return;
    }

    if (isMod && e.key === 'ArrowRight') {
      e.preventDefault();
      navigateTile('right');
      return;
    }

    if (isMod && e.key === 'ArrowUp') {
      e.preventDefault();
      navigateTile('up');
      return;
    }

    if (isMod && e.key === 'ArrowDown') {
      e.preventDefault();
      navigateTile('down');
      return;
    }

    if (e.key === 'Escape' && focusedTileId) {
      const tile = tiles[focusedTileId];
      if (tile) {
        const session = sessions[tile.sessionId];
        if (session?.isStreaming || session?.busy) {
          e.preventDefault();
          window.agent.cancel(session.id);
        }
      }
      return;
    }
  }, [focusedTileId, tiles, sessions, createTile, closeTile, navigateTile]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex flex-col h-screen bg-[#1a2332] text-gray-100">
      <div className="flex-1 min-h-0">
        <TilingLayout node={layout} />
      </div>
      <Footer />
    </div>
  );
}

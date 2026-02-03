import { useCallback, useEffect } from 'react';
import { useStore } from '../store';
import { TilingLayout } from './components/TilingLayout';
import { WorkspaceBar } from './components/WorkspaceBar';
import { FolderSelectScreen } from './components';

export function App() {
  const {
    workspaces,
    activeWorkspaceIndex,
    sessions,
    recentProjects,
    createTile,
    closeTile,
    navigateTile,
    setTileProject,
    switchWorkspace,
    switchWorkspaceRelative,
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

  const workspace = workspaces[activeWorkspaceIndex];
  const { layout, tiles, focusedTileId } = workspace;

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

  const handleOpenFolder = useCallback(async () => {
    const tileId = createTile('auto', 'agent');
    const project = await window.tile.openProject(tileId);
    if (project) {
      setTileProject(tileId, project);
    }
  }, [createTile, setTileProject]);

  const handleSelectRecent = useCallback(async (path: string) => {
    const tileId = createTile('auto', 'agent');
    const project = await window.tile.openProject(tileId, path);
    if (project) {
      setTileProject(tileId, project);
    }
  }, [createTile, setTileProject]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey;

    // Workspace switching: Cmd+1-5
    if (isMod && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '5') {
      e.preventDefault();
      switchWorkspace(parseInt(e.key, 10) - 1);
      return;
    }

    // Workspace switching: Opt+Cmd+Arrow
    if (isMod && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      switchWorkspaceRelative(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }

    // New terminal tile: Cmd+Shift+T
    if (isMod && e.shiftKey && e.key === 't') {
      e.preventDefault();
      createTile('auto', 'terminal');
      return;
    }

    // New agent tile: Cmd+T
    if (isMod && e.key === 't') {
      e.preventDefault();
      createTile('auto', 'agent');
      return;
    }

    // Close tile: Cmd+W
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

    // Navigate tiles: Cmd+Arrow
    if (isMod && !e.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const dir = e.key.replace('Arrow', '').toLowerCase() as 'left' | 'right' | 'up' | 'down';
      navigateTile(dir);
      return;
    }

    // Cancel streaming: Escape
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
  }, [focusedTileId, tiles, sessions, createTile, closeTile, navigateTile, switchWorkspace, switchWorkspaceRelative]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const isEmpty = !layout || Object.keys(tiles).length === 0;

  return (
    <div className="flex flex-col h-screen bg-[#1a2332] text-gray-100">
      <WorkspaceBar />
      <div className="flex-1 min-h-0">
        {isEmpty ? (
          <FolderSelectScreen
            onOpenFolder={handleOpenFolder}
            onSelectRecent={handleSelectRecent}
            recentProjects={recentProjects}
          />
        ) : (
          <TilingLayout node={layout} />
        )}
      </div>
    </div>
  );
}

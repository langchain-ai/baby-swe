import { useCallback, useEffect } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { TilingLayout } from './components/TilingLayout';
import { WorkspaceBar } from './components/WorkspaceBar';
import { StatusBar } from './components/StatusBar';
import { FolderSelectScreen } from './components';
import { ApiKeysScreen } from './components/ApiKeysScreen';

export function App() {
  const workspaces = useStore(state => state.workspaces);
  const activeWorkspaceIndex = useStore(state => state.activeWorkspaceIndex);
  const recentProjects = useStore(state => state.recentProjects);
  const showApiKeysScreen = useStore(state => state.showApiKeysScreen);
  const apiKeys = useStore(state => state.apiKeys);

  // Actions are stable references in Zustand - grouping them avoids individual subscriptions
  const actions = useStore(useShallow(state => ({
    createTile: state.createTile,
    closeTile: state.closeTile,
    navigateTile: state.navigateTile,
    setTileProject: state.setTileProject,
    switchWorkspace: state.switchWorkspace,
    switchWorkspaceRelative: state.switchWorkspaceRelative,
    loadRecentProjects: state.loadRecentProjects,
    appendStreamToken: state.appendStreamToken,
    addToolStart: state.addToolStart,
    updateToolEnd: state.updateToolEnd,
    updateToolStatus: state.updateToolStatus,
    updateTokenUsage: state.updateTokenUsage,
    compactSession: state.compactSession,
    setCompacting: state.setCompacting,
    updateTodos: state.updateTodos,
    finalizeStream: state.finalizeStream,
    abortStream: state.abortStream,
    loadApiKeys: state.loadApiKeys,
    saveApiKeys: state.saveApiKeys,
    setShowApiKeysScreen: state.setShowApiKeysScreen,
    loadModelConfig: state.loadModelConfig,
  })));
  const {
    createTile, closeTile, navigateTile, setTileProject,
    switchWorkspace, switchWorkspaceRelative, loadRecentProjects,
    appendStreamToken, addToolStart, updateToolEnd, updateToolStatus,
    updateTokenUsage, compactSession, setCompacting, updateTodos, finalizeStream, abortStream,
    loadApiKeys, saveApiKeys, setShowApiKeysScreen, loadModelConfig,
  } = actions;

  const workspace = workspaces[activeWorkspaceIndex];
  const { layout, tiles, focusedTileId } = workspace;

  useEffect(() => {
    loadRecentProjects();
    loadApiKeys();
    loadModelConfig();
  }, [loadRecentProjects, loadApiKeys, loadModelConfig]);

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
        case 'tool-start': {
          addToolStart(event.sessionId, event.toolCallId, event.toolName, event.toolArgs, event.approvalRequestId, event.diffData);

          if (event.approvalRequestId) {
            const currentSession = useStore.getState().sessions[event.sessionId];
            if (currentSession?.autoApproveSession) {
              window.agent.respondToApproval({ requestId: event.approvalRequestId, decision: 'approve' });
            }
          }
          break;
        }
        case 'tool-end': {
          updateToolEnd(event.sessionId, event.toolCallId, event.output, event.error, event.elapsedMs);
          break;
        }
        case 'tool-status-update': {
          updateToolStatus(event.sessionId, event.toolCallId, event.status);
          break;
        }
        case 'token-usage':
          updateTokenUsage(event.inputTokens, event.outputTokens);
          break;
        case 'todo-update':
          updateTodos(event.sessionId, event.todos);
          break;
        case 'compact':
          console.log(`[compact] Compacting session ${event.sessionId}`);
          compactSession(event.sessionId, event.summary, event.keptMessages);
          break;
        case 'compact-start':
          setCompacting(event.sessionId, true);
          break;
        case 'compact-end':
          setCompacting(event.sessionId, false);
          break;
        case 'done': {
          finalizeStream(event.sessionId);
          break;
        }
        case 'error': {
          abortStream(event.sessionId, event.error);
          break;
        }
      }
    });
    return unsubscribe;
  }, [appendStreamToken, addToolStart, updateToolEnd, updateToolStatus, updateTokenUsage, compactSession, setCompacting, updateTodos, finalizeStream, abortStream]);

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

    // New source control tile: Cmd+Shift+G
    if (isMod && e.shiftKey && (e.key === 'g' || e.key === 'G')) {
      e.preventDefault();
      const state = useStore.getState();
      const ws = state.workspaces[state.activeWorkspaceIndex];
      const focusedProject = ws?.focusedTileId ? ws.tiles[ws.focusedTileId]?.project : null;
      const newTileId = createTile('auto', 'source-control');
      if (focusedProject?.path) {
        if (focusedProject.worktreePath) {
          window.tile.openWorktree(newTileId, focusedProject.path, focusedProject.worktreePath);
        } else {
          window.tile.openProject(newTileId, focusedProject.path);
        }
      }
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
      const state = useStore.getState();
      const ws = state.workspaces[state.activeWorkspaceIndex];
      const focusedProject = ws?.focusedTileId ? ws.tiles[ws.focusedTileId]?.project : null;
      const newTileId = createTile('auto', 'agent');
      if (focusedProject?.path) {
        if (focusedProject.worktreePath) {
          // Inherit worktree context
          window.tile.openWorktree(newTileId, focusedProject.path, focusedProject.worktreePath);
        } else {
          window.tile.openProject(newTileId, focusedProject.path);
        }
      }
      return;
    }

    // Close tile: Cmd+W
    if (isMod && e.key === 'w') {
      e.preventDefault();
      const state = useStore.getState();
      const ws = state.workspaces[state.activeWorkspaceIndex];
      const fTileId = ws?.focusedTileId;
      if (fTileId) {
        const tile = ws.tiles[fTileId];
        if (tile) {
          window.agent.cancel(tile.sessionId);
        }
        window.tile.closeProject(fTileId);
        closeTile(fTileId);
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
    if (e.key === 'Escape') {
      // Read fresh state at event time
      const state = useStore.getState();
      const ws = state.workspaces[state.activeWorkspaceIndex];
      const fTileId = ws?.focusedTileId;
      if (fTileId) {
        const tile = ws.tiles[fTileId];
        if (tile) {
          const session = state.sessions[tile.sessionId];
          if (session?.isStreaming || session?.busy) {
            e.preventDefault();
            window.agent.cancel(session.id);
            abortStream(session.id);
          }
        }
      }
      return;
    }
  }, [createTile, closeTile, navigateTile, switchWorkspace, switchWorkspaceRelative, abortStream]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const isEmpty = !layout || Object.keys(tiles).length === 0;

  const focusedTile = focusedTileId ? tiles[focusedTileId] : null;
  const project = focusedTile?.project;

  const needsApiKeys = apiKeys === null || (!apiKeys.anthropic && !apiKeys.openai && !apiKeys.baseten);
  const shouldShowApiKeysScreen = showApiKeysScreen || (needsApiKeys && isEmpty);

  const handleSaveApiKeys = useCallback(async (keys: Parameters<typeof saveApiKeys>[0]) => {
    await saveApiKeys(keys);
  }, [saveApiKeys]);

  const handleCancelApiKeys = useCallback(() => {
    setShowApiKeysScreen(false);
  }, [setShowApiKeysScreen]);

  if (shouldShowApiKeysScreen) {
    return (
      <div className="flex flex-col h-screen bg-[#1a2332] text-gray-100">
        <WorkspaceBar />
        <div className="flex-1 min-h-0">
          <ApiKeysScreen
            initialKeys={apiKeys}
            onSave={handleSaveApiKeys}
            onCancel={!needsApiKeys ? handleCancelApiKeys : undefined}
            isStartup={needsApiKeys && isEmpty}
          />
        </div>
        <StatusBar />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#1a2332] text-gray-100">
      <WorkspaceBar />
      <div className="flex-1 min-h-0">
        {isEmpty && (
          <FolderSelectScreen
            onOpenFolder={handleOpenFolder}
            onSelectRecent={handleSelectRecent}
            recentProjects={recentProjects}
          />
        )}
        {workspaces.map((ws, idx) => {
          if (!ws.layout || Object.keys(ws.tiles).length === 0) return null;
          const isActive = idx === activeWorkspaceIndex;
          return (
            <div key={ws.id} className={isActive ? 'h-full w-full' : 'hidden'}>
              <TilingLayout node={ws.layout} workspaceIndex={idx} />
            </div>
          );
        })}
      </div>
      <StatusBar />
    </div>
  );
}

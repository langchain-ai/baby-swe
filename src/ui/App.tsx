import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { TilingLayout } from './components/TilingLayout';
import { WorkspaceBar } from './components/WorkspaceBar';
import { StatusBar } from './components/StatusBar';
import { FolderSelectScreen } from './components';
import { ApiKeysScreen } from './components/ApiKeysScreen';

function normalizeTerminalNewlines(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}

function truncateTerminalOutput(text: string, maxChars = 12000): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[output truncated: ${text.length - maxChars} chars omitted]`;
}

export function App() {
  const workspaces = useStore(state => state.workspaces);
  const activeWorkspaceIndex = useStore(state => state.activeWorkspaceIndex);
  const recentProjects = useStore(state => state.recentProjects);
  const showApiKeysScreen = useStore(state => state.showApiKeysScreen);
  const apiKeys = useStore(state => state.apiKeys);
  const executeTerminalBySessionRef = useRef(new Map<string, string>());
  const executeTerminalByToolCallRef = useRef(new Map<string, string>());
  const executeTerminalActiveCountRef = useRef(new Map<string, number>());

  // Actions are stable references in Zustand - grouping them avoids individual subscriptions
  const actions = useStore(useShallow(state => ({
    createTile: state.createTile,
    closeTile: state.closeTile,
    focusTile: state.focusTile,
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
    createTile, closeTile, focusTile, navigateTile, setTileProject,
    switchWorkspace, switchWorkspaceRelative, loadRecentProjects,
    appendStreamToken, addToolStart, updateToolEnd, updateToolStatus,
    updateTokenUsage, compactSession, setCompacting, updateTodos, finalizeStream, abortStream,
    loadApiKeys, saveApiKeys, setShowApiKeysScreen, loadModelConfig,
  } = actions;

  const workspace = workspaces[activeWorkspaceIndex];
  const { layout, tiles, focusedTileId } = workspace;

  const findTileBySessionId = useCallback((sessionId: string) => {
    const state = useStore.getState();
    for (const ws of state.workspaces) {
      for (const tile of Object.values(ws.tiles)) {
        if (tile.sessionId === sessionId) {
          return { tile, workspace: ws };
        }
      }
    }
    return null;
  }, []);

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

          if (event.toolName === 'execute' && !event.approvalRequestId) {
            const command = typeof event.toolArgs?.command === 'string' ? event.toolArgs.command : '';
            if (command) {
              const located = findTileBySessionId(event.sessionId);
              const sourceTileId = located?.tile.id;
              let terminalTileId = executeTerminalBySessionRef.current.get(event.sessionId);
              const state = useStore.getState();
              const terminalTileExists = terminalTileId
                ? state.workspaces.some((ws) => Boolean(ws.tiles[terminalTileId!]))
                : false;

              if (!terminalTileId || !terminalTileExists) {
                terminalTileId = createTile('auto', 'terminal');
                executeTerminalBySessionRef.current.set(event.sessionId, terminalTileId);
                if (located?.tile.project) {
                  setTileProject(terminalTileId, located.tile.project);
                }
                if (sourceTileId) {
                  focusTile(sourceTileId);
                }
              }

              executeTerminalByToolCallRef.current.set(event.toolCallId, terminalTileId);
              const activeCount = executeTerminalActiveCountRef.current.get(terminalTileId) || 0;
              executeTerminalActiveCountRef.current.set(terminalTileId, activeCount + 1);

              const cwd = located?.tile.project?.worktreePath || located?.tile.project?.path || '~';
              window.setTimeout(() => {
                window.terminal.write(
                  terminalTileId,
                  normalizeTerminalNewlines(`\n[agent execute] cwd: ${cwd}\n$ ${command}\n`),
                );
              }, 50);
            }
          }

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

          const terminalTileId = executeTerminalByToolCallRef.current.get(event.toolCallId);
          if (terminalTileId) {
            const statusLine = event.error
              ? `[agent execute] failed (${event.elapsedMs}ms)`
              : `[agent execute] completed (${event.elapsedMs}ms)`;
            const output = truncateTerminalOutput(event.output || '');
            const text = output ? `${output}\n${statusLine}\n` : `${statusLine}\n`;

            const currentCount = executeTerminalActiveCountRef.current.get(terminalTileId) || 0;
            const nextCount = Math.max(0, currentCount - 1);
            if (nextCount === 0) {
              executeTerminalActiveCountRef.current.delete(terminalTileId);
            } else {
              executeTerminalActiveCountRef.current.set(terminalTileId, nextCount);
            }

            window.setTimeout(() => {
              window.terminal.write(terminalTileId, normalizeTerminalNewlines(text));
              if (nextCount === 0) {
                closeTile(terminalTileId);
                executeTerminalBySessionRef.current.forEach((tileId, sessionId) => {
                  if (tileId === terminalTileId) {
                    executeTerminalBySessionRef.current.delete(sessionId);
                  }
                });
              }
            }, 50);
            executeTerminalByToolCallRef.current.delete(event.toolCallId);
          }
          break;
        }
        case 'tool-status-update': {
          updateToolStatus(event.sessionId, event.toolCallId, event.status);

          if (event.status === 'running') {
            const storeState = useStore.getState();
            const session = storeState.sessions[event.sessionId];
            if (session) {
              for (const msg of session.messages) {
                const chunk = msg.chunks.find(
                  (c) => c.kind === 'tool-execution' && c.toolCallId === event.toolCallId && c.toolName === 'execute',
                );
                if (chunk && chunk.kind === 'tool-execution') {
                  const command = typeof chunk.toolArgs?.command === 'string' ? chunk.toolArgs.command : '';
                  if (command) {
                    const located = findTileBySessionId(event.sessionId);
                    const sourceTileId = located?.tile.id;
                    let terminalTileId = executeTerminalBySessionRef.current.get(event.sessionId);
                    const terminalTileExists = terminalTileId
                      ? storeState.workspaces.some((ws) => Boolean(ws.tiles[terminalTileId!]))
                      : false;

                    if (!terminalTileId || !terminalTileExists) {
                      terminalTileId = createTile('auto', 'terminal');
                      executeTerminalBySessionRef.current.set(event.sessionId, terminalTileId);
                      if (located?.tile.project) {
                        setTileProject(terminalTileId, located.tile.project);
                      }
                      if (sourceTileId) {
                        focusTile(sourceTileId);
                      }
                    }

                    executeTerminalByToolCallRef.current.set(event.toolCallId, terminalTileId);
                    const activeCount = executeTerminalActiveCountRef.current.get(terminalTileId) || 0;
                    executeTerminalActiveCountRef.current.set(terminalTileId, activeCount + 1);

                    const cwd = located?.tile.project?.worktreePath || located?.tile.project?.path || '~';
                    window.setTimeout(() => {
                      window.terminal.write(
                        terminalTileId,
                        normalizeTerminalNewlines(`\n[agent execute] cwd: ${cwd}\n$ ${command}\n`),
                      );
                    }, 50);
                  }
                  break;
                }
              }
            }
          }
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
          const terminalTileId = executeTerminalBySessionRef.current.get(event.sessionId);
          if (terminalTileId) {
            executeTerminalActiveCountRef.current.delete(terminalTileId);
            closeTile(terminalTileId);
          }
          executeTerminalBySessionRef.current.delete(event.sessionId);
          break;
        }
        case 'error': {
          abortStream(event.sessionId, event.error);
          const terminalTileId = executeTerminalBySessionRef.current.get(event.sessionId);
          if (terminalTileId) {
            executeTerminalActiveCountRef.current.delete(terminalTileId);
            closeTile(terminalTileId);
          }
          executeTerminalBySessionRef.current.delete(event.sessionId);
          break;
        }
      }
    });
    return unsubscribe;
  }, [appendStreamToken, addToolStart, updateToolEnd, updateToolStatus, updateTokenUsage, compactSession, setCompacting, updateTodos, finalizeStream, abortStream, findTileBySessionId, createTile, closeTile, setTileProject, focusTile]);

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

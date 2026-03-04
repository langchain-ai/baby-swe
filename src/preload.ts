import { contextBridge, ipcRenderer } from 'electron';
import type { StreamEvent, ApprovalResponse, ChatMessage, ModelConfig, Mode } from './types';

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  app: () => ipcRenderer.invoke('app:getVersion'),
});

contextBridge.exposeInMainWorld('agent', {
  invoke: (message: string) => ipcRenderer.invoke('agent:invoke', message),
  stream: (sessionId: string, tileId: string, messages: ChatMessage[], modelConfig: ModelConfig, mode: Mode) => {
    ipcRenderer.send('agent:stream', sessionId, tileId, messages, modelConfig, mode);
  },
  cancel: (sessionId: string) => {
    ipcRenderer.send('agent:cancel', sessionId);
  },
  compact: (sessionId: string, messages: ChatMessage[], modelConfig: ModelConfig) => {
    ipcRenderer.send('agent:compact', sessionId, messages, modelConfig);
  },
  onStreamEvent: (callback: (event: StreamEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, streamEvent: StreamEvent) => {
      callback(streamEvent);
    };
    ipcRenderer.on('agent:stream-event', handler);
    return () => ipcRenderer.removeListener('agent:stream-event', handler);
  },
  respondToApproval: (response: ApprovalResponse) => {
    ipcRenderer.send('agent:approval-response', response);
  },
  setMode: (sessionId: string, mode: Mode) => {
    ipcRenderer.send('agent:set-mode', sessionId, mode);
  },
});

contextBridge.exposeInMainWorld('storage', {
  getSettings: () => ipcRenderer.invoke('storage:getSettings'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('storage:saveSettings', settings),
  getRecentProjects: () => ipcRenderer.invoke('storage:getRecentProjects'),
  loadThreadsForProject: (projectId: string) => ipcRenderer.invoke('storage:loadThreadsForProject', projectId),
  saveThread: (projectId: string, thread: unknown) => ipcRenderer.invoke('storage:saveThread', projectId, thread),
  deleteThread: (projectId: string, threadId: string) => ipcRenderer.invoke('storage:deleteThread', projectId, threadId),
});

contextBridge.exposeInMainWorld('tile', {
  openProject: (tileId: string, folderPath?: string) =>
    ipcRenderer.invoke('tile:openProject', tileId, folderPath),
  openWorktree: (tileId: string, mainProjectPath: string, worktreePath: string) =>
    ipcRenderer.invoke('tile:openWorktree', tileId, mainProjectPath, worktreePath),
  closeProject: (tileId: string) =>
    ipcRenderer.invoke('tile:closeProject', tileId),
  onProjectChanged: (callback: (tileId: string, project: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, tileId: string, project: unknown) =>
      callback(tileId, project);
    ipcRenderer.on('tile:projectChanged', handler);
    return () => ipcRenderer.removeListener('tile:projectChanged', handler);
  },
});

contextBridge.exposeInMainWorld('fs', {
  listFiles: (projectPath?: string) => ipcRenderer.invoke('fs:listFiles', projectPath),
});

contextBridge.exposeInMainWorld('terminal', {
  create: (id: string, cwd?: string) => ipcRenderer.send('terminal:create', id, cwd),
  write: (id: string, data: string) => ipcRenderer.send('terminal:write', id, data),
  resize: (id: string, cols: number, rows: number) => ipcRenderer.send('terminal:resize', id, cols, rows),
  destroy: (id: string) => ipcRenderer.send('terminal:destroy', id),
  onData: (callback: (id: string, data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string, data: string) => callback(id, data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },
});

contextBridge.exposeInMainWorld('git', {
  listBranches: (projectPath: string) => ipcRenderer.invoke('git:listBranches', projectPath),
  switchBranch: (projectPath: string, branchName: string) =>
    ipcRenderer.invoke('git:switchBranch', projectPath, branchName),
  handoffToWorktree: (projectPath: string, branchName: string) =>
    ipcRenderer.invoke('git:handoffToWorktree', projectPath, branchName),
  createBranch: (projectPath: string, branchName: string) =>
    ipcRenderer.invoke('git:createBranch', projectPath, branchName),
  getPR: (projectPath: string) => ipcRenderer.invoke('git:getPR', projectPath),
  diffFile: (projectPath: string, filePath: string, staged: boolean) =>
    ipcRenderer.invoke('git:diffFile', projectPath, filePath, staged),
  status: (projectPath: string) =>
    ipcRenderer.invoke('git:status', projectPath),
  stageFile: (projectPath: string, filePath: string) =>
    ipcRenderer.invoke('git:stageFile', projectPath, filePath),
  unstageFile: (projectPath: string, filePath: string) =>
    ipcRenderer.invoke('git:unstageFile', projectPath, filePath),
  discardFile: (projectPath: string, filePath: string, isUntracked: boolean) =>
    ipcRenderer.invoke('git:discardFile', projectPath, filePath, isUntracked),
  stageAll: (projectPath: string) =>
    ipcRenderer.invoke('git:stageAll', projectPath),
  unstageAll: (projectPath: string) =>
    ipcRenderer.invoke('git:unstageAll', projectPath),
  discardAll: (projectPath: string) =>
    ipcRenderer.invoke('git:discardAll', projectPath),
  commit: (projectPath: string, message: string) =>
    ipcRenderer.invoke('git:commit', projectPath, message),
  push: (projectPath: string) =>
    ipcRenderer.invoke('git:push', projectPath),
  pull: (projectPath: string) =>
    ipcRenderer.invoke('git:pull', projectPath),
  syncStatus: (projectPath: string) =>
    ipcRenderer.invoke('git:syncStatus', projectPath),
  listWorktrees: (projectPath: string) =>
    ipcRenderer.invoke('git:listWorktrees', projectPath),
  addWorktree: (projectPath: string, branch: string, newBranch?: boolean) =>
    ipcRenderer.invoke('git:addWorktree', projectPath, branch, newBranch),
  removeWorktree: (projectPath: string, worktreePath: string) =>
    ipcRenderer.invoke('git:removeWorktree', projectPath, worktreePath),
});

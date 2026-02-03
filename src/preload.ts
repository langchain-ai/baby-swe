import { contextBridge, ipcRenderer } from 'electron';
import type { StreamEvent, ApprovalResponse, ChatMessage } from './types';

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
});

contextBridge.exposeInMainWorld('agent', {
  invoke: (message: string) => ipcRenderer.invoke('agent:invoke', message),
  stream: (sessionId: string, tileId: string, messages: ChatMessage[]) => {
    ipcRenderer.send('agent:stream', sessionId, tileId, messages);
  },
  cancel: (sessionId: string) => {
    ipcRenderer.send('agent:cancel', sessionId);
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
});

contextBridge.exposeInMainWorld('storage', {
  getSettings: () => ipcRenderer.invoke('storage:getSettings'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('storage:saveSettings', settings),
  getRecentProjects: () => ipcRenderer.invoke('storage:getRecentProjects'),
});

contextBridge.exposeInMainWorld('tile', {
  openProject: (tileId: string, folderPath?: string) =>
    ipcRenderer.invoke('tile:openProject', tileId, folderPath),
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
  createBranch: (projectPath: string, branchName: string) =>
    ipcRenderer.invoke('git:createBranch', projectPath, branchName),
});

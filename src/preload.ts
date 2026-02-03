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

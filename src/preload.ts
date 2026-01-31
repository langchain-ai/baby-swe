import { contextBridge, ipcRenderer } from 'electron';
import type { StreamEvent } from './types';

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
});

contextBridge.exposeInMainWorld('agent', {
  invoke: (message: string) => ipcRenderer.invoke('agent:invoke', message),
  stream: (sessionId: string, message: string) => {
    ipcRenderer.send('agent:stream', sessionId, message);
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
});

contextBridge.exposeInMainWorld('storage', {
  getSettings: () => ipcRenderer.invoke('storage:getSettings'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('storage:saveSettings', settings),
  getRecentProjects: () => ipcRenderer.invoke('storage:getRecentProjects'),
  openProject: (folderPath?: string) => ipcRenderer.invoke('storage:openProject', folderPath),
  closeProject: () => ipcRenderer.invoke('storage:closeProject'),
  onProjectChanged: (callback: (project: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, project: unknown) => callback(project);
    ipcRenderer.on('project:changed', handler);
    return () => ipcRenderer.removeListener('project:changed', handler);
  },
  getThreads: () => ipcRenderer.invoke('storage:getThreads'),
  saveThread: (thread: unknown) => ipcRenderer.invoke('storage:saveThread', thread),
  deleteThread: (threadId: string) => ipcRenderer.invoke('storage:deleteThread', threadId),
});

contextBridge.exposeInMainWorld('fs', {
  listFiles: () => ipcRenderer.invoke('fs:listFiles'),
});

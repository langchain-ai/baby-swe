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

contextBridge.exposeInMainWorld('folder', {
  select: () => ipcRenderer.invoke('folder:select'),
  get: () => ipcRenderer.invoke('folder:get'),
  readData: (filename: string) => ipcRenderer.invoke('folder:readData', filename),
  writeData: (filename: string, data: string) => ipcRenderer.invoke('folder:writeData', filename, data),
  onChanged: (callback: (folder: string | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, folder: string | null) => callback(folder);
    ipcRenderer.on('folder:changed', handler);
    return () => ipcRenderer.removeListener('folder:changed', handler);
  },
});

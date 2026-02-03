import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import * as path from 'path';
import { execSync } from 'child_process';
import * as fs from 'fs';
import { setupAgentIPC } from './agent';
import * as storage from './storage';
import type { Project } from './types';

const MAX_FALLBACK_FILES = 1000;
const FALLBACK_PATTERNS = ['*', '*/*', '*/*/*', '*/*/*/*'];
const IGNORE_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'build', 'dist', '.next', '.cache']);

function listProjectFiles(projectPath: string): string[] {
  try {
    const result = execSync('git ls-files', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
    });
    const files = result.trim().split('\n').filter(Boolean);
    return files;
  } catch {
    return listFilesWithGlob(projectPath);
  }
}

function listFilesWithGlob(projectPath: string): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  function walkDir(dir: string, depth: number, maxDepth: number): void {
    if (depth > maxDepth || files.length >= MAX_FALLBACK_FILES) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= MAX_FALLBACK_FILES) return;
        if (entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(projectPath, fullPath);

        if (entry.isFile()) {
          if (!seen.has(relativePath)) {
            seen.add(relativePath);
            files.push(relativePath);
          }
        } else if (entry.isDirectory()) {
          walkDir(fullPath, depth + 1, maxDepth);
        }
      }
    } catch {}
  }

  walkDir(projectPath, 0, 4);
  return files;
}

let mainWindow: BrowserWindow | null = null;
const tileProjects = new Map<string, Project | null>();

function updateWindowTitle(): void {
  if (!mainWindow) return;
  mainWindow.setTitle('Baby SWE');
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function setupStorageIPC(): void {
  ipcMain.handle('storage:getSettings', () => storage.loadSettings());

  ipcMain.handle('storage:saveSettings', (_event, settings) => {
    storage.saveSettings(settings);
  });

  ipcMain.handle('storage:getRecentProjects', () => storage.getRecentProjects());

  ipcMain.handle('tile:openProject', async (_event, tileId: string, folderPath?: string) => {
    if (!folderPath) {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      folderPath = result.filePaths[0];
    }

    const project = storage.getOrCreateProject(folderPath);
    storage.migrateFromFolderStorage(project);
    tileProjects.set(tileId, project);
    mainWindow?.webContents.send('tile:projectChanged', tileId, project);
    return project;
  });

  ipcMain.handle('tile:closeProject', (_event, tileId: string) => {
    tileProjects.delete(tileId);
    mainWindow?.webContents.send('tile:projectChanged', tileId, null);
  });

  ipcMain.handle('fs:listFiles', (_event, projectPath?: string) => {
    if (!projectPath) return [];
    return listProjectFiles(projectPath);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 450,
    minHeight: 600,
    title: 'Baby SWE',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  storage.initStorage();
  createMenu();
  setupStorageIPC();
  createWindow();
  setupAgentIPC(mainWindow!, (tileId: string) => tileProjects.get(tileId)?.path || null);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

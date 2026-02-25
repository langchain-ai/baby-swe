import { webcrypto } from 'crypto';
if (!globalThis.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.crypto = webcrypto as any;
}

import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import * as path from 'path';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as pty from 'node-pty';
import { setupAgentIPC } from './agent';
import * as storage from './storage';
import type { Project, GithubPR } from './types';

const terminals = new Map<string, pty.IPty>();

const MAX_FALLBACK_FILES = 1000;
const FALLBACK_PATTERNS = ['*', '*/*', '*/*/*', '*/*/*/*'];
const IGNORE_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'build', 'dist', '.next', '.cache']);

function getGitBranch(projectPath: string): string | undefined {
  try {
    const result = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim() || undefined;
  } catch {
    return undefined;
  }
}

function getGithubPR(projectPath: string): GithubPR | null {
  try {
    const result = execSync(
      'gh pr view --json number,title,url,state,author,baseRefName,headRefName',
      {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 8000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    const data = JSON.parse(result.trim());
    return {
      number: data.number,
      title: data.title,
      url: data.url,
      state: data.state,
      author: data.author?.login ?? data.author ?? '',
      baseRef: data.baseRefName,
      headRef: data.headRefName,
    };
  } catch {
    return null;
  }
}

function listGitBranches(projectPath: string): { branches: string[]; current: string | null } {
  try {
    const result = execSync('git branch --no-color --sort=-committerdate', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = result.trim().split('\n').filter(Boolean);
    let current: string | null = null;
    const branches = lines.map((line) => {
      const isCurrent = line.startsWith('* ');
      const name = line.replace(/^\*?\s+/, '').trim();
      if (isCurrent) current = name;
      return name;
    });
    return { branches, current };
  } catch {
    return { branches: [], current: null };
  }
}

function switchGitBranch(projectPath: string, branchName: string): { success: boolean; error?: string } {
  try {
    execSync(`git checkout ${branchName}`, {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to switch branch' };
  }
}

function createGitBranch(projectPath: string, branchName: string): { success: boolean; error?: string } {
  try {
    execSync(`git checkout -b ${branchName}`, {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to create branch' };
  }
}

export interface GitStatusEntry {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'staged-modified' | 'staged-added' | 'staged-deleted' | 'staged-renamed';
  staged: boolean;
}

function getGitStatus(projectPath: string): GitStatusEntry[] {
  try {
    const result = execSync('git status --porcelain=v1', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = result.trim().split('\n').filter(Boolean);
    const entries: GitStatusEntry[] = [];

    for (const line of lines) {
      const index = line[0];   // staged status
      const worktree = line[1]; // working tree status
      const filePath = line.slice(3).trim();

      // Staged changes
      if (index === 'M') entries.push({ path: filePath, status: 'staged-modified', staged: true });
      else if (index === 'A') entries.push({ path: filePath, status: 'staged-added', staged: true });
      else if (index === 'D') entries.push({ path: filePath, status: 'staged-deleted', staged: true });
      else if (index === 'R') entries.push({ path: filePath, status: 'staged-renamed', staged: true });

      // Working tree changes
      if (worktree === 'M') entries.push({ path: filePath, status: 'modified', staged: false });
      else if (worktree === 'D') entries.push({ path: filePath, status: 'deleted', staged: false });
      else if (worktree === '?' && index === '?') entries.push({ path: filePath, status: 'untracked', staged: false });
    }

    return entries;
  } catch {
    return [];
  }
}

function getGitFileDiff(projectPath: string, filePath: string): { original: string; modified: string } | null {
  try {
    // Get the current file content (working tree)
    const absolutePath = filePath.startsWith('/') ? filePath : path.join(projectPath, filePath);
    const modified = fs.readFileSync(absolutePath, 'utf-8');

    // Get the HEAD version of the file
    const relativePath = filePath.startsWith('/') ? path.relative(projectPath, filePath) : filePath;
    let original = '';
    try {
      original = execSync(`git show HEAD:${relativePath}`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // File doesn't exist in HEAD (new file)
      original = '';
    }

    return { original, modified };
  } catch {
    return null;
  }
}

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

function getUserShellEnv(): Record<string, string> {
  const shell = process.env.SHELL || '/bin/zsh';
  try {
    const mark = require('crypto').randomBytes(8).toString('hex');
    const command = `echo '${mark}'; env; echo '${mark}'`;
    const result = execSync(`${shell} -l -c ${JSON.stringify(command)}`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Extract only the content between the two markers to strip shell noise
    const start = result.indexOf(mark);
    const end = result.lastIndexOf(mark);
    if (start === -1 || start === end) throw new Error('markers not found');
    const envBlock = result.slice(start + mark.length, end);
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    for (const line of envBlock.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        env[line.slice(0, idx)] = line.slice(idx + 1);
      }
    }
    return env;
  } catch {
    return process.env as Record<string, string>;
  }
}

const userShellEnv = getUserShellEnv();

function setupTerminalIPC(): void {
  ipcMain.on('terminal:create', (_event, id: string, cwd?: string) => {
    if (terminals.has(id)) return;

    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/zsh';
    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || process.env.HOME || '/',
      env: userShellEnv,
    });

    terminals.set(id, term);

    term.onData((data) => {
      mainWindow?.webContents.send('terminal:data', id, data);
    });

    term.onExit(() => {
      terminals.delete(id);
    });
  });

  ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    const term = terminals.get(id);
    if (term) {
      term.write(data);
    }
  });

  ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    const term = terminals.get(id);
    if (term) {
      term.resize(cols, rows);
    }
  });

  ipcMain.on('terminal:destroy', (_event, id: string) => {
    const term = terminals.get(id);
    if (term) {
      term.kill();
      terminals.delete(id);
    }
  });
}

function setupAppIPC(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion());
}

function setupStorageIPC(): void {
  ipcMain.handle('storage:getSettings', () => storage.loadSettings());

  ipcMain.handle('storage:saveSettings', (_event, settings) => {
    storage.saveSettings(settings);
  });

  ipcMain.handle('storage:getRecentProjects', () => storage.getRecentProjects());

  ipcMain.handle('storage:loadThreadsForProject', (_event, projectId: string) => {
    return storage.loadThreadsForProject(projectId);
  });

  ipcMain.handle('storage:saveThread', (_event, projectId: string, thread: any) => {
    storage.saveThread(projectId, thread);
  });

  ipcMain.handle('storage:deleteThread', (_event, projectId: string, threadId: string) => {
    storage.deleteThread(projectId, threadId);
  });

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
    const gitBranch = getGitBranch(folderPath);
    const githubPR = getGithubPR(folderPath);
    const projectWithBranch = { ...project, gitBranch, githubPR };
    tileProjects.set(tileId, projectWithBranch);
    mainWindow?.webContents.send('tile:projectChanged', tileId, projectWithBranch);
    return projectWithBranch;
  });

  ipcMain.handle('tile:closeProject', (_event, tileId: string) => {
    tileProjects.delete(tileId);
    mainWindow?.webContents.send('tile:projectChanged', tileId, null);
  });

  ipcMain.handle('fs:listFiles', (_event, projectPath?: string) => {
    if (!projectPath) return [];
    return listProjectFiles(projectPath);
  });

  ipcMain.handle('git:listBranches', (_event, projectPath: string) => {
    return listGitBranches(projectPath);
  });

  ipcMain.handle('git:switchBranch', (_event, projectPath: string, branchName: string) => {
    const result = switchGitBranch(projectPath, branchName);
    if (result.success) {
      for (const [tileId, project] of tileProjects.entries()) {
        if (project?.path === projectPath) {
          const updatedProject = { ...project, gitBranch: branchName };
          tileProjects.set(tileId, updatedProject);
          mainWindow?.webContents.send('tile:projectChanged', tileId, updatedProject);
        }
      }
    }
    return result;
  });

  ipcMain.handle('git:getPR', (_event, projectPath: string) => {
    return getGithubPR(projectPath);
  });

  ipcMain.handle('git:createBranch', (_event, projectPath: string, branchName: string) => {
    const result = createGitBranch(projectPath, branchName);
    if (result.success) {
      for (const [tileId, project] of tileProjects.entries()) {
        if (project?.path === projectPath) {
          const updatedProject = { ...project, gitBranch: branchName };
          tileProjects.set(tileId, updatedProject);
          mainWindow?.webContents.send('tile:projectChanged', tileId, updatedProject);
        }
      }
    }
    return result;
  });

  ipcMain.handle('git:diffFile', (_event, projectPath: string, filePath: string) => {
    return getGitFileDiff(projectPath, filePath);
  });

  ipcMain.handle('git:status', (_event, projectPath: string) => {
    return getGitStatus(projectPath);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 450,
    minHeight: 600,
    title: 'Baby SWE',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#1a2332',
    icon: path.join(__dirname, 'assets', 'icon.icns'),
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
  setupAppIPC();
  setupStorageIPC();
  setupTerminalIPC();
  createWindow();
  setupAgentIPC(
    mainWindow!,
    (tileId: string) => tileProjects.get(tileId)?.path || null,
    (tileId: string) => tileProjects.get(tileId) || null,
  );

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

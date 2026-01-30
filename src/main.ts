import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupAgentIPC } from './agent';

let mainWindow: BrowserWindow | null = null;
let currentFolder: string | null = null;

function updateWindowTitle(): void {
  if (!mainWindow) return;
  const folderName = currentFolder ? path.basename(currentFolder) : null;
  mainWindow.setTitle(folderName ? `Baby SWE - ${folderName}` : 'Baby SWE');
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow!, {
              properties: ['openDirectory'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              currentFolder = result.filePaths[0];
              updateWindowTitle();
              mainWindow?.webContents.send('folder:changed', currentFolder);
            }
          },
        },
        {
          label: 'Close Folder',
          click: () => {
            currentFolder = null;
            updateWindowTitle();
            mainWindow?.webContents.send('folder:changed', null);
          },
        },
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

function setupFolderIPC(): void {
  ipcMain.handle('folder:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      currentFolder = result.filePaths[0];
      updateWindowTitle();
      return currentFolder;
    }
    return null;
  });

  ipcMain.handle('folder:get', () => currentFolder);

  ipcMain.handle('folder:readData', (_event, filename: string) => {
    if (!currentFolder) return null;
    const dataDir = path.join(currentFolder, '.baby-swe');
    const filePath = path.join(dataDir, filename);
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
    } catch (e) {
      console.error('Failed to read folder data:', e);
    }
    return null;
  });

  ipcMain.handle('folder:writeData', (_event, filename: string, data: string) => {
    if (!currentFolder) return false;
    const dataDir = path.join(currentFolder, '.baby-swe');
    const filePath = path.join(dataDir, filename);
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(filePath, data, 'utf-8');
      return true;
    } catch (e) {
      console.error('Failed to write folder data:', e);
      return false;
    }
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
  createMenu();
  setupFolderIPC();
  createWindow();
  setupAgentIPC(mainWindow!, () => currentFolder);

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

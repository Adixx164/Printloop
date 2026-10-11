/**
 * PrintLoop Operator Desktop - Main Process Entry
 * Windows-only operator console with printer communication
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { join, dirname } from 'path';
import { autoUpdater } from 'electron-updater';
import { createServer } from './socket/server';
import { initializeIpc } from './ipc/handlers';
import { PrinterManager } from './printer/PrinterManager';
import { DatabaseManager } from './db/DatabaseManager';

// In Electron's main process, __dirname is available globally
const dirnameFixed = __dirname;

let mainWindow: BrowserWindow | null = null;
let printerManager: PrinterManager | null = null;
let dbManager: DatabaseManager | null = null;
let socketServer: ReturnType<typeof createServer> | null = null;

// Disable GPU acceleration for Windows compatibility
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  // Initialize database
  dbManager = new DatabaseManager();
  await dbManager.initialize();
  
  // Initialize printer manager
  printerManager = new PrinterManager(dbManager);
  await printerManager.initialize();
  
  // Start Socket.io server for real-time sync
  socketServer = createServer();
  socketServer.listen(3456);
  console.log('[Socket.io] Server listening on port 3456');
  
  // Initialize IPC handlers
  initializeIpc(ipcMain, printerManager, dbManager, socketServer);
  
  // Create main window
  createMainWindow();
  
  // Setup auto-updater
  setupAutoUpdater();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  if (printerManager) await printerManager.shutdown();
  if (dbManager) await dbManager.close();
  if (socketServer) socketServer.close();
});

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    title: 'PrintLoop Operator Console',
    icon: join(dirnameFixed, '../../assets/icon.ico'),
    webPreferences: {
      preload: join(dirnameFixed, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false, // Show after ready-to-show
  });
  
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Load renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(dirnameFixed, '../renderer/dist/index.html'));
  }
  
  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function setupAutoUpdater(): void {
  autoUpdater.checkForUpdatesAndNotify();
  
  autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('update:available');
  });
  
  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update:downloaded');
  });
  
  ipcMain.handle('app:restart-and-install', () => {
    autoUpdater.quitAndInstall();
  });
}

// IPC for getting app info
ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:get-platform', () => process.platform);

// Export for testing
export { mainWindow, printerManager, dbManager, socketServer };
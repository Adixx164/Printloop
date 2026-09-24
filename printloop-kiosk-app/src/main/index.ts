import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { setupIpcHandlers } from './ipc';
import { startHeartbeat, stopHeartbeat } from './heartbeat';
import { logger } from '../utils/logger';

const __dirname = path.dirname(__filename);
const APP_ROOT = path.join(__dirname, '..');

const isDev = process.env.NODE_ENV === 'development';
const isWindows = process.platform === 'win32';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: !isDev,
    kiosk: !isDev,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    icon: path.join(__dirname, '../../public/icon.png'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  setupIpcHandlers();
  startHeartbeat();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopHeartbeat();
  if (!isWindows) app.quit();
});

app.on('before-quit', () => {
  stopHeartbeat();
});

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:get-platform', () => process.platform);

ipcMain.on('app:quit', () => {
  app.quit();
});

ipcMain.on('app:restart', () => {
  app.relaunch();
  app.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught exception');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});
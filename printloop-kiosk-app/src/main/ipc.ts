import { ipcMain, BrowserWindow } from 'electron';
import { logger } from '../utils/logger';
import { getSettings, setSetting, loadSettings, KioskSettings } from './settings';
import { fetchPrintJob, printJob } from './printJob';
import { listPrinters, testPrinter } from './ipp';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow) {
  mainWindow = window;
}

export function setupIpcHandlers() {
  ipcMain.handle('settings:get', async () => {
    return getSettings();
  });

  ipcMain.handle('settings:set', async (_event, key: keyof KioskSettings, value: unknown) => {
    await setSetting(key, String(value));
  });

  ipcMain.handle('print-job:fetch', async (_event, code: string) => {
    const settings = getSettings();
    if (!settings.apiUrl || !settings.apiKey) {
      throw new Error('Kiosk not configured');
    }
    return fetchPrintJob(settings.apiUrl, settings.apiKey, code);
  });

  ipcMain.handle('print-job:print', async (_event, jobId: string, artifactKey: string) => {
    const settings = getSettings();
    if (!settings.printerUri) {
      throw new Error('No printer configured');
    }
    return printJob(settings.printerUri, artifactKey);
  });

  ipcMain.handle('printer:list', async () => {
    return listPrinters();
  });

  ipcMain.handle('printer:test', async (_event, printerUri: string) => {
    return testPrinter(printerUri);
  });
}

export function emitKioskEvent(event: string, data: unknown) {
  if (mainWindow) {
    mainWindow.webContents.send('kiosk:event', event, data);
  }
}
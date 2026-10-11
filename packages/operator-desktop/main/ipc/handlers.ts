/**
 * IPC Handlers - Secure communication between main and renderer
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { PrinterManager } from '../printer/PrinterManager';
import { DatabaseManager } from '../db/DatabaseManager';
import { Server } from 'socket.io';

export function initializeIpc(
  ipcMain: any,
  printerManager: PrinterManager,
  dbManager: DatabaseManager,
  socketServer: ReturnType<any>
): void {
  
  // ========== App Info ==========
  ipcMain.handle('app:get-version', () => require('electron').app.getVersion());
  ipcMain.handle('app:get-platform', () => process.platform);
  
  // ========== Printers ==========
  ipcMain.handle('printers:discover', async () => {
    return await printerManager.discoverPrinters();
  });
  
  ipcMain.handle('printers:list', () => {
    return printerManager.getPrinters();
  });
  
  ipcMain.handle('printers:get', (_event: IpcMainInvokeEvent, id: string) => {
    return printerManager.getPrinter(id);
  });
  
  ipcMain.handle('printers:pair', async (_event: IpcMainInvokeEvent, config: any) => {
    return await printerManager.pairPrinter(config);
  });
  
  ipcMain.handle('printers:test-print', async (_event: IpcMainInvokeEvent, id: string) => {
    const printer = printerManager.getPrinter(id);
    if (!printer) throw new Error('Printer not found');
    return await printerManager.testPrint(printer);
  });
  
  ipcMain.handle('printers:print', async (_event: IpcMainInvokeEvent, id: string, job: any) => {
    const printer = printerManager.getPrinter(id);
    if (!printer) throw new Error('Printer not found');
    return await printerManager.print(printer, job);
  });
  
  ipcMain.handle('printers:set-default', (_event: IpcMainInvokeEvent, id: string) => {
    printerManager.setDefaultPrinter(id);
    return { success: true };
  });
  
  ipcMain.handle('printers:delete', (_event: IpcMainInvokeEvent, id: string) => {
    printerManager.deletePrinter(id);
    return { success: true };
  });
  
  // ========== Print Jobs ==========
  ipcMain.handle('jobs:cache', (_event: IpcMainInvokeEvent, jobs: any[]) => {
    dbManager.cachePrintJobs(jobs);
    return { success: true };
  });
  
  ipcMain.handle('jobs:get-cached', (_event: IpcMainInvokeEvent, tenantId: string) => {
    return dbManager.getCachedPrintJobs(tenantId);
  });
  
  ipcMain.handle('jobs:update-status', (_event: IpcMainInvokeEvent, jobId: string, status: string) => {
    dbManager.updatePrintJobStatus(jobId, status);
    return { success: true };
  });
  
  // ========== Offline Accept Queue ==========
  ipcMain.handle('offline-accept:queue', (_event: IpcMainInvokeEvent, jobId: string, action: 'accept' | 'reject') => {
    dbManager.queueOfflineAccept(jobId, action);
    return { success: true };
  });
  
  ipcMain.handle('offline-accept:get-pending', () => {
    return dbManager.getPendingOfflineAccepts();
  });
  
  ipcMain.handle('offline-accept:mark-synced', (_event: IpcMainInvokeEvent, id: string) => {
    dbManager.markOfflineAcceptSynced(id);
    return { success: true };
  });
  
  ipcMain.handle('offline-accept:increment-retry', (_event: IpcMainInvokeEvent, id: string) => {
    dbManager.incrementOfflineAcceptRetry(id);
    return { success: true };
  });
  
  // ========== Notifications ==========
  ipcMain.handle('notifications:save', (_event: IpcMainInvokeEvent, notification: any) => {
    dbManager.saveNotification(notification);
    return { success: true };
  });
  
  ipcMain.handle('notifications:get', (_event: IpcMainInvokeEvent, unreadOnly?: boolean) => {
    return dbManager.getNotifications(unreadOnly);
  });
  
  ipcMain.handle('notifications:mark-read', (_event: IpcMainInvokeEvent, id: string) => {
    dbManager.markNotificationRead(id);
    return { success: true };
  });
  
  // ========== Analytics Cache ==========
  ipcMain.handle('analytics:cache:set', (_event: IpcMainInvokeEvent, key: string, value: any) => {
    dbManager.setAnalyticsCache(key, value);
    return { success: true };
  });
  
  ipcMain.handle('analytics:cache:get', (_event: IpcMainInvokeEvent, key: string) => {
    return dbManager.getAnalyticsCache(key);
  });
  
  // ========== Socket.io Real-time ==========
  ipcMain.handle('socket:get-connection-info', () => {
    return {
      url: 'http://localhost:3456',
      path: '/socket.io',
    };
  });
  
  // Broadcast events from main to renderer
  socketServer.io.on('queue:updated', (data: any) => {
    BrowserWindow.getAllWindows().forEach((w: BrowserWindow) => 
      w.webContents.send('queue:updated', data)
    );
  });
  
  socketServer.io.on('job:new', (data: any) => {
    BrowserWindow.getAllWindows().forEach((w: BrowserWindow) => 
      w.webContents.send('job:new', data)
    );
  });
  
  socketServer.io.on('job:accepted', (data: any) => {
    BrowserWindow.getAllWindows().forEach((w: BrowserWindow) => 
      w.webContents.send('job:accepted', data)
    );
  });
  
  socketServer.io.on('job:rejected', (data: any) => {
    BrowserWindow.getAllWindows().forEach((w: BrowserWindow) => 
      w.webContents.send('job:rejected', data)
    );
  });
  
  socketServer.io.on('payout:updated', (data: any) => {
    BrowserWindow.getAllWindows().forEach((w: BrowserWindow) => 
      w.webContents.send('payout:updated', data)
    );
  });
  
  socketServer.io.on('message:new', (data: any) => {
    BrowserWindow.getAllWindows().forEach((w: BrowserWindow) => 
      w.webContents.send('message:new', data)
    );
  });
  
  socketServer.io.on('analytics:tick', (data: any) => {
    BrowserWindow.getAllWindows().forEach((w: BrowserWindow) => 
      w.webContents.send('analytics:tick', data)
    );
  });
  
  socketServer.io.on('peer:connected', (data: any) => {
    BrowserWindow.getAllWindows().forEach((w: BrowserWindow) => 
      w.webContents.send('peer:connected', data)
    );
  });
  
  socketServer.io.on('peer:disconnected', (data: any) => {
    BrowserWindow.getAllWindows().forEach((w: BrowserWindow) => 
      w.webContents.send('peer:disconnected', data)
    );
  });
  
  // ========== System ==========
  ipcMain.handle('system:open-external', (_event: IpcMainInvokeEvent, url: string) => {
    require('electron').shell.openExternal(url);
  });
  
  ipcMain.handle('system:show-item-in-folder', (_event: IpcMainInvokeEvent, path: string) => {
    require('electron').shell.showItemInFolder(path);
  });
  
  // ========== Window Controls ==========
  ipcMain.handle('window:minimize', (event: IpcMainInvokeEvent) => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });
  
  ipcMain.handle('window:maximize', (event: IpcMainInvokeEvent) => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  
  ipcMain.handle('window:close', (event: IpcMainInvokeEvent) => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });
  
  ipcMain.handle('window:is-maximized', (event: IpcMainInvokeEvent) => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() || false;
  });
  
  // ========== Auto Updater ==========
  ipcMain.handle('updater:check', async () => {
    const { autoUpdater } = require('electron-updater');
    return await autoUpdater.checkForUpdates();
  });
  
  ipcMain.handle('updater:install', () => {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.quitAndInstall();
  });
  
  // ========== File System ==========
  ipcMain.handle('fs:read-file', async (_event: IpcMainInvokeEvent, path: string) => {
    const fs = require('fs').promises;
    return await fs.readFile(path, 'utf-8');
  });
  
  ipcMain.handle('fs:write-file', async (_event: IpcMainInvokeEvent, path: string, content: string) => {
    const fs = require('fs').promises;
    await fs.writeFile(path, content, 'utf-8');
    return { success: true };
  });
  
  ipcMain.handle('fs:download', async (_event: IpcMainInvokeEvent, url: string, destPath: string) => {
    const fs = require('fs');
    const https = require('https');
    
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      https.get(url, (response: any) => {
        response.pipe(file);
        file.on('finish', () => file.close(() => resolve({ success: true })));
      }).on('error', (err: any) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
  });
}
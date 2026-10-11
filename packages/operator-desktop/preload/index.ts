/**
 * Preload Script - Secure bridge between main and renderer
 * Uses contextBridge for secure IPC
 */

import { contextBridge, ipcRenderer } from 'electron';

// Type definitions for the exposed API
interface PrinterConfig {
  id: string;
  name: string;
  type: 'usb' | 'ipp' | 'airprint';
  address: string;
  capabilities: {
    color: boolean;
    duplex: boolean;
    paperSizes: string[];
    maxDpi: number;
  };
  isDefault: boolean;
  isActive: boolean;
}

interface PrintJobData {
  pwgRasterUrl: string;
  copies: number;
  pageRange?: string;
  duplex: boolean;
  color: boolean;
  paperSize: string;
  dpi: number;
}

interface PrintResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

interface ElectronAPI {
  // App
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  
  // Printers
  discoverPrinters: () => Promise<PrinterConfig[]>;
  getPrinters: () => Promise<PrinterConfig[]>;
  getPrinter: (id: string) => Promise<PrinterConfig | null>;
  pairPrinter: (config: PrinterConfig) => Promise<void>;
  testPrint: (id: string) => Promise<{ success: boolean; error?: string }>;
  print: (id: string, job: PrintJobData) => Promise<PrintResult>;
  setDefaultPrinter: (id: string) => Promise<{ success: boolean }>;
  deletePrinter: (id: string) => Promise<{ success: boolean }>;
  
  // Print Jobs
  cacheJobs: (jobs: any[]) => Promise<{ success: boolean }>;
  getCachedJobs: (tenantId: string) => Promise<any[]>;
  updateJobStatus: (jobId: string, status: string) => Promise<{ success: boolean }>;
  
  // Offline Accept Queue
  queueOfflineAccept: (jobId: string, action: 'accept' | 'reject') => Promise<{ success: boolean }>;
  getPendingOfflineAccepts: () => Promise<any[]>;
  markOfflineAcceptSynced: (id: string) => Promise<{ success: boolean }>;
  incrementOfflineAcceptRetry: (id: string) => Promise<{ success: boolean }>;
  
  // Notifications
  saveNotification: (notification: any) => Promise<{ success: boolean }>;
  getNotifications: (unreadOnly?: boolean) => Promise<any[]>;
  markNotificationRead: (id: string) => Promise<{ success: boolean }>;
  
  // Analytics Cache
  setAnalyticsCache: (key: string, value: any) => Promise<{ success: boolean }>;
  getAnalyticsCache: (key: string) => Promise<any | null>;
  
  // Socket.io
  getSocketConnectionInfo: () => Promise<{ url: string; path: string }>;
  
  // System
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (path: string) => Promise<void>;
  
  // Window
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  
  // Auto Updater
  checkForUpdates: () => Promise<any>;
  installUpdate: () => void;
  
  // File System
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<{ success: boolean }>;
  downloadFile: (url: string, destPath: string) => Promise<{ success: boolean }>;
  
  // Event listeners
  onQueueUpdated: (callback: (data: any) => void) => () => void;
  onJobNew: (callback: (data: any) => void) => () => void;
  onJobAccepted: (callback: (data: any) => void) => () => void;
  onJobRejected: (callback: (data: any) => void) => () => void;
  onPayoutUpdated: (callback: (data: any) => void) => () => void;
  onMessageNew: (callback: (data: any) => void) => () => void;
  onAnalyticsTick: (callback: (data: any) => void) => () => void;
  onPeerConnected: (callback: (data: any) => void) => () => void;
  onPeerDisconnected: (callback: (data: any) => void) => () => void;
  
  // Window events
  onUpdateAvailable: (callback: () => void) => () => void;
  onUpdateDownloaded: (callback: () => void) => () => void;
  onPrinterAttached: (callback: (device: any) => void) => () => void;
  onPrinterDetached: (callback: (device: any) => void) => () => void;
  onPrinterPaired: (callback: (config: any) => void) => () => void;
}

// Expose the API
const electronAPI: ElectronAPI = {
  // App
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  
  // Printers
  discoverPrinters: () => ipcRenderer.invoke('printers:discover'),
  getPrinters: () => ipcRenderer.invoke('printers:list'),
  getPrinter: (id: string) => ipcRenderer.invoke('printers:get', id),
  pairPrinter: (config) => ipcRenderer.invoke('printers:pair', config),
  testPrint: (id) => ipcRenderer.invoke('printers:test-print', id),
  print: (id, job) => ipcRenderer.invoke('printers:print', id, job),
  setDefaultPrinter: (id) => ipcRenderer.invoke('printers:set-default', id),
  deletePrinter: (id) => ipcRenderer.invoke('printers:delete', id),
  
  // Print Jobs
  cacheJobs: (jobs) => ipcRenderer.invoke('jobs:cache', jobs),
  getCachedJobs: (tenantId) => ipcRenderer.invoke('jobs:get-cached', tenantId),
  updateJobStatus: (jobId, status) => ipcRenderer.invoke('jobs:update-status', jobId, status),
  
  // Offline Accept Queue
  queueOfflineAccept: (jobId, action) => ipcRenderer.invoke('offline-accept:queue', jobId, action),
  getPendingOfflineAccepts: () => ipcRenderer.invoke('offline-accept:get-pending'),
  markOfflineAcceptSynced: (id) => ipcRenderer.invoke('offline-accept:mark-synced', id),
  incrementOfflineAcceptRetry: (id) => ipcRenderer.invoke('offline-accept:increment-retry', id),
  
  // Notifications
  saveNotification: (notification) => ipcRenderer.invoke('notifications:save', notification),
  getNotifications: (unreadOnly) => ipcRenderer.invoke('notifications:get', unreadOnly),
  markNotificationRead: (id) => ipcRenderer.invoke('notifications:mark-read', id),
  
  // Analytics Cache
  setAnalyticsCache: (key, value) => ipcRenderer.invoke('analytics:cache:set', key, value),
  getAnalyticsCache: (key) => ipcRenderer.invoke('analytics:cache:get', key),
  
  // Socket.io
  getSocketConnectionInfo: () => ipcRenderer.invoke('socket:get-connection-info'),
  
  // System
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
  showItemInFolder: (path) => ipcRenderer.invoke('system:show-item-in-folder', path),
  
  // Window
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  
  // Auto Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  
  // File System
  readFile: (path) => ipcRenderer.invoke('fs:read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('fs:write-file', path, content),
  downloadFile: (url, destPath) => ipcRenderer.invoke('fs:download', url, destPath),
  
  // Event listeners
  onQueueUpdated: (callback) => {
    ipcRenderer.on('queue:updated', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('queue:updated');
  },
  onJobNew: (callback) => {
    ipcRenderer.on('job:new', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('job:new');
  },
  onJobAccepted: (callback) => {
    ipcRenderer.on('job:accepted', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('job:accepted');
  },
  onJobRejected: (callback) => {
    ipcRenderer.on('job:rejected', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('job:rejected');
  },
  onPayoutUpdated: (callback) => {
    ipcRenderer.on('payout:updated', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('payout:updated');
  },
  onMessageNew: (callback) => {
    ipcRenderer.on('message:new', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('message:new');
  },
  onAnalyticsTick: (callback) => {
    ipcRenderer.on('analytics:tick', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('analytics:tick');
  },
  onPeerConnected: (callback) => {
    ipcRenderer.on('peer:connected', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('peer:connected');
  },
  onPeerDisconnected: (callback) => {
    ipcRenderer.on('peer:disconnected', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('peer:disconnected');
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update:available', callback);
    return () => ipcRenderer.removeAllListeners('update:available');
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update:downloaded', callback);
    return () => ipcRenderer.removeAllListeners('update:downloaded');
  },
  onPrinterAttached: (callback) => {
    ipcRenderer.on('printer:attached', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('printer:attached');
  },
  onPrinterDetached: (callback) => {
    ipcRenderer.on('printer:detached', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('printer:detached');
  },
  onPrinterPaired: (callback) => {
    ipcRenderer.on('printer:paired', (_event, data) => callback(data));
    return () => ipcRenderer.removeAllListeners('printer:paired');
  },
};

// Expose the API
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for renderer
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
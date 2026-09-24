import { contextBridge, ipcRenderer } from 'electron';
import type { PrintJobData, PrintResult, KioskSettings, PrinterInfo, TestPrintResult } from '../renderer/types';

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  quit: () => ipcRenderer.send('app:quit'),
  restart: () => ipcRenderer.send('app:restart'),
  onKioskEvent: (callback: (event: string, data: unknown) => void) => {
    ipcRenderer.on('kiosk:event', (_event, eventName, data) => callback(eventName, data));
    return () => ipcRenderer.removeAllListeners('kiosk:event');
  },
  printJob: {
    fetch: (code: string) => ipcRenderer.invoke('print-job:fetch', code),
    print: (jobId: string, artifactKey: string) => ipcRenderer.invoke('print-job:print', jobId, artifactKey),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
  },
  printer: {
    list: () => ipcRenderer.invoke('printer:list'),
    test: (printerUri: string) => ipcRenderer.invoke('printer:test', printerUri),
  },
});

declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      quit: () => void;
      restart: () => void;
      onKioskEvent: (callback: (event: string, data: unknown) => void) => () => void;
      printJob: {
        fetch: (code: string) => Promise<PrintJobData>;
        print: (jobId: string, artifactKey: string) => Promise<PrintResult>;
      };
      settings: {
        get: () => Promise<KioskSettings>;
        set: (key: string, value: unknown) => Promise<void>;
      };
      printer: {
        list: () => Promise<PrinterInfo[]>;
        test: (printerUri: string) => Promise<TestPrintResult>;
      };
    };
  }
}
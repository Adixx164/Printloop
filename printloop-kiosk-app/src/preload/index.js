"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    getVersion: () => electron_1.ipcRenderer.invoke('app:get-version'),
    getPlatform: () => electron_1.ipcRenderer.invoke('app:get-platform'),
    quit: () => electron_1.ipcRenderer.send('app:quit'),
    restart: () => electron_1.ipcRenderer.send('app:restart'),
    onKioskEvent: (callback) => {
        electron_1.ipcRenderer.on('kiosk:event', (_event, eventName, data) => callback(eventName, data));
        return () => electron_1.ipcRenderer.removeAllListeners('kiosk:event');
    },
    printJob: {
        fetch: (code) => electron_1.ipcRenderer.invoke('print-job:fetch', code),
        print: (jobId, artifactKey) => electron_1.ipcRenderer.invoke('print-job:print', jobId, artifactKey),
    },
    settings: {
        get: () => electron_1.ipcRenderer.invoke('settings:get'),
        set: (key, value) => electron_1.ipcRenderer.invoke('settings:set', key, value),
    },
    printer: {
        list: () => electron_1.ipcRenderer.invoke('printer:list'),
        test: (printerUri) => electron_1.ipcRenderer.invoke('printer:test', printerUri),
    },
});
//# sourceMappingURL=index.js.map
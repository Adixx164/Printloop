/**
 * Preload script for the setup wizard window.
 *
 * The wizard's renderer runs in a sandboxed BrowserWindow with
 * contextIsolation:true / nodeIntegration:false (Electron security
 * default). We expose a tiny, intentional API onto window.printloopSetup
 * via contextBridge — anything not in this whitelist is unreachable.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printloopSetup', {
  getConfig:        ()      => ipcRenderer.invoke('setup:getConfig'),
  testCloud:        (u, k)  => ipcRenderer.invoke('setup:testCloud', { baseUrl: u, kioskKey: k }),
  testPrinter:      (cfg)   => ipcRenderer.invoke('setup:testPrinter', cfg),
  discoverPrinters: ()      => ipcRenderer.invoke('setup:discoverPrinters'),
  save:             (cfg)   => ipcRenderer.invoke('setup:save', cfg),
  cancel:           ()      => ipcRenderer.invoke('setup:cancel'),
});

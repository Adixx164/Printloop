/**
 * Preload for the kiosk-renderer window.
 *
 * Exposes a minimal IPC channel onto `window.printloopKiosk` so the
 * touchscreen UI can listen for agent events (dispatching / progress /
 * confirmed / verify-failed) without losing Electron's
 * `contextIsolation:true` / `nodeIntegration:false` security defaults.
 *
 * Mirrors `setup-preload.js`'s pattern. Whitelisted surface only — no
 * arbitrary IPC, no Node API leakage.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printloopKiosk', {
  /**
   * Subscribe to agent events emitted by the bundled agent in the
   * Electron main process. The callback receives the event object
   * verbatim (e.g. `{ kind: 'progress', code, printed, expected }`).
   * Returns an unsubscribe function — call it to remove the listener
   * (e.g. before navigating away).
   */
  onAgentEvent: (callback) => {
    const listener = (_event, payload) => {
      try {
        callback(payload);
      } catch (e) {
        // Swallow renderer-side errors so a bad handler can't kill
        // the IPC pipe for any subsequent subscribers.
        // eslint-disable-next-line no-console
        console.error('[printloopKiosk] event handler threw:', e);
      }
    };
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
});

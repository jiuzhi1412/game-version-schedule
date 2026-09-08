const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('get-state'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  syncNow: () => ipcRenderer.send('sync-now'),
  onLog: (cb) => ipcRenderer.on('log', (_e, m) => cb(m))
});

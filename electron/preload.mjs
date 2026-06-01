import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', cb),
  installNow: () => ipcRenderer.send('update-install-now'),
});

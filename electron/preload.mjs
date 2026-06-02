import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', cb),
  installNow:     ()  => ipcRenderer.send('update-install-now'),
  setChannel:     (c) => ipcRenderer.send('update-set-channel', c),
  getChannel:     ()  => ipcRenderer.invoke('update-get-channel'),
});

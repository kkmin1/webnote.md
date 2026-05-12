const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
    isDesktop: true,
    getLaunchFile: () => ipcRenderer.invoke('app:get-launch-file'),
    openFile: () => ipcRenderer.invoke('dialog:open-file'),
    saveFile: payload => ipcRenderer.invoke('dialog:save-file', payload),
    savePdf: payload => ipcRenderer.invoke('dialog:save-pdf', payload),
    onOpenFile: callback => {
        const handler = (_event, doc) => callback(doc);
        ipcRenderer.on('document:open', handler);
        return () => ipcRenderer.removeListener('document:open', handler);
    }
});

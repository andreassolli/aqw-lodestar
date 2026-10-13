const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notificationAPI', {
    onShow(callback) {
        const listener = (_event, data) => callback(data);

        ipcRenderer.on('notification:show', listener);

        return () => {
            ipcRenderer.removeListener('notification:show', listener);
        };
    },

    hide() {
        ipcRenderer.send('ultra-assistant:notification:hide');
    }
});

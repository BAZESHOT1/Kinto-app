const { contextBridge, ipcRenderer } = require('electron');

// Мост страницы с оболочкой Windows: клиент определяет по нему, что запущен десктоп-вариант.
contextBridge.exposeInMainWorld('kintoDesktop', {
  platform: 'windows',
  incomingCall: (name) => ipcRenderer.send('kinto:incoming-call', { name }),
  notify: (title, body) => ipcRenderer.send('kinto:notify', { title, body }),
  // Пока идёт звонок, система не должна усыплять приложение.
  callActive: (on) => ipcRenderer.send('kinto:call-active', { on: Boolean(on) }),
});

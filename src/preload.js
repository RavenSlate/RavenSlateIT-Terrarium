const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('terrarium', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  startApp: (opts) => ipcRenderer.invoke('start-app', opts),
  stopApp: (opts) => ipcRenderer.invoke('stop-app', opts),
  pipInstall: (opts) => ipcRenderer.invoke('pip-install', opts),
  createVenv: (opts) => ipcRenderer.invoke('create-venv', opts),
  openEditor: (opts) => ipcRenderer.invoke('open-editor', opts),
  openFinder: (opts) => ipcRenderer.invoke('open-finder', opts),
  gitStatus: (opts) => ipcRenderer.invoke('git-status', opts),
  gitPush: (opts) => ipcRenderer.invoke('git-push', opts),
  gitPull: (opts) => ipcRenderer.invoke('git-pull', opts),
  checkVenv: (opts) => ipcRenderer.invoke('check-venv', opts),
  getPythonInfo: (opts) => ipcRenderer.invoke('get-python-info', opts),
  onAppLog: (cb) => ipcRenderer.on('app-log', (e, data) => cb(data)),
  onAppPort: (cb) => ipcRenderer.on('app-port', (e, data) => cb(data)),
  onAppStopped: (cb) => ipcRenderer.on('app-stopped', (e, data) => cb(data)),
  onTaskLog: (cb) => ipcRenderer.on('task-log', (e, data) => cb(data)),
  onTaskDone: (cb) => ipcRenderer.on('task-done', (e, data) => cb(data)),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
})

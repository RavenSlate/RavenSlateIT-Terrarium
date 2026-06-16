// ─────────────────────────────────────────────────────────────────────────────
// Terrarium — preload.js
// Exposes a safe, typed API to the renderer via contextBridge.
// RavenSlate IT
// ─────────────────────────────────────────────────────────────────────────────

'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// Channels that carry events FROM the main process TO the renderer.
const EVENT_CHANNELS = ['app-log', 'app-port', 'app-stopped', 'task-log', 'task-done']

contextBridge.exposeInMainWorld('terrarium', {
  // ── Folder / project ──────────────────────────────────────────────────────
  pickFolder: () => ipcRenderer.invoke('pick-folder'),

  // ── Process lifecycle ─────────────────────────────────────────────────────────
  startApp:  (opts) => ipcRenderer.invoke('start-app',  opts),
  stopApp:   (opts) => ipcRenderer.invoke('stop-app',   opts),
  sendStdin: (opts) => ipcRenderer.invoke('send-stdin', opts),

  // ── pip / venv ────────────────────────────────────────────────────────────────
  pipInstall:    (opts) => ipcRenderer.invoke('pip-install',     opts),
  pipManual:     (opts) => ipcRenderer.invoke('pip-manual',      opts),
  createVenv:    (opts) => ipcRenderer.invoke('create-venv',     opts),
  checkVenv:     (opts) => ipcRenderer.invoke('check-venv',      opts),
  getPythonInfo: (opts) => ipcRenderer.invoke('get-python-info', opts),

  // ── Shell helpers ───────────────────────────────────────────────────────────────
  openEditor: (opts) => ipcRenderer.invoke('open-editor', opts),
  openFinder: (opts) => ipcRenderer.invoke('open-finder', opts),

  // ── Git ─────────────────────────────────────────────────────────────────────────
  gitStatus: (opts) => ipcRenderer.invoke('git-status', opts),
  gitPush:   (opts) => ipcRenderer.invoke('git-push',   opts),
  gitPull:   (opts) => ipcRenderer.invoke('git-pull',   opts),

  // ── Event subscriptions ────────────────────────────────────────────────────────
  onAppLog:     (cb) => ipcRenderer.on('app-log',     (_e, data) => cb(data)),
  onAppPort:    (cb) => ipcRenderer.on('app-port',    (_e, data) => cb(data)),
  onAppStopped: (cb) => ipcRenderer.on('app-stopped', (_e, data) => cb(data)),
  onTaskLog:    (cb) => ipcRenderer.on('task-log',    (_e, data) => cb(data)),
  onTaskDone:   (cb) => ipcRenderer.on('task-done',   (_e, data) => cb(data)),

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  removeAllListeners: (channel) => {
    if (channel) {
      ipcRenderer.removeAllListeners(channel)
    } else {
      for (const ch of EVENT_CHANNELS) {
        ipcRenderer.removeAllListeners(ch)
      }
    }
  },
})

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const { spawn, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Always append common binary paths
const EXTRA_PATHS = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
process.env.PATH = (process.env.PATH || '') + ':' + EXTRA_PATHS.join(':')

let mainWindow
const runningProcesses = {} // projectPath -> child process

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 860,
    minHeight: 580,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.loadFile(path.join(__dirname, '../public/index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── pick-folder ───────────────────────────────────────────────────────────────
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths.length) return null

  const folderPath = result.filePaths[0]
  const name = path.basename(folderPath)

  // Check if Python project
  let isPython = false
  const pyIndicators = ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile']
  for (const ind of pyIndicators) {
    if (fs.existsSync(path.join(folderPath, ind))) { isPython = true; break }
  }
  if (!isPython) {
    try {
      const files = fs.readdirSync(folderPath)
      if (files.some(f => f.endsWith('.py'))) isPython = true
    } catch {}
  }

  // Detect venv
  let hasVenv = false
  let venvPath = null
  let venvName = null
  for (const vd of ['venv', '.venv', 'env']) {
    const vp = path.join(folderPath, vd)
    if (
      fs.existsSync(path.join(vp, 'bin', 'python')) ||
      fs.existsSync(path.join(vp, 'bin', 'python3'))
    ) {
      hasVenv = true
      venvPath = vp
      venvName = vd
      break
    }
  }

  // Entry points
  const entryNames = ['main.py', 'app.py', 'run.py', 'server.py', 'manage.py', 'streamlit_app.py']
  const entryPoints = entryNames.filter(e => fs.existsSync(path.join(folderPath, e)))

  // Python version
  let pythonVersion = null
  try {
    const pyBin = venvPath
      ? path.join(venvPath, 'bin', 'python3')
      : 'python3'
    pythonVersion = execSync(`${pyBin} --version 2>&1`, { timeout: 5000 }).toString().trim()
  } catch {}

  const hasRequirements = fs.existsSync(path.join(folderPath, 'requirements.txt'))

  return { name, path: folderPath, hasVenv, venvPath, venvName, pythonVersion, entryPoints, hasRequirements, isPython }
})

// ─── start-app ─────────────────────────────────────────────────────────────────
ipcMain.handle('start-app', async (event, { projectPath, entryPoint, runMode, venvPath }) => {
  if (runningProcesses[projectPath]) {
    try { runningProcesses[projectPath].kill('SIGTERM') } catch {}
    delete runningProcesses[projectPath]
  }

  const env = { ...process.env }
  if (venvPath) {
    env.PATH = path.join(venvPath, 'bin') + ':' + env.PATH
  }

  let cmd, args
  const pyBin = venvPath ? path.join(venvPath, 'bin', 'python3') : 'python3'

  if (runMode === 'flask') {
    env.FLASK_APP = entryPoint
    env.FLASK_ENV = 'development'
    cmd = venvPath ? path.join(venvPath, 'bin', 'flask') : 'flask'
    args = ['run']
  } else if (runMode === 'django') {
    cmd = pyBin
    args = ['manage.py', 'runserver']
  } else if (runMode === 'streamlit') {
    cmd = venvPath ? path.join(venvPath, 'bin', 'streamlit') : 'streamlit'
    args = ['run', entryPoint]
  } else if (runMode === 'fastapi') {
    const moduleName = entryPoint.replace(/\.py$/, '').replace(/\//g, '.')
    cmd = venvPath ? path.join(venvPath, 'bin', 'uvicorn') : 'uvicorn'
    args = [`${moduleName}:app`, '--reload']
  } else {
    // script or auto
    cmd = pyBin
    args = [entryPoint]
  }

  let child
  try {
    child = spawn(cmd, args, {
      cwd: projectPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    return { success: false, error: err.message }
  }

  runningProcesses[projectPath] = child

  const portRegex = /:(\d{4,5})(?:\/|$|\s)|localhost:(\d{4,5})|127\.0\.0\.1:(\d{4,5})/
  let portSent = false

  const handleOutput = (type) => (data) => {
    const text = data.toString()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app-log', { projectPath, type, text })
      if (!portSent) {
        const m = text.match(portRegex)
        if (m) {
          const port = m[1] || m[2] || m[3]
          portSent = true
          mainWindow.webContents.send('app-port', { projectPath, port })
        }
      }
    }
  }

  child.stdout.on('data', handleOutput('stdout'))
  child.stderr.on('data', handleOutput('stderr'))

  child.on('close', (code) => {
    delete runningProcesses[projectPath]
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app-stopped', { projectPath, code })
    }
  })

  return { success: true }
})

// ─── stop-app ──────────────────────────────────────────────────────────────────
ipcMain.handle('stop-app', async (event, { projectPath }) => {
  const child = runningProcesses[projectPath]
  if (!child) return { success: false, error: 'No running process' }

  child.kill('SIGTERM')
  const timeout = setTimeout(() => {
    try { child.kill('SIGKILL') } catch {}
  }, 2000)
  child.on('close', () => clearTimeout(timeout))

  return { success: true }
})

// ─── pip-install ───────────────────────────────────────────────────────────────
ipcMain.handle('pip-install', async (event, { projectPath, venvPath }) => {
  return new Promise((resolve) => {
    const pipBin = venvPath ? path.join(venvPath, 'bin', 'pip') : 'pip3'
    const env = { ...process.env }
    if (venvPath) env.PATH = path.join(venvPath, 'bin') + ':' + env.PATH

    const child = spawn(pipBin, ['install', '-r', 'requirements.txt'], {
      cwd: projectPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const send = (type, text) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('task-log', { type, text })
      }
    }

    child.stdout.on('data', d => send('stdout', d.toString()))
    child.stderr.on('data', d => send('stderr', d.toString()))

    child.on('close', (code) => {
      const success = code === 0
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('task-done', { success, error: success ? null : `pip exited with code ${code}` })
      }
      resolve({ success })
    })

    child.on('error', (err) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('task-done', { success: false, error: err.message })
      }
      resolve({ success: false, error: err.message })
    })
  })
})

// ─── create-venv ───────────────────────────────────────────────────────────────
ipcMain.handle('create-venv', async (event, { projectPath }) => {
  return new Promise((resolve) => {
    const child = spawn('python3', ['-m', 'venv', 'venv'], {
      cwd: projectPath,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const send = (type, text) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('task-log', { type, text })
      }
    }

    child.stdout.on('data', d => send('stdout', d.toString()))
    child.stderr.on('data', d => send('stderr', d.toString()))

    child.on('close', (code) => {
      const success = code === 0
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('task-done', { success, error: success ? null : `venv creation exited with code ${code}` })
      }
      resolve({ success })
    })

    child.on('error', (err) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('task-done', { success: false, error: err.message })
      }
      resolve({ success: false, error: err.message })
    })
  })
})

// ─── open-editor ───────────────────────────────────────────────────────────────
ipcMain.handle('open-editor', async (event, { projectPath }) => {
  const editors = ['code', 'cursor', 'subl', 'pycharm']
  for (const editor of editors) {
    try {
      execSync(`which ${editor}`, { timeout: 2000 })
      spawn(editor, [projectPath], { detached: true, stdio: 'ignore' }).unref()
      return { success: true, editor }
    } catch {}
  }
  await shell.openPath(projectPath)
  return { success: true, editor: 'finder' }
})

// ─── open-finder ───────────────────────────────────────────────────────────────
ipcMain.handle('open-finder', async (event, { projectPath }) => {
  await shell.openPath(projectPath)
  return { success: true }
})

// ─── git-status ────────────────────────────────────────────────────────────────
ipcMain.handle('git-status', async (event, { projectPath }) => {
  try {
    const simpleGit = require('simple-git')
    const git = simpleGit(projectPath)
    const status = await git.status()
    const log = await git.log({ maxCount: 10 })
    let ahead = 0
    let behind = 0
    try {
      const tracking = await git.raw(['rev-list', '--left-right', '--count', `${status.tracking}...HEAD`])
      const parts = tracking.trim().split(/\s+/)
      behind = parseInt(parts[0]) || 0
      ahead = parseInt(parts[1]) || 0
    } catch {}

    const files = [
      ...status.modified.map(f => ({ path: f, status: 'M' })),
      ...status.created.map(f => ({ path: f, status: 'A' })),
      ...status.deleted.map(f => ({ path: f, status: 'D' })),
      ...status.not_added.map(f => ({ path: f, status: '?' })),
      ...status.renamed.map(f => ({ path: f.to, status: 'R' })),
    ]

    const recentCommits = (log.all || []).map(c => ({
      hash: c.hash.slice(0, 7),
      message: c.message,
      date: c.date,
      author: c.author_name,
    }))

    return { branch: status.current, ahead, behind, files, recentCommits }
  } catch (err) {
    return { branch: null, ahead: 0, behind: 0, files: [], recentCommits: [], error: err.message }
  }
})

// ─── git-push ──────────────────────────────────────────────────────────────────
ipcMain.handle('git-push', async (event, { projectPath, message }) => {
  try {
    const simpleGit = require('simple-git')
    const git = simpleGit(projectPath)
    await git.add('.')
    await git.commit(message)
    await git.push()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── git-pull ──────────────────────────────────────────────────────────────────
ipcMain.handle('git-pull', async (event, { projectPath }) => {
  try {
    const simpleGit = require('simple-git')
    const git = simpleGit(projectPath)
    await git.pull()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── check-venv ────────────────────────────────────────────────────────────────
ipcMain.handle('check-venv', async (event, { projectPath }) => {
  for (const vd of ['venv', '.venv', 'env']) {
    const vp = path.join(projectPath, vd)
    if (
      fs.existsSync(path.join(vp, 'bin', 'python')) ||
      fs.existsSync(path.join(vp, 'bin', 'python3'))
    ) {
      return { hasVenv: true, venvPath: vp, venvName: vd }
    }
  }
  return { hasVenv: false, venvPath: null, venvName: null }
})

// ─── get-python-info ───────────────────────────────────────────────────────────
ipcMain.handle('get-python-info', async (event, { projectPath, venvPath }) => {
  try {
    const pyBin = venvPath ? path.join(venvPath, 'bin', 'python') : 'python3'
    const version = execSync(`${pyBin} --version 2>&1`, { timeout: 5000, cwd: projectPath }).toString().trim()
    const pyPath = execSync(`which ${pyBin}`, { timeout: 3000 }).toString().trim()
    return { version, path: pyPath }
  } catch (err) {
    return { version: null, path: null, error: err.message }
  }
})

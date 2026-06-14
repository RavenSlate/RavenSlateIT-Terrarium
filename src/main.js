// ─────────────────────────────────────────────────────────────────────────────
// Terrarium — main.js  (Electron main process)
// RavenSlate IT
// ─────────────────────────────────────────────────────────────────────────────

'use strict'

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const { spawn, execSync } = require('child_process')
const fs   = require('fs')
const path = require('path')

// ── Augment PATH so common tools are always reachable ──────────────────────
const extraPaths = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin']
process.env.PATH = extraPaths.join(':') + (process.env.PATH ? ':' + process.env.PATH : '')

// ── State ──────────────────────────────────────────────────────────────────
let mainWindow = null
const runningProcesses = {}   // projectPath → ChildProcess

// ── Window ─────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1180,
    height: 740,
    minWidth:  860,
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

  mainWindow.on('closed', () => {
    mainWindow = null
  })
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

// ── Helper: send to renderer ───────────────────────────────────────────────
function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

// ── Helper: build a merged env that prepends venv/bin ─────────────────────
function buildEnv(venvPath) {
  const env = { ...process.env }
  if (venvPath) {
    env.PATH = path.join(venvPath, 'bin') + ':' + env.PATH
    env.VIRTUAL_ENV = venvPath
    delete env.PYTHONHOME
  }
  return env
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC: pick-folder
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select your Python project folder',
  })
  if (result.canceled || !result.filePaths.length) return null

  const folderPath = result.filePaths[0]
  const name = path.basename(folderPath)

  // Determine if this is a Python project
  let isPythonProject = false
  const pyMarkers = ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile']
  for (const marker of pyMarkers) {
    if (fs.existsSync(path.join(folderPath, marker))) { isPythonProject = true; break }
  }
  if (!isPythonProject) {
    try {
      const entries = fs.readdirSync(folderPath)
      if (entries.some(f => f.endsWith('.py'))) isPythonProject = true
    } catch (_) { /* ignore permission errors */ }
  }

  // Detect venv
  let hasVenv   = false
  let venvPath  = null
  let venvName  = null
  for (const vd of ['venv', '.venv', 'env']) {
    const vp = path.join(folderPath, vd)
    if (
      fs.existsSync(path.join(vp, 'bin', 'python')) ||
      fs.existsSync(path.join(vp, 'bin', 'python3'))
    ) {
      hasVenv  = true
      venvPath = vp
      venvName = vd
      break
    }
  }

  // Python version
  let pythonVersion = null
  try {
    const pyBin = venvPath ? path.join(venvPath, 'bin', 'python3') : 'python3'
    pythonVersion = execSync(`"${pyBin}" --version 2>&1`, { timeout: 5000 }).toString().trim()
  } catch (_) { /* python not found */ }

  // Entry points
  const knownEntryPoints = ['main.py', 'app.py', 'run.py', 'server.py', 'manage.py', 'streamlit_app.py']
  const entryPoints = knownEntryPoints.filter(ep => fs.existsSync(path.join(folderPath, ep)))

  const hasRequirements = fs.existsSync(path.join(folderPath, 'requirements.txt'))

  return {
    name,
    path: folderPath,
    isPythonProject,
    hasVenv,
    venvPath,
    venvName,
    pythonVersion,
    entryPoints,
    hasRequirements,
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// IPC: start-app
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('start-app', async (event, { projectPath, entryPoint, runMode, venvPath }) => {
  // Kill any existing process for this project
  if (runningProcesses[projectPath]) {
    try { runningProcesses[projectPath].kill('SIGTERM') } catch (_) {}
    delete runningProcesses[projectPath]
  }

  const env = buildEnv(venvPath)
  const pyBin = venvPath ? path.join(venvPath, 'bin', 'python3') : 'python3'

  let cmd, args

  // Resolve effective runMode
  let effectiveMode = runMode
  if (effectiveMode === 'auto') {
    const ep = (entryPoint || '').toLowerCase()
    if (ep === 'manage.py') effectiveMode = 'django'
    else if (ep.includes('streamlit')) effectiveMode = 'streamlit'
    else if (ep === 'app.py' || ep === 'run.py') effectiveMode = 'flask'
    else effectiveMode = 'script'
  }

  switch (effectiveMode) {
    case 'flask':
      env.FLASK_APP = entryPoint
      env.FLASK_ENV = 'development'
      env.FLASK_DEBUG = '1'
      cmd  = venvPath ? path.join(venvPath, 'bin', 'flask') : 'flask'
      args = ['run']
      break

    case 'django':
      cmd  = pyBin
      args = ['manage.py', 'runserver']
      break

    case 'streamlit':
      cmd  = venvPath ? path.join(venvPath, 'bin', 'streamlit') : 'streamlit'
      args = ['run', entryPoint]
      break

    case 'fastapi': {
      const moduleName = entryPoint
        .replace(/\.py$/, '')
        .replace(/\//g, '.')
        .replace(/\\/g, '.')
      cmd  = venvPath ? path.join(venvPath, 'bin', 'uvicorn') : 'uvicorn'
      args = [`${moduleName}:app`, '--reload']
      break
    }

    case 'script':
    default:
      cmd  = pyBin
      args = [entryPoint]
      break
  }

  let child
  try {
    child = spawn(cmd, args, {
      cwd:   projectPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    return { success: false, error: err.message }
  }

  runningProcesses[projectPath] = child

  // Port detection regex — covers :8000, localhost:5000, 127.0.0.1:8501, etc.
  const portRegex = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0)?:(\d{4,5})(?:[/\s"']|$)/

  const handleOutput = (type) => (data) => {
    const text = data.toString()
    send('app-log', { projectPath, type, text })

    // Only send the first port we find
    const m = text.match(portRegex)
    if (m) {
      send('app-port', { projectPath, port: m[1] })
    }
  }

  child.stdout.on('data', handleOutput('stdout'))
  child.stderr.on('data', handleOutput('stderr'))

  child.on('close', (code) => {
    delete runningProcesses[projectPath]
    send('app-stopped', { projectPath, code })
  })

  child.on('error', (err) => {
    delete runningProcesses[projectPath]
    send('app-log',     { projectPath, type: 'stderr', text: `Spawn error: ${err.message}\n` })
    send('app-stopped', { projectPath, code: -1 })
  })

  return { success: true, pid: child.pid }
})

// ─────────────────────────────────────────────────────────────────────────────
// IPC: stop-app
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('stop-app', async (event, { projectPath }) => {
  const child = runningProcesses[projectPath]
  if (!child) return { success: false, error: 'No running process for this project' }

  try { child.kill('SIGTERM') } catch (_) {}

  // Force-kill after 3 s if still alive
  const forceTimer = setTimeout(() => {
    try { child.kill('SIGKILL') } catch (_) {}
  }, 3000)
  child.on('close', () => clearTimeout(forceTimer))

  return { success: true }
})

// ─────────────────────────────────────────────────────────────────────────────
// IPC: pip-install
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('pip-install', async (event, { projectPath, venvPath }) => {
  return new Promise((resolve) => {
    const env    = buildEnv(venvPath)
    const pipBin = venvPath ? path.join(venvPath, 'bin', 'pip') : 'pip3'

    const child = spawn(pipBin, ['install', '-r', 'requirements.txt'], {
      cwd: projectPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', d => send('task-log', { type: 'stdout', text: d.toString() }))
    child.stderr.on('data', d => send('task-log', { type: 'stderr', text: d.toString() }))

    child.on('close', (code) => {
      const success = code === 0
      send('task-done', { success, error: success ? null : `pip exited with code ${code}` })
      resolve({ success })
    })

    child.on('error', (err) => {
      send('task-done', { success: false, error: err.message })
      resolve({ success: false, error: err.message })
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// IPC: create-venv
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('create-venv', async (event, { projectPath }) => {
  return new Promise((resolve) => {
    const child = spawn('python3', ['-m', 'venv', 'venv'], {
      cwd:   projectPath,
      env:   process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', d => send('task-log', { type: 'stdout', text: d.toString() }))
    child.stderr.on('data', d => send('task-log', { type: 'stderr', text: d.toString() }))

    child.on('close', (code) => {
      const success = code === 0
      send('task-done', { success, error: success ? null : `python3 -m venv exited with code ${code}` })
      resolve({ success })
    })

    child.on('error', (err) => {
      send('task-done', { success: false, error: err.message })
      resolve({ success: false, error: err.message })
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// IPC: open-editor
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('open-editor', async (event, { projectPath }) => {
  const editors = ['code', 'cursor', 'subl', 'pycharm']
  for (const editor of editors) {
    try {
      execSync(`which ${editor}`, { timeout: 2000, stdio: 'pipe' })
      spawn(editor, [projectPath], { detached: true, stdio: 'ignore' }).unref()
      return { success: true, editor }
    } catch (_) { /* not found, try next */ }
  }
  // Fall back to Finder/Files
  await shell.openPath(projectPath)
  return { success: true, editor: 'system' }
})

// ─────────────────────────────────────────────────────────────────────────────
// IPC: open-finder
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('open-finder', async (event, { projectPath }) => {
  await shell.openPath(projectPath)
  return { success: true }
})

// ─────────────────────────────────────────────────────────────────────────────
// IPC: git-status
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('git-status', async (event, { projectPath }) => {
  try {
    const simpleGit = require('simple-git')
    const git = simpleGit(projectPath)

    const [status, log] = await Promise.all([
      git.status(),
      git.log({ maxCount: 5 }),
    ])

    let ahead  = 0
    let behind = 0
    try {
      if (status.tracking) {
        const raw = await git.raw(['rev-list', '--left-right', '--count', `${status.tracking}...HEAD`])
        const parts = raw.trim().split(/\s+/)
        behind = parseInt(parts[0], 10) || 0
        ahead  = parseInt(parts[1], 10) || 0
      }
    } catch (_) { /* no upstream */ }

    const files = [
      ...status.modified.map(f  => ({ path: f,    status: 'M' })),
      ...status.created.map(f   => ({ path: f,    status: 'A' })),
      ...status.deleted.map(f   => ({ path: f,    status: 'D' })),
      ...status.not_added.map(f => ({ path: f,    status: '?' })),
      ...status.renamed.map(r   => ({ path: r.to, status: 'R' })),
      ...status.staged.filter(f => !status.modified.includes(f) && !status.created.includes(f)).map(f => ({ path: f, status: 'S' })),
    ]

    const commits = (log.all || []).map(c => ({
      hash:    c.hash.slice(0, 7),
      message: c.message,
      date:    c.date,
      author:  c.author_name,
    }))

    return { branch: status.current, ahead, behind, files, commits }
  } catch (err) {
    return { branch: null, ahead: 0, behind: 0, files: [], commits: [], error: err.message }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// IPC: git-push
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('git-push', async (event, { projectPath, message }) => {
  try {
    const simpleGit = require('simple-git')
    const git = simpleGit(projectPath)
    await git.add('.')
    await git.commit(message || 'Update via Terrarium')
    await git.push()
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// IPC: git-pull
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// IPC: check-venv
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// IPC: get-python-info
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('get-python-info', async (event, { projectPath, venvPath }) => {
  try {
    const pyBin = venvPath ? path.join(venvPath, 'bin', 'python3') : 'python3'
    const version = execSync(`"${pyBin}" --version 2>&1`, {
      timeout: 5000,
      cwd: projectPath,
    }).toString().trim()

    let pyPath = null
    try {
      pyPath = execSync(`which "${pyBin}"`, { timeout: 3000 }).toString().trim()
    } catch (_) { pyPath = pyBin }

    return { version, path: pyPath }
  } catch (err) {
    return { version: null, path: null, error: err.message }
  }
})

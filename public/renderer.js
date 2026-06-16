// ─────────────────────────────────────────────────────────────────────────────
// Terrarium — renderer.js
// ─────────────────────────────────────────────────────────────────────────────

// ── State ──────────────────────────────────────────────────────────────────
let projects = []        // [{id, name, path, hasVenv, venvPath, venvName, pythonVersion, entryPoints, hasRequirements}]
let activeProjectId = null
let runningApps = {}     // projectId → { port, startTime, uptimeTimer }
let currentTab = 'overview'
let autoScroll = true
let gitData = null

// ── Persistence ────────────────────────────────────────────────────────────
function saveProjects() {
  try { localStorage.setItem('terrarium-projects', JSON.stringify(projects)) } catch {}
}

function loadProjects() {
  try {
    const raw = localStorage.getItem('terrarium-projects')
    if (raw) projects = JSON.parse(raw)
  } catch {}
}

// ── Helpers ────────────────────────────────────────────────────────────────
function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function getProject(id) {
  return projects.find(p => p.id === id) || null
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)

const projectList    = $('project-list')
const searchBox      = $('search-box')
const emptyState     = $('empty-state')
const projectView    = $('project-view')

const projName       = $('proj-name')
const projPath       = $('proj-path')
const projBadges     = $('proj-badges')
const venvInfo       = $('venv-info')
const venvStatusText = $('venv-status-text')
const entrySelect    = $('entry-select')
const customEntry    = $('custom-entry')
const runModeSelect  = $('run-mode-select')
const runBtn         = $('run-btn')
const statusDot      = $('status-dot')
const uptimeDisplay  = $('uptime-display')
const portBadge      = $('port-badge')
const portLabel      = $('port-label')

const logPanel       = $('log-panel')
const taskOverlay    = $('task-overlay')
const taskModalTitle = $('task-modal-title')
const taskLogPanel   = $('task-log-panel')
const btnTaskClose   = $('btn-task-close')

// ── Sidebar rendering ──────────────────────────────────────────────────────
function renderSidebar(filter) {
  const q = (filter || '').toLowerCase()
  const filtered = q ? projects.filter(p => p.name.toLowerCase().includes(q)) : projects

  projectList.innerHTML = ''
  if (filtered.length === 0) {
    projectList.innerHTML = '<div style="padding:16px 8px;color:var(--muted);font-size:12px;">No projects found.</div>'
    return
  }
  for (const p of filtered) {
    const isRunning = !!runningApps[p.id]
    const card = document.createElement('div')
    card.className = 'project-card' + (p.id === activeProjectId ? ' active' : '')
    card.dataset.id = p.id

    const pyLabel = p.pythonVersion
      ? p.pythonVersion.replace('Python ', '')
      : '?'
    const venvLabel = p.venvName ? ` (${p.venvName})` : ''

    card.innerHTML = `
      <div class="project-card-header">
        <span class="project-card-name" title="${p.name}">${p.name}</span>
        <div class="project-card-badges">
          ${isRunning ? '<span class="running-dot" title="Running"></span>' : ''}
          <button class="remove-btn" data-remove="${p.id}" title="Remove project">×</button>
        </div>
      </div>
      <div class="project-card-py">Py ${pyLabel}${venvLabel}</div>
    `
    card.addEventListener('click', (e) => {
      if (e.target.dataset.remove) return
      selectProject(p.id)
    })
    card.querySelector('[data-remove]').addEventListener('click', (e) => {
      e.stopPropagation()
      removeProject(p.id)
    })
    projectList.appendChild(card)
  }
}

// ── Project selection ──────────────────────────────────────────────────────
function selectProject(id) {
  activeProjectId = id
  const p = getProject(id)
  if (!p) {
    showEmptyState()
    return
  }
  showProjectView(p)
  renderSidebar(searchBox.value)
}

function showEmptyState() {
  emptyState.style.display = 'flex'
  projectView.style.display = 'none'
}

function showProjectView(p) {
  emptyState.style.display = 'none'
  projectView.style.display = 'flex'

  // Header
  projName.textContent = p.name
  projPath.textContent = p.path

  // Badges
  projBadges.innerHTML = ''
  if (p.pythonVersion) {
    const b = document.createElement('span')
    b.className = 'badge badge-green'
    b.textContent = p.pythonVersion
    projBadges.appendChild(b)
  }
  if (p.venvName) {
    const b = document.createElement('span')
    b.className = 'badge badge-blue'
    b.textContent = p.venvName
    projBadges.appendChild(b)
  } else {
    const b = document.createElement('span')
    b.className = 'badge badge-muted'
    b.textContent = 'System Python'
    projBadges.appendChild(b)
  }

  // Venv card
  renderVenvCard(p)

  // Entry points
  renderEntrySelect(p)

  // Run state
  renderRunState(p)

  // If git tab is active, refresh
  if (currentTab === 'git') loadGit(p)
}

function renderVenvCard(p) {
  venvInfo.innerHTML = ''
  if (p.hasVenv && p.venvPath) {
    venvStatusText.textContent = ''
    const badge = document.createElement('span')
    badge.className = 'badge badge-green'
    badge.textContent = `✓ ${p.venvName}`
    const pathSpan = document.createElement('span')
    pathSpan.className = 'text-muted text-sm'
    pathSpan.textContent = p.venvPath
    venvInfo.appendChild(badge)
    venvInfo.appendChild(pathSpan)
  } else {
    venvStatusText.textContent = ''
    const badge = document.createElement('span')
    badge.className = 'badge badge-muted'
    badge.textContent = 'No venv detected'
    const btn = document.createElement('button')
    btn.className = 'btn btn-ghost btn-sm'
    btn.textContent = '+ Create venv'
    btn.onclick = () => runCreateVenv(p)
    venvInfo.appendChild(badge)
    venvInfo.appendChild(btn)
  }
}

function renderEntrySelect(p) {
  entrySelect.innerHTML = ''
  const entries = p.entryPoints && p.entryPoints.length ? p.entryPoints : []
  if (entries.length === 0) {
    const opt = document.createElement('option')
    opt.value = ''
    opt.textContent = '— none detected —'
    entrySelect.appendChild(opt)
  } else {
    for (const e of entries) {
      const opt = document.createElement('option')
      opt.value = e
      opt.textContent = e
      entrySelect.appendChild(opt)
    }
  }
}

function renderRunState(p) {
  const isRunning = !!runningApps[p.id]
  runBtn.className = isRunning ? 'btn btn-red' : 'btn btn-green'
  runBtn.textContent = isRunning ? '■ Stop' : '▶ Run'

  if (isRunning) {
    statusDot.className = 'badge badge-green'
    statusDot.innerHTML = '<span class="running-dot" style="display:inline-block;margin-right:5px;"></span>Running'
    const app = runningApps[p.id]
    if (app.port) {
      portBadge.style.display = 'flex'
      portLabel.textContent = `Port :${app.port}`
      $('btn-open-browser').onclick = () => {
        window.open(`http://localhost:${app.port}`)
      }
    }
  } else {
    statusDot.className = 'badge badge-muted'
    statusDot.textContent = '● Stopped'
    portBadge.style.display = 'none'
    uptimeDisplay.textContent = ''
  }

  // pip install button + manual row
  if (p.hasRequirements) {
    $('btn-pip-install').disabled = false
    $('pip-req-status').textContent = ''
    $('pip-manual-row').style.display = 'none'
  } else {
    $('btn-pip-install').disabled = true
    $('pip-req-status').textContent = 'No requirements.txt detected'
    $('pip-manual-row').style.display = 'block'
  }
}

// ── Add project ────────────────────────────────────────────────────────────
async function addProject() {
  const data = await window.terrarium.pickFolder()
  if (!data) return
  const existing = projects.find(p => p.path === data.path)
  if (existing) {
    selectProject(existing.id)
    return
  }
  const project = { id: genId(), ...data }
  projects.push(project)
  saveProjects()
  renderSidebar(searchBox.value)
  selectProject(project.id)
}

function removeProject(id) {
  const p = getProject(id)
  if (!p) return
  // Stop if running
  if (runningApps[id]) {
    window.terrarium.stopApp({ projectPath: p.path })
    clearAppState(id)
  }
  projects = projects.filter(p => p.id !== id)
  saveProjects()
  if (activeProjectId === id) {
    activeProjectId = projects.length ? projects[0].id : null
    if (activeProjectId) selectProject(activeProjectId)
    else showEmptyState()
  }
  renderSidebar(searchBox.value)
}

// ── Run / Stop ─────────────────────────────────────────────────────────────
async function startApp(p) {
  const entryPoint = customEntry.value.trim() || entrySelect.value
  if (!entryPoint) {
    appendLog('info', 'No entry point selected. Please pick or type a .py file.\n')
    switchTab('logs')
    return
  }

  let runMode = runModeSelect.value
  if (runMode === 'auto') {
    runMode = detectRunMode(entryPoint)
  }

  appendLog('info', `Starting: ${entryPoint} [${runMode}]\n`)
  switchTab('logs')

  const result = await window.terrarium.startApp({
    projectPath: p.path,
    entryPoint,
    runMode,
    venvPath: p.venvPath || null,
  })

  if (!result.success) {
    appendLog('stderr', `Failed to start: ${result.error}\n`)
    return
  }

  runningApps[p.id] = { port: null, startTime: Date.now(), uptimeTimer: null }
  runningApps[p.id].uptimeTimer = setInterval(() => {
    if (activeProjectId === p.id) {
      const app = runningApps[p.id]
      if (app) uptimeDisplay.textContent = formatUptime(Date.now() - app.startTime)
    }
  }, 1000)

  renderRunState(p)
  renderSidebar(searchBox.value)
}

async function stopApp(p) {
  await window.terrarium.stopApp({ projectPath: p.path })
}

function detectRunMode(entryPoint) {
  const e = entryPoint.toLowerCase()
  if (e === 'manage.py') return 'django'
  if (e.includes('streamlit')) return 'streamlit'
  if (e === 'app.py' || e === 'run.py') return 'flask'
  return 'script'
}

function clearAppState(id) {
  const app = runningApps[id]
  if (app && app.uptimeTimer) clearInterval(app.uptimeTimer)
  delete runningApps[id]
}

// ── Logs ───────────────────────────────────────────────────────────────────
function appendLog(type, text) {
  const wasEmpty = logPanel.children.length === 1 && logPanel.querySelector('.log-muted')
  if (wasEmpty) logPanel.innerHTML = ''

  const span = document.createElement('span')
  span.className = `log-${type}`
  span.textContent = text
  logPanel.appendChild(span)

  if (autoScroll) logPanel.scrollTop = logPanel.scrollHeight
}

function clearLogs() {
  logPanel.innerHTML = '<span class="log-muted">Log cleared.</span>'
}

// ── Task overlay ───────────────────────────────────────────────────────────
function showTaskOverlay(title) {
  taskModalTitle.textContent = title
  taskLogPanel.innerHTML = ''
  btnTaskClose.disabled = true
  taskOverlay.classList.add('visible')
}

function appendTaskLog(type, text) {
  const span = document.createElement('span')
  span.className = `log-${type}`
  span.textContent = text
  taskLogPanel.appendChild(span)
  taskLogPanel.scrollTop = taskLogPanel.scrollHeight
}

function closeTaskOverlay() {
  taskOverlay.classList.remove('visible')
}

async function runPipManual(p, packages) {
  if (!packages || !packages.trim()) return
  showTaskOverlay(`pip install ${packages}`)
  window.terrarium.removeAllListeners('task-log')
  window.terrarium.removeAllListeners('task-done')

  window.terrarium.onTaskLog(({ type, text }) => appendTaskLog(type, text))
  window.terrarium.onTaskDone(({ success, error }) => {
    if (success) {
      appendTaskLog('info', '\n✓ Installation complete.\n')
    } else {
      appendTaskLog('stderr', `\n✗ Error: ${error}\n`)
    }
    btnTaskClose.disabled = false
  })

  await window.terrarium.pipManual({ projectPath: p.path, venvPath: p.venvPath || null, packages })
}

async function runPipInstall(p) {
  showTaskOverlay('pip install -r requirements.txt')
  window.terrarium.removeAllListeners('task-log')
  window.terrarium.removeAllListeners('task-done')

  window.terrarium.onTaskLog(({ type, text }) => appendTaskLog(type, text))
  window.terrarium.onTaskDone(({ success, error }) => {
    if (success) {
      appendTaskLog('info', '\n✓ Installation complete.\n')
    } else {
      appendTaskLog('stderr', `\n✗ Error: ${error}\n`)
    }
    btnTaskClose.disabled = false
  })

  await window.terrarium.pipInstall({ projectPath: p.path, venvPath: p.venvPath || null })
}

async function runCreateVenv(p) {
  showTaskOverlay('Creating virtual environment…')
  window.terrarium.removeAllListeners('task-log')
  window.terrarium.removeAllListeners('task-done')

  window.terrarium.onTaskLog(({ type, text }) => appendTaskLog(type, text))
  window.terrarium.onTaskDone(async ({ success, error }) => {
    if (success) {
      appendTaskLog('info', '\n✓ venv created at ./venv\n')
      // Re-check venv
      const venv = await window.terrarium.checkVenv({ projectPath: p.path })
      p.hasVenv = venv.hasVenv
      p.venvPath = venv.venvPath
      p.venvName = venv.venvName
      if (venv.hasVenv) {
        const pyInfo = await window.terrarium.getPythonInfo({ projectPath: p.path, venvPath: venv.venvPath })
        p.pythonVersion = pyInfo.version
      }
      saveProjects()
      if (activeProjectId === p.id) showProjectView(p)
      renderSidebar(searchBox.value)
    } else {
      appendTaskLog('stderr', `\n✗ Error: ${error}\n`)
    }
    btnTaskClose.disabled = false
  })

  await window.terrarium.createVenv({ projectPath: p.path })
}

// ── Git ────────────────────────────────────────────────────────────────────
async function loadGit(p) {
  $('git-branch-badge').textContent = '…'
  $('git-file-list').innerHTML = '<span class="text-muted text-sm">Loading…</span>'
  $('commit-list').innerHTML = '<span class="text-muted text-sm">Loading…</span>'

  const data = await window.terrarium.gitStatus({ projectPath: p.path })
  gitData = data

  if (data.error && !data.branch) {
    $('git-branch-badge').textContent = 'No git repo'
    $('git-file-list').innerHTML = '<span class="text-muted text-sm">Not a git repository.</span>'
    $('commit-list').innerHTML = ''
    return
  }

  $('git-branch-badge').textContent = data.branch || '(unknown)'

  const aheadBadge = $('git-ahead-badge')
  const behindBadge = $('git-behind-badge')
  if (data.ahead > 0) { aheadBadge.style.display = ''; aheadBadge.textContent = `↑ ${data.ahead} ahead` }
  else aheadBadge.style.display = 'none'
  if (data.behind > 0) { behindBadge.style.display = ''; behindBadge.textContent = `↓ ${data.behind} behind` }
  else behindBadge.style.display = 'none'

  const fileList = $('git-file-list')
  fileList.innerHTML = ''
  if (data.files.length === 0) {
    fileList.innerHTML = '<span class="text-muted text-sm">Working tree clean.</span>'
  } else {
    for (const f of data.files) {
      const el = document.createElement('div')
      el.className = 'git-file-item'
      el.innerHTML = `<span class="git-status-badge git-status-${f.status}">${f.status}</span><span>${f.path}</span>`
      fileList.appendChild(el)
    }
  }

  const commitList = $('commit-list')
  commitList.innerHTML = ''
  const recentCommits = data.commits || data.recentCommits || []
  if (recentCommits.length === 0) {
    commitList.innerHTML = '<span class="text-muted text-sm">No commits found.</span>'
  } else {
    for (const c of recentCommits) {
      const el = document.createElement('div')
      el.className = 'commit-item'
      el.innerHTML = `
        <div class="commit-hash">${c.hash}</div>
        <div class="commit-msg">${c.message}</div>
        <div class="commit-meta">${c.author} · ${new Date(c.date).toLocaleDateString()}</div>
      `
      commitList.appendChild(el)
    }
  }
}

// ── Tab switching ──────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab)
  })
  document.querySelectorAll('.tab-panel').forEach(p => {
    const isActive = p.id === `tab-${tab}`
    p.classList.toggle('active', isActive)
    p.style.display = isActive ? 'flex' : 'none'
  })

  if (tab === 'git') {
    const p = getProject(activeProjectId)
    if (p) loadGit(p)
  }
}

// ── IPC event listeners ────────────────────────────────────────────────────
function setupIpcListeners() {
  window.terrarium.onAppLog(({ projectPath, type, text }) => {
    const p = projects.find(pr => pr.path === projectPath)
    if (!p || p.id !== activeProjectId) return
    appendLog(type, text)
  })

  window.terrarium.onAppPort(({ projectPath, port }) => {
    const p = projects.find(pr => pr.path === projectPath)
    if (!p) return
    if (runningApps[p.id]) {
      runningApps[p.id].port = port
    }
    if (p.id === activeProjectId) {
      portBadge.style.display = 'flex'
      portLabel.textContent = `Port :${port}`
      $('btn-open-browser').onclick = () => window.open(`http://localhost:${port}`)
    }
    appendLog('info', `\nServer running on http://localhost:${port}\n`)
  })

  window.terrarium.onAppStopped(({ projectPath, code }) => {
    const p = projects.find(pr => pr.path === projectPath)
    if (!p) return
    clearAppState(p.id)
    if (p.id === activeProjectId) {
      renderRunState(p)
      appendLog('info', `\nProcess exited (code ${code})\n`)
    }
    renderSidebar(searchBox.value)
  })
}

// ── Event wiring ───────────────────────────────────────────────────────────
function wireEvents() {
  $('add-project-btn').onclick = addProject
  $('empty-add-btn').onclick = addProject

  searchBox.addEventListener('input', () => renderSidebar(searchBox.value))

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  })

  runBtn.addEventListener('click', () => {
    const p = getProject(activeProjectId)
    if (!p) return
    if (runningApps[p.id]) stopApp(p)
    else startApp(p)
  })

  $('btn-open-editor').onclick = () => {
    const p = getProject(activeProjectId)
    if (p) window.terrarium.openEditor({ projectPath: p.path })
  }

  $('btn-open-finder').onclick = () => {
    const p = getProject(activeProjectId)
    if (p) window.terrarium.openFinder({ projectPath: p.path })
  }

  $('btn-pip-install').onclick = () => {
    const p = getProject(activeProjectId)
    if (p) runPipInstall(p)
  }

  $('btn-pip-manual').onclick = () => {
    const p = getProject(activeProjectId)
    if (!p) return
    const pkgs = $('pip-manual-input').value.trim()
    if (pkgs) runPipManual(p, pkgs)
  }

  $('pip-manual-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const p = getProject(activeProjectId)
      if (!p) return
      const pkgs = $('pip-manual-input').value.trim()
      if (pkgs) runPipManual(p, pkgs)
    }
  })

  document.querySelectorAll('.module-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const p = getProject(activeProjectId)
      if (!p) return
      if (chip.classList.contains('installing')) return
      chip.classList.add('installing')
      runPipManual(p, chip.dataset.pkg).finally(() => chip.classList.remove('installing'))
    })
  })

  $('btn-clear-logs').onclick = clearLogs

  $('autoscroll-toggle').addEventListener('change', (e) => {
    autoScroll = e.target.checked
  })

  btnTaskClose.onclick = closeTaskOverlay

  $('btn-git-pull').onclick = async () => {
    const p = getProject(activeProjectId)
    if (!p) return
    $('btn-git-pull').disabled = true
    $('btn-git-pull').textContent = 'Pulling…'
    const res = await window.terrarium.gitPull({ projectPath: p.path })
    $('btn-git-pull').disabled = false
    $('btn-git-pull').textContent = '↓ Pull'
    if (res.success) loadGit(p)
    else alert(`Pull failed: ${res.error}`)
  }

  $('btn-git-refresh').onclick = () => {
    const p = getProject(activeProjectId)
    if (p) loadGit(p)
  }

  $('btn-commit-push').onclick = async () => {
    const p = getProject(activeProjectId)
    if (!p) return
    const msg = $('commit-msg').value.trim()
    if (!msg) { alert('Please enter a commit message.'); return }
    $('btn-commit-push').disabled = true
    $('btn-commit-push').textContent = 'Pushing…'
    const res = await window.terrarium.gitPush({ projectPath: p.path, message: msg })
    $('btn-commit-push').disabled = false
    $('btn-commit-push').textContent = 'Commit & Push'
    if (res.success) {
      $('commit-msg').value = ''
      loadGit(p)
    } else {
      alert(`Push failed: ${res.error}`)
    }
  }

  $('btn-open-browser').onclick = () => {
    const p = getProject(activeProjectId)
    if (!p) return
    const app = runningApps[p.id]
    if (app && app.port) window.open(`http://localhost:${app.port}`)
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't fire shortcuts when typing in inputs
    const tag = document.activeElement.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return

    const isMeta = e.metaKey || e.ctrlKey

    if (isMeta && e.key === 'n') {
      e.preventDefault()
      addProject()
      return
    }

    switch (e.key) {
      case ' ':
        e.preventDefault()
        if (activeProjectId) {
          const p = getProject(activeProjectId)
          if (p) { if (runningApps[p.id]) stopApp(p); else startApp(p) }
        }
        break
      case 'l': case 'L': switchTab('logs'); break
      case 'g': case 'G': switchTab('git'); break
      case 'o': case 'O': switchTab('overview'); break
      case 'b': case 'B': {
        const p = getProject(activeProjectId)
        if (p && runningApps[p.id] && runningApps[p.id].port) {
          window.open(`http://localhost:${runningApps[p.id].port}`)
        }
        break
      }
    }
  })
}

// ── Boot ───────────────────────────────────────────────────────────────────
function init() {
  loadProjects()
  wireEvents()
  setupIpcListeners()
  renderSidebar()

  if (projects.length > 0) {
    selectProject(projects[0].id)
  } else {
    showEmptyState()
  }
}

init()

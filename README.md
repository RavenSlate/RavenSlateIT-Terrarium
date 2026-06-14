# Terrarium
**by RavenSlate IT** — Where automation meets support

A native macOS app for managing and running your Python apps without touching the terminal.

## Install

Download the latest `.dmg` from the [Releases page](#), open it, and drag Terrarium to your Applications folder.

**Requirements:**
- macOS (Apple Silicon or Intel)
- Python 3 — `brew install python`
- Node.js v18+ — `brew install node`
- Git for Git features

## Features

- Add any Python project and run it with one click
- Auto-detects virtual environments (`venv/`, `.venv/`, `env/`)
- Create a `venv` in-app if none exists
- Live log streaming with color-coded output
- Auto-detects localhost port from app output
- Uptime counter while app is running
- `pip install -r requirements.txt` button with live output — right from the app
- Open project in VS Code, Cursor, PyCharm, or Finder
- Git status, commit & push — all in-app
- Git pull with ahead/behind branch indicators
- Recent commit history view
- Run mode picker — Script, Flask, Django, Streamlit, FastAPI/Uvicorn
- Project search and filter in sidebar
- Projects persist between sessions
- macOS native — dark theme, hidden titlebar

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Run / stop app |
| `L` | Logs tab |
| `G` | Git tab |
| `O` | Overview tab |
| `B` | Open in browser |
| `⌘ N` | Add project |

## Run from Source

```bash
git clone https://github.com/ravenslate/ravenslateit-terrerium.git
cd ravenslateit-terrerium
npm install
npm start
```

## Project Structure

```
├── src/
│   ├── main.js        # Electron main process
│   └── preload.js     # Context bridge (IPC)
├── public/
│   ├── index.html     # UI
│   ├── renderer.js    # UI logic
│   └── icon.png       # App icon
└── package.json
```

## Notes

- Git push uses the project's existing remote (`origin`). Make sure you've authenticated with GitHub (SSH key or credential helper).
- Port detection is automatic — Terrarium reads the app output and picks up `localhost:PORT` from the logs.
- If a `venv` is detected, Terrarium automatically uses its Python and pip — no manual activation needed.

RavenSlate IT © 2026

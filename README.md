# Terrarium
**by RavenSlate IT** — Where automation meets support

A native macOS app for managing and running your Python apps without touching the terminal.

## Install

Download the latest `.dmg` from the [Releases page](#), open it, and drag Terrarium to your Applications folder.

**Requirements:**
- macOS (Apple Silicon or Intel)
- Python 3 — `brew install python`
- Git for Git features

## Features

- Add any Python project folder and run it with one click
- Auto-detects virtual environments (`venv/`, `.venv/`, `env/`)
- Create a `venv` in-app if none exists
- Detects entry points: `main.py`, `app.py`, `run.py`, `server.py`, `manage.py`, `streamlit_app.py`
- Multiple run modes: Script, Flask, Django, Streamlit, FastAPI/Uvicorn
- Live log streaming with color-coded output (stdout / stderr)
- Auto-detects localhost port from app output
- Uptime counter while app is running
- `pip install -r requirements.txt` — right from the app, with live output
- Open project in VS Code, Cursor, PyCharm, or Finder
- Git status, commit & push — all in-app
- Git pull with ahead/behind branch indicators
- Recent commit history view
- Project search and filter in sidebar
- Projects persist between sessions
- macOS native — dark theme, hidden titlebar

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Run / Stop app |
| `L` | Logs tab |
| `G` | Git tab |
| `O` | Overview tab |
| `B` | Open in browser |
| `⌘ N` | Add project |

## Build a DMG

```bash
git clone https://github.com/ravenslate/ravenslateit-terrerium.git
cd ravenslateit-terrerium
npm install
npm run build
```

The `.dmg` and `.zip` will appear in the `dist/` folder.

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
│   ├── index.html     # UI + styles
│   ├── renderer.js    # UI logic
│   └── icon.png       # App icon
└── package.json
```

## Run Modes

| Mode | What it runs |
|------|-------------|
| Auto-detect | Infers mode from entry point name |
| Script | `python3 <file>` |
| Flask | `flask run` (sets `FLASK_APP`) |
| Django | `python manage.py runserver` |
| Streamlit | `streamlit run <file>` |
| FastAPI / Uvicorn | `uvicorn <module>:app --reload` |

## Notes

- If a `venv` is detected, Terrarium automatically uses its Python and pip — no activation needed.
- Port detection is automatic — Terrarium reads app output and picks up `localhost:PORT` from the logs.
- Git push uses the project's existing remote (`origin`). Make sure you've authenticated with GitHub (SSH key or credential helper).

---

RavenSlate IT © 2025

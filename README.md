# Terrarium
**by RavenSlate IT** — Where automation meets support

A native macOS app for managing and running Python apps — no terminal required.

---

## Install

1. Download **Terrarium-[version]-arm64.dmg** from the [Releases page](https://github.com/RavenSlate/RavenSlateIT-Terrarium/releases)
2. Open the `.dmg` and drag Terrarium to your **Applications** folder
3. Launch Terrarium from Applications or Spotlight

> **Apple Silicon only** (M1/M2/M3/M4). macOS 13 Ventura or later recommended.

**Python is required** — if you don't have it:
```bash
brew install python
```
Don't have Homebrew? Get it at [brew.sh](https://brew.sh).

---

## Features

- Add any local Python project and run it with one click
- Auto-detects virtual environments (`venv/`, `.venv/`, `env/`) — no manual activation needed
- Create a new `venv` inside the app if none exists
- `pip install -r requirements.txt` with live output
- Manual package install — type any package name and install it directly
- Quick-install Modules card — one-click buttons for common packages (AI/LLM, web frameworks, data, HTTP, and more)
- Interactive input support — scripts that call `input()` work; type your response right in the Logs tab
- Live log streaming with color-coded stdout/stderr
- Auto-detects localhost port from app output and shows an **Open in Browser** button
- Run mode picker — Script, Flask, Django, Streamlit, FastAPI/Uvicorn
- Open project in VS Code, Cursor, PyCharm, or Finder with one click
- Git status, commit & push — all in-app
- Git pull with ahead/behind indicators and recent commit history
- Project search and filter in sidebar
- Projects persist between sessions
- macOS native — dark theme, hidden titlebar

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Run / stop the active app |
| `L` | Switch to Logs tab |
| `G` | Switch to Git tab |
| `O` | Switch to Overview tab |
| `B` | Open running app in browser |
| `⌘ N` | Add a new project |

---

## Tips

**Virtual environments**
Terrarium auto-detects your `venv` and uses its Python and pip automatically. If your project doesn't have one, click **+ Create venv** on the Overview tab.

**Installing packages**
If your project has a `requirements.txt`, use the **pip install** button. If it doesn't, use the **Modules** card for one-click installs of common packages, or type package names manually in the install field.

**Interactive scripts**
If your Python script asks for input (e.g. `input("Enter your name:")`), just switch to the Logs tab while it's running — there's a text field at the bottom to send your response.

**Git**
The Git tab uses your project's existing `origin` remote. Make sure you've authenticated with GitHub (SSH key or credential helper) before pushing.

**Port detection**
Terrarium reads your app's output and automatically picks up `localhost:PORT` — no configuration needed.

---

## Run from Source

```bash
git clone https://github.com/ravenslate/ravenslateit-terrerium.git
cd ravenslateit-terrerium
npm install
npm start
```

Requires Node.js v18+ (`brew install node`).

---

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

---

RavenSlate IT © 2026

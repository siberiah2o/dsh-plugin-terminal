# dsh-plugin-terminal

> A bottom terminal panel plugin for the DeepSeek Harness (DSH) Web GUI — a real, interactive multi-tab shell pinned to the bottom of the page (ConPTY on Windows, openpty on Linux/macOS).

[中文](README.zh.md) · [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Screenshots

| Collapsed bar | Expanded panel | Multi-tab |
|---|---|---|
| ![collapsed](docs/screenshot-collapsed.png) | ![panel](docs/screenshot-panel.png) | ![multitab](docs/screenshot-multitab.png) |

## Features

- **Bottom terminal panel**: pinned to the bottom of the viewport; width tracks the conversation column automatically (side rails are never covered); **the input dialog always floats above the terminal**, so expanding the panel never blocks conversation input
- **Toggle & resize**: click the bottom bar, or press `Ctrl+`` to toggle; drag the grip on top of the panel to resize (120px ~ 78% of the viewport, persisted in `localStorage`)
- **Multi-tab**: `+` opens a new terminal, each tab owns an independent PTY session and scrollback, switching tabs never interrupts processes, ✕ closes, ⟳ restarts in place; **refreshing the page restores every live session as a tab**
- **Full terminal experience**: xterm.js 6 — colors, blinking cursor, alternate screen (vim/htop), Unicode width, 5000-line scrollback
- **Low latency**: WebSocket duplex channel straight to the PTY
- **Dark terminal surface** (Windows Terminal palette): ANSI colors stay readable in both light and dark DSH themes

### FAQ

| Symptom | Fix |
|---|---|
| PTY spawn fails (`posix_spawnp failed`) | node-pty's prebuilt `spawn-helper` lost its executable bit: `chmod +x <repo>/node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/<platform>-<arch>/spawn-helper` |
| pnpm says `Ignored build scripts: node-pty` | add `onlyBuiltDependencies` (see Install) to the profile's `pnpm-workspace.yaml`, then re-run install |
| Panel missing after refresh | make sure the plugin is in the layer stack (`dsh --profile web --dump-config` contains `terminal-panel`) and `dsh web` was restarted |

## Install

Prereq: `dsh` installed with a web profile initialized (`~/.dsh/profiles/web`); `pnpm` required (`dsh plugin` forwards its args to pnpm).

### One-line install (npm package)

```sh
# installs as an official bundle (declares dsh.bundle) - no manual config needed
dsh plugin --profile web add dsh-plugin-terminal

# restart to activate
# (if pnpm reports "Ignored build scripts: node-pty", first add this to the
#  profile's pnpm-workspace.yaml, then re-run the add command:)
# onlyBuiltDependencies:
#   - node-pty
dsh web
```

### Local / development install (source changes apply live)

```sh
dsh plugin --profile web add -w --link <repo path>
dsh web
```

Try it without touching the profile (separate port):

```sh
dsh --profile web --patch <repo path>/cordis.patch.yml --port 3081
```

> **Effect scope**: client bundle (`lib/client.js`) changes apply on page refresh; **host changes (`lib/index.js`) require restarting `dsh web`** (routes/WS endpoints register at startup).

## License

MIT

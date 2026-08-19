# dsh-plugin-terminal

Bottom terminal panel for the DeepSeek Harness (DSH) Web GUI — an interactive multi-tab shell pinned to the bottom of the page (ConPTY on Windows, openpty on Linux/macOS).

[中文](README.zh.md) · MIT

## Install

```sh
dsh plugin --profile web add dsh-plugin-terminal && dsh web
```

> Note: this is a DSH (DeepSeek Harness) plugin — do **not** use plain `npm i dsh-plugin-terminal`; it must be installed through `dsh plugin` to activate.

## Screenshots

| Collapsed | Expanded | Multi-tab |
|---|---|---|
| ![collapsed](https://raw.githubusercontent.com/siberiah2o/dsh-plugin-terminal/main/docs/screenshot-collapsed.png) | ![panel](https://raw.githubusercontent.com/siberiah2o/dsh-plugin-terminal/main/docs/screenshot-panel.png) | ![multitab](https://raw.githubusercontent.com/siberiah2o/dsh-plugin-terminal/main/docs/screenshot-multitab.png) |

## Features

- Bottom panel pinned to the viewport, aligned with the conversation column; the input box always stays above the terminal
- `Ctrl+`` toggles; drag the top grip to resize (120px–78% viewport, remembered)
- Multi-tab: `+` new, ✕ close, ⟳ restart; processes keep running on tab switch; live sessions restore after refresh or workspace switch
- Every terminal remembers its working directory: new tabs start in the current DSH workspace; after a `dsh web` restart, ⟳ brings the process back in its original directory instead of the server launch directory
- **Terminals survive dsh web restarts**: session metadata + scrollback are persisted live to `$DSH_HOME/plugin-data/terminal/`; after a restart they come back as "exited" history tabs (full screen replay, one-click restart of the process); tabs you closed stay closed
- xterm.js 6: colors, blinking cursor, alternate screen, Unicode v11 (CJK width tables), 10000-line scrollback
- WebSocket duplex channel to the PTY; dark terminal surface in both light and dark themes
- Copy/paste: select with the mouse and release to copy, right-click to paste; `Ctrl+V` pastes, `Ctrl+Shift+C` / `Ctrl+Shift+V` copy/paste when the clipboard API is available
  - ⚠️ When the GUI is opened over **remote http** (not https / not localhost) browsers disable `navigator.clipboard` (insecure context) - the plugin falls back to `execCommand` copy and lets the browser's native context-menu Paste through, so both still work

## Running codex / claude code in the panel

These AI coding CLIs are full-screen TUIs (ANSI escapes + alternate screen + truecolor) and demand a lot from the terminal link. The plugin is tuned for them:

- Child env gets TERM=xterm-256color and COLORTERM=truecolor (when unset), plus LANG/LC_ALL=en_US.UTF-8 and PYTHONIOENCODING=utf-8 on non-Windows, preventing 256-color fallback and CJK mojibake
- xterm.js 6 answers OSC 10/11/12 queries out of the box (Codex theme detection via background-color query just works)
- unicodeVersion "11" keeps mixed CN/EN output aligned; drawBoldTextInBrightColors: false keeps true colors on bold text; CJK fallbacks in the font stack; 10000-line scrollback (500k-char server ring buffer)

If rendering still misbehaves:

- **Claude Code**: run /tui fullscreen in the session (or CLAUDE_CODE_NO_FLICKER=1 claude) to switch to the flicker-free fullscreen renderer; /tui default reverts
- **Inside tmux**: make sure TERM=tmux-256color and tmux >= 3.4, add `set -ga terminal-overrides ',xterm-256color:RGB'` if needed
- **Windows mojibake**: use Windows Terminal, chcp 65001, enable the "Beta: Use Unicode UTF-8" system option; fall back to WSL if it persists
- **Update the CLI**: most rendering bugs are regressions already fixed in newer versions

## License

MIT

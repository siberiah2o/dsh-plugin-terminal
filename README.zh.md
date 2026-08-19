# dsh-plugin-terminal

DeepSeek Harness (DSH) Web GUI 的底部终端面板插件 —— 在页面底部挂一个真正可交互的多标签 shell（Windows 走 ConPTY，Linux/macOS 走 openpty）。

[English](README.md) · MIT

## 安装

```sh
dsh plugin --profile web add dsh-plugin-terminal && dsh web
```

> 注意：这是 DSH（DeepSeek Harness）插件——**不要**用普通 `npm i dsh-plugin-terminal`，必须通过 `dsh plugin` 安装才会被加载。

## 截图

| 折叠 | 展开 | 多标签 |
|---|---|---|
| ![折叠](docs/screenshot-collapsed.png) | ![展开](docs/screenshot-panel.png) | ![多标签](docs/screenshot-multitab.png) |

## 说明

- 底部终端面板：贴底固定，宽度对齐对话列；输入框始终在终端上方
- `Ctrl+`` 展开/收起；拖拽顶部 grip 调整高度（120px–78% 视口，自动记忆）
- 多标签：`+` 新建、✕ 关闭、⟳ 重启；切 tab 不中断进程，刷新或切换工作区自动恢复会话
- 每个终端记住自己的工作目录：新建终端落在当前 DSH 工作区；`dsh web` 重启后点 ⟳ 仍回到原目录，而不是服务端启动目录
- **重启 dsh web 不丢终端**：会话元数据 + 滚动缓冲实时落盘（`$DSH_HOME/plugin-data/terminal/`），重启后恢复为"已退出"历史标签（画面完整回放，点 ⟳ 一键重启进程）；手动关闭的标签不留痕
- xterm.js 6：颜色、闪烁光标、备用屏幕、Unicode v11（CJK 宽度表）、10000 行回滚
- WebSocket 直连 PTY，低延迟；深浅主题下终端颜色均可读
- 复制粘贴：拖选后松开鼠标自动复制，右键粘贴；`Ctrl+V` 粘贴、`Ctrl+Shift+C` / `Ctrl+Shift+V` 复制/粘贴（剪贴板 API 可用时）
  - ⚠️ 通过**远程 http**（非 https / 非 localhost）访问 GUI 时，浏览器会禁用 `navigator.clipboard`（非安全上下文）——插件会自动退回 `execCommand` 复制、并放行浏览器原生右键菜单粘贴，两种方式都能用

## 在面板里运行 codex / claude code

这类 AI 编码 CLI 是全屏式 TUI（ANSI 转义序列 + 备用屏幕 + truecolor），对终端链路要求高。本插件已针对它们做了渲染调优：

- 子进程环境注入 TERM=xterm-256color、COLORTERM=truecolor（缺失时），非 Windows 下补 LANG/LC_ALL=en_US.UTF-8、PYTHONIOENCODING=utf-8，避免 256 色降级和中英文乱码
- xterm.js 6 内置 OSC 10/11/12 应答（Codex 查询终端背景色做主题适配可直接工作）
- unicodeVersion: "11" 保证中英混排不串位；drawBoldTextInBrightColors: false 保持粗体真实颜色；字体链带 CJK 兜底；回滚 10000 行（服务端环形缓冲 500k 字符）

仍遇到渲染问题时的建议：

- **Claude Code**：在会话里运行 /tui fullscreen（或 CLAUDE_CODE_NO_FLICKER=1 claude）切到全屏渲染，解决闪烁、滚动跳顶、resize 错乱；/tui default 切回
- **tmux 里跑**：确认 TERM=tmux-256color、tmux ≥ 3.4，必要时 set -ga terminal-overrides ',xterm-256color:RGB'
- **Windows 中文乱码**：用 Windows Terminal，chcp 65001，系统区域设置勾选"Beta: 使用 Unicode UTF-8"；仍乱码就在 WSL 里跑
- **升级到最新版**：多数渲染问题是工具自身的回归 bug，已在新版本修复

## License

MIT

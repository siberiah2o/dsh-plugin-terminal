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
- 多标签：`+` 新建、✕ 关闭、⟳ 重启；切 tab 不中断进程，刷新自动恢复会话
- xterm.js 6：颜色、闪烁光标、备用屏幕、Unicode、5000 行回滚
- WebSocket 直连 PTY，低延迟；深浅主题下终端颜色均可读

## License

MIT

# dsh-plugin-terminal

> DeepSeek Harness (DSH) Web GUI 的底部终端面板插件 —— 在输入框下方挂一个真正可交互的 shell（Windows 走 ConPTY，Linux/macOS 走 openpty）。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 它是什么

一个 Cordis 双端插件：

- **Host 端**（`lib/index.js`）：用 [node-pty](https://github.com/microsoft/node-pty) 管理 PTY 会话，在 `ctx.webServer` 上注册 `/terminal-panel/*` 路由（REST + SSE）。
- **Client 端**（`lib/client.js`）：以 `window.__ModuleLoader__` bundle 形式加载，注册进 DSH 的 `conversation.input.dock` slot（todo/queue 停靠条的同款位置），提供折叠条 + 终端面板 + 输入行。

### 为什么不直接用 `ctx.terminals` / `ctx.subprocess.spawnTerminal()`

上游 `dsh-subprocess-local` 的终端进程检查器只支持 Linux/macOS，Windows 上 `spawnTerminal` 直接抛错（terminal inspection is unsupported on platform win32）。本插件绕过该 seam 直接持有 node-pty（1.1.0 自带 win32 ConPTY 预编译），因此在三个平台都能用。待上游补齐 Windows 检查器后可以切回 seam。

## 功能

- 输入框下方的停靠条，点击展开/折叠；终端会话在折叠和切换会话时保持存活（host 持有）
- SSE 实时输出流 + 快照回放（重连不断档）
- 输入行支持 Enter 发送、Tab 补全、↑/↓ 历史、Ctrl+C 中断
- 面板尺寸变化自动 resize PTY（按字符宽度测量）
- 重新开始 / 关闭会话；刷新页面后自动重连最新存活会话
- 行级终端模拟：ANSI 清洗 + `\r` 覆盖重绘 + 清屏后光标占位抑制（纯文本渲染，xterm.js 全屏渲染在路线图上）

## 安装

前置：已安装 `dsh` 并初始化过 web profile（`~/.dsh/profiles/web`）。

```powershell
# 1. 把本包链接进 profile（开发模式，改代码即时生效）
dsh plugin --profile web add -w --link <本仓库路径>

# 2. 把 cordis.patch.yml 里的 insert 行并入 profile 的 patch 层：
#    ~/.dsh/profiles/web/cordis.patch.yml
- insert:
  - id: terminal-panel
    name: dsh-plugin-terminal

# 3. 重启
dsh web
```

只想临时试用（不动 profile 配置，另起端口）：

```powershell
dsh --profile web --patch <本仓库路径>/cordis.patch.yml --port 3081
```

> Windows 注意：`--patch` 覆盖层里引用本地 `.ts/.js` 文件时，绝对路径必须写成 `file:///E:/...` URL；引用已安装包名（如本插件）则无此问题。

## API（host 路由）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/terminal-panel/sessions` | 列出会话 |
| POST | `/terminal-panel/sessions` | 创建（body: `{cols?, rows?, cwd?, shell?}`） |
| GET | `/terminal-panel/sessions/:id/stream` | SSE：`snapshot` / `data` / `exit` 事件 |
| POST | `/terminal-panel/sessions/:id/input` | 写入（body: `{data}`，`\r` 为回车） |
| POST | `/terminal-panel/sessions/:id/resize` | 调整尺寸（body: `{cols, rows}`） |
| DELETE | `/terminal-panel/sessions/:id` | 关闭会话 |

## 开发

```powershell
node tests/test-e2e.mjs     # 对运行中的实例做 PTY 全链路测试（先起 3081 测试实例）
node tests/test-client.mjs  # 模拟浏览器加载 client bundle 并做静态渲染冒烟
```

包声明见 `package.json` 的 `dsh.client` 字段（platform: web，惰性加载）；client bundle 遵循 DSH 的 `window.__ModuleLoader__.load` 工厂格式。

## 路线图

- [ ] xterm.js 全屏渲染（canvas + 转义序列完整支持）
- [ ] 多会话标签页
- [ ] 上游 `dsh-terminal` seam 补齐 Windows 后切换到 `ctx.terminals`
- [ ] 滚动回看分页（服务端 ring buffer 分页读取）

## License

MIT

# dsh-plugin-terminal

> DeepSeek Harness (DSH) Web GUI 的 **Codex 式底部终端面板**插件 —— 在页面底部挂一个真正可交互的多标签 shell（Windows 走 ConPTY，Linux/macOS 走 openpty）。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 它是什么

一个 Cordis 双端插件：

- **Host 端**（`lib/index.js`）：用 [node-pty](https://github.com/microsoft/node-pty) 管理 PTY 会话，在 `ctx.webServer` 上注册 `/terminal-panel/*` 路由（REST + SSE + WebSocket）。
- **Client 端**（`lib/client.js`）：以 `window.__ModuleLoader__` bundle 形式加载，注册进 DSH 的 `conversation.input.dock` slot，渲染为**固定在视口底部的全功能终端面板**。

### 为什么不直接用 `ctx.terminals` / `ctx.subprocess.spawnTerminal()`

上游 `dsh-subprocess-local` 的终端进程检查器只支持 Linux/macOS，Windows 上 `spawnTerminal` 直接抛错（terminal inspection is unsupported on platform win32）。本插件绕过该 seam 直接持有 node-pty（1.1.0 自带 win32 ConPTY 预编译），因此在三个平台都能用。待上游补齐 Windows 检查器后可以切回 seam。

## 功能

- **Codex 式底部面板**：贴底 `position: fixed`，宽度实时对齐中间对话列（拖拽/折叠侧栏、开关右侧栏时自动跟随，不覆盖侧栏）；**输入框永远悬浮在终端上方**，展开面板不影响对话输入
- **快捷键与交互**：`Ctrl+`` 一键展开/收起；拖拽面板顶部 grip 调整高度（120px ~ 78% 视口，记忆到 `localStorage`）；折叠时是一条 34px 细条，显示当前会话状态
- **多标签页**：`+` 新建终端、每 tab 独立 PTY 会话与回滚、切 tab 不中断进程、✕ 关闭、⟳ 原位重启；**刷新页面自动恢复全部存活会话**
- **xterm.js 6 完整 VT 仿真**：颜色、闪烁光标、备用屏幕（vim/htop 全屏程序）、Unicode 宽度、5000 行回滚——与原生终端一致
- **WebSocket 双向通道**（`ws`）：低延迟、与 PTY 直连；HTTP/SSE 路由保留为兼容面
- **`@xterm/addon-fit`**：面板尺寸变化时按字符网格精确 resize PTY
- **暗色终端表面**：Windows Terminal "Campbell" 调色板，深浅主题下所有 ANSI 颜色均可读
- 客户端 bundle 自包含（xterm.js 内嵌，~360KB），通过 esbuild 构建（`build.mjs`）

> UI 截图待更新（面板已改为 Codex 式底部布局）。

## 安装

前置：已安装 `dsh` 并初始化过 web profile（`~/.dsh/profiles/web`）；需要 `pnpm`（`dsh plugin` 会把参数转发给 pnpm）。

```powershell
# 1. 把本包链接进 profile（开发模式，改代码即时生效）
dsh plugin --profile web add -w --link <本仓库路径>

# 2. 把 cordis.patch.yml 里的 insert 行并入 profile 的 patch 层：
#    ~/.dsh/profiles/web/cordis.patch.yml
- insert:
  - id: terminal-panel
    name: dsh-plugin-terminal

# 3. 首次安装需放行 node-pty 原生构建脚本（pnpm 10+ 默认拦截）：
#    在本仓库的 pnpm-workspace.yaml 中加入
onlyBuiltDependencies:
  - node-pty
#    然后安装插件依赖
pnpm install

# 4. 重启
dsh web
```

只想临时试用（不动 profile 配置，另起端口）：

```powershell
dsh --profile web --patch <本仓库路径>/cordis.patch.yml --port 3081
```

> **Windows 注意**：`--patch` 覆盖层里引用本地 `.ts/.js` 文件时，绝对路径必须写成 `file:///E:/...` URL；引用已安装包名（如本插件）则无此问题。

> **生效范围**：client bundle（`lib/client.js`）的改动刷新页面即可生效；**host 端（`lib/index.js`）的改动需要重启 `dsh web`**（新路由/WS 端点注册发生在启动期）。

## 疑难排查

| 症状 | 处理 |
|---|---|
| PTY 启动失败（`posix_spawnp failed`） | node-pty 预编译的 `spawn-helper` 有时丢失可执行位：`chmod +x <repo>/node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/<platform>-<arch>/spawn-helper` |
| pnpm 提示 `Ignored build scripts: node-pty` | 按安装第 3 步在 `pnpm-workspace.yaml` 声明 `onlyBuiltDependencies` 后重跑 `pnpm install` |
| 刷新后面板不出现 | 确认 patch 层已生效（`dsh --profile web --dump-config` 应含 `terminal-panel`），并已重启 `dsh web` |

## API（host 路由）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/terminal-panel/sessions` | 列出会话 |
| POST | `/terminal-panel/sessions` | 创建（body: `{cols?, rows?, cwd?, shell?}`） |
| GET | `/terminal-panel/sessions/:id/stream` | SSE（兼容面）：`snapshot` / `data` / `exit` 事件 |
| GET | `/terminal-panel/sessions/:id/snapshot` | 原始字节缓冲（xterm 回放） |
| WS | `/terminal-panel/ws/:id` | 双向通道：PTY 输出下行、输入/resize 上行 |
| GET | `/terminal-panel/xterm.css` | xterm 样式表 |
| POST | `/terminal-panel/sessions/:id/input` | 写入（body: `{data}`，`\r` 为回车） |
| POST | `/terminal-panel/sessions/:id/resize` | 调整尺寸（body: `{cols, rows}`） |
| DELETE | `/terminal-panel/sessions/:id` | 关闭会话 |

## 开发

```powershell
node build.mjs              # esbuild 构建客户端 bundle（xterm 内嵌 -> lib/client.js + lib/client.css）
node tests/test-e2e.mjs     # 对运行中的实例做 PTY 全链路测试（先起 3081 测试实例）
```

包声明见 `package.json` 的 `dsh.client` 字段（platform: web，惰性加载）；client bundle 遵循 DSH 的 `window.__ModuleLoader__.load` 工厂格式。

## 路线图

- [ ] xterm.js 全屏渲染（canvas + 转义序列完整支持）
- [ ] 上游 `dsh-terminal` seam 补齐 Windows 后切换到 `ctx.terminals`
- [ ] 滚动回看分页（服务端 ring buffer 分页读取）

## License

MIT

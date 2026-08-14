# dsh-plugin-terminal

> DeepSeek Harness (DSH) Web GUI 的底部终端面板插件 —— 在页面底部挂一个真正可交互的多标签 shell（Windows 走 ConPTY，Linux/macOS 走 openpty）。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 用户说明

- **底部终端面板**：固定在页面底部，宽度自动对齐对话列（不覆盖左侧栏/右侧栏）；**输入框始终在终端上方**，展开面板不影响对话输入
- **展开/收起**：点击底部细条，或按 `Ctrl+``（反引号键）一键切换；折叠时细条显示当前会话状态
- **调整高度**：拖拽面板顶部的 grip，高度范围 120px ~ 78% 视口，拖完自动记忆（`localStorage`）
- **多标签页**：`+` 新建终端、✕ 关闭、⟳ 原位重启；每个标签独立会话，切换不中断进程；**刷新页面自动恢复全部存活会话**
- **完整终端体验**：xterm.js 6 仿真——颜色、闪烁光标、备用屏幕（vim/htop 全屏程序）、Unicode 宽度、5000 行回滚
- **低延迟**：WebSocket 双向通道与 PTY 直连
- **暗色终端表面**（Windows Terminal 调色板）：深浅主题下所有终端颜色均可读

### 常见问题

| 症状 | 处理 |
|---|---|
| PTY 启动失败（`posix_spawnp failed`） | node-pty 预编译的 `spawn-helper` 丢失可执行位：`chmod +x <repo>/node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/<platform>-<arch>/spawn-helper` |
| pnpm 提示 `Ignored build scripts: node-pty` | 在 `pnpm-workspace.yaml` 声明 `onlyBuiltDependencies`（见安装第 3 步）后重跑 `pnpm install` |
| 刷新后面板不出现 | 确认 patch 层已生效（`dsh --profile web --dump-config` 应含 `terminal-panel`），并已重启 `dsh web` |

## 安装说明

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

## License

MIT

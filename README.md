# DSH "底部终端面板" 插件 — 起步指南

> 目标：在 DSH Web GUI（http://127.0.0.1:3080）底部加一个可交互的终端面板（类似 VS Code 集成终端）。

## 0. 心智模型（来自官方文档）

- DSH 底层是 **Cordis 插件框架**：产品的一切（模型适配器、工具、会话日志、agent loop 本身）都是插件。
- **Host 端**（Node 进程）：服务、工具、事件。**Client 端**（浏览器）：Web UI，通过 Slot 系统注册界面。
- 浏览器插件包在 package.json 里声明 `dsh.client`，构建出 `/plugins/<id>/client.js` bundle，由 `window.__DSH_BOOT__` 图加载。
- 另有一条 **动态 Cordis 插件** 通道（`cordis_define` / `cordis_run` 工具）：纯 JS、免构建、会话内即时生效，适合原型。

## 1. 本机事实（已验证）

| 项 | 值 |
|---|---|
| DSH_HOME | `C:\Users\Administrator\.dsh` |
| web profile | `C:\Users\Administrator\.dsh\profiles\web`（用户 patch 层：其 `cordis.patch.yml`，当前为 `[]`） |
| 已挂载（与终端相关） | `dsh-subprocess-local`（`ctx.subprocess`，含 `spawnTerminal` PTY）、`dsh-sandbox-local` |
| 未挂载 | `dsh-terminal`（`ctx.terminals` seam）、`dsh-terminal-bash`（shell 后端）、`dsh-tool-terminal` |
| 动态插件运行时 | `dsh-cordis-host-runner` / `dsh-cordis-client-runner` / `dsh-client-ui-cordis` 均已挂载 |

## 2. 两条路线

### 路线 A：动态 Cordis 插件（今天就能看到效果，推荐先走）

1. 新建/切换会话的 agent preset 到 **`cordis`**（自带 `cordis_*` 工具集与 `cordis-plugin-development` 技能）。
2. 让 agent：
   - `cordis_inspect_list` → 查 Host/Client Providers；
   - `Slots.listSubTree` → 在 `dsh-client-ui-layout` 壳里找底部面板挂载点（不要猜 slot 名）；
   - `cordis_define` 提交 `code.host` + `code.client`，`cordis_run` 激活（首次需在 Run 卡上勾选授权）。
3. Host 端两种选择：
   - 直接 `ctx.get('subprocess')` → `spawnTerminal`（本机已挂载，最省事）；
   - 或先在 profile patch 里插入 `@deepseek-ai/dsh-terminal` + `dsh-terminal-bash`，用 `ctx.terminals`（spawn/startSend/read/signal/kill，带就绪检测与会话治理）。
4. Client→Host RPC：Host `harness.handle('term.write', ...)`，Client `host.call('term.write', ...)`，参数必须纯 JSON。
5. 限制：动态插件客户端是纯 JS + `React.createElement`，**不能 import xterm.js**——原型阶段用行式渲染（pre + 滚动）足够验证交互。

### 路线 B：正式插件包（可持久、可发布、能捆绑 xterm.js）

1. 按"新增 workspace 包"清单建包：https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-package
2. client 侧：package.json 声明 `dsh.client`（`platform: 'web'`），`exports["./client"]` 指向 tsdown 构建的 bundle（共享 preset `packages/client/tsdown.client.ts`）；细节见仓库 `packages/client/AGENTS.md`。
3. 安装到 profile：`dsh plugin --profile web add <本地包路径>`（经 pnpm 装进 profile 的 node_modules），或在 profile 的 `cordis.patch.yml` 里 `insert`。
4. 重建 Web 产物后刷新页面生效（`dsh web` 的静态资源与 `/plugins/<id>/client.js` 由 `dsh-client-modules` 提供）。

## 3. 马上跑通第一个插件（本目录）

```powershell
# 停掉当前 dsh web（Ctrl+C），然后：
dsh web --patch E:/gogame/dsh-plugin-starter/cordis.patch.yml
# 启动日志应出现：[my-first-plugin] plugin loaded!
# 以及 subprocess / terminals 两个服务的可用性探测结果
```

## 4. 关键规范摘录（写代码前必读）

- 副作用必须可撤销：`ctx.on` / `ctx.effect`；卸载自动清理，外部资源返回 disposer。
- 硬依赖才写 `inject: ['x']`，否则用 `ctx.get('x')` 判空；未声明 inject 就访问 `ctx.x` 会被 Guard 拒绝。
- 不碰 `window`/`document.body`/`process`/`Buffer` 等全局；客户端 UI 只能经 Slot 注册；主题用 `Theme.listTokens` + `styles.insert`。
- 不对 Service 实例、事件 payload、Slot props 做 stringify/深拷贝；只取需要的叶子字段。
- PTY 会话按确切 Agent 归属，不支持跨 agent 共享；harness 重启后会话不保留。

## 5. 官方文档索引

- 入门 / 使用 Web UI: https://deepseek-harness.github.io/deepseek-harness/guide/quickstart
- 第一个插件（本指南的模板）: https://deepseek-harness.github.io/deepseek-harness/develop/basic/
- 架构总览（能力 seam、事件域）: https://deepseek-harness.github.io/deepseek-harness/reference/
- PTY 会话（ctx.terminals API）: https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/terminal
- Client 模块（dsh.client / boot 图 / HMR）: https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/client-modules
- 扩展模式实操手册: https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/extension-cookbook
- 新增包逐文件清单: https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-package
- 源码仓库: https://github.com/deepseek-ai/deepseek-harness

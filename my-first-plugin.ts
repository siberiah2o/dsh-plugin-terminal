/**
 * DSH 第一个宿主插件 —— 验证补丁层加载成功，并探测终端相关的服务。
 * 官方教程：https://deepseek-harness.github.io/deepseek-harness/develop/basic/
 *
 * 插件 = 导出 apply(ctx) 的 TypeScript 模块。
 * 通过 ctx 注册的一切（事件、工具、定时器）在插件卸载时自动清理。
 */
export const name = 'my-first-plugin'

export function apply(ctx: any) {
  console.log('[my-first-plugin] plugin loaded!')

  // 可选服务用 ctx.get() 读取并处理缺失（不要写进 inject，除非是硬依赖）。
  // dsh-subprocess-local 已随 web profile 挂载，spawnTerminal 提供 PTY 能力。
  const subprocess = ctx.get('subprocess')
  console.log('[my-first-plugin] ctx.subprocess available:', subprocess !== undefined)

  // ctx.terminals（持久 PTY seam）默认 NOT 挂载在 web profile 中，
  // 需要额外插入 @deepseek-ai/dsh-terminal + dsh-terminal-bash 两行。
  const terminals = ctx.get('terminals')
  console.log('[my-first-plugin] ctx.terminals available:', terminals !== undefined)

  // 有需要手动清理的资源时，用 ctx.effect() 返回清理函数：
  // ctx.effect(() => { const t = ...; return () => clearInterval(t) })
}

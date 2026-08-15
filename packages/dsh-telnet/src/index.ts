/**
 * dsh-telnet — host half. Mounts the Telnet engine (short-lived RFC 854
 * connections for network devices), the device store (~/.dsh/dsh-telnet.json),
 * the agent tools (telnet_list, telnet_add, telnet_exec, telnet_remove), and a
 * system-prompt announcement. No browser half yet: devices are registered
 * from chat via telnet_add, the same flow the agent uses day to day.
 * Everything rides official NPM SDK packages — no dsh source changes.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { TelnetEngine } from './engine.ts'
import { TelnetDeviceStore } from './store.ts'
import { telnetAddTool, telnetExecTool, telnetListTool, telnetRemoveTool } from './tools.ts'

/** Stable cordis plugin name. */
export const name = 'telnet'

/** Services required before the Telnet surfaces can mount. */
export const inject = ['tools', 'systemPrompt']

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /**
   * When true (default), a system-prompt section announces the Telnet plugin
   * to every agent (tools + device store). Set false to keep it silent.
   */
  announceToAgent?: boolean
  /** Master switch for the plugin (tools, prompt section). */
  enabled?: boolean
}

export const Config: z<Config> = z.object({
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
})

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 160

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const TELNET_GUIDANCE = '本机已安装 dsh-telnet 插件（DSH Telnet 网络设备运维）：与 dsh-ssh 同属 agent-ops 仓库（packages/dsh-telnet）。能力：设备配置存 ~/.dsh/dsh-telnet.json（权限 0600）；telnet_list 列出设备；telnet_add 用 IP/用户名/密码注册交换机/路由器/防火墙；telnet_exec 按别名连接、登录、可选 enable 特权模式、顺序执行命令并返回输出（自动处理 --More-- 分页与 [Y/N] 确认）；telnet_remove 删除设备。安全：readOnly 默认开启，拒绝写入类命令（configure terminal / system-view / save / write 等），写配置必须显式 readOnly:false 且先经用户确认。限制：Telnet 无加密，密码与输出明文传输，仅限可信管理网络；每次执行新建短连接、执行完自动退出；设备输出原样返回、可能含敏感信息；操作消耗真实设备资源，先确认再执行。用户提到「Telnet / 交换机 / 路由器 / 网络设备 / 控制台」时即指本插件，请据此协作。'

/**
 * Mount the Telnet engine, tools, and announcement.
 * @param ctx - host plugin context carrying tools/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config?: Config): void {
  const store = new TelnetDeviceStore()
  const engine = new TelnetEngine(store)
  ctx.effect(() => () => { engine.dispose() }, 'dsh-telnet: engine')

  const tools = [
    telnetListTool(engine),
    telnetAddTool(store),
    telnetExecTool(engine),
    telnetRemoveTool(store),
  ]
  let disposeTools: (() => void) | undefined
  let disposeSection: (() => void) | undefined

  // Register (or drop) every surface to match the current config. Each group
  // is kept under one disposer so duplicate-name registrations never throw.
  const sync = (): void => {
    if (disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
    if (disposeTools !== undefined) {
      disposeTools()
      disposeTools = undefined
    }
    const value = config ?? {}
    if (value.enabled === false) return
    if (value.announceToAgent !== false) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:dsh-telnet',
        order: SECTION_ORDER,
        text: TELNET_GUIDANCE,
      })
    }
    disposeTools = ctx.effect(
      () => {
        const disposers = tools.map(tool => ctx.tools.register(tool))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-telnet: tools',
    )
  }

  sync()
}

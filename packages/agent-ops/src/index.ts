/**
 * agent-ops — the standalone remote-operations plugin for dsh.
 *
 * Host half: the SSH engine (persistent ssh2 connection pool, exec / PTY
 * shell / SFTP / tunnels / cluster), the Telnet engine (short-lived RFC 854
 * sessions for network devices), the /api/agent-ops route family plus the
 * terminal WebSocket upgrade, the agent tools (ssh_add / ssh_list / ssh_exec
 * / ssh_upload / ssh_download / ssh_tunnel / ssh_cluster, telnet_list /
 * telnet_add / telnet_exec / telnet_remove), and one system-prompt
 * announcement. The browser half (./client) renders the sidebar entry, the
 * management panel, the web terminal, and its own DOM-hook shim — the plugin
 * depends on no other plugin at runtime. Everything rides official NPM SDK
 * packages — no dsh source changes.
 */

import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { SshEngine } from './ssh-engine.ts'
import { makeRoutes } from './routes.ts'
import { HostStore } from './ssh-store.ts'
import { TelnetEngine } from './telnet-engine.ts'
import { TelnetDeviceStore } from './telnet-store.ts'
import { sshAddTool, sshClusterTool, sshDownloadTool, sshExecTool, sshListTool, sshTunnelTool, sshUploadTool } from './ssh-tools.ts'
import { telnetAddTool, telnetExecTool, telnetListTool, telnetRemoveTool } from './telnet-tools.ts'

/** Stable cordis plugin name. */
export const name = 'agent-ops'

/** Services required before the agent-ops surfaces can mount. */
export const inject = ['webServer', 'tools', 'systemPrompt']

/** Settings namespace of the agent-ops capability (host + client spell the same value). */
export const AGENT_OPS_SETTINGS_NAMESPACE = settingsNamespace('agent-ops')

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /**
   * When true (default), a system-prompt section announces the plugin to
   * every agent (tools + stores). Set false to keep it silent.
   */
  announceToAgent?: boolean
  /** Master switch for the plugin (routes, tools, prompt section). */
  enabled?: boolean
}

export const Config: z<Config> = z.object({
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
})

/** Schema default, re-read for hand-built test contexts (the loader applies them normally). */
const DEFAULT_ANNOUNCE = true

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 150

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const AGENT_OPS_GUIDANCE = '本机已安装 agent-ops 插件（DSH 远程运维，独立插件）：侧边栏「远程运维」入口。SSH 能力：主机配置存 ~/.dsh/dsh-ssh.json（可从 ~/.ssh/config 导入）；持久连接池复用长连接（空闲 30 分钟自动断开）；ssh_list 列出主机、ssh_add 用用户在对话中给出的 IP/用户名/密码（或密钥路径）注册新主机、ssh_exec 执行远程命令、ssh_upload/ssh_download 传输文件、ssh_tunnel 本地端口转发（访问远程数据库/内网服务）、ssh_cluster 集群并发执行；支持密钥/密码认证、passphrase 密钥与 ProxyJump 跳板机。Telnet 能力：设备配置存 ~/.dsh/dsh-telnet.json（权限 0600）；telnet_list 列出设备、telnet_add 用 IP/用户名/密码注册交换机/路由器/防火墙、telnet_exec 按别名连接执行命令（支持 enable 特权模式、自动处理 --More-- 分页与 [Y/N] 确认）、telnet_remove 删除设备；readOnly 默认开启，拒绝写入类命令（configure terminal / system-view / save / write 等），写配置必须显式 readOnly:false 且先经用户确认。限制：密码以明文存在用户主目录私有文件（权限 0600），对话中给出的密码会留在会话记录里，敏感环境优先用密钥或 GUI 导入；Telnet 无加密仅限可信管理网络；命令输出原样返回、可能含敏感信息；断线重连可能重放非幂等命令；传输/执行消耗真实远程资源，先确认再操作。用户提到「SSH / 远程服务器 / 服务器操作 / Telnet / 交换机 / 路由器 / 网络设备 / 控制台」时即指本插件，请据此协作。'

/**
 * Mount the engines, routes, tools, and announcement.
 * @param ctx - host plugin context carrying webServer/tools/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config?: Config): void {
  // The live source the surfaces read: the settings section once the web
  // settings surface is served, the composition entry otherwise.
  let current: () => Config = () => config ?? {}
  const resolve = (): Config => {
    const value = current()
    return {
      announceToAgent: value.announceToAgent ?? DEFAULT_ANNOUNCE,
      enabled: value.enabled ?? true,
    }
  }

  const sshStore = new HostStore()
  const sshEngine = new SshEngine(sshStore)
  ctx.effect(() => () => { sshEngine.dispose() }, 'agent-ops: ssh engine')

  const telnetStore = new TelnetDeviceStore()
  const telnetEngine = new TelnetEngine(telnetStore)
  ctx.effect(() => () => { telnetEngine.dispose() }, 'agent-ops: telnet engine')

  // The /api/agent-ops route family + terminal upgrade.
  const { routes, upgrade } = makeRoutes({ store: sshStore, engine: sshEngine })
  let disposeRoutes: (() => void) | undefined

  // Agent tools + their prompt sections.
  const tools = [
    sshAddTool(sshStore),
    sshListTool(sshEngine),
    sshExecTool(sshEngine),
    sshUploadTool(sshEngine),
    sshDownloadTool(sshEngine),
    sshTunnelTool(sshEngine),
    sshClusterTool(sshEngine),
    telnetListTool(telnetEngine),
    telnetAddTool(telnetStore),
    telnetExecTool(telnetEngine),
    telnetRemoveTool(telnetStore),
  ]
  let disposeTools: (() => void) | undefined

  // System-prompt announcement.
  let disposeSection: (() => void) | undefined

  // Register (or drop) every surface to match the current source. Each group
  // is kept under one disposer: re-registering first tears the old one down
  // so duplicate-name registrations never throw.
  const sync = (): void => {
    const value = resolve()
    if (disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
    if (disposeRoutes !== undefined) {
      disposeRoutes()
      disposeRoutes = undefined
    }
    if (disposeTools !== undefined) {
      disposeTools()
      disposeTools = undefined
    }
    if (!value.enabled) return
    if (value.announceToAgent) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:agent-ops',
        order: SECTION_ORDER,
        text: AGENT_OPS_GUIDANCE,
      })
    }
    disposeRoutes = ctx.effect(
      () => {
        const disposers = routes.map(route => ctx.webServer.register(route))
        const upgradeDisposer = ctx.webServer.registerUpgrade(upgrade)
        return () => {
          for (const dispose of disposers) dispose()
          upgradeDisposer()
        }
      },
      'agent-ops: routes',
    )
    disposeTools = ctx.effect(
      () => {
        const disposers = tools.map(tool => ctx.tools.register(tool))
        return () => { for (const dispose of disposers) dispose() }
      },
      'agent-ops: tools',
    )
  }

  installSettingsSection(ctx, AGENT_OPS_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => {
      current = source
      sync()
    },
    onChange: sync,
  })

  // Initial registration from the composition entry (covers deployments with
  // no settings service, whose installSettingsSection never fires its hooks).
  sync()
}

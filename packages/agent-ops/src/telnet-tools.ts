/**
 * Agent tools: the DSH-native Telnet counterpart for network devices. Every
 * tool talks to the same store/engine the plugin owns, so a device added in
 * one call is immediately operable by the next.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { TelnetEngine } from './telnet-engine.ts'
import type { TelnetDeviceStore } from './telnet-store.ts'
import type { TelnetDeviceSummary, TelnetExecResult } from './telnet-protocol.ts'

/** One text content block (the only render shape these tools emit). */
function text(value: string): ContentBlock[] {
  return [{ type: 'text', text: value }]
}

/** Device table render shared by list surfaces. */
function renderDevices(devices: TelnetDeviceSummary[]): string {
  if (devices.length === 0) return 'no devices configured'
  const rows = devices.map(device => [
    device.alias,
    device.host,
    String(device.port),
    device.username,
    device.deviceType ?? 'generic',
    device.enableCommand ?? 'enable',
    device.hasEnablePassword ? 'yes' : 'no',
    device.environment ?? '-',
    (device.tags.length > 0 ? device.tags.join(',') : '-'),
    device.description ?? '',
  ].join(' | '))
  return ['alias | host | port | username | type | enable | enablePwd | environment | tags | description', '--- | --- | --- | --- | --- | --- | --- | --- | --- | ---', ...rows].join('\n')
}

/** Render one exec result (mirrors the ssh-exec convention). */
function renderExec(result: TelnetExecResult): string {
  const marker = result.timedOut
    ? '[timed out]'
    : `[exit code: ${result.exitCode ?? 'null'}]`
  const parts = [marker]
  if (result.output !== '') parts.push('output:\n' + result.output)
  if (result.error !== undefined) parts.push('error: ' + result.error)
  parts.push(`duration: ${result.durationMs} ms`)
  return parts.join('\n')
}

/** Render one added device without echoing secrets. */
function renderAdd(summary: TelnetDeviceSummary): string {
  return `device '${summary.alias}' added: ${summary.host}:${summary.port} as ${summary.username} (type: ${summary.deviceType ?? 'generic'}). Stored in ~/.dsh/dsh-telnet.json (mode 0600). Verify with telnet_exec alias ["show version"].`
}

/** The device-list tool. */
export function telnetListTool(engine: TelnetEngine) {
  return defineTool({
    name: 'telnet_list',
    description: 'List configured Telnet network devices (alias, host, port, username, vendor type, enable mode). Use telnet_exec etc. with the alias. ' +
      'Triggers: Telnet, switch, router, firewall, network device, console login.',
    parameters: {
      query: { type: 'string', description: 'Optional fuzzy match against alias, description, host, and tags.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          devices: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                alias: { type: 'string', required: true },
                host: { type: 'string', required: true },
                port: { type: 'integer', required: true },
                username: { type: 'string', required: true },
                deviceType: { type: 'string' },
                enableCommand: { type: 'string' },
                hasEnablePassword: { type: 'boolean', required: true },
                description: { type: 'string' },
                environment: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' }, required: true },
              },
            },
          },
        },
      },
      render: (_args, value: { devices?: TelnetDeviceSummary[] }) => text(renderDevices(value.devices ?? [])),
    },
    async execute(args) {
      return { devices: engine.list(args.query) }
    },
  })
}

/** The device-registration tool. */
export function telnetAddTool(store: TelnetDeviceStore) {
  return defineTool({
    name: 'telnet_add',
    description: 'Register a Telnet network device from credentials given in chat (IP/hostname + username + password). Creates the alias for later telnet_exec calls. Secrets are stored in ~/.dsh/dsh-telnet.json (mode 0600). ' +
      'Triggers: add switch/router/firewall, register network device, save device credentials.',
    parameters: {
      alias: { type: 'string', required: true, description: 'Short stable id for later commands (letters/digits/dots/hyphens/underscores).' },
      host: { type: 'string', required: true, description: 'Device IP or hostname.' },
      username: { type: 'string', required: true, description: 'Login username.' },
      password: { type: 'string', required: true, description: 'Login password (stored 0600, never echoed back).' },
      port: { type: 'integer', description: 'Telnet port (default 23).' },
      enablePassword: { type: 'string', description: 'Privileged-mode (enable/super) password when the device asks for one.' },
      enableCommand: { type: 'string', description: "Command entering privileged mode (default 'enable'; Huawei/H3C often 'super')." },
      deviceType: { type: 'string', enum: ['cisco', 'huawei', 'h3c', 'generic'], description: 'Vendor hint that tunes prompt and paging detection.' },
      description: { type: 'string' },
      environment: { type: 'string', description: 'e.g. production / lab / test.' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          alias: { type: 'string', required: true },
          host: { type: 'string', required: true },
          port: { type: 'integer', required: true },
          username: { type: 'string', required: true },
          deviceType: { type: 'string' },
          enableCommand: { type: 'string' },
          hasEnablePassword: { type: 'boolean', required: true },
          description: { type: 'string' },
          environment: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' }, required: true },
        },
      },
      render: (_args, value: TelnetDeviceSummary) => text(renderAdd(value)),
    },
    async execute(args) {
      const entry = store.create({
        alias: args.alias,
        host: args.host,
        username: args.username,
        password: args.password,
        ...(args.port !== undefined ? { port: args.port } : {}),
        ...(args.enablePassword !== undefined ? { enablePassword: args.enablePassword } : {}),
        ...(args.enableCommand !== undefined ? { enableCommand: args.enableCommand } : {}),
        ...(args.deviceType !== undefined ? { deviceType: args.deviceType } : {}),
        ...(args.description !== undefined ? { description: args.description } : {}),
        ...(args.environment !== undefined ? { environment: args.environment } : {}),
        tags: args.tags ?? [],
      })
      return store.summarize(entry)
    },
  })
}

/** The command-execution tool. */
export function telnetExecTool(engine: TelnetEngine) {
  return defineTool({
    name: 'telnet_exec',
    description: 'Connect to a configured Telnet device by alias, log in, optionally enter privileged mode (enable), run the commands in order, and return the device output. readOnly defaults to true and rejects config-write commands; set readOnly:false ONLY after the user has confirmed the exact commands to write. ' +
      'Triggers: run command on switch/router/firewall, show running-config, config change, network device ops.',
    parameters: {
      alias: { type: 'string', required: true, description: 'Device alias from telnet_list.' },
      commands: { type: 'array', required: true, items: { type: 'string' }, description: 'CLI commands executed in order (one line each).' },
      enable: { type: 'boolean', description: 'Enter privileged mode after login (default false).' },
      readOnly: { type: 'boolean', description: 'Guard against config writes; default true. Set false only for user-confirmed writes.' },
      timeoutMs: { type: 'integer', description: 'Whole-session timeout in milliseconds (default 60000).' },
      promptRegex: { type: 'string', description: 'Custom prompt regex; default is chosen per deviceType.' },
      stripPromptLines: { type: 'boolean', description: 'Strip trailing prompt lines from the output (default true).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', required: true },
          exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }], required: true },
          timedOut: { type: 'boolean', required: true },
          output: { type: 'string', required: true },
          durationMs: { type: 'integer', required: true },
          error: { type: 'string' },
        },
      },
      render: (_args, value: TelnetExecResult) => text(renderExec(value)),
    },
    async execute(args) {
      try {
        return await engine.exec(args.alias, {
          commands: args.commands,
          timeoutMs: args.timeoutMs,
          enable: args.enable === true,
          readOnly: args.readOnly !== false,
          promptRegex: args.promptRegex,
          stripPromptLines: args.stripPromptLines !== false,
        })
      } catch (error) {
        return {
          success: false,
          exitCode: null,
          timedOut: false,
          output: '',
          durationMs: 0,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  })
}

/** The device-removal tool. */
export function telnetRemoveTool(store: TelnetDeviceStore) {
  return defineTool({
    name: 'telnet_remove',
    description: 'Remove a Telnet device entry by alias from ~/.dsh/dsh-telnet.json. Triggers: remove switch/router, delete device credentials.',
    parameters: {
      alias: { type: 'string', required: true, description: 'Device alias from telnet_list.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          removed: { type: 'boolean', required: true },
          alias: { type: 'string', required: true },
        },
      },
      render: (_args, value: { removed: boolean; alias: string }) => text(`removed device '${value.alias}'`),
    },
    async execute(args) {
      store.delete(args.alias)
      return { removed: true, alias: args.alias }
    },
  })
}

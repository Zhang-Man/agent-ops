/**
 * Device config store: one JSON file (`~/.dsh/dsh-telnet.json`) holding every
 * network-device entry, written atomically (tmp + rename) with 0600 mode.
 * Secrets (login/enable passwords) live in this user-owned file in plaintext —
 * the same trust model as dsh-ssh's dsh-ssh.json; document it, never log it.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { TelnetDeviceEntry, TelnetDevicePayload, TelnetDeviceSummary } from './protocol.ts'

/** File format version. */
const FORMAT_VERSION = 1

/** Store file location: <home>/.dsh/dsh-telnet.json. */
export function telnetStorePath(): string {
  return join(homedir(), '.dsh', 'dsh-telnet.json')
}

interface StoreFile {
  version: number
  devices: TelnetDeviceEntry[]
}

/** Alias grammar: letters/digits plus dots, hyphens, underscores. */
const ALIAS_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

/** Recognized device-type hints. */
const DEVICE_TYPES = ['cisco', 'huawei', 'h3c', 'generic']

/** Validate an alias for creation. */
export function validateAlias(alias: string): string | undefined {
  if (!ALIAS_RE.test(alias)) return 'alias must be letters, digits, dots, hyphens or underscores'
  return undefined
}

/** Validate the wire shape of a device payload; returns a message or undefined. */
export function validateDevicePayload(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return 'payload must be a JSON object'
  const p = payload as Record<string, unknown>
  if (typeof p.host !== 'string' || p.host.trim() === '') return 'host is required'
  if (typeof p.username !== 'string' || p.username.trim() === '') return 'username is required'
  if (p.port !== undefined && (typeof p.port !== 'number' || !Number.isInteger(p.port) || p.port < 1 || p.port > 65535)) {
    return 'port must be an integer in 1..65535'
  }
  if (p.password !== undefined && typeof p.password !== 'string') return 'password must be a string'
  if (p.enablePassword !== undefined && typeof p.enablePassword !== 'string') return 'enablePassword must be a string'
  if (p.enableCommand !== undefined && (typeof p.enableCommand !== 'string' || p.enableCommand.trim() === '')) {
    return 'enableCommand must be a non-empty string'
  }
  if (p.deviceType !== undefined && (typeof p.deviceType !== 'string' || !DEVICE_TYPES.includes(p.deviceType))) {
    return `deviceType must be one of ${DEVICE_TYPES.join(', ')}`
  }
  if (p.tags !== undefined && (!Array.isArray(p.tags) || p.tags.some(x => typeof x !== 'string'))) {
    return 'tags must be an array of strings'
  }
  return undefined
}

/**
 * The telnet device store. Pure file I/O — no cordis dependency, unit-testable.
 */
export class TelnetDeviceStore {
  /** The JSON file path. */
  readonly path: string

  /**
   * @param path - store file path (defaults to the standard location).
   */
  constructor(path?: string) {
    this.path = resolve(path ?? telnetStorePath())
  }

  /** Load the file; empty store when absent or unparseable. */
  private load(): StoreFile {
    if (!existsSync(this.path)) return { version: FORMAT_VERSION, devices: [] }
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<StoreFile>
      if (!Array.isArray(parsed.devices)) return { version: FORMAT_VERSION, devices: [] }
      return { version: FORMAT_VERSION, devices: parsed.devices as TelnetDeviceEntry[] }
    } catch {
      return { version: FORMAT_VERSION, devices: [] }
    }
  }

  /** Atomic write: tmp + rename, 0600 file inside a 0700 directory. */
  private save(file: StoreFile): void {
    const dir = dirname(this.path)
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, JSON.stringify(file, null, 2), { mode: 0o600 })
    renameSync(tmp, this.path)
    try {
      chmodSync(this.path, 0o600)
    } catch {
      // Windows / exotic filesystems: the tmp file already carried 0600.
    }
  }

  /** Load all entries (empty store when the file is absent). */
  list(): TelnetDeviceEntry[] {
    return this.load().devices
  }

  /** Find one entry by alias. */
  find(alias: string): TelnetDeviceEntry | undefined {
    return this.list().find(entry => entry.alias === alias)
  }

  /** Secret-free projection for the agent surfaces. */
  summarize(entry: TelnetDeviceEntry): TelnetDeviceSummary {
    return {
      alias: entry.alias,
      host: entry.host,
      port: entry.port,
      username: entry.username,
      // Optional fields spread conditionally: the tool bridge rejects
      // undefined-valued properties as non-lossless JSON.
      ...(entry.deviceType !== undefined ? { deviceType: entry.deviceType } : {}),
      ...(entry.enableCommand !== undefined ? { enableCommand: entry.enableCommand } : {}),
      hasEnablePassword: entry.enablePassword !== undefined && entry.enablePassword !== '',
      ...(entry.description !== undefined ? { description: entry.description } : {}),
      ...(entry.environment !== undefined ? { environment: entry.environment } : {}),
      tags: [...entry.tags],
    }
  }

  /** Create one entry. Throws on alias collision or invalid payload. */
  create(payload: TelnetDevicePayload): TelnetDeviceEntry {
    const alias = payload.alias?.trim()
    if (!alias) throw new Error('alias is required')
    const aliasError = validateAlias(alias)
    if (aliasError !== undefined) throw new Error(aliasError)
    if (payload.password === undefined || payload.password === '') throw new Error('password is required')
    const bodyError = validateDevicePayload(payload)
    if (bodyError !== undefined) throw new Error(bodyError)
    const file = this.load()
    if (file.devices.some(entry => entry.alias === alias)) throw new Error(`alias '${alias}' already exists`)
    const now = Date.now()
    const entry: TelnetDeviceEntry = {
      alias,
      host: payload.host.trim(),
      port: payload.port ?? 23,
      username: payload.username.trim(),
      password: payload.password,
      enablePassword: payload.enablePassword,
      enableCommand: payload.enableCommand?.trim() || undefined,
      deviceType: payload.deviceType,
      description: payload.description?.trim() || undefined,
      environment: payload.environment?.trim() || undefined,
      tags: [...(payload.tags ?? [])].map(tag => tag.trim()).filter(tag => tag !== ''),
      createdAt: now,
      updatedAt: now,
    }
    file.devices.push(entry)
    this.save(file)
    return entry
  }

  /** Update the fields present in `patch`; unknown aliases throw. */
  update(alias: string, patch: Partial<TelnetDevicePayload>): TelnetDeviceEntry {
    const file = this.load()
    const entry = file.devices.find(candidate => candidate.alias === alias)
    if (entry === undefined) throw new Error(`alias '${alias}' not found`)
    if (patch.host !== undefined && (typeof patch.host !== 'string' || patch.host.trim() === '')) {
      throw new Error('host is required')
    }
    if (patch.username !== undefined && (typeof patch.username !== 'string' || patch.username.trim() === '')) {
      throw new Error('username is required')
    }
    if (patch.port !== undefined && (typeof patch.port !== 'number' || !Number.isInteger(patch.port) || patch.port < 1 || patch.port > 65535)) {
      throw new Error('port must be an integer in 1..65535')
    }
    if (patch.host !== undefined) entry.host = patch.host.trim()
    if (patch.port !== undefined) entry.port = patch.port
    if (patch.username !== undefined) entry.username = patch.username.trim()
    if (patch.password !== undefined && patch.password !== '') entry.password = patch.password
    if (patch.enablePassword !== undefined) entry.enablePassword = patch.enablePassword
    if (patch.enableCommand !== undefined) entry.enableCommand = patch.enableCommand.trim() || undefined
    if (patch.deviceType !== undefined) entry.deviceType = patch.deviceType
    if (patch.description !== undefined) entry.description = patch.description.trim() || undefined
    if (patch.environment !== undefined) entry.environment = patch.environment.trim() || undefined
    if (patch.tags !== undefined) entry.tags = [...patch.tags].map(tag => tag.trim()).filter(tag => tag !== '')
    entry.updatedAt = Date.now()
    this.save(file)
    return entry
  }

  /** Remove one entry. */
  delete(alias: string): void {
    const file = this.load()
    const index = file.devices.findIndex(entry => entry.alias === alias)
    if (index === -1) throw new Error(`alias '${alias}' not found`)
    file.devices.splice(index, 1)
    this.save(file)
  }
}

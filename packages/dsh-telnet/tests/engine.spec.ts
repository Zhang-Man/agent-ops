import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TelnetEngine } from '../src/engine.ts'
import { TelnetDeviceStore } from '../src/store.ts'
import { startFakeDevice, stopFakeDevice, type FakeDevice } from './helpers.ts'

/** Fast timeouts for tests (the fake device answers instantly). */
const TEST_OPTIONS = {
  connectTimeoutMs: 2_000,
  loginTimeoutMs: 3_000,
  promptTimeoutMs: 5_000,
  overallTimeoutMs: 10_000,
}

function makeStore(): TelnetDeviceStore {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-telnet-engine-'))
  return new TelnetDeviceStore(join(dir, 'dsh-telnet.json'))
}

function addCisco(store: TelnetDeviceStore, device: FakeDevice): void {
  store.create({
    alias: 'sw1',
    host: '127.0.0.1',
    port: device.port,
    username: 'admin',
    password: 'cisco123',
    enablePassword: 'en123',
    deviceType: 'cisco',
  })
}

describe('TelnetEngine', () => {
  let device: FakeDevice | undefined

  afterEach(async () => {
    if (device !== undefined) await stopFakeDevice(device)
    device = undefined
  })

  it('logs in and runs a read-only command', async () => {
    device = await startFakeDevice({ username: 'admin', password: 'cisco123' })
    const store = makeStore()
    addCisco(store, device)
    const engine = new TelnetEngine(store, TEST_OPTIONS)
    const result = await engine.exec('sw1', { commands: ['show version'] })
    expect(result.success).toBe(true)
    expect(result.output).toContain('Cisco IOS Software')
  })

  it('rejects config-write commands in readOnly mode without connecting', async () => {
    device = await startFakeDevice({ username: 'admin', password: 'cisco123' })
    const store = makeStore()
    addCisco(store, device)
    const engine = new TelnetEngine(store, TEST_OPTIONS)
    const result = await engine.exec('sw1', { commands: ['configure terminal'] })
    expect(result.success).toBe(false)
    expect(result.error).toContain('readOnly mode rejects')
    expect(device.connections).toBe(0)
  })

  it('enters privileged mode and allows writes when readOnly is false', async () => {
    device = await startFakeDevice({ username: 'admin', password: 'cisco123', enablePassword: 'en123' })
    const store = makeStore()
    addCisco(store, device)
    const engine = new TelnetEngine(store, TEST_OPTIONS)
    const result = await engine.exec('sw1', {
      commands: ['configure terminal', 'hostname CORE'],
      enable: true,
      readOnly: false,
    })
    expect(result.success).toBe(true)
    expect(result.output).toContain('(config)#')
  })

  it('auto-pages through --More-- output', async () => {
    device = await startFakeDevice({ username: 'admin', password: 'cisco123' })
    const store = makeStore()
    addCisco(store, device)
    const engine = new TelnetEngine(store, TEST_OPTIONS)
    const result = await engine.exec('sw1', { commands: ['show run'] })
    expect(result.success).toBe(true)
    expect(result.output).toContain('interface GigabitEthernet0/1')
  })

  it('reports authentication failures', async () => {
    device = await startFakeDevice({ username: 'admin', password: 'cisco123' })
    const store = makeStore()
    addCisco(store, device)
    store.update('sw1', { password: 'wrong' })
    const engine = new TelnetEngine(store, TEST_OPTIONS)
    const result = await engine.exec('sw1', { commands: ['show version'] })
    expect(result.success).toBe(false)
    expect(result.error).toContain('authentication failed')
  })

  it('supports VRP-style prompts and the super command', async () => {
    device = await startFakeDevice({
      username: 'admin',
      password: 'huawei123',
      enablePassword: 'super123',
      vendor: 'huawei',
    })
    const store = makeStore()
    store.create({
      alias: 'rt1',
      host: '127.0.0.1',
      port: device.port,
      username: 'admin',
      password: 'huawei123',
      enablePassword: 'super123',
      enableCommand: 'super',
      deviceType: 'huawei',
    })
    const engine = new TelnetEngine(store, TEST_OPTIONS)
    const result = await engine.exec('rt1', { commands: ['display version'], enable: true })
    expect(result.success).toBe(true)
    expect(result.output).toContain('Huawei Versatile Routing Platform')
  })

  it('fails cleanly when the target is unreachable', async () => {
    const store = makeStore()
    store.create({ alias: 'gone', host: '127.0.0.1', port: 1, username: 'a', password: 'b' })
    const engine = new TelnetEngine(store, TEST_OPTIONS)
    const result = await engine.exec('gone', { commands: ['show version'] })
    expect(result.success).toBe(false)
    expect(result.error).toContain('connect')
  })

  it('lists devices with fuzzy matching', () => {
    const store = makeStore()
    store.create({ alias: 'sw1', host: '10.0.0.1', username: 'a', password: 'b', tags: ['core'] })
    store.create({ alias: 'rt1', host: '10.0.0.2', username: 'a', password: 'b', tags: ['edge'] })
    const engine = new TelnetEngine(store, TEST_OPTIONS)
    expect(engine.list()).toHaveLength(2)
    expect(engine.list('core')).toHaveLength(1)
    expect(engine.list('10.0.0.2')).toHaveLength(1)
    expect(engine.list('nope')).toHaveLength(0)
  })
})

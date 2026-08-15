import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TelnetDeviceStore } from '../src/store.ts'

describe('TelnetDeviceStore', () => {
  let dir: string
  let store: TelnetDeviceStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-telnet-store-'))
    store = new TelnetDeviceStore(join(dir, 'dsh-telnet.json'))
  })

  afterEach(() => {
    // tmpdir cleanup is best-effort; the store keeps every secret in `dir`.
  })

  it('starts empty', () => {
    expect(store.list()).toEqual([])
    expect(store.find('sw1')).toBeUndefined()
  })

  it('creates an entry and hides secrets in the summary', () => {
    const entry = store.create({
      alias: 'sw1',
      host: '10.1.1.2',
      username: 'admin',
      password: 'secret-login',
      enablePassword: 'secret-enable',
      deviceType: 'huawei',
      enableCommand: 'super',
      tags: ['core', 'production'],
    })
    expect(entry.port).toBe(23)
    const summary = store.summarize(entry)
    expect(summary.hasEnablePassword).toBe(true)
    expect(JSON.stringify(summary)).not.toContain('secret-login')
    expect(JSON.stringify(summary)).not.toContain('secret-enable')
    // The on-disk file carries the secrets but with 0600 perms.
    const file = JSON.parse(readFileSync(store.path, 'utf8')) as { devices: unknown[] }
    expect(JSON.stringify(file)).toContain('secret-login')
  })

  it('rejects a duplicate alias', () => {
    store.create({ alias: 'sw1', host: '10.0.0.1', username: 'a', password: 'p' })
    expect(() => store.create({ alias: 'sw1', host: '10.0.0.2', username: 'b', password: 'q' })).toThrow(/already exists/)
  })

  it('rejects a missing password on create', () => {
    expect(() => store.create({ alias: 'sw1', host: '10.0.0.1', username: 'a', password: '' })).toThrow(/password is required/)
  })

  it('rejects a bad alias', () => {
    expect(() => store.create({ alias: '-sw1', host: '10.0.0.1', username: 'a', password: 'p' })).toThrow(/alias/)
  })

  it('updates fields and keeps the stored password when omitted', () => {
    store.create({ alias: 'sw1', host: '10.0.0.1', username: 'a', password: 'p1' })
    const updated = store.update('sw1', { description: 'core switch', tags: ['x'] })
    expect(updated.description).toBe('core switch')
    expect(updated.password).toBe('p1')
  })

  it('replaces the password when given', () => {
    store.create({ alias: 'sw1', host: '10.0.0.1', username: 'a', password: 'p1' })
    const updated = store.update('sw1', { password: 'p2' })
    expect(updated.password).toBe('p2')
  })

  it('deletes an entry', () => {
    store.create({ alias: 'sw1', host: '10.0.0.1', username: 'a', password: 'p' })
    store.delete('sw1')
    expect(store.list()).toEqual([])
    expect(() => store.delete('sw1')).toThrow(/not found/)
  })
})

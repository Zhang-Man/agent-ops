/**
 * Unit tests for scripts/install.mjs pure logic (node --test, no dsh needed).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bundlePackages, webUiAllGuard } from './install.mjs'

test('webUiAllGuard allows profiles without the web-ui aggregate', () => {
  const result = webUiAllGuard(['@zhangman2235/agent-ops'])
  assert.equal(result.blocked, false)
  assert.deepEqual(result.commands, [])
})

test('webUiAllGuard blocks the conflicting web-ui aggregate with guidance', () => {
  const result = webUiAllGuard(['@linxin666/dsh-web-ui-all', '@zhangman2235/agent-ops'])
  assert.equal(result.blocked, true)
  assert.ok(result.reason.includes('same ssh_* tools'))
  assert.equal(result.commands.length, 2)
  assert.ok(result.commands[0].includes('remove @linxin666/dsh-web-ui-all'))
  assert.ok(result.commands[1].includes('@linxin666/dsh-skins'))
  assert.ok(!result.commands[1].includes('@linxin666/dsh-ssh'), 'the replacement list must exclude the conflicting ssh child')
})

test('bundlePackages discovers the agent-ops bundle', () => {
  const packages = bundlePackages(new URL('..', import.meta.url).pathname)
  const names = packages.map((entry) => entry.pkgName).sort()
  assert.deepEqual(names, ['@zhangman2235/agent-ops'])
})

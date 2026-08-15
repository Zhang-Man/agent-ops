/**
 * Unit tests for scripts/install.mjs pure logic (node --test, no dsh needed).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bundlePackages, fixBundles } from './install.mjs'

test('fixBundles keeps dsh-ssh bundle when web-ui-all is absent', () => {
  const result = fixBundles(['@deepseek-ai/dsh-base', '@linxin666/agent-ops-all', '@linxin666/dsh-ssh'], ['@linxin666/agent-ops-all'])
  assert.equal(result.changed, false)
  assert.deepEqual(result.bundles, ['@deepseek-ai/dsh-base', '@linxin666/agent-ops-all', '@linxin666/dsh-ssh'])
})

test('fixBundles drops the duplicate ssh row when web-ui-all is present', () => {
  const result = fixBundles(
    ['@deepseek-ai/dsh-base', '@linxin666/dsh-web-ui-all', '@linxin666/dsh-ssh'],
    ['@linxin666/dsh-web-ui-all', '@linxin666/dsh-ssh'],
  )
  assert.equal(result.changed, true)
  assert.deepEqual(result.removed, ['@linxin666/dsh-ssh'])
  assert.deepEqual(result.bundles, ['@deepseek-ai/dsh-base', '@linxin666/dsh-web-ui-all'])
})

test('fixBundles is idempotent', () => {
  const once = fixBundles(['@linxin666/dsh-web-ui-all'], ['@linxin666/dsh-web-ui-all', '@linxin666/dsh-ssh'])
  const twice = fixBundles(once.bundles, ['@linxin666/dsh-web-ui-all', '@linxin666/dsh-ssh'])
  assert.equal(twice.changed, false)
})

test('bundlePackages discovers the two family bundles', () => {
  const packages = bundlePackages(new URL('..', import.meta.url).pathname)
  const names = packages.map((entry) => entry.pkgName).sort()
  assert.ok(names.includes('@linxin666/dsh-ssh'))
  assert.ok(names.includes('@linxin666/dsh-telnet'))
  assert.ok(!names.includes('@linxin666/agent-ops-all'), 'the aggregate carrier is not a bundle itself')
})

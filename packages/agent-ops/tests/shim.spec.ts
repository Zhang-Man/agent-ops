/**
 * Internal shim contract tests: the three data-pane stamps and the frame
 * attribute must stay in the client shim — this plugin's panel mounts
 * through those selectors and the plugin must not depend on any other
 * plugin for them.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const shim = readFileSync(new URL('../src/client/shim.ts', import.meta.url), 'utf8')

describe('agent-ops internal shim', () => {
  it('stamps the sidebar pane hook', () => {
    expect(shim).toContain('data-pane="sidebar"')
    expect(shim).toContain('sidebarCol')
  })

  it('stamps the conversation pane hook', () => {
    expect(shim).toContain('data-pane="conversation"')
    expect(shim).toContain('centerCol')
  })

  it('stamps the details pane and frame hooks', () => {
    expect(shim).toContain('data-pane="details"')
    expect(shim).toContain('detailsCol')
    expect(shim).toContain('data-dsh-frame=""')
  })

  it('keeps the shim applied across DOM mutations', () => {
    expect(shim).toContain('MutationObserver')
    expect(shim).toContain('childList: true')
  })

  it('only writes attributes and never removes nodes', () => {
    expect(shim).not.toContain('removeChild')
    expect(shim).not.toContain('.remove()')
  })
})

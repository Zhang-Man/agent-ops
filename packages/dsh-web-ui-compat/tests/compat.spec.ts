/**
 * Shim contract tests: the three data-pane stamps and the frame attribute
 * must stay in the client source — the DOM-mounting web-ui family plugins
 * (task-board, ssh panel, aionui-panel) silently disappear without them.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const client = readFileSync(new URL('../src/client/index.ts', import.meta.url), 'utf8')

describe('dsh-web-ui-compat shim', () => {
  it('stamps the sidebar pane hook', () => {
    expect(client).toContain('data-pane="sidebar"')
    expect(client).toContain('sidebarCol')
  })

  it('stamps the conversation pane hook', () => {
    expect(client).toContain('data-pane="conversation"')
    expect(client).toContain('centerCol')
  })

  it('stamps the details pane and frame hooks', () => {
    expect(client).toContain('data-pane="details"')
    expect(client).toContain('detailsCol')
    expect(client).toContain('data-dsh-frame=""')
  })

  it('keeps the shim applied across DOM mutations', () => {
    expect(client).toContain('MutationObserver')
    expect(client).toContain('childList: true')
  })

  it('only writes attributes and never removes nodes', () => {
    expect(client).not.toContain('removeChild')
    expect(client).not.toContain('.remove()')
  })
})

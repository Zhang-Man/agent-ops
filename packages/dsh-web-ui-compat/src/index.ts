/**
 * Host half of the web-ui compat shim: no host behavior of its own.
 * The browser half (./client) stamps the legacy DOM hooks (data-pane /
 * data-dsh-frame) that DOM-mounting web-ui family plugins expect.
 *
 * Vendored from the dsh-web-ui family aggregate (packages/dsh-web-ui-all,
 * Apache-2.0, github.com/zhu1090093659/dsh-web-ui) so agent-ops installs
 * need no aggregate package just for this shim.
 */
import type { Context } from '@deepseek-ai/cordis'

/** Required services: none. */
export const inject = [] as const

/** Host plugin body: nothing to do. */
export function apply(_ctx: Context): void {}

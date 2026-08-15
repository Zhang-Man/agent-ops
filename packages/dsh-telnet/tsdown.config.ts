/**
 * Standalone build config for the dsh-telnet plugin.
 *
 * Uses the repo's shared client-bundle preset (shared/tsdown.client.ts):
 * the node half (telnet engine + device store + agent tools) builds to lib/.
 * There is no browser half (no src/client/index.ts), so the preset skips the
 * client face entirely. Runtime @deepseek-ai/* peers stay external.
 */
import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@zhangman2235/dsh-telnet', ['src/index.ts', 'src/invariant.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-tools',
  ],
})

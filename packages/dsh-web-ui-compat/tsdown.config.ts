/**
 * Standalone build config for the dsh-web-ui-compat shim.
 *
 * Uses the repo's shared client-bundle preset: the node half is a no-op and
 * the browser half is auto-detected at src/client/index.ts.
 */
import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@zhangman2235/dsh-web-ui-compat', ['src/index.ts', 'src/invariant.ts'], {
  libExternal: [],
})

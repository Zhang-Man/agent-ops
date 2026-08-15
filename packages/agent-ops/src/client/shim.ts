/**
 * Internal DOM-hook shim, owned by this plugin (not a dependency on any
 * other plugin).
 *
 * The current dsh web shell renders its grid columns without the legacy
 * `data-pane` / `data-dsh-frame` attributes (the columns carry css-module
 * class names such as `*_sidebarCol` / `*_centerCol` / `*_detailsCol`). This
 * plugin's panel mounts through those selectors, so the client bundle stamps
 * the attributes itself and re-applies them on any DOM mutation (React
 * re-creates the columns on re-render). It only ever WRITES attributes; it
 * never removes nodes and never disturbs React's reconciliation.
 */

/** Column shims: element selector -> attribute to stamp. */
const COLUMN_SHIMS: ReadonlyArray<readonly [selector: string, attribute: string]> = [
  ['[class*="sidebarCol"]', 'data-pane="sidebar"'],
  ['[class*="centerCol"]', 'data-pane="conversation"'],
  ['[class*="detailsCol"]', 'data-pane="details"'],
]

/** Stamp one attribute of the form `name="value"` onto an element, if found. */
function stamp(el: Element | null, attribute: string): void {
  if (el === null) return
  const eq = attribute.indexOf('=')
  const name = attribute.slice(0, eq)
  const value = attribute.slice(eq + 1).replace(/^"|"$/g, '')
  el.setAttribute(name, value)
}

/** One pass over the current DOM. */
function applyShims(): void {
  for (const [selector, attribute] of COLUMN_SHIMS) {
    stamp(document.querySelector(selector), attribute)
  }
  // The frame is the grid item that parents the sidebar column.
  stamp(document.querySelector('[class*="sidebarCol"]')?.parentElement ?? null, 'data-dsh-frame=""')
}

/**
 * Register the shim for the page lifetime; returns the disposer.
 */
export function installShim(): () => void {
  applyShims()
  // The shell renders after boot settlement and React can re-create the
  // columns on re-render; re-stamp on any DOM mutation. Idempotent: writes
  // only the same attribute values, so this never fights React.
  const observer = new MutationObserver(applyShims)
  observer.observe(document.body, { childList: true, subtree: true })
  return () => { observer.disconnect() }
}

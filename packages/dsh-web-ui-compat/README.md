# dsh-web-ui-compat — legacy DOM hook shim for DOM-mounting web-ui plugins

English | [中文](README.zh.md)

Browser shim that stamps the legacy `data-pane` / `data-dsh-frame` attributes onto the current dsh web shell columns. The dsh-web-ui family plugins (task-board, the dsh-ssh panel, aionui-panel, several skins) mount through those selectors; without the shim they stay silent even though their bundles load.

Vendored from the dsh-web-ui family aggregate (`packages/dsh-web-ui-all`, Apache-2.0, github.com/zhu1090093659/dsh-web-ui) so agent-ops installs are self-contained: the original shim has no standalone npm package.

## What it does

- Stamps `data-pane="sidebar"` / `data-pane="conversation"` / `data-pane="details"` and `data-dsh-frame=""` onto the shell grid columns.
- Re-applies the stamps on every DOM mutation (React re-creates columns on re-render).
- Writes attributes only: never removes nodes, never disturbs React reconciliation.

## Install

Included in the `@zhangman2235/agent-ops-all` aggregate and linked automatically by `scripts/install.mjs`. Standalone:

```sh
dsh plugin --profile web add @zhangman2235/dsh-web-ui-compat
```

## Compatibility

Installing this package together with `@linxin666/dsh-web-ui-all` produces a duplicate `ui-web-ui-compat` row id (the aggregate embeds the same shim). Install the individual web-ui packages instead — see the agent-ops installation guide.

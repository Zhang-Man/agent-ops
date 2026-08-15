# Installation

How to install the agent-ops family onto a dsh machine, covering a fresh dsh, coexistence with the dsh-web-ui family, and the verification checklist.

## Prerequisites

- dsh `0.1.0-rc.5` or later, node `^22.19 || >=24`.
- The target profile must exist: boot it once (`dsh web` creates `~/.dsh/profiles/web`).
- `pnpm` for source installs; nothing extra for npm installs.

## From npm (recommended once published)

```sh
dsh plugin --profile web add @zhangman2235/agent-ops-all
```

The aggregate inserts one `ssh` row and one `telnet` row and installs both plugins. Restart `dsh web` afterwards.

## From source

```sh
git clone https://github.com/Zhang-Man/agent-ops.git
cd agent-ops
pnpm install && pnpm -r build
pnpm run install:profile          # = node scripts/install.mjs --profile web
```

`install.mjs` links the two bundle packages with the official `dsh plugin add link:` flow, applies the coexistence fixup below when needed, and verifies the composition with `dsh --profile web --dump-config` (exactly one `ssh` row, one `telnet` row). Restart `dsh web` afterwards.

The `agent-ops-all` aggregate is not linked from source: its `workspace:*` dependencies only resolve after publishing, so source installs link the individual packages and npm installs use the aggregate.

## Coexisting with the dsh-web-ui family (skins, panels)

The `@linxin666/dsh-web-ui-all` aggregate inserts its own `ssh` row (name `@linxin666/dsh-ssh`), which collides with this family's `ssh` row id — the dsh loader rejects duplicate row ids. There is no silent workaround: replace the aggregate with the individual web-ui packages (everything it bundles except its dsh-ssh child), then install agent-ops normally:

```sh
dsh plugin --profile web remove @linxin666/dsh-web-ui-all
dsh plugin --profile web add @linxin666/dsh-client-ui-web-ui-settings \
  @linxin666/dsh-client-ui-aionui-panel @linxin666/dsh-client-ui-task-board \
  @linxin666/dsh-client-ui-git-graph @linxin666/dsh-pet @linxin666/dsh-remote-web-ui \
  @linxin666/dsh-live-stats @linxin666/dsh-tool-describe-image \
  @linxin666/dsh-skins
```

`scripts/install.mjs` detects the aggregate and prints exactly this guidance instead of half-installing. Do not install `@zhangman2235/agent-ops-all` together with `@linxin666/dsh-web-ui-all` either — the same row-id collision applies.

## The agent-remote-ops preset (recommended)

The family ships the ops persona preset; copy it into the user preset root and restart:

```sh
cp -r presets/agent-remote-ops ~/.dsh/.agent-presets/
```

Create new sessions with the **远程运维** preset (or set it as the default in settings, `agent-presets.default: agent-remote-ops`). The preset shapes the two workflows: Linux server initialization/tuning and network-device configuration changes (recon -> proposal -> user confirmation -> write -> verify -> rollback).

## Verification checklist

1. Composition: `dsh --profile web --dump-config` shows exactly one `ssh` row and one `telnet` row.
2. GUI: the sidebar has the SSH entry (host manager, web terminal) after restart.
3. Agent tools in a new session: `ssh_add` / `ssh_list` / `ssh_exec` / `ssh_upload` / `ssh_download` / `ssh_tunnel` / `ssh_cluster` and `telnet_list` / `telnet_add` / `telnet_exec` / `telnet_remove`.
4. Data files: `~/.dsh/dsh-ssh.json` and `~/.dsh/dsh-telnet.json` appear on first use, mode 0600.

## Security notes (repeated from the root README)

- Telnet is plaintext: trusted in-band management networks only; prefer the SSH management port for production devices.
- Passwords are stored plaintext in the two 0600 store files; chat-given credentials also stay in the session log.
- `telnet_exec` is read-only by default; writes require an explicit `readOnly:false` after user confirmation.

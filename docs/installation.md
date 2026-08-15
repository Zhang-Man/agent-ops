# Installation

How to install the agent-ops family onto a dsh machine, covering a fresh dsh, coexistence with the dsh-web-ui family, and the verification checklist.

## Prerequisites

- dsh `0.1.0-rc.5` or later, node `^22.19 || >=24`.
- The target profile must exist: boot it once (`dsh web` creates `~/.dsh/profiles/web`).
- `pnpm` for source installs; nothing extra for npm installs.

## From npm (recommended once published)

```sh
dsh plugin --profile web add @linxin666/agent-ops-all
```

The aggregate inserts one `ssh` row and one `telnet` row and installs both plugins. Restart `dsh web` afterwards.

## From source

```sh
git clone https://github.com/zhu1090093659/agent-ops.git
cd agent-ops
pnpm install && pnpm -r build
pnpm run install:profile          # = node scripts/install.mjs --profile web
```

`install.mjs` links the two bundle packages with the official `dsh plugin add link:` flow, applies the coexistence fixup below when needed, and verifies the composition with `dsh --profile web --dump-config` (exactly one `ssh` row, one `telnet` row). Restart `dsh web` afterwards.

The `agent-ops-all` aggregate is not linked from source: its `workspace:*` dependencies only resolve after publishing, so source installs link the individual packages and npm installs use the aggregate.

## Coexisting with the dsh-web-ui family (skins, panels)

The `@linxin666/dsh-web-ui-all` aggregate already inserts the `ssh` row; the dsh loader rejects duplicate row ids, so the standalone dsh-ssh bundle row must be dropped while the dependency stays (the `ssh` row inserted by web-ui-all then resolves to the agent-ops copy, because the loader resolves row package names from the profile root).

`scripts/install.mjs` does this automatically. The manual equivalent:

```sh
dsh plugin --profile web add @linxin666/dsh-telnet
dsh plugin --profile web add @linxin666/dsh-ssh
# then edit ~/.dsh/profiles/web/package.json:
#   remove "@linxin666/dsh-ssh" from dsh.profile.bundles, keep it in dependencies
```

Do not install `@linxin666/agent-ops-all` together with `@linxin666/dsh-web-ui-all` (both insert the `ssh` row). Use the individual packages plus the fixup instead.

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

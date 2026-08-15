# agent-ops — Remote operations plugin family for DeepSeek Harness

English | [中文](README.zh.md)

agent-ops is the standalone remote-operations family for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/DeepSeek-Harness): SSH operations on Linux servers plus Telnet operations on network devices (switches / routers / firewalls), delivered as hot-pluggable cordis bundle packages that never touch DSH source.

## Packages

| Package | What it does |
| --- | --- |
| [`packages/dsh-ssh`](packages/dsh-ssh) | SSH remote ops: host store (`~/.dsh/dsh-ssh.json`, 0600), persistent ssh2 connection pool, exec / PTY web terminal / SFTP transfer / local port-forward tunnels / cluster execution, sidebar panel, and agent tools `ssh_add` / `ssh_list` / `ssh_exec` / `ssh_upload` / `ssh_download` / `ssh_tunnel` / `ssh_cluster` |
| [`packages/dsh-telnet`](packages/dsh-telnet) | Telnet network-device ops: device store (`~/.dsh/dsh-telnet.json`, 0600), minimal RFC 854 engine (login / enable / paging / prompt detection), readOnly write guard, and agent tools `telnet_list` / `telnet_add` / `telnet_exec` / `telnet_remove` |
| [`packages/agent-ops-all`](packages/agent-ops-all) | Aggregate carrier: installing it mounts all three plugins in one step (npm installs) |
| [`packages/dsh-web-ui-compat`](packages/dsh-web-ui-compat) | Browser shim stamping the legacy `data-pane` DOM hooks the dsh-web-ui family panels expect (vendored from the dsh-web-ui aggregate) |

Two usage workflows, shaped by the bundled `agent-remote-ops` preset (`presets/agent-remote-ops`): Linux server initialization and tuning (apt Tsinghua mirror, npm registry, timezone, base packages, hardening), and network-device configuration changes (read-only recon, candidate commands, user confirmation, write, verify, rollback).

## Quick start

```sh
# npm (after the family is published)
dsh plugin --profile web add @zhangman2235/agent-ops-all

# source (development)
git clone https://github.com/Zhang-Man/agent-ops.git
cd agent-ops
pnpm install && pnpm -r build
pnpm run install:profile          # links both packages into the `web` profile

# the ops persona preset (recommended)
cp -r presets/agent-remote-ops ~/.dsh/.agent-presets/
```

Restart `dsh web`, then create a session with the **远程运维** preset. See [docs/installation.md](docs/installation.md) for the full install matrix (fresh dsh, coexistence with the dsh-web-ui family, verification checklist).

## Repository layout

```text
packages/
  dsh-ssh/          SSH remote operations plugin (host + browser half)
  dsh-telnet/       Telnet network-device plugin (host half)
  agent-ops-all/    aggregate carrier bundle (patch rows + deps)
presets/
  agent-remote-ops/ the ops persona preset (copy into ~/.dsh/.agent-presets/)
shared/             shared tsdown build preset (single source of truth)
scripts/            aggregate generator, source installer, version checker
docs/               installation and development guides
.dsh/skills/        the agent-ops release skill
```

## Security model (read before use)

- Telnet is plaintext: use it only on trusted in-band management networks; prefer the SSH management port for production devices.
- Passwords are stored in plaintext in `~/.dsh/dsh-ssh.json` / `~/.dsh/dsh-telnet.json`, file mode 0600, directory 0700 (the same trust model as ssh-skill).
- Credentials given in chat (via `ssh_add` / `telnet_add`) also stay in the session log — prefer keys or GUI import for sensitive environments.
- `telnet_exec` rejects config-write commands while `readOnly` is true (the default); writes require an explicit `readOnly:false` after user confirmation.
- Remote output is returned verbatim (no redaction); execution and transfers consume real remote resources — confirm before acting.

## Development

See [docs/development.md](docs/development.md) for package conventions and how to add a new ops plugin, and [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow. Releases follow the `agent-ops-release` skill (unified version, tag-triggered publish).

## License

[Apache-2.0](LICENSE)

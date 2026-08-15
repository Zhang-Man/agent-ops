# agent-ops — Remote operations plugin family for DeepSeek Harness

English | [中文](README.zh.md)

agent-ops is one standalone remote-operations plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/DeepSeek-Harness): SSH operations on Linux servers plus Telnet operations on network devices (switches / routers / firewalls), delivered as a single hot-pluggable cordis bundle that never touches DSH source and depends on no other plugin at runtime.

## The plugin

| Package | What it does |
| --- | --- |
| [`packages/agent-ops`](packages/agent-ops) | One plugin, two protocol stacks: SSH server ops (host store, persistent ssh2 pool, exec / web terminal / SFTP / tunnels / cluster) plus Telnet network-device ops (device store, login / enable / paging, readOnly guard), a sidebar panel, and the full agent tool set (`ssh_add` / `ssh_list` / `ssh_exec` / `ssh_upload` / `ssh_download` / `ssh_tunnel` / `ssh_cluster`, `telnet_list` / `telnet_add` / `telnet_exec` / `telnet_remove`) |

Two usage workflows, shaped by the bundled `agent-remote-ops` preset (`presets/agent-remote-ops`): Linux server initialization and tuning (apt Tsinghua mirror, npm registry, timezone, base packages, hardening), and network-device configuration changes (read-only recon, candidate commands, user confirmation, write, verify, rollback).

## Quick start

```sh
# npm (after publishing)
dsh plugin --profile web add @zhangman2235/agent-ops

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
  agent-ops/        the standalone plugin (host + browser half, SSH + Telnet)
presets/
  agent-remote-ops/ the ops persona preset (copy into ~/.dsh/.agent-presets/)
shared/             shared tsdown build preset (single source of truth)
scripts/            source installer, version checker
docs/               installation and development guides
.dsh/skills/        the agent-ops release skill
```

## Security model (read before use)

- The plugin is self-contained at runtime: its client bundle ships its own DOM-hook shim, so no other plugin is required for its GUI or tools.
- Telnet is plaintext: use it only on trusted in-band management networks; prefer the SSH management port for production devices.
- Passwords are stored in plaintext in `~/.dsh/dsh-ssh.json` / `~/.dsh/dsh-telnet.json`, file mode 0600, directory 0700 (the same trust model as ssh-skill).
- Credentials given in chat (via `ssh_add` / `telnet_add`) also stay in the session log — prefer keys or GUI import for sensitive environments.
- `telnet_exec` rejects config-write commands while `readOnly` is true (the default); writes require an explicit `readOnly:false` after user confirmation.
- Remote output is returned verbatim (no redaction); execution and transfers consume real remote resources — confirm before acting.

## Development

See [docs/development.md](docs/development.md) for package conventions and how to add a new ops plugin, and [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow. Releases follow the `agent-ops-release` skill (unified version, tag-triggered publish).

## License

[Apache-2.0](LICENSE)

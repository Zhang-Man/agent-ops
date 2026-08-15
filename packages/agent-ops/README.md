# agent-ops — standalone remote-operations plugin for DeepSeek Harness

English | [中文](README.zh.md)

One independent plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/DeepSeek-Harness): SSH operations on Linux servers plus Telnet operations on network devices (switches / routers / firewalls), delivered as a single hot-pluggable cordis bundle that never touches DSH source and depends on no other plugin at runtime.

## Capabilities

| Capability | Description |
| --- | --- |
| SSH host management | CRUD, search, connection test; config stored in `~/.dsh/dsh-ssh.json`; key / password auth, passphrase keys, ProxyJump jump hosts; `~/.ssh/config` import |
| SSH connection pool | One long-lived connection per host, 30-minute idle disconnect, auto-reconnect (max 3) |
| SSH exec | Timeout (default 60s), stdout/stderr separated, 2MB output guard |
| Web terminal | xterm.js + WebSocket PTY terminal, auto-sizing, real-time output |
| File transfer | SFTP upload / download with progress, remote directory browsing |
| Port forwarding | Local port-forward tunnels (127.0.0.1 only) for remote databases / intranet services |
| Cluster execution | One command concurrently across many hosts (alias / environment / tag filters) |
| Telnet device ops | Device store `~/.dsh/dsh-telnet.json` (0600); login, enable/super privileged mode, `--More--` paging, `[Y/N]` confirmations, per-vendor prompt detection (cisco / huawei / h3c / generic) |
| Read-only guard | `telnet_exec` rejects config-write commands while `readOnly` is true (default); writes need an explicit `readOnly:false` after user confirmation |
| Agent tools | `ssh_add` / `ssh_list` / `ssh_exec` / `ssh_upload` / `ssh_download` / `ssh_tunnel` / `ssh_cluster` and `telnet_list` / `telnet_add` / `telnet_exec` / `telnet_remove` |
| GUI | Sidebar entry + management panel (hosts / devices, terminal, transfer, tunnels, cluster) — the client bundle ships its own DOM-hook shim, so the plugin depends on no other plugin |

## Security model

- Telnet is unencrypted: trusted in-band management networks only; prefer the SSH management port in production.
- Passwords are stored in plaintext in `~/.dsh/dsh-ssh.json` / `~/.dsh/dsh-telnet.json`, file mode 0600, directory 0700 (same trust model as ssh-skill).
- Credentials given in chat (via `ssh_add` / `telnet_add`) also stay in the session log — prefer keys or GUI import for sensitive environments.
- Remote output is returned verbatim (no redaction); execution and transfers consume real remote resources — confirm before acting.
- All `/api/agent-ops/*` routes are loopback-only; tunnels listen on `127.0.0.1` only.

## Installation

```sh
# npm (after publishing)
dsh plugin --profile web add @zhangman2235/agent-ops

# source
git clone https://github.com/Zhang-Man/agent-ops.git
cd agent-ops
pnpm install && pnpm -r build
pnpm run install:profile
```

Restart `dsh web`. The sidebar gains the remote-operations entry; agent sessions gain the `ssh_*` and `telnet_*` tools.

## Coexistence

Do not install `@linxin666/dsh-web-ui-all` together with this plugin: that aggregate mounts `@linxin666/dsh-ssh`, whose `ssh_*` tools duplicate this plugin's registrations. Use the individual web-ui packages (skins, panels) instead — their panels keep working because this plugin's internal shim stamps the shared DOM hooks. See the repository installation guide for the full matrix.

## Known limitations

- Upload targets must be absolute paths; directory download is not supported (download file by file).
- exec reconnect (max 3) may replay non-idempotent commands — mind side effects on long commands.
- ProxyJump hops must be hosts configured in this plugin's own store.
- Telnet prompt detection is heuristic; unusual CLIs can override with `promptRegex`.
- Resume for interrupted transfers is not implemented.

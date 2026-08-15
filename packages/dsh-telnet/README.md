# dsh-telnet — Remote Telnet operations plugin for network devices (DSH)

English | [中文](README.zh.md)

A Telnet plugin for DeepSeek Harness (DSH), sibling of [`@zhangman2235/dsh-ssh`](../dsh-ssh) in the agent-ops family: a short-lived Telnet engine (minimal RFC 854) inside the Host process + a network-device config store + Agent tools, all implemented through the official NPM SDK without modifying DSH source.

## Capabilities

| Capability | Description |
| --- | --- |
| Device management | Add / remove / list; config stored in `~/.dsh/dsh-telnet.json` (versioned JSON, atomic write, mode 0600) |
| Telnet engine | Login (username / password), optional privileged mode (enable / super + password), sequential command execution, automatic `--More--` paging and `[Y/N]` confirmation handling, per-vendor prompt detection (cisco / huawei / h3c / generic) |
| Short-lived connections | Every execution opens a fresh connection and logs out / closes afterwards — vty sessions are never held idle and there is no pool state |
| Read-only guard | `readOnly` defaults to true: commands that start with config-write keywords (`configure terminal`, `system-view`, `save`, `write`, ...) are rejected; writing configuration requires an explicit `readOnly:false` (the workflow persona additionally requires user confirmation first) |
| Agent tools | `telnet_list` / `telnet_add` / `telnet_exec` / `telnet_remove`, sharing the register-first usage habit of dsh-ssh |

## Security model

- Telnet is unencrypted: login passwords and device output travel in plaintext — use it **only on trusted management networks**; prefer the SSH management port (via dsh-ssh) in production.
- Passwords are stored in plaintext in `~/.dsh/dsh-telnet.json`, file mode 0600 inside a 0700 directory (the same trust model as dsh-ssh).
- The agent must register a device via `telnet_add` (or edit the config file) before using it.
- Device output is returned verbatim (no redaction) and may contain configuration and account information.
- Configuration writes require an explicit `readOnly:false` plus a user-confirmed workflow.

## Installation

```sh
# From the repository (development)
git clone https://github.com/Zhang-Man/agent-ops.git
cd agent-ops
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-telnet
```

Restart `dsh web` after installation: the agent tool list gains the `telnet_*` tools and the prompt carries the plugin announcement.

## Usage example (agent conversation)

```
User: This is a Huawei switch at 10.1.1.2, user admin, password xxx, enable password yyy — show me the current config.
Agent: telnet_add(alias: sw-core-1, host: 10.1.1.2, username: admin, password: xxx,
      enablePassword: yyy, deviceType: huawei, enableCommand: super)
      -> telnet_exec(sw-core-1, ["display version", "display current-configuration"], enable: true)
      -> analysis for the user.
```

## Known limitations

- Host half only for now (agent tools + engine); no browser GUI (device panel / web terminal) yet — devices are registered through conversation.
- One `telnet_exec` is one full session; batch many `show` commands into a single call.
- Prompt detection is heuristic: unusual vendor CLIs can override it with `promptRegex`; interactive paging beyond `--More--` (live-updating output like `top`) is unsupported.
- No jump-host / proxy support (unlike dsh-ssh ProxyJump — Telnet scenarios assume in-band management networks).

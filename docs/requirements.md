# agent-ops requirements and goals

[中文](requirements.zh.md) | English

This document consolidates the full requirement background, design goals,
current implementation, and target shape of agent-ops. It is the baseline for
all future development and review. Source: multiple rounds of requirement
discussions and implementation iterations with the user.

## 1. Background and motivation

The user is a network / operations engineer whose daily work spans two kinds
of targets:

- **Servers**: after creating VMs / containers on a hyperconverged platform
  and configuring the basics, they log in remotely to initialize and tune the
  systems (apt Tsinghua mirror, npm domestic registry, timezone, locale, base
  packages, kernel / system parameters, hardening).
- **Network devices**: they optimize and adjust switches, routers, and other
  L2 / L3 devices. Today the flow is: look up documentation -> use AI to
  generate commands -> decide manually -> write the configuration.

Pain points: both workflows hop between tools (docs, AI, terminals, device
CLIs); operations are scattered and repetitive; device configuration writes
lack a uniform confirmation and rollback discipline.

## 2. Core goal

**Let the DSH agent connect to and control servers and network devices through
conversation, completing daily operations and tuning.**

Broken down:

1. Selecting the 远程运维 preset in DSH Web yields a complete remote-operations
   workbench;
2. Servers (SSH) and network devices (Telnet / SSH) are both directly operable
   by the agent;
3. Network-device configuration changes follow a fixed discipline: read-only
   recon -> candidate commands -> user confirmation -> write -> verify ->
   rollback;
4. Server initialization (domestic mirrors etc.) follows: read-only recon ->
   change plan -> user confirmation -> execute -> verify.

## 3. Design principles

1. **One standalone plugin**: agent-ops is a single plugin (one package, one
   composition row, one sidebar entry), never touching DSH source, with **zero
   runtime dependency on other plugins** — DOM hooks, panels, engines, and
   tools are all self-contained.
2. **Agent first, GUI assists**: core capabilities are exposed through agent
   tools (conversation-driven); the GUI panel covers host configuration,
   interactive terminals, and transfers; both share the same configuration
   data.
3. **Safety first**: credentials in private files (0600); configuration writes
   require an explicit readOnly opt-out plus user confirmation; the Telnet
   plaintext scope is stated explicitly; output is unredacted but the risk is
   flagged.
4. **Follow dsh plugin conventions**: cordis bundle package
   (cordis.patch.yml + dsh.client), official NPM SDK, shared build preset,
   bilingual docs, complete tests.

## 4. Feature list (currently implemented)

### 4.1 SSH capabilities (Linux servers)

| Capability | Description |
| --- | --- |
| Host management | CRUD, search, connection test; config in `~/.dsh/dsh-ssh.json`; key / password auth, passphrase keys, ProxyJump jump hosts; `~/.ssh/config` import |
| Persistent pool | One long-lived connection per host, 30-minute idle disconnect, auto-reconnect (max 3) |
| Command execution | Timeout (default 60s), stdout/stderr separated, 2MB output guard |
| Web terminal | xterm.js + WebSocket PTY terminal, auto-sizing, real-time output |
| File transfer | SFTP upload / download with progress, remote directory browsing |
| Port forwarding | Local port-forward tunnels (127.0.0.1 only) for remote databases / intranet services |
| Cluster execution | One command concurrently across many hosts (alias / environment / tag filters) |

### 4.2 Telnet capabilities (network devices)

| Capability | Description |
| --- | --- |
| Device management | Add / remove / list; config in `~/.dsh/dsh-telnet.json` (0600); per-vendor prompt detection (cisco / huawei / h3c / generic) |
| Login and session | Username / password login; optional enable / super privileged mode (with privileged password) |
| Command execution | Sequential commands; automatic `--More--` paging and `[Y/N]` confirmation handling |
| Short-lived sessions | A fresh connection per execution, logged out afterwards — vty sessions are never held |
| Read-only guard | `readOnly` on by default: rejects `configure terminal` / `system-view` / `save` / `write` style commands; writes require an explicit `readOnly:false` after user confirmation |

### 4.3 Agent tools

- SSH: `ssh_add` / `ssh_list` / `ssh_exec` / `ssh_upload` / `ssh_download` /
  `ssh_tunnel` / `ssh_cluster`
- Telnet: `telnet_list` / `telnet_add` / `telnet_exec` / `telnet_remove`

### 4.4 Workflow preset

The `agent-remote-ops` (远程运维) preset hard-codes the two workflows and their
safety discipline (recon -> plan -> user confirmation -> execute -> verify;
network devices additionally require a backup first and rollback on failure).

## 5. Target shape and expected effects (including the new idea)

The evolution direction proposed and confirmed by the user: a **unified
connection model**.

### 5.1 Unified target registry

Today there are two separate registries: hosts (SSH) and devices (Telnet). The
target state is one unified "target" concept:

- One record per target: alias, address, protocol (ssh / telnet), port,
  credentials, privileged-mode settings, tags, environment, notes;
- **The protocol field decides how to connect; the port is only a protocol
  parameter** (ssh defaults to 22, telnet to 23, both customizable);
- Agent tools and the GUI panel read and write the same registry; `ssh_add` /
  `telnet_add` evolve into a unified `target_add` (old tool names kept for
  compatibility);
- Data-file migration compatibility: keep using the existing
  `dsh-ssh.json` / `dsh-telnet.json`, or partition by the protocol field, with
  a migration path that never loses credentials.

### 5.2 GUI panel extension

- A new Devices tab next to Hosts, sharing the same CRUD interactions;
- The target form gains a Protocol selector (SSH / Telnet): choosing Telnet
  shows Telnet-specific fields (enable command, enable password, vendor),
  choosing SSH shows SSH-specific fields (key path, jump host);
- Telnet devices get an **interactive web console** (reusing the terminal
  tab's xterm foundation, bridged through a host-side Telnet session);
- Commands executed on Telnet devices from the GUI obey the same read-only
  guard (an explicit toggle plus confirmation inside the panel).

### 5.3 Expected effects (user perspective)

- **Register by one sentence**: the user drops server / device details into the
  conversation (or the GUI form); the agent registers, verifies connectivity,
  and reports back;
- **One panel for both target kinds**: the sidebar 远程运维 entry opens a panel
  managing hosts and devices together — manage, test, and open terminals;
- **Every device change is traceable**: recon output, candidate commands,
  confirmation results, write results, verification diffs, and rollback
  actions are all visible in the conversation;
- **New protocols plug in without rework**: adding SNMP / serial console later
  only needs a new engine and tools plus a registry enum value — the
  architecture stays put.

## 6. Security model

- Telnet is plaintext: trusted in-band management networks only; prefer the
  SSH management port in production.
- Credentials are stored in plaintext in `~/.dsh/dsh-ssh.json` /
  `~/.dsh/dsh-telnet.json`, file mode 0600, directory 0700 (same trust model
  as ssh-skill); chat-given passwords also stay in the session log — prefer
  keys or GUI import for sensitive environments.
- `telnet_exec` is read-only by default; writes require an explicit
  `readOnly:false` after user confirmation.
- Remote output is returned verbatim (no redaction); execution and transfers
  consume real remote resources — confirm before acting.
- All `/api/agent-ops/*` routes are loopback-only; tunnels listen on
  `127.0.0.1` only.

## 7. Roadmap

| Phase | Content | Status |
| --- | --- | --- |
| P0 | Standalone plugin shape: SSH + Telnet engines, 11 tools, sidebar panel, internal shim, 88 tests | Done locally (push pending) |
| P1 | Unified target registry: protocol field, migration compatibility, unified tool names (old names kept) | Planned |
| P2 | GUI Devices tab: protocol selector form, Telnet interactive console, in-panel read-only toggle | Planned |
| P3 | Release: publish `@zhangman2235/agent-ops` to npm, install docs, release pipeline | Pending |
| P4 | More protocols (SNMP / serial console), bastion / audit hardening | Backlog |

## 8. Current state and leftovers

- Repository: `Zhang-Man/agent-ops` (public GitHub), npm scope
  `@zhangman2235`;
- Local main is 2 commits ahead of origin (panel attribute fix + 远程运维
  branding); run `git push origin main` when the network recovers;
- Usage today: the GUI panel is SSH-only; Telnet devices are registered and
  operated through the conversation;
- Before publishing: configure `NPM_TOKEN` in the GitHub repository, then
  release via the `.dsh/skills/agent-ops-release` skill.

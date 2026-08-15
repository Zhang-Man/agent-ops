# agent-ops-all — aggregate bundle for the agent-ops family

English | [中文](README.zh.md)

One-package installer for the [agent-ops](../..) remote-operations family: installing this aggregate mounts the [`dsh-ssh`](../dsh-ssh) and [`dsh-telnet`](../dsh-telnet) plugins together.

## What it does

- `cordis.patch.yml` is generated from [`aggregate.yml`](aggregate.yml) by `scripts/aggregate.mjs`: the concatenation of the child plugins' insert rows (one `ssh` row, one `telnet` row).
- `package.json` dependencies pull in both children, so one `dsh plugin add` installs the whole family.

## Install

```sh
dsh plugin --profile web add @linxin666/agent-ops-all
```

Restart `dsh web`. See [docs/installation.md](../../docs/installation.md) for the full install matrix and the coexistence rules with the dsh-web-ui family.

## Do not mix with dsh-web-ui-all

`@linxin666/dsh-web-ui-all` also inserts an `ssh` row; installing both aggregates on one profile produces a duplicate row id, which the dsh loader rejects. Coexistence installs use the individual packages instead — see the installation guide.

# Contributing

## Commit conventions

`type(scope): subject` with `feat` / `fix` / `chore` / `docs` / `test` /
`refactor`; scope is the package or topic (`ssh`, `telnet`, `aggregate`,
`install`). No emoji in commits, code, comments, or docs.

## Gates before committing

```sh
pnpm typecheck
pnpm test            # vitest across the repo (the real-sshd case skips without sshd)
pnpm test:scripts    # scripts/*.test.mjs
pnpm aggregate:check # aggregate consistency
```

Regenerate after aggregate manifest changes (`node scripts/aggregate.mjs`); after
editing either README side, update the other and re-record the blob hashes in
`README.i18n.yaml` (`git hash-object README.md README.zh.md`).

## PR requirements

- State which packages changed, why, and the blast radius (tool surface / security model / config format).
- Behavior changes carry tests; security-relevant changes (credentials, remote execution, permissions) update the package README security model section.
- New plugins follow [docs/development.md](docs/development.md): aggregate manifest, install script, and docs in the same PR.
- One-off records (verification snapshots, handovers) go to `docs/archive/`, not long-term docs.

## Release discipline

- Releases are tag-triggered: pushing `vX.Y.Z` runs version consistency checks and all gates before publishing; never hand-edit versions to bypass the check.
- Full flow: `.dsh/skills/agent-ops-release/SKILL.md`.

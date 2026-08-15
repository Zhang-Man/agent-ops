# Development

Package conventions, the local development loop, and how to add a new ops plugin to the family.

## Local development loop

```sh
pnpm install                     # once
pnpm --filter @zhangman2235/dsh-telnet build   # build one package
pnpm --filter @zhangman2235/dsh-telnet test    # run one package's tests
pnpm run install:profile         # link into the web profile (+ verify composition)
# restart `dsh web`, then exercise the tools in a session
```

Tests are self-contained: the Telnet engine talks to a fake device over node:net; the SSH engine uses an embedded ssh2 server. The real-sshd SFTP test additionally needs `/usr/sbin/sshd` and a real system user in `process.env.USER` — environments without those skip it (`describe.skipIf`).

## Package conventions

- Every plugin is a cordis bundle package: `"type": "module"`, node `^22.19 || >=24`, `dsh.bundle.patch` pointing at the package `cordis.patch.yml`; the browser half (when present) is declared through `dsh.client` with `platform: "web"` (see `packages/agent-ops`).
- Host half in `src/index.ts`, browser half in `src/client/`, shared pure logic in `src/core/`.
- Types come only from the `@deepseek-ai/*` npm SDK (devDependencies); runtime peers are declared in peerDependencies. No tsconfig path may point at a DSH source checkout.
- Builds use the shared preset `shared/tsdown.client.ts` — never copy it into a package. Host-only packages pass the same preset; it skips the browser face when `src/client/index.ts` is absent (see `packages/agent-ops` — both protocol engines live in the one package).
- Every plugin package needs passing vitest tests (`pnpm test`).
- READMEs are bilingual triplets (README.md / README.zh.md / README.i18n.yaml); security-relevant packages document their security model in a dedicated section.
- No emoji anywhere; Conventional Commits (`feat(scope): ...`, `fix(scope): ...`).

## Extending the plugin (new protocol / new panel)

1. Host half: new engines in `src/<name>-engine.ts`, stores in `src/<name>-store.ts`, tool factories in `src/<name>-tools.ts`; register them in `src/index.ts` (tools via `ctx.tools`, announcement via `ctx.systemPrompt.section`, every side effect inside `ctx.effect` disposers).
2. Browser half: panel components under `src/client/panel/`, entry wiring in `src/client/index.ts` and `src/client/sidebar-entry.ts`.
3. Write vitest tests under `tests/` (embedded services over node:net / in-process servers first).
4. Update the package README (capabilities table / security model) and the root docs.
5. Run the gates: `pnpm typecheck && pnpm test && pnpm test:scripts`.

## Releasing

The family uses one unified version across all packages. Follow `.dsh/skills/agent-ops-release/SKILL.md`: full local green -> bump every `packages/*/package.json` to the same version -> commit -> push the `vX.Y.Z` tag (the Actions pipeline verifies versions, runs the gates, and publishes with the repo NPM token). Never reuse a published version number; recover from a bad release with `npm deprecate` plus the next patch version.

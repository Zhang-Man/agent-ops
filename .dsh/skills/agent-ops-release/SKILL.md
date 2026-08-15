---
name: agent-ops-release
description: Release and publish the agent-ops monorepo (dsh-ssh + dsh-telnet remote-ops plugin family) — bump all packages to one unified version, commit and tag, push the vX.Y.Z tag that triggers the GitHub Actions publish pipeline, and verify the npm publish. Covers post-release verification and bad-version recovery. Use when the user asks to 发布/发版/release/bump 版本/publish agent-ops or any @zhangman2235/dsh-ssh / @zhangman2235/dsh-telnet / @zhangman2235/agent-ops-all package.
whenToUse: The user wants to release agent-ops (发布新版、发个版本、release、tag、publish @zhangman2235/dsh-ssh / @zhangman2235/dsh-telnet / @zhangman2235/agent-ops-all), build or change the release pipeline (release 管线、CI 发布), or recover from a bad published version (坏包、回滚、deprecate). Not for routine commits or code changes.
---

# agent-ops 发布（release / publish）

本技能固化 agent-ops 家族的发版流程：全仓统一版本 → 提交 → 打 tag → 推送触发
GitHub Actions 发布管线（构建/测试/npm 发布）→ 发布后验证。

## 仓库事实（先读）

- 仓库：agent-ops（PUBLIC），发布 scope `@linxin666`，registry 固定
  registry.npmjs.org。
- 3 个发布包：packages/dsh-ssh、packages/dsh-telnet、packages/agent-ops-all
  （聚合载具，含生成的 cordis.patch.yml）。
- **版本策略：全仓统一版本**（tag vX.Y.Z = 每个 package.json 的 version，由
  scripts/verify-version.mjs 强制校验）。
- npm 不允许重复发布同一版本号；已发布的版本号只能跳过或 bump 到下一个。
- 根 package.json 是 private（不发布）；`pnpm -r publish` 自动跳过。
- 发布由 GitHub Actions 完成（tag 触发），使用仓库 secret `NPM_TOKEN`
  （@linxin666 scope 的 automation token）；本机通常无 npm 登录态属正常。
- 仓库禁 emoji（所有文件含提交信息与 tag 信息）。

## 0. 发版前检查（本地全绿才允许打 tag）

```sh
cd <agent-ops 仓库>
git status --short                 # 明确本次要提交的内容
pnpm typecheck && pnpm test && pnpm test:scripts && pnpm aggregate:check
git log --oneline -5               # 确认本次全部改动已提交
```

版本 bump 后必须重建产物（版本信息影响 bundle 内容）：

```sh
pnpm build                         # 全仓重建 lib 产物（含新版本号）
node scripts/aggregate.mjs         # 重生成聚合 patch（版本无关，防漂移）
pnpm aggregate:check
```

## 1. 版本 bump（全仓统一）

```sh
find packages -name package.json -not -path '*/node_modules/*' \
  -exec sed -i 's/"version": "[0-9][^"]*"/"version": "X.Y.Z"/' {} +
find packages -name package.json -not -path '*/node_modules/*' \
  -exec grep -H '"version"' {} \; | grep -v '"version": "X.Y.Z"'   # 必须无输出
```

pnpm-lock.yaml 不记录包版本；聚合包依赖用 workspace:*，发布时由 pnpm 自动替换
为实际版本。

## 2. 提交与 tag

```sh
# 功能/修复改动（含构建产物 lib/*.js 与聚合重生成的 cordis.patch.yml）
git add <文件...>
git commit -m "fix(telnet): <改动摘要>"

# 发版提交：全部 package.json 版本 bump + 发布相关变更（管线、skill、文档）
git add packages/**/package.json .github/workflows/release.yml .dsh/skills/ AGENTS.md
git commit -m "chore(release): bump to X.Y.Z"

git tag "vX.Y.Z"
git push origin main
git push origin "vX.Y.Z"            # 推送 tag 即触发发布管线（唯一发布开关）
```

## 3. 发布管线（tag 触发，.github/workflows/release.yml）

1. pnpm install（frozen lockfile）；
2. 全量 gate：typecheck / build / test / test:scripts / aggregate:check；
3. **版本一致性校验**：tag 版本必须与全部包 package.json version 一致；
4. `pnpm -r publish --no-git-checks --access public`（NPM_TOKEN 写入 ~/.npmrc，
   拓扑序发布，workspace:* 自动转真实版本）。

排障：

- 版本不一致失败 → 本地把漏掉的包 bump 到 tag 版本，删除远端 tag 重新推送
  （npm 发布前失败无副作用）。
- `NPM_TOKEN` 缺失/过期 → 仓库 Settings → Secrets and variables → Actions
  更新后重跑。
- 部分包已上 npm、部分失败 → 不要重推同一 tag：对未发布的包单独执行发布，
  或整体 bump 下一个补丁版本重发。
- 坏包（内容错误但版本已占用）→ `npm deprecate` 标记弃用并立即发下一补丁版本。

## 4. 发布后验证（必须逐项执行）

```sh
npm view @zhangman2235/agent-ops-all version   # 期望 = X.Y.Z
npm view @zhangman2235/dsh-ssh version
npm view @zhangman2235/dsh-telnet version
git ls-remote --tags origin | grep "vX.Y.Z" # tag 已在远端
```

## 5. 纪律

- tag 一旦推送且 npm 发布成功，同一版本号永不复用；补救只走「下一补丁版本」
  或 deprecate。
- 发版前必须本地全量测试通过；管线版本校验是最后防线，不是唯一防线。
- 改聚合清单（aggregate.yml）后先重跑 aggregate.mjs 再发版。
- 构建产物内嵌构建路径相关的哈希（CSS-module 类名等），同一源码在不同
  checkout 路径下构建字节可能不同；发布用的 lib 产物必须在 tag 前的那次
  全仓构建中生成并提交。

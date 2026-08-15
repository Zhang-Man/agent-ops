# AGENTS.md — agent-ops 仓库规则

DeepSeek Harness 远程运维插件家族 monorepo（dsh-ssh + dsh-telnet + 聚合包）。
每个插件都是独立 cordis bundle 包，经 `cordis.patch.yml` + profile 机制挂载到
`dsh web`，绝不修改 DSH 源码。改 `packages/` 前先读 [packages/AGENTS.md](packages/AGENTS.md)。

## 仓库布局

```text
packages/
  dsh-ssh/          SSH 运维插件（host 半区 + browser 半区）
  dsh-telnet/       Telnet 网络设备插件（host 半区）
  agent-ops-all/    聚合载具包：aggregate.yml 汇总各插件 patch 行与依赖
presets/agent-remote-ops/  运维人设预设（安装时复制进 ~/.dsh/.agent-presets/）
shared/tsdown.client.ts    唯一共享构建预设（禁止在包内复制）
scripts/                   聚合生成 / 源码安装 / 版本校验脚本
docs/                      安装与开发长期文档
.dsh/skills/               agent-ops-release 发布技能
```

## 常用命令

```sh
pnpm install                # 安装依赖
pnpm build                  # 全仓构建（pnpm -r build）
pnpm test                   # 全仓单测
pnpm typecheck              # 全仓类型检查
pnpm test:scripts           # scripts/ 下 *.test.mjs
pnpm aggregate:check        # 聚合包一致性门禁
pnpm run install:profile    # 把两个插件包 link 进 dsh profile（源码安装）
```

改动提交前至少跑 `pnpm typecheck && pnpm test && pnpm test:scripts && pnpm aggregate:check`。

## 全局约定

- **禁止修改 DSH 源码**：挂载只走 `cordis.patch.yml` + profile；tsconfig 不指向
  任何 DSH 源码 checkout；类型只来自 `@deepseek-ai/*` 官方 NPM SDK。
- **构建预设只用 `shared/tsdown.client.ts`**，禁止在包内复制。
- **禁止 emoji**（含代码、注释、文档、提交信息），装饰用普通字符。
- **双语纪律**：主 README 中英配对（README.md + README.zh.md + README.i18n.yaml
  记录两侧 blob hash）；编辑任一侧必须同 PR 更新另一侧并重录 hash。
- **认证环境**：`NPM_TOKEN` 只放环境变量 / 用户级 ~/.npmrc，仓库 .npmrc 不写 token。
- **文档随代码更新**：改动触及任何文档描述的行为时同 PR 更新文档。

## 包形态

- 独立 bundle 包：`"type": "module"`，node `^22.19 || >=24`，`"dsh": { "bundle":
  { "patch": "./cordis.patch.yml" } }` 声明 bundle 激活；host 半区在
  `src/index.ts`，browser 半区在 `src/client/`，共享纯逻辑在 `src/core/`。
- 每个包必须有 `vitest run` 可通过的测试；聚合载具包可无单测，但
  `scripts/aggregate.mjs --check` 必须通过。
- 涉及凭据 / 远程执行 / 安全语义的改动必须同步更新该包 README 的安全模型一节
  与测试。

## 版本与发布

- 全仓统一版本（tag vX.Y.Z = 每个 package.json 的 version，由
  `scripts/verify-version.mjs` 校验）；npm 不允许重发已发布版本号。
- 发布流程见 `.dsh/skills/agent-ops-release/SKILL.md`：本地全绿 → 统一 bump →
  提交 → 推 vX.Y.Z tag 触发 Actions 发布管线。
- 发布后验证：`npm view @linxin666/agent-ops-all version` 等于 tag 版本。

## 分层指令体系

| 文件 | 作用 |
| --- | --- |
| 本文件 | 仓库布局、命令、全局规则 |
| [packages/AGENTS.md](packages/AGENTS.md) | 包级规则：SDK 约束、bundle 形态、测试纪律 |
| [docs/installation.zh.md](docs/installation.zh.md) | 安装矩阵：全新 dsh、与 dsh-web-ui 共存、验证清单 |
| [docs/development.zh.md](docs/development.zh.md) | 开发流程：本地调试、新增插件、发布 |

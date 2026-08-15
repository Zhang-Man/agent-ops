# AGENTS.md — 包级规则（packages/）

本层规则适用于 `packages/` 下所有插件包与聚合包。新建或修改包前先读本文件；
包特有规则写在该包自己的 `AGENTS.md`。

## 包形态

- **独立 cordis bundle 包**：`"type": "module"`，node `^22.19 || >=24`，
  `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` 声明 bundle 激活；
  browser 半区加 `dsh.client` 声明注入与 `platform: "web"`（形态参照
  `packages/dsh-ssh/`）。
- **host / client 半区分层**：`src/index.ts` 是 host 半区（运行在 dsh host
  进程），`src/client/` 是 browser 半区（Web GUI 侧），`src/core/` 是两侧共享
  的纯逻辑。新增源码文件必须落在三个区之一。
- **exports 约定**：包内 `exports` 提供 `.`（host）、必要时 `./client`（浏览器
  半区）与 `./invariant`；`./src/*` 用于测试引用。

## SDK 与构建约束

- **只基于官方 NPM SDK**：类型来自 `@deepseek-ai/*` devDependencies；
  peerDependencies 声明运行时注入的服务；禁止 tsconfig 指向任何 DSH 源码
  checkout。
- **共享构建预设**：所有 tsdown 包 import `shared/tsdown.client.ts`，禁止复制
  到包内；tsconfig 自包含（参照 `dsh-ssh/tsconfig.json`）。
- 跨插件协作走 cordis 服务（`ctx.tools` / `ctx.systemPrompt` / `ctx.slots` 等），
  不走 value import。

## 测试纪律

- 每个插件包必须有 `vitest run` 可通过的测试（`pnpm test` 全仓门禁）；行为
  变化必须带测试。`tests/` 放测试，测试文件不得依赖 DSH 源码 checkout 的
  fixture。
- 聚合载具包（agent-ops-all）可无单测，但 `scripts/aggregate.mjs --check`
  一致性门禁必须通过。
- 远程协议类测试优先用内嵌服务（node:net 假设备 / 内嵌 ssh2 Server），
  真实 sshd 集成测试如 `dsh-ssh/tests/engine.test.ts` 属于可选增强，环境缺
  sshd 时允许跳过（说明见包内测试注释）。

## 双语与文档纪律

- 主插件包 README 中英配对：`README.md`（英文）+ `README.zh.md`（中文）+
  `README.i18n.yaml`（配对一致性记录，两侧 git blob hash）；编辑任一侧必须
  同步另一侧并重录 hash。
- 包内 UI 文案 i18n：`zh` 字典为 key 源，`en` 键集完整对照，经
  `ctx.locale.register` 注册。
- 安全语义：涉及密钥 / 凭据 / 远程执行的包，安全模型说明放包 README 的
  `## 安全模型` 一节；改动安全语义必须同步更新 README 与测试。

## 包级 AGENTS.md

- 包有跨目录规则、复杂构建链或安全模型时，在该包写 `AGENTS.md`（参照
  `dsh-ssh/AGENTS.md` 的简洁风格），只写该包特有规则。

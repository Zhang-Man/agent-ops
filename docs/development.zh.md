# 开发

包约定、本地开发循环、以及向家族新增运维插件的做法。

## 本地开发循环

```sh
pnpm install                     # 首次
pnpm --filter @zhangman2235/dsh-telnet build   # 构建单个包
pnpm --filter @zhangman2235/dsh-telnet test    # 跑单个包测试
pnpm run install:profile         # link 进 web profile（含组合校验）
# 重启 `dsh web`，在新会话中实际调用工具验证
```

测试自包含：`dsh-telnet` 通过 node:net 与假设备对话；`dsh-ssh` 用内嵌 ssh2
Server。`dsh-ssh/tests/engine.test.ts` 里的真实 sshd SFTP 测试额外要求
`/usr/sbin/sshd` 且 `process.env.USER` 是真实系统用户——环境不满足时该用例
自动跳过（`describe.skipIf`）。

## 包约定

- 每个插件都是 cordis bundle 包：`"type": "module"`，node `^22.19 || >=24`，
  `dsh.bundle.patch` 指向包内 `cordis.patch.yml`；有浏览器半区时用 `dsh.client`
  声明注入与 `platform: "web"`（参照 `packages/agent-ops`）。
- host 半区在 `src/index.ts`，browser 半区在 `src/client/`，两侧共享纯逻辑在
  `src/core/`。
- 类型只来自 `@deepseek-ai/*` 官方 NPM SDK（devDependencies）；运行时 peer 写
  peerDependencies；tsconfig 不得指向任何 DSH 源码 checkout。
- 构建只用共享预设 `shared/tsdown.client.ts`，禁止复制进包内；host-only 包
  同样用该预设（无 `src/client/index.ts` 时自动跳过浏览器面，参照
  `packages/agent-ops`）。
- 每个插件包必须有可通过的 vitest 测试（`pnpm test`）。
- README 双语三件套（README.md / README.zh.md / README.i18n.yaml）；涉安全包
  必须有「安全模型」一节。
- 全仓禁 emoji；提交走 Conventional Commits（`feat(scope): ...`）。

## 扩展插件能力（新协议 / 新面板）

1. host 半区：新引擎放 `src/<name>-engine.ts`、存储放 `src/<name>-store.ts`、
   工具工厂放 `src/<name>-tools.ts`，在 `src/index.ts` 注册（工具经
   `ctx.tools` 注册、能力经 `ctx.systemPrompt.section` 宣告、所有副作用放进
   `ctx.effect` 的 disposer）。
2. browser 半区：面板组件放 `src/client/panel/`，入口与侧边栏在
   `src/client/index.ts` / `src/client/sidebar-entry.ts` 注册。
3. 在 `tests/` 写 vitest 测试（优先 node:net 内嵌服务 / 进程内服务器）。
4. 更新本包 README（能力表 / 安全模型）与根文档。
5. 全门禁：`pnpm typecheck && pnpm test && pnpm test:scripts`。

## 发版

家族全仓统一版本。按 `.dsh/skills/agent-ops-release/SKILL.md` 执行：本地全绿 →
全部 `packages/*/package.json` bump 到同一版本 → 提交 → 推 `vX.Y.Z` tag
（Actions 管线校验版本一致性、跑全部门禁、用仓库 NPM token 发布）。已发布
版本号永不复用；坏包用 `npm deprecate` + 下一个补丁版本补救。

# 贡献指南（Contributing）

## 提交规范

提交信息格式 `type(scope): subject`：type 用 `feat` / `fix` / `chore` / `docs` /
`test` / `refactor`，scope 是包名或主题（如 `ssh`、`telnet`、`aggregate`、
`install`）。例：`fix(telnet): match prompts only after the previous one`。
提交信息、代码、注释、文档一律禁止 emoji。

## 提交前必过门禁

```sh
pnpm typecheck
pnpm test            # 全仓 vitest（dsh-ssh 的真实 sshd 用例在缺 sshd 环境自动跳过）
pnpm test:scripts    # scripts/*.test.mjs
pnpm aggregate:check # 聚合包一致性
```

涉及聚合清单改动时先 `node scripts/aggregate.mjs` 重生成；涉及 README 任一侧
修改时同步另一侧并重录 `README.i18n.yaml` 的 blob hash
（`git hash-object README.md README.zh.md`）。

## PR 要求

- 变更摘要写清楚：改了哪些包、为什么、影响面（工具面 / 安全模型 / 配置格式）。
- 行为变化必须带测试；涉安全语义（凭据、远程执行、权限）必须同步更新包
  README 的「安全模型」一节。
- 新增插件按 [docs/development.zh.md](docs/development.zh.md) 的步骤同步聚合
  清单、安装脚本与文档。
- 一次性记录（验证快照、任务交接）放 `docs/archive/`，不进长期文档。

## 发布纪律

- 发布由 tag 触发：推送 `vX.Y.Z` 后 CI 校验每个包版本与 tag 一致，全门禁通过
  才发布 npm；不要手工改版本号绕过校验。
- 完整流程见 `.dsh/skills/agent-ops-release/SKILL.md`。

# AGENTS.md — agent-ops 插件包

dsh Web GUI 的独立远程运维插件：Host 进程内的 SSH 连接池 + Telnet 引擎 + 路由 +
Agent 工具，Browser 半区的侧边栏入口 / 管理面板 / Web 终端。

## 安全模型（本包最重的纪律）

- 主机 / 设备配置存 `~/.dsh/dsh-ssh.json` 与 `~/.dsh/dsh-telnet.json`（目录
  0700、文件 0600，原子写入）；密码 / passphrase 口令以**明文**存储——按
  ssh-skill 同一信任模型，别为"脱敏"而加密，也别把路径暴露给模型或日志。
- 连接池空闲 30 分钟断开、断线自动重连（最多 3 次）——重连可能**重放非幂等
  命令**。
- 远程输出**原样返回**（不脱敏）；执行 / 传输消耗**真实远程资源**，先确认。
- Telnet 明文传输仅限可信带内管理网络；`telnet_exec` 默认 readOnly，写配置
  须显式 `readOnly:false` 且先经用户确认。
- `ssh_upload` / `ssh_download` 以宿主进程权限直接读写本机任意路径（不经
  bash 沙箱）；所有 `/api/agent-ops/*` 路由仅限 loopback，隧道只监听
  `127.0.0.1`。
- `ssh_add` / `telnet_add` 允许 Agent 按用户在对话中**明确给出的凭据**注册；
  密码同时落入 0600 配置文件与会话记录，敏感环境提示用户改用密钥或 GUI。

## 独立性纪律

- **运行时零依赖**：侧边栏入口、面板与 DOM 钩子（`src/client/shim.ts`）全部
  自包含在本包 client bundle 内，不依赖任何其他插件的行或服务。
- 与 `@linxin666/dsh-web-ui-all` 互斥（其 dsh-ssh 子包与本插件的 `ssh_*`
  工具重复注册）；与其他插件的共存仅是可选叠加。
- 数据文件路径保持 `dsh-ssh.json` / `dsh-telnet.json`，不随包名迁移。

## 提交前检查

```sh
pnpm --filter @zhangman2235/agent-ops test   # SSH + Telnet 引擎/存储/路由/工具/UI 契约
pnpm run typecheck
pnpm run build
```

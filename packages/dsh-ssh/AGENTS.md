# AGENTS.md — dsh-ssh

dsh Web GUI 的远程 SSH 运维插件：Host 进程内的持久 ssh2 连接池 + Web GUI 主机
管理面板 / Web 终端 / 文件传输 / 端口转发 / 集群执行，外加 Agent 工具。

## 安全模型（本包最重的纪律）

- 主机配置存 `~/.dsh/dsh-ssh.json`（目录 0700、文件 0600，原子写入）；密码 /
  passphrase 密钥口令以**明文**存在该文件——按 ssh-skill 同一信任模型，别为
  "脱敏"而加密，也别把该路径暴露给模型或日志。
- 连接池空闲 30 分钟自动断开、断线自动重连（最多 3 次）——重连可能**重放非幂等
  命令**，长命令注意副作用（README「已知限制」）。
- exec / cluster 输出**原样返回**（不脱敏），如 `env` 可能把远端环境密钥带回
  对话记录；传输 / 执行消耗**真实远程资源**，Agent 使用前先确认。
- `ssh_upload` / `ssh_download` 以宿主进程权限直接读写本机任意路径（不经
  bash 沙箱）；所有 `/api/dsh-ssh/*` 路由仅限 loopback，隧道只监听 `127.0.0.1`。
- `ssh_add` 允许 Agent 按用户在对话中**明确给出的凭据**注册主机（密码或密钥
  路径）：密码同时落入 0600 配置文件与会话记录，敏感环境应提示用户改用密钥
  或 GUI 导入；Agent 不得主动要求用户提供密码，不得注册用户未给出的主机。

## Agent 工具面

- 七个工具 `ssh_add` / `ssh_list` / `ssh_exec` / `ssh_upload` / `ssh_download` /
  `ssh_tunnel` / `ssh_cluster`，GUI 与 Agent 共享同一份主机配置。
- Agent 操作的主机来源：用户在 GUI 配置过、从 `~/.ssh/config` 导入、或用户
  在对话中给出凭据后经 `ssh_add` 注册；别名未配置时先告知用户配置方式，
  不得臆造主机或凭据。

## 提交前检查

```sh
pnpm --filter @zhangman2235/dsh-ssh test   # store + 引擎单测（内嵌 ssh2 Server + 真实 sshd）
pnpm run typecheck
pnpm run build
```

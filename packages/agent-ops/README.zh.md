# agent-ops — DeepSeek Harness 独立远程运维插件

[English](README.md) | 中文

面向 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/DeepSeek-Harness) 的独立远程运维插件：Linux 服务器 SSH 运维 + 网络设备（交换机 / 路由器 / 防火墙）Telnet 运维，以单个热插拔 cordis bundle 交付，不修改 DSH 源码，运行时**不依赖任何其他插件**。

## 能力

| 能力 | 说明 |
| --- | --- |
| SSH 主机管理 | 增删改查、搜索、连接测试；配置存 `~/.dsh/dsh-ssh.json`；密钥 / 密码认证、passphrase 密钥、ProxyJump 跳板机；支持导入 `~/.ssh/config` |
| SSH 连接池 | 每台主机一条长连接，空闲 30 分钟断开，断线自动重连（最多 3 次） |
| SSH 命令执行 | 超时（默认 60s），stdout/stderr 分离，2MB 输出截断保护 |
| Web 终端 | xterm.js + WebSocket PTY 终端，自适应尺寸，实时输出 |
| 文件传输 | SFTP 上传 / 下载带进度，远程目录浏览 |
| 端口转发 | 本地端口转发隧道（仅 127.0.0.1），访问远程数据库 / 内网服务 |
| 集群执行 | 一条命令并发跑多台主机（按别名 / 环境 / 标签过滤） |
| Telnet 设备运维 | 设备配置 `~/.dsh/dsh-telnet.json`（0600）；登录、enable/super 特权模式、`--More--` 分页、`[Y/N]` 确认、按厂商提示词检测（cisco / huawei / h3c / generic） |
| 只读护栏 | `telnet_exec` 默认 `readOnly`，拒绝写入类命令；写配置须显式 `readOnly:false` 且先经用户确认 |
| Agent 工具 | `ssh_add` / `ssh_list` / `ssh_exec` / `ssh_upload` / `ssh_download` / `ssh_tunnel` / `ssh_cluster` 与 `telnet_list` / `telnet_add` / `telnet_exec` / `telnet_remove` |
| GUI | 侧边栏入口 + 管理面板（主机 / 设备、终端、传输、隧道、集群）——client bundle 自带 DOM 钩子 shim，插件不依赖任何其他插件 |

## 安全模型

- Telnet 明文传输：仅限可信带内管理网络；生产环境优先 SSH 管理口。
- 密码以明文存于 `~/.dsh/dsh-ssh.json` / `~/.dsh/dsh-telnet.json`，文件权限 0600、目录 0700（与 ssh-skill 同一信任模型）。
- 对话中给出的凭据（`ssh_add` / `telnet_add`）同时留在会话记录，敏感环境优先密钥或 GUI 导入。
- 远程输出原样返回（不脱敏）；执行与传输消耗真实远程资源，先确认再操作。
- 所有 `/api/agent-ops/*` 路由仅限 loopback；隧道只监听 `127.0.0.1`。

## 安装

```sh
# npm（发布后）
dsh plugin --profile web add @zhangman2235/agent-ops

# 源码
git clone https://github.com/Zhang-Man/agent-ops.git
cd agent-ops
pnpm install && pnpm -r build
pnpm run install:profile
```

重启 `dsh web`：侧边栏出现远程运维入口，Agent 会话获得 `ssh_*` 与 `telnet_*` 工具。

## 共存

不要与 `@linxin666/dsh-web-ui-all` 同装：该聚合包会挂载 `@linxin666/dsh-ssh`，
其 `ssh_*` 工具与本插件重复注册。共存场景安装各单体 web-ui 包（皮肤、面板）
——它们的面板依然可用，因为本插件内置 shim 会打上共享 DOM 钩子。完整安装矩阵
见仓库安装指南。

## 已知限制

- 上传目标路径必须是绝对路径；目录下载暂不支持（逐文件下载）。
- exec 断线重连（最多 3 次）可能重放非幂等命令，长命令注意副作用。
- ProxyJump 每一跳必须是本插件已配置的主机别名。
- Telnet 提示词检测为启发式，特殊 CLI 可用 `promptRegex` 覆盖。
- 断点续传暂未实现。

# agent-ops — DeepSeek Harness 远程运维插件全家桶

[English](README.md) | 中文

agent-ops 是面向 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/DeepSeek-Harness) 的独立远程运维插件：Linux 服务器 SSH 运维 + 网络设备（交换机 / 路由器 / 防火墙）Telnet 运维，以单个热插拔 cordis bundle 交付，不修改 DSH 源码，运行时**不依赖任何其他插件**。

## 插件

| 包 | 能力 |
| --- | --- |
| [`packages/agent-ops`](packages/agent-ops) | 一个插件、两套协议栈：SSH 服务器运维（主机配置、持久 ssh2 连接池、exec / Web 终端 / SFTP / 隧道 / 集群）+ Telnet 网络设备运维（设备配置、登录 / enable / 分页、readOnly 护栏）、侧边栏面板与全套 Agent 工具（`ssh_add` / `ssh_list` / `ssh_exec` / `ssh_upload` / `ssh_download` / `ssh_tunnel` / `ssh_cluster`，`telnet_list` / `telnet_add` / `telnet_exec` / `telnet_remove`） |

配套 `agent-remote-ops` 预设（`presets/agent-remote-ops`）固化两类工作流：Linux 服务器初始化与优化（apt 清华源、npm 国内源、时区、基础包、加固），以及网络设备配置变更（只读探测、候选命令、用户确认、写入、验证、回滚）。

## 快速开始

```sh
# npm 安装（发布后）
dsh plugin --profile web add @zhangman2235/agent-ops

# 源码安装（开发调试）
git clone https://github.com/Zhang-Man/agent-ops.git
cd agent-ops
pnpm install && pnpm -r build
pnpm run install:profile          # 把两个包 link 进 web profile

# 运维人设预设（推荐）
cp -r presets/agent-remote-ops ~/.dsh/.agent-presets/
```

重启 `dsh web`，新建会话时选择**远程运维**预设。完整安装矩阵（全新 dsh、与 dsh-web-ui 家族共存、验证清单）见 [docs/installation.zh.md](docs/installation.zh.md)。

## 仓库布局

```text
packages/
  agent-ops/        独立插件（host + 浏览器双半区，SSH + Telnet）
presets/
  agent-remote-ops/ 运维人设预设（复制进 ~/.dsh/.agent-presets/）
shared/             共享 tsdown 构建预设（唯一事实源）
scripts/            源码安装器、版本校验器
docs/               安装与开发指南
.dsh/skills/        agent-ops 发布技能
```

## 安全模型（使用前必读）

- 插件运行时自包含：client bundle 自带 DOM 钩子 shim，GUI 与工具不依赖任何其他插件。
- Telnet 明文传输：仅限可信带内管理网络；生产设备优先 SSH 管理口。
- 密码以明文存于 `~/.dsh/dsh-ssh.json` / `~/.dsh/dsh-telnet.json`，文件权限 0600、目录 0700（与 ssh-skill 同一信任模型）。
- 对话中给出的凭据（`ssh_add` / `telnet_add`）同时留在会话记录，敏感环境优先密钥或 GUI 导入。
- `telnet_exec` 在 `readOnly`（默认开启）下拒绝写入类命令；写配置须显式 `readOnly:false` 且先经用户确认。
- 远程输出原样返回（不脱敏）；执行与传输消耗真实远程资源，先确认再操作。

## 需求与目标

完整的需求背景、设计原则、目标形态（统一连接模型）与路线图见
[docs/requirements.zh.md](docs/requirements.zh.md)。

## 开发

包约定与新增运维插件的做法见 [docs/development.zh.md](docs/development.zh.md)，贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。发版走 `agent-ops-release` 技能（全仓统一版本、tag 触发发布）。

## License

[Apache-2.0](LICENSE)

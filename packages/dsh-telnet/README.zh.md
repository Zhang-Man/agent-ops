# dsh-telnet — 网络设备 Telnet 运维插件（DSH 版）

[English](README.md) | 中文

为 DeepSeek Harness（DSH）定制的网络设备 Telnet 插件，与
[`@linxin666/dsh-ssh`](../dsh-ssh) 同属 agent-ops 全家桶：Host 进程内的
短连接 Telnet 引擎（RFC 854 最小实现）+ 设备配置存储 + Agent 工具，全部通过
官方 NPM SDK 实现，不修改 DSH 源码。

## 能力

| 能力 | 说明 |
| --- | --- |
| 设备管理 | 增删查；配置存 `~/.dsh/dsh-telnet.json`（版本化 JSON，原子写入，权限 0600） |
| Telnet 引擎 | 登录（用户名/密码）、可选特权模式（enable/super + 密码）、顺序执行命令、自动处理 `--More--` 分页与 `[Y/N]` 确认提示、按厂商提示词检测（cisco/huawei/h3c/generic） |
| 短连接模型 | 每次执行新建连接、执行后自动 logout/断开，不占用 vty 会话，无连接池状态 |
| 只读护栏 | `readOnly` 默认开启：拒绝 `configure terminal` / `system-view` / `save` / `write` 等写入类命令；写配置必须显式 `readOnly:false`（配合人设要求先经用户确认） |
| Agent 工具 | `telnet_list` / `telnet_add` / `telnet_exec` / `telnet_remove`，与 dsh-ssh 共用「先注册后操作」的使用习惯 |

## 安全模型

- Telnet 无加密：登录密码与设备输出均为明文传输，**仅限可信管理网络（带内管理网段）**使用；生产环境建议优先走 SSH 管理口（用 dsh-ssh）。
- 密码以明文保存在 `~/.dsh/dsh-telnet.json`，文件权限 0600、目录 0700（与 dsh-ssh 同一信任模型）。
- Agent 使用设备前，需先通过 `telnet_add` 注册（或直接编辑设备配置文件）。
- 设备输出原样返回（不脱敏），可能包含设备配置、账号等敏感信息。
- 写配置必须显式 `readOnly:false`，且工作流要求先经用户确认再写入。

## 安装

```sh
# 从仓库安装（开发调试）
git clone https://github.com/Zhang-Man/agent-ops.git
cd agent-ops
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-telnet
```

安装后**重启 `dsh web`**：Agent 工具列表出现 `telnet_*` 工具；提示词自动带插件说明。

## 使用示例（Agent 对话）

```
用户：这是台华为交换机，IP 10.1.1.2，用户名 admin，密码 xxx，enable 密码 yyy，帮我看看当前配置。
Agent：telnet_add（alias: sw-core-1, host: 10.1.1.2, username: admin, password: xxx,
      enablePassword: yyy, deviceType: huawei, enableCommand: super）
      → telnet_exec(sw-core-1, ["display version", "display current-configuration"], enable: true)
      → 给出分析结论。
```

## 已知限制

- 目前仅 Host 侧（Agent 工具 + 引擎），尚无浏览器 GUI（设备面板/Web 终端），设备通过对话注册。
- 一次 `telnet_exec` 为一次完整会话；大批量 show 命令建议合并到一次调用。
- 提示词检测为启发式：特殊厂商 CLI 可用 `promptRegex` 覆盖；`--More--` 之外的交互式分页（如 `top` 类动态输出）不支持。
- 未实现跳板/代理接入（与 dsh-ssh 的 ProxyJump 不同，Telnet 场景按带内管理网络假设）。

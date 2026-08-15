# 安装

agent-ops 家族在 dsh 机器上的完整安装方式：全新 dsh、与 dsh-web-ui 家族共存、验证清单。

## 前置条件

- dsh `0.1.0-rc.5` 及以上，node `^22.19 || >=24`。
- 目标 profile 必须已存在：先启动一次（`dsh web` 会创建 `~/.dsh/profiles/web`）。
- 源码安装需要 `pnpm`；npm 安装无额外依赖。

## npm 安装（发布后推荐）

```sh
dsh plugin --profile web add @zhangman2235/agent-ops-all
```

聚合包会插入一条 `ssh` 行与一条 `telnet` 行并装齐两个插件，之后重启 `dsh web`。

## 源码安装

```sh
git clone https://github.com/Zhang-Man/agent-ops.git
cd agent-ops
pnpm install && pnpm -r build
pnpm run install:profile          # = node scripts/install.mjs --profile web
```

`install.mjs` 用官方 `dsh plugin add link:` 流程链接两个插件包，需要时自动做与
dsh-web-ui 的共存修复，并用 `dsh --profile web --dump-config` 校验组合树
（`ssh` 行与 `telnet` 行各恰好一条）。之后重启 `dsh web`。

`agent-ops-all` 聚合包不做源码链接：它的 `workspace:*` 依赖只有在发布后才可
解析，因此源码装单体包、npm 装聚合包。

## 与 dsh-web-ui 家族（皮肤、面板）共存

`@linxin666/dsh-web-ui-all` 聚合包本身就会插入自己的 `ssh` 行（行名
`@linxin666/dsh-ssh`），与本家族的 `ssh` 行 id 冲突——dsh loader 拒绝重复行
id，没有静默绕过方式。共存做法：把聚合包替换为各单体 web-ui 包（即聚合包的
全部内容除去它的 dsh-ssh 子包），再正常安装 agent-ops：

```sh
dsh plugin --profile web remove @linxin666/dsh-web-ui-all
dsh plugin --profile web add @linxin666/dsh-client-ui-web-ui-settings \
  @linxin666/dsh-client-ui-aionui-panel @linxin666/dsh-client-ui-task-board \
  @linxin666/dsh-client-ui-git-graph @linxin666/dsh-pet @linxin666/dsh-remote-web-ui \
  @linxin666/dsh-live-stats @linxin666/dsh-tool-describe-image \
  @linxin666/dsh-skins
```

`scripts/install.mjs` 检测到该聚合包时会打印上述指引并中止，而不是装一半。
同样不要把 `@zhangman2235/agent-ops-all` 与 `@linxin666/dsh-web-ui-all` 同时
安装——行 id 冲突相同。

## agent-remote-ops 预设（推荐）

家族自带运维人设预设，复制进用户预设根目录后重启：

```sh
cp -r presets/agent-remote-ops ~/.dsh/.agent-presets/
```

新建会话时选择**远程运维**预设（或在设置里把默认预设改为
`agent-presets.default: agent-remote-ops`）。预设固化两类工作流：Linux 服务器
初始化与优化（探测 → 方案 → 确认 → 执行 → 验证），以及网络设备配置变更
（只读探测 → 候选命令 → 用户确认 → 写入 → 验证 → 回滚）。

## 验证清单

1. 组合树：`dsh --profile web --dump-config` 中 `ssh` 行与 `telnet` 行各恰好一条。
2. GUI：重启后侧边栏出现「SSH」入口（主机管理、Web 终端）。
3. 新会话 Agent 工具：`ssh_add` / `ssh_list` / `ssh_exec` / `ssh_upload` /
   `ssh_download` / `ssh_tunnel` / `ssh_cluster` 与 `telnet_list` / `telnet_add` /
   `telnet_exec` / `telnet_remove` 齐全。
4. 数据文件：首次使用后出现 `~/.dsh/dsh-ssh.json` 与 `~/.dsh/dsh-telnet.json`，
   权限 0600。

## 安全提示（与根 README 一致）

- Telnet 明文传输：仅限可信带内管理网络；生产设备优先 SSH 管理口。
- 密码明文存于两个 0600 配置文件；对话中给出的凭据同时留在会话记录。
- `telnet_exec` 默认只读；写配置须显式 `readOnly:false` 且先经用户确认。

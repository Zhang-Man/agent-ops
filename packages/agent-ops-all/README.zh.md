# agent-ops-all — agent-ops 家族聚合载具包

[English](README.md) | 中文

[agent-ops](../..) 远程运维家族的一键安装包：装这一个聚合包即同时挂载
[`dsh-ssh`](../dsh-ssh) 与 [`dsh-telnet`](../dsh-telnet) 两个插件。

## 作用

- `cordis.patch.yml` 由 `scripts/aggregate.mjs` 依据 [`aggregate.yml`](aggregate.yml) 生成：
  两个子插件 insert 行的拼接（一条 `ssh` 行、一条 `telnet` 行）。
- `package.json` 依赖拉取两个子包，一条 `dsh plugin add` 装齐全家。

## 安装

```sh
dsh plugin --profile web add @linxin666/agent-ops-all
```

重启 `dsh web`。完整安装矩阵及与 dsh-web-ui 家族的共存规则见
[docs/installation.zh.md](../../docs/installation.zh.md)。

## 不要与 dsh-web-ui-all 混装

`@linxin666/dsh-web-ui-all` 本身也会插入 `ssh` 行；同一 profile 同时装两个聚合包
会产生重复行 id，被 dsh loader 拒绝。共存场景改用单体包安装——见安装指南。

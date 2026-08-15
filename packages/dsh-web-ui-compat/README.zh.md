# dsh-web-ui-compat — DOM 挂载型 web-ui 插件的旧版钩子兼容 shim

[English](README.md) | 中文

浏览器侧 shim：把旧版 `data-pane` / `data-dsh-frame` 属性打到当前 dsh web shell
的列元素上。dsh-web-ui 家族插件（任务看板、dsh-ssh 面板、aionui-panel、若干
皮肤）都通过这些旧选择器做 DOM 挂载；没有这个 shim，它们的 bundle 即使加载
成功也毫无反应。

从 dsh-web-ui 家族聚合包（packages/dsh-web-ui-all，Apache-2.0，
github.com/zhu1090093659/dsh-web-ui）vendor 而来，使 agent-ops 安装自包含——
原 shim 没有独立 npm 包。

## 作用

- 在 shell 网格列上打上 `data-pane="sidebar"` / `data-pane="conversation"` /
  `data-pane="details"` 与 `data-dsh-frame=""` 属性。
- 每次 DOM 变动后重新打标（React 重渲染会重建列元素）。
- 只写属性：不删除节点、不干扰 React 协调。

## 安装

已包含在 `@zhangman2235/agent-ops-all` 聚合包中，`scripts/install.mjs` 也会
自动链接。单独安装：

```sh
dsh plugin --profile web add @zhangman2235/dsh-web-ui-compat
```

## 兼容性

不要与 `@linxin666/dsh-web-ui-all` 同时安装——聚合包内嵌同一个 shim，会产生
重复的 `ui-web-ui-compat` 行 id。共存场景安装各单体 web-ui 包即可，见
agent-ops 安装指南。

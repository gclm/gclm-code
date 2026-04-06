# 安装与升级指南

本文档区分两种常见使用方式：

- `npm` 全局安装版：面向终端用户，安装后直接使用全局命令 `gc`
- 仓库本地构建版：面向开发者，在仓库内拉代码、构建并运行本地产物

## 1. npm 全局安装版

适用场景：

- 你只是想在本机使用 `gclm-code`
- 不准备改源码
- 希望跟随 npm 已发布版本升级

当前安装方式：

```bash
npm i -g gclm-code
```

升级到最新发布版本：

```bash
npm i -g gclm-code@latest
```

如需明确升级到某个版本，例如 `v1.0.3`：

```bash
npm i -g gclm-code@1.0.3
```

升级后建议校验：

```bash
hash -r
gc --version
```

兼容入口也会一并可用：

```bash
claude --version
```

说明：

- 当前 npm 发布主链为 `single-package + vendor runtime`
- 安装阶段会通过 `postinstall` 下载并落盘当前平台 runtime
- 当前 npm 发布仅覆盖 macOS：`darwin-x64` 与 `darwin-arm64`
- Linux / Windows 暂未纳入当前 npm 发布范围

## 2. 仓库本地构建版

适用场景：

- 你需要修改源码或跟踪仓库最新提交
- 你希望验证未发布改动
- 你当前主要通过仓库内的 `./dist/gclm` 运行

首次拉取并构建：

```bash
git clone https://github.com/gclm/gclm-code.git
cd gclm-code
bun install
bun run build
./dist/gclm
```

升级仓库本地构建版：

```bash
git pull
bun install
bun run build
./dist/gclm --version
```

如果你本地有未提交改动，升级前建议先查看工作树状态：

```bash
git status --short
```

说明：

- 仓库本地构建版不会自动跟随 npm 发布升级
- 它的升级方式本质上是“拉最新代码 + 重新安装依赖 + 重新构建”
- 如果你运行的是 `./dist/gclm`，那么全局执行 `npm i -g gclm-code@latest` 不会替你更新仓库里的构建产物

## 3. 如何判断自己是哪一种

如果你平时这样使用：

```bash
gc
```

并且它来自全局 PATH，一般就是 `npm` 全局安装版。

如果你平时这样使用：

```bash
./dist/gclm
```

或者在仓库目录里执行 `bun run build` 后再运行产物，一般就是仓库本地构建版。

你也可以用下面的命令辅助判断：

```bash
which gc
```

常见结果：

- 指向 npm 全局目录，例如 `/usr/local/bin/gc`，通常说明你在用全局安装版
- 指向当前仓库或仓库附近路径，通常说明你在用本地构建版或本地软链

## 4. 常见建议

- 面向日常使用：优先使用 `npm` 全局安装版
- 面向开发调试：优先使用仓库本地构建版
- 两者可以同时存在，但要注意你当前终端实际调用的是哪一个 `gc`

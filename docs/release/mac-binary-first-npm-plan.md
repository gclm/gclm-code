# mac Binary-First + npm 分发方案

更新时间：2026-04-05

## 1. 决策摘要

后续如果重新投入 release 架构，建议采用：

- 产品形态：`mac binary-first`
- 平台范围：首批只支持 `darwin-x64` 与 `darwin-arm64`
- npm 分发模式：`根包 + 架构子包`
- 对外安装入口：`npm i -g gclm-code`

本方案的核心目标不是继续修复 workspace 对 npm 消费者的兼容性，而是把对外交付边界从“源码工作区包”收敛为“CLI 成品二进制”。

## 当前仓库已落地骨架

当前仓库已经新增一版可本地验证的 mac binary-first 组装骨架：

- `node ./scripts/prepare-mac-binary-npm.mjs`
  - 生成：
    - `dist/npm/gclm-code`
    - `dist/npm/gclm-code-darwin-x64`
    - `dist/npm/gclm-code-darwin-arm64`
- `node ./scripts/pack-mac-binary-npm.mjs`
  - 把 staging 三包输出为 npm tarball
- `node ./scripts/prepare-mac-release-assets.mjs`
  - 生成双架构 `tar.gz + sha256`
- `bun run smoke:mac-binary-npm`
  - 校验 3 个生成包都可执行 `npm pack`
  - 校验根包 launcher 在模拟安装布局下能找到当前架构子包并启动二进制
- `node ./scripts/smoke-mac-binary-npm-install.mjs`
  - 校验当前架构子包 tarball + 根包 tarball 可在临时项目中离线安装并跑通 `node_modules/.bin/gc`
- `node ./scripts/smoke-mac-binary-npm-registry.mjs`
  - 启动临时 Verdaccio 私有 registry，按顺序发布三包，再从 registry 安装根包验证 `node_modules/.bin/gc`
- `.github/workflows/release-npm.yml`
  - 已接入 `macos-15-intel` + `macos-15` 双 runner
  - 已接入双架构 smoke 与 npm 顺序发布

当前验证分成三层：

- `smoke:mac-binary-npm` 负责 staging 目录与 launcher 主链校验
- `smoke-mac-binary-npm-install.mjs` 负责 tarball 安装后的当前架构消费者路径校验
- `smoke-mac-binary-npm-registry.mjs` 负责私有 registry 发布后的当前架构消费者路径校验

之所以不直接用“仓库目录 `npm install`”做最终断言，是因为 npm 对本地目录安装会优先走 symlink 路径，这与未来 registry 安装行为不完全一致。

## 2. 为什么选这条路

当前仓库已经更接近“CLI 成品分发”而不是“普通 npm library”：

- 根包已通过 `bin` 暴露 `gc` / `claude`
- 当前主构建已使用 Bun compile 产出可执行文件
- 多个本地 package 明显依赖宿主能力，而不是适合作为对外 npm library 暴露

当前本地产物体积也说明，不适合把双架构二进制直接合进一个 npm 包：

- 本地单个 `gc` 约 `171MB`
- 当前打包产物 `gclm-code-1.0.0.tgz` 约 `50MB`

因此更合适的方向是：

- 让根包只承担“入口、选择、转发”
- 让架构包各自携带真实二进制

## 3. 目标与非目标

### 目标

- 让用户通过 npm 安装到二进制产品，而不是 workspace 源码树
- 保持单一对外包名：`gclm-code`
- 首批覆盖 `darwin-x64` 与 `darwin-arm64`
- 保留 GitHub Release 资产作为并行下载入口
- 为未来追加平台或能力分层预留扩展路径

### 非目标

- 首批不考虑 Linux / Windows
- 首批不追求“一个通用 macOS 单文件包”
- 已明确删除 legacy 的 `workspace:* -> file:` 发布兼容链路，不再继续维护
- 首批不强求所有本地 package 都完全 bundle 进最终二进制

## 4. 包结构

建议拆成 3 个 npm 包，版本号保持严格一致。

### 4.1 根包

- 包名：`gclm-code`
- 职责：
  - 对外暴露 `gc` / `claude`
  - 依赖两个架构子包
  - 在运行时选择正确二进制并转发执行
  - 对不支持的平台输出明确错误

建议字段：

```json
{
  "name": "gclm-code",
  "version": "1.0.0",
  "os": ["darwin"],
  "cpu": ["x64", "arm64"],
  "bin": {
    "gc": "./bin/gc.js",
    "claude": "./bin/gc.js"
  },
  "optionalDependencies": {
    "gclm-code-darwin-x64": "1.0.0",
    "gclm-code-darwin-arm64": "1.0.0"
  }
}
```

说明：

- `optionalDependencies` 让 npm 在当前平台只保留可安装的架构子包
- `bin` 不直接指向真实二进制，而是指向一个很小的 launcher
- launcher 负责更友好的报错与转发

### 4.2 架构子包

包名：

- `gclm-code-darwin-x64`
- `gclm-code-darwin-arm64`

职责：

- 只携带当前架构的真实可执行文件与必要 sidecar 资源
- 不承载业务逻辑，不承载源码工作区结构

建议字段示意：

```json
{
  "name": "gclm-code-darwin-arm64",
  "version": "1.0.0",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "files": [
    "bin",
    "resources"
  ]
}
```

说明：

- `bin/` 放真实二进制，例如 `bin/gc`
- `resources/` 用于未来 sidecar 或配置模板
- 子包原则上不直接对外暴露 `bin` 命令，统一由根包 launcher 进入

## 5. 根包 launcher 设计

根包只需要一个很薄的 JS 启动器：

1. 读取 `process.platform`
2. 读取 `process.arch`
3. 选择匹配的子包
4. `spawn` 对应子包里的真实二进制
5. 透传 `argv`、`stdin/stdout/stderr`
6. 若二进制不存在，输出安装修复建议

示意逻辑：

```js
const map = {
  "x64": "gclm-code-darwin-x64",
  "arm64": "gclm-code-darwin-arm64"
}
```

launcher 需要处理的失败场景：

- 非 macOS 平台
- 未识别的 CPU 架构
- 子包缺失
- 二进制文件缺失或无执行权限

## 6. workspace 与本地 package 的处理原则

本方案的重点是“对外不再暴露 workspace 结构”，而不是要求所有内部 package 立刻消失。

建议按三类处理：

### 6.1 可直接 bundle 的纯 JS 模块

这类模块优先进入最终二进制，不再作为对外 npm package 参与安装。

### 6.2 强依赖宿主能力的模块

这类模块不强求首批完全内嵌，允许保留为运行时能力层：

- `audio-capture-napi`
  - 依赖 `rec` / `play` / `arecord` / `aplay`
- `image-processor-napi`
  - 依赖 `sharp`、`osascript`、`sips`
- `modifiers-napi`
  - 依赖 `bun:ffi` 与 macOS Carbon
- `@ant/computer-use-input`
  - 依赖 `swiftc` / JXA
- `@ant/computer-use-swift`
  - 依赖截图、窗口、应用控制等宿主能力

处理建议：

- 能 bundle 的代码 bundle
- 不能 bundle 的宿主能力允许 external 或 sidecar
- 统一做 capability check，避免缺能力时直接崩溃

### 6.3 首批不再对外发布的内部实现包

内部 package 继续存在于 workspace 中即可，但不再作为 npm 消费者安装路径的一部分。

## 7. 产物结构

建议每个架构子包采用固定目录：

```text
bin/
  gc
resources/
  ...
```

如果后续出现必须跟随二进制一起分发的额外资源，也统一放在 `resources/` 下，避免根包 launcher 逻辑复杂化。

## 8. CI / 发布流程

发布动作应围绕“一个版本，三个包”展开。

### 8.1 发布顺序

1. 构建 `darwin-x64` 二进制
2. 构建 `darwin-arm64` 二进制
3. 发布 `gclm-code-darwin-x64`
4. 发布 `gclm-code-darwin-arm64`
5. 发布根包 `gclm-code`
6. 上传 GitHub Release 资产

关键原则：

- 子包必须先发布，根包后发布
- 三个包必须共享同一版本号

### 8.2 CI 校验项

至少覆盖：

- `darwin-x64` 安装并执行 `gc --version`
- `darwin-arm64` 安装并执行 `gc --version`
- 根包安装后 launcher 能正确选中对应子包
- 缺子包时错误提示清晰

实现提示：

- 当前本地已落地一个“离线 smoke”：
  - 先对三包执行 `npm pack`
  - 再模拟安装后的 `node_modules` 布局验证 launcher
- 等 CI 接入真实三包发布或私有 registry 后，再补“真实 install -> 启动”闭环校验

### 8.3 GitHub Release 资产

推荐同步产出：

- `gclm-code-<version>-darwin-x64.tar.gz`
- `gclm-code-<version>-darwin-arm64.tar.gz`
- 对应 `sha256`

这样 npm 与直接下载两条链路都可用。

## 9. codesign 与 notarization

这是 mac-only 分发必须尽早纳入设计的部分。

建议分两阶段：

### 阶段 1

- 先完成双架构可构建、可安装、可执行
- 在内部或测试用户范围验证

### 阶段 2

- 为两个架构二进制补 `codesign`
- 若对外正式分发范围扩大，再评估 `notarization`

注意：

- 若后续引入通用包或再封装，通常需要在最终产物阶段重新签名

## 10. 失败与回滚策略

若某次版本发布失败：

- 子包发布失败：停止根包发布
- 根包发布失败：修复后重新发布同版本不可行，应发新版本
- 某一架构二进制回归：可先下掉根包 tag，避免新安装用户获取损坏版本

因此 CI 中必须有“根包发布前二次验证”。

## 11. 推荐实施顺序

### P1：结构搭建

- 新建 3 包结构
- 写 launcher
- 人工本地验证双架构选择逻辑

### P2：构建接入

- 为 `darwin-x64` 与 `darwin-arm64` 各自产出二进制
- 架构子包只装入自己的二进制
- 补本地 smoke

### P3：CI 发布

- 接入三包同步版本发布
- 接入 GitHub Release 资产上传
- 做发布失败保护

### P4：mac 分发完善

- 补 `codesign`
- 评估是否需要 `notarization`
- 评估是否需要对外统一 mac 下载包

## 12. 方案结论

如果后续重新启动 release，这条方案可以同时解决：

- npm 用户安装入口保留
- `workspace:*` 不再暴露给 npm 消费者
- mac Intel 与 mac ARM 双架构分发
- 后续平台扩展的结构化演进

推荐结论：

- 采用 `Option B：根包 + 架构子包`
- 首批只做 `darwin-x64` 与 `darwin-arm64`
- npm 作为入口，GitHub Release 作为并行下载链路
- 不再继续把 workspace 源码发布链路当成主方向投入

# 单包发布、Vendor 运行时与发布边界收敛方案

更新时间：2026-04-05

## 1. 结论摘要

建议把当前 release 改造明确成两条并行推进的主线：

- `C`：从“`根包 + 架构子包`”迁到“`单消费者包`”
- `D-lite`：把发布边界向 `references/cli` 靠拢，但只收敛 `package.json`、`bin/`、`vendor/`、发布脚本这些与消费者交付直接相关的部分；`dist/` 仅保留为构建期 staging

推荐目标形态：

- npm 对外只保留一个消费者包：`gclm-code`
- `packages/*` 继续作为仓库内部 workspace 存在
- 发布时把 workspace 中需要参与运行时的内容编译、打包、物化到 `vendor/`；若中途需要 `dist/`，也只作为构建中间层
- CLI 发布态只从包内稳定边界加载运行时产物，不再依赖 npm `optionalDependencies` 或跨包解析主程序本体
- 不做全仓库目录重排，不要求源码结构 1:1 模仿 `references/cli`

一句话总结：

保留 workspace 做研发组织，停止让 workspace 直接定义消费者安装结果；对外改成“单包 + vendor 化运行时 + 稳定入口”。

## 2. 为什么这样设计

当前用户痛点主要来自发布模型，而不是源码目录长相。

仓库现状是：

- 当前 staging 发布脚本会生成 `gclm-code`、`gclm-code-darwin-x64`、`gclm-code-darwin-arm64` 三包
- 根包通过 `optionalDependencies` 引入两个架构子包
- 根包启动器在运行时再去解析匹配的架构子包并转发执行

这套设计在官方 npm registry 下可工作，但在 `npmmirror` 场景下已经出现真实失败：根包可安装，架构子包未落地，最终 `gc --version` 报“未找到匹配架构包”。

这里要拆开看两个问题：

### 2.1 `workspace` 是问题的一部分，但不是全部

`workspace` 的确带来了一个结构性问题：

- 当前根包仍带着大量 `workspace:*` 依赖，更像开发工作区 manifest，而不是面向消费者的最终发布物

但当前“架构分包”不是 `workspace` 强迫产生的，而是现有 release 方案主动选择出来的：

- 为了避免把双架构大体积二进制同时塞进一个包，当前设计成了“根包 + 架构子包”

所以真实情况是：

- `workspace` 解释了“为什么根包不够像最终消费者包”
- 当前 release 设计解释了“为什么安装链路会依赖架构子包”

### 2.2 `references/cli` 值得借鉴的是边界，不是整体模板

`references/cli` 更像官方的地方，在于它有清晰的发布边界：

- 根包有稳定的 `bin/claude.js`
- 运行入口优先指向包内固定路径
- 平台相关辅助资产通过 `vendor/` 固定路径管理

但它本身仍是源码工作区仓库，不是可以直接原样发布给 npm 用户的消费者包。因此应该借鉴它的“发布边界组织方式”，而不是直接照抄整个 repo 结构。

## 3. 目标与非目标

### 目标

- 消除 `optionalDependencies` 导致的主程序缺失问题
- 保持单一对外安装入口：`npm i -g gclm-code`
- 保留当前 `packages/*` 作为内部 workspace
- 把 workspace 运行时依赖收敛为 `vendor/` 内的稳定交付资产
- 让根包 `package.json`、`bin/`、`vendor/` 成为真实发布边界；`dist/` 不进入最终消费者边界
- 让后续维护者能在根包层面看懂构建、安装、运行关系

### 非目标

- 本轮不追求把全部源码目录重命名成 `references/cli` 风格
- 本轮不优先扩展 Linux / Windows 支持
- 本轮不把所有架构二进制直接塞进一个 fat npm tarball
- 本轮不要求一次性删除所有现有 release 脚本与 CI job
- 本轮不把 `packages/*` 彻底消灭或回填到根目录

## 4. 方案比较

### 方案 A：维持当前 `根包 + 架构子包`

优点：

- 现有脚本和 workflow 已跑通
- 二进制体积不集中到一个 npm 包
- 发布资产与平台矩阵已经抽象完成

缺点：

- 主程序本体依赖 `optionalDependencies` 落地
- 镜像源或 npm 客户端行为差异会直接变成用户故障
- 根包本身不是完整产品，只是“跨包 launcher”
- 维护者需要同时理解根包、子包、发布顺序、镜像行为

结论：

- 不再推荐作为长期对外交付主形态

### 方案 B：单个 npm 包直接内置全部 mac 二进制

优点：

- 安装后无额外下载
- 不依赖子包、镜像、发布顺序
- 运行结构最简单

缺点：

- 当前单个 `gc` 本地体积已经很大
- 双架构同时内置会显著放大 tarball 体积与安装成本
- 后续扩平台会继续线性膨胀

结论：

- 不推荐作为当前主方案

### 方案 C：单消费者包 + Vendor 化运行时

定义：

- 对外只发布一个 `gclm-code`
- workspace 继续保留在源码仓库中
- 运行时所需内容在发布前后被物化到根包 `vendor/`
- 若构建链路需要中间目录，可先进入 `dist/` staging，再在打包前归档进 `vendor/`
- CLI 发布态只认包内稳定路径

优点：

- 用户侧只有一个 npm 包
- 不再依赖 `optionalDependencies` 安装主程序本体
- 根包可以成为真实消费者入口
- 发布结构更接近官方与 `references/cli`
- workspace 可以继续服务开发，不必和消费者发布形态强绑定

缺点：

- 需要新增运行时组装流程
- 需要明确哪些 workspace 内容进入 vendor，哪些只留在源码侧
- 需要补一层 vendor/runtime 验证与 smoke

结论：

- 推荐作为主方向

### 方案 D：完整迁移到 `references/cli` 结构

优点：

- 目录看起来更统一
- 根包入口和官方更接近

缺点：

- 不能直接解决当前用户安装失败
- 变更面过大，容易引入与发布问题无关的噪音
- 会把“结构美化”和“安装可靠性”混成一个大工程

结论：

- 不推荐作为第一步

### 方案 D-lite：只迁移发布边界

定义：

- 不大改 `src/`、`packages/`、测试目录
- 只把消费者可见边界收敛成更接近 `references/cli` 的样子

优点：

- 能直接服务当前发布模型升级
- 成本明显低于全仓库重排
- 维护者更容易理解交付边界

缺点：

- 仓库整体视觉上不会“完全像官方”
- 仍会保留一部分历史目录与脚本命名

结论：

- 推荐与方案 C 并行推进

## 5. 推荐结构

推荐采用“`C + D-lite` 并行”。

### 5.1 总体形态

推荐目标形态如下：

- 仓库内部：
  - `src/`、`packages/`、现有工作区继续保留
- 消费者发布物：
  - `package.json`
  - `bin/gc.js`
  - `vendor/manifest.json`
  - `vendor/runtime/...`
  - `vendor/modules/...`

这里的核心原则是：

- workspace 负责开发与构建
- `vendor/` 负责消费者运行时
- `dist/` 仅允许作为构建期 staging，不能成为发布态运行时边界

### 5.2 对外根包结构

根包 `gclm-code` 直接表达最终消费者体验：

```json
{
  "name": "gclm-code",
  "version": "x.y.z",
  "type": "module",
  "bin": {
    "gc": "bin/gc.js",
    "claude": "bin/gc.js"
  },
  "files": [
    "bin",
    "vendor",
    "README.md"
  ]
}
```

推荐目录：

- `bin/gc.js`
  - 消费者统一入口；负责定位 runtime 并转发执行
- `vendor/manifest.json`
  - 当前版本的运行时资产清单、平台映射、校验信息
- `vendor/runtime/<platform>/gc`
  - 当前平台的真实可执行文件或其解压产物
- `vendor/modules/<name>/...`
  - 从 workspace 编译或整理出来、运行时需要直接引用的模块产物
- `vendor/metadata/*.json`
  - 记录版本、来源、sha、组装时间等补充元数据；运行时只依赖 `vendor/manifest.json`

### 5.3 Workspace 到 Vendor 的收敛方式

推荐把 workspace 分成两类：

#### A. 运行时必须参与消费者执行的内容

这类内容应在发布阶段被“物化”到 `vendor/`：

- 编译后的 JS bundle
- native sidecar
- 平台工具二进制
- 少量需要随包发布的资源文件

#### B. 仅服务开发态的内容

这类内容继续留在 workspace，不进入消费者包：

- 源码模块
- 构建脚本辅助模块
- 测试依赖
- 仅开发环境使用的包配置

核心规则：

- 消费者运行时不得直接依赖 `workspace:*`
- 发布态 CLI 不得回头解析源码工作区才能启动

### 5.4 运行时装配方式

这里推荐采用混合模型，而不是单一“安装下载”或单一“fat package”。

#### 发布时物化

优先在构建/打包阶段完成：

- `vendor/modules/*`
- `vendor/manifest.json`
- 体积较小且稳定的辅助资产

若构建脚本习惯先落到 `dist/`：

- 允许把 `dist/` 当 staging 目录
- 但打包前必须把最终运行时所需资产归档到 `vendor/`
- 发布包内不得要求 CLI 再去读取 `dist/`

#### 安装时物化

仅对重型平台 runtime 保留安装期落盘能力：

- 当前平台 `gc` 可执行文件
- 平台特有大体积 sidecar

这样做的意义是：

- 不再让 npm 去决定主程序本体是否存在
- 同时避免把双架构二进制硬塞进同一个 tarball
- `vendor/` 仍然是最终运行时边界，只是其中一部分产物在发布期完成，一部分在安装期完成

## 6. 依赖与边界规则

需要保持简单的部分：

- `src/` 业务与 CLI 逻辑继续按现有路径维护
- `packages/*` 继续作为内部 workspace
- 现有 `scripts/lib/release-platforms.mjs` 可继续作为平台元数据来源

需要新建稳定边界的部分：

- `bin/`：消费者唯一入口
- `vendor/manifest.json`：运行时装配元数据单一事实源
- `vendor/runtime/`：真实 runtime 边界
- `vendor/modules/`：workspace 运行时产物边界
- `scripts/prepare-vendor-runtime.mjs`
  - 负责把 workspace 产物组装到 `vendor/`；若有 `dist/` staging，也在该步骤内折叠回 `vendor/`
- `scripts/install-runtime.mjs`
  - 仅负责安装阶段需要落地的重型平台 runtime，并写入 `vendor/runtime/`
- `scripts/smoke-single-package-*.mjs`
  - 负责单包安装/启动/镜像验证

禁止继续扩散的边界：

- 不再为主程序本体新增 `gclm-code-<platform>` 子包
- 不再让根包启动依赖 `require.resolve(<platform-package>)`
- 不再把最终消费者路径建立在本地 workspace manifest 之上
- 不再把 `dist/` 视为发布态运行时读取边界

## 7. 迁移步骤

### Phase 1：冻结目标形态

- 确认目标为 `单消费者包 + vendor 运行时 + D-lite 收敛`
- 保留现有三包链路作为回退路径
- 设计 `vendor/` 与 `vendor/manifest.json` 结构
- 明确 `dist/` 如存在也只是构建 staging

完成标志：

- 团队确认不再继续增强“根包 + 架构子包”主链

### Phase 2：C 与 D-lite 并行打骨架

#### Track C：单包发布骨架

- 新增单消费者根包发布清单
- 去掉主程序对架构子包的运行时依赖
- 设计并接入 `scripts/install-runtime.mjs`

#### Track D-lite：发布边界收敛

- 新增稳定 `bin/gc.js`
- 新增 `vendor/` 目录边界
- 调整根包入口逻辑，只认包内稳定路径

完成标志：

- 根包已经具备单包消费者入口雏形

### Phase 3：Workspace 运行时物化

- 识别哪些 `packages/*` 内容需要进入消费者运行时
- 新增 `scripts/prepare-vendor-runtime.mjs`
- 把必要的 workspace 产物编译/复制到 `vendor/modules/`
- 让 CLI 发布态改为从 `vendor/modules/` 加载

完成标志：

- 发布态运行时不再依赖 workspace 源码布局

### Phase 4：平台 Runtime 收敛

- 明确当前平台可执行文件的落盘路径
- 完成 `vendor/runtime/<platform>/gc` 的生成或安装
- 完成 manifest / sha / 版本映射

完成标志：

- 当前平台安装完成后，`bin/gc.js` 可以只依赖 vendor/runtime 启动

### Phase 5：新增单包 Smoke

- 新增 tarball 安装 smoke
- 新增私有 registry 安装 smoke
- 新增 vendor/runtime 缺失、sha 校验失败、组装失败场景验证
- 新增“开发态入口”和“发布态入口”分离验证

完成标志：

- 单包链路在本地与 CI 都能稳定通过

### Phase 6：切换默认发布

- `release-npm` 改为单包主链
- 继续上传双架构 release assets，供 runtime 装配或手动下载使用
- 文档、手动发布指南、release gate 全部切换到单包模型

完成标志：

- 线上用户默认安装入口已切到单包

### Phase 7：清理旧三包路径

- 删除 `prepare-mac-binary-npm.mjs` 等旧三包组装脚本
- 删除子包发布顺序逻辑
- 删除与三包模型绑定的 smoke / workflow 残留

完成标志：

- 仓库内不再同时维护两套主发布模型

## 8. 风险与应对

### 风险 1：Vendor 化边界不清晰，容易把开发仓库复制进消费者包

应对：

- 明确只允许“运行时必需产物”进入 `vendor/`
- 禁止把 `packages/*` 原样镜像到发布包
- 通过 `vendor/manifest.json` 记录进入 vendor 的资产清单

### 风险 2：安装期仍可能需要下载重型 runtime

应对：

- 把下载范围限制在重型平台二进制
- 支持 `GCLM_BINARY_BASE_URL`
- 支持多个候选下载源与 sha 校验

### 风险 3：C 与 D-lite 并行时边界不清，容易演化成全仓库重排

应对：

- 明确 D-lite 只触碰发布边界
- 非发布相关目录不进入当前迁移范围

### 风险 4：迁移期间双轨维护增加复杂度

应对：

- Phase 6 之前旧链路只做回退，不再增强
- 为双轨设置最短共存窗口

## 9. 推荐执行顺序

建议按以下方式推进：

1. 先确认 `vendor/` 与 `vendor/manifest.json` 边界，并把 `dist/` 明确降级为构建期 staging
2. 并行推进 `C + D-lite` 骨架
3. 再做 workspace 运行时物化
4. 再切换默认发布
5. 最后清理旧三包链路

一句话总结：

真正值得迁移的是“发布模型和运行时边界”。`references/cli` 适合作为发布边界参考，workspace 继续保留；消费者包只认 `bin/` 与 `vendor/`，`dist/` 只作为构建期中间层存在。

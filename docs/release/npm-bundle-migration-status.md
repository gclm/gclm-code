# references/cli 对齐与 npm 打包收口进度

更新时间：2026-04-06（第二轮更新）

## 1. 当前结论

当前实现方向已经明确：

1. **基建层以 `references/cli` 为基线对齐**
   - 复用它的 `package.json` / `bin/claude.js` / `scripts/build.mjs` / `tests/` / smoke / CI 思路
   - 行为层尽量跟随 `references/cli`
   - 对外品牌改为 `Gclm Code`

2. **最终发布目标不是旧的 GitHub Release runtime 下载链路**
   - 不再继续把”GitHub Release 资产下载 + 安装期补 runtime”作为长期主方案
   - 目标是逐步收口到更接近官方 `@anthropic-ai/claude-code` 的 npm 包形态

3. **最终目标包形态**
   - npm 包内不携带 `src/`、`tests/`、`references/` 等源码目录
   - 以 **bundled `cli.js`** 作为主入口
   - 包内容收敛到：`bin/`、`cli.js`、`README.md`、最小 `package.json`
   - 不依赖 GitHub Release runtime 下载，不依赖 vendor 目录

---

## 2. 当前进度

### 2.1 已完成

#### A. references/cli 基建已经接入

- `package.json` 已改为以 `references/cli` 为基础调整
- `bin/claude.js` 已切换为 references 风格入口
- `scripts/build.mjs` / `scripts/clean.mjs` / `scripts/dev-preload.mjs` / `scripts/dev.mjs` / `scripts/smoke-test.mjs` 已接入
- `tests/` 已整体复制并完成一轮适配

#### B. 品牌与元数据已完成替换

- 版本输出改为 `Gclm Code`
- issues URL 已切换到：`https://github.com/gclm/gclm-code/issues`

#### C. 测试体系已恢复稳定

- 修复了 isolated HOME、PermissionRequest、privacyLevel、log、cli print mode、auth status --text 等问题
- 当前验证：`bun test` 221 pass / `bun run build` 通过 / `bun run smoke` 通过

#### D. 最终 npm 打包链路已落地（新增）

已实现并验证完整的 build -> pack -> smoke 链路：

**`scripts/pack-npm.mjs`**

- 从 `dist/src-build/cli.js` 复制 bundled cli.js
- 生成极简 Node launcher `bin/claude.js`（只 `spawnSync('node', [cliJs, ...args])`）
- 生成最小 `package.json`（`dependencies: {}`，仅保留 `optionalDependencies`）
- 执行 `npm pack` 产出 tarball
- 校验 tarball 不包含 src/tests/references/scripts/packages/dist

**`scripts/smoke-npm-package.mjs`**

- 解包校验 tarball 内容
- 临时目录 `npm install <tarball>`
- 验证：`gc --version`、`claude --version`、`claude agents`、`claude --help`、`claude plugin list`、`claude mcp list`
- 全部通过

**`package.json` 新增脚本**

- `pack:npm` — 组装 staging + npm pack
- `smoke:npm` — 安装验证
- `release:npm` — build + pack + smoke 一键流程

#### E. 依赖审计结论（新增）

审计了 `dist/src-build/cli.js` bundle 内容：

| 依赖 | 是否进 bundle | 说明 |
|------|:---:|------|
| `sharp` JS 部分 | 是 | `require(“sharp”)` 路径已内联 |
| `sharp` native 部分 | 否 | 需要 `@img/sharp-*` optionalDependencies |
| `modifiers-napi` | 是 | 纯 JS 实现，已内联 |
| `image-processor-napi` | 是 | sharp wrapper + macOS clipboard，已内联 |
| `audio-capture-napi` | 否 | 动态 `import()`，仅 voice 功能使用 |
| `url-handler-napi` | 否 | 动态 `import()`，仅 deep link 使用 |
| `@ant/*` workspace packages | 否 | `--external @ant/*`，仅 computer-use 功能使用 |

结论：`dependencies` 可设为 `{}`，`optionalDependencies` 保留 `@img/sharp-*`。
不需要 `vendor/` 目录。

---

## 3. 最终 npm 包结构

已落地结构（tarball 4 文件）：

```text
package/
  package.json       # dependencies: {}, 仅 optionalDependencies
  cli.js             # bundled from dist/src-build/cli.js
  bin/claude.js      # 极简 Node launcher
  README.md
```

---

## 4. 一键发布命令

```bash
bun run release:npm
# 等价于: bun run build && bun run pack:npm && bun run smoke:npm
```

产出：
- staging: `dist/npm-package/gclm-code/`
- tarball: `dist/npm-tarballs/gclm-code-<version>.tgz`

---

## 5. 后续可优化项

以下已不是阻塞项，属于后续优化方向：

1. **CI 集成** — 把 `release:npm` 链路接入 GitHub Actions
2. **`@img/sharp-*` 裁剪** — 当前保留全部 9 个平台，可按需裁剪
3. **audio-capture / url-handler** — 按需安装策略（作为 optionalDependencies）
4. **README 更新** — 去掉旧 single-package / runtime 描述
5. **旧文档清理** — `docs/release/` 下的 single-package 文档标注为历史

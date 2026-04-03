# `@gclm/gclm-code` 手动发布指南

这份文档用于手动发布 `Gclm Code` 到 npm。

适用范围：

- 首次发布
- 紧急修复时的人工发布
- 在 CI 发布前的人为验证

## 1. 发布前检查

1. 确认 `package.json`:

- `name` 是 `@gclm/gclm-code`
- `private` 是 `false`
- `bin` 包含 `gc` 和 `claude`

2. 本地构建验收：

```bash
bun run verify
```

3. npm 身份确认：

```bash
npm whoami
```

应返回 `gclm`。

## 2. 版本号更新

根据发布类型更新版本号：

```bash
npm version patch
# 或 npm version minor
# 或 npm version major
```

如果你不希望自动创建 git tag，可加 `--no-git-tag-version`。

## 3. 发布到 npm

发布到 `latest`：

```bash
npm publish --access public --tag latest
```

发布成功后校验：

```bash
npm view @gclm/gclm-code version
npm dist-tag ls @gclm/gclm-code
```

## 4. 维护 `stable` 频道

将某个版本标记为 `stable`：

```bash
npm dist-tag add @gclm/gclm-code@<version> stable
```

示例：

```bash
npm dist-tag add @gclm/gclm-code@2.1.87 stable
```

## 5. 安装与升级验证

安装：

```bash
npm i -g @gclm/gclm-code
```

命令验证：

```bash
gc --version
claude --version
```

升级验证：

```bash
gc update
```

## 6. 回滚策略（npm）

npm 不能重新发布同版本，可用以下方式处理：

1. 立即发布修复版本（推荐）
2. 移除错误 dist-tag：

```bash
npm dist-tag rm @gclm/gclm-code latest
```

3. 重新把 `latest` 指向正确版本：

```bash
npm dist-tag add @gclm/gclm-code@<good-version> latest
```

不建议 `npm unpublish` 已超过短窗口的版本。


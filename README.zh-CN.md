# SaveCompat

> 在发布游戏更新前，证明所有旧版 JSON 存档仍能安全升级。

[English](README.md) · [在线示例报告](https://kanadek.github.io/savecompat/) ·
[完整示例](examples/space-trader)

SaveCompat 是与引擎无关的存档兼容性 CLI 和 TypeScript 库。它会把真实旧存档作为回归语料，
依次执行声明式迁移，并在每一步进行 JSON Schema 校验；同时检查玩家 ID、经验、世界种子、
解锁项等关键数据是否被保留，最后输出语义 diff、JSON 结果和单文件 HTML 报告。

它不是只有界面的空壳，也不是备份器或某一款游戏的存档修改器。

## 快速验收

```bash
git clone https://github.com/KanadeK/savecompat.git
cd savecompat
npm ci
npm run build

node dist/cli.js doctor --config examples/space-trader/savecompat.config.json
node dist/cli.js check \
  --config examples/space-trader/savecompat.config.json \
  --report site/index.html
```

预期结果为 4/4 份存档通过，其中 v1、v2 的三份旧存档真实迁移到 v3，另一份 v3 存档保持不变。

## 核心能力

- 旧存档语料批量测试，而不是只测试一个手写对象；
- 原始版本及每个迁移中间版本均按 Schema 校验；
- `rename`、`coerce`、`clamp`、`map-items` 等十种确定性迁移操作；
- 关键进度保全断言，发生丢失时 CI 直接失败；
- 按实体 ID 对齐背包等数组，避免顺序变化造成无意义 diff；
- 默认只预览，不主动覆盖文件；
- `--in-place` 会先生成带时间戳的 `.bak`，再原子替换；
- 适用于 CI 的退出码、JSON 输出与自包含 HTML 报告。

## 命令

```text
savecompat doctor                         检查配置、Schema、迁移链和样例
savecompat check [patterns...]            验证全部旧存档
savecompat migrate <file>                 预览一份迁移
savecompat migrate <file> --out <file>    写入新文件
savecompat migrate <file> --in-place      备份后原地替换
savecompat migrate <file> --stdout        只输出迁移后的 JSON
savecompat diff <before> <after>           语义差异
savecompat init [directory]                创建可运行的 v1→v2 示例
```

## 验收与失败修复

完整发布前验收：

```bash
npm run release:check
```

如果失败，先单独重跑输出中最小的失败命令，按
[故障修复手册](docs/TROUBLESHOOTING.md)处理，再重新执行完整验收。禁止跳过失败测试发布。

## 当前边界

- v0.1.0 处理结构化 JSON 存档；
- 不负责解密、解压或逆向专有二进制格式；
- 全程本地运行，无遥测、无网络上传；
- 提交真实玩家存档前必须匿名化。

详细配置和 DSL 请阅读英文 [README](README.md) 与
[Migration DSL](docs/MIGRATION_DSL.md)。

许可证：[MIT](LICENSE)。

# 基线文件

> PolyForge 在消费方项目里会产生若干「基线」文件。本文说明各自职责、为什么需要、以及哪些其实可以不要。

## 现状：两个基线

| 文件 | 位置 | 管什么 | 必须入库 |
|---|---|---|---|
| `schema-snapshot.json` | `POLYFORGE_SNAPSHOT` 或 `<projectRoot>/.polyforge/` | 契约兼容性：检测破坏性变更 | ✅ |
| `db-schema-state.json` | `<projectRoot>/.polyforge/` | 数据库迁移：V901+ 的 diff 基线 | ✅ |

> `manifest.json` 和 `verify` 命令已于 2026-10-20 删除。原因见下方「manifest.json 为什么删了」。

## 职责拆解

### schema-snapshot.json — 契约兼容性基线

**记什么**：enums 的值集合、entities/views 的 `type` + `nullable`、views 的 `kind` + `required`、apis 的 `method/path/input/output`。

**故意不记**：`length`、`unique`、`index`、`note`、`derived`。因为这些变化不会让前后端联调断开。

**参与决策**：`gen` 前与当前 IR 对比，有破坏性变更则**阻断生成**，需 `--allow-breaking` 才继续。

**丢了会怎样**：破坏性变更从此静默通过。前后端契约断了自己不知道。

### db-schema-state.json — 数据库迁移基线

**记什么**：表的列名、SQL 类型、NOT NULL / UNIQUE、主键、索引。

**参与决策**：`gen --target=db` 时与当前 IR 对比，非破坏性变更生成 `V901+__alter_generated.sql`，破坏性变更阻断。V900 永不重写（Flyway checksum）。

**丢了会怎样**：换台机器重跑会把「已有变更」当「新变更」再生成一遍 ALTER，甚至重复 DROP COLUMN。

## manifest.json 为什么删了

原设计用 `manifest.json` 记 `generated/` 下每个文件的 MD5，`polyforge verify` 读它检测「生成物被手改」。已删除，理由如下。

它的唯一用途是 `polyforge verify` 检测「生成物被手改」。但这个检测本身价值有限：

### 1. `gen` 会清空整个 generated/ 目录重建

即使有人手改了生成物，下次 `gen` 一跑就全被冲掉。`verify` 能起的作用只是「在下次 gen 之前提醒你手改过」，但手改本身就没有持久意义。

### 2. 检测「契约变了但忘记重新 gen」有更简单的办法

这是 `verify` 真正的场景。但不需要 manifest：

```bash
polyforge gen && git diff --exit-code
```

契约变了没重新 gen → `gen` 会产生新产物 → `git diff` 非空 → CI 失败。比 manifest 的逐文件 MD5 对比更直接、更易懂。

### 3. `--strict` 的孤儿检测同样多余

`gen` 会清空全自动目录，孤儿不可能存在。唯一可能是有人手动往 `generated/` 里塞文件——这种情况 `git status` 直接就能看见。

### 4. manifest 每次都全量重写，提交上去是噪音

两个人不同时间 `gen`，manifest 的 diff 全是 hash 变化，读不出任何有效信息。

## 已执行的删除

**代码**：

- `index.mjs`：删 manifest 生成段、`getFileHash` / `walkDir`、整个 `verify` 分支
- `package.json`：删 `verify:generated` 类脚本，新增 `gen:check`（= `gen && git diff --exit-code`）

**文档**：

- `README.md`：删 verify 命令说明，改为 `gen && git diff`
- `docs/part3-usage/2-cli.md`：删 verify 整节，新增「检测契约变更未同步」节

**消费方**：

- `we-engine-server` / `we-engine-client`：删除 `.polyforge/manifest.json`，从 `.gitignore` 移除对应条目

**收益**：

- 从 3 个文件降到 2 个，且两个都是「必须入库」的，心智负担减半
- 不再是「这个文件为什么不上传」这类反复需要解释的问题
- `verify` 的替代方案（`git diff`）更通用，不引入 polyforge 专有概念

**代价**：

- `verify` 命令消失，是 breaking change
- 但 `1.0.0` 从未发布到 npm，消费方只有两个自有仓库，实际影响为零

## 是否要合并两个基线

**不建议**。`schema-snapshot` 故意粗粒度（不记 length/unique），`db-state` 必须细粒度（记 length/unique 才能生成 ALTER）。粒度要求相反，合并会让 diff 逻辑复杂化。

两者也不是全重复：

| 信息 | snapshot | db-state |
|---|---|---|
| views / apis / enums | ✅ | ❌ |
| SQL 类型 / 索引 / unique | ❌ | ✅ |

各自覆盖对方没有的部分，保留两个是合理的最小集。

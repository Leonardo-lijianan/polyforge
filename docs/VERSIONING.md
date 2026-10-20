# 版本与兼容性

> 本文是 PolyForge 版本号使用的**权威规范**。改版本号前先读本文。

## 两套版本号

| 版本号 | 位置 | 格式 | 管什么 |
|---|---|---|---|
| polyforge 包版本 | `package.json` 的 `version` | `major.minor.hotfix` | 工具本身的功能与兼容性 |
| 配置 schema 版本 | `polyforge.config.yaml` 的 `schemaVersion` | `major.minor`（两段，**带引号**） | 配置文件的格式版本 |

两者独立演进，但有关联规则（见下文「关联规则」）。

## polyforge 包版本：major.minor.hotfix

### 判定规则

| 位 | 触发条件 | 例子 |
|---|---|---|
| **major** | breaking change | 见下方清单 |
| **minor** | 新功能，向后兼容 | 新增可选配置字段、新增 CLI 子命令 |
| **hotfix** | 纯修复，无行为变化 | 修生成器 bug、修校验误报、文档修正 |

### 什么算 breaking（动 major）

- **配置字段收紧**：可选 → 必填（如本次 `basePackage`）
- **配置字段删除或重命名**
- **CLI 命令 / 参数删除或语义变化**
- **生成器产物结构变化**：文件路径、类名、包结构
- **生成器源文件改名或导出函数改名**：影响直接 `import` 生成器的消费者
- **校验规则收紧**：原来能通过的模型现在报错
- **生成物新增硬依赖**：消费方不补依赖就编译不过
- **配置 schema 格式变化**：见 `schemaVersion` 一节

### 什么算 minor（动 minor）

- 新增**可选**配置字段（不写也能跑）
- 新增 CLI 命令 / 可选参数
- 新增**warning 级别**校验规则（不阻断生成）
- 新增生成器产物类型（不删旧的）
- 生成器内部重构但产物字节级一致
- 文档新增章节

### 什么算 hotfix（动 hotfix）

- 生成器产物有误（编译不过、类型错、逻辑错）
- 校验规则误报或漏报
- 测试脚本自身 bug
- 纯注释 / 文档错别字修正
- 不改变任何产物内容的性能优化

### 边界判断的三个问题

不确定时依次问：

1. **升级后，一个没改任何东西的消费者会挂吗？** 会 → major
2. **升级后，消费者需要做任何手动操作吗？** 需要 → major
3. **升级后，同一份模型生成的产物会变吗？** 会变且不兼容 → major；变但兼容 → minor

## 配置 schemaVersion

### 规则

- **`major.minor` 两段**，与包版本的三段 `major.minor.hotfix` 不同
- **必须带引号**：`schemaVersion: '1.0'`。YAML 不加引号的 `1.0` 会被解析成数字 `1`（浮点尾部零丢弃）
- 只在**配置格式**发生 breaking 时递增 **major**；新增可选字段时递增 **minor**
- 兼容判定**只看 major**：polyforge `1.x.y` 接受 `schemaVersion` 为 `1.*`
- 配置文件**必须**声明，缺失即 error
- 声明了不受支持的 major，error 并提示升级路径
- 格式非法（如 `1`、`1.0.0`、`v1`）直接 error

### 为什么不是三段

配置格式不会因为「修个错别字」需要区分 hotfix。`major.minor` 足够表达「格式大版本 + 兼容的小增量」，也与消费方实际关心的粒度一致。包本身仍用 `major.minor.hotfix`，因为修生成器 bug 需要区分。

### 为什么必须带引号

`js-yaml` 把裸 `1.0` 解析成数字 `1`。代码里对数字 `1` 做了宽松兼容（当作 `'1.0'` 处理），但这是兜底，不是推荐写法——推荐始终带引号，避免「看起来写了版本号、实际被 YAML 吃掉」的困惑。

### 为什么必填而不是给默认值

`schemaVersion` 如果给默认值（比如不写就当 1），就重蹈了 `basePackage` 的覆辙：默认值恰好等于当前唯一取值，bug 永远不暴露。

反过来，强制声明让每次配置格式升级都有一个显式的「确认点」。工具读到 `schemaVersion: '1.0'` 就知道按 1.x 规则解析；读到 `'2.0'` 就知道要么支持、要么明确拒绝，不会假装能跑。

### 关联规则

| 场景 | polyforge 版本 | schemaVersion |
|---|---|---|
| 新增可选配置字段 | minor +1 | minor +1（`1.0` → `1.1`） |
| 配置字段从可选变必填 | major +1 | major +1（`1.x` → `2.0`） |
| 配置字段删除或重命名 | major +1 | major +1（`1.x` → `2.0`） |
| 配置值的语义变化（如某字段从「路径」变「路径数组」） | major +1 | major +1（`1.x` → `2.0`） |
| 生成器改动但不碰配置 | major 或 minor | 不变 |

一句话：**schemaVersion 只跟配置格式走**。工具做 breaking 但配置格式没变，只动 major，不动 schemaVersion。

### 兼容表

| schemaVersion | 最低 polyforge 版本 | 说明 |
|---|---|---|
| `'1.0'` | 1.0.0 | 初始版本 |

## 发布流程

1. 判断本次改动属于 major / minor / hotfix
2. 如果配置格式变了，同步递增 `schemaVersion`
3. 改 `package.json` 的 `version`
4. 在 CHANGELOG（待建）记录：版本号、breaking 清单、迁移方式
5. 更新本文的兼容表
6. 如果动了 schemaVersion，确保 `config.mjs` 的 `SUPPORTED_SCHEMA_VERSION` 同步

## 消费者升级流程

1. 看本文兼容表，确认目标版本是否改了 `schemaVersion`
2. 如果改了，按迁移说明更新 `polyforge.config.yaml`
3. 跑 `polyforge check` 确认模型仍通过
4. 跑 `polyforge gen --target=<your-target>` + `polyforge verify`
5. 如果有 breaking，按 CHANGELOG 逐项处理

## 历史记录

| 日期 | polyforge | schemaVersion | 变更摘要 |
|---|---|---|---|
| 2026-10-20 | 1.0.0 | `'1.0'` | 首个正式版本：`basePackage` 生效且必填、生成器改名（`dao-mapper` / `view-assembler`）、`MetaObjectHandler` 骨架、`schemaVersion` 必填 |

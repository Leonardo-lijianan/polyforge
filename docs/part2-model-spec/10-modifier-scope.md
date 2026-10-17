# 10. 修饰符适用范围

字段修饰符（`nullable`、`unique`、`from`…）**不是到处都能写**。本章是权威矩阵：每个修饰符能用在哪、不能用在哪。

> 为什么需要它：没有这张表，「`from` 写进 entity」「`unique` 写进 view」都会被静默放过。
> 位置错了，生成物就是错的——或根本生成不出来。

## 六处位置

字段可能出现在六个地方，分两类：

**存储侧（落库）**

| 位置 | 含义 |
|---|---|
| `entity.fields` | 实体字段，对应数据库列 |

**API 侧（过边界）**

| 位置 | 方向 | 含义 |
|---|---|---|
| `view.fields`（kind: form） | 前端 → 后端 | 提交入参 |
| `view.fields`（kind: query） | 前端 → 后端 | 查询条件 |
| `view.fields`（kind: brief/detail） | 后端 → 前端 | 返回出参 |
| `api.query` | 前端 → 后端 | URL 查询参数 |
| `api.pathParams` | 前端 → 后端 | URL 路径变量 |

## 矩阵

行 = 修饰符，列 = 位置。✓ 可用，✗ 禁止。

| 修饰符 | entity | form | query | brief/detail | api.query | api.pathParams |
|---|---|---|---|---|---|---|
| `type` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `note` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `nullable` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `length` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `default` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `unique` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `index` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `auto` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `ref` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `idType` | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| `of` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `from` | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| `sensitive` | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| `writeOnly` | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `validate` | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ |
| `validateRef` | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `derived` | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |

## 逐条说明

### 存储专属（只在 entity）

| 修饰符 | 为什么 |
|---|---|
| `unique` | 数据库唯一约束，是列属性 |
| `index` | 数据库索引，是列属性 |
| `auto` | `create`/`update` 时间戳，落库时填 |
| `ref` | 外键，是表间关系 |

### 入参专属（form / query / api）

| 修饰符 | 为什么 |
|---|---|
| `writeOnly` | 只进不出（密码），仅提交方向 |
| `validateRef` | 字段间校验（确认密码），仅表单 |

### 出参专属（brief/detail）

| 修饰符 | 为什么 |
|---|---|
| `from` | 从实体列投影，出参才有「来源」 |
| `sensitive` | 返回时打码/隐藏 |
| `derived` | 服务端装配，仅出参 |

### 跨位置

| 修饰符 | 说明 |
|---|---|
| `nullable` | 除 `api.pathParams`（路径变量必填）外全可用 |
| `length` | 存储与入参校验用；出参与 URL 层不设 |
| `default` | 建表默认值与表单初值 |
| `of` | 数组元素类型；URL 参数只能是标量（C29） |
| `validate` | 入参校验（含 URL 参数）；出参不校验 |

## 几个边界裁定

**`idType` 在 `api.pathParams`**：路径变量常是 `{ type: id, idType: long }`，需要 `idType`。故 ✓。

**`of` 在视图 `query`**：多选筛选合法，故 ✓。但 `api.query` 是 URL 参数，只能是标量（C29），故 ✗。

**`validate` 在 `api.query` / `api.pathParams`**：URL 参数也需校验（手机号、id 格式），故 ✓。

**`nullable` 在 `api.pathParams`**：路径变量必填，否则路径不完整，故 ✗。

**`from` 在 `form`**：表单是入参，无实体来源，故 ✗。

## 现状

**C31 已完整实现**（`validate/index.mjs` 的 `MOD_SCOPE`），覆盖本矩阵全部修饰符：

| 修饰符 | 允许位置 |
|---|---|
| `unique` / `index` / `auto` / `ref` | `entity` |
| `idType` | `entity` / `api.pathParams` |
| `nullable` | `entity` / `form` / `query` / `output` / `api.query`（**不含** `api.pathParams`） |
| `length` | `entity` / `form` / `query` |
| `default` | `entity` / `form` |
| `of` | `entity` / `form` / `query` / `output` |
| `from` / `sensitive` / `derived` | `output` |
| `writeOnly` / `validateRef` | `form` |
| `validate` | `form` / `query` / `api.query` / `api.pathParams` |

`type` 和 `note` 不进 `MOD_SCOPE`（全位置合法，检查无意义）。

**验证**：补全后对现有 19 个契约文件跑 `polyforge:check`，**0 个 C31 报错**——现有契约位置全部合法。

**矩阵与代码必须同步**：本表改了，`MOD_SCOPE` 跟着改；反之亦然。两者不一致会导致「文档说能写、代码报错」或相反。

## 与「加语法」的关系

新增一个关键字时，第一步就是**在本矩阵登记它的位置**（见[加语法](../part5-extending/3-add-syntax.md)）。

未登记位置的修饰符，视为未定义。

## 下一步

[第五部分 · 扩展](../part5-extending/1-add-generator.md)

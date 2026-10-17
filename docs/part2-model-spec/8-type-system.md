# 8. 类型系统

模型里的每个 `type`，要映射到三端各自的类型。本章是完整的映射表。

## 总表

| 模型 `type` | PostgreSQL | Java 实体 | Java DTO | TypeScript |
|---|---|---|---|---|
| `id`（long） | `bigint` | `Long` | `String` | `string`（视图里手写 `type: string` 时） |
| `id`（string） | `varchar(64)` | `String` | `String` | `string` |
| `id`（uuid） | `uuid` | `String` | `String` | `string` |
| `string` | `varchar(n)` | `String` | `String` | `string` |
| `text` | `text` | `String` | `String` | `string` |
| `int` | `int` | `Integer` | `Integer` | `number` |
| `long` | `bigint` | `Long` | `Long` | `number` |
| `number` / `decimal` | `numeric(18,2)` | `BigDecimal` | `BigDecimal` | `number` |
| `boolean` | `boolean` | `Boolean` | `Boolean` | `boolean` |
| `date` | `date` | `LocalDate` | `LocalDate` | `string` |
| `datetime` | `timestamptz` | `OffsetDateTime` | `OffsetDateTime` | `string` |
| `json` | `jsonb` | （禁止） | `Object` | `unknown` |
| 枚举 | `varchar(32)` | 枚举类 | 枚举类 | 字符串联合 |
| 实体（引用） | `varchar(64)` | 实体类型 | — | `unknown` |
| `array`（配 `of`） | `varchar[]` | `List<T>` | `List<T>` | `T[]` |

> **id 在前端的类型**：实体不生成前端类型，所以「实体里的 id」不会到前端。视图里的 id 字段如果写 `type: string`（推荐），前端就是 `string`；写 `type: long` 会变成 `number`——这就是为什么视图 id 必须手写 `string`。

## 三个要注意的点

### 1. id 在 DTO 里是 `String`

后端实体里，`id` 是 `Long`；但**跨前后端通信的 DTO 里，id 一律 `String`**。

```
实体：  private Long id;
DTO：   String userId;
前端：  userId: string
```

原因：JavaScript 的 `number` 精度有限，**大整数 id 会丢精度**。所以走 HTTP 的 id 全部用字符串。

> 这意味着 Service 实现里，实体 `Long` 和 DTO `String` 之间要手动转换。

### 2. `date` / `datetime` 在前端是 `string`

前端没有日期类型，统一用 ISO 字符串表示。

```
模型：  { type: datetime }
前端：  createTime: string    // "2026-01-01T00:00:00Z"
```

### 3. 枚举值三端一致

模型里写 `admin`，三端都用 `admin`：

- PostgreSQL：`varchar` 存 `'admin'`
- Java：常量名 `ADMIN`，但 JSON 收发用小写 `"admin"`（靠 `@JsonValue`/`@JsonCreator`）
- 前端：`'admin'`

## id 类型的一致性

### 实体外键：用 `ref`（已实现）

同一个 id 在模型里被多处声明，类型容易不一致。**实体字段的外键用 `ref`**，类型从目标主键派生：

```yaml
Member:
  fields:
    userId: { ref: User }   # 类型 = User.id 的类型，自动跟随
```

主键从 `long` 改 `uuid` 时，所有 `ref` 点自动跟着变。

详见 [id 引用设计](../part4-design/id-reference.md)。

### 视图字段：仍需手写 `type: string`

**`from` 不会自动推导类型**（待实现）。写视图字段时，若 `from` 指向某个 id，**要自己保证类型写成 `string`**：

```yaml
UserBrief:
  fields:
    userId: { type: string, from: User.id }   # 手写 string
```

若写成 `type: long`，前端会生成 `number`，与别处的 `string` 不一致。

> **待办**：让 `build-ir.mjs` 在 `from` 指向 id 字段时自动推导 `type: string`，省去手写。见 [id-reference.md](../part4-design/id-reference.md#六已实现--待实现)。

## 禁止：`json` 用于实体

实体字段**不能**用 `type: json`（报 C26）。需要存结构化数据时，拆成子实体。

```yaml
# ❌ 实体里禁止
config: { type: json }

# ✅ 拆成实体
# 用 Config 实体 + ref
```

> `json` 只允许出现在视图（DTO）里。

## 下一步

[9. 引用](./9-references.md)

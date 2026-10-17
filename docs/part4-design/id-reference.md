# id 类型一致性 与 ref 设计

> 状态：**核心已实现**（ref 语法、类型派生、弱边不进 C4、三端生成）。
> 剩余：checker 兜底、`from` 省略 type、`fillFrom`。见文末「已实现 / 待实现」。
> 关联：C4（循环检测）、checker 重整。

---

## 一、问题：同一个 id，类型却不同

`id` 在 DSL 里被**四处各自声明**，彼此不知道对方，导致逻辑上同一个 id 类型不一致：

| 位置 | 契约写法 | 前端生成 |
|---|---|---|
| 主键 | `{ type: id, idType: long }` | （实体不给前端） |
| 外键 | `{ type: long }` | `number` |
| 视图字段（`from: User.id`） | `{ type: string, from: User.id }` | `string` |
| 视图字段（`from: Member.userId`） | `{ type: long, from: Member.userId }` | `number` |
| 路径参数 | `{ type: id, idType: long }` | `string`（生成器转） |
| query | `{ type: long }` | `number` |

**后果**：
- 同一个「用户 id」，`UserBrief.userId` 是 `string`，`MemberBrief.userId` 是 `number`
- 主键类型若从 long 改 uuid，**全链不会自动更新**，需人肉逐处改
- 前端调用时，同一 id 时而 string 时而 number

**根因**：id 类型没有单一事实来源，各处手写、互不联动。

---

## 二、ref 设计

### 语法

```yaml
Member:
  fields:
    userId: { ref: User, index: true, nullable: true }
```

`ref: User` 表示：**该字段存的是 User 的 id**，类型从 `User.id` **派生**。

### 语义（关键）

ref 是**类型层面的名义引用（nominal type-level reference）**，本质是**声明式的类型投影（declarative type projection）**：

- **类型推导**：字段类型不从自身声明，从目标实体的主键类型派生
- **单一事实来源**：id 类型只在目标主键处定义一次，所有引用点自动继承
- **编译期契约**：只有类型语义，**无运行时语义**

### ref 不是什么（划清边界）

| ref 是 | ref 不是 |
|---|---|
| 类型来源 | 数据库外键（FK 约束） |
| 编译期概念 | 运行时概念 |
| 让字段类型 = 目标主键类型 | 让字段值 = 目标对象 |
| 落库仍是 `bigint` | 生成 join / 级联 / 自动加载 |
| 不产生对象嵌套 | 不产生任何查询 |

**一句话**：ref 是「类型别名解析器」，把目标主键的类型投影到当前字段。

---

## 三、类型推导规则

1. **写 ref，不写 type**：`{ ref: User }` 隐含 `type=id`、`idType` 取自 `User.id`。
2. **`from` 可省 type**：视图字段 `{ from: User.id }` 时，类型由来源推导。
   - **前提**：仅当来源是 id 类字段时自动推导；
   - 其余情况（如 `budget: number → budgetText: string`）仍需显式写 type（存在转换）。
3. **前端统一 string**：所有 id 类字段，前端一律 `string`（路由参数、localStorage 均为字符串）。

---

## 四、强边 / 弱边 与 C4

ref 的引入，要求 C4 按**边的强弱**区分，而非一刀切：

| 边类型 | 来源 | 成环是否合法 | 进 C4？ |
|---|---|---|---|
| **强边** | `type: Entity`（值 = 实体，会嵌套） | **非法**（序列化无限递归） | ✅ |
| **弱边** | `ref: Entity` 或 `type: long`（值 = id，不嵌套） | **合法**（存 id 天经地义） | ❌ |
| 强边 | `type: View`（视图嵌套） | 非法 | ✅ |

### 例：弱边成环（合法，不报错）

```yaml
Department:
  fields:
    id: { type: id }
    managerId: { ref: Employee }

Employee:
  fields:
    id: { type: id }
    departmentId: { ref: Department }
```
存的是彼此的 id（Long），不嵌套，**不报错**。

### 例：强边成环（非法，报错）

```yaml
User:
  fields:
    id: { type: id }
    favoritePost: { type: Post }

Post:
  fields:
    id: { type: id }
    author: { type: User }
```
值互相嵌套，序列化无限递归，**报错**。

---

## 五、checker 兜底（B）

ref 是「引导正确写法」，**拦不住手写错误**，故 checker 必须并存：

| 检查 | 场景 | 级别 |
|---|---|---|
| 命名启发 | 字段名 `*Id` 结尾、类型裸 `long`/`string`、无 ref | 警告：建议用 ref |
| type 与 from 冲突 | `{ type: long, from: User.id }`（来源是 id 却写 long） | 报错 |
| 跨字段 id 一致性 | 语义同一个 id 的字段，类型不同 | 报错（最难） |

第三类可借「最终 from 到同一 `Xxx.id`」判定语义同一。

---

## 五·补：type: Entity 的语义不一致（ref 要解决的根因）

`type: Entity` 在不同生成器里含义不同：

| 生成器 | `type: User` 生成 | 语义 |
|---|---|---|
| Java 实体 | `private User user;` | 嵌套对象 |
| Flyway | `varchar(64)` | 存 id |
| DTO | `User user` | 嵌套对象 |

**Java 是对象、DB 是 id——同一字段两套语义。** 这也是 C4 强边的来源：
Java 侧确实会嵌套，成环则序列化无限递归。

ref 的作用：`ref: User` 明确「存 id」，三端一致——
Java `Long`、DB `bigint`、前端 `string`，**不产生嵌套，不进 C4**。

因此 ref 落地后，`type: Entity` 应仅表示「真的嵌套」（少见），
而绝大多数「存 id」的外键都改用 `ref`。

---

## 六、已实现 / 待实现

### ✅ 已实现

- [x] **DSL 语法**：`schemas/contract.schema.json` 的 `FieldDef` 有 `ref: { type: string }`
- [x] **build IR 解析**：`parser/build-ir.mjs` 的 `resolveField` 里 `if (def.ref)` 分支
  - `out.type = 'id'`，`out.idType` 从目标实体主键派生（默认 `long`）
  - `out.resolved = { kind: 'ref', target, idType }`
  - 目标实体不存在时报「引用不存在」（C1）
- [x] **C4 强弱边**：`FIELD_TYPE_KINDS = ['enum','entity','view']` 不含 `ref`，
  `addResolvedEdge` 只对这些 kind 加边——**ref 边不进依赖图，天然不成环**
- [x] **三端生成**：
  - Java entity：`javaType` 走 `t === 'id'` → `Long` 或 `String`（按 `idType`）
  - 前端 types：`tsType` 走 `t === 'id'` → `string`
  - Flyway：`t === 'id'` → `bigint` 或 `varchar(64)`
- [x] **契约迁移**：`auth.yaml` 的 `Member.userId/organizationId`、`bid.yaml` 的 `tenderId/contractorId` 等已改用 `ref`

### ⏳ 待实现

- [ ] **`from` 可省 type**：视图字段 `{ from: User.id }` 时自动推导类型为 `string`。
  当前 `build-ir.mjs` 只校验 `from` 指向的字段存在（C1），不推导 `type`，仍需显式写 `type: string`。
- [ ] **checker 兜底三条**：
  - 命名启发：字段名 `*Id` 结尾、类型裸 `long`/`string`、无 ref → 警告
  - type 与 from 冲突：`{ type: long, from: User.id }` → 报错（C27 部分覆盖，但 C27 允许 `id → string` 转换，实际拦不住反向错误）
  - 跨字段 id 一致性：语义同一个 id 的字段类型不同 → 报错
- [ ] **`fillFrom`**：schema 有字段，build IR 和生成器都没处理。当前是死语法。

---

## 变更记录

| 日期 | 动作 |
|---|---|
| 2026-10-15 | 建立，记录 ref 设计与 C4 强弱边修正 |
| 2026-10-18 | 更新状态：核心已实现（语法/buildIR/C4/三端生成/契约迁移），剩余 checker 兜底与 `from` 省 type |

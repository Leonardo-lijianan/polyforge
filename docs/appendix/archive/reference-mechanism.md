# 引用机制（Reference Mechanism）

> 生成时间: 2026-10-11
> 前置: docs/dsl-design-discussion.md
> 定位: DSL 的核心机制定义——引用怎么写、怎么展开、怎么检查
> 状态: 待评审

---

## 1. 定义

> **引用 = 契约里的一个名字。生成时把名字换成内容，生成物里不再有名字。**

---

## 2. 三条规则

| # | 规则 | 说明 |
|---|---|---|
| 1 | 契约里只写名字 | `UserRole` / `User.phone` / `LoginForm`，不写路径、不写展开 |
| 2 | 生成时全部展开 | 能内联的内联；不能内联的（Java enum）独立文件但只引一层 |
| 3 | 依赖单向 | `enum ← entity ← view ← api`，禁止反向、禁止环 |

---

## 3. 引用能出现在哪（穷举，5 种）

```yaml
enums:
  UserRole: { values: [...] }

entities:
  User:
    fields:
      role: { type: UserRole }              # ① 字段引用枚举

views:
  UserBrief:
    fields:
      userId: { from: User.id }             # ② 引用实体字段
      role:   { type: UserRole }            # ③ 引用枚举
  MemberList:
    fields:
      items: { type: array, of: Member }    # ④ 引用实体（数组元素）

api:
  login:
    input: LoginForm                        # ⑤ 引用 view
    output: LoginData
```

**就这 5 种形态。**

---

## 4. 全流程

```
① 契约（人写）
   User.role: { type: UserRole }
        │
        │ ② 编译器解析 + 检查
        │    找 UserRole → 存在？
        │    检查依赖图 → 有环？
        ▼
③ IR（内存，已展开）
   { field: 'role', type: 'enum', values: ['employer',...] }
        │
        │ ④ 生成
        ▼
⑤ 生成物（自包含）
   TS：  role: 'employer' | 'contractor' | 'supplier' | 'admin'
   Java：private UserRole role;   // 独立 enum，深度 1
```

### 4.1 多文件机制

契约物理上是**多个文件**，逻辑上是**一份契约**。

```
contract/
├── contract.schema.json
├── global/
│   ├── enums.yaml          # 跨域共享枚举
│   └── errors.yaml         # 错误码
└── domains/
    ├── auth.yaml           # 域内 entities/views/api
    ├── project.yaml
    └── tender.yaml
```

**编译器读法（四步）**：

```
① 扫目录，找到所有 .yaml
② 逐个解析成对象
③ 按「名字」建全局索引  { UserRole → {...}, User → {...}, LoginForm → {...} }
④ 合并成一个 IR（一份逻辑契约）→ 解析引用 → 检查 → 生成
```

**关键**：**先全读，再索引，后解析引用。** 文件顺序不影响结果。

### 4.2 跨文件引用不写路径

```yaml
# domains/auth.yaml
entities:
  User:
    fields:
      role: { type: UserRole }    # ← 不写路径
```

编译器自动在全局索引里找 `UserRole`（定义在 `global/enums.yaml`）。

**对比 OpenAPI**：
```yaml
# OpenAPI 要写完整路径
role: { $ref: '../global/enums.yaml#/components/schemas/UserRole' }
```

**DSL 不用写路径。写引用的人不需要知道文件怎么分。**

### 4.3 名字全局唯一

**重名 = 报错（C6）。**

- 简单：编译器不用管作用域
- 符合「契约是一体的」
- 真需要两个同名 → 说明它们不是同一个东西 → 应该改名

---

## 5. 生成物自包含规则

| 语言 | 枚举 | 字段类型 | 跨 DTO |
|---|---|---|---|
| **TS** | 内联 union，不 import | 内联，不 import | 内联 object，不 import |
| **Java** | 独立 enum 文件（语言要求） | 直接类型 | 允许 import，但**深度 ≤1** |

**原则：能展开就展开。Java 因语言限制展不开的，才允许 import，且限制深度。**

---

## 6. 完整例子（auth）

**契约**：
```yaml
enums:
  UserRole:
    values: [employer, contractor, supplier, admin]

entities:
  User:
    fields:
      id:    { type: id }
      phone: { type: string }
      role:  { type: UserRole }

views:
  LoginData:
    fields:
      userId: { type: string }
      role:   { type: UserRole }

api:
  login:
    input:  LoginForm
    output: LoginData
```

**生成的 TS（完全自包含，零 import）**：
```ts
export interface LoginData {
  userId: string
  role: 'employer' | 'contractor' | 'supplier' | 'admin'
}
```

**生成的 Java（只引一层 enum）**：
```java
// generated/dto/LoginData.java
public record LoginData(String userId, UserRole role) {}

// generated/enums/UserRole.java
public enum UserRole { EMPLOYER, CONTRACTOR, SUPPLIER, ADMIN }
```

---

## 7. 检查器（机制的一部分）

> 引用机制不能只管"怎么展开"，还要管"展开前是否合法"。检查器是机制的组成部分，不是附加品。

### 7.1 检查项（全 15 条）

**A 组：引用与依赖**

| # | 检查 | 级别 | 说明 |
|---|---|---|---|
| C1 | 引用存在性 | error | `UserRole` / `User.id` / `LoginForm` 必须已定义 |
| C2 | 类型匹配 | error | 引用的东西类型要对（枚举不能当实体） |
| C3 | 单向依赖 | error | 禁止 Entity→View、View→Api 等反向 |
| C4 | 循环检测 | error | 依赖图中不允许环 |
| C8 | 字段来源有效 | error | `from: User.xxx` 的 xxx 必须存在于 User |

**B 组：业务值合法（缺口所在，必须有）**

| # | 检查 | 级别 | 说明 |
|---|---|---|---|
| C9 | 角色值合法 | error | `auth.roles` 里的值必须在 `UserRole` 枚举里 |
| C10 | 流转角色合法 | error | `state.transitions.by` 的值必须在 `UserRole` 枚举里 |
| C11 | 枚举值合法 | error | 字段 `type` 引用枚举时，枚举必须存在（同 C1，但值域要单独查） |

**C 组：命名与结构**

| # | 检查 | 级别 | 说明 |
|---|---|---|---|
| C6 | 命名冲突 | error | 全局名唯一（多文件合并后） |
| C12 | 命名规范 | error | 实体 PascalCase / 字段 camelCase / 枚举值符合约定 |
| C13 | 必填字段完整 | error | `required` 里列的名字必须真在 `fields` 里 |
| C15 | 类型完整 | error | 数组字段必须有 `of`；引用字段必须有定义 |

**D 组：跨域与生成**

| # | 检查 | 级别 | 说明 |
|---|---|---|---|
| C7 | 跨域依赖方向 | error | domain 之间只允许特定方向（待定） |
| C5 | 未使用告警 | warning | 定义了但没人引用（可能是残留） |
| C14 | 生成物同步 | error | 生成物与契约不一致 → 阻断（CI 门禁） |

### 7.1.1 三方各司其职

业务值的合法性**不能只靠 JSON Schema**，需要三方配合：

```
schema   → 管「语法」（这地方能不能出现字符串）
enum定义 → 管「词法」（合法的词有哪些）
检查器   → 管「语义」（用的词合法吗、引用对得上吗）
```

**缺一层就漏一层。** 例如：

```yaml
enums:
  UserRole: { values: [employer, contractor] }
api:
  login:
    auth: { roles: [employer, hacker] }   # ← hacker 不合法
```

- schema 只看「roles 是字符串数组」→ 通过
- enum 只管自己的 values
- **只有 C9 能发现 `hacker` 不在 UserRole 里**

### 7.1.2 JSON Schema 必须业务无关

schema 只校验**结构**，不校验**业务值**。以下三处必须去掉硬编码：

| 位置 | 错误写法 | 正确写法 |
|---|---|---|
| `TransitionDef.by` | `enum: [employer, contractor, ...]` | `{ type: string }` |
| `AuthObject.roles` | `enum: [employer, ...]` | `{ type: string }` |
| `ViewDef.kind` | `enum: [form, query, brief, detail]` | 保留（这是 DSL 语法概念，非业务） |

**判断标准**：换一个业务（电商），这个值还成立吗？不成立 → 是业务值 → 从 schema 移除，交给检查器。

### 7.2 循环检测算法

```
1. 构建依赖图：节点 = 每个定义（enum/entity/view），边 = 引用
2. 拓扑排序（Kahn 或 DFS）
3. 排序失败 → 存在环 → 报错并打印环路径
4. 排序成功 → 得到生成顺序
```

**环路径要打印出来**，让用户知道环在哪：
```
错误：检测到循环引用
  UserBrief → MemberInfo → UserBrief
```

### 7.3 检查时机

| 时机 | 工具 | 目的 |
|---|---|---|
| 编辑时 | Language Server | 即时反馈 |
| 提交前 | git hook / npm script | 阻断 |
| CI | contract:check | 门禁 |

---

## 8. Language Server（检查器的演进形态）

### 8.1 为什么值得做

DSL 本质是一种"语言"（有语法、有引用、有依赖图）。所有语言工具需要的，它都需要。而 LSP 是标准协议，编辑器原生支持。

### 8.2 LSP 能提供的能力

| 能力 | 对应检查项 | 价值 |
|---|---|---|
| 诊断（红色波浪线） | C1~C8 | 写错立刻看到，不用跑编译器 |
| 跳转定义 | — | 点 `UserRole` 跳到定义 |
| 悬停提示 | — | 悬停 `User.id` 显示类型 |
| 补全 | — | 输入 `User.` 补全字段名 |
| 查找引用 | — | 谁引用了 `UserRole` |
| 重命名 | — | 改名时同步所有引用 |

### 8.3 分层实现（不要一上来全做）

| 阶段 | 实现 | 工作量 |
|---|---|---|
| **P0** | CLI 检查器（`contract:check`） | 小 |
| **P1** | 输出格式支持编辑器（`--json` 输出诊断） | 小 |
| **P2** | 最小 LSP（只做诊断） | 中 |
| **P3** | LSP 增强（跳转/补全/悬停） | 中 |

**P0 是当前必需的。P2/P3 是体验优化，跑通后再做。**

### 8.4 P0 与 LSP 共享内核

```
        ┌─────────────┐
        │  检查器核心  │  ← 只写一次
        │ (解析+校验)  │
        └──────┬──────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
   CLI 输出          LSP 输出
   (人类可读)        (编辑器协议)
```

**检查逻辑只写一次，CLI 和 LSP 只是两种输出。**

---

## 9. 复杂度隔离

你担心"多重引用看不完"——问题被隔离在契约层：

| 谁 | 看什么 | 跳转 |
|---|---|---|
| 写契约的人（少数、低频） | 全部契约 | 有跳转，但集中 |
| 写业务/AI（多数、高频） | 只看一个生成物文件 | 零跳转 |

**理解成本从"每个改代码的人"转移到"写契约的人"。写契约低频、集中、可规划。**

---

## 10. 工具划分（检查器 vs 编译器）

核心就两个东西：

| 工具 | 职责 | 何时用 |
|---|---|---|
| **检查器** | 只读，判断合法/非法 | CI、编辑器、提交前 |
| **编译器** | 解析 + 检查 + 生成 | 需要产物时 |

**检查器是编译器的一个子集**（编译器内部也要跑检查）。拆出来的价值：CI 里只想检查、不想生成。

```
        ┌─────────────┐
        │  检查器核心  │  ← 只写一次
        │ (解析+校验)  │
        └──────┬──────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
   检查器            编译器
   (只报错)      (检查 + 生成)
```

### 10.1 检查能力边界（诚实说）

| 能查 | 查不了 |
|---|---|
| 结构、类型、引用、命名、唯一性 | 业务逻辑对不对 |
| 循环依赖、业务值合法 | 运行期行为 |
| 生成物与契约是否同步 | 性能、安全漏洞 |

**检查器保证「契约自洽 + 生成物同步」，保证不了「业务正确」。**

---

## 11. 实现蓝图（代码文件清单）

### 11.1 文件结构

```
tools/contract-compiler/
├── index.mjs                 入口（gen / check / clean）
├── parser/
│   ├── load.mjs              扫目录 + 读所有 YAML
│   └── build-ir.mjs          建全局索引 + 解析引用 + 建依赖图
├── validate/
│   └── index.mjs             C1~C15 检查
├── ir/
│   └── shape.md              IR 数据结构说明
└── generators/
    ├── frontend/
    │   ├── types.mjs         IR → TS 类型（自包含）
    │   └── requestMaps.mjs   IR → 请求表
    ├── java/
    │   ├── entity.mjs        IR → @Entity
    │   ├── dto.mjs           IR → record
    │   └── flyway.mjs        IR → SQL
    └── openapi/
        └── export.mjs        IR → OpenAPI（导出）
```

### 11.2 数据流

```
① 多个 YAML 文件
        │ load.mjs：扫目录，读文件
        ▼
② 原始对象数组 [{file, doc}, ...]
        │ build-ir.mjs：建全局索引，解析引用，建依赖图
        ▼
③ IR（内存，已展开）
   {
     enums:    Map<name, EnumDef>,
     entities: Map<name, EntityDef>,
     views:    Map<name, ViewDef>,
     apis:     [{ name, method, path, ... }],
     graph:    { edges: [], adjacency: Map }
   }
        │ validate：在 IR 上跑 C1~C15
        ▼
④ 校验通过
        │ generators：各生成器读 IR，写文件
        ▼
⑤ 产物（TS / Java / SQL / OpenAPI）
```

### 11.3 IR 形状（关键）

```js
// FieldDef 是重点：生成器只看 resolved，不看 type
{
  name: 'role',
  type: 'UserRole',        // 原始：引用名
  resolved: {              // 解析后：展开结果
    kind: 'enum',
    target: 'UserRole',
    values: ['employer', ...]
  },
  length, unique, nullable, sensitive, validate, ...
}
```

**生成器不用管「引用」，只管「展开后的东西」。**

### 11.4 实现顺序（每步可验证）

| Step | 做什么 | 验收 |
|---|---|---|
| 1 | load.mjs + build-ir.mjs | 能读 auth.yaml，打印 IR |
| 2 | validate（先 C1 + C4） | 故意写错引用，能报错 |
| 3 | generators/frontend/types.mjs | 生成 TS 类型，肉眼正确 |
| 4 | 跑通 auth（gen → 前端 + Java + Flyway） | 产物生成，Java 能编译 |
| 5 | 补 C2/C3/C5~C15 | 覆盖全检查项 |
| 6 | export.mjs | 导出 OpenAPI |
| 7 | 清理旧文件 | 删除伪 OpenAPI 格式 |

---

## 12. 一句话总结

> **契约用名字（人维护全图），生成物用内容（AI 看单文件），检查器守边界（机器保证一致）。**

---

## 11. 待决策

| # | 决策 | 建议 |
|---|---|---|
| 1 | 跨域依赖方向规则（C7） | 待第二个域出现再定 |
| 2 | 检查器输出格式 | 默认人类可读，加 `--json` 供 LSP |
| 3 | LSP 何时做 | P0 先做，P2/P3 待跑通后 |
| 4 | 未使用告警是否阻断 | 否（warning 不阻断） |

---

*本文档定义引用机制。检查器为机制组成部分，LSP 为其演进形态。*

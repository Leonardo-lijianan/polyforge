# 3. 校验体系

polyforge 的校验分两层，规则用 `C` 编号（C1 ~ C33）。

## 两层校验

| 层 | 文件 | 手段 | 查什么 |
|---|---|---|---|
| **结构校验** | `parser/schema-validator.mjs` | JSON Schema（AJV） | 文档结构：字段类型、必填、是否多键 |
| **语义校验** | `validate/index.mjs` + `parser/build-ir.mjs` | 代码 | 引用、类型、环、命名、业务约束 |

结构校验**无编号**，语义校验**有 C 编号**。

## 编号在哪实现

> 🔧 **待改进**：校验分散在两个文件，编号与文件不一一对应，是历史遗留。

| 编号 | 含义 | 实现在 |
|---|---|---|
| C1 | 引用存在（type/of/input/output/from） | `build-ir.mjs` |
| C2 | 类型匹配 | `build-ir.mjs` |
| C3 | 单向依赖 | `validate/index.mjs` |
| C4 | 循环引用 | `validate/index.mjs` |
| C5 | 未使用告警 | `build-ir.mjs` |
| C6 | 命名冲突 | `build-ir.mjs` |
| C7 | 跨域循环依赖 | `validate/index.mjs` |
| C9 | 角色值合法（auth.roles） | `validate/index.mjs` |
| C10 | 流转角色合法 | `validate/index.mjs` |
| C12 | 命名规范 | `validate/index.mjs` |
| C13 | required 字段存在 | `validate/index.mjs` |
| C15 | 数组必须有 of | `validate/index.mjs` |
| C16 | 索引字段存在 | `validate/index.mjs` |
| C17 | 索引 fields 非空 | `validate/index.mjs` |
| C18 | 实体恰一个 id | `validate/index.mjs` |
| C19 | auto 必须 datetime | `validate/index.mjs` |
| C20 | sensitive 只能 string | `validate/index.mjs` |
| C21 | 主键不可 nullable | `validate/index.mjs` |
| C22 | of 只能配 array | `validate/index.mjs` |
| C23 | validate 预置名合法 | `validate/index.mjs` |
| C24 | validateRef 字段存在 | `validate/index.mjs` |
| C25 | 接口角色在 permissions 定义 | `validate/index.mjs` |
| C26 | 禁 json 类型 | `validate/index.mjs` |
| C27 | from 类型兼容 | `validate/index.mjs` |
| C28 | 路径参数在 pathParams 声明 | `validate/index.mjs` |
| C29 | query/pathParams 只能标量 | `validate/index.mjs` |
| C30 | 日期字段名必须用 date/datetime | `validate/index.mjs` |
| C31 | 修饰符位置合法（unique/ref/from/derived 等只能用在特定位置） | `validate/index.mjs` |
| C32 | derived 字段语义（取值合法、与 from 互斥、relation 必须有 via） | `validate/index.mjs` |
| C33 | api.input 必须引用 form 视图（入参方向只能是 form） | `validate/index.mjs` |

> 编号 **C8 / C11 / C14 目前无实现**（注释残留）。

## 规则一览

### 引用与依赖

| 编号 | 规则 |
|---|---|
| C1 | 引用的名字必须存在 |
| C2 | 字段类型必须匹配 |
| C3 | 依赖方向合法（实体不能引视图） |
| C4 | 强引用不能成环 |
| C6 | 名字全局唯一 |
| C7 | 跨域依赖不能成环 |

### 命名

| 编号 | 规则 |
|---|---|
| C12 | 枚举/实体/视图/规则 = PascalCase；api/字段 = camelCase |

### 实体

| 编号 | 规则 |
|---|---|
| C16 | 索引字段必须存在 |
| C17 | 索引的 fields 非空 |
| C18 | 实体恰有一个主键 |
| C19 | auto 字段必须是 datetime |
| C20 | sensitive 只能用在 string |
| C21 | 主键不能 nullable |
| C22 | of 只能配 type:array |
| C26 | 实体禁 json 类型 |

### 字段类型约定

| 编号 | 规则 |
|---|---|
| C30 | 字段名以 `Time` / `At` / `Datetime` / `Deadline` 结尾时类型必须是 `datetime`；以 `Date` 结尾时类型必须是 `date`。命名用 camelCase 的大写字母作为词边界，因此 `format`、`data` 这类词不会误伤 |

### 修饰符

| 编号 | 规则 |
|---|---|
| C31 | 修饰符位置必须合法（`unique`/`index`/`auto`/`ref` 只能用于 entity；`from`/`sensitive`/`derived` 只能用于 output 视图；`writeOnly`/`validateRef` 只能用于 form；`validate` 可用于 form/query/apiQuery/pathParams） |
| C32 | `derived` 语义：取值必须是 `text`/`join`/`relation`/`permission`/`compute`；与 `from` 互斥；`relation` 必须有 `via` 且路径可解析；`permission` 必须是 array of enum |

### 视图

| 编号 | 规则 |
|---|---|
| C13 | required 里的字段必须存在 |
| C15 | 数组必须写 of |
| C23 | validate 只能引用预置校验器 |
| C24 | validateRef 指向的字段必须存在 |
| C27 | from 类型必须兼容 |

### 接口

| 编号 | 规则 |
|---|---|
| C28 | 路径参数必须在 pathParams 声明 |
| C29 | query / pathParams 只能是标量 |
| C33 | api.input 引用的视图 kind 必须是 form；detail / brief / query 只能用作 output |

### 权限

| 编号 | 规则 |
|---|---|
| C9 | auth.roles 的角色必须在 UserRole 枚举里 |
| C10 | 状态机流转 by 的角色必须在 UserRole 里 |
| C25 | api 用的角色必须在 permissions 里定义 |

## 编号使用缺口

> 🔧 **待改进**：编号体系有已知问题：
>
> 1. **跳号**：C8 / C11 / C14 无实现
> 2. **跨文件**：C1/C2/C5/C6 在 build-ir，其余在 validate，分工只靠注释
> 3. **无权威表**：本文档是目前唯一的全表，代码里没有
>
> 重构方向见[设计取舍](./5-design-decisions.md)。

## 下一步

[4. 生成器](./4-generators.md)

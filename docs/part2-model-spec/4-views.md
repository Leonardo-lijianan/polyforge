# 4. 视图

**视图**是模型里描述「一组字段的集合」的单元。它是**接口的输入输出形态**——api 的 `input`、`output` 引用视图，而不是直接引用实体。

实体面向数据库，视图面向前后端通信。

## 四种视图

`kind` 决定视图的用途：

| kind | 用途 | 例 |
|---|---|---|
| `form` | 提交数据（前端 → 后端） | `LoginForm`、`CreateOrderForm` |
| `query` | 查询条件 | `OrderQuery` |
| `brief` | 列表项（后端 → 前端，简要） | `UserBrief`、`OrderBrief` |
| `detail` | 详情（后端 → 前端，完整） | `UserDetail`、`OrderDetail` |

## 在模型中

```yaml
views:
  CreateOrderForm:
    kind: form
    fields:
      userId: { type: string }    # 前端 id 一律 string（大整数精度）
      amount: { type: number }
    required: [userId, amount]
```

> **form 里的 id 字段用 `type: string`**，不用 `type: long`。前端所有 id 都是字符串（见 [类型系统](./8-type-system.md)）。

## 必填规则（关键）

**form 和 非 form，必填判断方式不同**：

| 视图种类 | 字段是否必填，看 |
|---|---|
| `form` | `required` 列表里有它 → 必填 |
| `query` / `brief` / `detail` | `nullable: true` → 可选；否则必填 |

也就是说：

- **form**：默认可选，`required` 里列出的才必填（贴合「表单大部分字段可空」）
- **响应类**：默认必填，只有显式 `nullable: true` 才可选（贴合「后端承诺会返回」）

## writeOnly

`writeOnly: true` 的字段，**只在 form 里出现**，响应类视图里不生成。

```yaml
LoginForm:
  kind: form
  fields:
    password: { type: string, writeOnly: true }
```

用途：密码这类「只进不出」的字段。

## from：字段来源

视图字段可以声明 `from`，指明它取自哪个实体的哪个字段：

```yaml
UserBrief:
  kind: brief
  fields:
    id:   { type: string, from: User.id }
    name: { type: string, from: User.name }
```

`from` 的作用：让生成的 **Assembler**（Entity → DTO 映射器）自动填充这些字段的取值，不用手写。

> `from` 的完整规则见 [9. 引用](./9-references.md)。

## 生成的产物

| 端 | 产物 |
|---|---|
| 后端 | `UserBrief.java`（record） |
| 后端 | `UserBriefAssembler.java`（Entity → DTO 映射，填 `from` 声明的字段） |
| 前端 | `interface UserBrief { ... }` |
| 数据库 | 不生成（视图不落库） |

> **命名注意**：视图映射器叫 `Assembler`，不叫 `Mapper`。`Mapper` 在 MyBatis-Plus 里指 DAO（`BaseMapper`），两者不能混。JPA 时代曾叫 `Mapper`，迁移 MyBatis-Plus 时改名。

## 陷阱

❌ `kind` 缺失或非法

```yaml
UserBrief:
  fields: { ... }        # 报错：视图必须有 kind
```

❌ `required` 里列了不存在的字段

```yaml
CreateOrderForm:
  kind: form
  fields:
    userId: { type: string }
  required: [userId, amount]   # 报错：amount 不在 fields 里（C13）
```

❌ 视图名小写开头

```yaml
userBrief:               # 必须 PascalCase
  kind: brief
  fields: { ... }
```

## 下一步

[5. 接口](./5-apis.md)

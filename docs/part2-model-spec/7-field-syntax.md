# 7. 字段语法

实体和视图的字段，共用同一套修饰符。本章是字段定义的完整参考。

## 基本形态

```yaml
字段名: { type: 类型, 修饰符: 值, ... }
```

**只有 `type` 是必填的**，其余都是可选修饰符。

```yaml
email: { type: string, length: 255, nullable: true }
```

## 类型 type（必填）

| 值 | 含义 |
|---|---|
| `id` | 主键（见 [3. 实体](./3-entities.md)） |
| `string` | 短字符串 |
| `text` | 长文本 |
| `int` | 整数 |
| `long` | 长整数 |
| `number` / `decimal` | 小数 |
| `boolean` | 布尔 |
| `date` | 日期 |
| `datetime` | 日期时间 |
| `array` | 数组（须配 `of`） |
| 枚举名 | 引用一个枚举 |
| 实体名 | 引用一个实体（见 [9. 引用](./9-references.md)） |

## 修饰符一览

> 每个修饰符能用在哪些位置（实体/表单/出参/URL 参数…），见 [10. 修饰符适用范围](./10-modifier-scope.md)。

| 修饰符 | 适用 | 含义 |
|---|---|---|
| `idType` | `type: id` | `long`（默认）/ `string` / `uuid` |
| `nullable` | 全部 | 可为空 |
| `length` | string | 最大长度（落库 `varchar(n)`） |
| `unique` | 标量 | 唯一约束 |
| `index` | 标量 | 普通索引 |
| `auto` | datetime | 自动填充：`create` / `update` |
| `sensitive` | string | 敏感字段：`mask`（打码）/ `hide`（隐藏） |
| `writeOnly` | form 字段 | 只进不出（见 [4. 视图](./4-views.md)） |
| `of` | array | 数组元素类型 |
| `from` | 视图字段 | 取值来源（见 [9. 引用](./9-references.md)） |
| `validate` | 视图字段 | 预置校验器 |
| `validateRef` | 视图字段 | 引用同视图的另一个字段 |
| `note` | 全部 | 注释，写进生成的代码 |
| `default` | 全部 | 默认值（仅记录） |

## nullable

不写 `nullable` 时：

- **实体**：默认必填（落库 `NOT NULL`）
- **响应类视图**：默认必填
- **form**：默认可选（要看 `required`）

```yaml
email: { type: string, nullable: true }   # 可为空
```

## auto（自动时间）

```yaml
createTime: { type: datetime, auto: create }
updateTime: { type: datetime, auto: update }
```

| 值 | 行为 |
|---|---|
| `create` | 插入时自动填充，之后不更新 |
| `update` | 每次更新时自动填充 |

> `auto` 只能用在 `datetime` 字段（C19）。

## sensitive（敏感字段）

```yaml
phone:  { type: string, sensitive: mask }   # 展示时打码
idCard: { type: string, sensitive: hide }   # 不返回
```

| 值 | 行为 |
|---|---|
| `mask` | 返回时打码（如 `138****0000`） |
| `hide` | 不返回 |

> `sensitive` 只能用在 `string` 字段（C20）。

## validate（校验器）

视图字段可引用预置校验器：

```yaml
LoginForm:
  kind: form
  fields:
    phone:    { type: string, validate: phone }
    password: { type: string, validate: { minLength: 6, maxLength: 20 } }
```

**预置校验器**（`validate` 用字符串时）：

| 名 | 校验 |
|---|---|
| `phone` | 手机号 |
| `email` | 邮箱 |
| `idCard` | 身份证号 |
| `creditCode` | 统一社会信用代码 |
| `realName` | 中文姓名 |
| `companyName` | 公司名长度 |

**自定义范围**（`validate` 用对象时）：

```yaml
amount: { type: number, validate: { min: 0, max: 1000000 } }
name:   { type: string, validate: { minLength: 2, maxLength: 50 } }
```

> `validate` 只能引用预置名或上面的对象形式，写别的会报 C23。

## validateRef（字段间校验）

引用同视图的另一个字段，用于「确认密码」这类：

```yaml
AccountForm:
  kind: form
  fields:
    password:        { type: string }
    confirmPassword: { type: string, validateRef: password }
```

> `validateRef` 指向的字段必须存在（C24）。

## of（数组元素）

```yaml
items: { type: array, of: OrderItem }
```

> `of` 只能配 `type: array`（C22）；数组必须有 `of`（C15）。

## from（取值来源）

视图字段声明它取自哪个实体的哪个字段：

```yaml
name: { type: string, from: User.name }
```

> 详见 [9. 引用](./9-references.md)。

## 陷阱

❌ 数组没写 `of`

```yaml
items: { type: array }      # 报错：数组必须有 of（C15）
```

❌ `of` 配了非数组

```yaml
item: { type: string, of: OrderItem }   # 报错：of 只能配 array（C22）
```

❌ `auto` 用在非 datetime

```yaml
count: { type: int, auto: create }   # 报错：auto 只能配 datetime（C19）
```

❌ `sensitive` 用在非 string

```yaml
amount: { type: number, sensitive: mask }   # 报错（C20）
```

## 下一步

[8. 类型系统](./8-type-system.md)

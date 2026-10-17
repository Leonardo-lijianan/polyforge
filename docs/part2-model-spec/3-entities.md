# 3. 实体

**实体**是模型里描述一张数据库表的单元。一个实体对应一张表：字段是列，索引是索引。

## 在模型中

```yaml
entities:
  User:
    table: users
    fields:
      id:         { type: id, idType: long }
      name:       { type: string, length: 64 }
      email:      { type: string, length: 255, nullable: true }
      createTime: { type: datetime, auto: create }
```

| 键 | 必填 | 含义 |
|---|---|---|
| `table` | 否 | 表名，默认按实体名转蛇形复数 |
| `fields` | 是 | 字段定义（名 → 定义） |
| `indexes` | 否 | 表级索引（见下） |

## 字段

每个字段是一个「字段名 → 定义」映射，定义里最关键是 `type`：

```yaml
id: { type: id, idType: long }
```

字段的完整修饰符（`nullable`、`unique`、`length`、`auto`、`sensitive` 等）见 [7. 字段语法](./7-field-syntax.md)。

## 主键

每个实体**必须恰好有一个** `type: id` 的字段作主键。

```yaml
id: { type: id, idType: long }
```

| idType | 落库 |
|---|---|
| `long`（默认） | `bigint`，自增 |
| `string` | `varchar(64)`，业务生成 |
| `uuid` | `uuid` |

## 生成的产物

| 端 | 产物 |
|---|---|
| 数据库 | `CREATE TABLE users (...)` |
| 后端 | `User.java`（MyBatis-Plus 实体，Lombok `@Data` 生成 getter/setter，`@TableName`/`@TableField`/`@TableId` 标注） |
| 前端 | **不生成**（实体是服务端概念，不暴露给前端） |

## 索引

两种方式。**单列**用字段级修饰符：

```yaml
userId: { ref: User, index: true }       # 普通索引（外键用 ref，类型从 User.id 派生）
phone:  { type: string, unique: true }   # 唯一约束
```

**复合索引**用表级 `indexes`：

```yaml
entities:
  Order:
    table: orders
    fields:
      id:     { type: id }
      userId: { ref: User }
      status: { type: OrderStatus }
    indexes:
      - { fields: [userId, status] }              # 复合普通索引
      - { fields: [userId], unique: true }        # 复合唯一
```

> **外键用 `ref`，不用 `type: long`**。`ref: User` 让字段类型从 `User.id` 派生——主键从 `long` 改 `uuid` 时，所有引用点自动跟着变。
> 见 [id-reference.md](../part4-design/id-reference.md)。

## 陷阱

❌ 实体名小写开头

```yaml
user:              # 必须 PascalCase
```

❌ 没有主键 / 多个主键

```yaml
User:
  fields:
    id1: { type: id }
    id2: { type: id }    # 报错：只能有一个主键（C18）
```

❌ 索引引用了不存在的字段

```yaml
indexes:
  - { fields: [noSuchField] }   # 报错（C16）
```

## 下一步

[4. 视图](./4-views.md)

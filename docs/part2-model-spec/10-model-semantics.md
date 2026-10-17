# 10. 模型语义（derived）

模型有**结构**，也有**行为**。本章讲行为侧唯一的语法：`derived`（服务端装配字段）。

## 问题

视图里有些字段，**不来自数据库列**：

- `statusText`：由 `status` 枚举派生显示文本
- `projectLeader`：经 ref 关联装配的对象
- `TeamDetail.projects`：经 ref 链反查的集合
- `userRoles`：按当前登录人计算

它们以前只能「空手声明」，polyforge 无法区分「故意服务端算」与「漏写来源」。

## 语法

`derived` 是**视图专属**修饰符（见 [10. 修饰符适用范围](./10-modifier-scope.md)），取值五种：

| 取值 | 含义 | 附加要求 |
|---|---|---|
| `text` | 枚举/状态 → 显示文本 | 无 |
| `join` | 经 ref 关联装配**单个**对象 | `type` 指向 view |
| `relation` | 经 ref 链反查**集合** | `of` + `via` 路径 |
| `permission` | 按登录人计算 | `array` + `of` 枚举 |
| `compute` | 其它服务端计算 | 无（逃生口） |

### 例子

```yaml
views:
  TeamDetail:
    kind: detail
    fields:
      id:       { type: string, from: Team.id }
      members:  { type: array, of: TeamMemberBrief }
      projects:
        type: array
        of: TeamProject
        derived: relation
        via: [TeamMember.userId, Project.contractorId]
```

## via：关系路径

`relation` 必须写清反查路径 `via`，格式为 `实体.字段` 的有序列表。

上例的 `[TeamMember.userId, Project.contractorId]` 表示：

```
Team ──TeamMember(teamId=Team.id)──> TeamMember.userId
     ──(匹配)──> Project.contractorId
```

**polyforge 校验**：每段 `实体.字段` 必须存在（C32）。

> 只校验字段存在，不校验语义方向——方向对了与否，靠人。

## 生成物

| 生成器 | 对 derived 字段 |
|---|---|
| Flyway | **跳过**（不是列） |
| Java Entity | **跳过**（不是表字段） |
| Java DTO | 正常生成 + 注释 `// derived(xxx)` |
| 前端 TS | 正常生成 |
| requestMap | 正常生成 |

## 后端消费

Service 在 `entity → view` 转换时**手动填充** derived 字段：

```java
dto.setProjects(queryTeamProjects(team.getId()));  // derived: relation
```

> 模型保证**形状对齐**（DTO 有字段、前端有类型），**不保证后端真填了**。
> 与 `api.output` 声明返回形状、不保证 service 真返回，同一性质。

## 下一步

[第五部分 · 扩展](../part5-extending/1-add-generator.md)

# 命名原则

> 生成时间: 2026-10-13
> 目的: 记录 DSL 契约的命名规则，避免全局命名冲突

---

## 1. 核心原则

> 一个概念一个名字；能完整表意的前提下，名字尽可能短。

拆成两条：

1. 唯一性：全局名（枚举/实体/视图）必须唯一，不能重名（检查器 C6 强制）
2. 简洁性：在能表意的前提下用最短的名字

两条冲突时，唯一性优先（宁可加限定词，也不能重名）。

---

## 2. 命名的三种情况

### 情况 A：概念唯一，用最短名

```yaml
UserRole:      # 全局只有一个角色枚举
ProjectStatus: # 全局只有一个项目状态
```

### 情况 B：概念相似但要区分，加限定词

```yaml
ConstructionIssueStage:   # 施工期问题阶段
ConstructionIssueStatus:  # 施工期问题状态
```

限定词放前缀（Construction 在前），便于同类聚合。

### 情况 C：同一概念被重复定义，合并

如果两处定义的是同一个东西，只保留一个，另一处引用。

---

## 3. 真实案例：ArbitrationStatus 冲突

### 3.1 问题

初期在两个文件里定义了同名枚举：

| 文件 | 定义 |
|---|---|
| construction.yaml | ArbitrationStatus: PROCESSING, CLOSED |
| dispute.yaml | ArbitrationStatus: pending, processing, resolved, rejected |

检查器 C6 报命名冲突。

### 3.2 排查

关键发现：construction.yaml 里的 ArbitrationStatus 根本没被任何字段引用——ConstructionRecord.arbitrations 字段是 json 类型，没用到这个枚举。

### 3.3 结论

不是两个概念，是一个多余的声明。直接删除 construction 域里的定义，保留 dispute 域的。

### 3.4 教训

冲突不一定是该区分，也可能是该删除。遇到重名，先问：

1. 它们真的是两个概念吗？
2. 有没有一个是多余的（没被引用）？
3. 能不能合并成一个？

只有当确实是两个概念时，才加限定词。

---

## 4. 命名规范

| 类型 | 风格 | 例 |
|---|---|---|
| 枚举名 | PascalCase | UserRole |
| 枚举值 | snake_case（施工类可用 UPPER_SNAKE） | pending_party / IN_PROGRESS |
| 实体名 | PascalCase | User |
| 表名 | snake_case 复数 | users |
| 视图名 | PascalCase | LoginForm / UserBrief |
| 视图后缀 | Form/Query/Brief/Detail/List | MemberList |
| 字段名 | camelCase | createTime |
| 列名 | snake_case | create_time |

---

## 5. 视图命名约定

| 后缀 | 用途 |
|---|---|
| Form | 表单输入 |
| Query | 查询参数 |
| Brief | 列表项 |
| Detail | 详情 |
| List | 数组包装（对象含 items 字段） |

列表统一用 XxxList，内部字段固定 items。

---

## 6. 跨域引用时的命名

全局名字空间唯一，跨域引用直接写名字：

```yaml
# project.yaml
fundSource: { type: FundSource }   # 引用 global 域的枚举

# tender.yaml
warrantyDepositCustodian: { type: WarrantyDepositCustodian }
```

不需要 global.FundSource 这种前缀——名字全局唯一，直接引用即可。

---

本文档记录命名原则。遇到重名时，先判断该区分还是该删除，再决定。

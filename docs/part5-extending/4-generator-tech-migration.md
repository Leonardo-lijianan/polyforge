# 4. 生成器技术栈迁移

**场景**：生成器选定的底层技术栈要换（如持久层从 JPA 换成 MyBatis-Plus），需要评估、执行、验收。

本章既是**方法论**（任何生成器技术栈迁移通用），也附一个**真实案例**（JPA → MyBatis-Plus）。

## 一、方法论：迁移四步

```mermaid
flowchart LR
  A["1 盘点\n依赖面"] --> B["2 改造\n生成器"]
  B --> C["3 同步\n手写/配置"]
  C --> D["4 验收\n编译+测试+启动"]
```

| 步 | 做什么 | 产出 |
|---|---|---|
| 1 盘点 | 逐个生成器看：谁真正依赖旧栈 | 受影响清单 |
| 2 改造 | 改生成器模板 | 新产物 |
| 3 同步 | 改手写代码、依赖、配置 | 工程可编译 |
| 4 验收 | 编译 / 测试 / 启动 / 端到端 | 全绿 |

**核心原则**：**先盘点，再动手**。生成器通常分层清晰——一栈只影响一两类产物，其余无关。盲目全量重写是浪费。

## 二、盘点清单（通用）

对每个生成器，问三个问题：

1. **它生成的代码里，有没有旧栈的 import / 注解 / 基类？**
2. **这些是核心逻辑，还是边角？**
3. **不换它行不行？**

按依赖深度分三档：

| 档 | 特征 | 处理 |
|---|---|---|
| 重度 | 核心注解/基类来自旧栈 | 必须重写 |
| 轻微 | 仅 import / 注释提及 | 改字符串 |
| 无关 | 完全不碰旧栈 | **不动** |

盘点产出：一张表，标出每个文件的档位。

## 三、通用工作流

### 1. 盘点

逐生成器核实，产出「受影响清单」。示例（本案例结论）：

| 生成器 | 档 | 动作 |
|---|---|---|
| entity | 重度 | 重写注解 |
| repository | 重度 | 重写为 Mapper |
| service | 轻微 | 改 import / 注释 |
| mapper | 无关 | 不动 |
| controller | 无关 | 不动 |
| flyway | 无关 | 不动 |

### 2. 改造生成器

对每个重度文件：
- 换 import
- 换类注解 / 基类
- 换字段注解
- 换生成器里写死的类型映射表

**生成器之间有依赖**（如 repository 引 entity），要一起改，保持编译自洽。

### 3. 同步手写与配置

- `pom.xml` / `package.json`：换依赖
- 运行时配置：换 ORM 配置项
- 手写代码：所有引用旧栈生成物的手写代码
- **命名冲突**：新栈若占用旧概念名，需重命名（见案例）

### 4. 验收

见下一节。

## 四、验收点（通用）

| # | 验收项 | 判定 |
|---|---|---|
| 1 | 生成器单测 | 新产物符合预期（快照/断言） |
| 2 | `gen` 通过 | 无异常，产物数量正确 |
| 3 | 后端编译 | `mvn compile` / `build` 通过 |
| 4 | 应用启动 | 上下文初始化成功 |
| 5 | 数据库迁移 | Flyway 正常执行 |
| 6 | CRUD 冒烟 | 一条插入 + 查询端到端通过 |
| 7 | 前端类型 | `type-check` 不受影响（若涉及） |

**前 3 项是硬门槛**，后 4 项证明运行时可用。

## 五、测试策略（通用）

迁移后的测试分三层：

| 层 | 测什么 | 工具 |
|---|---|---|
| 生成器层 | 产物内容对不对 | vitest 快照 / 字符串断言 |
| 集成层 | 产物能不能编译、跑起来 | Spring 上下文测试 / 编译 |
| 端到端层 | CRUD 真能跑 | 测试容器 + 真实 DB，或 H2 |

**生成器层的测试是迁移的重头戏**——因为迁移的本质是「换模板」，模板对不对，靠快照最直接。

建议在 `polyforge/tests/cases/` 加一个最小模型，`gen` 后断言产物含新栈关键片段（如 `@TableName` 而非 `@Entity`）。

## 六、案例：JPA → MyBatis-Plus

### 背景

原生成器产出 Spring Data JPA。要换成 MyBatis-Plus，原因：

- 目标后端框架（RuoYi 等）默认 MyBatis-Plus
- 原 JPA 产物**未使用关系能力**（字段是裸列 `Long projectId`，非 `@ManyToOne`），迁移无损失
- MyBatis-Plus 在国内生态、招聘、SQL 可控性上更优

### 盘点结果

| 生成器 | 档 | 动作 |
|---|---|---|
| `entity.mjs` | 重度 | JPA 注解 → MyBatis-Plus 注解 |
| `repository.mjs` | 重度 | `JpaRepository` → `BaseMapper` |
| `service.mjs` | 轻微 | 注释「JpaRepository」字样 |
| `mapper.mjs` | 无关 | 视图映射器，与持久层无关 |
| `controller.mjs` | 无关 | — |
| `flyway.mjs` | 无关 | — |

### 具体改动

**A. 依赖**

```xml
<!-- 删 -->
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>

<!-- 加 -->
<dependency>
  <groupId>com.baomidou</groupId>
  <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
  <version>3.5.9</version>
</dependency>
```

**B. 实体注解**

| JPA | MyBatis-Plus |
|---|---|
| `@Entity` | `@TableName("表名")` |
| `@Id` | `@TableId` |
| `@GeneratedValue(IDENTITY)` | `@TableId(type = IdType.AUTO)` |
| `@Column(name=..., nullable=...)` | `@TableField("列名")` |
| `@Enumerated(STRING)` | `@EnumValue` 或实现 `IEnum` |
| `@CreationTimestamp` | `@TableField(fill = FieldFill.INSERT)` |
| `@UpdateTimestamp` | `@TableField(fill = FieldFill.INSERT_UPDATE)` |

**C. 数据访问接口**

```java
// 旧
public interface TenderRepository extends JpaRepository<Tender, Long> {
    Optional<Tender> findByContractNo(String contractNo);
}

// 新
public interface TenderMapper extends BaseMapper<Tender> {
    default Optional<Tender> findByContractNo(String contractNo) {
        return Optional.ofNullable(selectOne(
            new LambdaQueryWrapper<Tender>().eq(Tender::getContractNo, contractNo)));
    }
}
```

**D. 配置**

```properties
# 删
spring.jpa.hibernate.ddl-auto=validate
spring.jpa.show-sql=false
spring.jpa.open-in-view=false

# 加
mybatis-plus.configuration.map-underscore-to-camel-case=true
```

### 命名冲突（重要）✅ 已执行

polyforge 现有 `generated/mapper/` 目录是**视图映射器**（Entity → DTO 转换），与 MyBatis 的 **Mapper（DAO）** 概念**撞名**。

处理：**保留 DAO 用 `mapper`**（MyBatis 惯例），**视图映射器改名 `assembler`**：

```
generated/
  mapper/       # MyBatis DAO（BaseMapper）
  assembler/    # 视图映射器（Entity → DTO）
```

改动点（已落地）：

| 旧 | 新 |
|---|---|
| `generators/java/repository.mjs` | `generators/java/dao-mapper.mjs`（导出 `generateJavaMapper`） |
| `generators/java/mapper.mjs` | `generators/java/view-assembler.mjs`（导出 `generateJavaAssembler`） |

产物路径不变，仅源文件名与导出函数名变化。

### 工作量

| 项 | 估时 | 状态 |
|---|---|---|
| pom 依赖 | 5 min | ✅ |
| `entity.mjs` 重写 | 30 min | ✅ |
| `repository.mjs` → `dao-mapper.mjs` | 40 min | ✅ |
| `mapper.mjs` → `view-assembler.mjs` 改名 | 20 min | ✅ |
| `service.mjs` 改注释 | 5 min | ✅ |
| 配置改 | 10 min | ✅ |
| `basePackage` 生效（迁移时遗漏，后补） | 60 min | ✅ |
| `MetaObjectHandler` 骨架生成（迁移时遗漏，后补） | 30 min | ✅ |
| 生成器 golden-file 烟测（`tests/gen-smoke.mjs`） | 30 min | ✅ |
| 集成测试（CRUD 冒烟） | 1 h | ⏳ 待试水 |
| **合计** | **约 4 h** | |

> 前提：手写 ServiceImpl 目前全是骨架（`throw TODO`），无业务逻辑需迁移；无其他手写代码引用生成物。

### 验收点

| # | 项 | 判定 |
|---|---|---|
| 1 | 生成器单测 | 产物含 `@TableName`、`BaseMapper`，不含 `@Entity`、`JpaRepository` |
| 2 | `polyforge gen` | 产物数量不变（39 entity / 39 mapper / 15 service） |
| 3 | `mvn compile` | 通过 |
| 4 | 应用启动 | 上下文初始化成功 |
| 5 | Flyway | 正常执行 |
| 6 | CRUD 冒烟 | 插入 + 查询一条记录通过 |

## 七、迁移前必答的问题

动手前，确认这几条：

1. **旧栈的关系/高级能力，当前用了吗？**
   - 没用 → 迁移无损失
   - 用了 → 评估新栈是否等价
2. **有没有手写代码依赖旧栈生成物？**
   - 有 → 一并改
   - 没有 → 只改生成器
3. **命名会不会撞？**
   - 会 → 先定重命名方案
4. **数据库层受影响吗？**
   - 只换 ORM → Flyway / SQL 不动
   - 换的是存储引擎 → 另议

## 下一步

第五部分完。回到 [手册首页](../README.md)。

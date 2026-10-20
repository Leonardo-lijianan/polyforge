# PolyForge 手册

> 模型编译器：一份模型定义，生成数据库 / 后端 / 前端代码。

> **状态（2026-10-20）**：本手册已按 1.0.0 代码校对（JPA→MyBatis-Plus 迁移收尾、`basePackage` 生效、`schemaVersion` 必填）。
> 版本策略见 [VERSIONING.md](VERSIONING.md)；本轮改动清单见 `work-notes/2026-10-20-fix-plan.md`。
> 事实以代码为准——`polyforge/index.mjs`、`validate/index.mjs`、`generators/**` 是最终判据。

## 这是什么

PolyForge 从一组 YAML 模型出发，生成数据库迁移、后端代码、前端类型与请求层。它做解析、校验、生成，不碰业务逻辑。

## 两类读者

| 你是 | 阅读顺序 |
|---|---|
| **使用者**——用 polyforge 定义模型、生成代码 | 第一部分·入门 → 第二部分·模型规范 → 第三部分·使用 |
| **维护者**——改 polyforge 本身 | 第四部分·原理 → 第五部分·扩展 |

## 目录

### 第一部分 · 入门
- [1. 它是什么](part1-getting-started/1-what-is-polyforge.md)
- [2. 快速开始](part1-getting-started/2-quickstart.md)
- [3. 核心概念](part1-getting-started/3-core-concepts.md)

### 第二部分 · 模型规范
- [1. 文件组织](part2-model-spec/1-file-organization.md)
- [2. 枚举](part2-model-spec/2-enums.md)
- [3. 实体](part2-model-spec/3-entities.md)
- [4. 视图](part2-model-spec/4-views.md)
- [5. 接口](part2-model-spec/5-apis.md)
- [6. 权限](part2-model-spec/6-permissions.md)
- [7. 字段语法](part2-model-spec/7-field-syntax.md)
- [8. 类型系统](part2-model-spec/8-type-system.md)
- [9. 引用](part2-model-spec/9-references.md)
- [10a. 修饰符适用范围](part2-model-spec/10-modifier-scope.md)（权威矩阵）
- [10b. 模型语义（derived）](part2-model-spec/10-model-semantics.md)

### 第三部分 · 使用
- [1. 配置](part3-usage/1-config.md)
- [2. 命令行](part3-usage/2-cli.md)
- [3. 产物](part3-usage/3-outputs.md)
- [4. 报错](part3-usage/4-errors.md)

### 第四部分 · 原理
- [1. 架构](part4-design/1-architecture.md)
- [2. IR](part4-design/2-ir.md)
- [3. 校验体系](part4-design/3-validation.md)
- [4. 生成器](part4-design/4-generators.md)
- [5. 设计取舍](part4-design/5-design-decisions.md)
- [6. 运行时（形状能生成、行为手写）](part4-design/6-runtime.md)
- [id 引用设计（ref）](part4-design/id-reference.md)

### 第五部分 · 扩展
- [1. 加生成器](part5-extending/1-add-generator.md)
- [2. 加校验](part5-extending/2-add-validation.md)
- [3. 加语法](part5-extending/3-add-syntax.md)
- [4. 生成器技术栈迁移](part5-extending/4-generator-tech-migration.md)（方法论 + JPA→MyBatis-Plus 案例）

### 附录
- [术语表](appendix/glossary.md)
- [归档（历史设计文档）](appendix/archive/)

## 规范

- [版本与兼容性](VERSIONING.md)（**改版本号前必读**）：包版本 `major.minor.hotfix`、配置 `schemaVersion: '1.0'`（major.minor）的判定规则与关联规则
- [基线文件](BASELINES.md)：`schema-snapshot.json` / `db-schema-state.json` 各自的职责、为什么必须入库、`manifest.json` 为何删除

## 约定

本书的写作规范见 [WRITING-GUIDE.md](WRITING-GUIDE.md)：事实以代码为准、示例用中性内容、五类章节各有模板。

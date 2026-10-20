# PolyForge

> 一份模型定义，生成数据库 / 后端 / 前端代码。

PolyForge 从一组 YAML 模型（枚举、实体、视图、API、状态机、权限）出发，生成：

- **数据库**：Flyway 建表 SQL
- **后端**：MyBatis-Plus 实体、DTO、Mapper（BaseMapper）、视图 Assembler、Service 接口、Controller
- **前端**：TS 类型、请求映射（requestMap）

并在生成前做多级校验（结构 / 引用 / 类型 / 环 / 命名 / 路径参数……）。

## 边界

PolyForge 是**元层工具**，与具体业务无关。它**不**定义业务语义、**不**实现业务逻辑、**不**规定业务流程。
判据：换一套业务（挂号 / 仓储），同一工具照样用。

## 快速开始

### 生成的 Java 代码需要哪些依赖

生成的 `generated/**/*.java` 会 import 以下内容，消费方工程必须提供：

| 依赖 / 类 | 来源 | 用途 |
|---|---|---|
| `mybatis-plus-spring-boot3-starter` | Maven 依赖 | `@TableName` / `BaseMapper` / `@TableId` / `IEnum` |
| `lombok` | Maven 依赖 | 实体 `@Data` |
| `spring-boot-starter-security` | Maven 依赖 | `@PreAuthorize`（仅当模型用了 `auth.roles`） |
| `<basePackage>.dtos.ApiResponse<T>` | **消费方手写** | Controller 统一返回包装 |
| `MetaObjectHandler` 实现 | **生成骨架 + 消费方补全** | `@TableField(fill = FieldFill.INSERT/INSERT_UPDATE)` 才能生效；缺失时 `auto: create/update` 字段静默不填充。PolyForge 会在 `handServiceDir/config/GeneratedMetaObjectHandler.java` 生成骨架（首次创建后保护），`createUser/updateUser` 留 TODO 由消费方接入认证上下文 |

> `ApiResponse` 是「runtime 手写」的边界产物，PolyForge 不生成。
> `MetaObjectHandler` 由 PolyForge 生成骨架（时间戳部分可用），用户相关字段留 TODO。

## 使用

```bash
# 校验模型
polyforge check

# 生成代码（全部目标）
polyforge gen

# 只生成某一目标
polyforge gen --target=frontend
polyforge gen --target=backend
polyforge gen --target=db
polyforge gen --target=openapi

# 检测「契约变了但忘记重新 gen」
polyforge gen && git diff --exit-code

# 生成时允许破坏性变更（默认会阻断）
polyforge gen --allow-breaking

# 打印 IR（调试）
polyforge ir
```

## 破坏性变更检测

`polyforge gen` 在生成前会对比当前契约和上一次的 `.polyforge/schema-snapshot.json`。如果检测到破坏性变更，会**阻断生成**并列出差异。

检测范围：

- 删字段 / 删实体 / 删视图 / 删接口 / 删枚举值
- 字段类型变化
- 可空性**双向**变化（`required → nullable` 与 `nullable → required` 都报，因为前者后端要处理 null，后者 DDL / 校验会失败）
- 视图 `kind` 变化（form / brief / detail）
- 接口的 method / path / input / output 变化
- 视图新增必填字段

快照在**生成全部成功之后**才写盘。如果生成中途崩溃，快照保持旧值，下次重跑仍会重新 diff 并阻断——不会出现「崩溃一次，破坏性变更从此静默失效」。

如果你确认这些变更是有意为之，加 `--allow-breaking` 可以强制继续：

```bash
polyforge gen --allow-breaking
```

快照文件 `.polyforge/schema-snapshot.json` **应该提交到 git**，这样团队所有人和 CI 才能共享同一份基线。

## 增量迁移（V901+）

`polyforge gen --target=db` 首次运行时生成 `V900__generated_tables.sql` 基线，并把当前 schema 写入 `.polyforge/db-schema-state.json`。

之后每次运行都对比 state 与当前 IR：

- 无变更 → 跳过
- 有非破坏性变更（加表、加可空列、删 NOT NULL、删普通索引）→ 生成 `V<next>__alter_generated.sql`，不动 V900
- 有破坏性变更（删表、删列、改类型、加 NOT NULL 列、SET NOT NULL、加 UNIQUE 索引）→ **阻断**，除非加 `--allow-breaking`

**`db-schema-state.json` 必须提交到 git**——它是增量迁移的 diff 基线。不提交的话，换台机器重跑会把「已有变更」当「新变更」再生成一次。

**V900 一旦生成不会重写**，这是为了不破坏已执行迁移的 Flyway checksum。

## OpenAPI 导出

```bash
polyforge gen --target=openapi
```

在 config 的 `outputs.openapi` 指定的目录下生成 `openapi.json`（OpenAPI 3.0.3）。可以直接导入 Postman、Swagger UI、Apifox 等工具。

## 生成物清洁性

`gen` 在生成前会**清空全自动目录**（前端 types / requestMap / validators，后端 `generatedDir`）。这样契约删掉一个 view / entity 后，旧生成物不会残留，也不可能有「孤儿文件」——目录每次都是重建的。

**不清空**的目录：

- `db.flyway` —— 增量迁移（V901+）会往同一目录追加，清空会误删已应用的迁移
- `handServiceDir` —— 手写 ServiceImpl 受保护

## 配置

在项目根目录放 `polyforge.config.yaml`，声明模型源与各产物输出位置。`polyforge.config.mjs` 也支持（fallback），但 YAML 优先。

```yaml
# 配置格式版本，必填，必须带引号（major.minor）。规则见 docs/VERSIONING.md
schemaVersion: '1.0'

# 所有相对路径的基准目录（默认：含此文件的目录）
# projectRoot: .

# 契约源：从 git 仓库拉取，clone 到系统临时目录下的共享缓存（跨项目共用）。
#   ref 是 branch → 先探测远程 HEAD，同版本跳过；不同才 fetch
#   ref 是 commit/tag → 不可变，本地有即用
source:
  git: git@github.com:org/we-engine-model.git
  ref: main
  # path: .          # 可选，契约在仓库子目录时指定

# 输出目标。结构与 `polyforge gen --target=<name>` 一一对应。
# 只声明本项目消费的 target（client 只配 frontend，server 只配 backend + db）。
outputs:
  frontend:
    types: src/core/types/generated
    requestMap: src/core/services/api/generated
    validators: src/core/utils/generated
  backend:
    basePackage: com.we.engine.server
    generatedDir: we-engine-server/src/main/java/com/we/engine/server/generated
    handServiceDir: we-engine-server/src/main/java/com/we/engine/server
  db:
    flyway: we-engine-server/src/main/resources/db/migration/generated
  openapi: docs/api/openapi.json
```

### 为什么只支持 git 源

**不留本地路径 fallback**——否则不同消费方可能拉到不同版本的契约，导致生成物不一致。

调试/测试时可以临时用环境变量 `POLYFORGE_SOURCE=<本地目录>` 覆盖（优先级最高，仅供 polyforge 自身测试）。

### 缓存位置

默认放在**系统临时目录**，跨项目共享：`<tmp>/polyforge-cache-<user>/<repo>-<urlhash>-<ref>/`。

契约仓库与具体项目无关，同一台机器上所有消费方（client / server / 其他项目）共用一份 clone。缓存目录名含 URL 短哈希，不同仓库即使同名也不会撞车。

**更新策略——同版本跳过网络传输**：

| ref 类型 | 行为 |
|---|---|
| branch | `ls-remote` 探测远程 HEAD sha，与本地 HEAD 相同则跳过；不同才 `fetch` + `reset --hard` |
| tag / commit | 不可变。本地已有该 commit 对象即用，没有才 `fetch` |

所以第二次及以后的 `gen` 只花一次 `ls-remote` 的往返（几百字节），不传输仓库内容。

`POLYFORGE_CACHE` 可覆盖缓存根目录（例如 CI 里指向持久化目录，避免每次重建都重新 clone）：

```bash
POLYFORGE_CACHE=/var/cache/polyforge polyforge gen
```

注意：branch ref 下多进程并发 `fetch` 可能打架，共享场景建议串行调用（比如一个 rebuild 脚本）。

### 快照位置

破坏性变更的基线（`schema-snapshot.json`）默认也按项目各存一份。

**多消费方时必须共享**——契约只有一份，基线也只该有一份。各存一份会天然分叉：同一份契约在 client 和 server 两边 diff 出不同结果，一侧报破坏性变更、另一侧不报。

```bash
POLYFORGE_SNAPSHOT=<工作区>/.polyforge/schema-snapshot.json polyforge gen
```

快照文件**应该提交到 git**。用共享路径时，它位于消费方仓库之外，需要单独管理版本（或放进契约仓库）。

## 文档

见 [docs/README.md](./docs/README.md)。

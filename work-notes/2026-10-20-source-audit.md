# PolyForge 源码评审（2026-10-20）

> 评审范围：`polyforge/` 下 index/config/source/snapshot/parser/validate/generators/schemas/tests。
> 结论：流水线设计干净，MyBatis-Plus 迁移只完成生成器层，配置层与文档层未跟上。
>
> **修复状态（2026-10-20 晚）**：P0/P1 全部已修，P2 主要项已补。详见 `2026-10-20-fix-plan.md`。
> - P0-1 basePackage 失效 → 已修（所有生成器接收 basePackage）
> - P0-2 README JPA 描述 → 已修
> - P0-9 mapper/assembler 改名 → 已执行（dao-mapper.mjs / view-assembler.mjs）
> - P0-10 config 文档假旋钮 → 已修（F4 生效后回改描述）
> - P0-11 outputs 产物表 → 已修
> - P1-4 依赖未声明 → 已补 README 依赖表 + handler.mjs 生成 MetaObjectHandler 骨架
> - P2-7/12 测试缺口 → 已补 tests/gen-smoke.mjs + alter-basic.yaml fixture
> - 额外修复：basePackage 校验顺序（先校验后清空目录）

## P0 — 真 bug 级

### 1. `basePackage` 配置失效
- 位置：`config.mjs` 读取 `outputs.backend.basePackage`，但 `generators/java/*` 全部硬编码包名。
- 硬编码清单：
  - `entity.mjs`: `com.we.engine.server.generated.enums` / `.entity`
  - `dto.mjs`: `com.we.engine.server.generated.dto`
  - `repository.mjs`: `com.we.engine.server.generated.mapper`
  - `service.mjs`: `...generated.service` + Impl `com.we.engine.server.service`
  - `controller.mjs`: `...generated.controller` + `com.we.engine.server.dtos`
- 修法 A：生成器接收 `basePackage`，所有 PKG_* 由它派生。
- 修法 B（临时）：README 明确写「basePackage 尚未生效，包名固定」。

### 2. README 产物描述仍是 JPA 时代
- 位置：`README.md` 第 7 行「后端：JPA 实体、DTO、Repository、Mapper、Service 接口、Controller」。
- 实际：`repository.mjs` 生成 MyBatis-Plus `BaseMapper`；`mapper.mjs` 生成 Assembler。
- 修法：改为「MyBatis-Plus Entity/Mapper、DTO、Service 接口、Controller、视图 Assembler」。

## P1 — 命名与依赖

### 3. `mapper` / `repository` 职责错位
- `repository.mjs` → `generated/mapper/XxxMapper.java`（MP DAO）
- `mapper.mjs` → `generated/assembler/XxxAssembler.java`（视图映射）
- 文件名与产物名完全对不上；`index.mjs` 的 import 名同样错位。
- 修法：重命名为 `dao-mapper.mjs` / `view-assembler.mjs`，或文件头显式注明产物类型。

### 4. 生成物依赖未声明
生成的 Java 代码依赖：
- `com.baomidou.mybatisplus.annotation.*`（MP）
- `lombok.Data`
- `org.springframework.security.access.prepost.PreAuthorize`
- `com.we.engine.server.dtos.ApiResponse`（不在生成物内）
- `MetaObjectHandler`（`@TableField(fill=...)` 的配套实现，未生成）
- 修法：README「快速开始」补依赖清单；或生成 `MetaObjectHandler` 空实现 + `ApiResponse` 骨架到 `handServiceDir` 同级。

## P1 — 苍穹外卖试水的硬障碍

| 障碍 | PolyForge 当前 | 苍穹外卖 | 后果 |
|---|---|---|---|
| 包名 | `com.we.engine.server.*` 硬编码 | `com.sky.*` | 编译不过 |
| 统一返回 | `ApiResponse<T>` 外部依赖 | `Result<T>` | 缺类 |
| 鉴权 | `@PreAuthorize` + Spring Security | 自定义 JWT 拦截器 + `BaseContext` | 缺依赖 / 语义不符 |
| 公共字段填充 | `@TableField(fill=...)` 无 `MetaObjectHandler` | AOP + `@AutoFill` + ThreadLocal | 填充不生效 |
| 时间类型 | `OffsetDateTime` | `LocalDateTime` | 类型不匹配 |
| Flyway 方言 | PostgreSQL（IDENTITY / timestamptz / varchar[]） | MySQL | DDL 跑不了 |

- 试水策略：先跑 `check` + `gen --target=frontend`（不依赖包名），后端产物手工替换包名后编译，验证「生成骨架的可用比例」。

## P2 — 其他硬编码与覆盖缺口

### 5. 前端 import 别名硬编码
- `requestMap.mjs`: `TYPES_IMPORT = '@core/types/generated'` 不可配。

### 6. OpenAPI 元信息硬编码
- `openapi/index.mjs`: `title: 'We Engine API'`、`servers: [{ url: '/api' }]`。

### 7. 测试覆盖缺口
- `tests/cases` 仅 6 个，全部引用/循环相关。
- 无生成器 golden-file 测试；无「生成后编译」集成测试。
- `alter-diff.mjs` 有，但 `tests/cases` 无对应 fixture。

### 8. DECOUPLING-NOTES 已解耦项未同步到 README
- 已做：`--target`、`projectRoot`、git source、YAML config、`verify --strict`。
- README 未提：`POLYFORGE_SNAPSHOT` 共享基线、`--strict` 的适用边界、`--target` 与 manifest 分段的对应关系。

## 建议动作顺序

1. P0-1 修 `basePackage`（或 README 标注失效）—— 决定试水能否直接落地。
2. P0-2 更新 README 产物描述 —— 最小成本，避免误导。
3. P1-3 重命名 mapper/repository —— 降低后续维护成本。
4. P1-4 补依赖清单 —— 试水前必须知道。
5. 苍穹外卖试水按「frontend first」策略推进，后端产物记录「可直接用 / 需手改 / 生成不了」三类比例。

## P0 — 文档与代码不一致（补充）

### 9. mapper/assembler 改名计划写了但没执行
- 文档声称（`part5-extending/4-generator-tech-migration.md`）：`mapper.mjs` → `assembler.mjs`，类名 `XxxMapper` → `XxxAssembler`。
- 文档声称（`part4-design/4-generators.md`）：生成器列表里 `java/mapper` = BaseMapper，`java/assembler` = 视图映射器。
- 实际代码：
  - `repository.mjs` → 生成 `generated/mapper/XxxMapper.java`（MP DAO）
  - `mapper.mjs` → 生成 `generated/assembler/XxxAssembler.java`（视图映射器）
  - `index.mjs` import：`generateJavaMapper` 来自 `mapper.mjs`（实际生成 Assembler），`generateJavaRepository` 来自 `repository.mjs`（实际生成 Mapper）。
- 结论：产物路径已正确（mapper=DAO，assembler=视图映射），但源文件名和 import 名仍是 JPA 时代错位命名。
- 修法：重命名文件 `repository.mjs` → `dao-mapper.mjs`（或 `mybatis-mapper.mjs`），`mapper.mjs` → `view-assembler.mjs`；同步 `index.mjs` 的 import 名。

### 10. config 文档给了不存在的旋钮
- `docs/part3-usage/1-config.md`：`basePackage` 描述为「生成的 Java 包名前缀」。
- 实际：生成器硬编码 `com.we.engine.server.*`，`basePackage` 未被任何生成器消费。
- 修法：同 P0-1（修代码或改文档，二选一，不能两边都留着）。

### 11. outputs 文档产物表仍是 JPA 时代
- `docs/part3-usage/3-outputs.md`：
  - 写 `generated/repository`（仓库）→ 实际 `generated/mapper`（MP DAO）
  - 写 `generated/mapper`（映射器）→ 实际 `generated/assembler`（视图映射器）
  - 后端产物描述「实体、DTO、Repository、Mapper、Service、Controller」→ 实际无 Repository，Mapper 是 DAO，另有 Assembler
- 修法：按当前代码重写产物表。

### 12. 迁移文档建议的「生成器 golden-file 测试」未落地
- `part5-extending/4-generator-tech-migration.md` 建议：「在 `polyforge/tests/cases/` 加一个最小模型，gen 后断言产物含新栈关键片段（如 `@TableName` 而非 `@Entity`）」。
- 实际：`tests/cases` 只有 6 个引用/循环 case；`run.mjs` 的 `EXPECT` 表只断言错误码，不断言产物内容。
- 修法：加 `tests/gen-smoke.mjs`——跑一次 `gen --target=backend`，断言 `generated/entity/*.java` 含 `@TableName`、不含 `@Entity`；`generated/mapper/*.java` 含 `BaseMapper`。

## 文档-代码一致性总表

| 文档位置 | 声称 | 代码实际 | 等级 |
|---|---|---|---|
| README 第 7 行 | 后端产物含 JPA 实体/Repository | MP 实体/Mapper/Assembler | P0 |
| `part3-usage/1-config.md` | `basePackage` 生效 | 硬编码包名 | P0 |
| `part3-usage/3-outputs.md` | `generated/repository` + `generated/mapper` | `generated/mapper` + `generated/assembler` | P0 |
| `part4-design/4-generators.md` | 生成器名 mapper/assembler | 文件名 repository/mapper | P1 |
| `part5-extending/4-*.md` | 改名已执行 | 未执行 | P1 |
| `part5-extending/4-*.md` | 建议加 golden-file 测试 | 未加 | P2 |

## 关键洞察：basePackage bug 为何隐形

### 13. 配置值与硬编码值恰好相同
- `we-engine-server/polyforge.config.yaml` 配的是 `basePackage: com.we.engine.server`
- 生成器硬编码的也是 `com.we.engine.server.*`
- **两者恰好相等**，所以 bug 从未暴露。一旦有人改 config（比如苍穹外卖试水要 `com.sky`），产物包名不会跟着变——这是典型的「默认值即测试值」陷阱。
- 修法：F4 修完后，加一条 smoke 测试用非默认 basePackage（如 `com.example.test`）跑 gen，断言产物 package 行变了。

### 14. 修正：ApiResponse 不是「缺失」，是「消费方提供」
- 审计 P1-4 说 `com.we.engine.server.dtos.ApiResponse` 不在生成物内，表述为「缺类」不够准确。
- 实际：`we-engine-server/src/main/java/com/we/engine/server/dtos/ApiResponse.java` 存在（587 字节），是消费方手写的支撑类。
- 这印证了 `docs/part4-design/6-runtime.md` 的设计意图：「runtime 手写，契约生成」。
- 但 README 没写清这条契约：**生成物引用了哪些必须由消费方提供的支撑类**。这正是 F6 要补的。
- 需要消费方提供的支撑类清单（从生成器 import 反推）：
  - `dtos.ApiResponse<T>`（controller 用）
  - `MetaObjectHandler` 实现（`@TableField(fill=...)` 用，当前 server 侧是否有待确认）

### 15. 确认：service/ 手写层已被保护
- `we-engine-server/src/main/java/com/we/engine/server/service/` 下有 15 个 `*ServiceImpl.java`，多数有实质内容（`TenderServiceImpl` 33KB、`ProjectServiceImpl` 27KB、`AwardNoticeServiceImpl` 13KB）。
- 说明 `isPureSkeleton` 保护逻辑在真实项目里生效了——这些文件不会被 gen 覆盖。
- 同时意味着：**接口签名若变，这些 Impl 不会自动补方法**，会编译错。这是设计意图（提醒手补），但试水时要预期到。

## 总结：审计完成度

| 维度 | 状态 |
|---|---|
| 代码结构 | ✅ 已通读 index/config/source/snapshot/parser/validate/generators/schemas/tests |
| 文档一致性 | ✅ 已核对 README + docs 五部分关键章节 |
| 真实消费方 | ✅ 已核对 we-engine-server config + 产物结构 + 手写层 |
| 修复计划 | ✅ 见 `2026-10-20-fix-plan.md` |
| 待补 | 前端消费方 `we-engine-client` 未核对（本次范围外） |

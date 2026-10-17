# PolyForge 依附点记录

> 按 `docs/architecture/poly-tooling-blueprint.md` 4.6 节。**只记不修**。
> 判断方法：如果换一个项目，这段代码还成立吗？不成立 = 依附点，记一行。
> 迭代稳定后，这份记录就是开源改造的 task list。

| 日期 | 依附点 | 依附于谁 | 将来怎么解耦 |
|---|---|---|---|
| 2026-10-17 | `polyforge.config.mjs` 的 `outputs.frontend/java/flyway` 字段名暗示了技术栈（Java / Flyway） | 后端技术选型 | 改成 `outputs[targetId]`，每个 target 由生成器自己声明需要哪些 output 字段 |
| 2026-10-17 | 前端生成器硬编码 Element Plus 的 form 结构 | 前端 UI 库 | 抽 adapter：`generators/frontend/adapters/element-plus.mjs`，生成器只输出抽象 form 描述 |
| 2026-10-17 | Java 生成器硬编码 Spring Boot + MyBatis-Plus 的注解与包名 | 后端框架 | 同上，抽 adapter |
| 2026-10-17 | `polyforge/index.mjs` 里 `generateJavaXxx` 的调用顺序写死（entity → dto → repository → mapper → service → controller） | 后端分层约定 | 生成器自注册 + 声明依赖，由调度器排序 |
| 2026-10-17 | `polyforge/tests/cases/` 里的测试用例含微工智联业务字段（tender / employer 等） | 本项目业务 | 拆出 `examples/minimal/`（2 实体 + 1 枚举 + 3 接口，无业务词），业务用例留在本项目 |

---

## 已解耦（做完后从本表移到此处，保留记录）

| 日期 | 依附点 | 解耦方式 |
|---|---|---|
| 2026-10-17 | `gen` 一次写三个目标（前端 + 后端 + db），无法单独跑 | 加 `--target=frontend\|backend\|db\|all`，默认 `all` 保持向后兼容 |
| 2026-10-17 | manifest / verify 用 `process.cwd()` 算相对路径，在子目录跑会错 | `config.mjs` 暴露 `projectRoot`，manifest key 和 verify 路径都相对它算 |
| 2026-10-17 | `DEFAULT_CONFIG.source = 'model'` 默认值隐含"源目录叫 model" | 默认值改为 `null`，缺 source 时抛清晰报错，不再猜名字 |
| 2026-10-17 | 契约源只能靠本地路径，各消费方版本可能不一致 | 改为只支持 git 源（branch pull / commit+tag 缓存），clone 到 `.polyforge/cache/`；本地路径仅保留给 polyforge 自身测试 |
| 2026-10-17 | 配置格式是 `.mjs`（JS 对象），非 JS 项目用不了 | 优先读 `polyforge.config.yaml`，`.mjs` 降为 fallback |
| 2026-10-17 | `polyforge:verify` 里 `git diff --exit-code -- src/core/types/generated src/core/services/api/generated` 路径写死 | 抽 `scripts/verify-generated.mjs`，路径从 config 读，支持 `--target` |

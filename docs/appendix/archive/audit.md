# 编译器工具结构审计

> 对象：`tools/contract-compiler/`（工具本体）。
> 约定：工具本体 = `tools/`；`contract/` 是数据（类比 .c 源文件），不属于工具。

---

## 一、边界（做什么 / 不做什么）

### 做（元层能力，与具体业务无关）
- 解析：读 YAML，建 IR
- 校验：语法、引用、类型、环、命名、必填、路径参数……
- 生成：DB 迁移 / 后端（实体·DTO·Repo·Mapper·Service·Controller）/ 前端（类型·requestMap）

### 不做
- 定义业务语义（什么是招标——用户填）
- 实现业务逻辑（ServiceImpl 手写）
- 规定业务流程（状态机内容用户填，工具只校验合法性）
- 运行时任何东西

**判据**：换一套业务（挂号 / 仓储），同一工具照样用 → 才算工具能力。

---

## 二、分层与阶段边界

```
contract/*.yaml（数据）
   │
   ▼ [1] load            parser/load.mjs             读文件 → {file, rel, doc}[]
   ▼ [2] schema 校验      parser/schema-validator.mjs  AJV 结构校验，按 kind 分发
   ▼ [3] build IR        parser/build-ir.mjs         索引 + 解析引用 + 建图（附带 C1/C5/C6）
   ▼ [4] 语义校验         validate/index.mjs          C3/C4/C7/C9/C10/C12/C13/C15~C29
   ▼ [5] 生成            generators/**               IR → 各端产物
```

**阶段出口**（index.mjs 的 main）：
- schema 错 → exit(1)，不进 IR
- buildIR + validate 合并 errors，非空 → exit(1)，不进 gen
- 即：**schema 全报 / IR+语义 全报**，两者分界退出。

**命令**：`check`（校验）/ `ir`（打印 IR）/ `gen`（校验 + 生成）。gen 隐含先跑 check。

---

## 三、模块职责表

| 文件 | 职责 | 是否被入口引用 |
|---|---|---|
| index.mjs | 编排 5 阶段；三命令 | — |
| parser/load.mjs | 递归扫目录，读 YAML | ✅ |
| parser/schema-validator.mjs | AJV 结构校验 | ✅ |
| parser/build-ir.mjs | 建索引、解析引用、建图 | ✅ |
| validate/index.mjs | 语义校验 | ✅ |
| schemas/contract.schema.json | domain/global 结构 | ✅（被 schema-validator） |
| schemas/permissions.schema.json | permissions 结构 | ✅ |
| generators/frontend/types.mjs | → TS 类型 | ✅ |
| generators/frontend/requestMap.mjs | → requestMaps.ts | ✅ |
| generators/frontend/validators.mjs | 表单校验规则 | ❌ **死代码** |
| generators/java/entity.mjs | 实体 + 枚举 | ✅ |
| generators/java/dto.mjs | 视图 → record | ✅ |
| generators/java/repository.mjs | Spring Data 仓库 | ✅ |
| generators/java/mapper.mjs | 视图映射骨架 | ✅ |
| generators/java/service.mjs | Service 接口 + Impl 骨架 | ✅ |
| generators/java/controller.mjs | @RestController | ✅ |
| generators/java/flyway.mjs | 建表 SQL | ✅ |

---

## 四、校验矩阵

> 编号来自各处注释，**实际分散在 build-ir 与 validate 两处**。

| 编号 | 职责 | 实际所在 | 备注 |
|---|---|---|---|
| C1 | 引用存在（type/of/input/output/from） | build-ir resolveField + api 段 | 注释未标号，代码实为 C1 |
| C2 | 类型匹配 | build-ir resolveField「类型不匹配」分支 | 仅局部 |
| C3 | 单向依赖 | validate | ALLOWED_EDGES |
| C4 | 循环引用 | validate | DFS |
| C5 | 未使用告警 | build-ir | 仅枚举 |
| C6 | 命名冲突 | build-ir dupError | |
| C7 | 跨域循环依赖 | validate | 域级聚合 DFS |
| C8 | ？ | **未找到实现** | 注释提到「C8 已报」，无定义 |
| C9 | 角色值合法（auth.roles） | validate | |
| C10 | 流转角色合法 | validate | |
| C11 | ？ | **未找到** | — |
| C12 | 命名规范 | validate | 含 api（新补） |
| C13 | required 字段存在 | validate | |
| C14 | ？ | **未找到** | — |
| C15 | 数组必须有 of | validate | |
| C16 | 索引字段存在 | validate | |
| C17 | 索引 fields 非空 | validate | |
| C18 | 实体恰一个 id | validate | |
| C19 | auto 必须 datetime | validate | |
| C20 | sensitive 只能 string | validate | |
| C21 | 主键不可 nullable | validate | |
| C22 | of 只能配 array | validate | |
| C23 | validate 预置名合法 | validate | |
| C24 | validateRef 字段存在 | validate | |
| C25 | 接口角色在 permissions 定义 | validate | |
| C26 | 禁 json 类型 | validate | |
| C27 | from 类型兼容 | validate | |
| C28 | 路径参数在 pathParams 声明 | validate | 新补 |
| C29 | query/pathParams 只能标量 | validate | 新补 |

**编号问题**：
- C8/C11/C14 **无实现**（注释残留或规划未落）
- C1/C2/C5/C6 在 build-ir，其余在 validate，**分工只靠注释，无权威表**
- 编号与文件不一一对应，查一个规则要翻两个文件

---

## 五、死代码 / 废弃

| 项 | 证据 | 处置建议 |
|---|---|---|
| generators/frontend/validators.mjs | 入口未引用；读 `contract.schemas` / `x-view` / `x-validate`，与现 DSL（`views` / `validate`）完全不符 | 删除 |
| tests/*.yaml（bad*.yaml） | 反向测试数据；package.json 无对应脚本 | 补测试脚本或归档 |
| index.mjs 注释 | 「生成器待接」已过时 | 更新 |

---

## 六、乱点清单

1. **解析与校验交织**：build-ir 同时做「建索引/解析引用/建图」和「C1/C5/C6 校验」，职责不单一。
2. **校验编号体系不可靠**：跳号（C8/C11/C14 空缺）、跨文件、无权威表。
3. **schema 层 vs 语义层边界模糊**：命名(C12)在语义层，但也能算结构约束；引用存在(C1)在 IR 层，但它也是校验。
4. **生成器接口不统一**：多数 `generate(ir, outRoot)`，service 多一个 `handRoot`；无统一 ctx。加一个产物要改 index。
5. **报错后仍继续构建 IR**：build-ir 遇引用不存在仍返回完整 IR（记 error），validate 再叠加。最终靠 index 判 errors 退出。可接受，但「错误 IR」流经全链，易掩盖问题。
6. **命名**：`contract/`（数据）· `contract-compiler`（工具）· `contract:gen`（脚本）共用一个已被占用、且不达意的词。
7. **测试**：仅有反向测试数据，无自动化断言；`tests/` 无运行入口。
8. **文档散落**：18 个相关文档平铺在 docs/ 根目录，无导航。

---

## 七、命名现状

| 层 | 现名 | 问题 |
|---|---|---|
| 数据目录 | contract/ | 与工具同名，且「契约」不达意 |
| 工具目录 | tools/contract-compiler/ | 同上 |
| npm 脚本 | contract:gen / check / clean / verify | 同上 |
| 概念称呼 | 契约 / DSL / IR | 三个词混用 |

> 命名待定；本文档只记录现状，不预设新名。

---

## 八、结论

工具**能力边界本身清晰**（元层生成，不碰业务），乱的是**表达**：
- 校验编号体系不可靠（跳号、跨文件、无表）
- 解析与校验交织
- 存在死代码
- 命名未落定
- 文档无组织

**这些都是「表达层」问题，不是「能力层」问题。** 无需重写，需重整。

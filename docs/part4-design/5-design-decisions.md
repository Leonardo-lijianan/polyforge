# 5. 设计取舍

本章记录 polyforge 的关键决策——为什么这么做，以及已知的妥协。

## 为什么校验分两层（schema + validate）

结构用 JSON Schema，语义用代码，分开。

| 层 | 擅长 | 不擅长 |
|---|---|---|
| JSON Schema | 结构（字段类型、必填、多键） | 跨定义关系（引用、环） |
| 代码 | 跨定义关系、业务约束 | 结构细节（啰嗦） |

「实体恰一个主键」这类语义，JSON Schema 表达不了，只能用代码。

## 为什么有 IR 这一层

不直接从 YAML 生成，先建 IR。

- 引用解析一次：否则每个生成器都要自己解析 `type: Role`
- 校验集中：校验在 IR 上做，不散落各生成器
- 生成器解耦：生成器只做「IR → 文本」

代价是多一层内存结构。值得。

## 为什么 Service 接口生成、实现手写

接口是模型的直接映射（API 签名），能自动；实现是业务逻辑，模型里没有，必须人写。

保护判据用「出现 return」：

- 纯骨架（全 throw）可安全刷新，同步签名变更
- 一旦有实现，永久保护

代价：启发式判据——纯 void 副作用（无 return）的逻辑会被误判为骨架，概率极低。

## 命名：工具叫 polyforge，源 YAML 叫「模型」

- 工具 = polyforge
- 源 YAML = 模型（Model）

**「模型」和「契约」两个词在实际使用中已自然分工**：

| 词 | 指什么 | 用在哪 |
|---|---|---|
| **模型** | YAML 里写的 entity / view / enum / api 这套**语法结构** | `part2-model-spec`（模型语法手册） |
| **契约** | 前后端共同遵守的**约定**，是模型编译后的语义结果 | 项目级文档（`we-engine-model/README`、`docs/README`、TODO） |

**刻意避开「契约」这个词的尝试没有落地**，原因：

1. `contract.schema.json` 是代码文件名，改名要同步改 `schema-validator.mjs` 和所有引用，收益只是名字好看
2. 「契约」在 contract-first / schema-first 语境里已是通用叫法，刻意避开反而与外部认知脱节
3. 两个词指向的东西确实不同：模型是语法层，契约是语义层

**结论**：两个词并存，不强求统一。`part2-model-spec` 用「模型」，项目级文档用「契约」，各自指向清晰即可。

## 已知问题清单

### 未解决

| 问题 | 说明 | 方向 |
|---|---|---|
| C 编号跳号 | C8/C11/C14 无实现 | 补或删 |
| 校验跨文件 | C1/C2/C5/C6 在 build-ir，其余在 validate | 统一或明确分工 |
| 生成器接线手写 | 加产物要改 index.mjs 多处 | 注册表 |
| schema 文件名带 contract | 与术语不符 | 改名 |
| 生成器接口不统一 | java/service 多一个参数 | 统一签名 |
| **Flyway 固定 V900** | 每次 gen 重写同名迁移文件，内容变则 checksum 变，Flyway 拒绝启动 | **分离初始化脚本 / 按 hash 生成版本号（TODO 2.6）** |
| `fillFrom` 死语法 | schema 有字段，build IR 和生成器都不处理 | 删掉，或实现「服务端自动填充」 |
| `from` 省 type 未实现 | 视图字段仍需显式写 `type: string`，不能从 `from` 推导 | 见 [id-reference.md](./id-reference.md#六已实现--待实现) |
| 视图字段无「来源」校验 | 视图字段既无 `from` 也无 `derived` 时不报错（C34 候选；C33 已被 `api.input` 校验占用） | 见 [6. 运行时](./6-runtime.md) |

### 已解决

| 问题 | 解决方式 |
|---|---|
| ~~api 名无唯一性校验~~ | `build-ir.mjs` 已查重（C6），重名报 `命名冲突: api Xxx` |
| ~~validators.mjs 死代码~~ | 已接入，生成 `formRules.ts`（Element Plus 格式） |
| ~~id 类型不一致~~ | `ref` 已实现（语法 + buildIR + 三端生成 + C4 弱边），见 [id-reference.md](./id-reference.md) |
| ~~无 derived 标记~~ | `derived` 已实现（C32 校验 + 生成器处理），见 [6. 运行时](./6-runtime.md) |
| ~~C31 未落实~~ | C31「修饰符位置合法」已完整实现（覆盖全部 17 个修饰符） |
| ~~`isPureSkeleton` 注释误判~~ | 先剥注释再判 `return`，避免头注释里的 "return" 恒真 |

## 下一步

[第五部分 · 扩展](../part5-extending/1-add-generator.md)

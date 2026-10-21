# CLI 自解释设计：--help / docs / syntax 三套东西

> 来源：`sky-trial-project-feedback/ACTION-PLAN.md` 第 0 节「程序不会自解释」+ 作者拍板。
> 状态：已确认，开始实现。

---

## 1. 边界：三套东西各回答什么

| 命令 | 回答的问题 | 输出形态 | 数据源 |
|---|---|---|---|
| `polyforge --help` | **有哪几个命令** | 命令列表 + 一行说明 | 硬编码（命令不常变） |
| `polyforge docs` | **读完整文档** | md 全文 / 章节 | 扫 `docs/part1~part5/**/*.md` |
| `polyforge syntax` | **某个关键字怎么用** | 结构化速查（位置/取值/示例） | `cli/syntax-index.mjs` 单一数据源 |

递进关系：`--help` 知道有 `docs` 和 `syntax`；`docs` 回答「为什么/完整矩阵」；`syntax` 回答「我现在要写这个字段，合法取值是什么」。

三者互不重叠，各自有独立的数据源和职责。

---

## 2. 目录结构

```
polyforge/
├── index.mjs                  # 变薄：只做参数分发
├── cli/
│   ├── args.mjs               # 参数解析（--help/--version/--verbose/未知命令）
│   ├── help.mjs               # --help + help <cmd> 文本
│   ├── docs-scan.mjs          # 扫 docs/part1~part5，提取 title
│   ├── docs.mjs               # polyforge docs 子命令
│   ├── syntax-index.mjs       # 关键字 → 位置/取值/示例/说明（纯数据，唯一源）
│   ├── syntax.mjs             # polyforge syntax 子命令
│   └── error-format.mjs       # 错误对象 → 可读文本
├── validate/
│   ├── rules.mjs              # C1–C32 定义（不动）
│   ├── error-hints.mjs        # 错误码 → 修法示例（纯数据，引用 syntax-index 的 keyword）
│   └── index.mjs              # 校验（不动）
├── parser/
│   └── schema-validator.mjs   # 改为返回结构化错误对象（不再返回字符串）
├── config.mjs                 # 配置错误分阶段
└── tests/
    └── docs-sync.mjs          # 防漂移：syntax-index ↔ schema，docs ↔ 目录
```

---

## 3. `polyforge --help`

```
polyforge — 模型驱动的全栈代码生成器

用法：polyforge <命令> [选项]

命令
  check       校验模型（默认）
  gen         校验 + 生成代码
  ir          打印 IR 快照
  docs        浏览文档
  syntax      DSL 语法速查
  help        显示帮助（polyforge help <命令> 看详情）
  version     显示版本

选项
  --target=<t>       生成目标：all | frontend | backend | db | openapi
  --allow-breaking   允许破坏性变更
  --verbose          详细错误输出（含堆栈）
  -h, --help         显示帮助
  -v, --version      显示版本

示例
  polyforge check
  polyforge gen --target=backend
  polyforge docs modifier-scope
  polyforge syntax sensitive

更多
  polyforge docs          完整文档列表
  polyforge syntax        关键字速查列表
```

`polyforge help gen` 和 `polyforge gen --help` 等价，输出：

```
polyforge gen — 校验 + 生成代码

用法：polyforge gen [选项]

选项
  --target=<t>       只生成指定目标（默认 all）
                     all | frontend | backend | db | openapi
  --allow-breaking   允许破坏性变更（默认阻断）

流程
  加载 → 结构校验 → 构建 IR → 语义校验 → 生成
  gen 隐含先跑完整 check；模型有错时不生成任何文件。

示例
  polyforge gen
  polyforge gen --target=frontend
  polyforge gen --allow-breaking

更多
  polyforge docs outputs     产物说明
  polyforge docs cli         完整 CLI 参考
```

---

## 4. `polyforge docs`

### 无参数：文档列表（扫 docs/part1~part5）

```
polyforge 文档

入门
  quickstart          安装与第一个模型
  install             安装

模型规范
  file-organization   文件组织
  enums               枚举定义
  entities            实体定义
  views               视图定义
  apis                接口定义
  modifier-scope      修饰符适用范围（权威矩阵）
  field-syntax        字段语法
  type-system         类型系统
  references          引用与 from

使用
  config              配置文件
  cli                 命令行
  outputs             产物说明
  errors              报错速查

原理
  architecture        架构概览
  validation          校验规则（C1–C32）

扩展
  add-generator       写一个新生成器

细粒度主题（来自 syntax-index）
  sensitive           出参打码（mask / hide）
  writeOnly           入参只写（密码）
  derived             服务端装配字段

用法：polyforge docs <topic>
      polyforge docs <topic> --json
```

### `polyforge docs modifier-scope`（文件级）

打印 `docs/part2-model-spec/10-modifier-scope.md` 全文。

### `polyforge docs sensitive`（别名，来自 syntax-index）

```
sensitive — 出参打码

类别   修饰符
位置   仅 brief / detail 视图的字段
取值   mask | hide
类型   必须配 type: string

示例
  views:
    OrderDetail:
      kind: detail
      fields:
        phone:
          type: string
          from: Order.phone
          sensitive: mask

说明
  mask  返回时打码（138****1234）
  hide  返回时省略该字段

相关文档   polyforge docs modifier-scope
```

### `polyforge docs sensitive --json`

```json
{
  "id": "sensitive",
  "title": "出参打码",
  "kind": "anchor",
  "category": "modifier",
  "position": ["output"],
  "values": ["mask", "hide"],
  "typeConstraint": "string",
  "example": "views:\n  OrderDetail:\n    kind: detail\n    fields:\n      phone:\n        type: string\n        from: Order.phone\n        sensitive: mask",
  "notes": "mask 返回时打码；hide 返回时省略",
  "docTopic": "modifier-scope"
}
```

### `polyforge docs unknown`

```
[polyforge] 未知 topic：unknown

运行 polyforge docs 查看完整列表。
```

---

## 5. `polyforge syntax`

### 无参数：关键字全表

```
polyforge DSL 语法速查

顶层
  kind              文件种类：domain | global | permissions
  domain            域名（kind=domain 时必填）

实体
  entities          实体容器
  fields            字段容器（必填）
  table             表名
  indexes           表级索引

视图
  views             视图容器
  kind              form | query | brief | detail
  required          必填字段列表

接口
  api               接口容器
  method            GET | POST | PUT | PATCH | DELETE
  path              路径（必须以 / 开头）
  input             入参视图（必须是 form）
  output            出参视图
  query             URL 查询参数
  pathParams        URL 路径参数
  auth              public | authenticated | { roles }

修饰符
  nullable          entity / form / query / output / apiQuery
  unique            entity
  index             entity
  auto              entity（必须配 datetime）
  ref               entity
  idType            entity / pathParams
  length            entity / form / query
  default           entity / form
  of                entity / form / query / output
  from              output
  sensitive         output（必须配 string）
  writeOnly         form
  validate          form / query / apiQuery / pathParams
  validateRef       form
  derived           output（text | join | relation | permission | compute）

类型
  id  string  text  int  long  number  decimal
  boolean  date  datetime  json  array

用法：polyforge syntax <关键字>
      polyforge syntax <关键字> --json
```

### `polyforge syntax sensitive`

（同上 `polyforge docs sensitive` 的输出，两者共用 `syntax-index.mjs`）

---

## 6. 报错格式化

### 默认（两行）

```
  [error] /domains/order.yaml  views.OrderDetail.fields.phone.sensitive 类型错误（应为 string）
          修法：sensitive: mask  |  polyforge syntax sensitive
```

### `--verbose`

```
  [error] /domains/order.yaml  views.OrderDetail.fields.phone.sensitive 类型错误（应为 string）

          sensitive 只接受 mask | hide，且仅 brief / detail 视图可用。
          你写的是：true（布尔）

          正确写法：
            views:
              OrderDetail:
                kind: detail
                fields:
                  phone:
                    type: string
                    from: Order.phone
                    sensitive: mask

          文档：polyforge docs modifier-scope
          速查：polyforge syntax sensitive
```

### 配置错误（分阶段）

```
[polyforge] 未找到配置文件

  当前目录：C:\Users\me\project
  期望文件：polyforge.config.yaml（或 polyforge.config.mjs）

  最小配置：
    schemaVersion: '1.0'
    source:
      git: git@github.com:org/model.git
      ref: main
    outputs:
      backend:
        basePackage: com.example.app
        generatedDir: src/main/java/com/example/app/generated

  详见：polyforge docs config
```

---

## 7. 数据源设计

### `cli/syntax-index.mjs`（唯一数据源）

```js
export const SYNTAX_INDEX = {
  sensitive: {
    keyword: 'sensitive',
    title: '出参打码',
    category: 'modifier',
    position: ['output'],
    values: ['mask', 'hide'],
    typeConstraint: 'string',
    example: 'views:\n  OrderDetail:\n    ...',
    notes: 'mask 返回时打码；hide 返回时省略',
    docTopic: 'modifier-scope',
  },
  // ... 其余关键字
}
```

- `polyforge syntax <kw>` 直接读这里
- `polyforge docs <kw>` 命中 `SYNTAX_INDEX[kw]` 时，复用同一条记录（只换展示格式）
- `error-hints.mjs` 引用 `keyword` 字段

**加新修饰符时三处同步**：`contract.schema.json` 加字段 → `syntax-index.mjs` 加记录 → `validate/index.mjs` 的 `MOD_SCOPE` 加行。`tests/docs-sync.mjs` 检查一致性。

### `validate/error-hints.mjs`

```js
export const ERROR_HINTS = {
  'schema:sensitive': () => ({
    fix: 'sensitive: mask',
    keyword: 'sensitive',
  }),
  C31: (e) => ({
    fix: `把 ${e.mod} 从当前位置移除，或改用 ${e.allowedLocs.join(' / ')}`,
    keyword: e.mod,
  }),
  'config:no-file': () => ({
    fix: '在项目根目录创建 polyforge.config.yaml，最小示例见 polyforge docs config',
    docTopic: 'config',
  }),
}
```

hint 是函数，接收错误上下文，返回 `{ fix, keyword?, docTopic? }`。`error-format.mjs` 查表、拼文本。

### `cli/docs-scan.mjs`

扫描 `docs/part1~part5/**/*.md`，排除根目录的 `README.md` / `BASELINES.md` / `VERSIONING.md` / `WRITING-GUIDE.md`。

- id 从相对路径派生：`part2-model-spec/10-modifier-scope.md` → `modifier-scope`（去序号前缀）
- title 从文件第一行 `# xxx` 读
- 分组从目录名派生：`part1-getting-started/` → 「入门」

新增 md 文件自动出现在 `polyforge docs` 列表里，不需要改 index。

---

## 8. 防漂移机制

`tests/docs-sync.mjs`（进 `npm test`）检查：

1. `SYNTAX_INDEX` 里每个 keyword 都能在 `contract.schema.json` 的 `FieldDef` / 顶层 `properties` 找到
2. `docs/**/*.md` 每个文件第一行都是 `# ` 开头（否则 `docs-scan` 拿不到 title）
3. `SYNTAX_INDEX[kw].docTopic` 引用的文件都存在
4. `validate/error-hints.mjs` 里引用的 keyword 都在 `SYNTAX_INDEX` 里

任何一项失败，`npm test` 挂掉。**漂移是硬伤，不能靠人记得跑。**

---

## 9. 模块职责表

| 文件 | 职责 | 会碰生成逻辑吗 |
|---|---|---|
| `cli/args.mjs` | 解析 argv → `{cmd, target, verbose, help, version, args}` | 否 |
| `cli/help.mjs` | `--help` / `help <cmd>` 文本 | 否 |
| `cli/docs-scan.mjs` | 扫 docs/，返回 topic 列表 | 否 |
| `cli/docs.mjs` | `docs` 子命令，读 scan + syntax-index | 否 |
| `cli/syntax-index.mjs` | 纯数据 | 否 |
| `cli/syntax.mjs` | `syntax` 子命令 | 否 |
| `cli/error-format.mjs` | 错误对象 → 文本 | 否 |
| `validate/error-hints.mjs` | 纯数据 | 否 |
| `index.mjs` | 分发 + 主流程 | 是（原有） |
| `parser/schema-validator.mjs` | 改为返回结构化错误对象 | 否（解耦） |
| `config.mjs` | 配置错误分阶段 | 否 |

---

## 10. 实现顺序

| 批 | 文件 | 验收 |
|---|---|---|
| 1 | `cli/args.mjs` + `cli/help.mjs` + `cli/syntax-index.mjs` | `polyforge --help` 输出，`polyforge --version` 输出，`polyforge help gen` 输出 |
| 2 | `cli/docs-scan.mjs` + `cli/docs.mjs` + `cli/syntax.mjs` | `polyforge docs` 列全部 md，`polyforge syntax` 列全部关键字，`polyforge docs sensitive` 和 `polyforge syntax sensitive` 输出一致 |
| 3 | `index.mjs` 接入 | `polyforge --help` 不触发 loadConfig；`polyforge docs` 不触发 loadConfig；未知命令报「未知命令」 |
| 4 | `parser/schema-validator.mjs` 改结构化 + `validate/error-hints.mjs` + `cli/error-format.mjs` | `sensitive: true` 报错带「修法」；`--verbose` 展开完整示例 |
| 5 | `config.mjs` 分阶段 + `index.mjs` 错误输出分级 | 空目录、缺 source、source 格式错三种报错不同；默认无堆栈 |
| 6 | `tests/docs-sync.mjs` | `npm test` 检查 4 项 |
| 7 | 生成器 bug（T8–T11） | 一次 `polyforge gen` 回归 |

**批次 1–3 零生成器回归风险**，改完立刻可用。批次 4–5 只改错误输出，也不碰生成。批次 6 是门禁。批次 7 才是生成器 bug。

---

## 11. 验收标准

```powershell
# 批次 1–3 完成后
cd C:\ && polyforge --help           # 输出帮助，exit 0
cd C:\ && polyforge --version        # 输出版本，exit 0
polyforge help gen                    # 输出 gen 帮助
polyforge docs                        # 列出全部 md
polyforge syntax                      # 列出全部关键字
polyforge docs sensitive              # 输出 sensitive 速查
polyforge syntax sensitive            # 同上
polyforge abc                         # 报「未知命令 abc」
polyforge docs unknown                # 报「未知 topic」

# 批次 4–5 完成后
# 在 sky-trial 模型里故意写 sensitive: true
polyforge check                       # 报错带「修法：sensitive: mask」+「polyforge syntax sensitive」
polyforge --verbose check             # 展开完整示例

# 批次 6 完成后
cd polyforge && npm test              # 含 docs-sync 检查
```

---

## 12. 不做（记录原因）

| 事项 | 原因 |
|---|---|
| `--open` 用系统程序打开 md | CLI 唯一正确输出是 stdout；agent 读不了别的程序 |
| `--help` 列 syntax 关键字 | 边界：`--help` 只列命令，关键字交给 `syntax` |
| 硬编码 docs 列表 | 会漂移；扫目录 + 约定，新增 md 自动出现 |
| `polyforge docs <file路径>` 打印绝对路径 | agent 访问不了工作区外；只打内容，路径放 `--json` 的相对路径 |

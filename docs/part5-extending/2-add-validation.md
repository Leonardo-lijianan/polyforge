# 2. 加一条校验

**场景**：你想加一条规则（如「日期字段不能有 default」）。

## 先定位：属于哪层

| 问题性质 | 放哪 |
|---|---|
| 结构（字段类型、必填、多键） | `schemas/contract.schema.json`（JSON Schema） |
| 语义（跨定义、业务约束） | `validate/index.mjs`（代码） |
| 引用解析期就能发现的 | `parser/build-ir.mjs` |

多数新规则是**语义**，放 `validate/index.mjs`。

## 步骤（语义校验）

### 1. 想清楚三件事

- **查什么**：在 IR 的哪个部分上检查
- **何时报错**：错误还是警告
- **怎么表述**：报错信息要让用户能定位

### 2. 写检查代码

在 `validate/index.mjs` 的 `validate()` 里加一段：

```js
// ============ C34：日期字段不能有 default ============
const checkDateDefault = (ownerKind, ownerName, fields) => {
  for (const [fn, fd] of Object.entries(fields)) {
    if (fd.type === 'date' && fd.default !== undefined) {
      errors.push('C34 日期不能设默认值: ' + ownerKind + ' ' + ownerName + '.' + fn)
    }
  }
}
for (const [name, e] of ir.entities) checkDateDefault('实体', name, e.fields)
for (const [name, v] of ir.views) checkDateDefault('视图', name, v.fields)
```

### 3. 占用编号

编号按现有最大值递增（当前到 C33，下一条是 C34）。

> ⚠️ 已知问题：编号有跳号（C8/C11/C14 空），且分散两个文件。
> 新加时，尽量把校验集中在 `validate/index.mjs`。

### 3.1 同步 error-hints

在 `validate/error-hints.mjs` 里为新编号加一条修法提示：

```js
C34: (e) => ({
  fix: '日期字段不能设默认值；需要初值请在前端表单或 Service 里处理',
  keyword: 'default',
  docTopic: 'modifier-scope',
}),
```

`keyword` 必须能在 `cli/syntax-index.mjs` 里找到，`docTopic` 必须是 `docs/` 下存在的 topic。
`npm test` 里的 `docs-sync` 会检查这两点。

### 4. 写测试

在 `polyforge/tests/cases/` 加一个 case，故意触发这条规则：

```yaml
kind: domain
domain: test
entities:
  Foo:
    fields:
      id: { type: id }
      d:  { type: date, default: '2020-01-01' }   # 应触发 C34
```

在 `tests/run.mjs` 的 `EXPECT` 里加 `'xxx.yaml': ['C34']`。

### 5. 更新文档

三处同步：

| 文件 | 加什么 |
|---|---|
| `docs/part4-design/3-validation.md` | 编号表加一行 |
| `validate/rules.mjs` 的 `RULES` | 加 `C34: { level, summary, scope, impl }` |
| `cli/syntax-index.mjs` | 若规则绑定某个关键字，补 `notes` 或在 `error-hints` 里引用 |

`npm test` 里的 `docs-sync` 会检查 `rules.mjs` ↔ `docs/` 的一致性。

## 步骤（结构校验）

若是结构规则，改 `schemas/contract.schema.json`。例：禁止某字段出现。

JSON Schema 的 `additionalProperties: false` 会自动拒绝未声明的键——多数「多了字段」的规则靠它。

> 结构校验**无编号**，报错由 AJV 生成，`schema-validator.mjs` 翻成中文。

## 约束

| 约束 | 原因 |
|---|---|
| 在 IR 上查，不读 YAML | 引用已解析，`resolved.kind` 可用 |
| 报错信息带定位 | 用户要知道「哪个定义的哪个字段」 |
| 编号全局唯一 | 两条规则共用一个编号 = 混乱 |
| 有测试 | 规则是逻辑，必须验证真的触发 |

## 下一步

[3. 加语法](./3-add-syntax.md)

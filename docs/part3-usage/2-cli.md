# 2. 命令行

polyforge 提供三个命令。

```bash
polyforge check   # 只校验，不生成
polyforge gen     # 校验 + 生成
polyforge ir      # 打印 IR（调试用）
```

不传命令时，默认 `check`。

所有命令都支持 `--target=frontend|backend|db|openapi|all`（默认 `all`），限定只处理某一个目标。`check` 和 `ir` 忽略这个参数（校验和 IR 是全量的）。

## check

只跑校验，不写任何文件。用于：

- 提交前检查模型有没有错
- CI 里作为门禁

```bash
polyforge check
```

**输出**：列出加载的文件、各阶段结果、所有错误和警告。

```
[polyforge] 加载模型...
[polyforge] 源目录: /path/to/model
[polyforge] 读取 3 个文件:
  - global/enums.yaml
  - domains/user.yaml
  - permissions.yaml

[polyforge] 结构校验（schema）...
[polyforge] 结构校验通过

[polyforge] 构建 IR...
[polyforge] 枚举 2 / 实体 1 / 视图 3 / 规则 0 / 接口 4

[polyforge] 检查...
[polyforge] 检查通过
```

**有错时**：

```
[polyforge] 检查...
  [error] C18 缺少主键: 实体 User 没有 type:id 字段
  [warn]  未使用: 枚举 Unused
[polyforge] 检查失败：1 个错误，1 个警告
```

**退出码**：有错误 → `1`；无错误 → `0`。CI 靠这个判断。

## gen

`check` 通过后，再生成配置了输出的产物。

```bash
polyforge gen                    # 全部目标
polyforge gen --target=frontend  # 只生成前端
polyforge gen --target=backend   # 只生成后端
polyforge gen --target=db        # 只生成迁移
polyforge gen --target=openapi    # 只生成 OpenAPI 3.0.3 JSON

# 允许破坏性变更（默认阻断）
polyforge gen --allow-breaking
```

只生成某一目标时，**其他目标的文件不会被动**。

### 破坏性变更检测

`gen` 会在生成代码前，对比当前契约与 `.polyforge/schema-snapshot.json`。如果有删字段、改类型、收窄可空性、删接口、改接口签名等破坏性变更，会**中断生成**。

如果确认变更是有意的，加 `--allow-breaking` 参数即可继续并更新快照：

```bash
polyforge gen --allow-breaking
```

**流程**：加载 → 结构校验 → 构建 IR → 语义校验 → 生成。

**关键**：`gen` **隐含先跑完整 check**。模型有错时，`gen` 会停在检查阶段，**不生成任何文件**。这样避免生成出半成品。

输出末尾会列出每个生成器写了什么：

```
[polyforge] 生成前端...
  [frontend/types] 3 个文件 → src/generated/types
  [frontend/requestMap] 1 个文件 → src/generated/api

[polyforge] 生成后端...
  [java/entity] 2 个 enum + 1 个 entity → .../generated
  [java/service] 1 个接口 → ...；骨架 新建 0 / 刷新 0 / 保护 1
  ...
[polyforge] 完成
```

## 检测「契约变了但忘记重新 gen」

没有 `verify` 子命令。用 `gen` + `git diff` 即可：

```bash
polyforge gen && git diff --exit-code
```

契约变了没重新 gen → `gen` 产生新产物 → `git diff` 非空 → 退出码 1。CI 里直接作为门禁用。

也可以写成 npm 脚本（`package.json` 里已有 `gen:check`）：

```json
{
  "scripts": {
    "gen:check": "polyforge gen && git diff --exit-code"
  }
}
```

> 为什么不用内置 `verify` + MD5 清单：`gen` 会清空整个 `generated/` 重建，手改本来就没有持久意义；而「契约变更未同步」用 `git diff` 检测更通用、更直白，不需要 polyforge 专有概念和额外文件。详见 [BASELINES.md](../BASELINES.md)。

## ir

打印编译后的 IR（内存结构），用于调试。

```bash
polyforge ir
```

输出 JSON，包含枚举、实体、视图、接口、依赖边。模型定义很复杂时，用它看 polyforge「理解成了什么」。

## 通过包管理器运行

装好之后（见[快速开始](../part1-getting-started/2-quickstart.md)）：

```bash
npx polyforge check
npx polyforge gen
```

或写进 `package.json` 脚本：

```json
{
  "scripts": {
    "gen": "polyforge gen",
    "check:model": "polyforge check"
  }
}
```

## 环境变量

| 变量 | 作用 |
|---|---|
| `POLYFORGE_SOURCE` | 覆盖配置里的 `source`，指向模型目录 |

主要用于测试和特殊场景。

## 下一步

[3. 产物](./3-outputs.md)

# 1. 配置

polyforge 从项目根目录的 `polyforge.config.yaml` 读取配置（`polyforge.config.mjs` 也支持，作为 fallback）。

## 完整示例

```yaml
# 所有相对路径的基准目录（默认：含此文件的目录）
# projectRoot: .

source:
  git: git@github.com:org/we-engine-model.git
  ref: main

outputs:
  frontend:
    types: src/generated/types
    requestMap: src/generated/api
    validators: src/generated/rules
  backend:
    basePackage: com.example.app
    generatedDir: server/src/main/java/com/example/app/generated
    handServiceDir: server/src/main/java/com/example/app
  db:
    flyway: server/src/main/resources/db/migration/generated
```

## 字段说明

### source

契约源。**只支持 git 形式**——polyforge 会把契约仓库 clone 到 `.polyforge/cache/` 并缓存，然后递归扫描里面的 `.yaml`。

```yaml
source:
  git: git@github.com:org/we-engine-model.git
  ref: main
  # path: .          # 可选，契约在仓库子目录时指定
```

| 字段 | 必填 | 含义 |
|---|---|---|
| `git` | 是 | git 仓库地址（ssh 或 https 均可，取决于本机凭证） |
| `ref` | 否，默认 `main` | branch → 每次 pull；commit/tag → 缓存命中即用（不可变，适合 CI） |
| `path` | 否，默认 `.` | 契约在仓库内的子目录 |

**为什么只支持 git**：本地路径 fallback 会导致不同消费方拉到不同版本的契约，生成物不一致。见下方「环境变量」的测试用例外。

**没有内置默认值**——`source` 是必填项。缺失时报错并提示。

### source 的缓存

```
.polyforge/cache/<repo-name>-<ref>/   # clone 的契约仓库
```

- `ref` 是 branch：每次 gen 前 `git pull --ff-only`
- `ref` 是 commit/tag：命中缓存即用，不更新
- 缓存损坏（比如手动改过）时：删掉对应目录后重跑
- **`.polyforge/` 应加进 `.gitignore`**

### 契约仓库的结构要求

polyforge **递归扫描** source 目录下的所有 `.yaml` / `.yml`。会跳过：

- 以 `.` 开头的目录（`.git`、`.github`、`.gitlab`、`.vscode`）
- `node_modules/`

**但不会跳过** `docker-compose.yml`、`docker-compose.override.yml` 这类在仓库根的 yaml。如果契约仓库里有这类文件，**用 `path` 指向契约子目录**：

```yaml
source:
  git: git@gitee.com:org/we-engine-model.git
  ref: main
  path: contracts        # 只扫仓库里的 contracts/ 子目录
```

### outputs

各产物的输出目录。**每个 target 都是可选的**——不写就不生成对应产物。

结构与 `--target=<name>` 一一对应：

| 键（= target 名） | 产物 | 生成器 |
|---|---|---|
| `frontend` | TS 类型 + 请求映射 + 校验规则 | `frontend/*` |
| `backend` | 后端 Java 代码 | `java/*` |
| `db` | 建表 SQL | `java/flyway` |

### outputs.frontend

| 键 | 产物 |
|---|---|
| `types` | TS 类型 |
| `requestMap` | 请求映射 |
| `validators` | 表单校验规则 |

### outputs.backend

| 键 | 含义 |
|---|---|
| `basePackage` | 生成的 Java 包名前缀 |
| `generatedDir` | 全自动产物目录（每次 gen 重建） |
| `handServiceDir` | 手写实现目录（Service 骨架首次生成后保护） |

### outputs.db

| 键 | 含义 |
|---|---|
| `flyway` | 建表 SQL 的输出目录。polyforge 会写一个 `V900__generated_tables.sql` |

## 只生成一部分

两种方式，语义不同：

**1. 配置里不写某个 target** → 该 target 永久不生成：

```yaml
source:
  git: git@github.com:org/we-engine-model.git
  ref: main
outputs:
  frontend:
    types: src/generated/types
  # backend 和 db 都不配 → 永远不会生成
```

**2. `--target` 临时只跑一个** → 配置可以全配，但本次只生成指定的：

```bash
polyforge gen --target=frontend   # 只跑前端，backend/db 这次跳过
```

两者可以叠加：`--target` 只在**配置里存在该 target**时才生效。

## 路径规则

- 所有路径**相对 `projectRoot`**，默认是运行 polyforge 时的工作目录。多仓库场景可显式配 `projectRoot`。
- 目录不存在时，polyforge 会**自动创建**。
- manifest（`.polyforge/manifest.json`）按 target 分段，每段的 key 相对 `projectRoot`，所以在子目录跑也不会错。
- `gen --target=xxx` 只重写 `xxx` 段，不动其他段。

## 环境变量

| 变量 | 作用 |
|---|---|
| `POLYFORGE_SOURCE` | 覆盖 `source` 指向本地目录，**仅供 polyforge 自身测试用**（优先级最高） |

设置 `POLYFORGE_SOURCE` 后，会跳过 git 逻辑直接扫本地目录。这是唯一绕过 git 源的入口，不要在生产/CI 里使用。

## 下一步

[2. 命令行](./2-cli.md)

# 1. 配置

polyforge 从项目根目录的 `polyforge.config.yaml` 读取配置（`polyforge.config.mjs` 也支持，作为 fallback）。

## 完整示例

```yaml
# 配置格式版本，必填，必须带引号（major.minor）。规则见 docs/VERSIONING.md
schemaVersion: '1.0'

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

### schemaVersion（必填）

配置格式版本，格式为 `major.minor`，**必须带引号**：

```yaml
schemaVersion: '1.0'
```

- 缺失 → 直接报错退出，不生成任何产物
- 格式非法（`1`、`1.0.0`、`v1`）→ 报错
- major 与当前 polyforge 不兼容 → 报错并提示升级
- 兼容判定只看 major：polyforge `1.x.y` 接受 `1.*`

为什么不给默认值：默认值会重蹈 `basePackage` 的覆辙——默认值恰好等于当前唯一取值时，格式漂移永远不会暴露。强制声明让每次配置格式升级都有显式确认点。完整规则见 [VERSIONING.md](../VERSIONING.md)。

> ⚠️ YAML 陷阱：不加引号的 `1.0` 会被解析成数字 `1`。代码对数字 `1` 做了兜底兼容，但**推荐始终带引号**。

### source

契约源。**只支持 git 形式**——polyforge 会把契约仓库 clone 到系统临时目录下的共享缓存（见下节），然后递归扫描里面的 `.yaml`。

```yaml
source:
  git: git@github.com:org/we-engine-model.git
  ref: main
  # path: .          # 可选，契约在仓库子目录时指定
```

| 字段 | 必填 | 含义 |
|---|---|---|
| `git` | 是 | git 仓库地址（ssh 或 https 均可，取决于本机凭证） |
| `ref` | 否，默认 `main` | branch → 探测远程同版本则跳过，否则 fetch；commit/tag → 不可变，本地有即用（适合 CI） |
| `path` | 否，默认 `.` | 契约在仓库内的子目录 |

**为什么只支持 git**：本地路径 fallback 会导致不同消费方拉到不同版本的契约，生成物不一致。见下方「环境变量」的测试用例外。

**没有内置默认值**——`source` 是必填项。缺失时报错并提示。

### source 的缓存

缓存在**系统临时目录**，跨项目共享：

```
<tmp>/polyforge-cache-<user>/<repo-name>-<url-hash>-<ref>/
```

契约仓库与具体项目无关，同一台机器上 client / server / 其他项目共用一份 clone。`url-hash` 保证不同仓库即使同名也不撞车。

**更新策略——同版本跳过网络传输**：

| `ref` 类型 | 行为 |
|---|---|
| branch | `ls-remote` 探测远程 HEAD sha，与本地 HEAD 相同则跳过；不同才 `fetch` + `reset --hard` |
| tag / commit | 不可变。本地已有该 commit 对象即用，没有才 `fetch` |

第二次及以后的 `gen` 只花一次 `ls-remote` 往返，不传仓库内容。

- 缓存损坏（比如手动改过）时：删掉对应目录后重跑
- `POLYFORGE_CACHE` 可覆盖缓存根目录（CI 里指向持久化目录）
- **缓存不入库**：它在系统临时目录，不在任何项目里

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
| `basePackage` | 生成的 Java 包名前缀。实体/DTO/Mapper/Assembler/Service/Controller 的 `package` 行和跨类 import 都由它派生。缺失时 `gen --target=backend` 会报错退出。 |
| `generatedDir` | 全自动产物目录（每次 gen 重建） |
| `handServiceDir` | 手写实现目录（Service 骨架首次生成后保护） |

### outputs.db

| 键 | 含义 |
|---|---|
| `flyway` | 建表 SQL 的输出目录。polyforge 会写一个 `V900__generated_tables.sql` |
| `dialect` | 数据库方言，可选 `postgres`（默认）或 `mysql` |

### outputs.openapi

一个目录字符串（不是对象）。polyforge 会在其下生成 `openapi.json`（OpenAPI 3.0.3 格式）。

```yaml
outputs:
  openapi: docs/api/openapi.json
```

### outputs 的取值形态

| target | 形态 | 例 |
|---|---|---|
| `frontend` | 对象（3 个子路径） | `{ types, requestMap, validators }` |
| `backend` | 对象（3 个子路径） | `{ basePackage, generatedDir, handServiceDir }` |
| `db` | 对象（1 个子路径） | `{ flyway }` |
| `openapi` | **字符串** | `docs/api/openapi.json` |

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

## 冷启动：先写模型，后建仓库

`source` 强制 git 是为了保证各消费方契约一致。但项目刚起步时，模型还没写、仓库也还没建，会陷入「没 source 不能 check，不能 check 就没法验证模型」的循环。

**当前解法**：用 `POLYFORGE_SOURCE` 指向本地模型目录，先跑 `check` / `ir` 验证语法：

```bash
# 模型放在 ./models 下（还没推 git）
POLYFORGE_SOURCE=./models polyforge check
POLYFORGE_SOURCE=./models polyforge ir
```

模型验证通过后，推到 git 仓库，再把 `source` 改成 git 形式，之后 `gen` 走正常流程。

> `POLYFORGE_SOURCE` 是官方测试入口，不是长期方案。它优先级最高、静默覆盖 `source.git/ref`，会破坏契约版本可追溯性。**只用于冷启动和 polyforge 自身测试**。
>
> 规划中：`check` / `ir` 增加 `--source <dir>` 参数，按操作分级——生成前操作接受本地目录、零网络，`gen` / `verify` 才强制 git source。落地后 `POLYFORGE_SOURCE` 可移除。

## 环境变量

| 变量 | 作用 |
|---|---|
| `POLYFORGE_SOURCE` | 覆盖 `source` 指向本地目录，**仅供 polyforge 自身测试用**（优先级最高） |

设置 `POLYFORGE_SOURCE` 后，会跳过 git 逻辑直接扫本地目录。这是唯一绕过 git 源的入口，不要在生产/CI 里使用。

## 下一步

[2. 命令行](./2-cli.md)

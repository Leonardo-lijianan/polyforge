# 2. 快速开始

**目标**：写一个最小模型，生成代码。

**前置**：Node ≥ 18。

## 步骤

### 1. 建契约仓库

契约放在**独立的 git 仓库**里（polyforge 只支持 git 源，不读本地路径——保证各消费方版本一致）。

仓库结构：

```
model-repo/
├── global/
│   └── enums.yaml
└── domains/
    └── user.yaml
```

`global/enums.yaml`：

```yaml
kind: global

enums:
  Role:
    values: [admin, user]
```

`domains/user.yaml`：

```yaml
kind: domain
domain: user

entities:
  User:
    table: users
    fields:
      id:    { type: id, idType: long }
      name:  { type: string, length: 64 }
      role:  { type: Role }
```

> `enums.yaml` 顶层用 `kind: global`（全局共享），域文件用 `kind: domain` + `domain:` 名。详见[文件组织](../part2-model-spec/1-file-organization.md)。

推到 git 仓库（Gitee / GitHub / 自建均可），记下地址。

### 2. 写配置

消费方项目根建 `polyforge.config.yaml`：

```yaml
source:
  git: git@github.com:org/model-repo.git
  ref: main              # branch → 每次 pull；commit/tag → 缓存命中即用
  # path: .              # 可选，契约在仓库子目录时指定

outputs:
  frontend:
    types: src/generated/types
  backend:
    basePackage: com.example.app
    generatedDir: server/src/main/java/com/example/app/generated
    handServiceDir: server/src/main/java/com/example/app
  db:
    flyway: server/src/main/resources/db/migration/generated
```

**只配自己消费的 target**——纯前端项目只写 `frontend`，后端项目写 `backend` + `db`。不写的 target 永远不会生成。

### 3. 生成

```bash
node polyforge/index.mjs gen
```

首次运行会 clone 契约仓库到 `.polyforge/cache/`，之后 `ref` 是 branch 时每次 `pull`。

只想生成前端：

```bash
node polyforge/index.mjs gen --target=frontend
```

## 验证

输出目录出现生成文件：

```
src/generated/types/
  global.ts
  user.ts
  index.ts
```

`.polyforge/manifest.json` 按 target 分段记录 MD5：

```json
{ "frontend": { "src/generated/types/user.ts": "md5..." } }
```

`node polyforge/index.mjs verify --target=frontend` 可校验生成物未被手改。

## 下一步

- 各产物细节：[3. 产物](../part3-usage/3-outputs.md)
- 模型怎么写：[模型规范](../part2-model-spec/1-file-organization.md)
- 为什么只支持 git 源：[1. 配置](../part3-usage/1-config.md#source)

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

> 还没建仓库就想先验证模型语法？用 `POLYFORGE_SOURCE=./models polyforge check` 跑本地校验，验证通过再推 git。详见[配置·冷启动](../part3-usage/1-config.md#冷启动先写模型后建仓库)。

### 2. 写配置

消费方项目根建 `polyforge.config.yaml`：

```yaml
schemaVersion: '1.0'     # 配置格式版本，必填，必须带引号

source:
  git: git@github.com:org/model-repo.git
  ref: main              # branch → 先探测远程，同版本跳过；commit/tag → 不可变
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
polyforge gen
```

首次运行会 clone 契约仓库到**系统临时目录**（`<tmp>/polyforge-cache-<user>/`），跨项目共享。之后 `ref` 是 branch 时先 `ls-remote` 探测，同版本直接复用，不同才 `fetch`。

只想生成前端：

```bash
polyforge gen --target=frontend
```

> 没全局安装？用 `npx polyforge gen`，或 `node polyforge/index.mjs gen`（源码直接跑）。

## 验证

输出目录出现生成文件：

```
src/generated/types/
  global.ts
  user.ts
  index.ts
```

生成物是全自动产物，下次 `gen` 会整体重建。要检测「契约变了但忘记重新 gen」：

```bash
polyforge gen && git diff --exit-code
```

产物有变化 → `git diff` 非空 → 退出码 1，适合作为 CI 门禁。

## 卡住了怎么办

配置报错、模型写错、不清楚某个关键字怎么用：

```bash
polyforge --help              # 命令列表
polyforge help gen            # 某个命令的详细用法
polyforge docs                # 全部文档章节
polyforge docs config         # 配置参考
polyforge syntax sensitive    # 某个关键字的合法取值和示例
```

这四个命令**不需要配置文件、不联网**，任何目录都能跑。

## 下一步

- 各产物细节：[3. 产物](../part3-usage/3-outputs.md)
- 模型怎么写：[模型规范](../part2-model-spec/1-file-organization.md)
- 为什么只支持 git 源：[1. 配置](../part3-usage/1-config.md#source)

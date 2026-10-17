# PolyForge

> 一份模型定义，生成数据库 / 后端 / 前端代码。

PolyForge 从一组 YAML 模型（枚举、实体、视图、API、状态机、权限）出发，生成：

- **数据库**：Flyway 建表 SQL
- **后端**：JPA 实体、DTO、Repository、Mapper、Service 接口、Controller
- **前端**：TS 类型、请求映射（requestMap）

并在生成前做多级校验（结构 / 引用 / 类型 / 环 / 命名 / 路径参数……）。

## 边界

PolyForge 是**元层工具**，与具体业务无关。它**不**定义业务语义、**不**实现业务逻辑、**不**规定业务流程。
判据：换一套业务（挂号 / 仓储），同一工具照样用。

## 使用

```bash
# 校验模型
polyforge check

# 生成代码（全部目标）
polyforge gen

# 只生成某一目标
polyforge gen --target=frontend
polyforge gen --target=backend
polyforge gen --target=db

# 校验生成物 MD5
polyforge verify [--target=...]

# 打印 IR（调试）
polyforge ir
```

## 配置

在项目根目录放 `polyforge.config.yaml`，声明模型源与各产物输出位置。`polyforge.config.mjs` 也支持（fallback），但 YAML 优先。

```yaml
# 所有相对路径的基准目录（默认：含此文件的目录）
# projectRoot: .

# 契约源：从 git 仓库拉取，clone 到 .polyforge/cache/ 并缓存。
#   ref 是 branch → 每次 pull（跟随分支最新）
#   ref 是 commit/tag → 缓存命中即用（不可变，适合 CI）
source:
  git: git@github.com:org/we-engine-model.git
  ref: main
  # path: .          # 可选，契约在仓库子目录时指定

# 输出目标。结构与 `polyforge gen --target=<name>` 一一对应。
# 只声明本项目消费的 target（client 只配 frontend，server 只配 backend + db）。
outputs:
  frontend:
    types: src/core/types/generated
    requestMap: src/core/services/api/generated
    validators: src/core/utils/generated
  backend:
    basePackage: com.we.engine.server
    generatedDir: we-engine-server/src/main/java/com/we/engine/server/generated
    handServiceDir: we-engine-server/src/main/java/com/we/engine/server
  db:
    flyway: we-engine-server/src/main/resources/db/migration/generated
```

### 为什么只支持 git 源

**不留本地路径 fallback**——否则不同消费方可能拉到不同版本的契约，导致生成物不一致。

调试/测试时可以临时用环境变量 `POLYFORGE_SOURCE=<本地目录>` 覆盖（优先级最高，仅供 polyforge 自身测试）。

## 文档

见 [docs/README.md](./docs/README.md)。

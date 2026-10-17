# DSL 设计讨论纪要

> 生成时间: 2026-10-11
> 记录范围: 从「是否自造 DSL」到「声明式/命令式边界」的完整讨论
> 前置: docs/contract-audit.md、docs/java-migration-options.md、docs/plan-a-blueprint.md、docs/contract-spec.md
> 状态: 设计讨论，未定稿

---

## 1. 起点：对 OpenAPI 的质疑

### 1.1 问题

方案 A（契约先行）第一版选了「扩展 OpenAPI」（x- 补足）。实现后产生疑问：**这还算 OpenAPI 吗？**

### 1.2 诊断：伪 OpenAPI

第一版契约用了 9 个自创扩展（x-view / x-entity / x-state / x-permission / x-sensitive / x-validate / x-auto / x-labels / x-fragment）。问题：

- Swagger UI 打开会丢失大量语义（只认标准部分）
- openapi-generator 生成的东西不符合意图（不懂 x-view）
- 结果：挂着 OpenAPI 名字，干着私有 DSL 的事

**结论：这叫「伪 OpenAPI」。两头不讨好。**

---

## 2. OpenAPI 到底值不值得留

### 2.1 用户视角：用 OpenAPI 只有两个原因

1. 有社区支持，生成器/规范经过考验
2. 有 Swagger UI 可可视化

### 2.2 补充：被低估的价值

| # | 价值 | 说明 |
|---|---|---|
| 3 | 契约自身可机器校验 | 写错会报错，自造 DSL 要自己写校验器 |
| 4 | 生态远超「生成器」 | Postman/Bruno/Prism/Mockoon/Kong/Redoc/Pact/42Crunch… |
| 5 | 第三方对接 | 外部系统常要求 OpenAPI |
| 6 | 规范与工具解耦 | 工具自由竞争演进 |

### 2.3 反直觉的一条

**AI agent 在 OpenAPI 上训练得最多。**

- 让 AI 写 OpenAPI 契约 → 准确率高
- 让 AI 写自定义 DSL → 每次重新学，容易错

**结论：AI 时代，标准格式对「让 AI 帮写契约」是升值的，不是贬值的。**

### 2.4 拆解「安全性」

| 说法 | 实际 |
|---|---|
| 库的漏洞审计 | 自造 DSL 依赖库更少，漏洞面可能更小 |
| 规范的健壮性 | 自造 DSL 的边界情况没人替你踩过坑 |

**AI 能弥补「写代码」，弥补不了「真实世界的用例暴露边界」。**

---

## 3. 现有「轮子」调研

### 3.1 结论

这类工具**存在且很多**，不是内部秘密。散落在开源生态里，分三类。

### 3.2 类型一：Schema/DSL 驱动的全栈生成器

| 项目 | 特点 |
|---|---|
| Gai | AI 原生 Go Web 全栈，Schema 驱动，自动推导 API/迁移/校验 |
| BOOM!Scaffold | Schema-first，秒级转 TypeScript 全栈应用 |
| Amana DSL | 声明式全栈 DSL + Rust 编译器，写 .amana 得 Node/Express/SQLite 应用 |
| VertZ | 从 Schema → 数据库 → API → 客户端 → UI 完整路径 |
| 其他 | Apso CLI、RESTForge、@specverse/self、Coders DSL、compose-lang |

### 3.3 类型二：Contract-First 工作流 + AI 增强

| 项目 | 特点 |
|---|---|
| MJGA | Contract First 全栈脚手架，OpenAPI + React + Spring Boot + TS 客户端 |
| Stania | 为 Claude Code 设计的「契约优先」工作流 |
| ContractSpec | 兼容 OpenAPI 的契约驱动 AI 全栈工作流 + TDD 门禁 |
| ai-spec-dev | AI 驱动开发编排，DSL 契约连接前后端 |

### 3.4 类型三：深度扩展 OpenAPI

| 项目 | 特点 |
|---|---|
| ContractSpec | OpenSpec schema bundle，在 OpenAPI 上加跨层契约 |
| ServiceComb Toolkit | Apache 旗下，契约/代码/文档互转 |
| @contractspec/lib.contracts | 一次定义契约，多端一致代码 |
| apic | OpenAPI 3.1 → 生产级 Go 服务器 + 多语言客户端 |

### 3.5 为什么不流行（用户不敢用的原因）

| 原因 | 说明 |
|---|---|
| 维护/活跃度 | 多为个人或实验项目，作者停更即死 |
| 生成代码双刃剑 | 业务复杂时，改生成器比手写更贵 |
| Schema-first 风险 | 未理解业务就定 Schema，修改成本高 |
| 生态锁定 | 一体机式，换回主流栈成本高 |
| 学习成本 | 团队要学新 DSL，投入产出比不确定 |

**空白不是没人做，是「标准化」太难。业务千差万别，最终演变成「每家一套」的私有方案。**

---

## 4. 路线选择

### 4.1 五条路线

| 路线 | OpenAPI 角色 | 适合 |
|---|---|---|
| 1 分层 | 真源（API 层），其余分层独立文件 | 重视生态，接受分层 |
| 2 自造 DSL | 不要 | 纯封闭系统 |
| 3 伪 OpenAPI | 真源（混 x-） | 两头不讨好 |
| 4 TS 真源 | 导出产物 | 前端主导团队 |
| **5 双向** | **导出产物** | **既有表达力又有生态** |

### 4.2 选定：路线 5（双向）

```
自造 DSL（唯一真源，表达力完整）
   ├─→ 生成前端 / Java / Mock
   └─→ 导出一份标准 OpenAPI（只给生态用：Swagger UI、Postman、第三方）
```

**核心：OpenAPI 从「真源」降级为「导出产物」。真源是自定义 DSL。**

### 4.3 用户补充约束

> 「就算是搞一个新的 DSL 也要是**修改友好型**的。」

→ 设计前必须穷举所有变化点（见第 6 节）。

---

## 5. DSL 设计

### 5.1 设计原则

| 原则 | 说明 |
|---|---|
| YAML 语法 | 用现成解析器，不自己写 |
| 概念只定义一次 | 枚举/实体/视图各一处，别处引用 |
| 四层显式分层 | entities / views / rules / api 分开 |
| 引用用简短语法 | 用 `User` / `UserRole`，不用完整 JSON Pointer |

### 5.2 顶层结构

```yaml
domain: auth
enums:        # 枚举
entities:     # L1 实体（生成 Java Entity + 建表）
views:        # L2 视图投影（生成 TS 类型 + Java DTO）
rules:        # L3 规则（校验内联字段，状态机独立）
api:          # L4 接口
permissions:  # L4 权限
```

### 5.3 完整 auth 示例

```yaml
domain: auth
description: 认证域

enums:
  UserRole:
    values: [employer, contractor, supplier, admin]
    labels:
      employer: 甲方
      contractor: 乙方
      supplier: 供应商
      admin: 管理员

  MemberStatus:
    values: [active, pending]
    labels: { active: 已激活, pending: 待激活 }

entities:
  User:
    table: users
    fields:
      id:         { type: id }
      phone:      { type: string, length: 32, unique: true, sensitive: mask }
      password:   { type: string, length: 100, writeOnly: true, note: BCrypt 哈希 }
      email:      { type: string, length: 255, sensitive: mask }
      role:       { type: UserRole }
      isPersonal: { type: boolean }
      status:     { type: string, enum: [pending_party, active] }
      createTime: { type: datetime, auto: create }
      updateTime: { type: datetime, auto: update }

  Member:
    table: members
    fields:
      id:             { type: id }
      userId:         { type: string, index: true, nullable: true }
      organizationId: { type: string, index: true, nullable: true }
      name:           { type: string }
      phone:          { type: string, length: 32 }
      status:         { type: MemberStatus }
      joinedAt:       { type: datetime }

views:
  LoginForm:
    kind: form
    fields:
      phone:    { type: string, validate: phone }
      password: { type: string, validate: { minLength: 6, maxLength: 20 } }
    required: [phone, password]

  AccountForm:
    kind: form
    fields:
      phone:           { type: string, validate: phone }
      password:        { type: string, validate: { minLength: 6, maxLength: 20 } }
      confirmPassword: { type: string, validateRef: password }
      agreeTerms:      { type: boolean }
    required: [phone, password, confirmPassword, agreeTerms]

  LoginData:
    kind: brief
    fields:
      userId:     { type: string }
      realName:   { type: string }
      token:      { type: string }
      role:       { type: UserRole }
      isPersonal: { type: boolean }

  UserBrief:
    kind: brief
    fields:
      userId:     { type: string }
      realName:   { type: string }
      phone:      { type: string, sensitive: mask }
      role:       { type: UserRole }
      isPersonal: { type: boolean }
      isOrgOwner: { type: boolean }

  MemberList:
    kind: brief
    fields:
      items: { type: array, of: Member }

rules:
  ContractStatus:
    values: [draft, pending_sign, employer_pending, contractor_pending, fully_signed, archived, cancelled]
    state:
      initial: draft
      transitions:
        - { from: draft, to: pending_sign, action: generate, by: [employer] }
        - { from: pending_sign, to: contractor_pending, action: sign, by: [contractor] }
        - { from: contractor_pending, to: fully_signed, action: sign, by: [employer] }

api:
  login:
    method: POST
    path: /login
    summary: 用户登录
    auth: public
    input: LoginForm
    output: LoginData
    errors: [VALIDATION_ERROR, AUTHENTICATION_FAILED]

  registerAccount:
    method: POST
    path: /register/account
    summary: 账号注册
    auth: public
    input: AccountForm
    output: UserBrief
    errors: [VALIDATION_ERROR, PHONE_EXISTS]

  getMyInfo:
    method: GET
    path: /members/me
    summary: 获取当前用户信息
    auth: { roles: [employer, contractor, supplier, admin], scope: self }
    output: UserBrief

  listMembers:
    method: GET
    path: /members
    auth: { roles: [employer, contractor], scope: self }
    query:
      teamId: { type: string, optional: true }
    output: MemberList

permissions:
  roles:
    employer:
      - 'Project:*'
      - 'Tender:*'
      - 'Bid:Read'
    contractor:
      - 'Bid:*'
      - 'Tender:Read'
```

**注意：没有 x-、没有 $ref、没有 components/paths 结构，全是业务语言。**

---

## 6. 变化点穷举（修改友好性的依据）

> 设计 DSL 前必须列出「未来可能改什么」。

### 6.1 变化的四个维度

| 维度 | 取值 |
|---|---|
| 影响面 | 前端 / Java / DB / 已有数据 / 生态产物 |
| 性质 | 新增 / 删除 / 重命名 / 语义改变 / 约束改变 |
| 兼容性 | 向后兼容 / 破坏性 / 需数据迁移 |
| 可检测性 | 编译期可查 / 运行时暴露 / 无法检测 |

### 6.2 A. 枚举/常量

| # | 变化 | 本项目实例 |
|---|---|---|
| A1 | 新增枚举值 | UserJob 4→10 |
| A2 | 删除枚举值 | UserRole 删 server |
| A3 | 重命名枚举值 | pending-confirm→pending_confirm |
| A4 | 改标签文案 | 项目负责人→项目总负责人 |
| A5 | 改权限级别 | JOB_PERMISSION_LEVEL 调整 |
| A6 | 改命名风格 | lower_snake vs UPPER_SNAKE |
| A7 | 改分组/分类 | JobCategory 2 类→3 类 |

### 6.3 B. 实体/字段

| # | 变化 | 本项目实例 |
|---|---|---|
| B1 | 新增字段 | employerWarrantyManagerId |
| B2 | 删除字段 | construction_type |
| B3 | 重命名字段 | username→realName |
| B4 | 改字段类型 | warrantyPeriod number→string |
| B5 | 改必填性 | 可选→必填 |
| B6 | 改长度/精度 | phone 20→32 |
| B7 | 改默认值 | pageSize 10→20 |
| B8 | 加唯一/索引 | phone unique |
| B9 | **改语义（类型不变）** | employerName 从公司名变人名（最危险） |
| B10 | 改敏感级别 | 明文→脱敏 |
| B11 | 改存储位置 | JSON 字段→独立列 |
| B12 | 存储→派生 | statusText 从存储变计算 |
| B13 | 新旧字段并存 | projectLeaderId→employerProjectLeaderId |

### 6.4 C. 视图投影

C1 新增投影 / C2 删除投影 / C3 投影增删字段 / C4 字段来源改变 / C5 脱敏规则改变 / C6 继承关系改变

### 6.5 D. 校验规则

D1 新增校验 / D2 改参数 / D3 改文案 / D4 改触发时机 / D5 跨字段引用改变 / D6 条件校验改变

### 6.6 E. 状态机

E1 新增状态 / E2 删除状态 / E3 新增流转 / E4 删除流转 / E5 改 guard / E6 改流转权限 / E7 改初始终止状态

### 6.7 F. 派生/血缘

F1 新增派生字段 / F2 改派生逻辑 / F3 派生依赖改变 / F4 改自动填充来源 / F5 新增血缘

### 6.8 G. 接口/API

G1 新增 / G2 删除 / G3 改路径 / G4 改方法 / G5 改入参 / G6 改出参 / G7 改错误码 / G8 改权限 / **G9 改响应格式** / G10 参数位置改变 / G11 加事务幂等

### 6.9 H. 权限

H1 角色增删 / H2 权限增删 / H3 数据范围改变 / H4 资源增删 / H5 操作增删 / H6 通配符规则改变

### 6.10 I. 跨切面/系统级

I1 响应包装格式 / I2 错误码体系 / I3 鉴权 payload / **I4 数据库方言** / I5 命名约定 / I6 时间格式 / I7 分页约定 / I8 base path

### 6.11 J. 生成物本身

J1 新增生成目标 / J2 改模板 / J3 改输出路径 / J4 生成物-手写物边界调整

### 6.12 K. 元信息

K1 改中文标签 / K2 改描述 / K3 改示例值 / K4 加去废弃标记 / K5 版本号

### 6.13 反推：DSL 必须有的能力

| 能力 | 应对 |
|---|---|
| 枚举独立定义 + 全局引用 | A1~A7 |
| 字段级全元数据 | B1~B13 |
| 投影与实体解耦 | C1~C6 |
| 校验规则可内联可引用 | D1~D6 |
| 状态机独立定义 | E1~E7 |
| 派生/血缘显式声明 | F1~F5 |
| 接口与数据分离 | G1~G11 |
| 权限独立文件 | H1~H6 |
| 系统级约定单独配置 | I1~I8 |
| 生成目标可插拔 | J1~J4 |
| 元信息与语义分离 | K1~K5 |

**最关键三条**：
1. 标签/文案必须与值分离（否则改文案要动数据）
2. 语义改变必须有地方标注（否则工具检测不到）
3. 系统级约定单独配置（否则响应格式/命名规范散落）

---

## 7. 生成物与手写物关系

### 7.1 七种模式

| # | 模式 | 说明 | 适用 |
|---|---|---|---|
| 1 | 纯生成（覆盖） | 每次生成覆盖，禁止手改 | Entity / DTO / 类型 / requestMaps |
| 2 | 生成接口 + 手写实现 | interface/impl 分离 | Service |
| 3 | 生成骨架 + 手写扩展 | 继承 | Repository |
| 4 | 首次生成，之后手写 | 存在即跳过 | Flyway 初始脚本 |
| 5 | 保护区（内容块级） | 标记内生成、标记外手写 | **禁用（事故高发）** |
| 6 | 委托（DI） | 生成物薄，逻辑委托 | Controller |
| 7 | 纯手写 | 生成器只给类型 | Vue 组件 / 业务 service |

### 7.2 本项目对应表

| 产物 | 模式 | 生成物路径 | 手写物路径 |
|---|---|---|---|
| 前端 types | 1 | core/types/generated/ | — |
| 前端 requestMaps | 1 | core/services/api/generated/ | — |
| 前端 formRules | 1 | core/utils/generated/ | — |
| 前端 Vue 组件 | 7 | — | modules/*/views/ |
| 前端业务 service | 7 | — | modules/*/services/ |
| Java Entity | 1 | generated/entity/ | — |
| Java DTO | 1 | generated/dto/ | — |
| Java Controller | 6 | generated/controller/ | — |
| Java Service 接口 | 1 | generated/service/ | — |
| **Java Service 实现** | **2/4** | — | service/impl/ |
| Java Repository | 3 | generated/repository/base/ | repository/ |
| Flyway 初始建表 | 4 | db/migration/generated/V900__ | — |
| Flyway 后续迁移 | 7 | — | db/migration/V901__… |
| Mock CRUD | 1 | mock-server/generated/ | — |
| Mock 业务 | 7 | — | mock-server/impl/ |
| OpenAPI 导出 | 1 | openapi/generated/ | — |

**关键：全部避开模式 5（保护区）。**

### 7.3 硬约束

1. 生成物文件头必须有 `AUTO-GENERATED. DO NOT EDIT.` 标记
2. 生成目录与手写目录物理隔离
3. 每次生成前清空 generated/
4. 手写实现通过接口连接（编译期卡住漂移）
5. Repository 用继承分离
6. Flyway 首次生成 + 后续手写
7. AI 约束：生成目录只读

### 7.4 决策点（待定）

| # | 决策 | 建议 |
|---|---|---|
| 1 | Service 实现首生成骨架还是完全手写？ | 完全手写（或首次生成骨架） |
| 2 | Flyway 初始脚本生成一次还是持续？ | 一次 |
| 3 | 是否允许保护区？ | 禁止 |
| 4 | Repository 自定义方法放哪？ | 继承 Base |
| 5 | 生成物是否提交 git？ | 提交（便于 diff） |

---

## 8. 声明式 vs 命令式（核心边界）

### 8.1 关键澄清

**模式 1（纯生成）不生成实现逻辑。DSL 生成「声明式代码」，不生成「命令式逻辑」。**

### 8.2 分界线

| 类型 | 特征 | 能否生成 | 例子 |
|---|---|---|---|
| 声明式 | 描述「是什么」，无控制流 | 能 | 数据结构、约束、状态流转表、权限矩阵 |
| 命令式 | 描述「怎么做」，有控制流 | 不能 | 算法、条件分支、循环、外部调用 |

### 8.3 本项目实例

**「看起来是逻辑」实为「声明式」的**：

| 东西 | 实际是 | 能生成 |
|---|---|---|
| 状态机 pending→submitted | 流转表 | 是 |
| 校验 phone 正则 | 规则 | 是 |
| 权限 employer:['Tender:*'] | 矩阵 | 是 |
| 派生 budgetText 表达式 | 表达式 | 是（简单） |
| 自动填充 location←profile.address | 映射 | 是 |

**真正的命令式（生成不了）**：

- PDF 生成流程（调外部服务、失败回退、拼 multipart）
- hasProjectPermission 多表查询合并
- 踏勘驳回计数（3 次废标）
- 支付流程（冻结/释放/退款）
- 数据清洗迁移

### 8.4 判别标准（实操用）

> **这段代码删掉后，能否从「数据结构 + 声明规则」重新推导出来？**
> - 能 → 应该生成
> - 不能 → 必须手写

### 8.5 边界模糊地带

| 场景 | 能生成到哪 |
|---|---|
| CRUD | 标准增删改查能生成，特殊查询手写 |
| 状态流转 | 「允许的流转」能生成，「副作用」手写 |
| 权限判断 | 矩阵能生成，「数据范围过滤」手写 SQL |
| 派生字段 | 简单表达式能生成，复杂计算手写 |

**原则：能生成的只是「声明部分」，「执行部分」永远手写。**

### 8.6 反模式警告

> **如果哪天要用 DSL 写业务逻辑了，说明 DSL 设计跑偏——它变成了「用 YAML 写程序」。**

---

## 9. 声明式调用命令式：完整例子

### 9.1 调用链

```
HTTP 请求
  │
  ▼
AuthController.login()        ← 生成（声明式：编排）
  │  调 userService.login()
  ▼
UserService.login()           ← 生成（声明式：接口）
  │  实际执行 ↓
  ▼
UserServiceImpl.login()       ← 手写（命令式：逻辑）
  │  调 userRepository / passwordEncoder / jwtService
  ▼
UserRepository.findByPhone()  ← 生成（声明式：数据访问签名）
  │  实际执行 Spring Data 自动实现
  ▼
返回 LoginData               ← 生成（声明式：数据结构）
```

**「声明式调用命令式」发生在 `UserService`（接口）→ `UserServiceImpl`（实现）这一步。**

### 9.2 逐文件展开

**契约**：
```yaml
api:
  login:
    method: POST
    path: /login
    auth: public
    input: LoginForm
    output: LoginData
```

**AuthController.java（生成·声明式）**：
```java
// AUTO-GENERATED. DO NOT EDIT.
@RestController
@RequiredArgsConstructor
public class AuthController {
    private final UserService userService;

    @PostMapping("/login")
    public ApiResponse<LoginData> login(@RequestBody @Valid LoginForm form) {
        return ApiResponse.ok(userService.login(form));
    }
}
```

**UserService.java（生成·声明式）**：
```java
// AUTO-GENERATED. DO NOT EDIT.
public interface UserService {
    LoginData login(LoginForm form);
}
```

**UserServiceImpl.java（骨架生成 → 之后手写）**：

首次生成的骨架：
```java
// AUTO-GENERATED SKELETON.
// 此文件首次生成后归手写。生成器检测到已存在时不再覆盖。
@Service
public class UserServiceImpl implements UserService {
    @Override
    public LoginData login(LoginForm form) {
        throw new UnsupportedOperationException("TODO: login");
    }
}
```

填充后（此后生成器不再碰）：
```java
@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    @Override
    public LoginData login(LoginForm form) {
        User user = userRepository.findByPhone(form.getPhone())
            .orElseThrow(() -> new BusinessException(401, "AUTHENTICATION_FAILED"));
        if (!passwordEncoder.matches(form.getPassword(), user.getPassword())) {
            throw new BusinessException(401, "AUTHENTICATION_FAILED");
        }
        String token = jwtService.sign(user.getId(), user.getRole());
        return new LoginData(user.getId(), user.getRealName(), token,
                             user.getRole(), user.getIsPersonal());
    }
}
```

**UserRepository.java（生成·声明式）**：
```java
// AUTO-GENERATED. DO NOT EDIT.
public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByPhone(String phone);
}
```

### 9.3 契约变更时的连锁反应

以「契约给 login 加参数」为例：

1. UserService.java（接口）重新生成 → 签名变了
2. UserServiceImpl.java（已存在）不覆盖
3. **实现类没实现新签名 → 编译失败**
4. 开发者看到编译错误 → 手动改实现类

**这就是「编译期卡住漂移」的完整闭环。**

### 9.4 骨架生成的三种做法

| 做法 | 机制 | 优点 | 缺点 |
|---|---|---|---|
| A. 首次生成 | 文件不存在才生成，存在则跳过 | 简单，不留垃圾 | 契约改签名，骨架不自动更新（但接口变会编译失败） |
| B. 生成到 skeleton 目录 | 生成到 impl-skeleton/，人工复制 | 不碰手写文件 | 多一步手工 |
| C. 生成 .skeleton 参考 | 每次生成 .java.skeleton | 能看到最新骨架 | 多一堆文件 |

**推荐 A。**

---

## 10. 载体选型（2026-10-11 追加）

### 10.1 问题

DSL 用什么格式写？YAML 千人千面，TS 运行时乱来——有没有更好的？

### 10.2 候选对比

| 载体 | 严谨性 | 可读性 | IDE 支持 | AI 友好 | 抽象能力 |
|---|---|---|---|---|---|
| YAML | 低 | 高 | 弱 | 中 | 无 |
| JSON | 高 | 低（啰嗦） | 中 | 中 | 无 |
| TOML | 中 | 浅层高 / 深层差 | 中 | 中 | 无 |
| TypeScript | 编译期高，运行时乱 | 中 | 强 | 强 | 强 |
| Cue | 高 | 中 | 中 | 弱 | 中 |
| Jsonnet | 高 | 中 | 弱 | 弱 | 强 |

### 10.3 YAML vs TOML

| 维度 | YAML | TOML |
|---|---|---|
| 结构靠什么 | 缩进 | `[section]` + `key = value` |
| 隐式类型转换 | 严重（NO→false，1.0→float） | 几乎无 |
| 深层嵌套 | 强 | 弱（第 3 层起写 `[a.b.c.d]`） |
| 风格自由度 | 极高 | 低 |

**契约是 5~6 层嵌套（domain→entities→User→fields→phone→type），TOML 会写到砸键盘。**

### 10.4 为什么排除 TypeScript

TS 的严谨只存在于编译期，**运行时仍是 JS**：

- 数组可 `push` 未定义值、可改 `length`
- 对象可加未定义属性
- 类型全擦除

更关键：**契约一旦是 TS，就能写循环、条件、副作用、外部调用**。契约应该是**纯数据**，不是代码。

> 用 TS 做契约 = 允许在「数据的形状」里塞「执行流程」，边界会失控。

### 10.5 为什么排除纯 TOML / 纯 JSON

- TOML：嵌套表达力不足（见 10.3）
- JSON：能嵌套，但手写啰嗦、无注释（JSON5/JSONC 非标准）

### 10.6 选定：YAML + JSON Schema + Prettier + CI 门禁

```
你写 YAML（嵌套舒服、能写注释）
   │  js-yaml 解析（直接得对象）
   ▼
对象（内存）
   │  JSON Schema 校验
   ▼
通过 / 报错（字段级、带路径）
   │  生成 TS 类型
   ▼
给 IDE / 人 / AI 用（类型提示）
```

**严谨性不来自载体，来自「载体 + 校验 + 格式化 + 门禁」四件套：**

| 层 | 手段 | 拦什么 |
|---|---|---|
| 写 | YAML | — |
| 校验 | JSON Schema | 结构错、类型错、约束错 |
| 风格 | Prettier（YAML 插件） | 千人千面 |
| 门禁 | CI 跑 schema check | 提交前拦住 |

**这不是「妥协」，是行业标准做法**：K8s、GitHub Actions、OpenAPI、ESLint 配置、VS Code 设置全是这个组合。

### 10.7 JSON Schema 覆盖边界

| 能覆盖 | 不能覆盖（仍需 x- 扩展） |
|---|---|
| 数据结构、字段类型 | 投影（x-view） |
| 约束（长度/正则/必填/枚举） | 状态机（x-state） |
| 引用（$ref） | 权限（x-permission） |
| | 血缘/派生（x-fill-from / x-derived） |

**与「伪 OpenAPI」的区别**：基础层（数据结构）是**真·JSON Schema 标准**，x- 只补 4 个领域特有概念，而不是 9 个混着数据层的扩展。JSON Schema 工具全都能用。

### 10.8 风格约定（写进规范，防千人千面）

| 场景 | 用哪种 |
|---|---|
| 键值对 ≤2 个且总长 ≤60 字符 | 流风格 `{ type: string }` |
| 其余 | 块风格（逐行） |
| 短枚举 | 流风格 `enum: [a, b, c]` |
| 长对象、嵌套对象 | 必须块风格 |

---

## 11. 待决策清单

### 10.1 生成机制

- Service 实现：完全手写 / 首次生成骨架
- 模板引擎：Handlebars 模板文件 / JS 函数（推荐 JS 函数）

### 10.2 生成物-手写物（见 7.4）

### 10.3 DSL 形态

- 顶层结构是否认可（domain/enums/entities/views/rules/api/permissions）
- 是否有未覆盖的变化点（见 6.13）

### 10.4 待补

- 本纪要尚未覆盖：编译器 IR 详细设计、模板渲染机制细节、CI 门禁具体实现

---

*本纪要记录设计讨论过程，非最终规范。定稿后另行输出 docs/dsl-spec.md。*

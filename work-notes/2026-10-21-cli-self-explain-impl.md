# CLI 自解释：实现完成记录

> 对应设计文档：`2026-10-21-cli-self-explain-design.md`
> 状态：批次 1–6 代码完成，待终端验收。批次 7（生成器 bug）已一并改完。

---

## 1. 新增文件

| 文件 | 字节 | 职责 |
|---|---|---|
| `cli/args.mjs` | 3532 | 参数解析，不碰配置 |
| `cli/help.mjs` | 4219 | `--help` / `help <cmd>` 文本 |
| `cli/syntax-index.mjs` | 14534 | 关键字唯一数据源 |
| `cli/syntax.mjs` | 2968 | `polyforge syntax` 子命令 |
| `cli/docs-scan.mjs` | 3602 | 扫描 `docs/part1~part5` |
| `cli/docs.mjs` | 3829 | `polyforge docs` 子命令 |
| `cli/error-format.mjs` | 2654 | 错误对象 → 可读文本 |
| `validate/error-hints.mjs` | 新增 | 错误码 → 修法示例 |
| `tests/docs-sync.mjs` | 新增 | 防漂移四项检查 |

## 2. 修改文件

| 文件 | 改动 |
|---|---|
| `index.mjs` | 参数解析前置；`--help`/`--version`/`docs`/`syntax`/未知命令在 loadConfig 之前返回；错误输出分级；C 错误走格式化 |
| `config.mjs` | 5 处 `throw new Error` → `configError(subkind, msg)`，分阶段 |
| `parser/schema-validator.mjs` | 返回值从 `string[]` 改为结构化错误对象数组 |
| `package.json` | `files` 加 `cli`；`test` 加 `docs-sync` |
| `generators/java/service.mjs` | P0-6 骨架判定修复；query 类型同步 |
| `generators/java/controller.mjs` | P1-2 query 类型逐字段展开 |
| `generators/java/flyway.mjs` | P0-5 MySQL `AUTO_INCREMENT` 去重 |
| `generators/java/entity.mjs` | P2-4 枚举常量 `toScreamingSnake` |
| `validate/index.mjs` | 新增 C33（`api.input` 必须是 form 视图） |
| `validate/rules.mjs` | 注册 C33 |
| `cli/syntax-index.mjs` | `input` 的 notes 从「P1-7 待修」改为「用 detail/brief 会报 C33」 |

## 3. 批次 7 对应关系

| 原编号 | 任务 | 状态 |
|---|---|---|
| P0-5 | MySQL `AUTO_INCREMENT` 重复 | ✅ flyway.mjs |
| P0-6 | Service 纯骨架未刷新 | ✅ service.mjs `isPureSkeleton` |
| P1-2 | Controller query 丢类型 | ✅ controller.mjs + service.mjs |
| P1-7 | `input` 不校验 kind | ✅ 新增 C33 |
| P2-4 | 枚举常量不分词 | ✅ entity.mjs `toScreamingSnake` |

## 4. 终端验收清单

### 4.1 批次 1–3：CLI 自解释

```powershell
# 在任意目录（有无配置均可）
cd C:\ && polyforge --help           # 输出帮助，exit 0
cd C:\ && polyforge --version        # 输出 @leonardo-lijianan/polyforge 1.0.1，exit 0
polyforge help gen                    # 输出 gen 帮助
polyforge gen --help                  # 同上（等价）
polyforge docs                        # 列出 docs/part1~part5 下全部 md
polyforge syntax                      # 列出全部关键字
polyforge docs modifier-scope         # 输出 md 全文
polyforge docs sensitive              # 输出 sensitive 结构化摘要
polyforge syntax sensitive            # 同上
polyforge abc                         # 报「未知命令 abc」，不碰配置
polyforge docs unknown                # 报「未知 topic」
polyforge syntax unknown              # 报「未知关键字」
```

### 4.2 批次 4–5：错误格式化

```powershell
# 在 sky-trial 模型里故意写 sensitive: true
cd F:\Code\poly-project
polyforge check                       # 应报错带「修法：sensitive 只接受 mask / hide」+「polyforge syntax sensitive」
polyforge --verbose check             # 应展开完整示例

# 空目录测配置分阶段
cd C:\ && mkdir empty-test && cd empty-test
polyforge check                       # 应报「未找到配置文件」+「最小示例」
```

### 4.3 批次 6：防漂移

```powershell
cd F:\Code\poly-project\polyforge
node tests/docs-sync.mjs              # 应输出「N 通过 / 0 失败」
```

### 4.4 批次 7：生成器回归

```powershell
cd F:\Code\poly-project
polyforge check                       # 预期：C33 报错（orderConfirm.input = OrderDetail 是故意埋的探针）
```

**这是预期行为**——你埋的探针现在应该被拦住了。确认后把模型里 `orderConfirm.input` 改成 `OrderForm`，或新建一个 form 视图。

修完模型后：

```powershell
polyforge gen                         # 应成功
# 检查 V900 里 id 行：AUTO_INCREMENT 只出现一次
grep -i auto_increment we-engine-server/src/main/resources/db/migration/generated/V900*.sql
# 检查枚举常量：PENDING_PAYMENT 而非 PENDINGPAYMENT
grep -i 'PENDING' we-engine-server/src/main/java/com/we/engine/server/generated/enums/OrderStatus.java
# 检查 Controller query：逐字段 @RequestParam 而非 Map
grep '@RequestParam' we-engine-server/src/main/java/com/we/engine/server/generated/controller/*.java
```

## 5. 已知遗留

| 项 | 说明 |
|---|---|
| `docs-sync` 检查 4 | 只检查不依赖 ctx 的静态 keyword；C31 等依赖 `e.mod` 的动态 hint 跳过 |
| `syntax-index` 的 `type:xxx` | 与 `FieldDef.type` 的枚举值对应，不单独校验枚举值完整性 |
| `alter.mjs` 的 `column-added` | 复用 `flyway.mjs` 的 `schemaFromIR`，T10 修复自动生效 |
| `docs/` 未同步更新 | 待补：`docs/part3-usage/2-cli.md` 加 `docs` / `syntax` 两节；`4-errors.md` 加「修法」格式说明 |

## 6. 待补文档（下一批）

- `docs/part3-usage/2-cli.md`：补 `polyforge docs` / `polyforge syntax` 用法
- `docs/part3-usage/4-errors.md`：补「修法 + 速查/文档入口」的输出示例
- `docs/part2-model-spec/10-modifier-scope.md`：`sensitive` 补值域 `mask | hide`
- `docs/part3-usage/1-config.md`：冷启动流程（check/ir 接受本地目录）
- `README.md` / npm 页面：从 0.1.0 JPA 时代更新到 1.0.1 MyBatis-Plus

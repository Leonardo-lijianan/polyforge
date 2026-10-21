/**
 * --help / help <cmd> 的文本。
 *
 * 硬编码在这里，不读 docs/。原因：命令不常变，且 --help 必须在任何文件访问之前可用
 * （包括 docs/ 目录不存在时，比如 npm 包裁剪错了也要能跑）。
 */

const MAIN_HELP = `polyforge — 模型驱动的全栈代码生成器

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
`

const COMMAND_HELP = {
  check: `polyforge check — 校验模型（默认命令）

用法：polyforge check

行为
  加载配置 → 读模型 → 结构校验 → 构建 IR → 语义校验。
  不写任何文件。

退出码
  0  无错误（可能有警告）
  1  有错误

示例
  polyforge check

更多
  polyforge docs cli          完整 CLI 参考
  polyforge docs errors       报错速查
`,

  gen: `polyforge gen — 校验 + 生成代码

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
`,

  ir: `polyforge ir — 打印 IR 快照（调试用）

用法：polyforge ir

行为
  跑完整 check，然后把编译后的 IR（枚举/实体/视图/接口/依赖边）
  以 JSON 打印到 stdout。不写文件。

示例
  polyforge ir
  polyforge ir > ir.json

更多
  polyforge docs cli
`,

  docs: `polyforge docs — 浏览文档

用法：polyforge docs [<topic>] [--json]

行为
  无参数       列出全部文档章节
  <topic>      打印该章节全文，或细粒度主题（如 sensitive）的结构化摘要
  --json       输出结构化 JSON（含 sourcePath）

示例
  polyforge docs
  polyforge docs modifier-scope
  polyforge docs sensitive
  polyforge docs sensitive --json

更多
  polyforge docs          自身就是文档入口
`,

  syntax: `polyforge syntax — DSL 语法速查

用法：polyforge syntax [<关键字>] [--json]

行为
  无参数       列出全部关键字（顶层 / 实体 / 视图 / 接口 / 修饰符 / 类型）
  <关键字>     打印该关键字的类别、位置、取值、示例、说明
  --json       输出结构化 JSON

示例
  polyforge syntax
  polyforge syntax sensitive
  polyforge syntax nullable
  polyforge syntax sensitive --json

更多
  polyforge docs modifier-scope     修饰符权威矩阵
  polyforge docs field-syntax       字段语法
`,

  help: `polyforge help — 显示帮助

用法：polyforge help [<命令>]

示例
  polyforge help            显示主帮助
  polyforge help gen        显示 gen 子命令帮助
`,

  version: `polyforge version — 显示版本

用法：polyforge version
  polyforge --version
  polyforge -v
`,
}

/** 主帮助文本 */
export function mainHelp() {
  return MAIN_HELP
}

/** 子命令帮助文本；未知命令返回 null */
export function commandHelp(cmd) {
  return COMMAND_HELP[cmd] || null
}

/** 未知命令的错误文本 */
export function unknownCommand(cmd) {
  return '[polyforge] 未知命令：' + cmd + '\n\n' +
    '可用命令：' + Object.keys(COMMAND_HELP).join(' / ') + '\n' +
    '运行 polyforge --help 查看完整帮助。\n'
}

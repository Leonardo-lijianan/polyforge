/**
 * MetaObjectHandler 骨架生成器
 * IR → 手写目录下的 GeneratedMetaObjectHandler.java（仅首次创建，之后保护）
 *
 * 为什么需要它：
 *   实体生成器会给 auto: create/update 字段加 @TableField(fill = FieldFill.INSERT/INSERT_UPDATE)，
 *   但 MyBatis-Plus 的自动填充依赖一个 MetaObjectHandler Bean。没有它，
 *   这些字段在插入/更新时静默不填充——编译过、跑起来数据不对，是最难排查的一类坑。
 *
 * 放置位置：handServiceDir/config/，与 ServiceImpl 同属手写保护区。
 * 已存在则跳过，不覆盖用户填写的逻辑。
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

function renderHandler(basePackage, dateTimeType) {
  const importStmt = dateTimeType === 'OffsetDateTime' ? 'import java.time.OffsetDateTime;' : 'import java.time.LocalDateTime;'
  return [
    '// 手写实现：纯骨架会被 polyforge 刷新；填入逻辑后即受保护。',
    '// 源：MetaObjectHandler 骨架（配合实体上的 @TableField(fill=...) 使用）',
    'package ' + basePackage + '.config;',
    '',
    'import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;',
    'import org.apache.ibatis.reflection.MetaObject;',
    'import org.springframework.stereotype.Component;',
    importStmt,
    '',
    '/**',
    ' * MyBatis-Plus 公共字段自动填充。',
    ' *',
    ' * 当前骨架只填 createTime / updateTime（时间戳无业务依赖）。',
    ' * createUser / updateUser 必须接入项目的认证上下文（如 BaseContext.getCurrentId()），',
    ' * 因此留 TODO，由开发者按项目实际情况补全。',
    ' */',
    '@Component',
    'public class GeneratedMetaObjectHandler implements MetaObjectHandler {',
    '',
    '    @Override',
    '    public void insertFill(MetaObject metaObject) {',
    '        this.strictInsertFill(metaObject, "createTime", ' + dateTimeType + '.class, ' + dateTimeType + '.now());',
    '        this.strictInsertFill(metaObject, "updateTime", ' + dateTimeType + '.class, ' + dateTimeType + '.now());',
    '        // TODO: 填充 createUser / updateUser（需接入项目认证上下文）',
    '    }',
    '',
    '    @Override',
    '    public void updateFill(MetaObject metaObject) {',
    '        this.strictUpdateFill(metaObject, "updateTime", ' + dateTimeType + '.class, ' + dateTimeType + '.now());',
    '        // TODO: 填充 updateUser',
    '    }',
    '}',
    '',
  ].join('\n')
}

export function generateJavaMetaObjectHandler(ir, handRoot, basePackage, dateTimeType = 'OffsetDateTime') {
  const dir = join(handRoot, 'config')
  const file = join(dir, 'GeneratedMetaObjectHandler.java')
  if (existsSync(file)) {
    console.log('  [java/handler] 已存在，保护跳过 → ' + file)
    return
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, renderHandler(basePackage, dateTimeType), 'utf-8')
  console.log('  [java/handler] MetaObjectHandler 骨架 → ' + file)
}

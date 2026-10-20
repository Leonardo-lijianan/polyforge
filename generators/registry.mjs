import { generateJavaEntity } from './java/entity.mjs'
import { generateJavaDto } from './java/dto.mjs'
import { generateJavaMapper } from './java/dao-mapper.mjs'
import { generateJavaAssembler } from './java/view-assembler.mjs'
import { generateJavaService } from './java/service.mjs'
import { generateJavaController } from './java/controller.mjs'
import { generateJavaMetaObjectHandler } from './java/handler.mjs'

/**
 * 后端生成器执行流水线。
 * 以后要加新生成器（比如专门的 Test 生成器、EventBus 生成器），直接在此数组追加即可，不用改 index.mjs。
 */
export function runBackendGenerators(ir, be) {
  generateJavaEntity(ir, be.generatedDir, be.basePackage, be.dateTimeType)
  generateJavaDto(ir, be.generatedDir, be.basePackage, be.dateTimeType)
  generateJavaMapper(ir, be.generatedDir, be.basePackage)
  generateJavaAssembler(ir, be.generatedDir, be.basePackage, be.dateTimeType)
  generateJavaService(ir, be.generatedDir, be.handServiceDir, be.basePackage)
  generateJavaController(ir, be.generatedDir, be.basePackage)
  generateJavaMetaObjectHandler(ir, be.handServiceDir, be.basePackage, be.dateTimeType)
}

# 术语表

本书用到的术语，按拼音/字母排序。

## A

**API（接口）**：模型中描述一个 HTTP 端点的定义。见[接口](../part2-model-spec/5-apis.md)。

## B

**brief（列表项视图）**：视图的 kind 之一，用于列表页的简要信息。见[视图](../part2-model-spec/4-views.md)。

## C

**C 编号**：语义校验规则的编号（C1 ~ C29）。见[校验体系](../part4-design/3-validation.md)。

**产物（Artifact）**：生成器写出的文件——SQL、Java、TS 等。见[产物](../part3-usage/3-outputs.md)。

## D

**domain（域）**：一个业务范围，对应一个模型文件（`kind: domain`）。见[文件组织](../part2-model-spec/1-file-organization.md)。

**detail（详情视图）**：视图的 kind 之一，用于详情页的完整信息。

## E

**entity（实体）**：模型中描述一张数据库表的单元。见[实体](../part2-model-spec/3-entities.md)。

**enum（枚举）**：一组固定取值的集合。见[枚举](../part2-model-spec/2-enums.md)。

## F

**form（表单视图）**：视图的 kind 之一，用于提交数据。

**from**：视图字段声明的取值来源（`实体.字段`）。见[引用](../part2-model-spec/9-references.md)。

## G

**生成器（Generator）**：把 IR 变成某一种产物的模块。见[生成器](../part4-design/4-generators.md)。

**global**：全局共享定义的文件种类（`kind: global`）。

## I

**IR（中间表示）**：模型编译后的内存结构，生成器的输入。见[IR](../part4-design/2-ir.md)。

## M

**模型（Model）**：你手写的 YAML，系统的形状定义。唯一事实来源。

**模型编译器**：polyforge 本体。

## P

**permissions（权限）**：定义「谁对什么资源做什么操作」的模型文件。见[权限](../part2-model-spec/6-permissions.md)。

**polyforge**：本工具的名字。

## Q

**query（查询视图）**：视图的 kind 之一，用于查询条件。也指 api 的查询参数段。

## R

**ref**：声明字段存某实体的 id，类型从目标主键派生。⚠️ 未实现。见[引用](../part2-model-spec/9-references.md)。

**resolved**：build IR 给字段附加的引用解析结果（含 `kind`）。见[IR](../part4-design/2-ir.md)。

## S

**schema**：JSON Schema，用于结构校验。也泛指「模型的结构」。

**source**：配置里的模型源目录。见[配置](../part3-usage/1-config.md)。

## V

**view（视图）**：模型中描述一组字段的单元，是接口的输入输出形态。见[视图](../part2-model-spec/4-views.md)。

## W

**writeOnly**：字段修饰符，表示只在 form 里出现，响应类视图不生成。

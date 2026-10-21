# 5. 接口

**接口**（api）描述一个 HTTP 端点：方法、路径、鉴权、输入、输出。它是「前端怎么调后端」的声明。

## 在模型中

```yaml
api:
  createOrder:
    method: POST
    path: /orders
    summary: 创建订单
    auth: { roles: [user], scope: self }
    input: CreateOrderForm
    output: OrderDetail
    errors: [VALIDATION_ERROR]
```

## 字段

| 字段 | 必填 | 含义 |
|---|---|---|
| `method` | 是 | `GET` / `POST` / `PUT` / `PATCH` / `DELETE` |
| `path` | 是 | 以 `/` 开头，路径参数写 `:name` |
| `summary` | 否 | 一句话描述 |
| `auth` | 否 | 鉴权（见下） |
| `input` | 否 | 请求体视图，**必须是 `form`**（用 detail/brief 报 C33） |
| `output` | 否 | 响应视图 |
| `query` | 否 | 查询参数（字段定义） |
| `pathParams` | 否 | 路径参数类型声明（见下） |
| `errors` | 否 | 可能抛出的错误码列表 |

## 鉴权 auth

三种写法：

```yaml
auth: public                                # 公开，无需登录
auth: authenticated                         # 需登录，不限角色
auth: { roles: [admin, user], scope: self } # 需指定角色
```

| 写法 | 生成的后端注解 |
|---|---|
| `public` | 无 `@PreAuthorize` |
| `authenticated` | `@PreAuthorize("isAuthenticated()")` |
| `{ roles: [...] }` | `@PreAuthorize("hasAnyRole('ADMIN', 'USER')")` |

`roles` 里的值必须是 `UserRole` 枚举的取值（见 [6. 权限](./6-permissions.md)）。

## 路径参数

路径里的 `:name` 必须在 `pathParams` 里显式声明类型：

```yaml
api:
  getOrder:
    method: GET
    path: /orders/:id
    auth: authenticated
    pathParams:
      id: { type: id, idType: long }
    output: OrderDetail
```

> **为什么必须声明**：路径本身只有 `:id` 这个名字，没有类型信息。
> 不声明类型，生成器无法确定它是数字还是字符串。缺失会报 C28。

## 查询参数 query

GET 的筛选条件写在 `query` 里：

```yaml
api:
  listOrders:
    method: GET
    path: /orders
    auth: authenticated
    query:
      keyword: { type: string, nullable: true }
      page:    { type: int, nullable: true }
    output: OrderList
```

> `query` 和 `pathParams` 只能是**标量**（string / int / long / number / boolean / 日期，或枚举），
> 不能是实体或视图（报 C29）。URL 里放不下对象。

## 生成的产物

以 `createOrder` 为例：

| 端 | 产物 |
|---|---|
| 后端 | `OrderController.java`：`@PostMapping("/orders")` 方法 |
| 后端 | `OrderService.java`：接口方法 `createOrder(...)` |
| 后端 | `OrderServiceImpl.java`：骨架（首次生成，之后保护） |
| 前端 | `requestMaps.ts`：逻辑键 `create-order` → 路径 `/orders` |

## 陷阱

❌ 路径参数没在 `pathParams` 声明

```yaml
path: /orders/:id          # 报错：:id 未声明类型（C28）
```

❌ `pathParams` 声明了路径里没有的参数

```yaml
path: /orders
pathParams:
  id: { type: id }         # 报错：路径里没有 :id（C28）
```

❌ `auth.roles` 里用了不存在的角色

```yaml
auth: { roles: [superuser] }   # 报错：不在 UserRole 枚举里（C9）
```

❌ `input` 用了出参视图

```yaml
input: OrderDetail             # 报错：kind 是 detail 不是 form（C33）
```

> 入参方向只能是 `form`。`detail` / `brief` / `query` 只能作 `output`。

❌ 接口名不是 camelCase

```yaml
CreateOrder:               # 必须 camelCase
  method: POST
```

## 下一步

[6. 权限](./6-permissions.md)

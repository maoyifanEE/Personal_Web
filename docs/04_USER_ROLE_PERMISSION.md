# User Role and Permission Model

## 1. Roles

当前至少有三类角色。

### Visitor

未登录用户，只能访问公开访客网站。

### User

管理员创建的普通账号。登录后只能访问被授权的子应用。

### Admin

管理员账号，可以访问所有功能，可以管理用户、权限和子应用。

## 2. Permission Principle

第一阶段权限只需要做到：

某个用户是否可以访问某个子应用。

后续可以扩展到更细粒度：

- can_view
- can_create
- can_edit
- can_delete
- can_manage

## 3. Important Security Rule

前端隐藏入口不是安全措施。

前端隐藏按钮不是权限系统。

前端不显示某个入口，也不代表用户真的没有访问能力。

所有私人工具中心页面和 API 最终都必须有登录校验和权限校验。

即使别人猜到了登录页或私有路由地址，如果没有账号和权限，也不能访问个人工具中心和私人数据。

## 4. TBD

- 用户注册方式 TBD
- 是否允许用户自己注册 TBD
- 管理员创建账号流程 TBD
- 密码重置方式 TBD
- 权限数据结构 TBD

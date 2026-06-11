# User Role and Permission Model

## 1. Roles

当前统一使用三类角色名称：Visitor、Member、Owner。

### Visitor

- Not logged in.
- Can only access public visitor-facing pages.
- Cannot access private tools.

### Member

- Future normal authorized user created or approved by Owner.
- Can access selected private tools after login.
- Cannot manage the whole site unless explicitly allowed later.

### Owner

- Website owner.
- Full administrative control in the future.
- Can manage private tools, settings, users, and permissions after real auth is implemented.

Older terms such as Admin/User should not be used as role names unless a document explicitly explains that they have been replaced by Owner/Member.

## 2. Permission Principle

第一阶段长期权限目标只需要做到：

某个 Member 是否可以访问某个子应用。

后续可以扩展到更细粒度：

- can_view
- can_create
- can_edit
- can_delete
- can_manage

## 3. Current Static Placeholder Status

当前阶段只有静态占位页：

- `index.html` is the public homepage.
- `login.html` is the login placeholder.
- `hub.html` is the private hub placeholder.

None of them provide real security yet.

## 4. Important Security Rule

前端隐藏入口不是安全措施。

前端隐藏按钮不是权限系统。

前端不显示某个入口，也不代表用户真的没有访问能力。

Hidden entrance is only a visual design element. Hidden entrance is not a security mechanism.

未来安全必须依赖真实认证、授权、服务端检查和路由保护。

所有私人工具中心页面和 API 最终都必须有登录校验和权限校验。

即使别人猜到了登录页或私有路由地址，如果没有账号和权限，也不能访问个人工具中心和私人数据。

## 5. TBD

- Member 创建或批准流程 TBD
- 密码重置方式 TBD
- 权限数据结构 TBD
- Owner 是否能查看 Member 的私人内容 TBD

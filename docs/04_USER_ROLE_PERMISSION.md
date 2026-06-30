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
- Can manage private tools, settings, users, and permissions
  after real auth is implemented.

Older terms such as Admin/User should not be used as role names unless
a document explicitly explains that they have been replaced by Owner/Member.

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

Frontend entrance buttons are not security controls.

Visible homepage entrance buttons are only navigation elements.

Showing or hiding a frontend link does not prove that a user has or lacks permission.

Current static routes can still be opened directly by URL.

Future security must rely on real authentication, authorization, server-side checks, and route protection.

All private tool pages and APIs must eventually require login checks and permission checks.

Even if someone knows a private URL, they must not be able to access private tools or private data without a valid account and permission.
## 5. TBD

- Member 创建或批准流程 TBD
- 密码重置方式 TBD
- 权限数据结构 TBD
- Owner 是否能查看 Member 的私人内容 TBD

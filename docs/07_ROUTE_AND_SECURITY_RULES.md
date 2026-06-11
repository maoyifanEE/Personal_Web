# Route and Security Rules

## 1. Public Routes

公开路由可以被所有人访问，例如：

- /
- /about, TBD
- /works, TBD
- /articles, TBD

## 2. Auth Route

登录路由可以在未登录时访问，但不能暴露私人数据。

- /login

当前静态阶段对应 `login.html`，它只是登录占位页，不实现真实登录、认证或权限控制。

## 3. Private Routes

私有路由必须登录后访问，例如：

- /hub
- /hub/apps
- /hub/settings
- /hub/admin

注意：这些路由只是初步规划，不代表现在要实现。

当前静态阶段对应 `hub.html`，它只是私人工具中心占位页，没有真实登录保护或权限校验能力。

## 4. Current Static Placeholders

- `index.html` 是公开首页。
- `login.html` 是登录占位页。
- `hub.html` 是私人工具中心占位页。
- None of them provide real security yet.

## 5. Hidden Entrance Rule

隐藏入口的作用是：

从公开主页进入登录页。

隐藏入口的作用不是：

- 防止别人访问登录页
- 替代登录系统
- 替代权限系统
- 保护私人数据

隐藏入口只是视觉设计元素，不是安全机制。

未来安全必须依赖真实认证、授权、服务端检查和路由保护。

## 6. Security Principle

长期必须满足：

- 所有私人页面必须登录。
- 所有私人数据必须校验权限。
- Owner 管理功能只能 Owner 访问。
- Member 不能通过手动输入 URL 绕过权限。
- 前端显示和后端权限必须分开考虑。
- 不能只靠隐藏按钮保护数据。

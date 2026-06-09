# Route and Security Rules

## 1. Public Routes

公开路由可以被所有人访问，例如：

- /
- /about, TBD
- /works, TBD
- /articles, TBD

## 2. Private Routes

私有路由必须登录后访问，例如：

- /login
- /hub
- /hub/apps
- /hub/apps/memo
- /hub/apps/diet
- /hub/apps/exercise
- /hub/apps/korean
- /hub/admin/users
- /hub/admin/permissions
- /hub/settings

注意：这些路由只是初步规划，不代表现在要实现。

## 3. Hidden Entrance Rule

隐藏入口的作用是：

从公开主页进入登录页。

隐藏入口的作用不是：

- 防止别人访问登录页
- 替代登录系统
- 替代权限系统
- 保护私人数据

## 4. Security Principle

长期必须满足：

- 所有私人页面必须登录。
- 所有私人数据必须校验权限。
- 管理员功能只能管理员访问。
- 普通用户不能通过手动输入 URL 绕过权限。
- 前端显示和后端权限必须分开考虑。
- 不能只靠隐藏按钮保护数据。

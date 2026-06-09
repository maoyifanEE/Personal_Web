# Information Architecture

## 1. Overall Structure

```text
Domain Root
├─ Public Visitor Site
│  ├─ Home Page
│  ├─ About Page, TBD
│  ├─ Works / Projects Page, TBD
│  ├─ Articles / Notes Page, TBD
│  └─ Hidden Entrance Pattern
│
└─ Private Personal Hub
   ├─ Login Page
   ├─ Hub Dashboard
   ├─ App Modules
   ├─ User Management, admin only
   ├─ Permission Management, admin only
   └─ System Settings, admin only
```

## 2. User Flow

普通访客：

打开网站 -> 看到公开主页 -> 浏览公开内容。

授权用户：

打开网站 -> 点击隐藏入口图案 -> 登录 -> 进入个人工具中心 -> 看到自己有权限的子应用。

管理员：

打开网站 -> 点击隐藏入口图案 -> 登录 -> 进入个人工具中心 -> 管理全部子应用、用户和权限。

## 3. Important Boundary

公开访客网站和私人工具中心是两个不同区域。

它们可以共享整体视觉语言，但在路由、权限、数据访问、代码结构上必须保持边界清晰。

公开访客网站不能直接暴露私人工具中心的数据或功能。私人工具中心不能依赖隐藏入口作为安全保护。

# Information Architecture

## 1. Overall Structure

```text
Domain Root
├─ Public Visitor Site
│  ├─ Home Page
│  ├─ About Page, TBD
│  ├─ Works / Projects Page, TBD
│  ├─ Articles / Notes Page, TBD
│  └─ Visible Visitor / User Entrances
│
└─ Private Personal Hub
   ├─ Login Page, auth route placeholder
   ├─ Hub Dashboard, private route placeholder
   ├─ App Modules
   ├─ Member Management, Owner only
   ├─ Permission Management, Owner only
   └─ System Settings, Owner only
```

## 2. Access Flow

普通访客：

打开网站 -> 看到公开主页 -> 浏览公开内容。

Member：

打开网站 -> 点击用户入口 -> 登录 -> 进入个人工具中心 -> 看到自己有权限的子应用。

Owner：

打开网站 -> 点击用户入口 -> 登录 -> 进入个人工具中心 -> 管理全部子应用、用户和权限。

当前静态阶段：

- `index.html` 是公开首页。
- `login.html` 是登录占位页。
- `hub.html` 是私人工具中心占位页。
- 以上页面都没有真实认证、授权或数据保护能力。

## 3. Important Boundary

公开访客网站和私人工具中心是两个不同区域。

它们可以共享整体视觉语言，但在路由、权限、数据访问、代码结构上必须保持边界清晰。

公开访客网站不能直接暴露私人工具中心的数据或功能。私人工具中心不能依赖首页入口作为安全保护。

首页入口只是视觉导航元素，不是安全机制。未来安全必须依赖真实认证、授权、服务端检查和路由保护。

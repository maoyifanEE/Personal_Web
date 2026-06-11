# Project Overview

## 1. Project Name

Personal_Web。

## 2. Project Purpose

Personal_Web 是一个长期维护的个人网站，不是一次性静态页面。

它同时包含两种长期用途：

- 公开展示：面向普通访客展示个人介绍、作品、文章、项目、联系方式等公开内容；
- 私人工具：面向 Owner 和授权 Member，提供长期扩展的个人工具中心。

当前阶段是纯静态预览，以确认设计方向、边界和文档体系为主，不实现后端、数据库、真实登录或真实权限系统。

## 3. Two Main Areas

- Public Visitor Site
- Private Personal Hub

Public Visitor Site 是访客默认看到的公开网站。

Private Personal Hub 是登录后使用的个人工具中心。

这两个区域可以共享整体视觉语言，但访问边界、权限边界、数据边界和代码边界必须清晰。

当前静态占位页为：

- `index.html`：公开首页。
- `login.html`：登录占位页。
- `hub.html`：私人工具中心占位页。

这些页面都不提供真实安全能力。

## 4. Current Confirmed Direction

- 域名首页默认进入公开访客网站。
- 公开主页上存在一个隐藏图案入口。
- 点击隐藏图案进入登录页。
- 未来完成真实认证后，登录成功才可以进入个人工具中心。
- Owner 未来可以创建或批准 Member。
- Owner 未来可以给不同 Member 分配权限。
- 个人工具中心会长期扩展多个子应用。
- 设计文档会持续调整和完善。
- 代码必须跟随文档，而不是随意发挥。

## 5. TBD

- 公开网站具体展示内容 TBD。
- 网站最终视觉主题 TBD。
- 子应用最终清单 TBD。
- 后端技术栈 TBD。
- 数据库方案 TBD。
- 部署方案 TBD。

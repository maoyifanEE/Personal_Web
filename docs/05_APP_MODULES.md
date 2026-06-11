# App Modules

## 1. Module Principle

每个子应用必须模块化，不应该和主页、登录页、其他子应用混在一起。

每个子应用应该有自己的：

- 页面
- 路由
- 数据
- 权限配置
- 测试
- 文档说明

当前静态阶段不实现任何子应用。`hub.html` 只作为 Personal Hub 占位页，不包含 todo、memo、admin panel、database UI、settings UI 或 dashboard 逻辑。

## 2. Initial App Ideas

| App Name | Purpose | Status | Permission Required | Notes |
| --- | --- | --- | --- | --- |
| Memo | 备忘录/待办事项 | Planned | Yes | 具体功能后续确定 |
| Diet Tracker | 饮食打卡 | Planned | Yes | 具体功能后续确定 |
| Exercise Tracker | 运动打卡 | Planned | Yes | 具体功能后续确定 |
| Korean Learning | 韩语学习 | Planned | Yes | 具体功能后续确定 |
| Project Manager | 项目管理 | Planned | Yes | 具体功能后续确定 |

## 3. Future Module Rule

以后新增子应用时，必须先更新本文件，再写代码。

新增子应用至少要补充：

- 应用名称
- 应用用途
- 是否公开
- 是否需要登录
- 谁能访问
- 当前开发状态
- 数据是否需要长期保存

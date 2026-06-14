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

当前静态阶段允许建立静态页面或本地前端原型。
`hub.html` 作为 Personal Hub 入口页，
不得暗示已经具备真实登录、权限保护、数据库或后端能力。

## 2. Initial App Ideas

| App Name | Purpose | Status | Permission Required | Notes |
| --- | --- | --- | --- | --- |
| 任务清单 | 待办事项、日期任务、清单、标签、优先级和基础月历视图 | V1 local front-end prototype | Future Yes | 当前使用 localStorage 保存单设备数据 |
| Health Management | 健康饮食、运动打卡、放纵警告 | Local front-end prototype | Future Yes | 当前使用 localStorage 保存单设备数据 |
| Exercise Tracker | 运动打卡 | Planned | Yes | 具体功能后续确定 |
| Korean Learning | 韩语学习 | Planned | Yes | 具体功能后续确定 |
| Project Manager | 项目管理 | Planned | Yes | 具体功能后续确定 |

## 3. 任务清单 V1

当前任务清单页面位于：

```text
apps/tasks/index.html
```

当前状态：

- 已从空白占位升级为本机前端原型。
- 包含任务视图和日历月视图。
- 任务视图和日历视图共用同一批 `tasks[]` 数据。
- 支持智能清单：今天、最近7天、收集箱。
- 支持用户清单、标签、优先级、到期日期、到期时间。
- 支持基础子任务、已完成任务、垃圾桶。
- 使用 `localStorage` 保存单设备本地数据。
- 提醒和重复只保存元数据，不触发真实提醒，也不生成未来重复任务。

明确不包含：

- 后端
- 数据库
- 账号登录
- 云同步
- 协作
- 真实通知
- 外部日历订阅
- 番茄钟
- 习惯打卡
- 四象限
- 看板
- 时间线
- 倒数日
- 高级重复任务引擎

相关文件：

- `apps/tasks/index.html`
- `apps/tasks/tasks.css`
- `apps/tasks/tasks.js`

## 4. Health Management V1

当前健康管理页面位于：

```text
apps/health/index.html
```

当前状态：

- 已从静态占位升级为本机前端原型。
- 包含健康饮食、运动打卡、放纵警告三个模块。
- 健康饮食和运动打卡使用周期完成逻辑，不是每日清单。
- 支持同系列卡片，例如水果补充任选一个选项即可完成同一周期。
- 支持 OR 关系同系列父卡片，例如球类运动包含篮球、足球、羽毛球，完成任意一项即可完成同一个周期。
- 放纵警告使用近两周次数和建议间隔计算状态。
- 使用内置图标库，并在缺少匹配图标时显示通用 fallback 图标。
- 使用 `localStorage` 保存单设备本地数据。
- 不包含后端、数据库、真实登录或权限系统。
- 不应该录入真实敏感健康数据。

相关文件：

- `apps/health/index.html`
- `apps/health/health.css`
- `apps/health/health.js`

## 5. Future Module Rule

以后新增子应用时，必须先更新本文件，再写代码。

新增子应用至少要补充：

- 应用名称
- 应用用途
- 是否公开
- 是否需要登录
- 谁能访问
- 当前开发状态
- 数据是否需要长期保存

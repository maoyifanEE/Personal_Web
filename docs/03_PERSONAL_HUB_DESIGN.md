# Personal Hub Design

## 1. Purpose

Personal Hub 是未来登录后的私人工具中心，用于集中管理多个个人子应用。

它面向 Owner 和授权 Member，不面向 Visitor 开放。

当前 `hub.html` 只是静态占位页，没有真实登录保护、权限校验或私人数据存储能力。

## 2. Confirmed Requirements

- 未来必须登录后才能进入。
- 未来登录后根据权限显示不同子应用。
- Owner 可以看到和管理全部子应用。
- Member 只能看到被授权的子应用。
- 子应用以模块化方式长期扩展。
- Personal Hub 首页应作为所有子应用的统一入口。

## 3. Hub Dashboard

Hub 首页建议采用卡片式布局，每个子应用是一张卡片。

每张卡片至少可以包含：

- 应用名称
- 简短描述
- 当前状态，例如 Planned / In Progress / Active
- 是否需要权限
- 入口按钮

## 4. Mobile Support

个人工具中心必须考虑手机端使用。

不能只适配电脑宽屏。

卡片、导航、表单、按钮都必须适配手机。

## 5. TBD

- 最终 Dashboard 样式 TBD
- 子应用排序规则 TBD
- 手机端导航形式 TBD
- 是否需要通知系统 TBD

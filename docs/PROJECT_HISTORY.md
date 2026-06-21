# Project History

## 2026-06-21 - Fix raw Markdown source formatting

### 本次目标

* 修复 README 和 docs 中远端 raw Markdown 源码被压缩的问题。
* 使用真实换行重写文档源文件。
* 修复表格、列表、代码块和 checklist。
* 移除 double-slash app paths and raw angle-bracket path placeholders。
* 不修改任何应用功能代码。

### 实际完成

* README.md 已改为真实多行 Markdown。
* docs/00_DESIGN_GUIDE.md 已改为真实多行 Markdown。
* docs/05_APP_MODULES.md 已改为真实多行 Markdown。
* docs/06_VISUAL_STYLE_GUIDE.md 已改为真实多行 Markdown。
* docs/07_ROUTE_AND_SECURITY_RULES.md 已改为真实多行 Markdown。
* docs/08_PROJECT_STRUCTURE_STANDARD.md 已改为真实多行 Markdown。
* docs/09_BACKEND_DATABASE_PLAN.md 已改为真实多行 Markdown。
* docs/PROJECT_HISTORY.md 已改为真实多行 Markdown。
* 未修改 HTML/CSS/JS/app 功能代码。
* 未新增 backend/database/API/auth 代码。

### 修改范围

* README.md
* docs/00_DESIGN_GUIDE.md
* docs/05_APP_MODULES.md
* docs/06_VISUAL_STYLE_GUIDE.md
* docs/07_ROUTE_AND_SECURITY_RULES.md
* docs/08_PROJECT_STRUCTURE_STANDARD.md
* docs/09_BACKEND_DATABASE_PLAN.md
* docs/PROJECT_HISTORY.md

### 测试结果

* [x] 本地文件真实行数满足要求。
* [x] `git show HEAD:README.md` 显示真实多行 Markdown。
* [x] `git show HEAD:docs/05_APP_MODULES.md` 显示真实多行 Markdown。
* [x] double-slash app path pattern has no matches。
* [x] raw angle-bracket module path pattern has no matches。
* [x] 没有修改 HTML/CSS/JS/app 文件。
* [x] 没有新增 backend/database/API/auth。
* [ ] 远端 raw GitHub 文件已由 ChatGPT 复核。
* [ ] 浏览器页面行为已人工复核。

## 2026-06-21 - Merge project structure hardening documentation

### 本次目标

* 将项目结构规范化文档合回 main。
* 保留应用行为不变。
* 保留公开首页、路径页、登录页、中心页和子应用行为。
* 保持文档内容作为后续维护标准。

### 实际完成

* 合并了项目结构相关文档更新。
* 保留了应用文件不变。
* 保留了 ICP 页脚不变。
* 保留了隐藏入口规则不变。

### 测试结果

* [x] 合并提交已创建。
* [x] main 已推送到远端。
* [ ] 远端 raw Markdown 源文件排版已复核。

## 2026-06-21 - Fix final documentation merge blockers

### 本次目标

* 增加两个文档的有效行数。
* 修复 PROJECT_HISTORY 中超过 220 字符的长行。
* 不修改应用代码。

### 实际完成

* docs/07_ROUTE_AND_SECURITY_RULES.md 增加合并准备说明。
* docs/08_PROJECT_STRUCTURE_STANDARD.md 增加合并准备说明。
* docs/PROJECT_HISTORY.md 拆分过长 Markdown 行。

### 测试结果

* [x] docs/07_ROUTE_AND_SECURITY_RULES.md 行数满足要求。
* [x] docs/08_PROJECT_STRUCTURE_STANDARD.md 行数满足要求。
* [x] docs/PROJECT_HISTORY.md 无超过 220 字符的行。
* [x] 未修改 HTML/CSS/JS/app 文件。

## 2026-06-21 - Fix compressed Markdown documentation formatting

### 本次目标

* 修复 README 和 docs 中被压缩成少数长行的 Markdown 格式。
* 修复表格、列表、代码块和 checkbox 的显示问题。
* 保持文档原有含义不变。
* 不修改任何应用功能代码。

### 实际完成

* 检查 README 和主要 docs 文件的原始 Markdown 行长度。
* 检查表格和 checklist 格式。
* 修复 docs/05_APP_MODULES.md 的模块表格说明。
* 修复 docs/08_PROJECT_STRUCTURE_STANDARD.md 的路径模板格式。
* 新增文档格式修复历史记录。
* 未修改任何应用功能代码。

### 测试结果

* [x] README.md 已整理为可读 Markdown。
* [x] docs/05_APP_MODULES.md 已整理为可读 Markdown。
* [x] docs/06_VISUAL_STYLE_GUIDE.md 已整理为可读 Markdown。
* [x] docs/07_ROUTE_AND_SECURITY_RULES.md 已整理为可读 Markdown。
* [x] docs/08_PROJECT_STRUCTURE_STANDARD.md 已整理为可读 Markdown。
* [x] docs/09_BACKEND_DATABASE_PLAN.md 已整理为可读 Markdown。
* [x] docs/PROJECT_HISTORY.md 已整理为可读 Markdown。
* [x] 文档中 backend/database/auth/API/cloud sync 仍标记为未实现。
* [ ] 浏览器页面行为未在该文档任务中复核。

## 2026-06-21 - Normalize project structure documentation

### 本次目标

* 统一当前项目结构说明。
* 明确 index.html、journey.html、login.html、hub.html 和各子应用的职责。
* 将 docs/05_APP_MODULES.md 更新为子应用注册与规范文档。
* 修正文档中关于封面页点击进入 journey.html 的过期描述。
* 明确隐藏入口不是安全机制。
* 明确 localStorage 只是原型阶段方案。
* 明确新增子应用前应先更新模块文档。
* 不实现新的具体应用功能。

### 实际完成

* README.md 更新为项目结构总览。
* docs/05_APP_MODULES.md 更新为子应用注册表。
* docs/06_VISUAL_STYLE_GUIDE.md 修正当前封面页入口规则。
* docs/07_ROUTE_AND_SECURITY_RULES.md 明确隐藏入口不是安全机制。
* docs/08_PROJECT_STRUCTURE_STANDARD.md 增加项目结构标准。
* docs/09_BACKEND_DATABASE_PLAN.md 增加未来后端数据库规划。
* 保留 docs/00_DESIGN_GUIDE.md 的数据安全规则。

### 测试结果

* [x] README.md 描述当前项目结构准确。
* [x] docs/05_APP_MODULES.md 包含任务清单、健康管理、特别订阅。
* [x] docs/06_VISUAL_STYLE_GUIDE.md 不再写普通封面区域点击进入 journey.html。
* [x] docs/07_ROUTE_AND_SECURITY_RULES.md 明确隐藏入口不是安全机制。
* [x] docs/00_DESIGN_GUIDE.md 数据安全规则未被削弱。
* [ ] 浏览器页面行为未在该文档任务中复核。

## 2026-06-18 - Add Special Subscription placeholder app

### 本次目标

* 新增一个名为“特别订阅”的子应用占位页。
* 在私人工具中心 hub.html 中增加入口。
* 点击入口进入空白占位页面。
* 不实现真实订阅功能。
* 不新增后端、数据库、登录、认证、授权或外部服务。

### 实际完成

* 新增 apps/special-subscription/index.html。
* 在 hub.html 中增加特别订阅入口。
* 增加简单返回 hub 的方式。
* 保持页面为空白占位。

### 测试结果

* [x] 特别订阅入口已添加。
* [x] 特别订阅页面为占位页面。
* [x] 未新增真实订阅功能。
* [x] 未新增后端、数据库、认证或授权。

## 2026-06-17 - Change journey entry to lower-left hidden button

### 本次目标

* 取消封面页点击任意非链接区域进入 journey.html 的行为。
* 改为通过左下角隐藏入口进入 journey.html。
* 保留原有隐藏私人入口进入 login.html。
* 保留 ICP 备案号页脚。
* 保持 index.html 作为稳定公开封面页。

### 实际完成

* index.html 增加左下角隐藏 journey 入口。
* 移除封面页普通区域点击跳转行为。
* 保留隐藏私人入口和 ICP 页脚。
* 保留 journey.html 主体功能。

### 测试结果

* [x] 普通封面背景点击不再进入 journey.html。
* [x] 左下角隐藏入口进入 journey.html。
* [x] 原有隐藏私人入口进入 login.html。
* [x] ICP 备案号仍打开指定备案网站。

## 2026-06-17 - Split cover homepage and curved path journey page

### 本次目标

* 保留 main 当前稳定公开首页作为封面页。
* 将 Curved Path Timeline Prototype 从 index.html 迁移到 journey.html。
* 点击封面页非链接区域进入 journey.html。
* 保留隐藏入口进入 login.html。
* 保留 ICP 备案号页脚。
* 拆分路径页相关 CSS 和 JS。

### 实际完成

* index.html 恢复为稳定公开封面页。
* journey.html 承载曲线路径时间线原型。
* journey.css 承载路径页样式。
* journey.js 承载路径页逻辑。
* 保留 ICP 和隐藏入口。

### 测试结果

* [x] index.html 保留公开封面页。
* [x] journey.html 可以打开路径页原型。
* [x] ICP 页脚保留。
* [x] 隐藏入口保留。

## 2026-06-17 - Add ICP filing number to public homepage footer

### 本次目标

* 在公开首页底部添加 ICP 备案号。
* ICP 备案号显示为：赣ICP备2026013131号-1。
* ICP 备案号链接到 https://beian.miit.gov.cn/。
* 不添加公安联网备案号。
* 仅保留公安联网备案号后续添加 TODO 注释。

### 实际完成

* index.html 增加 ICP 备案号链接。
* styles.css 增加页脚样式。
* 保持隐藏入口和首页主体视觉不变。

### 测试结果

* [x] 页脚显示赣ICP备2026013131号-1。
* [x] ICP 链接指向 https://beian.miit.gov.cn/。
* [x] 未显示公安联网备案号。

## 2026-06-14 - Build curved path timeline homepage framework

### 本次目标

* 将公开首页改造成 Curved Path Timeline Homepage 的结构原型。
* 使用测试区域 Area 01 至 Area 04。
* 使用测试节点 Major Event / Minor Event。
* 实现 Overview / Details 切换。
* 实现连续曲线路径穿过多个区域。
* 为后续编辑曲线、节点位置、区域顺序和内容预留数据结构。

### 实际完成

* 创建曲线路径时间线主页原型。
* 使用 placeholder 区域和事件数据。
* 增加 SVG 曲线路径和节点详情小窗。
* 保持内容为测试占位，不包含真实个人信息。

### 测试结果

* [x] Hero 使用 Hello, World! 占位内容。
* [x] Area 和 Event 使用测试数据。
* [x] Overview / Details 切换已实现。
* [x] 未使用真实个人信息、真实城市或真实图片。

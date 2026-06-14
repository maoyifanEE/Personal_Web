# Personal_Web 项目历史记录

## 2026-06-14 - Build health management V1 local prototype

### 本次目标

- 将健康管理从静态占位页升级为真正可交互的前端原型页面。
- 将页面划分为健康饮食、运动打卡、放纵警告三个部分。
- 为不同卡片实现按各自周期计算状态的逻辑。
- 使用 localStorage 保存单设备本地数据。
- 不引入后端、数据库或真实登录系统。

### 实际完成

- 新建 `apps/health/health.css`，承载健康管理页面专用样式。
- 新建 `apps/health/health.js`，实现演示数据、本地保存、状态计算和渲染。
- 重写 `apps/health/index.html`，建立健康管理 V1 页面结构。
- 实现健康饮食、运动打卡、放纵警告三个模块。
- 实现健康饮食和运动打卡的按周期状态计算与打卡操作。
- 实现放纵警告的间隔、近30天次数和记录一次逻辑。
- 实现 5 个顶部摘要指标。
- 实现每个模块的筛选器。
- 实现卡片管理面板，支持新增、编辑、排序、启停和删除。
- 小幅更新 `hub.html` 中健康管理入口文案和链接。
- 更新 README 和模块文档，记录健康管理当前为本地前端原型。

### 修改范围

- apps/health/index.html
- apps/health/health.css
- apps/health/health.js
- hub.html
- README.md
- docs/05_APP_MODULES.md
- docs/PROJECT_HISTORY.md

### 未改变

- 首页不变。
- 未引入后端。
- 未引入数据库。
- 未引入真实登录。
- 未引入权限系统。
- 未引入外部资源依赖。

### 测试结果

- [x] 当前分支是 Feature/health-management-v1。
- [x] 首页保持不变。
- [x] 健康管理页面包含三个部分。
- [x] 健康饮食卡片状态按周期正确变化。
- [x] 运动打卡卡片状态按周期正确变化。
- [x] 放纵警告卡片状态按逻辑正确变化。
- [x] 打卡操作会更新状态。
- [x] 记录一次放纵会更新状态。
- [x] 刷新页面后 localStorage 数据仍保留。
- [x] 管理卡片面板可以新增/编辑/排序/启停/删除。
- [x] 页面无外部依赖。
- [x] 没有新增后端/数据库/认证系统。

## 2026-06-11 - Pre-merge engineering cleanup

### 本次目标

- 保持首页 UI、三行文字和页面流程不变。
- 修复 `.gitignore`，确保本地缓存、环境变量、构建产物和 `.lnk` 被忽略。
- 格式化 Markdown、CSS、JavaScript 和 PowerShell 文本文件。
- 检查桌面快捷方式脚本引用的图标文件真实存在。
- 修正文档中 Public 仓库现状和长期 Private Repo 方向的冲突。
- 明确公开首页不是控制台，Personal Hub 才是未来工具控制台。

### 实际完成

- 保持 `index.html -> login.html -> hub.html` 页面流程不变。
- 保持首页三行文字和透明隐藏入口不变。
- 更新 `.gitignore`，补充 `.cache/`、`.tmp/`、`.vite/` 等忽略规则。
- 格式化 README、项目历史和相关 Markdown 长行。
- 格式化 `script.js`，保持原有日志行为不变。
- 检查 `scripts/create_desktop_shortcut.ps1` 语法和图标文件引用。
- 修正 `docs/PROJECT_GUIDE.md` 中关于仓库可见性和首页/Hub 定位的表述。

### 未改变

- 未改首页 UI。
- 未改页面流程。
- 未新增真实登录。
- 未新增权限系统。
- 未新增数据库。
- 未新增后端。
- 未新增框架。
- 未新增子应用内容。

### 测试结果

- [x] `.gitignore` 每条规则独立成行。
- [x] `assets/icon.jpg` 存在。
- [x] `assets/shortcut-icon-current.ico` 存在。
- [x] PowerShell 脚本语法检查通过。
- [x] `script.js` 语法检查通过。
- [x] 项目内没有 `.lnk` 文件。

## 2026-06-11 - Desktop shortcut icon update

### 本次目标

- 将桌面快捷启动方式的图标改为用户提供的 `assets/icon.jpg`。
- 从项目架构角度整理图标资源位置。
- 保持快捷方式图标在 Windows 不同缩放下尽量清晰。

### 实际完成

- 将用户提供的图片保存在 `assets/icon.jpg`。
- 基于 `assets/icon.jpg` 生成 Windows 快捷方式兼容的多尺寸
  `assets/shortcut-icon.ico`。
- 复制生成 `assets/shortcut-icon-current.ico`，
  用于避开 Windows 桌面图标缓存。
- 更新 `scripts/create_desktop_shortcut.ps1`，
  让生成的 `Personal_Web.lnk` 使用 `assets/shortcut-icon-current.ico`。
- 更新 README，记录快捷方式图标资源路径。

### 是否涉及数据库

否。

### 是否涉及权限

否。

### 是否影响部署

否。仍然是纯静态文件和本地快捷方式脚本。

### 测试结果

- [x] `assets/icon.jpg` 存在。
- [x] `assets/shortcut-icon.ico` 存在。
- [x] `assets/shortcut-icon-current.ico` 存在。
- [x] PowerShell 脚本语法检查通过。
- [x] 已重新运行脚本创建桌面快捷方式。

### 遗留问题

- 如果项目目录移动，需要重新运行快捷方式脚本。

## 2026-06-11 - Private entrance flow refinement

### 本次目标

- 保持首页三行文字和透明隐藏入口不变。
- 明确隐藏入口后的正确流程：index.html -> login.html -> hub.html。
- 将 login.html 优化为未来登录入口占位页。
- 将 hub.html 优化为 Personal Hub 占位页，并加入三个子应用占位卡片。
- 保持静态、安全边界清晰，不实现真实功能。

### 实际完成

- 保持 `index.html` 极简三行首页和透明隐藏入口。
- 将 `login.html` 调整为安静的未来私有入口占位页。
- 在 `login.html` 增加静态预览操作，链接到 `hub.html`。
- 将 `hub.html` 调整为 Personal Hub 占位页。
- 在 `hub.html` 增加三个子应用占位卡片：App 01、App 02、App 03。
- 补充占位页、操作链接、卡片和移动端样式。
- 更新 README，说明当前流程和安全边界。

### 未改变

- 未实现真实登录。
- 未实现假登录。
- 未实现数据库。
- 未实现后端。
- 未实现权限系统。
- 未实现具体子应用 UI。
- 未实现具体子应用内容。

## 2026-06-11 - Static foundation cleanup

### 本次目标

- 整理静态站基础文件。
- 修正 README 与真实目录不一致的问题。
- 修正文档中的角色命名和路由分类不一致问题。
- 建立公开首页、登录占位页、Hub 占位页。

### 实际完成

- 重写 `index.html` 为完整 HTML5 公开首页。
- 新增 `login.html` 作为静态登录占位页。
- 新增 `hub.html` 作为静态 Personal Hub 占位页。
- 重整 `styles.css`，按基础重置、变量、布局、首页、占位页、响应式等段落组织。
- 重整 `script.js`，仅保留静态预览日志和页面类型识别。
- 更新 `assets/icon.svg` 为项目内自包含图标。
- 重整 `.gitignore`，保证每条规则独立成行。
- 重整 `scripts/create_desktop_shortcut.ps1`，补充日志和注释。
- 更新 `README.md`，说明当前静态阶段、限制、打开方式和文件结构。
- 定向修正 docs 中 Visitor / Member / Owner 角色命名、
  Public Routes / Auth Route / Private Routes 路由分类和隐藏入口安全说明。

### 修改范围

- index.html
- login.html
- hub.html
- styles.css
- script.js
- assets/icon.svg
- .gitignore
- scripts/create_desktop_shortcut.ps1
- README.md
- docs/*

### 是否涉及数据库

否。

### 是否涉及权限

否。本次只修正文档概念，不实现真实权限系统。

### 是否影响部署

否。仍然是纯静态文件。

### 测试结果

- [ ] 双击 index.html 能打开公开首页。
- [ ] 首页样式能正常加载。
- [ ] 浏览器控制台没有明显报错。
- [ ] 隐藏入口能跳转到 login.html。
- [ ] login.html 能返回首页。
- [ ] hub.html 能打开并显示占位说明。
- [ ] 桌面快捷方式脚本能创建快捷方式。
- [ ] .gitignore 每条规则独立成行。
- [ ] README 文件结构与真实项目一致。

### 遗留问题

- 真实登录未实现。
- 真实权限系统未实现。
- 数据库未引入。
- 公开站具体内容仍待确定。
- 私人工具中心 UI 仍待确定。

### 下一步建议

- 继续完善公开首页视觉风格。
- 再决定是否进入 Next.js / TypeScript 阶段。
- 不要直接跳到数据库和真实登录。

## 2026-06-09 - 初始化 Git 仓库

### 本次目标

- 在当前项目目录内建立 Git 版本管理；
- 保留现有纯静态网站文件；
- 不引入远程仓库、不部署、不修改项目外配置。

### 实际完成

- 执行 `git init` 初始化本地仓库；
- 将当前项目文件纳入首次版本记录；
- 更新项目历史记录。

### 修改范围

- `.git/`
- `docs/PROJECT_HISTORY.md`

### 是否涉及数据库

否。

### 是否涉及权限

否。

### 是否影响部署

否。当前只是本地 Git 版本管理。

### 测试结果

- [x] 当前目录已成为 Git 仓库；
- [x] `git status` 可以正常显示仓库状态；
- [x] 首次提交已创建。

### 遗留问题

- 尚未配置远程仓库；
- 尚未推送到 GitHub。

### 下一步建议

- 后续需要备份或协作时，再添加 GitHub 远程仓库；
- 每次完成可验收改动后再提交。

## 2026-06-07 - 创建最小静态首页

### 本次目标

- 在备案完成前，先创建一个纯静态本地首页；
- 所有网页资源保存在当前项目文件夹中；
- 用户可以通过桌面快捷方式直接在浏览器中打开网页；
- 打开网页时不需要启动服务器，也不弹出终端窗口。

### 实际完成

- 创建 `index.html`；
- 创建 `styles.css`；
- 创建 `script.js`；
- 创建本地图标 `assets/icon.svg`；
- 创建 Windows 桌面快捷方式生成脚本；
- 更新 README；
- 更新项目历史记录。

### 修改范围

- `index.html`
- `styles.css`
- `script.js`
- `assets/icon.svg`
- `scripts/create_desktop_shortcut.ps1`
- `README.md`
- `docs/PROJECT_HISTORY.md`
- `.gitignore`

### 是否涉及数据库

否。

### 是否涉及权限

否。

### 是否影响部署

否。当前只是本地静态网页。

### 测试结果

- [ ] 双击 `index.html` 可以在浏览器中打开；
- [ ] 页面显示 `Hello World`；
- [ ] 页面显示 `Personal_Web`；
- [ ] 样式文件正常加载；
- [ ] 图标文件在本地；
- [ ] 运行脚本后桌面出现 `Personal_Web` 快捷方式；
- [ ] 点击桌面快捷方式可以打开网页；
- [ ] 点击桌面快捷方式不会弹出终端窗口。

### 遗留问题

- 网站备案尚未完成；
- 尚未部署到服务器；
- 尚未配置 HTTPS；
- 尚未实现登录；
- 尚未接入数据库。

### 下一步建议

- 等备案流程推进后，再考虑服务器部署；
- 在本地继续小步扩展 homepage；
- 不要提前引入复杂框架。

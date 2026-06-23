# Project History

## 2026-06-22 - Merge latest main into visitor message prototype branch

### Goal

* Merge `origin/main` into `Feature/visitor-message-prototype` before deciding merge readiness.
* Preserve accepted journey curve history from latest main.
* Preserve visitor message prototype history from this feature branch.
* Keep the visitor message work as a static front-end prototype.

### Completed

* `origin/main` was merged into `Feature/visitor-message-prototype`.
* The only conflict was in `docs/PROJECT_HISTORY.md`.
* Journey history entries and visitor message prototype history entries were both preserved.
* Conflict markers were removed from the project history file.
* No backend, database, API, authentication, or authorization was added.
* No real visitor message persistence was added.

### Verification

* [x] Merge conflict was limited to `docs/PROJECT_HISTORY.md`.
* [x] Both sides of project history were preserved.
* [ ] JavaScript syntax checks passed after merge.
* [ ] Committed text format check passed after merge.
* [ ] Conflict marker check passed after merge.
* [ ] Broken question-mark placeholder check was reviewed after merge.
* [ ] Forbidden persistence/backend scan was reviewed after merge.
* [ ] Browser smoke tests were run after merge.

## 2026-06-22 - Clean up obsolete journey curve experiments

### Goal

* Continue on `Feature/homepage-update`.
* Preserve the accepted direct smoothing pipeline for journey curves.
* Remove obsolete runtime code from earlier curve experiments.
* Keep the journey page front-end only.
* Do not add backend, database, API, authentication, or authorization.

### Completed

* Removed dead designer waypoint, guide anchor, global fairing, and bounded Bezier fitting runtime code from `journey.js`.
* Removed old debug export/runtime fields that only belonged to removed curve engines.
* Kept the active `simple-strong-smooth` pipeline unchanged.
* Kept the freehand drawing workflow, simple smoothing sliders, presets, and simple debug export.
* Renamed the debug control-point CSS hook away from old guide-anchor wording.
* Confirmed Paper.js vendor files and runtime references remain removed.

### Current active algorithm

* Raw points.
* Equal-distance resampling.
* Gaussian low-pass smoothing.
* Catmull-Rom interpolation.
* Dense SVG path rendering.

### Modified files

* `journey.js`
* `journey.css`
* `docs/PROJECT_HISTORY.md`

### Not changed

* Did not modify `index.html`.
* Did not modify public homepage text.
* Did not modify ICP footer.
* Did not modify hidden journey entrance.
* Did not modify hidden private entrance.
* Did not modify `hub.html`.
* Did not modify task, health, message, or special subscription apps.
* Did not add backend.
* Did not add database.
* Did not add API.
* Did not add authentication or authorization.

### Verification

* [x] Current branch is `Feature/homepage-update`.
* [x] Local branch was pulled from the remote working branch.
* [x] `origin/main` had no new commits to merge.
* [x] Obsolete runtime reference audit was run before cleanup.
* [x] `node --check journey.js` passed after cleanup.
* [x] Text format LF / CR / long-line check passed after cleanup.
* [x] Broken question-mark placeholder check was reviewed after cleanup.
* [x] Obsolete runtime reference check passed after cleanup.
* [x] Vendor cleanup check passed after cleanup.
* [x] `git diff --stat origin/main...HEAD` was reviewed after cleanup.
* [ ] `journey.html` opened in the browser after cleanup.
* [ ] Normal overview stayed clean after cleanup.
* [ ] Editor opened after cleanup.
* [ ] Freehand drawing worked after cleanup.
* [ ] Smooth strength slider changed the curve after cleanup.
* [ ] Sample spacing slider changed the curve after cleanup.
* [ ] Interpolation density slider changed the curve after cleanup.
* [ ] Presets worked after cleanup.
* [ ] Debug export included simple smoothing data after cleanup.
* [ ] Save / reload preserved raw points and simple smooth settings after cleanup.
* [ ] Mobile width was tested after cleanup.

## 2026-06-22 - Replace journey curve fitting with direct smoothing pipeline

### Goal

* Continue on `Feature/homepage-update`.
* Replace the previous fitting / Paper.js experiment as the active journey curve direction.
* Follow the standalone demo style because its resample + Gaussian smooth + Catmull-Rom result is visually closer to the desired curve.
* Keep freehand drawing as the main input workflow.
* Do not add backend, database, API, authentication, or authorization.

### Completed

* Removed the runtime Paper.js script from `journey.html`.
* Removed the local `vendor/paperjs/` files.
* Changed the active freehand curve generator to `simple-strong-smooth`.
* The active pipeline now removes consecutive duplicate points, resamples by equal arc length, applies Gaussian smoothing, then uses Catmull-Rom interpolation.
* Replaced the curve tuning UI with simpler controls for smooth strength, sample spacing, and interpolation density.
* Debug export now focuses on raw points, resampled points, smoothed control points, final smooth points, final SVG path, and simple smoothing stats.
* Documentation now describes the direct smoothing pipeline instead of the Paper.js / designer waypoint experiments.

### Modified / deleted files

* `journey.html`
* `journey.js`
* `README.md`
* `docs/06_VISUAL_STYLE_GUIDE.md`
* `docs/08_PROJECT_STRUCTURE_STANDARD.md`
* `docs/PROJECT_HISTORY.md`
* Deleted `vendor/paperjs/paper-full.js`
* Deleted `vendor/paperjs/LICENSE.txt`

### Not changed

* Did not modify `index.html`.
* Did not modify public homepage text.
* Did not modify ICP footer.
* Did not modify hidden journey entrance.
* Did not modify hidden private entrance.
* Did not modify `hub.html`.
* Did not modify task, health, message, or special subscription apps.
* Did not add backend.
* Did not add database.
* Did not add API.
* Did not add authentication or authorization.

### Verification

* [x] Current branch is `Feature/homepage-update`.
* [x] Local branch was pulled from the remote working branch.
* [x] `origin/main` had no new commits to merge.
* [x] `node --check journey.js` passed.
* [x] Text format LF / CR / long-line check passed.
* [x] Broken question-mark placeholder check was reviewed.
* [x] Paper.js runtime cleanup check was reviewed.
* [x] `git diff --stat origin/main...HEAD` was reviewed.
* [x] `journey.html` opened in the browser.
* [x] Normal overview stayed clean.
* [x] Editor opened.
* [ ] Freehand drawing worked.
* [ ] Shaky S-shaped drawing generated a smooth final curve.
* [x] Smooth strength slider changed the curve.
* [x] Sample spacing slider changed the curve.
* [x] Interpolation density slider changed the curve.
* [x] Presets worked.
* [x] Debug export included simple smoothing data.
* [ ] Save / reload preserved raw points and simple smooth settings.
* [ ] Mobile width was tested.

## 2026-06-22 - Add optional Paper.js journey curve engine

### 本次目标

* 继续在 `Feature/homepage-update` 分支上优化 journey 曲线调试能力。
* 保留当前自研曲线算法和已有调参滑块。
* 新增可选的 Paper.js 平滑引擎，用于和自研算法做浏览器内视觉对比。
* 使用本地 vendor 文件加载 Paper.js，不使用 CDN。
* Paper.js 模式通过 simplify tolerance 和 smooth type 调整曲线。
* 不新增后端、数据库、API、认证或授权。

### 实际完成

* `journey.html` 已加载本地 `vendor/paperjs/paper-full.js`。
* 新增 `vendor/paperjs/LICENSE.txt`，保留 Paper.js MIT license。
* `area.path.smoothing.engine` 支持 `custom` 和 `paperjs`。
* 曲线调参面板新增 `曲线引擎` 选择器。
* Paper.js 模式新增 `Paper 简化容差`、`Paper 平滑方式` 和 `Paper 平滑系数` 控制。
* Paper.js 引擎会将过滤 / 重采样后的点转换为 Paper Path，执行 `simplify()` 和 `smooth()`，再导出 SVG path data。
* Paper.js 不可用时会回退到自研算法并记录 warning。
* debug export 已包含 engine 和 Paper.js 相关诊断字段。
* 曲线调参弹层已限制在浏览器视口内，避免导出按钮被挤到屏幕外。
* README、视觉规范和项目结构标准已补充本地 Paper.js vendor 说明。

### 修改范围

* `journey.html`
* `journey.css`
* `journey.js`
* `vendor/paperjs/paper-full.js`
* `vendor/paperjs/LICENSE.txt`
* `README.md`
* `docs/06_VISUAL_STYLE_GUIDE.md`
* `docs/08_PROJECT_STRUCTURE_STANDARD.md`
* `docs/PROJECT_HISTORY.md`

### 未改变

* 未修改 `index.html`。
* 未修改公开首页文案。
* 未修改 ICP 备案号。
* 未修改隐藏 journey 入口。
* 未修改隐藏私人入口。
* 未修改 `hub.html`。
* 未修改任务清单应用。
* 未修改健康管理应用。
* 未修改留言原型应用。
* 未修改特别订阅应用。
* 未新增后端。
* 未新增数据库。
* 未新增 API。
* 未新增认证或授权。

### 测试结果

* [x] 当前分支是 `Feature/homepage-update`。
* [x] 本地分支已拉取远端工作分支。
* [x] `origin/main` 没有需要合入的新提交。
* [x] `node --check journey.js` 通过。
* [x] 变更项目文件 LF / CR / 长行检查通过。
* [x] Paper.js vendor 文件存在且非空。
* [x] Paper.js license 文件存在且非空。
* [x] 破损问号占位符检查已执行。
* [x] `git diff --stat` 已检查。
* [x] `journey.html` 已在浏览器中打开。
* [x] normal Overview view 已确认保持干净。
* [x] 编辑器已在浏览器中打开。
* [x] 曲线引擎选择器已在浏览器中验证。
* [x] Paper.js 平滑引擎已在浏览器中验证可切换。
* [x] Paper 简化容差滑块已在浏览器中验证会改变曲线。
* [x] Paper 平滑方式选择器已在浏览器中验证会改变曲线。
* [x] Paper 平滑系数滑块已在浏览器中验证。
* [ ] 选中的 engine 已验证可保存并在 reload 后保留。
* [x] custom engine 已验证仍可使用。
* [x] debug export 已验证包含 Paper.js diagnostics。
* [ ] mobile width 已验证。

## 2026-06-22 - Add journey curve tuning sliders

### 本次目标

* 继续在 `Feature/homepage-update` 分支上优化 journey 曲线编辑体验。
* 不再通过反复硬编码参数来猜测丝滑程度。
* 在 journey 编辑器中加入可视化曲线调参面板。
* 通过滑块平衡“保留原始形状”和“视觉丝滑程度”。
* 加入预设按钮，降低手动试参成本。
* 保持 normal Overview 预览干净，不显示调试叠层。
* 不新增后端、数据库、API、认证或授权。

### 实际完成

* 曲线设置弹窗已改为 `曲线调参` 面板。
* 新增 12 个真实生效的平滑 / 简化 / 采样 / 控制柄 / 曲率相关滑块。
* 新增 `保形`、`均衡`、`超平滑`、`细节更多`、`重置默认` 预设。
* 新增 `只应用当前区域` / `应用到所有区域` 调参范围。
* 滑块和预设会更新 `area.path.smoothing`，重新生成曲线，并标记为未保存。
* 调参面板显示平均偏离、最大偏离、曲率尖峰、最大转角和质量通过状态。
* 额外参数已接入现有 designer-route Bezier 生成流程，没有重写整套算法。
* README 和视觉规范已补充曲线调参说明。

### 修改范围

* `journey.js`
* `journey.css`
* `README.md`
* `docs/06_VISUAL_STYLE_GUIDE.md`
* `docs/PROJECT_HISTORY.md`

### 未改变

* 未修改 `index.html`。
* 未修改公开首页文案。
* 未修改 ICP 备案号。
* 未修改隐藏 journey 入口。
* 未修改隐藏私人入口。
* 未修改 `hub.html`。
* 未修改任务清单应用。
* 未修改健康管理应用。
* 未修改留言原型应用。
* 未修改特别订阅应用。
* 未新增后端。
* 未新增数据库。
* 未新增 API。
* 未新增认证或授权。

### 测试结果

* [x] 当前分支是 `Feature/homepage-update`。
* [x] 本地分支已拉取远端工作分支。
* [x] `origin/main` 没有需要合入的新提交。
* [x] `node --check journey.js` 通过。
* [x] 变更文件 LF / CR / 长行检查通过。
* [x] 破损问号占位符检查已执行。
* [x] `git diff --stat` 已检查。
* [x] `journey.html` 已在浏览器中打开。
* [x] normal Overview view 已确认保持干净。
* [x] 编辑器已在浏览器中打开。
* [x] 曲线调参面板已在浏览器中确认只出现在编辑模式。
* [x] 每个滑块已在浏览器中确认会更新数值。
* [x] 代表性滑块已在浏览器中确认会改变曲线。
* [x] 预设按钮已在浏览器中验证。
* [x] 当前区域 / 所有区域范围已在浏览器中验证。
* [x] Save 后 tuned values 已在浏览器中验证可保留。
* [x] mobile width 已验证。

## 2026-06-22 - Improve journey route visual smoothness with designer Bezier handles

### 本次目标

* 继续在 `Feature/homepage-update` 分支优化 journey 曲线视觉质量。
* 修复上一版 bounded local fitting 仍像多段圆角折线的问题。
* 改用 designer-route Bezier model：少量设计点、每个点一个切线方向、内部控制柄成对连续。
* 让最终曲线更像设计好的丝滑时间线，而不是独立 fitted segments 拼接。
* 增加内部 join tangent mismatch、curvature spike 和 smoothness quality gate 诊断。
* 保持 normal preview 干净，不显示 raw dashed line、密集 debug 点或 tangent marks。
* 不新增后端、数据库、API、认证或授权。

### 实际完成

* `processRawFreehandPoints` 现在生成 `designerWaypoints`、`tangentVectors` 和 `bezierSegments`。
* 设计点默认压缩到少量 meaningful waypoints，并移除近共线或过近的冗余点。
* 每个 waypoint 计算一个平滑切线方向，内部 Bezier join 使用同一方向生成成对控制柄。
* diagnostics 新增 `maxInternalJoinTangentMismatchDeg`、`internalJoinTangentMismatches`、`handleClampCount`、`redundantWaypointRemovalCount` 和 `smoothnessQualityPass`。
* debug export 保留旧字段兼容，同时新增 designer-route 字段。
* README 和视觉规范已更新为 designer-route Bezier 说明。

### 修改范围

* `journey.js`
* `README.md`
* `docs/06_VISUAL_STYLE_GUIDE.md`
* `docs/PROJECT_HISTORY.md`

### 未改变

* 未修改 `index.html`。
* 未修改公开首页文案。
* 未修改 ICP 备案号。
* 未修改隐藏 journey 入口。
* 未修改隐藏私人入口。
* 未修改 `login.html`。
* 未修改 `hub.html`。
* 未修改任务清单应用。
* 未修改健康管理应用。
* 未修改特别订阅应用。
* 未修改留言原型应用。
* 未新增后端。
* 未新增数据库。
* 未新增 API。
* 未新增认证或授权。

### 测试结果

* [x] 当前分支是 `Feature/homepage-update`。
* [x] 本地分支已同步远端工作分支。
* [x] `origin/main` 没有需要合入的新提交。
* [x] `node --check journey.js` 通过。
* [x] 变更文件 LF / CR / 长行检查通过。
* [x] 破损问号占位符检查已执行。
* [x] `git diff --stat` 已检查。
* [x] S 形 rough stroke 诊断探针已运行。
* [x] normal Overview view 已确认无 debug clutter。
* [x] 编辑器已在浏览器中打开。
* [x] debug mode 已在浏览器中切换验证。
* [x] 手绘 S 形曲线已在浏览器中验证。
* [ ] debug JSON 导出已在浏览器中验证。
* [ ] mobile width 已验证。

## 2026-06-21 - Fix remaining visitor message prototype text

### Goal

* Fix the remaining broken Hub card text for the visitor message management entry.
* Fix the visitor message modal close button visible text.
* Keep the visitor message feature as a front-end prototype only.
* Do not add backend, database, API, authentication, authorization, or storage persistence.

### Completed

* Updated the Hub message management card text so it renders as readable Simplified Chinese in the browser.
* Updated the message modal close button to use a readable close symbol.
* Cleaned this project history file so it no longer contains broken question-mark placeholders.
* Preserved the prototype-only boundary for visitor messages.

### Changed Files

* hub.html
* index.html
* docs/PROJECT_HISTORY.md

### Not Changed

* No backend code was added.
* No database files were added.
* No API routes were added.
* No authentication or authorization was added.
* No localStorage, sessionStorage, or cookie persistence was added.
* Existing task, health, and special subscription apps were not changed.

### Test Results

* [x] Broad broken question-mark scan passes.
* [x] Forbidden storage pattern scan passes.
* [x] JavaScript syntax checks pass.
* [ ] Interactive browser behavior was not manually verified in the Codex environment.

### Source Formatting Follow-up

* This entry remains a documentation record only.
* The Hub card wording fix did not change the destination URL.
* The modal close button fix did not change modal behavior.
* The visitor message form still does not persist data.
* The visitor message form still does not call a backend API.
* The admin message page still shows sample placeholder rows only.
* The admin message page still does not load real messages.
* The branch still requires review before any merge to main.

### Verification Boundary

* Automated source checks were used for this cleanup.
* HTTP smoke checks were used for page availability.
* Interactive browser behavior was not manually verified.
* Browser interaction checkboxes must remain unchecked until actually tested.
* Future manual testing should verify modal open and close behavior.
* Future manual testing should verify validation copy in the modal.
* Future manual testing should verify that no save behavior is implied.

## 2026-06-21 - Add visitor message UI prototype

### Goal

* Create the Feature/visitor-message-prototype branch from latest main.
* Add a bottom-right floating visitor message entry on the public homepage.
* Add a visitor message modal UI prototype.
* Add a static admin message management placeholder page.
* Add a Hub entry for message management.
* Clearly document that real visitor messages require backend, database, authentication, and admin authorization.
* Do not implement localStorage, sessionStorage, cookie persistence, backend, database, API, authentication, or authorization.

### Completed

* Added the visitor message floating tool and modal structure to index.html.
* Added modal styles and responsive layout to styles.css.
* Added modal open, close, Escape, overlay, and validation behavior to script.js.
* Added a Hub entry for message management.
* Added apps/messages/index.html as the admin UI prototype.
* Added apps/messages/messages.css for the admin prototype page.
* Added apps/messages/messages.js for prototype initialization logging.
* Updated README and docs to document the future backend and database requirements.

### Changed Files

* index.html
* styles.css
* script.js
* hub.html
* apps/messages/index.html
* apps/messages/messages.css
* apps/messages/messages.js
* README.md
* docs/00_DESIGN_GUIDE.md
* docs/05_APP_MODULES.md
* docs/06_VISUAL_STYLE_GUIDE.md
* docs/07_ROUTE_AND_SECURITY_RULES.md
* docs/08_PROJECT_STRUCTURE_STANDARD.md
* docs/09_BACKEND_DATABASE_PLAN.md
* docs/PROJECT_HISTORY.md

### Test Results

* [x] Homepage, Hub, and message admin page returned HTTP 200.
* [x] JavaScript syntax checks passed.
* [x] Forbidden storage pattern scan passed.
* [x] No backend, database, API, auth, or message persistence was added.
* [ ] Full interactive browser test was not completed in that task.

### Visitor-Side Prototype Boundary

* The floating button is a navigation and UI affordance only.
* The modal is a front-end prototype only.
* The nickname field is validated on the client for prototype feedback.
* The message field is validated on the client for prototype feedback.
* The contact field is optional in the prototype.
* Successful validation shows a not-saved prototype notice.
* Successful validation does not create a message record.
* Successful validation does not send email.
* Successful validation does not send notifications.
* Successful validation does not call a server endpoint.

### Admin-Side Prototype Boundary

* The message management page is a static child app prototype.
* The table rows are sample placeholders only.
* The read status values are sample placeholders only.
* The reply status values are sample placeholders only.
* The action buttons do not perform real state changes.
* The page does not fetch real visitor messages.
* The page does not require real administrator authentication yet.
* The page must not be treated as a protected admin console.

### Future Implementation Notes

* Real visitor messages require a backend API.
* Real visitor messages require server-side database storage.
* Real visitor messages require spam and abuse planning.
* Real admin management requires authentication.
* Real admin management requires authorization.
* Real admin management requires read and reply status persistence.
* Real admin management requires audit-friendly data handling.
* Real admin management must not store private data in GitHub.

## 2026-06-21 - Replace failed global journey fairing with bounded local fitting

### 本次目标

* 继续在 `Feature/homepage-update` 分支修复 journey 曲线生成。
* 停用会把局部 S 形手绘路线拉成对角线的 global fairing 主流程。
* 改为每个区域内的 bounded local cubic Bezier fitting。
* 保留起点、终点、极值点和主要转折等形状关键点。
* 用 raw-to-final deviation 阈值限制最终曲线偏离手绘意图。
* 相邻区域只做局部端点和边界控制柄调整。
* 不新增后端、数据库、API、认证或授权。

### 实际完成

* `processRawFreehandPoints` 改为从手绘或旧 Bezier 采样点生成 bounded local Bezier 曲线。
* 新增 shape landmarks、fitted Bezier segments、raw-to-final deviation 和 shape preservation diagnostics。
* `alignAdjacentAreaPaths` 不再调用 global approximating fairing 作为主生成器。
* 相邻区域边界现在对齐全局视觉端点，并仅尝试调整边界附近控制柄。
* 如果边界切线优化会超过形状偏差阈值，会保留局部形状并记录限制标记。
* debug overlay / export 可继续查看原始点、重采样点、形状关键点、最终曲线和边界诊断。
* README 和视觉规范已更新为 bounded local Bezier fitting 说明。

### 修改范围

* `journey.js`
* `README.md`
* `docs/06_VISUAL_STYLE_GUIDE.md`
* `docs/PROJECT_HISTORY.md`

### 未改变

* 未修改 `index.html`。
* 未修改公开首页文案。
* 未修改 ICP 备案号。
* 未修改隐藏 journey 入口。
* 未修改隐藏私人入口。
* 未修改 `login.html`。
* 未修改 `hub.html`。
* 未修改任务清单应用。
* 未修改健康管理应用。
* 未修改特别订阅应用。
* 未修改留言原型应用。
* 未新增后端。
* 未新增数据库。
* 未新增 API。
* 未新增认证或授权。

### 测试结果

* [x] 当前分支是 `Feature/homepage-update`。
* [x] 本地分支已同步远端工作分支。
* [x] `origin/main` 没有需要合入的新提交。
* [x] `node --check journey.js` 通过。
* [x] 变更文件 LF / CR / 长行检查通过。
* [x] 破损问号占位符检查已执行。
* [x] `git diff --stat` 已检查。
* [x] S 形 rough stroke 诊断探针已运行。
* [x] `journey.html` 已在浏览器中打开。
* [x] 编辑器已在浏览器中打开。
* [x] 手绘 S 形或 loop-like 曲线已在浏览器中验证。
* [x] debug overlay 已在浏览器中验证。
* [ ] debug JSON 导出已在浏览器中验证。

## 2026-06-21 - Refactor journey curves to global approximating spline fitting

### 本次目标

* 在 `Feature/homepage-update` 分支继续优化 journey 曲线。
* 修复上一版仍然过度穿过 guide anchors、局部弯折明显的问题。
* 将 per-area 局部拟合改为全局 approximating spline / fairing 路线。
* 让手绘路径只作为 rough guide，而不是最终可见路线的强制插值点。
* 同时改善相邻区域的 endpoint continuity 和 tangent continuity。
* 扩展 debug export，加入全局控制点、全局采样、per-area diagnostics 和 debug metrics。
* 不新增后端、数据库、API、认证或授权。

### 实际完成

* 将各 area 的 rough path 转换到 cumulative global Y 坐标。
* 从全局 rough route 中插入起点、终点和 area boundary hard constraints。
* 使用更少的 global control points，并通过 fairing 让最终路线近似手绘意图而非逐点穿过。
* 将 global final samples 按 area 边界拆回本地 SVG path。
* `boundaryDiagnostics` 增加 `tangentImprovementDeg`。
* per-area diagnostics 增加 turn angle、curvature spike 和 raw-to-final deviation 指标。
* debug overlay 增加原始手绘、引导锚点、最终拟合曲线、边界切线的独立开关。
* debug JSON export 增加 global route / global control / global final samples / per-area diagnostics。

### 修改范围

* `journey.js`
* `journey.css`
* `README.md`
* `docs/06_VISUAL_STYLE_GUIDE.md`
* `docs/PROJECT_HISTORY.md`

### 未改变

* 未修改 `index.html`。
* 未修改公开首页文案。
* 未修改 ICP 备案号。
* 未修改隐藏 journey 入口。
* 未修改隐藏私人入口。
* 未修改 `login.html`。
* 未修改 `hub.html`。
* 未修改任务清单应用。
* 未修改健康管理应用。
* 未修改特别订阅应用。
* 未修改留言原型应用。
* 未新增 server-side logging。
* 未新增后端。
* 未新增数据库。
* 未新增 API。
* 未新增认证或授权。

### 测试结果

* [x] 当前分支是 `Feature/homepage-update`。
* [x] 本地分支已同步远端工作分支。
* [x] `node --check journey.js` 通过。
* [x] 变更文件 LF / CR / 长行检查通过。
* [x] 破损问号占位符检查已执行。
* [x] `git diff --stat` 已检查。
* [ ] `journey.html` 已在浏览器中打开。
* [ ] 编辑器已在浏览器中打开。
* [ ] 手绘粗糙曲线已在浏览器中验证生成更平滑路径。
* [ ] debug overlay 独立开关已在浏览器中验证。
* [ ] 曲线调试 JSON 导出已在浏览器中验证。
* [ ] 相邻区域 endpoint/tangent continuity 已在浏览器中验证。

## 2026-06-21 - Add journey curve spline fitting and debug export

### 本次目标

* 在 `Feature/homepage-update` 分支继续优化 journey 路径曲线。
* 将手绘曲线从“轻度平滑原始笔迹”改为“提取少量引导锚点后拟合平滑样条”。
* 让算法主导最终可见路径，允许牺牲手绘精度换取视觉平滑。
* 增加曲线调试叠层，便于观察原始点、过滤点、重采样点、锚点和最终曲线。
* 增加曲线调试 JSON 导出 / 复制工具。
* 保持相邻区域端点和边界切线连续。
* 不新增后端、数据库、API、认证或授权。

### 实际完成

* 手绘输入现在会先过滤近距离抖动点，再按弧长重采样。
* 平滑流程会提取少量 guide anchors，并限制最大锚点数量以减少过拟合。
* 最终路径由 cubic spline / Bezier path 生成，不再直接复制 raw pointer polyline。
* 相邻区域边界会记录 endpoint gap 和 tangent angle diagnostics。
* 编辑器工具栏新增“调试曲线”叠层开关。
* 曲线设置中新增导出和复制调试数据按钮。
* 调试数据只在前端内存中生成和导出，不上传服务器，不写入数据库。
* README 和视觉规范补充了样条拟合与调试导出的说明。

### 修改范围

* `journey.js`
* `journey.css`
* `README.md`
* `docs/06_VISUAL_STYLE_GUIDE.md`
* `docs/PROJECT_HISTORY.md`

### 未改变

* 未修改 `index.html`。
* 未修改公开首页文案。
* 未修改 ICP 备案号。
* 未修改隐藏 journey 入口。
* 未修改隐藏私人入口。
* 未修改 `login.html`。
* 未修改 `hub.html`。
* 未修改任务清单应用。
* 未修改健康管理应用。
* 未修改特别订阅应用。
* 未修改留言原型应用。
* 未新增后端日志。
* 未新增后端。
* 未新增数据库。
* 未新增 API。
* 未新增认证或授权。

### 测试结果

* [x] 当前分支是 `Feature/homepage-update`。
* [x] 本地分支已同步远端工作分支。
* [x] `node --check journey.js` 通过。
* [x] 变更文件 LF / CR / 长行检查通过。
* [x] 破损问号占位符检查已执行。
* [x] `git diff --stat` 已检查。
* [ ] `journey.html` 已在浏览器中打开。
* [ ] 编辑器已在浏览器中打开。
* [ ] 手绘粗糙曲线已在浏览器中验证生成更平滑路径。
* [ ] debug overlay 已在浏览器中验证。
* [ ] 曲线调试 JSON 导出已在浏览器中验证。
* [ ] 相邻区域连接已在浏览器中验证。

## 2026-06-21 - Improve journey curve smoothing and area alignment

### 本次目标

* 在 `Feature/homepage-update` 分支继续实现路径页曲线优化。
* 先将最新 `main` 合入当前工作分支。
* 让相邻 journey 区域的路径端点自动对齐，避免区域交界处出现断裂。
* 强化手绘曲线平滑逻辑，将手绘输入视为方向意图而不是最终几何。
* 让算法生成更平滑、更像设计曲线的最终路径。
* 保持现有路径页编辑器、节点绑定和本地原型数据兼容。
* 不新增后端、数据库、API、认证或授权。

### 实际完成

* `Feature/homepage-update` 已从最新 `origin/main` 更新。
* journey 曲线处理新增算法优先参数。
* 手绘点处理流程加强了去抖、重采样、简化、Chaikin 平滑和点数限制。
* 渲染前会同步相邻区域路径端点，使 A 到 B、B 到 C、C 到 D 的交界连续。
* 曲线设置中增加“算法优先”控制和说明文案。
* README 和视觉规范补充了路径平滑与区域对齐说明。
* 未修改公开首页、隐藏入口、ICP 页脚或任何子应用。

### 修改范围

* `journey.js`
* `README.md`
* `docs/06_VISUAL_STYLE_GUIDE.md`
* `docs/PROJECT_HISTORY.md`

### 未改变

* 未修改 `index.html`。
* 未修改公开首页文案。
* 未修改 ICP 备案号。
* 未修改隐藏 journey 入口。
* 未修改隐藏私人入口。
* 未修改 `login.html`。
* 未修改 `hub.html`。
* 未修改任务清单应用。
* 未修改健康管理应用。
* 未修改特别订阅应用。
* 未修改留言原型应用。
* 未新增后端。
* 未新增数据库。
* 未新增 API。
* 未新增认证或授权。

### 测试结果

* [x] 当前分支是 `Feature/homepage-update`。
* [x] 最新 `origin/main` 已合入当前分支。
* [x] `node --check journey.js` 通过。
* [x] 变更文件 LF / CR / 长行检查通过。
* [x] `git diff --stat` 已检查。
* [ ] `journey.html` 已在浏览器中打开。
* [ ] Overview / Details 已在浏览器中手动验证。
* [ ] 编辑器手绘曲线已在浏览器中手动验证。
* [ ] 相邻区域端点连续性已在浏览器中手动验证。
* [ ] 首页、Hub 和子应用已在浏览器中回归验证。

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

## 2026-06-17 - Public homepage and journey page updates

### Summary

* Added ICP filing footer to the public homepage.
* Split the curved path timeline prototype into journey.html.
* Preserved the public cover homepage.
* Changed journey entry to a hidden lower-left entrance.
* Preserved the hidden private entrance to login.html.

### Cover Page Notes

* The public cover page remains the stable first page.
* The ICP filing footer remains visible on the public cover page.
* The hidden private entrance remains separate from the journey entrance.
* Normal cover background clicks should not navigate to journey.html.
* The journey entrance is visually hidden in the lower-left corner.
* The private entrance links to login.html.
* Hidden entrances are navigation devices only.
* Hidden entrances are not access control.

### Journey Page Notes

* journey.html contains the curved path timeline prototype.
* journey.css contains journey-specific styling.
* journey.js contains journey-specific behavior.
* The journey editor remains a local/static prototype.
* The journey editor is not a secure admin system.
* The journey page uses placeholder content only.

## 2026-06-14 - Curved path timeline prototype work

### Summary

* Built the curved path timeline homepage prototype.
* Added the local editor prototype.
* Added freehand curve drawing and path-anchored node behavior.
* Kept the work static and placeholder-only.
* Did not add backend, database, auth, or real personal data.

### Timeline Prototype Notes

* The first timeline version used Area 01 through Area 04.
* Major event nodes and minor event nodes were placeholder data.
* Overview mode showed the main storyline.
* Details mode showed additional minor nodes.
* Later editor work added local editing controls.
* Freehand curve drawing allowed direct route sketching.
* Path percentage node anchoring let nodes follow the curve.
* The timeline remained a front-end prototype.
* The timeline did not add real personal biography data.
* The timeline did not add real city names.
* The timeline did not add real photos.
* The timeline did not add backend persistence.

## Ongoing Project Rules

### Data Rules

* Real private data must not be committed to GitHub.
* Secrets must not be committed to GitHub.
* Database files must not be committed to GitHub.
* Uploads must not be committed to GitHub.
* Logs must not be committed to GitHub.
* Backups must not be committed to GitHub.
* Production-only configuration must not be committed to GitHub.

### Branch Rules

* Feature work should use a Feature branch.
* Fix work should use a BugFix branch when appropriate.
* Work should not happen directly on main unless explicitly requested.
* Merges should happen only when explicitly requested.
* Pushes should happen only when explicitly requested or required by the task.

### Verification Rules

* Mark browser tests as passed only when they were actually run.
* Mark source checks as passed only when commands actually passed.
* Keep automated check output available in task summaries.
* Keep manual test gaps visible instead of implying success.
* Preserve application behavior during documentation-only changes.

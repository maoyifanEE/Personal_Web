# Personal_Web 设计指南

这个文件记录项目长期建设时必须遵守的基础原则。

当前项目仍处于早期静态预览阶段，但代码、部署和真实私人数据的边界需要从一开始就分清楚。

## Code, Deployment, and Data Ownership Model

本节定义 `Personal_Web` 的长期代码流、部署流和数据归属规则。

核心原则是：代码可以进入 GitHub，真实私人数据不能进入 GitHub。

Code is developed locally, versioned in GitHub, and deployed to the server; real private data is created during website use and stored in the server-side database, never in GitHub.

## 1. 代码流

项目代码先在本地电脑开发和测试，然后进入 GitHub，最后部署到生产服务器。

标准代码流程是：

```text
Local computer
    ↓
GitHub repository
    ↓
Production server
```

含义：

- 我在本地电脑编辑和测试代码。
- 本地测试通过后，把代码 push 到 GitHub。
- 功能分支经过检查并合并到 `main` 后，服务器从 GitHub 拉取最新 `main`。
- 服务器运行已经部署的网站。
- 服务器不应该作为日常直接编辑源代码的地方。

必须明确区分：

```text
Local = development environment
GitHub = source code repository
Server = runtime environment
```

也就是说，本地负责开发，GitHub 负责保存和审查代码历史，服务器负责运行网站。

## 2. 数据流

真实私人用户数据不走 GitHub 的代码流程。

标准数据流程是：

```text
Browser on phone/computer
    ↓
Website backend/API
    ↓
Server database
```

含义：

- 当我在网站里添加任务、健康记录、登录账号、提醒、体重记录、饮食记录或其他私人内容时，数据应从浏览器发送到服务器后端 API。
- 服务器把这些数据写入生产数据库。
- 真实用户数据绝不能提交到 GitHub。
- 真实用户数据绝不能硬编码到 HTML、CSS、JavaScript、JSON、Markdown 或 sample 文件里。
- GitHub 可以是公开仓库，但前提是它只包含代码、结构、样式、文档和明确的假数据。

## 3. Public GitHub Repository Rule

为了方便 ChatGPT/Codex 做代码审查和协作，GitHub 仓库可以是 public。

但是 public 仓库必须永远不包含：

- `.env`
- 真实数据库文件
- 真实用户数据
- 真实账号密码
- API keys
- access tokens
- SSH private keys
- production certificates
- 上传的私人文件
- backups
- server logs
- production-only configuration files

GitHub 可以包含：

- source code
- 可以公开的 static assets
- UI structure
- project documentation
- 明确是假的 sample data
- `.env.example`

判断标准很简单：陌生人看到 GitHub 仓库，也不应该看到任何能登录、访问数据库、恢复私人数据或识别真实私人记录的内容。

## 4. Environment Variables and Secrets

`.env.example` 可以提交到 GitHub，因为它只包含占位符。

`.env` 绝不能提交到 GitHub，因为它会包含真实 secrets。

真实 secrets 只能放在服务器或安全的部署环境里。生产数据库账号密码、JWT secrets、管理员密码、访问 token 等，都必须在公开仓库之外配置。

示例：

```text
.env.example      -> allowed in GitHub, contains placeholder values only
.env              -> forbidden in GitHub, contains real secrets
```

## 5. 本地开发数据

本地开发应该使用假的测试数据。

本地开发默认不应该连接生产数据库。只有在有明确、必要、已记录的原因时，才可以临时连接生产数据，并且必须非常谨慎。

可以使用的本地测试数据示例：

- `Test task 1`
- `Eat an apple`
- `Ride bike for 30 minutes`

真实个人记录不应该保存在本地仓库里，也不应该被写进示例 JSON、Markdown、HTML 或 JavaScript 文件。

## 6. 生产数据

生产服务器/生产数据库是真实用户数据的 source of truth。

如果以后有登录系统，手机浏览器和电脑浏览器应该能看到同一批数据，因为它们都登录同一个账号，并从同一个服务器数据库读取数据。

多设备同步应该通过服务器数据库完成，不应该通过 GitHub，也不应该通过本地项目文件完成。

## 7. 当前静态站点阶段警告

当前项目仍处于早期静态 HTML/CSS/JS 阶段。如果页面把数据存在 `localStorage` 或 `IndexedDB`，这只适合早期 demo。

必须理解这些限制：

- `localStorage` 数据只存在于当前浏览器里。
- 一个浏览器保存的数据，可能不会出现在另一台手机或电脑上。
- 清除浏览器数据可能会删除这些内容。
- 这不适合长期保存私人数据。
- 生产使用时，私人数据应该迁移到 backend API 和 server-side database。

因此，当前静态版本可以用来验证界面和交互，但不能当作长期私人数据系统。

## 8. Server-Side Editing Rule

不要把直接编辑生产服务器上的源代码当作正常工作流。

直接在服务器上改文件，会让服务器代码、GitHub 代码和本地代码变得不一致，也会让后续排查问题更困难。

正常变更流程应该是：

```text
local edit
    ↓
git commit
    ↓
push to GitHub
    ↓
merge to main
    ↓
server pulls/deploys latest main
```

服务器主要负责运行代码，而不是作为日常开发编辑器。

## 9. Backup Rule

生产数据和备份数据不是同一件事。

- 生产数据存在服务器数据库里。
- 备份用于灾难恢复，不用于日常编辑。
- 备份文件不应该提交到 GitHub。
- 备份应该加密，或存放在私有、安全的位置。
- backup files 应该被 Git 忽略。

备份可以帮助恢复事故，但不能成为绕过数据库和部署流程的日常数据同步方式。

## 10. Recommended Server Folder Concept

以下是概念示例，不要求当前立即实现，也不绑定具体服务器产品、数据库产品或部署系统：

```text
/var/www/Personal_Web/          # deployed public code pulled from GitHub
/etc/personal-web/.env          # private production configuration
/var/lib/personal-web/data/     # private database, uploads, and runtime data
/var/backups/personal-web/      # private backups
```

这个概念强调四件事：

- 部署代码和私人配置分开。
- 部署代码和真实运行数据分开。
- 备份和日常生产数据分开。
- GitHub 只保存可以公开的代码与文档，不保存真实私人数据。

## Related Standards

- Child app modules: `docs/05_APP_MODULES.md`
- Route and security rules: `docs/07_ROUTE_AND_SECURITY_RULES.md`
- Project structure: `docs/08_PROJECT_STRUCTURE_STANDARD.md`
- Future backend/database plan: `docs/09_BACKEND_DATABASE_PLAN.md`

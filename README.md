# Personal_Web

Personal_Web 是一个长期个人工具中心网站项目。

当前阶段：纯静态首页。

当前阶段不需要备案、不需要服务器、不需要数据库。当前也没有登录、没有用户系统、没有权限系统、没有后端。

## 如何打开

直接双击：

```text
index.html
```

或者在浏览器中打开该文件。

## 如何创建桌面快捷方式

在项目根目录打开 PowerShell，执行：

```powershell
./scripts/create_desktop_shortcut.ps1
```

创建完成后，桌面会出现：

```text
Personal_Web
```

以后双击该快捷方式即可在默认浏览器中打开网页，不会弹出终端窗口。

如果移动了项目文件夹，请重新运行脚本创建快捷方式。

## 当前文件结构

```text
Personal_Web/
├── index.html
├── styles.css
├── script.js
├── assets/
│   └── icon.svg
├── scripts/
│   └── create_desktop_shortcut.ps1
├── docs/
│   ├── PROJECT_GUIDE.md
│   └── PROJECT_HISTORY.md
├── README.md
└── .gitignore
```

## 当前阶段说明

本次只完成纯静态 homepage，用于本地验证文件结构、页面打开、Hello World 显示、本地资源引用和桌面快捷方式。

后续会逐步扩展，但本次不做部署、不做数据库、不做登录、不引入框架。

## Project Design Docs

Personal_Web 的项目定位是：个人公开网站 + 私人工具中心。

当前阶段是设计确认阶段，不急于写业务代码。`docs/` 文件夹是项目设计目标、信息架构、权限模型、视觉风格和设计决策的唯一权威记录。

重要原则：

- 先文档，后代码；
- 公开网站和私人工具中心分离；
- 隐藏入口只是视觉彩蛋，不是安全措施；
- 私人工具中心必须经过登录和权限校验；
- 子应用必须模块化，方便长期扩展。

如果网站格局、权限边界、路由结构或子应用范围发生变化，应先更新 `docs/` 中的相关文档，再修改代码。

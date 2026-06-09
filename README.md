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

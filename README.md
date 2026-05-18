# Hermes AI Native Desktop

本项目目标是做一个 macOS 本地专属 AI-native 桌面应用，以本机已部署的 Hermes Agent 作为核心 Agent runtime。

## 产品定位

这不是给 Hermes 套一层聊天 UI，而是一个本地 AI-native 工作台：

- 管理本地工作区、文件、任务、历史和产物
- 通过 Hermes 完成推理、规划、工具调用和执行
- 在桌面 App 中提供任务流、权限确认、过程可视化和结果沉淀
- 最终打包成 macOS `.dmg` 应用

## 已验证的 Hermes 本地入口

Hermes 可执行文件：

```bash
/Users/fengyue/.hermes/hermes-agent/venv/bin/hermes
```

当前状态：

- Hermes CLI 可启动
- 版本：Hermes Agent v0.13.0 (2026.5.7)
- 当前模型：deepseek-chat
- Provider：DeepSeek
- one-shot 调用已验证成功

验证命令：

```bash
/Users/fengyue/.hermes/hermes-agent/venv/bin/hermes -z '请只回复 OK'
```

返回：

```text
OK
```

可用集成入口：

```bash
# CLI 单次调用
/Users/fengyue/.hermes/hermes-agent/venv/bin/hermes -z "你的问题"

# MCP 服务
/Users/fengyue/.hermes/hermes-agent/venv/bin/hermes mcp serve

# 本地 Dashboard
/Users/fengyue/.hermes/hermes-agent/venv/bin/hermes dashboard --host 127.0.0.1 --port 9119 --no-open
```

注意：`hermes` 当前不在 PATH 中，桌面应用内需要使用绝对路径，或在应用设置里允许用户配置 Hermes 可执行文件路径。

## 建议 MVP

第一版先做一个真实可用的小闭环：

1. 选择一个本地文件夹作为 Workspace
2. 输入一个 AI Task
3. App 将 Workspace 路径和任务内容传给 Hermes
4. Hermes 执行并返回结果
5. App 保存任务记录
6. UI 展示任务历史、执行结果和日志

## 建议架构

```text
macOS Desktop App
├─ Renderer: React
├─ Main Process / Backend
│  ├─ HermesRunner
│  ├─ WorkspaceManager
│  ├─ TaskStore
│  ├─ PermissionGate
│  └─ ArtifactStore
└─ Hermes Agent
   ├─ CLI one-shot
   ├─ MCP serve
   └─ dashboard / tui optional
```

## 关键产品原则

- 聊天输入只是入口，不是整个产品
- App 要拥有自己的任务、空间、记忆、权限和产物模型
- Hermes 是引擎，不是 UI 本身
- 本地数据、本地上下文、本机工具调用是核心价值

## 下一步

搭建 Electron 或 Tauri 项目，并生成 macOS `.dmg`：

- Electron 更适合快速原型和 Node 子进程集成
- Tauri 更适合轻量体积和原生体验

建议先用 Electron 跑通 Hermes CLI/MCP 集成，再打包 DMG。

## 当前原型

- 产品与功能设计：[docs/PROTOTYPE.md](docs/PROTOTYPE.md)
- 静态界面原型：[prototype/index.html](prototype/index.html)

静态原型可以直接在浏览器中打开，用来验证首版工作台的信息架构与页面布局。后续初始化 Electron + React 项目时，可以按该原型拆成 Sidebar、Workbench、TaskTimeline、PermissionGate、ArtifactPanel 和 SettingsPanel 等组件。

## 当前应用

已按原型搭建 Electron + React + TypeScript 桌面应用。

已实现：

- Workspace 目录选择
- AI Task 输入与运行
- Hermes CLI one-shot 调用
- stdout / stderr 实时日志
- 任务时间线
- 任务历史
- 结果与日志产物
- Hermes 路径配置与连接检测
- 基础权限确认 UI
- 本地状态持久化

开发运行：

```bash
npm install
npm run dev
```

如果本机 npm cache 有权限问题，可以使用项目内 cache：

```bash
npm install --cache ./.npm-cache
```

生产构建：

```bash
npm run build
```

真实 Electron 冒烟测试：

```bash
npm run smoke
```

打包 macOS DMG：

```bash
npm run dist
```
# HDM

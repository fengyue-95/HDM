# Conversation Notes

## 目标

用户希望把本地部署的 Hermes 接入到一个 macOS 桌面应用里，并最终做成本地专属 AI-native 应用。

## 关键对话脉络

### 1. 初始想法

用户：

> 我本地部署了一个hermes，我想做一个桌面app，将hermes接进来做应用的核心，我该怎么做？

结论：

- 不建议只把 Hermes 直接揉进 UI
- 建议把 Hermes 作为本地核心服务或 Agent runtime
- 桌面 App 负责启动、连接、状态管理、任务流、历史、权限和交互

### 2. 本地 Hermes 启动验证

用户：

> 我本地启动的，你试试在命令行启动hermes

实际检查结果：

- 当前工作目录为空
- 系统中发现 Hermes 进程：

```text
/Library/Frameworks/Python.framework/Versions/3.11/Resources/Python.app/Contents/MacOS/Python /Users/fengyue/.hermes/hermes-agent/venv/bin/hermes
```

Hermes 入口：

```bash
/Users/fengyue/.hermes/hermes-agent/venv/bin/hermes
```

验证命令：

```bash
/Users/fengyue/.hermes/hermes-agent/venv/bin/hermes --help
/Users/fengyue/.hermes/hermes-agent/venv/bin/hermes status
/Users/fengyue/.hermes/hermes-agent/venv/bin/hermes -z '请只回复 OK'
/Users/fengyue/.hermes/hermes-agent/venv/bin/hermes
```

结果：

- CLI 正常
- one-shot 正常返回 `OK`
- 交互式 Hermes 正常启动并退出
- Dashboard 未运行
- Gateway 未运行
- 当前模型为 `deepseek-chat`
- Provider 为 `DeepSeek`

### 3. 关于“是不是壳子”

用户：

> 但是这么做不就是基于hermes做了层壳子吗

结论：

- 如果只是 Electron spawn `hermes -z` 或嵌 dashboard，确实只是薄壳
- 真正有价值的方向是让 App 拥有自己的业务模型：
  - Workspace
  - Task
  - History
  - Permission
  - Artifact
  - Routine
- Hermes 负责推理、规划、工具调用和执行
- App 负责上下文选择、任务流、权限确认、结果沉淀和长期复用

### 4. AI-native 本地应用方向

用户：

> 我想做个本地专属的ai native应用

结论：

建议定义为：

```text
Local AI OS / Personal Agent Workbench
```

核心能力：

- 本地上下文中枢
- 任务而不是单纯对话
- Hermes 作为 Agent runtime
- UI 围绕工作流设计
- 数据留在本地
- 能理解本机工作区
- 能操作本机工具
- 能沉淀个人自动化流程

### 5. macOS DMG 应用目标

用户：

> 嗯，帮我做个macos的dmg应用

该轮随后被用户中断，最新要求改为：

> 将这段对话挪到desktop的一个目录下作为项目目录

当前已创建项目目录：

```text
/Users/fengyue/Desktop/hermes-ai-native-desktop
```

## 推荐下一步

从该目录继续初始化桌面 App 项目。建议路线：

1. 使用 Electron + React + TypeScript 快速搭建
2. 在 main process 中实现 `HermesRunner`
3. 先支持 one-shot CLI 调用
4. 本地存储任务历史
5. 做 Workspace 选择和 Task 执行界面
6. 使用 electron-builder 打包 macOS `.dmg`

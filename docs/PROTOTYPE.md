# Hermes AI Native Desktop Prototype

## 一句话定位

Hermes AI Native Desktop 是一个 macOS 本地 AI 工作台。它不把 Hermes 包成聊天窗口，而是把本机工作区、任务、权限、执行过程、产物和历史组织成一个可持续使用的桌面应用。

## MVP 用户闭环

1. 用户选择一个本地 Workspace。
2. 用户输入一个明确任务，例如“阅读这个项目并生成架构说明”。
3. App 组合 Workspace 上下文、用户任务和权限策略，启动 Hermes 执行。
4. Hermes 返回过程日志、结果和产物路径。
5. App 保存任务记录，并把可复用的产物沉淀到 Workspace 下。
6. 用户可以继续追问、复跑、创建 Routine，或把结果导出。

## 信息架构

```text
Hermes Desktop
├─ Workbench 工作台
│  ├─ 当前 Workspace
│  ├─ Task Composer
│  ├─ Execution Timeline
│  ├─ Permission Gate
│  └─ Result / Next Actions
├─ Workspaces 工作区
│  ├─ 最近打开
│  ├─ 索引状态
│  ├─ 文件变更摘要
│  └─ Workspace 设置
├─ Tasks 任务历史
│  ├─ 运行中
│  ├─ 已完成
│  ├─ 失败 / 已取消
│  └─ 可复跑任务
├─ Artifacts 产物
│  ├─ 文档
│  ├─ 补丁
│  ├─ 报告
│  ├─ 日志
│  └─ 导出文件
├─ Routines 自动流程
│  ├─ 常用任务模板
│  ├─ 周期性检查
│  └─ 一键工作流
└─ Settings 设置
   ├─ Hermes 可执行文件路径
   ├─ Provider / Model 状态
   ├─ 权限策略
   └─ 本地数据存储位置
```

## 核心页面原型

### 1. Workbench

第一屏就是可工作的任务台，不做营销页。

- 左侧：Workspace、运行状态、历史任务入口。
- 中间：任务输入、上下文选择、执行时间线、结果摘要。
- 右侧：本次任务的上下文、权限请求、产物列表和建议下一步。

关键交互：

- `选择 Workspace`：调用系统目录选择器。
- `运行任务`：把 Workspace 路径、任务文本、上下文配置传给 Hermes。
- `权限确认`：当 Hermes 需要读写文件、执行 shell、访问网络时由 App 弹出确认。
- `过程可视化`：显示 Hermes 当前阶段，例如理解任务、扫描文件、计划、执行、总结。
- `结果沉淀`：保存任务、日志、结果和产物。

### 2. Workspaces

用于管理本地项目，而不是简单记录路径。

- 最近 Workspace 列表。
- 每个 Workspace 的索引状态、最近任务、产物数量。
- 支持 pin、移除、重新索引。
- 支持配置默认忽略目录，例如 `node_modules`、`dist`、`.git`。

### 3. Tasks

任务是产品的核心对象。

任务字段建议：

```ts
type Task = {
  id: string;
  title: string;
  prompt: string;
  workspacePath: string;
  status: "queued" | "running" | "needs_permission" | "completed" | "failed" | "cancelled";
  createdAt: string;
  completedAt?: string;
  model?: string;
  provider?: string;
  timeline: TaskEvent[];
  result?: TaskResult;
  artifacts: Artifact[];
};
```

### 4. Permission Gate

权限确认是“本地 AI-native 应用”和“聊天壳子”的分界线之一。

MVP 权限类型：

- 读取 Workspace 文件。
- 写入或修改文件。
- 执行 shell 命令。
- 访问网络。
- 打开外部应用或链接。

权限策略：

- 每次询问。
- 当前任务内允许一次。
- 当前 Workspace 内记住。
- 永久拒绝某类危险动作。

### 5. Artifacts

产物不是聊天消息附件，而是可被再次使用的工作结果。

MVP 产物类型：

- Markdown 报告。
- 执行日志。
- 代码 patch / diff。
- 文件列表。
- Hermes 原始输出。

后续可以扩展：

- 文档、表格、PPT。
- 可复用 Prompt 模板。
- 自动化 Routine。
- 任务运行快照。

## MVP 功能清单

### P0 必做

- macOS 桌面壳：Electron + React + TypeScript。
- HermesRunner：支持绝对路径调用 Hermes CLI。
- Workspace 选择和持久化。
- Task 输入、运行、取消、状态显示。
- Hermes stdout / stderr 实时日志。
- 本地任务历史保存。
- 基础权限确认弹窗。
- Settings 配置 Hermes 路径。

### P1 增强

- Workspace 文件索引和摘要。
- 任务时间线结构化展示。
- 结果保存为 Artifact。
- 任务复跑。
- 常用任务模板。
- 失败重试和错误诊断。
- Hermes Dashboard 一键打开。

### P2 AI-native 能力

- Routine：把多步任务保存为本地自动流程。
- Watch：监听文件变化并建议任务。
- Context Pack：为不同 Workspace 维护长期上下文。
- MCP 集成：让 App 通过 MCP 与 Hermes 长连接。
- 权限策略按 Workspace 细粒度配置。

## 推荐技术实现

### 前端

- Electron renderer 使用 React + TypeScript。
- 状态管理先用 Zustand 或 React Context，MVP 不必引入重框架。
- UI 以三栏工作台为主：导航栏、任务主面板、上下文侧栏。

### 主进程

```text
main
├─ HermesRunner
│  ├─ runOneShot(prompt, workspacePath)
│  ├─ streamTask(task)
│  └─ checkStatus()
├─ WorkspaceManager
├─ TaskStore
├─ PermissionGate
└─ ArtifactStore
```

### 本地存储

MVP 可用 SQLite 或 JSON 文件。

建议路径：

```text
~/Library/Application Support/Hermes Native Desktop/
├─ app.db
├─ logs/
├─ artifacts/
└─ config.json
```

## 首版界面草图说明

当前静态原型位于：

```text
prototype/index.html
```

它覆盖了首版最关键的体验：

- Workspace 状态。
- AI Task 输入。
- 运行时间线。
- 权限请求。
- 任务历史。
- 产物列表。
- Hermes runtime 状态。
- 设置入口。

这版原型可以直接作为后续 React 组件拆分蓝本。


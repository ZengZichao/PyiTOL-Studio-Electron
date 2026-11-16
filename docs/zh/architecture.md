# 架构说明

[English](../en/architecture.md) | [简体中文](../zh/architecture.md)

本文描述 PyiTOL Studio（Electron 版）的结构：进程布局、数据流、各模块职责，以及它们之间的契约。

## 总览

PyiTOL Studio 是一个三进程桌面应用：

```
┌────────────────────┐   IPC (contextBridge)   ┌────────────────────┐
│  渲染进程            │ ◄─────────────────────► │  主进程              │
│  React 18 SPA      │   window.pyitol（类型化） │  Node.js           │
└────────────────────┘                         └─────────┬──────────┘
                                                         │ stdio
                                                         │ 行分隔 JSON-RPC
                                               ┌─────────▼──────────┐
                                               │  Python sidecar    │
                                               │  pyitol 引擎 +     │
                                               │  pyitolstudio      │
                                               │  适配层              │
                                               └────────────────────┘
```

- **渲染进程** 不直接接触 Node、文件系统或网络；所有特权操作都经过 preload 桥接。
- **主进程** 拥有 `BrowserWindow`、原生对话框、设置持久化、应用菜单、自动更新器，以及 sidecar 的生命周期。
- **Python sidecar** 是唯一运行 `pyitol` 引擎的地方，是 stdio 上的逐请求无状态、行分隔 JSON-RPC 服务器。

## 源码布局

```
PyiTOL-Studio-Electron/
├─ src/
│  ├─ main/              Electron 主进程
│  │  ├─ index.ts        入口：窗口创建、CSP、生命周期、IPC 接线
│  │  ├─ sidecar.ts      SidecarManager：拉起、JSON-RPC、重启策略
│  │  ├─ ipc-project.ts  .pyitolproj 打开/保存、示例工程、最近项目
│  │  ├─ ipc-files.ts    文件选择器、读写、类型探测
│  │  ├─ ipc-upload.ts   长耗时上传与进度转发
│  │  ├─ menu.ts         应用菜单（中/英）、命令转发
│  │  ├─ store.ts        JSON 设置存储（userData/settings.json）
│  │  └─ updater.ts      electron-updater 封装（仅生产环境）
│  ├─ preload/
│  │  └─ index.ts        contextBridge → window.pyitol（类型化 PreloadApi）
│  ├─ renderer/
│  │  └─ src/
│  │     ├─ App.tsx      顶层路由（欢迎页 / 工作台）
│  │     ├─ components/  工作台、向导、命令面板、欢迎页、基础 UI
│  │     ├─ stores/      Zustand stores（project、ui）
│  │     ├─ i18n/        i18next 中/英词条（热切换）
│  │     ├─ lib/         主题、校验、语法高亮
│  │     └─ hooks/       对话框、菜单命令、键盘快捷键
│  └─ shared/
│     └─ types.ts        IPC + RPC 契约的唯一事实来源
├─ resources/
│  ├─ sidecar/
│  │  ├─ sidecar_main.py       Python sidecar 入口（开发）
│  │  ├─ pyitol-sidecar.spec   PyInstaller spec（onedir）
│  │  └─ dist/                 构建产物（打包时作为 extraResources）
│  └─ samples/                 示例工程 + 树文件（extraResources）
├─ tests/
│  ├─ smoke_roundtrip.py Python sidecar 往返测试
│  ├─ unit/              Node 单元测试（sidecar 竞态）
│  └─ e2e/               Playwright 冒烟用例
├─ electron-builder.yml  打包配置
└─ electron.vite.config.ts  构建管线（main/preload/renderer）
```

## 渲染层

- **React 18** + **Tailwind CSS v4**，状态管理用 **Zustand**。
- 两个顶层界面：**欢迎页**（新建/打开工程、示例工程、最近项目）与 **工作台**（三栏：左侧注释单元导航栏，中间数据表 + 实时模板预览，右侧检查器）。
- **i18next** 持有 `zh`/`en` 词条表；语言可在运行时热切换并持久化到设置（`ui/language`），原生菜单同步重建为对应语言。
- 状态保存在两个 Zustand store：`project`（单元、树路径、脏标记）与 `ui`（主题、语言、面板可见性）。
- 所有引擎访问都经由 `window.pyitol.sidecar.call(method, params)`。

## 主进程

### 窗口与安全基线

`src/main/index.ts` 创建的 `BrowserWindow` 具有：

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`
- 每个响应都注入 CSP；开发模式额外允许 `localhost` connect-src 与内联脚本（Vite HMR 需要）
- `setWindowOpenHandler` 拒绝一切应用内新建窗口；`https://` 链接交给系统浏览器打开
- hiddenInset 标题栏（macOS 红绿灯自定义位置）

### 未保存修改保护

渲染层通过 IPC（`set-dirty` / `check-dirty-sync`）维护脏标记。窗口关闭时主进程拦截，弹出原生 保存/丢弃/取消 对话框；选择"保存"时向渲染层转发 `save-project` 菜单命令，然后再关闭窗口。

### SidecarManager（`src/main/sidecar.ts`）

职责：

1. **路径解析** —— 开发：使用相邻项目的 `.build-venv` Python（回退 `python3`）运行 `resources/sidecar/sidecar_main.py`；生产：`process.resourcesPath/sidecar/` 下的 PyInstaller onedir 可执行文件。
2. **拉起 + 握手** —— 发送 `handshake {client, version}`，保存 `engine_version`、`pyitol_version`、`pid`。
3. **请求/响应关联** —— 每次调用分配数字 id，响应按 id 匹配；`progress` 通知以事件形式转发。
4. **超时** —— 单次调用 5 分钟（长耗时上传）。
5. **崩溃处理** —— 进程退出时拒绝所有挂起调用；以指数退避自动重启（0.5 s、1 s、2 s），最多 3 次；达到上限后发出 `crash` 事件。并发的 `start()` 共享同一个 spawn promise，因此一波调用绝不会拉起第二个 sidecar。
6. **Dispose** —— 应用退出时：取消重启定时器、拒绝挂起调用、对进程发 `SIGTERM`。

### IPC 处理器分组

| 模块             | 通道                                                                                                                                                           | 说明                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ipc-project.ts` | `project:new/open/save/save-as/load-example/recent/add-recent/clear-recent`                                                                                    | `.pyitolproj` v1，与 PySide6 版字节级兼容；最近项目保留 10 条，自动过滤已不存在的路径                                |
| `ipc-files.ts`   | `files:pick-tree/pick-template/pick-data/pick-directory/read/write/export-template/detect-type/get-temp-dir/join-path`                                         | 所有文件访问均由用户经原生对话框发起；`detect-type` 做内容嗅探（Newick 以 `;` 结尾且含括号；模板以 `DATASET_` 开头） |
| `ipc-upload.ts`  | `upload:run`、`upload:progress`、`upload:cancel`                                                                                                               | 将 sidecar `progress` 事件按请求 id 标记后转发；取消是尽力而为（引擎级中止尚未实现）                                 |
| `index.ts`       | `sidecar:call`、`sidecar:progress/crash`、`sidecar:engine-version`、`settings:*`、`platform:*`、`clipboard:*`、`menu:command`、`set-dirty`、`check-dirty-sync` | 通用管道                                                                                                             |

完整通道清单见 [IPC 参考](ipc-reference.md)。

### 设置存储（`src/main/store.ts`）

位于 `userData/settings.json` 的轻量同步 JSON 存储。在用的键：`ui/theme`、`ui/language`、`app/dirty`、`project/currentPath`、`project/recent`。

### 菜单（`src/main/menu.ts`）

按已保存语言构建。所有命令都作为 `menu:command` 事件（携带 `MenuCommand` id，见 `src/shared/types.ts`）转发给渲染层，由渲染层执行。主题单选项会调用 `nativeTheme.themeSource` 并重建菜单。

### 更新器（`src/main/updater.ts`）

`electron-updater` 封装，仅在 `app.isPackaged` 时初始化。若 `electron-builder.yml` 中没有 `publish` 配置，构建产物不含 `app-update.yml`，更新器将静默保持禁用。

## Python sidecar

`resources/sidecar/sidecar_main.py` 是唯一的 Python 入口。它：

- 从 stdin 读取行分隔 JSON-RPC 请求，
- 经 `pyitolstudio` 适配层分发（`registry`、`form_idl`、`generator_bridge`、`learner_bridge`、`tree_bridge`、`client_bridge`），
- 向 stdout 写行分隔 JSON-RPC 响应（进度通知不带 `id`），
- 仅向 stderr 记录回溯（stdout 只承载协议）。

方法：`handshake`、`list_template_types`、`build_form_idl`、`generate_template`、`learn_from_file`、`tree_leaf_ids`、`export_template_file`、`upload`。报文格式见 [Sidecar 协议](sidecar-protocol.md)。

### 打包

`pyitol-sidecar.spec` 构建 **onedir** 包（启动快，无需每次启动自解压）。`electron-builder.yml` 将 `resources/sidecar/dist` 与 `resources/samples` 作为 `extraResources` 拷入应用包，生产环境经 `process.resourcesPath` 解析 sidecar 与示例路径。

## 数据流示例

**生成预览：** 渲染层收集表单状态 → `sidecar.call('generate_template', {unit})` → 主进程经 stdio 转发 → 适配层 `generate_template_text` + `validate_separator_line` → `{text, warnings}` 沿原链路返回。

**导入（反推）模板文件：** 原生文件对话框返回路径 → `sidecar.call('learn_from_file', {path})` → 适配层 `learner_bridge` → `LearnedUnit[]` → 渲染层回填表单并把单元加入工程。

**上传到 iTOL：** `upload:run` IPC → sidecar `upload` → `client_bridge.upload_and_export` 导出模板并调用 iTOL API → `UploadResult {tree_id, files}`；进度通知流式回传到上传对话框。

**工程保存：** 渲染层序列化工程状态 → `project.save(data)` → 主进程把 `JSON.stringify(data, null, 2)` 写入当前路径（首次保存经 `save-as` 弹窗并记录 `project/currentPath`）。

## 关键不变量

1. 渲染层没有任何 Node/Electron API 访问能力 —— 一切经由类型化 preload 桥。
2. sidecar 的 stdout 只承载协议行；诊断信息一律走 stderr。
3. `.pyitolproj` v1 与 PySide6 版保持字节级兼容。
4. `src/shared/types.ts` 是所有 IPC/RPC 契约的唯一事实来源；任何一侧都不得偏离它。
5. 所有路径都来自原生对话框；渲染层从不自行构造特权文件路径。

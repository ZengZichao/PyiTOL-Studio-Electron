# PyiTOL Studio（Electron 版）

[English](README.md) | [简体中文](README.zh-CN.md)

[iTOL](https://itol.embl.de) 注释模板桌面工作台 —— 基于 Electron、React 与 Python Sidecar 重建。

PyiTOL Studio 让你在一个原生桌面应用中完成 iTOL 注释模板（数据集、树装饰、元数据、扩展）的编写、校验、预览与上传；模板的生成、解析（"反推"/learn）与 iTOL 上传由后台的 Python 引擎完成。

## 文档

所有文档均提供英文与简体中文两个版本。

| 文档                  | English                                                                | 简体中文                                                               |
| --------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 入门指南（本文件）    | [README.md](README.md)                                                 | [README.zh-CN.md](README.zh-CN.md)                                     |
| 架构说明              | [docs/en/architecture.md](docs/en/architecture.md)                     | [docs/zh/architecture.md](docs/zh/architecture.md)                     |
| Sidecar JSON-RPC 协议 | [docs/en/sidecar-protocol.md](docs/en/sidecar-protocol.md)             | [docs/zh/sidecar-protocol.md](docs/zh/sidecar-protocol.md)             |
| IPC 参考              | [docs/en/ipc-reference.md](docs/en/ipc-reference.md)                   | [docs/zh/ipc-reference.md](docs/zh/ipc-reference.md)                   |
| 开发指南              | [docs/en/development.md](docs/en/development.md)                       | [docs/zh/development.md](docs/zh/development.md)                       |
| 测试指南              | [docs/en/testing.md](docs/en/testing.md)                               | [docs/zh/testing.md](docs/zh/testing.md)                               |
| 构建与发布            | [docs/en/build.md](docs/en/build.md)                                   | [docs/zh/build.md](docs/zh/build.md)                                   |
| 设计系统              | [docs/en/design-system.md](docs/en/design-system.md)                   | [docs/zh/design-system.md](docs/zh/design-system.md)                   |
| 前端设计审查报告      | [docs/en/frontend-design-review.md](docs/en/frontend-design-review.md) | [docs/zh/frontend-design-review.md](docs/zh/frontend-design-review.md) |

## 架构

```
┌─────────────────────────────────────────────────────┐
│  Electron 主进程 (Node.js)                            │
│  ├─ BrowserWindow（sandbox、contextIsolation）        │
│  ├─ SidecarManager（stdio JSON-RPC）                 │
│  └─ IPC 处理器（工程、文件、上传、设置）                 │
├─────────────────────────────────────────────────────┤
│  Preload（contextBridge → window.pyitol）            │
├─────────────────────────────────────────────────────┤
│  渲染层（React 18 + Tailwind v4 + Zustand）           │
│  ├─ 欢迎页                                           │
│  ├─ 工作台（三栏：导航栏 / 表格+预览 / 检查器）          │
│  ├─ 模板向导                                         │
│  ├─ 命令面板（⌘K）                                    │
│  └─ i18next（中/英热切换）                             │
├─────────────────────────────────────────────────────┤
│  Python Sidecar（PyInstaller onedir 打包）            │
│  ├─ stdio JSON-RPC 服务器                             │
│  ├─ 适配层（registry、form_idl、各 bridge）            │
│  └─ pyitol 引擎（生成器、学习器、树解析、上传 API）      │
└─────────────────────────────────────────────────────┘
```

详见[架构说明](docs/zh/architecture.md)；JSON-RPC 报文格式见 [Sidecar 协议](docs/zh/sidecar-protocol.md)。

## 环境要求

- **Node.js** ≥ 20（Electron + Vite）
- **Python** ≥ 3.10，已安装 `pyitol` 引擎与 `pyitolstudio` 适配层
- **macOS** 12+（首要目标平台；arm64）

### Python 环境配置

Sidecar 封装了既有的 `pyitol` 引擎与 `pyitolstudio` 适配层：

```bash
# 在原项目目录下
cd PyiTOL-Studio-项目代码
python -m venv .build-venv
source .build-venv/bin/activate
pip install -e .
pip install pyitol  # 引擎
```

## 开发

```bash
# 安装 JS 依赖
cd PyiTOL-Studio-Electron
npm install

# 启动开发服务器（拉起 Electron + Vite HMR）
npm run dev
```

开发模式下，sidecar 从 venv 的 Python 拉起（`python3 resources/sidecar/sidecar_main.py`），因此该环境中必须可导入适配层与引擎。

### 冒烟测试（sidecar 往返校验）

```bash
cd PyiTOL-Studio-Electron
python3 tests/smoke_roundtrip.py
```

该测试验证：握手 → list_template_types → build_form_idl → generate_template → learn_from_file（往返）→ tree_leaf_ids。

### 类型检查与代码规范

```bash
npm run typecheck   # TypeScript 严格模式，零错误
npm run lint        # ESLint
npm run format      # Prettier
```

## 构建

### 1. 构建 Python sidecar

```bash
cd resources/sidecar
python -m PyInstaller pyitol-sidecar.spec --noconfirm --distpath dist --workpath build
# 输出：resources/sidecar/dist/pyitol-sidecar/（onedir 包）
```

打包规范采用 **onedir** 模式：应用可以即时启动，而不是每次启动都要把约 1 GB 的单文件包自解压到 `$TMPDIR`。

### 2. 构建 Electron 应用

```bash
npm run build      # 编译 main + preload + renderer
npm run build:mac  # electron-builder → dmg + zip（arm64）
```

`dmg` 用于手动安装。要启用 `electron-updater` 自动更新，需在 `electron-builder.yml` 中添加 `publish` 配置（填入真实的更新源 URL）——没有它，构建产物中不会包含 `app-update.yml`，更新器将保持禁用状态，而不是在每次启动时弹出网络错误。

### 签名与公证

发布构建需设置以下环境变量：

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export PYITOL_CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
npm run build:mac
```

完整清单见[构建与发布](docs/zh/build.md)。

## 关键设计决策

1. **Python sidecar，而非原生绑定** —— `pyitol` 引擎保留在 Python 中，以 PyInstaller onedir 包交付，通过 stdio 上的行分隔 JSON-RPC 通信。这使引擎保持可维护且跨平台。

2. **DESIGN.md 是唯一设计权威** —— 颜色、字体、间距、圆角与组件语法均派生自 Apple DESIGN.md，并做了四处显式覆盖（品牌色、单色树形标志、双主题、桌面密度）。

3. **单一强调色** —— 国际克莱因蓝（亮色 `#002FA7` / 深色 `#2e5cff`）。没有第二种品牌色，没有渐变，界面框架上没有阴影。

4. **`.pyitolproj` v1 字节级兼容** —— 工程文件格式与 PySide6 版本完全一致。

5. **安全基线** —— `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、CSP 严格锁定，preload 暴露类型化 API。

## 里程碑

- **M1** ✅ —— 应用外壳 + 设计系统 + sidecar 通信（生成 → 反推往返）
- **M2** —— 三栏工作台 + 数据表 + 检查器 + 实时预览
- **M3** —— 向导 + 上传 + 命令面板 + 双语
- **M4** —— 欢迎页 + 示例工程 + 打包 + 自动更新

## 许可证

MIT

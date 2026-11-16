# 开发指南

[English](../en/development.md) | [简体中文](../zh/development.md)

PyiTOL Studio 的日常开发流程：环境搭建、常用命令、约定，以及常见改动的操作手册。

## 环境要求

- Node.js ≥ 20、npm
- Python ≥ 3.10
- 一个可导入 `pyitol`（引擎）与 `pyitolstudio`（适配层）的 Python 环境 —— 见 [README](../../README.zh-CN.md#python-环境配置)。开发模式下 sidecar 优先使用相邻项目的虚拟环境 `../PyiTOL-Studio-项目代码/.build-venv/bin/python`，找不到时回退到 `PATH` 上的 `python3`。

## 常用命令

| 命令                               | 作用                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| `npm install`                      | 安装 JS 依赖                                              |
| `npm run dev`                      | electron-vite 开发服务器（HMR）；拉起 Electron 与 sidecar |
| `npm run build`                    | 编译 main + preload + renderer 到 `out/`                  |
| `npm run typecheck`                | 对 node 与 web 两套 tsconfig 做严格 TypeScript 检查       |
| `npm run lint`                     | ESLint                                                    |
| `npm run format`                   | Prettier 写入                                             |
| `npm run test:race`                | sidecar 启动/重启竞态的单元测试                           |
| `npm run build:mac`                | 生产构建 + electron-builder dmg/zip（arm64）              |
| `python3 tests/smoke_roundtrip.py` | sidecar 协议往返冒烟测试                                  |

## 项目约定

- **TypeScript 严格模式**；合并前 `npm run typecheck` 必须零错误。
- **契约统一在 `src/shared/types.ts`。** 改动 IPC 通道或 RPC 方法时，先改类型，再改两侧实现。
- **代码风格：** Prettier（`.prettierrc.yaml`）、ESLint 扁平配置（`eslint.config.ts`）。导入顺序：外部包在前，相对路径在后。
- **组件中不写硬编码 UI 文案。** 词条加入 `src/renderer/src/i18n/index.ts`（`zh` 与 `en` 两张表都要加；键名沿用 PySide6 i18n.py）。插值用 i18next 的 `{{name}}`，不用位置占位符。
- **渲染层纯净：** 组件绝不导入 `electron`、`fs`、`path`、`child_process`，只使用 `window.pyitol`。
- **状态：** 工程数据放 `project` Zustand store；面板/主题/语言放 `ui`。每次修改都要置脏标记（`window.pyitol.dirty.set(true)`）。

## 操作手册

### 新增 IPC 通道

1. 在 `src/shared/types.ts` 定义该通道的载荷/结果类型，并扩展 `PreloadApi`。
2. 在对应的 `src/main/ipc-*.ts`（通用管道类放 `index.ts`）实现处理器。
3. 在 `src/preload/index.ts` 暴露。
4. 在 [IPC 参考](ipc-reference.md)（中英两版）补一条记录。
5. `npm run typecheck`。

### 新增引擎能力（新 RPC 方法）

1. 把方法名加入 `src/shared/types.ts` 的 `RpcMethod`。
2. 在 `resources/sidecar/sidecar_main.py` 实现 `_<method>(params)` 并注册进 `_METHODS`；重量级导入写在处理器内部（懒加载），保持启动速度。
3. 适用时在 `tests/smoke_roundtrip.py` 增加一段往返校验。
4. 在 [Sidecar 协议](sidecar-protocol.md)（中英两版）补充文档。

### 新增模板类型

模板类型来自适配层注册表（`pyitolstudio.adapter.registry`），不在 Electron 应用里。在适配层注册类型后，工作台、向导与检查器会经 `list_template_types` 与 `build_form_idl` 自动识别。除非 UI 分组（`group`、`priority`、`wizard_supported`）变化，本仓库无需改动。

### 新增界面文案

1. 在 `src/renderer/src/i18n/index.ts` 的两张表里加入拼写一致的键。
2. 插值用 `{{name}}`；不要拼接翻译片段 —— 整句成键（中英文的复数与语序不同）。
3. 菜单文案独立维护：若命令出现在原生菜单，需同步修改 `src/main/menu.ts` 的 `zh ? ... : ...` 对照。

### 调试 sidecar

- sidecar 的 stderr 由主进程以 `[sidecar:stderr] …` 记录；从终端启动（`npm run dev`）即可看到。
- 不经过 UI 直接试验协议：运行 `python3 resources/sidecar/sidecar_main.py`，粘贴一行 JSON-RPC，例如
  `{"jsonrpc":"2.0","id":1,"method":"handshake","params":{"client":"cli","version":"0"}}`
- 需要复现特定引擎状态时，以 `tests/smoke_roundtrip.py` 为模板改造。

### 调试渲染层

- DevTools：视图 → 开发者工具（仅开发构建）。
- CSP 按设计阻止远程资源；需要本地字体/图片时放到 `src/renderer/src/assets` 下并 import。

## 发布流程

见[构建与发布](build.md)。简版：重建 sidecar 包 → `npm run build:mac` → 验证 dmg 可启动且能生成/反推模板 → 打 tag。

## 文档规则

每份面向用户或开发者的文档都同时存在英文与简体中文版本，按文件名一一对应放在 `docs/en/` 与 `docs/zh/`，顶部互相链接。改动本文档所描述的行为时，同一次修改里同步更新两个语言版本。见 [docs 索引](../index.md)。

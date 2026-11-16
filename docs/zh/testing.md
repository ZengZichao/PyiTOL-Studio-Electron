# 测试指南

[English](../en/testing.md) | [简体中文](../zh/testing.md)

PyiTOL Studio 的三个测试层、各自的覆盖范围与运行方法。

## 测试分层

| 层级                 | 位置                          | 运行方式              | 前置条件                                            |
| -------------------- | ----------------------------- | --------------------- | --------------------------------------------------- |
| Sidecar 协议冒烟测试 | `tests/smoke_roundtrip.py`    | 纯 Python             | 一个可导入 `pyitol` + `pyitolstudio` 的 Python 环境 |
| Sidecar 竞态回归     | `tests/unit/sidecar-race.cjs` | `npm run test:race`   | `dist/` 中有打包产物（来自 `npm run build:mac`）    |
| E2E 冒烟             | `tests/e2e/smoke.spec.ts`     | `npx playwright test` | `out/` 中有编译产物（`npm run build`）              |

## 1. Sidecar 往返冒烟测试

```bash
python3 tests/smoke_roundtrip.py
```

以子进程方式拉起 `resources/sidecar/sidecar_main.py`，走完整协议：

1. `handshake` —— 断言返回引擎版本
2. `list_template_types` —— 断言注册类型 ≥ 20
3. 对 `dataset_colorstrip` 调 `build_form_idl`
4. `generate_template` —— 断言文本含表头与数据行
5. 把生成文本写入临时文件后 `learn_from_file` —— 断言反推单元与原始一致（类型、标签、分隔符、3 行数据）—— 即**往返**保证
6. 对 `resources/samples/example_tree.nwk` 调 `tree_leaf_ids`

退出码 0 = 通过。这是验证 Python 侧健康最快的方式；引擎、适配层或 sidecar 有改动时都应运行。

## 2. Sidecar 竞态回归（`npm run test:race`）

`tests/unit/sidecar-race.cjs` 用 esbuild 打包真实的 `src/main/sidecar.ts`（stub 掉 `electron`、插桩 `child_process`），驱动 `SidecarManager` 对**打包后的 onedir sidecar 可执行文件**运行。覆盖曾导致拉起两个 sidecar 进程的启动竞态：

1. 并发 `start()` 只拉起一个进程；
2. 计划重启期间到达的 `start()` 会等待重启，而不是再次拉起；
3. `dispose()` 取消已计划的重启（不产生僵尸进程）。

```bash
npm run build:mac    # 先打包（测试启动 dist/mac-arm64/…）
npm run test:race
```

## 3. Playwright E2E 冒烟

`tests/e2e/smoke.spec.ts` 经 `_electron.launch` 启动编译后的 Electron 应用（环境变量中剔除 `ELECTRON_RUN_AS_NODE`），走查 UI：

- 应用窗口无渲染错误加载，
- 命令面板可打开（合成 ⌘K keydown），
- 基础工作台交互。

`playwright.config.ts` 固定 `workers: 1`（Electron 测试必须串行）、重试一次、失败截屏、首次重试记录 trace。

```bash
npm run build          # 编译 out/
npx playwright test
```

## 静态检查

```bash
npm run typecheck   # 严格 TypeScript（node + web 两套 tsconfig）—— 必须零错误
npm run lint        # ESLint 扁平配置
npm run format      # Prettier 检查/写入
```

## 何时跑什么

| 改动                                   | 运行                                                            |
| -------------------------------------- | --------------------------------------------------------------- |
| 渲染层 UI                              | `npm run typecheck && npx playwright test`                      |
| IPC 处理器 / preload / sidecar 管理器  | `npm run typecheck && npm run test:race`                        |
| Python 引擎 / 适配层 / sidecar_main.py | `python3 tests/smoke_roundtrip.py`                              |
| 打包配置 / electron-builder.yml        | `npm run build:mac` + [构建后检查清单](build.md#构建后检查清单) |
| 每次发布前                             | 以上全部                                                        |

## 编写新测试

- **协议行为** → 扩展 `tests/smoke_roundtrip.py`（在最终 return 前加一步）。
- **SidecarManager 生命周期** → 扩展 `tests/unit/sidecar-race.cjs`（它 stub 了 `electron`；保持打包方式）。
- **用户可见流程** → 扩展 `tests/e2e/smoke.spec.ts`；优先用合成 DOM 事件（`page.evaluate` + `KeyboardEvent`）而非操作系统级按键注入，并记住 `workers: 1`。

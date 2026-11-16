[English](../en/frontend-design-review-v2-20261027.md) | **简体中文**

# PyiTOL Studio 前端设计审查报告（v2）

> **状态更新（2026-10-27）**：本报告列举的问题已全部处理，修复明细见 [frontend-fix-report-20261027.md](frontend-fix-report-20261027.md)。

> 项目：PyiTOL Studio（Electron 桌面应用，macOS 优先）
> 版本：0.3.0（package.json）
> 审查日期：2026-10-27
> 审查范围：`src/renderer`（React 18 + Tailwind v4 + Zustand）、`src/preload`、`src/main` 中与前端体验直接相关的窗口/菜单/IPC 层、构建产物 CSS、E2E 测试现状
> 审查性质：**只读诊断**。本报告未修改、未删除任何源文件；第一轮报告现位于 `docs/zh/frontend-design-review.md`（2026-10-26），原样保留，本文件为其后续版本。
> 审查方法：全部 33 个前端源文件逐行走查（约 4,500 行 renderer + 1,200 行 main/preload/shared）＋ 构建产物 CSS 反查 ＋ WCAG 2.x 对比度复算 ＋ `tsc --noEmit` 全量类型检查 ＋ Playwright 测试结果与构建产物比对

---

## 目录

1. [结论摘要](#1-结论摘要)
2. [上一轮报告（10-26）修复情况核对](#2-上一轮报告10-26修复情况核对)
3. [评分](#3-评分)
4. [P0 问题（阻断级）](#4-p0-问题阻断级)
5. [P1 问题](#5-p1-问题)
6. [P2 问题](#6-p2-问题)
7. [P3 问题](#7-p3-问题)
8. [做得好的部分（应保持）](#8-做得好的部分应保持)
9. [逐文件问题索引](#9-逐文件问题索引)
10. [修复路线图（建议顺序）](#10-修复路线图建议顺序)

---

## 1. 结论摘要

自上一轮审查（10-26）以来，代码经历了**一轮大规模、高质量的修复**：上一轮 5 个 P0 中 4 个已确认修复，设计令牌体系整体重建完成，可访问性从"零覆盖"提升到"主干覆盖"。**设计系统层面已经从"失效"进入"可用且相当规范"的状态。**

但当前版本存在一个鲜明的特征：**框架修好了，接线没接完**。多个新修或原有的功能只完成了"一半"——分发端修好了、消费端缺失；UI 做了、数据源没接；组件写了、参数没传。这产生了一批新的 P0/P1：

- **拖拽导入在 Electron 45 上整体失效**（`File.path` 已被移除，代码仍依赖它）；
- **`sidecar:call` 携带的 `AbortSignal` 无法通过 IPC 序列化**（疑似导致预览请求全部抛错，需运行时复核）；
- **菜单 ⌘E（导出模板）/ ⌘I（导入模板）派发的事件无人监听**，点了没反应；
- **菜单 ⌘R（生成预览）只把 loading 置真**，不触发任何生成，预览区可能卡在"加载中"；
- **IDL 加载失败的错误标记写入了缓存，但检查器 UI 从不读取它**，失败时仍永久显示"加载中"；
- **"最近工程"列表永远为空**——读取端存在，写入端（`addRecentProject`）从未被任何代码调用；
- **关闭时"保存"路径存在 500ms 竞态**，对从未保存过的工程会绕过对话框直接销毁窗口；
- **E2E 测试套件全红**：测试启动 `out/main/index.js`，构建产物实际是 `out/main/index.cjs`，11 个用例全部超时失败。

**总体判断：这是一次值得肯定的重构，界面骨架与设计系统已经达标；下一步的工作重心应从"写组件"转向"端到端接线与真实运行验证"。**

---

## 2. 上一轮报告（10-26）修复情况核对

| 旧编号                         | 旧问题                                                      | 现状                                        | 证据                                                                                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LAY-01                         | 间距令牌 `--space-*` 命名空间错误，29 类 / 190 处全部未生成 | ✅ **已修复**                               | `globals.css:123-131` 令牌迁入 `@theme` 的 `--spacing-*`；构建产物 `out/renderer/assets/index-Cab0j139.css:970-1057` 实测含 `.p-sm{padding:var(--spacing-sm)}`、`.gap-xs`、`.px-sm`、`.py-xs` 等                         |
| MAC-01                         | 红绿灯压工具栏、窗口不可拖动                                | ✅ **已修复**                               | `Workbench.tsx:377` 工具栏 `paddingLeft: 80` 安全区 + `drag-region`；`globals.css:273-279` 定义 `.drag-region/.no-drag` 并在全部工具栏按钮上使用                                                                         |
| FLW-01                         | 菜单命令无限递归                                            | ✅ **已修复**（但产生新问题，见 P1-2/P1-3） | `useMenuCommands.ts` 注释明确禁止回环；处理函数直接调 store action，不再把 IPC 命令再派发回同名事件                                                                                                                      |
| FLW-02                         | 向导搜索写入 Promise → 白屏                                 | ✅ **已修复**                               | `WizardDialog.tsx:52-53,92-99` 受控 `typeQuery` + 独立 `allTypes` 全集 + `useMemo` 过滤 + 空态/加载态；`main.tsx:9` 已挂 ErrorBoundary                                                                                   |
| CMP-01                         | 分隔条闭包捕获旧宽度                                        | ✅ **已修复**                               | `Splitter.tsx:50-57` 绝对宽度模式（`startSize + 总位移`）+ `setPointerCapture` + 扩展热区                                                                                                                                |
| FLW-03                         | 无保护的数据丢失路径                                        | 🟡 **大部分修复**                           | 删除单元/清空数据/重置参数/向导关闭均已加确认；`isDirty` 已接入窗口关闭拦截（`main/index.ts:90-118`）。**残留**：粘贴整表替换仍无确认（P1-6）；保存-关闭存在竞态（P1-5）                                                 |
| TKN-01                         | `@theme` 自引用                                             | ✅ **已修复**                               | `globals.css:22-141` 全部为真实值；注释明确禁止 `--x: var(--x)`                                                                                                                                                          |
| TKN-02                         | 深色主题缺陷（白底白字、chip 未定义、硬编码浅底）           | ✅ **已修复**                               | `.dark` 补齐 `--color-surface-chip` 等 19 个令牌；`.btn-utility` 前景改用 `--color-canvas`；语义色 danger/success/warning/accent-surface 均有暗色值                                                                      |
| 对比度不达标                   | ink-subtle 4.29 / 错误红 4.13 等 6 类不达标                 | 🟡 **大幅改善，2 处临界**                   | 亮色 ink-subtle #6e6e73→**5.07:1**✅、danger #c92a2a→**5.46:1**✅；暗色 accent #4d74ff→**≈4.21:1**、warning #b6650a→**≈4.34:1**，用于 12px 小字仍略低于 4.5（见 P2-8）                                                   |
| ARIA 覆盖为 0                  | 无 role/dialog/switch/separator                             | ✅ **已修复（主干）**                       | 四个对话框均有 `role="dialog" aria-modal`；命令面板有 combobox/listbox/option/activedescendant；开关有 `role="switch" aria-checked`；分隔条有 `role="separator"`；标签有 `htmlFor`；更新提示有 `role="status" aria-live` |
| 假虚拟化 + 闲置依赖            | slice(10000)，tanstack 未用                                 | ❌ **未修复**（上限降为 5000）              | `Workbench.tsx:699-700`；`@tanstack/react-table`、`@tanstack/react-virtual` 全项目 0 引用                                                                                                                                |
| 菜单全英文                     | 原生菜单无本地化                                            | ✅ **已修复**                               | `menu.ts` 全量 zh/en 双语 + `rebuildMenu()` + radio 选中态 + DevTools 仅开发模式可见                                                                                                                                     |
| ⌘R 与 reload 冲突              | 可能丢失数据                                                | ✅ **已修复**                               | View 菜单已移除 `role:'reload'`；但 ⌘R 现在是无效命令（新问题 P1-3）                                                                                                                                                     |
| `user-select: none` 全局禁复制 | 无法复制数据                                                | ✅ **已修复**                               | `globals.css:218-227` 为 pre/code/td/th/input/textarea/[data-selectable] 恢复 `user-select: text`                                                                                                                        |
| 上传对话框 /tmp 明文 Key       | 硬编码 `/tmp`、永不删除                                     | 🟡 **部分修复**                             | 改用 `os.tmpdir()` + 时间戳文件名；成功后覆写为空串。**残留**：失败路径不清 This 理且覆写≠删除（P1-7）；文案仍写"不存储"与实现矛盾                                                                                       |
| 17px 触屏密度                  | 7 种控件高度、营销页字号                                    | ✅ **已修复**                               | 基准 13px、caption 12 / fine-print 11；按钮 min-height 32、工具条 44、表格行≈36px，密度达到桌面工具水准                                                                                                                  |
| 无 Error Boundary              | 渲染异常即白屏                                              | ✅ **已修复**                               | `components/ui/ErrorBoundary.tsx` + `main.tsx` 挂载；提供 Reload 恢复 UI                                                                                                                                                 |
| 语言切换 `<html lang>` 固定 en | 读屏语言错误                                                | ✅ **已修复**                               | `App.tsx:51` `document.documentElement.lang = language`                                                                                                                                                                  |

**小结：22 项遗留问题中 15 项确认修复、3 项部分修复、4 项未修复/降级处理。**

---

## 3. 评分

| 维度           |    上轮 |        本轮 | 说明                                                                   |
| -------------- | ------: | ----------: | ---------------------------------------------------------------------- |
| 设计系统可用性 |     1.5 |     **4.5** | 令牌全部入 `@theme`，构建产物验证生成；语义色/阴影/焦点环/动效降级齐备 |
| 布局与节奏     |     1.0 |     **4.0** | 间距系统真实生效；密度统一为桌面规格；最小宽度下中栏过窄问题仍在       |
| 视觉一致性     |     2.0 |     **4.0** | 圆角/阴影/按钮四态统一；残留少量内联样式补丁（280 处）                 |
| 深色主题       |     2.0 |     **4.5** | 令牌级双主题；两处小字对比度临界                                       |
| 交互反馈       |     1.5 |     **3.5** | 按钮 hover/disabled 齐备；但保存/导出成功仍无 Toast 反馈               |
| 状态设计       |     1.5 |     **3.0** | 空态/加载态/确认框补齐；IDL 失败态 UI 未消费、⌘R 假加载是新洞          |
| 可访问性       |     1.0 |     **3.5** | ARIA 主干覆盖、焦点陷阱、reduced-motion；分隔条键盘操作是空转的        |
| 桌面平台适配   |     1.5 |     **4.0** | drag region、安全区、菜单本地化、关闭保护；⌘⇧W 惯例违例仍在            |
| 国际化         |     2.0 |     **3.0** | 菜单/动态 lang 已修；8 个关键确认文案缺 zh 词条、若干硬英文残留        |
| 性能与工程     |     2.0 |     **2.5** | 预览防抖+竞态保护已加；假虚拟化、E2E 全红、280 处内联样式未动          |
| **综合**       | **1.7** | **3.6 / 5** | 设计系统与平台适配已达标；功能接线与运行验证是当前短板                 |

---

## 4. P0 问题（阻断级）

### P0-1 `sidecar:call` 传入 `AbortSignal`，IPC 序列化必然失败（疑似，需运行时复核）

**位置**：`src/preload/index.ts:22-28`、`src/renderer/src/components/workbench/Workbench.tsx:106-110`

preload 的 `sidecar.call` 把 `{ signal: ac.signal }` 原样传入 `ipcRenderer.invoke('sidecar:call', method, params, opts)`。Electron 的 `invoke` 参数走结构化克隆，**`AbortSignal` 不可克隆**——含该参数的调用会在渲染进程侧直接抛出 `Error: An object could not be cloned`，请求根本不会到达主进程。

Workbench 的 `generatePreview` 是**唯一**带 signal 的调用方，且每次预览都传。若该判断成立，则**预览功能在全场景下不可用**（预览区显示"生成失败：An object could not be cloned"）。本报告基于静态分析给出该结论，置信度高，但因未能运行应用，标注"疑似"。

**次要问题**：即使不抛错，主进程侧 `ipcMain.handle('sidecar:call', (…, method, params) => …)` 也只接收三个参数，第四个 `opts` 被忽略——中止能力在主进程根本没有实现，是"信号发了个寂寞"。

**建议**：`sidecar.call` 不透传 signal 对象；改为发 `sidecar:cancel` 通道消息 + 主进程侧按请求 id 丢弃过期响应，或在主进程实现真正的中止。

### P0-2 拖拽导入在 Electron 45 上整体失效

**位置**：`src/renderer/src/App.tsx:153-157`

```tsx
// @ts-expect-error — Electron extends File with .path
const filePath: string | undefined = file.path
```

`File.path` 自 Electron 32 起已被移除（Electron 45 实测安装版本），正确 API 是 preload 中的 `webUtils.getPathForFile(file)`。当前代码在每个文件上取到的都是 `undefined`，随后 `continue` 静默跳过——**拖入任何文件都没有任何反应**，也没有错误提示。

而产品在两处明确承诺此功能：欢迎页"将 Newick 树或 iTOL 模板文件拖入窗口即可开始"（i18n `welcome.drop_hint`）、拖拽遮罩"释放以导入文件"。**承诺的功能完全不可用，且无失败反馈。**

**建议**：preload 暴露 `getPathForFile(file: File)`（内部用 `webUtils.getPathForFile`）；对取不到路径/不支持的类型给出可见的失败提示（当前 4 个 `catch {}` 全部静默）。

### P0-3 E2E 测试套件全红：入口文件名不匹配

**位置**：`tests/e2e/smoke.spec.ts:25`、`package.json:3`、构建产物

smoke 测试以 `out/main/index.js` 启动应用，但 `electron.vite.config.ts` 的输出配置是 `entryFileNames: '[name].cjs'`，实际产物为 `out/main/index.cjs`（已用 `ls` 证实）。结果：`beforeAll` 60 秒超时，`test-results/.last-run.json` 记录 **11 个用例全部 failed**。

这意味着当前项目**没有任何一条绿色的前端自动化保障**，上述 P0-1/P0-2 这类运行时问题也因此长期未被发现。

**建议**：启动路径改为 `out/main/index.cjs`；随后把 E2E 恢复为 CI 门禁，并优先为"预览生成、拖拽导入、⌘E/⌘R 菜单"补用例（正好覆盖本报告的 P0）。

---

## 5. P1 问题

### P1-1 菜单 ⌘E / ⌘I 派发的事件无人监听，命令无效

**位置**：`src/renderer/src/hooks/useMenuCommands.ts:112,116`

上一轮的无限递归修复采用了"改派发到别的事件名"的方案：

```ts
case 'export-template':
  window.dispatchEvent(new CustomEvent('workbench-export'))
  break
case 'import-template':
  window.dispatchEvent(new CustomEvent('workbench-import'))
  break
```

但全项目检索证实 `workbench-export` / `workbench-import` **没有任何 addEventListener**（仅这两处 dispatch）。于是：

- 菜单 `命令 > 导出当前模板…`（⌘E）→ 无任何反应；
- 菜单 `文件 > 导入模板…`（⌘I）→ 无任何反应。

（工具栏的导出按钮走的是 `Workbench.handleExport` 本地实现，不受影响——这正说明正确的做法是让 `useMenuCommands` 直接调用与按钮同一个 store action / 回调，而不是发明一个没人听的事件。）

### P1-2 菜单 ⌘R（生成预览）只置 loading，不触发生成，可把预览区卡死在"加载中"

**位置**：`useMenuCommands.ts:104-108`、`Workbench.tsx:927-934`

```ts
case 'generate-preview':
  useProjectStore.getState().setPreviewLoading(true)
  break
```

它没有调用任何生成逻辑。后果分两种：

- 预览已有文本：`previewLoading` 置真但界面无任何变化（`PreviewPanel` 只在 `loading && !text` 时显示加载），用户以为刷新了，实际什么都没发生；
- 预览为空（如刚切到一个参数出错的单元、或生成曾失败）：预览区**永久停留在"加载中"**，直到某次参数编辑触发防抖重算。工具栏的刷新按钮（`handlePreviewRefresh`）调用的是 Workbench 内部的 `generatePreview`，工作正常——同样的动作存在"按钮有效、菜单无效"的双轨实现。

### P1-3 IDL 加载失败写了 `_error` 标记，检查器 UI 从不读取，仍永久"加载中"

**位置**：`Workbench.tsx:159-163`（写入）与 `Workbench.tsx:1112-1117`（消费）

catch 分支确实把带 `_error: true` 的空 IDL 写入缓存（这是对上轮"失败被吞"的修复），**但**：

1. `FormIdl` 类型没有 `_error` 字段，靠 `as FormIdl` 强转塞入；
2. `InspectorPanel` 的空态判断只有 `groups.length === 0 → 显示 common.loading`，没有任何 `_error` 分支。

净效果与上轮完全相同：sidecar 失败/超时后，检查器永远显示"加载中"，且因为错误结果进了 `idlCache`，**切走再切回来也不会重试**。

### P1-4 "最近工程"永远为空：写入端从未被调用

**位置**：`src/renderer/src` 全局（0 处调用）

`window.pyitol.project.addRecentProject` / `clearRecentProjects` 在 preload（`index.ts:63-67`）与主进程（`ipc-project.ts:153-170`）均已实现，但渲染层没有任何调用。欢迎页的"最近工程"区块（`WelcomePage.tsx:128-163`）读到的永远是空数组，永远显示"暂无最近工程"。打开/另存工程成功后应调用 `addRecentProject(path, name, unitCount)`——这条接线不存在。

### P1-5 关闭窗口"保存"路径的 500ms 竞态会绕过保存直接销毁窗口

**位置**：`src/main/index.ts:104-111`

```ts
if (choice === 0) {
  mainWindow?.webContents.send('menu:command', 'save-project')
  setTimeout(() => {
    forceClose = true
    mainWindow?.close()
  }, 500)
}
```

对**已有路径**的工程，保存是同步写文件，500ms 内基本完成，侥幸可用。但对**从未保存过**的工程，`save-project` 会在渲染层转入 `saveProjectAs` → 弹出系统另存对话框——用户可能停留数分钟。500ms 后 `forceClose = true` 无条件触发 `mainWindow.close()`：用户还在"保存"对话框前操作，主窗口已被销毁，无论之后选保存还是取消都已无意义。用户明确选择了"Save"，结果数据照丢。

**建议**：由渲染层在保存流程真正结束（成功/取消）后回调主进程再决定关闭；或至少在另存被取消时不关闭。

### P1-6 表格粘贴仍无条件整体替换列与行

**位置**：`Workbench.tsx:605-626`（容器 onPaste）与 `:721-739`（"粘贴 TSV"按钮）

在表格区域按 ⌘V 或点击"粘贴 TSV"，会直接以剪贴板第一行为新列头、整体替换 `columns` 与 `data_rows`——没有预览、没有确认、没有撤销。误按 ⌘V 一次即可清掉整张手输的数据表（上轮 FLW-03 的残留项）。

**建议**：至少加一条确认（"将以 N 行 × M 列替换当前 K 行数据？"）；中期改为"追加/替换"双选 + 撤销栈。

### P1-7 上传 API Key 的清理不在 finally 中，失败路径明文残留；文案与实现矛盾

**位置**：`UploadDialog.tsx:99-125`

- Key 写入 `os.tmpdir()/pyitol_api_key_<ts>.txt` 后，只有**成功**分支会覆写为空串；`catch` 分支（上传失败）直接跳过清理——明文 Key 永久留在临时目录。覆写为空串也不等于删除文件。
- i18n `upload.key_hint`（zh）写的是"密钥仅传给本地 Python 引擎，**不存储**"，与"写入磁盘临时文件"的实现直接矛盾。

**建议**：清理移入 `finally` 并改用真正的删除；文案改为如实描述（"仅写入系统临时目录，上传后清除"），或干脆走内存/安全存储通道。

---

## 6. P2 问题

### 功能与状态

| #    | 问题                                              | 位置                                               | 说明                                                                                                                                                                                                   |
| ---- | ------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2-1 | 切换语言会清空向导已填参数与列                    | `WizardDialog.tsx:102-129`                         | IDL 拉取 effect 依赖 `language`；语言切换触发重新拉取，成功回调无条件 `setColumns(required_columns)` + `setParameters(默认值)`，第 1/2 步已填的数据被静默重置                                          |
| P2-2 | 假虚拟化（slice 5000）+ 两个 tanstack 依赖 0 引用 | `Workbench.tsx:699-700`、`package.json:21-22`      | 上轮遗留；5,000 行 × N 列仍会生成数万 DOM 节点。要么接入 `@tanstack/react-virtual`，要么删除依赖并如实标注上限                                                                                         |
| P2-3 | 命令面板"删除单元"绕过确认                        | `CommandPalette.tsx:92-98`                         | 单元列表的删除有 `window.confirm`，⌘K 面板里的同名命令直接 `removeUnit`——同一破坏性操作两条路径两种保护                                                                                                |
| P2-4 | 上传"取消"实际不取消                              | `ipc-upload.ts:32-36`（主进程 no-op）              | 前端 abort 只让 Promise reject、UI 回到 idle，sidecar 上传继续在后台跑并可能写文件。代码注释已自知，但 UI 没有告知用户"取消未生效"                                                                     |
| P2-5 | 逗号分隔的颜色列表永远校验失败                    | `lib/validate.ts:43-49` vs `IdlWidget.tsx:172-174` | widget 按 `range==='comma'` 用逗号拼接写回，校验却只按 `/\s+/` 切分 → `"#fff000,#00ff00"` 整串匹配失败，字段恒红。校验需与 widget 的分隔符口径一致                                                     |
| P2-6 | 预览重算时无"陈旧数据"指示                        | `Workbench.tsx:99-102`                             | 仍只在 `!text` 时显示 loading；有文本时防抖+重算期间（最长 300ms+IPC）旧内容无任何标记，用户可能复制到过期模板                                                                                         |
| P2-7 | 最小窗口 900px 时中栏仅剩 ~250px                  | `main/index.ts:44`、`Workbench.tsx` 布局           | 上轮遗留：280+5+360+5=650，中间数据表基本不可用；仍无"窄窗自动折叠检查器"逻辑                                                                                                                          |
| P2-8 | 暗色 accent 与 warning 用于 12px 小字对比度临界   | `globals.css:166,178`                              | 实算 #4d74ff/#1d1d1f ≈ **4.21:1**、#b6650a/#ffffff ≈ **4.34:1**，均低于 4.5。当前用于语法高亮 section（12px, 600）与深色链接/高亮标题，建议各再提亮一档（如 #6b8bff / #d9832e）或仅用于 ≥14px 600 字重 |

### 国际化

| #     | 问题                                             | 位置                                                                                                                                                                                                                                                                                                            |
| ----- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-9  | 8 个用户可见文案缺 zh 词条，中文界面回退英文     | `ctx.delete_confirm`、`table.ctx_clear_confirm`、`inspector.reset_all_confirm`、`inspector.idl_failed`、`cmd.no_results`、`common.select_all`、`common.deselect_all`、`update.downloading_auto`——全部以 `defaultValue: '英文'` 兜底且 i18n 表中无定义，中文用户在**删除确认、清空确认、全选**等关键节点看到英文 |
| P2-10 | 硬编码英文残留                                   | 单元列表 `{n} rows`（Workbench:572）、检查器头部 `rows`（:1074）、上传对话框 `({n} rows)`（UploadDialog:361）、"Showing N of M rows"（Workbench:836）                                                                                                                                                           |
| P2-11 | 对 `table.footer_count` 做正则字符串手术拼接行数 | `WizardDialog.tsx:466` `t(...).replace(/.*\//, '')` + 硬编码 `columns`；应为独立词条 `{rows} 行 · {cols} 列`。另 `Workbench.tsx:482` 对 `nav.tree_meta` 做 `.split('·')[0]` 同病（上轮遗留）                                                                                                                    |
| P2-12 | i18n 死键：26 条 `app.status_*` 定义后从未使用   | `i18n/index.ts`——状态栏至今不存在，这些"已保存/已导出/已导入"反馈词条全部闲置，而保存/导出成功恰好**没有任何 UI 反馈**                                                                                                                                                                                          |

### 可访问性

| #     | 问题                             | 位置                                                                                                                                                                                                      |
| ----- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-13 | 分隔条的键盘操作是空转的         | `Splitter.tsx:94-100` 支持 ←/→/↑/↓ 并调用 `onResize(±8)`，但 Workbench 三处全部传 `onResize={() => {}}`（:283,:301,:322）——`role="separator"` + `tabIndex=0` + `aria-valuenow` 都在，按方向键没有任何效果 |
| P2-14 | 单元删除按钮键盘不可见           | `Workbench.tsx:577` `opacity-0 group-hover:opacity-100`——Tab 聚焦到删除按钮时它仍是透明的（没有 `group-focus-within`），键盘用户在操作一个看不见的按钮                                                    |
| P2-15 | ErrorBoundary 恢复界面硬编码英文 | `ErrorBoundary.tsx:53,79` "Something went wrong"/"Reload"，且只有一个根级边界，对话框内错误会连整个应用一起卸载                                                                                           |

---

## 7. P3 问题

| #     | 问题                                                                                                                      | 位置                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| P3-1  | `btn-secondary` / `btn-utility` / `input-search` 三个组件类零使用（死代码）                                               | `globals.css:330-388,443-458`                                                         |
| P3-2  | `reorderUnits`（0 调用，无拖拽排序 UI）与 `toggleUnitHidden`（空实现，且 `set({ isDirty: false })` 会**错误清除脏标记**） | `stores/project.ts:125-141`                                                           |
| P3-3  | `watchSystemTheme` 定义后仅 1 处引用且未被调用链使用；主题监听在 App 内自行实现                                           | `lib/theme.ts:19-24`                                                                  |
| P3-4  | 窗口标题固定 "PyiTOL Studio"，不显示工程名与脏标记；`index.html:2` `lang="en"` 由 App 运行时改写，首帧闪英文              | `index.html`、`App.tsx:55-63`（恢复设置在首帧 effect 中，中文用户冷启动首屏短暂英文） |
| P3-5  | ⌘⇧W 用作向导快捷键，违反 macOS"关闭所有窗口"惯例                                                                          | `menu.ts:38`、`useKeyboardShortcuts.ts:21`                                            |
| P3-6  | 关闭确认对话框（Save/Discard/Cancel 及全部文案）硬编码英文                                                                | `main/index.ts:95-103`                                                                |
| P3-7  | sidecar 开发路径硬编码本机绝对路径 `.build-venv/bin/python`，换机器只能回退系统 python3                                   | `sidecar.ts:31-33`                                                                    |
| P3-8  | 全 renderer 约 280 处内联 `style={{…}}`，主题值靠 `var(--*)` 救场，但 hover/密度覆盖仍需内联补丁                          | 各组件（Workbench 75 处、UploadDialog 40、Wizard 63…）                                |
| P3-9  | StrictMode 开发态 effect 双执行 → 握手/IDL 请求重复发起（有 abort/缓存兜底，仅浪费）                                      | `main.tsx:8`                                                                          |
| P3-10 | 启动 `backgroundColor: '#1d1d1f'` 对浅色主题用户是黑闪（上轮白闪的反向问题）                                              | `main/index.ts:49`                                                                    |
| P3-11 | 空态表格容器上挂 `onPaste`，div 不可聚焦，该处理器实际不可达                                                              | `Workbench.tsx:630`                                                                   |
| P3-12 | 向导颜色文本框不校验即参与生成，非法值只能靠 sidecar 报错兜底                                                             | `WizardDialog.tsx:539-545`                                                            |

---

## 8. 做得好的部分（应保持）

1. **设计令牌体系重建质量高**：全部工具类令牌集中在 `@theme`，注释写明规则（"不得自引用"":root 只是普通变量"），构建产物验证类名真实生成——上轮最致命的系统性失效已根除。
2. **双主题完整**：19 个语义色 + 阴影 + 焦点环 + 滚动条 + `color-scheme` + `accent-color` 全部亮暗成对；语法高亮也做了主题对（`.dark .hl-value-color`）。
3. **对话框基建 `useDialog` 统一**：焦点陷阱、Esc、初始焦点、焦点归还、滚动锁定，四个对话框全部复用——这是正确的抽象层。
4. **命令面板是全应用可访问性最好的组件**：combobox/listbox/option/activedescendant、键盘导航 + `scrollIntoView`、分组 aria-label 一应俱全，可作为其他列表组件的范本。
5. **预览链路的防抖 + AbortController 竞态保护 + 过期丢弃**模式正确（问题只在 IPC 序列化层，见 P0-1）。
6. **危险操作确认基本补齐**：删除单元、清空数据、重置参数、向导放弃输入（含 `confirmDiscard` 二级确认）。
7. **macOS 适配到位**：80px 红绿灯安全区、drag/no-drag 体系、原生菜单双语 + radio 选中态 + rebuild、DevTools 仅开发可见、外链一律系统浏览器。
8. **安全基线稳定**：contextIsolation/sandbox/CSP/外链管控/`shell.openExternal` 仅 https；高亮器先转义再注入，`dangerouslySetInnerHTML` 无 XSS 面。
9. **`tsc --noEmit`（web + node）全量通过**，类型链路（shared → preload → renderer）维护得好。

---

## 9. 逐文件问题索引

| 文件                                       | 位置                 | 问题                                                | 级别            |
| ------------------------------------------ | -------------------- | --------------------------------------------------- | --------------- |
| `preload/index.ts`                         | 22-28                | signal 透传 IPC 不可克隆；主进程也未实现中止        | **P0-1**        |
| `renderer/App.tsx`                         | 153-157              | `File.path` 在 Electron 45 已移除，拖拽导入失效     | **P0-2**        |
| `renderer/App.tsx`                         | 168-192              | 拖放 4 处 `catch {}` 静默失败，无用户反馈           | P2              |
| `tests/e2e/smoke.spec.ts`                  | 25                   | 启动路径 `index.js` ≠ 产物 `index.cjs`，11 用例全红 | **P0-3**        |
| `hooks/useMenuCommands.ts`                 | 109-121              | ⌘E/⌘I 事件无人监听；⌘R 只置 loading                 | **P1-1/2**      |
| `renderer/Workbench.tsx`                   | 159-163 vs 1112-1117 | `_error` 标记写入但 UI 不消费 → 永久加载            | **P1-3**        |
| `renderer/Workbench.tsx`                   | 605-626, 721-739     | 粘贴整表替换无确认                                  | P1-6            |
| `renderer/Workbench.tsx`                   | 283,301,322          | 分隔条 `onResize` 空实现，键盘调节空转              | P2-13           |
| `renderer/Workbench.tsx`                   | 699-700              | slice(5000) 假虚拟化                                | P2-2            |
| `renderer/Workbench.tsx`                   | 577                  | 删除按钮键盘不可见                                  | P2-14           |
| `renderer/Workbench.tsx`                   | 572,836,1074         | 硬英文 "rows"/"Showing…"                            | P2-10           |
| `renderer/WelcomePage.tsx`                 | 128-163              | 最近工程永远为空（写入端缺失）                      | **P1-4**        |
| `renderer/WizardDialog.tsx`                | 102-129              | 语言切换重置已填参数/列                             | P2-1            |
| `renderer/WizardDialog.tsx`                | 466                  | footer_count 正则字符串手术                         | P2-11           |
| `renderer/UploadDialog.tsx`                | 99-125               | Key 清理不在 finally；覆写≠删除；文案矛盾           | **P1-7**        |
| `renderer/UploadDialog.tsx`                | 361                  | 硬英文 "(N rows)"                                   | P2-10           |
| `renderer/CommandPalette.tsx`              | 92-98                | 面板删除单元无确认                                  | P2-3            |
| `renderer/components/ui/Splitter.tsx`      | 94-100               | 键盘回调依赖调用方，当前全部空转                    | P2-13           |
| `renderer/components/ui/ErrorBoundary.tsx` | 53,79                | 恢复 UI 硬编码英文                                  | P2-15           |
| `renderer/lib/validate.ts`                 | 43-49                | color_list 只按空白切分，与 comma 写回冲突          | P2-5            |
| `renderer/stores/project.ts`               | 125-141              | reorder 死代码；toggleHidden 会误清脏标记           | P3-2            |
| `renderer/styles/globals.css`              | 330-388,443-458      | 三个组件类死代码                                    | P3-1            |
| `renderer/styles/globals.css`              | 166,178              | 暗色 accent/warning 小字对比度临界                  | P2-8            |
| `renderer/i18n/index.ts`                   | —                    | 8 个缺失键 + 26 条 status 死键                      | P2-9/12         |
| `main/index.ts`                            | 90-118               | 关闭保存 500ms 竞态；对话框硬编码英文               | **P1-5** / P3-6 |
| `main/index.ts`                            | 44,49                | minWidth 900 中栏过窄；浅色主题黑闪                 | P2-7 / P3-10    |
| `main/menu.ts`                             | 38                   | ⌘⇧W 惯例违例                                        | P3-5            |
| `main/sidecar.ts`                          | 31-33                | 开发路径硬编码本机绝对路径                          | P3-7            |
| `main/ipc-upload.ts`                       | 32-36                | cancel 为 no-op 且 UI 未告知                        | P2-4            |

---

## 10. 修复路线图（建议顺序）

### 第一步：让"运行时真相"可见（半天）

1. 修 `tests/e2e/smoke.spec.ts` 启动路径 → `out/main/index.cjs`，让 11 个用例恢复绿色（P0-3）。
2. 手工跑一轮核心链路：预览生成、拖拽导入、⌘E/⌘I/⌘R，逐个确认 P0-1/P0-2/P1-1/P1-2 的实际表现。

### 第二步：接完断线（1–2 天）

3. `sidecar.call` 中止改为"cancel 通道 + 请求 id"，不再透传 AbortSignal（P0-1）。
4. preload 增加 `webUtils.getPathForFile`，拖放失败给可见提示（P0-2）。
5. `useMenuCommands` 的 export/import/generate-preview 直接复用 Workbench 的同名回调（提升到 store 或共享 hook），删除无人监听的自定义事件（P1-1/2）。
6. `InspectorPanel` 消费 `_error`：显示错误 + 重试按钮，并支持缓存失效重拉（P1-3）。
7. 打开/另存成功后调用 `addRecentProject`（P1-4）。
8. 关闭流程：渲染层保存完成后通知主进程再关闭，取消另存则留在应用（P1-5）。

### 第三步：堵住数据与密钥风险（1 天）

9. 粘贴替换加确认（P1-6）；Key 清理进 finally + 真删除 + 改文案（P1-7）。
10. 命令面板删除单元补确认（P2-3）；向导语言切换保留已填参数（P2-1）。

### 第四步：一致性与打磨（按迭代）

11. 补齐 8 个缺失 i18n 键、清理硬英文与字符串手术、把 26 条 `app.status_*` 接到一个简易状态栏/Toast（P2-9/10/11/12）。
12. 分隔条键盘接通真实 resize；删除按钮 `group-focus-within` 可见（P2-13/14）。
13. 接入 `@tanstack/react-virtual` 或移除两个 tanstack 依赖（P2-2）；校验器分隔符对齐 widget（P2-5）。
14. 清理死代码（P3-1/2/3），窗口标题接工程名与脏标记（P3-4）。

---

**报告结束。**

> 说明：本报告基于当前工作区源码、构建产物（`out/renderer/assets/index-Cab0j139.css`，2026-10-27 01:08 构建）、`tsc --noEmit` 输出与 `test-results/.last-run.json` 完成静态审查；除 P0-1 标注"需运行时复核"外，所有结论均有文件与行号证据。审查过程未修改任何源代码。

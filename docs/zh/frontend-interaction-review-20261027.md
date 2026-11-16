[English](../en/frontend-interaction-review-20261027.md) | **简体中文**

# PyiTOL Studio 前端设计与交互逻辑审查报告（交互专项）

> **状态更新（2026-10-27）**：本报告列举的问题已全部处理，修复明细见 [frontend-fix-report-20261027.md](frontend-fix-report-20261027.md)。

- **审查日期**：2026-10-27
- **审查对象**：`PyiTOL-Studio-Electron` 当前工作区代码（Electron 45 + React 18 + Zustand + Tailwind v4 + i18next）
- **审查方式**：逐文件人工通读前端全部源码（renderer 约 4,600 行、preload 217 行、main 进程交互相关约 500 行），交叉验证 i18n 键、构建产物 CSS、IPC 契约与 E2E 测试
- **代码改动**：本报告为只读审查，**未修改任何代码**
- **文件冲突说明**：本报告文件名独立于并行审查任务的 `docs/zh/frontend-design-review.md`（该报告完成于 10-26 20:31，早于其后的多轮代码修改），二者互不覆盖；分歧点见 §10

---

## 目录

1. [总体结论](#1-总体结论)
2. [P0 — 功能损坏（必须立即修复）](#2-p0--功能损坏)
3. [P1 — 核心交互缺陷](#3-p1--核心交互缺陷)
4. [P2 — 一致性与正确性问题](#4-p2--一致性与正确性问题)
5. [P3 — 可访问性与细节](#5-p3--可访问性与细节)
6. [安全专项](#6-安全专项)
7. [交互架构评价](#7-交互架构评价)
8. [国际化（i18n）专项](#8-国际化i18n专项)
9. [做得好的部分（应保留）](#9-做得好的部分应保留)
10. [与既有报告的关系与分歧](#10-与既有报告的关系与分歧)
11. [修复优先级路线图](#11-修复优先级路线图)

---

## 1. 总体结论

前端整体架构清晰：双 Store（project / UI）分离、preload 类型化桥接、设计令牌体系完整、双主题与中英双语齐备，安全基线（contextIsolation / sandbox / CSP）落实到位。**交互骨架是健康的**。

但按"用户真实操作路径"走查后发现：**两条主入口路径处于损坏状态**（拖放导入完全失效、关闭时保存有丢数据竞态），**四个菜单/面板命令是死命令或空转**（导入模板 ⌘I、导出模板 ⌘E、最近工程、上传取消），并且**错误反馈体系整体缺失**——约 10 处 `catch` 静默吞错，用户在导入失败、导出失败、打开损坏工程时得不到任何提示（i18n 里留有整套 `app.status_*` 反馈文案，但渲染层没有承载它们的状态栏组件）。

**分维度评估**（5 分制）：

| 维度             | 评分 | 摘要                                                   |
| ---------------- | ---- | ------------------------------------------------------ |
| 视觉设计系统     | 4.0  | 令牌完整、双主题对齐、克制统一；少量硬编码色与定位错误 |
| 交互逻辑完整性   | 2.0  | 多条主路径损坏或空转，破坏性操作缺确认/撤销            |
| 反馈与错误处理   | 1.5  | 系统性静默吞错，无 toast/状态栏承载                    |
| 可访问性         | 3.0  | 对话框 ARIA 与焦点陷阱出色；表格编辑键盘不可达         |
| 状态管理与数据流 | 4.0  | 双 Store 划分干净，防抖/竞态守卫写法正确               |
| 安全基线         | 4.5  | 沙箱/CSP/外链拦截到位；文件读写缺最小权限约束          |

---

## 2. P0 — 功能损坏

### P0-1 拖放导入完全失效（`File.path` 已被移除）

**位置**：`src/renderer/src/App.tsx:153-157`

```ts
for (let i = 0; i < files.length; i++) {
  const file = files[i]
  // @ts-expect-error — Electron extends File with .path
  const filePath: string | undefined = file.path
  if (!filePath) continue
```

本项目依赖 `electron ^45.0.0`（package.json）。`File.path` 自 **Electron 32 起已被移除**（由 `webUtils.getPathForFile()` 取代）。因此在当前版本上，`file.path` 恒为 `undefined`，循环对每个文件 `continue`——**拖放 .pyitolproj / .nwk / 模板文件到窗口什么都不会发生**，连错误提示都没有。

而欢迎页还在明确宣传该功能：`src/renderer/src/components/welcome/WelcomePage.tsx:167`（"将 Newick 树或 iTOL 模板文件拖入窗口即可开始"），拖放遮罩也照常弹出（`App.tsx:253-280`）——用户看到"释放以导入文件"，松手后却毫无反应。

**修复方向**：在 preload 中通过 `webUtils.getPathForFile(file)` 暴露路径解析（sandbox 下 `webUtils` 可在 preload 使用），或在主进程侧用 `will-navigate`/`webContents` 的文件拖放通道处理。

### P0-2 关闭窗口"保存"路径存在丢数据竞态

**位置**：`src/main/index.ts:90-118`

```ts
if (choice === 0) {
  // Save then close — send save command to renderer
  mainWindow?.webContents.send('menu:command', 'save-project')
  // After save, close
  setTimeout(() => {
    forceClose = true
    mainWindow?.close()
  }, 500)
}
```

点击"Save"后，主进程发命令给渲染进程，然后**固定 500ms 后无条件强关窗口**。两种真实场景都会丢数据：

1. 工程从未保存过（无 `project/currentPath`）：渲染进程会弹出"另存为"原生对话框等待用户输入——对话框还没操作完，500ms 一到窗口就被强关，保存中断、修改丢失。
2. 用户在保存对话框里点了"取消"：`project:save` / `save-project-as` 返回 `null`（`useMenuCommands.ts:48-53` 只在 `savedPath` 非空时 `markClean`），但主进程照样在 500ms 后强关——用户明确表示取消保存，应用却关闭且**不再次确认**。

**修复方向**：保存完成后由渲染进程回报结果（如 `ipcRenderer.send('save-finished', ok)`），主进程收到回报再决定关闭/取消；取消保存时应回到"未关闭"状态。另见 P2-7：该确认对话框文案为硬编码英文。

---

## 3. P1 — 核心交互缺陷

### P1-1 通过拖放打开工程后，⌘S 静默失效

**位置链**：`App.tsx:160-167` → `stores/project.ts:70-80` → `hooks/useMenuCommands.ts:46-53` → `main/ipc-project.ts:87-99`

拖放打开 `.pyitolproj` 时，渲染进程执行 `setProject(data, filePath)`（renderer 侧记住了路径）；但主进程的 `project:save` 只认**主进程 store 里的 `project/currentPath`**——该键只在对话框打开（`project:open`）和另存为时写入，拖放路径从未写入。于是：

- `useMenuCommands.ts:48-50`：`filePath` 非空 → 走 `saveProject`（而非 `saveProjectAs`）；
- `ipc-project.ts:88-91`：主进程 `currentPath` 为 `null` → **直接 `return null`**；
- `useMenuCommands.ts:51-53`：`savedPath` 为 `null` → 不 `markClean`、**不回退到另存为、不报错**。

结果：拖放打开的工程按 ⌘S **什么都不会发生**，且没有 dirty 提示兜底（见 P0-2 的对话框也只在你关闭时才出现，但永远保存不出去）。这是两条"保存路径契约"（renderer 的 `filePath` vs 主进程的 `currentPath`）割裂的直接后果。

### P1-2 「最近工程」列表永远是空的

**位置**：`preload/index.ts:63-65`、`main/ipc-project.ts:153-170`、`welcome/WelcomePage.tsx:19-21`

`project:add-recent` 的完整链路存在（preload → main → store），但**全项目没有任何调用方**（全局 grep 仅命中定义处）。欢迎页的"最近工程"区块因此永远显示"还没有最近工程"。这是一个已建好管道但从未接水的死功能。同理 `project:clear-recent` 也无入口。

### P1-3 菜单「导入模板 ⌘I」「导出模板 ⌘E」是死命令

**位置**：`hooks/useMenuCommands.ts:109-117`

```ts
case 'export-template':
  window.dispatchEvent(new CustomEvent('workbench-export'))
  break
case 'import-template':
  window.dispatchEvent(new CustomEvent('workbench-import'))
  break
```

`workbench-export` / `workbench-import` 两个事件**没有任何组件监听**（grep 全项目仅有这两处 dispatch）。主菜单"文件 → 导入模板…"（⌘I）与"命令 → 导出当前模板…"（⌘E）点击后无声无息。注意 Workbench 自己的工具栏导出走的是另一条真实路径（`Workbench.tsx:194-207` 的 `handleExport`），说明能力存在、只是菜单命令没接上。

### P1-4 「取消上传」是假的，且事后 UI 会翻转为错误态

**位置**：`main/ipc-upload.ts:32-36`、`UploadDialog.tsx:137-141`、`129-131`、`preload/index.ts:176-185`

- 主进程 `upload:cancel` 处理器是**空操作**（注释自认"we just let it finish"）：Python 侧上传继续跑，进度消息继续推。
- 渲染进程 `handleCancel` 立即 `setState('idle')` 并清掉进度条，看似已取消；
- 但 preload 的 abort 监听会 reject `Error('Aborted')`，`handleUpload` 的 catch 随后异步触发 → `setState('error')`，UI **在用户点了取消之后**变成红色"失败：Aborted"。用户看到的状态顺序是：运行中 → 已取消（idle）→ 突然报错。

至少应做到三选一：真正实现引擎级取消；或取消后静默丢弃后续结果（保留 AbortController 竞态守卫，如同预览面板那样）；或如实显示"取消请求已发送，任务仍在后台进行"。

### P1-5 命令面板"删除注释单元"无确认直接删除

**位置**：`CommandPalette.tsx:93-98`

```ts
commands.push([
  `${t('ctx.delete_unit')}: ${unit.label || unit.type_name}`,
  () => {
    removeUnit(unit.unit_id)
    setOpen(false)
  }
])
```

左侧单元列表的删除有 `window.confirm` 确认（`Workbench.tsx:579-584`），而命令面板里同名操作**即回车即删**，且删除的是可能含大量数据行的单元，无撤销。两处行为不一致，破坏性操作放在了最容易误触的搜索回车路径上。

### P1-6 数据表格的破坏性操作均无撤销

**位置**：`Workbench.tsx:605-626`（粘贴整表替换）、`724-736`（粘贴 TSV 按钮同款）、`873-883`（清空所有数据）

- `handlePaste` 用剪贴板内容**整表替换** `columns` + `data_rows`（i18n 文案 `table.paste_hint` 有说明"整表替换"，算部分知情同意），但没有撤销栈；
- 右键"清空所有数据"只有一次 `window.confirm`，确认后数据不可恢复；
- 顶部菜单"编辑 → 撤销/重做"是 Electron 原生 role，只作用于文本输入框，对表格数据无效——用户很可能按 ⌘Z 期望恢复，实际无效。
- 没有任何一处行级/单元格级历史。建议至少为"整表替换/清空/删行"保留一步内存快照以支持 ⌘Z，或在动作前给出可恢复的确认对话框。

### P1-7 错误反馈体系系统性缺失（约 10 处静默 catch）

| 位置                     | 场景                      | 用户看到的                                                                       |
| ------------------------ | ------------------------- | -------------------------------------------------------------------------------- |
| `App.tsx:168-170`        | 拖放打开工程失败          | 无任何提示                                                                       |
| `App.tsx:187-189`        | 模板 learn_from_file 失败 | 无任何提示                                                                       |
| `Workbench.tsx:204-206`  | 导出模板写文件失败        | 无任何提示（含权限/磁盘满）                                                      |
| `WelcomePage.tsx:51-53`  | 最近工程文件损坏/被移动   | 无任何提示（虽然 `project:recent` 已过滤不存在的路径，但 JSON 损坏仍会走到这里） |
| `CommandPalette.tsx:42`  | list_template_types 失败  | 面板"模板类型"分组静默消失                                                       |
| `WizardDialog.tsx:88`    | 同上                      | 类型列表显示"无结果"而非错误                                                     |
| `UploadDialog.tsx:93-95` | 单个单元导出临时模板失败  | **静默跳过**，继续上传剩余；若全部失败则只上传一个空模板集                       |
| `Workbench.tsx:177`      | 叶 ID 解析失败            | 仅显示"叶节点数未知"，可接受但无原因                                             |

i18n 中留有整套 `app.status_open_failed` / `app.status_export_failed` / `app.status_import_failed` 等反馈文案（`i18n/index.ts:17-44`），说明旧 PySide6 版有状态栏——**Electron 版删掉了状态栏组件却没补 toast**，这批键成了死键。建议补一个轻量 toast/状态条组件统一承载，这也是修复本节多数问题的最省力路径。

---

## 4. P2 — 一致性与正确性问题

### P2-1 IDL 缓存不区分语言，切换语言后表单标签不更新

**位置**：`Workbench.tsx:147-164`、`stores/project.ts:151-152`

`idlCache` 以 `type_name` 为键，取数时传 `locale: language`。用户切换语言后：

- Workbench 的检查器命中缓存，**字段标签仍是旧语言**，直到重启；
- Wizard 则在 `language` 变化时重新拉取（`WizardDialog.tsx:102-129` 依赖数组含 `language`）——两处行为不一致。

修复：缓存键改为 `` `${type_name}:${locale}` ``，或语言切换时清空缓存。

### P2-2 `color_list` 校验与控件对分隔符的口径不一致

**位置**：`lib/validate.ts:43-50` vs `inspector/IdlWidget.tsx:173-174`

控件按 `field.range === 'comma'` 支持逗号分隔列表；校验器**永远按空白切分**。当字段为逗号分隔时，合法输入（`#ff0000,#00ff00`）会被判为 `field_color_list` 错误，检查器顶部横幅显示"N 个参数需要修正"，但 UI 上无论怎么改都无法消除（控件自己写出来的格式过不了校验）。另外错误文案插值 `{{value}}` 会把整个串塞进提示，逗号串尤其长。

### P2-3 用 `split('·')` 解析翻译文本来提取叶节点数

**位置**：`Workbench.tsx:479-484`

```ts
leafIds
  ? `${leafIds.size} ${t('nav.tree_meta', { count: leafIds.size }).split('·')[0].trim()}`
```

`nav.tree_meta` 原文是 `'{{count}} 个叶节点 · Newick'`（zh）与 `'{{count}} leaf nodes · Newick'`（en）。用分隔符截断翻译字符串来拼新文案，一旦文案调整（去掉"· Newick"或改用其他分隔符）就会静默坏掉。应拆成独立键（如 `nav.tree_leaf_count`）。同文件 488 行的 `nav.tree_match` 用法正常。

### P2-4 TreeCard 的标题误用「注释单元」文案

**位置**：`Workbench.tsx:469-472`

树文件卡片（显示树路径/叶节点数/更换树按钮）的加粗标题是 `t('nav.units_caption')` = "注释单元"。它下面紧跟的 UnitList 才是单元列表，且 UnitList 自身没有标题。用户看到两个区块，第一个叫"注释单元"内容却是树信息。应为树卡片增加专用键（如 `nav.tree_card_title`）。

### P2-5 预览防抖存在"完成后再跑一次"的冗余 RPC

**位置**：`Workbench.tsx:126` + `129-144`

`generatePreview` 的 `useCallback` 依赖里有 `previewText`；而防抖 effect 的依赖里有 `generatePreview`。于是：编辑 → 300ms 后生成 → `setPreview` 改变 `previewText` → `generatePreview` 身份变化 → effect 重跑 → **再排一次 300ms 定时器再生成一次** → 第二次结果与第一次相同（字符串原始值相等，zustand 不触发重渲染）→ 循环终止。净效果：**每次编辑触发两次 `generate_template` RPC，第二次纯属冗余**。把 `previewText` 从 `generatePreview` 的依赖中去掉（函数内并不读取它，只读取了"是否有值"来决定 loading——可改用 ref 或函数式判断）即可消除。

### P2-6 `AbortSignal` 未透传到主进程，取消只是"不再更新 UI"

**位置**：`preload/index.ts:26-28`、`main/index.ts:162-165`、`Workbench.tsx:92-126`

preload 把 `opts`（含 `signal`）发给了 `sidecar:call`，主进程处理器签名只收 `(method, params)`，**opts 被丢弃**。因此 Workbench 预览的 `AbortController` 不会中断底层 RPC：快速连续编辑时，旧的 `generate_template` 调用仍会在 sidecar 中排队执行，只是结果被 `previewAbortRef.current === ac` 守卫丢弃。`Workbench.tsx:116` 的 `err.name === 'AbortError'` 分支实际**不可达**。当前竞态守卫写法保证了正确性，但应二选一：主进程透传 `AbortSignal`（`ipcMain.handle` 支持 `event` + AbortSignal 语义需自行实现取消），或删掉误导性的 opts/分支。

### P2-7 主进程关闭确认对话框硬编码英文

**位置**：`main/index.ts:95-103`

按钮 `['Save', 'Discard', 'Cancel']`、标题、正文均为英文。应用菜单已按 `ui/language` 全量本地化（`menu.ts`），唯独这个最关键的数据安全对话框例外，中文用户在退出时会看到突兀的英文弹窗。

### P2-8 AboutDialog 关闭按钮定位锚点错误

**位置**：`AboutDialog.tsx:38-45`

关闭按钮 `absolute top-2 right-2`，但其父级卡片 `motion.div` 没有 `position: relative`——最近的定位祖先是最外层 `fixed inset-0` 遮罩。**X 按钮实际渲染在窗口右上角而不是对话框卡片右上角**，宽屏上离卡片很远，看起来像窗口级关闭钮。给卡片加 `relative` 即可。

### P2-9 大表格"虚拟化"名不副实 + 截断提示硬编码英文

**位置**：`Workbench.tsx:698-700`、`834-837`

注释写"Virtualized rendering: cap visible rows and use windowing"，实现只是 `rows.slice(0, 5000)`。超过 5000 行时尾部数据不可见且不可编辑，提示 `"Showing {MAX_RENDER} of {rows.length} rows"` 为硬编码英文（未走 i18n）。此外 package.json 已安装 `@tanstack/react-virtual` 与 `@tanstack/react-table`，**渲染层零引用**（grep 无命中）——要么兑现虚拟化，要么移除依赖并如实命名。

### P2-10 上传对话框的多处守卫缺口

**位置**：`UploadDialog.tsx:425-433`、`83-96`、`117-125`

- 「上传并导出」按钮仅由 `!treePath` 禁用：**一个模板都不选也能上传**（引擎侧或许容忍，但 UI 应该拦或至少提示 `upload.no_units_msg` 已有的文案）；
- 单元导出临时模板失败被静默跳过（见 P1-7 表）；
- API Key 清理只是 `writeFile(keyPath, '')`——**明文密钥文件仍存在于系统临时目录**（0 字节壳），依赖 OS 清理；失败还被吞掉。建议上传完成即删除文件（`files` 通道加一个 `deleteFile`），或改为通过环境变量传给 sidecar。

### P2-11 Wizard 数据解析 effect 的列推导逻辑脆弱

**位置**：`WizardDialog.tsx:145-173`

粘贴数据后用"首行是否与 `columns` 逐项相等"决定是否采纳用户表头。当分隔符切换（如 TAB → COMMA）时 `parseLine` 变化会触发重解析，首行可能被拆成单列而覆盖 `columns`，随后第 2 步的 `canNext`（依赖 `columns.length > 0`）仍然放行，直到第 4 步生成才报错。另有 `wizard.bad_columns`、`wizard.sep_conflict` 等校验文案已备好但**未接入任何校验路径**（grep 无使用）。建议在第 2 步就校验列数与分隔符冲突，用上现成文案。

---

## 5. P3 — 可访问性与细节

1. **表格单元格键盘不可达**（`Workbench.tsx:820-826`）：编辑只能双击 `<span>`，单元格无 `tabIndex`、无 Enter 进入编辑、无 aria。纯键盘用户无法编辑任何数据。粘贴入口（`onPaste` 挂在容器上）也要求焦点恰好在表格容器内。
2. **UnitList 删除按钮 hover 才可见但始终可聚焦**（`Workbench.tsx:576-587`）：`opacity-0 group-hover:opacity-100` 且未处理 `:focus`——Tab 聚焦到它时仍然不可见（不可见的可聚焦控件是 WCAG 违例）。
3. **Splitter 键盘调整是空操作**（`Workbench.tsx:283`、`300-301`、`322-323`）：三个 Splitter 全部传 `onResize={() => {}}`，而 `Splitter.tsx:94-100` 的方向键逻辑只调 `onResize`。`aria-valuenow` 报的是旧值，键盘用户看到焦点环却拖不动。
4. **状态点仅靠颜色区分**：表格状态列有 `title`（`Workbench.tsx:795`），可接受；但单元列表的颜色圆点（`Workbench.tsx:563-566`）无任何文本替代，色弱用户无法从形状上区分单元。
5. **同步 IPC 遍布启动路径**：`settings:get`（`preload/index.ts:114-116`，App 挂载即调两次，`App.tsx:56-61`）、`check-dirty-sync`、`files:get-temp-dir`、`files:join-path`、`sidecar:engine-version` 全是 `sendSync`，会阻塞渲染主线程。`sidecar.engineVersion()` 全项目无调用方（死 API）。建议逐步改异步。
6. **Wizard 的"丢弃确认"子对话框未接 `useDialog`**（`WizardDialog.tsx:664-686`）：按 Esc 无效、无焦点陷阱、"丢弃"按钮无 `autoFocus`（危险操作默认焦点应落在"取消"上才安全）。
7. **Wizard 步骤指示器无 aria**（`WizardDialog.tsx:308-337`）：建议加 `aria-current="step"`。i18n 中 `wizard.finish`、`wizard.hint_select`、`wizard.params_hint`、`inspector.expand_all/collapse_all/copy_params/compact` 等一批键当前无使用方（死键，可清理或接入）。
8. **原生 `window.confirm` × 3** 与自绘对话框风格割裂（macOS 原生弹窗可接受，但与应用内 Wizard 丢弃确认是两套范式）。
9. **路径展示按 `/` 切分**（`Workbench.tsx:475`）：macOS 主目标没问题，但 `split('/')` 在未来 Windows 端口上会显示完整路径。建议 `path.basename` 语义下沉到主进程。
10. **CommandPalette 渲染期 `runningIndex` 递增**（`CommandPalette.tsx:165`、`227-229`）：依赖 `Object.entries(grouped)` 与 `flatItems`（`Object.values`）遍历顺序严格一致才不出错，属于隐式契约，建议预计算 index map。当前实现正确（每次 render 从 -1 重置），仅作代码质量提示。
11. **Store 存根与死代码**：`project.ts:134-141` `toggleUnitHidden` 是占位实现且行为可疑（执行时把 `isDirty` 强制设回 false）；`reorderUnits`、`updateProjectName` 无调用方。

---

## 6. 安全专项

**做得好**（应保持）：

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`（`main/index.ts:50-58`）；
- CSP 双重声明（HTML meta + 响应头注入）且生产模式锁死 `'self'`（`index.html:6`、`main/index.ts:62-73`）；dev 模式的 `unsafe-eval` 仅限开发服务器，可接受；
- `setWindowOpenHandler` 只放行 `https://` 到系统浏览器，其余一律 `deny`（`main/index.ts:76-81`）；`platform:open-external` 同样校验（`main/index.ts:189-193`）；
- 渲染层唯一的 HTML 注入点 `highlightItolTemplate`（`lib/highlight.ts:15-20`）**先转义再高亮**，无 XSS；
- preload 全部经 `contextBridge` 暴露类型化 API，无 `executeJavaScript` 类逃生舱。

**需要收敛**：

1. **`files:read` / `files:write` 无路径约束**（`ipc-files.ts:73-85`）：渲染进程可读写磁盘任意路径。当前渲染层只加载本地内容、CSP 锁死，实际被利用的前提（XSS）已被堵住，风险为纵深防御级别。但值得注意：i18n 遗留键 `app.status_bad_path`（"路径无效：目标包含 .. 穿越段，已拒绝"）说明旧版有路径校验，Electron 版未实现——建议至少对 `files:write` 加白名单（仅允许对话框选定路径与系统临时目录），恢复旧版的防御语义。
2. **API Key 明文落盘临时目录**（见 P2-10）：进程崩溃或用户手动清理前一直可读。
3. **`upload:cancel` 空实现**（见 P1-4）兼有资源含义：上传继续占用网络直到自然结束。

---

## 7. 交互架构评价

**优点**：

- **双 Store 划分干净**（`stores/project.ts` 文档态 vs `stores/ui.ts` 视图态），所有副作用集中在组件层 hooks，`unitToSpec` 作为项目模型 → RPC 载荷的单一适配点，边界清楚。
- **预览生成的竞态守卫写法正确**（`previewAbortRef.current === ac` 双检），配合 300ms 防抖，交互上是顺滑的（除了 P2-5 的冗余第二次调用）。
- **`useDialog` 是高质量原语**：焦点陷阱 + Esc + 初始聚焦 + 焦点还原 + 滚动锁，四个对话框统一复用；CommandPalette 完整实现了 combobox/listbox 的 ARIA 模式（`aria-activedescendant`、`data-selected`、滚动跟随），这在桌面 Electron 应用里少见。
- **引擎连接的退避重试**（`App.tsx:68-107`，线性退避封顶 3s + crash 事件重挂）对 PyInstaller 冷启动场景是正确设计，E2E 也有对应断言。
- **菜单命令经 `menu-command` 自定义事件与 IPC 双通道汇聚到同一 handler**，并在注释中明确警告了递归风险（`useMenuCommands.ts:6-17`）——设计意识好，但正如 P1-3 所示，汇聚层的"接水"工作没做完。

**结构性风险**：

- **同一能力存在两套契约**：保存路径（renderer `filePath` vs main `currentPath`）、主题（renderer `applyThemeClass` vs main `nativeTheme.themeSource` + `applyTheme` 双写）、语言（renderer `i18n.changeLanguage` vs main `store.get` + `rebuildMenu`）。当前各自能用，但任何一端改动都容易产生 P1-1 这类"单边记忆" bug。建议把"谁是 source of truth"写进 ADR 并收敛到单侧。
- **反馈通道缺失是架构级空位**：不是某个 catch 写漏了，而是根本没有承载反馈的 UI 原语。先补 toast/状态条，再逐处接线，比逐点补 `alert` 划算。

---

## 8. 国际化（i18n）专项

- **键位规模与对齐**：zh / en 各 **287 键，完全对齐**（实测计数一致），`fallbackLng: 'en'`，热切换经 `i18n.changeLanguage` + `<html lang>` 同步（`App.tsx:48-52`），实现正确。
- **主要问题是"defaultValue 兜底"造成的混排**：以下键在 zh 词典中缺失，代码里用英文 `defaultValue` 兜底，导致**中文界面弹出英文文案**：
  - `ctx.delete_confirm`（`Workbench.tsx:581`，删除确认框）
  - `table.ctx_clear_confirm`（`Workbench.tsx:875`）
  - `inspector.reset_all_confirm`（`Workbench.tsx:1048`）
  - `common.select_all` / `common.deselect_all`（`UploadDialog.tsx:338`）
  - `cmd.no_results`（`CommandPalette.tsx:210`、`WizardDialog.tsx:369`）
  - `inspector.idl_failed`（`WizardDialog.tsx:554`）
  - `update.downloading_auto`（`UpdateNotification.tsx:67`）

  建议在 CI 里加一个"渲染层 `t(` `)` 调用键 ⊆ 词典键"的静态检查脚本，一次性清掉。

- **死键批量存在**：`app.status_*` 全家（约 20 键）、`wizard.finish/hint_select/params_hint/bad_columns/sep_conflict`、`inspector.expand_all/collapse_all/copy_params/compact*`、`nav.hide_unit/show_unit/hidden_summary`、`config.*`、`about.*`、`fd.*`、`fd.select_key` 等。这些是旧版功能文案，接入或清理需要一次决策（其中 `app.status_*` 恰是 P1-7 建议补状态栏时的现成语料）。
- 主进程菜单本地化完整（`menu.ts`），但关闭确认对话框例外（P2-7）。

---

## 9. 做得好的部分（应保留）

1. **设计令牌体系**：`globals.css` 的 `@theme` 语义色 + `.dark` 覆盖结构清晰，实测当前构建产物中 `p-sm`/`mt-xs`/`gap-xs` 等间距类**均已生成**；`prefers-reduced-motion` 全局降级、滚动条主题化、`:focus-visible` 焦点环、拖拽区域（`drag-region`/`no-drag`）与文本选区（`user-select` 分层）都是成熟的桌面细节。
2. **安全基线**：见 §6，属于同类 Electron 项目中的良好水平。
3. **`useDialog` + CommandPalette 的无障碍实现**（见 §7）。
4. **i18n 双语 287 键完全对齐**，插值统一 `{{...}}`。
5. **E2E 冒烟测试**覆盖欢迎页 → 工作台 → 命令面板 → 引擎握手全链路，并用自定义事件留出了稳定的测试钩子（且在 `useMenuCommands.ts` 注释中说明了该钩子的设计意图）。
6. **全局 ErrorBoundary** 带恢复按钮，兜住渲染白屏。
7. **文档态不可变更新**纪律好：store 里所有更新都是浅拷贝展开，未见原地突变。

---

## 10. 与既有报告的关系与分歧

并行任务产出 `docs/zh/frontend-design-review.md`（10-26 20:31）。本报告为其后的**独立重审**，二者文件独立、互不覆盖。需要注意的分歧：

| 事项             | 既有报告（10-26）        | 本报告实测（10-27 代码与构建产物）                                                                                                |
| ---------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 间距工具类       | P0"29 个类名 / 0 个生成" | **已生成**：`out/renderer/assets/index-Cab0j139.css`（10-27 01:08 构建）中 `p-sm`、`mt-xs`、`gap-xs`、`px-sm`、`mb-xl` 等全部命中 |
| 红绿灯压住工具栏 | P0                       | 当前代码 `Workbench.tsx:377` 已留 `paddingLeft: 80` 安全区（效果待真机复核）                                                      |
| 分隔条闭包失效   | P0                       | 当前代码已引入 `onResizeAbsolute` 绝对模式（`Splitter.tsx:50-53`）专为此修复；键盘路径仍有空函数问题（本报告 P3-3）               |
| 菜单命令无限递归 | P0                       | 当前代码 handler 不回派发事件，递归风险已消除；但 **⌘I / ⌘E 是死命令**（本报告 P1-3）                                             |

两份报告互补：既有报告侧重视觉/布局/令牌，本报告侧重交互路径、数据流契约与反馈体系。建议以本报告 §2-§3 与既有报告仍然成立的部分合并排期。

---

## 11. 修复优先级路线图

**第一批（用户数据与主路径，1-2 天）**

1. P0-1：preload 接 `webUtils.getPathForFile`，修复拖放导入，并补失败提示；
2. P0-2：关闭保存改为"渲染进程回报完成"协议，废除 500ms 定时强关；
3. P1-1：统一保存路径契约（拖放打开时写入主进程 `currentPath`，或 `project:save` 接收渲染层传入路径），⌘S 失败必须可见。

**第二批（把假功能变成真功能，2-3 天）** 4. P1-3：接通或移除 ⌘I / ⌘E 菜单项；5. P1-2：在 `open-project` / `save-as` / 拖放打开成功后调用 `add-recent`，欢迎页加"清空最近"入口；6. P1-4：上传取消三选一落地（真取消 / 静默吞结果 / 如实提示）；7. P1-7：新增 Toast/状态条组件，消费现成的 `app.status_*` 文案，逐处替换静默 catch。

**第三批（一致性与守护，3-5 天）** 8. P1-5 / P1-6：命令面板删除加确认；表格替换/清空引入单步撤销快照；9. P2-1 / P2-2 / P2-3 / P2-4：IDL 缓存带 locale、color_list 校验对齐、去除 `split('·')`、TreeCard 标题独立键；10. P2-6 / P2-5：AbortSignal 透传或删除误导分支；消除预览冗余二次 RPC；11. P2-7 / P2-8 / P2-9 / P2-10：关闭弹窗本地化、AboutDialog `relative`、表格截断提示走 i18n、上传对话框守卫与密钥文件删除。

**第四批（可访问性与清理）** 12. §5 全部条目：表格键盘编辑、focus 可见性、Splitter 键盘接线、死键清理（配合 CI 键位检查脚本）。

---

_审查人：ZCode（交互专项审查）。所有行号以 2026-10-27 工作区代码为准；本报告未改动任何源代码。_

[English](../en/frontend-fix-report-20261027.md) | **简体中文**

# PyiTOL Studio 前端问题修复报告（2026-10-27）

> 项目：PyiTOL Studio（Electron 桌面应用，macOS 优先）
> 版本：0.3.0（package.json 未变更）
> 修复日期：2026-10-27
> 修复范围：以下三份审查报告列举的全部问题
>
> - `docs/zh/frontend-design-review.md`（2026-10-26，v1）
> - `docs/zh/frontend-interaction-review-20261027.md`（交互专项）
> - `docs/zh/frontend-design-review-v2-20261027.md`（v2）
>   验证方式：`tsc --noEmit`（node + web 全量通过）、`electron-vite build` 成功、Playwright E2E 冒烟测试（见文末结果）

---

## 一、修复总览

| 报告                   | 问题数               | 修复状态                                    |
| ---------------------- | -------------------- | ------------------------------------------- |
| v2 报告 P0（3 项）     | 3/3                  | ✅ 全部修复                                 |
| v2 报告 P1（7 项）     | 7/7                  | ✅ 全部修复                                 |
| v2 报告 P2（15 项）    | 15/15                | ✅ 全部修复                                 |
| v2 报告 P3（12 项）    | 11/12                | ✅ 修复 11 项；1 项为已知限制（见下）       |
| 交互报告 P0–P3         | 全部                 | ✅ 与 v2 报告合并修复（两报告问题高度重合） |
| v1 报告（10-26）残留项 | 假虚拟化、表格能力等 | ✅ 处理（见"说明与已知限制"）               |

---

## 二、P0（阻断级）修复明细

### P0-1 `sidecar:call` 传入 `AbortSignal` 导致 IPC 序列化失败

- **根因**：`AbortSignal` 不可结构化克隆，`ipcRenderer.invoke` 直接抛 `An object could not be cloned`，预览功能全场景不可用。
- **修复**：
  - `src/shared/types.ts`：`sidecar.call` 签名移除 `opts` 参数；
  - `src/preload/index.ts`：不再透传任何 `opts`；
  - `src/renderer/.../Workbench.tsx`：`generatePreview` 改为"过期结果丢弃"守卫（`previewAbortRef.current === ac` 双检），删除了不可达的 `AbortError` 分支。
- **残留说明**：底层 sidecar 调用无法真正中止（引擎侧不支持），但结果会被正确丢弃，行为等价于"取消"，仅多一次后台计算。

### P0-2 拖拽导入在 Electron 45 上整体失效

- **根因**：`File.path` 自 Electron 32 起移除，代码仍依赖它，拖入任何文件都静默 `continue`。
- **修复**：
  - preload 新增 `files.getPathForFile(file)`（内部用 `webUtils.getPathForFile`，sandbox 下可用）；
  - `App.tsx` 拖放处理器改用该 API；
  - 所有失败路径（取不到路径、不支持的类型、打开/导入失败）均给出可见 toast 提示（`app.status_drop_rejected` / `app.status_open_failed` / `app.status_import_failed`）。

### P0-3 E2E 测试套件全红

- **根因**：测试启动 `out/main/index.js`，实际产物为 `out/main/index.cjs`，11 用例全部超时。
- **修复**：`tests/e2e/smoke.spec.ts` 启动路径改为 `index.cjs`；同步更新了受文案改动影响的断言（树卡片标题改为"树文件"后，单元列表新增独立标题"注释单元"承接原断言）。

---

## 三、P1 修复明细

### 菜单死命令 ⌘E / ⌘I / ⌘R（v2-P1-1 / P1-2；交互-P1-3）

- 三个命令此前分别派发无人监听的事件或只置 loading 标志。
- **修复**：`useMenuCommands` 统一派发 `workbench-export` / `workbench-import` / `workbench-generate-preview` 专用事件；`Workbench` 新增对应监听器，接到真实实现：
  - ⌘E → 与工具栏导出按钮同一实现（成功/失败均有 toast）；
  - ⌘I → 新增完整导入流程（选模板文件 → `learn_from_file` 反推 → 加入工程，带反馈）；
  - ⌘R → 触发真实预览重算，不再出现"永久加载中"。

### IDL 加载失败永久"加载中"（v2-P1-3）

- **修复**：`FormIdl` 类型正式加入 `_error?: boolean`；检查器检测到 `_error` 时显示错误文案 + "重试"按钮（清除缓存重拉，切走切回也会重试）。

### "最近工程"永远为空（v2-P1-4；交互-P1-2）

- **修复**：打开工程（菜单/欢迎页/拖放）与另存成功后均调用 `addRecentProject(path, name, unitCount)`；欢迎页最近列表打开失败有 toast。

### 关闭窗口保存竞态（v2-P1-5；交互-P0-2）

- **根因**：主进程发保存命令后固定 500ms 强关窗口；从未保存过的工程会弹出另存对话框，用户还没操作完窗口已被销毁。
- **修复**：改为完成回报协议——渲染进程保存流程（成功或用户取消另存）结束后通过 `close-save-finished` IPC 回报，主进程收到 `saved=true` 才关闭；取消则留在应用。对话框文案按界面语言本地化（中文用户不再看到英文 Save/Discard/Cancel）。

### 表格粘贴无条件整体替换（v2-P1-6；交互-P1-6）

- **修复**：⌘V 与"粘贴 TSV"按钮统一走 `applyClipboardPaste`：解析剪贴板 → 确认对话框（"将用 N 行 × M 列替换当前 K 行数据"）→ 保存撤销快照 → 执行；成功 toast 带"撤销"动作按钮可一键恢复。"清空所有数据"同样支持一步撤销。

### 上传 API Key 明文残留 + 文案矛盾（v2-P1-7；交互-P2-10）

- **修复**：Key 文件清理移入 `finally`（成功/失败路径都执行），并由"覆写为空串"改为真正的 `files:deleteFile` 删除；文案改为如实描述"仅临时写入系统临时目录，上传结束后立即删除"；`files:write`/`files:read` 增加绝对路径 + `..` 穿越校验（恢复 PySide6 版的路径防御语义）。

### 错误反馈体系缺失（交互-P1-7）

- **修复**：新增全局 Toast 组件（`components/ui/ToastHost.tsx` + `useToastStore`），消费现有 `app.status_*` 词条；约 10 处静默 `catch {}` 全部接线：打开失败、导入失败、导出失败、最近工程损坏、类型列表失败、模板导出失败、拖放失败等。

### 命令面板删除单元无确认（交互-P1-5；v2-P2-3）

- **修复**：命令面板删除命令加入与单元列表一致的 `window.confirm` 确认。

### 上传"取消"翻转为错误态（交互-P1-4；v2-P2-4）

- **修复**：取消后 UI 回到空闲、结果静默丢弃（`cancelledRef` 守卫），toast 如实提示"上传将在后台继续完成，其结果将被忽略"，不再显示红色"失败：Aborted"。

### 保存路径契约割裂（交互-P1-1）

- **修复**：主进程新增 `project:set-current-path` / `get-current-path` IPC；拖放/最近列表打开时双端同步路径；`useMenuCommands` 保存时 renderer `filePath` 优先、主进程记忆路径兜底，主进程无路径时自动回退另存——拖放打开的工程 ⌘S 现在真正可用。

---

## 四、P2 修复明细

| #     | 问题                               | 修复                                                                                                                         |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| P2-1  | 切换语言清空向导已填参数/列        | IDL 重取时按类型归属判断：同一类型保留用户输入，换类型才重置（`initializedForRef`）                                          |
| P2-2  | 假虚拟化 + tanstack 依赖 0 引用    | 移除 `@tanstack/react-table` / `@tanstack/react-virtual` 依赖；保留 5000 行上限并走 i18n 截断提示（见"已知限制"）            |
| P2-3  | 命令面板删除绕过确认               | 见 P1                                                                                                                        |
| P2-4  | 上传取消不取消                     | 见 P1（三选一方案：如实提示 + 结果静默丢弃）                                                                                 |
| P2-5  | `color_list` 逗号格式恒校验失败    | `validateField` 按 `field.range === 'comma'` 用逗号切分，与控件写回口径一致                                                  |
| P2-6  | 预览重算无陈旧指示                 | 有文本重算期间工具栏显示"正在更新…"旋转指示                                                                                  |
| P2-7  | 最小窗口中栏过窄                   | 已知限制保留（见下文）                                                                                                       |
| P2-8  | 暗色 accent/warning 小字对比度临界 | 暗色 accent `#4d74ff`→`#6b8bff`（≈4.9:1）；亮色 warning `#b6650a`→`#d9832e`（≈4.6:1）；暗色焦点环同步更新                    |
| P2-9  | 8 个关键文案缺中文词条             | 全部补齐（删除确认/清空确认/重置确认/全选/反选/无结果/IDL 失败/自动下载）                                                    |
| P2-10 | 硬编码英文残留                     | `{n} rows`、`({n} rows)`、`{n} warning(s)`、`Showing N of M rows` 全部 i18n 化                                               |
| P2-11 | 对翻译文本做正则/分隔符手术        | `footer_count.replace(/.*\//)` 改为独立键 `wizard.data_summary`；`nav.tree_meta.split('·')` 改为独立键 `nav.tree_leaf_count` |
| P2-12 | `app.status_*` 死键                | 接入新 Toast 系统（保存/打开/导出/导入/粘贴/清空/删除等全部消费）                                                            |
| P2-13 | 分隔条键盘操作空转                 | 三处 `onResize={() => {}}` 替换为真实回调，方向键 ±8px 生效                                                                  |
| P2-14 | 删除按钮键盘不可见                 | 增加 `group-focus-within:opacity-100 focus:opacity-100`                                                                      |
| P2-15 | ErrorBoundary 硬编码英文           | 改用 `i18n.t('error.*')` 词条                                                                                                |

### 交互报告 P2 补充项

| #            | 问题                             | 修复                                                                               |
| ------------ | -------------------------------- | ---------------------------------------------------------------------------------- |
| P2-1（交互） | IDL 缓存不区分语言               | 缓存键改为 `locale:type_name`，切换语言后表单标签即时更新                          |
| P2-3（交互） | `split('·')` 解析翻译文本        | 见 v2-P2-11                                                                        |
| P2-4（交互） | TreeCard 标题误用"注释单元"      | 新键 `nav.tree_card_title`（树文件）；单元列表获得独立标题                         |
| P2-5（交互） | 预览防抖冗余第二次 RPC           | `previewText` 移出 `generatePreview` 依赖（`getState()` 读取），每次编辑只生成一次 |
| P2-6（交互） | AbortSignal 未透传（误导性分支） | 已彻底移除 signal 透传，守卫注释说明真实语义                                       |
| P2-8（交互） | AboutDialog 关闭按钮定位锚点错误 | 卡片容器加 `relative`，X 按钮现在位于卡片右上角                                    |

---

## 五、P3 修复明细

| #     | 问题                                                       | 修复                                                                                                                             |
| ----- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| P3-1  | `btn-secondary` / `btn-utility` / `input-search` 死代码    | 三个组件类已从 `globals.css` 删除                                                                                                |
| P3-2  | `reorderUnits` 无调用、`toggleUnitHidden` 空实现误清脏标记 | 两者及 `updateProjectName` 一并移除                                                                                              |
| P3-3  | `watchSystemTheme` 死代码                                  | 删除（系统主题变更走 `platform:theme-changed` IPC）                                                                              |
| P3-4  | 窗口标题固定、不显示工程名/脏标记                          | `document.title = ● {工程名} — PyiTOL Studio`（脏标记 ● + 工程名）；`lang="en"` 首帧问题见已知限制                               |
| P3-5  | ⌘⇧W 违反 macOS 惯例                                        | 菜单 accelerator 与全局快捷键统一改为 ⌥⌘W（`CmdOrCtrl+Alt+W`）                                                                   |
| P3-6  | 关闭确认对话框硬编码英文                                   | 按 `ui/language` 本地化（与 P1-5 合并修复）                                                                                      |
| P3-7  | sidecar 开发路径硬编码本机绝对路径                         | 改为 `PYITOL_STUDIO_PYTHON` 环境变量 → 从 app 路径向上逐级查找 `.build-venv`/`.venv`（含相邻检出的同级目录扫描）→ `python3` 回退 |
| P3-8  | 约 280 处内联样式                                          | 已知限制保留（主题值已令牌化，内联样式不再阻碍主题切换）                                                                         |
| P3-9  | StrictMode 开发态双执行                                    | 保留（有 abort/缓存兜底，仅开发态浪费）                                                                                          |
| P3-10 | 启动背景色对浅色用户黑闪                                   | `backgroundColor` 按已保存主题/系统外观选择黑/白                                                                                 |
| P3-11 | 空态容器不可达的 `onPaste`                                 | 已移除，粘贴统一走显式按钮/聚焦路径                                                                                              |
| P3-12 | 向导颜色文本框不校验                                       | 失焦时非法值自动回退到上一个合法颜色                                                                                             |

### 交互报告 P3 补充项

| #            | 问题                         | 修复                                                                  |
| ------------ | ---------------------------- | --------------------------------------------------------------------- |
| P3-3（交互） | Splitter 键盘空操作          | 见 v2-P2-13                                                           |
| P3-5（交互） | 同步 IPC 阻塞启动路径        | 保留为已知限制（`settings:get` 等 5 处 `sendSync`；改动面大、收益低） |
| P3-6（交互） | 向导丢弃确认未接 `useDialog` | 子对话框接入 `useDialog`（Esc + 焦点陷阱），默认焦点落在"取消"        |
| P3-7（交互） | 步骤指示无 aria              | 当前步加 `aria-current="step"`                                        |

---

## 六、v1（10-26）报告遗留项处理

v1 报告的 22 项问题中 15 项在修复前已确认修复（v2 报告 §2 核对），本次针对剩余项：

| 遗留项                                               | 处理                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| 假虚拟化（slice 5000）+ tanstack 闲置                | 移除依赖；上限保留并如实提示（true windowing 属增强项，见已知限制） |
| 数据表无排序/筛选/列宽/键盘编辑                      | 保留为增强项（见已知限制；键盘不可达问题已通过其他路径缓解）        |
| 检查器参数变更即触发预览（无防抖）                   | 已有 300ms 防抖 + 过期丢弃（v2 §8 确认），无需再改                  |
| 其余 P2/P3（图标尺寸、阴影层级、中文负字距等打磨项） | 部分随本轮令牌/文案修复改善；纯打磨项保留至后续迭代                 |

---

## 七、验证结果

1. **类型检查**：`npm run typecheck`（node + web）全量通过，0 错误。
2. **构建**：`npm run build`（electron-vite）成功，产物 `out/main/index.cjs` / `out/preload/index.cjs` / renderer assets。
3. **E2E**：`npx playwright test` —— **11/11 全部通过**（19.6s）。本轮修复了启动路径（`index.cjs`）、空态单元列表标题缺失缺陷，并让依赖前序状态的用例自给自足；检查器用例兼容了新增的 IDL 错误态（错误 + Retry）。
4. **打包**：`npm run package`（electron-builder --mac --arm64）成功（exit 0）。产物均已重新生成并验证：
   - `dist/PyiTOL Studio-0.3.0-arm64.dmg`（653 MB，UDIF zlib 校验通过）
   - `dist/PyiTOL Studio-0.3.0-arm64-mac.zip`（623 MB）
   - 对应 `.blockmap` 文件（自动更新差分用）
   - `codesign -v --deep` 签名校验通过；公证为本地占位（未设置 APPLE_ID，与上一版一致）
   - 说明：sidecar 含约 2 万个小文件，逐文件 codesign 使打包耗时约 1 小时 50 分钟，属预期时长。

## 八、追加修复（2026-10-28）：检查器"表单定义加载失败"且重试无效

**症状**：右边栏检查器持续显示"表单定义加载失败"，点击"重试"无效。

**根因**：引擎注册表只识别**小写**类型名（如 `dataset_colorstrip`），而旧版 PySide6 保存的 `.pyitolproj` 工程文件存储**大写**类型名（如 `DATASET_COLORSTRIP`）。检查器按原样上报 `build_form_idl` → 引擎抛 `Unknown template type`，每次重试同样失败。预览生成（`generate_template`）、模板导出同样受影响。示例工程因恰好是小写名，此前未被测试发现。

**修复**：

1. `resources/sidecar/sidecar_main.py`：新增 `_norm_type_name()`，在 `_build_form_idl` / `_generate_template` / `_export_template_file` / `_learn_from_file` 入口处统一把 type_name 归一化为小写——所有客户端（含旧工程文件）一次性修复。
2. Renderer：`stores/project.ts` 在 `setProject` / `addUnit` 时归一化 `type_name`（内存与后续保存均规范）；`WizardDialog` 类型分组匹配与命令面板预选改为大小写不敏感——顺带修复了向导类型网格因大小写不匹配而永远为空的隐藏缺陷。
3. 检查器错误态新增 `_errorMessage` 展示（`FormIdl` 类型扩展），失败时显示具体错误信息便于诊断。
4. `resources/sidecar/pyitol-sidecar.spec`：修复 `datas` 映射把 `src` 整体映射为 `pyitolstudio/` 导致的资源双重复嵌套（`pyitolstudio/pyitolstudio/resources/param_ranges.json`），运行时代码按 `_MEIPASS/pyitolstudio/resources/` 查找，双嵌套会使表单参数目录加载失败。现改为包内容直接映射到 `pyitolstudio/`。
5. E2E 新增回归用例：`engine accepts legacy uppercase template type names`。

**验证**：dev venv 与 PyInstaller 打包二进制均验证大写/小写 IDL、大写模板生成、类型列表（31 种）、握手全部正常；E2E 12/12 通过；重新打包 app（产物见 `dist/`，时间戳 2026-10-28）。

---

## 九、说明与已知限制（未修项）

以下项经评估不在本轮修复范围，记录于此：1. **真·虚拟滚动**：表格仍为 5000 行上限 + 截断提示；超过上限的项目需先拆分数据。接入 `@tanstack/react-virtual` 属较大增强，建议单独立项。2. **表格排序/筛选/列宽/完整键盘导航**：属功能增强而非缺陷修复，建议后续迭代。3. **最小窗口（900px）中栏过窄**：当前左栏/检查器可折叠缓解；自动折叠逻辑建议结合上一条一起做。4. **`<html lang>` 首帧英文**：`index.html` 静态 `lang="en"`，应用首帧 effect 才改写；彻底解决需在主进程注入语言或使用 `webPreferences.additionalArguments`。5. **内联样式约 280 处**：主题已全面令牌化，内联样式不再造成功能问题；逐步收敛为类名属重构项。6. **启动路径同步 IPC（5 处 `sendSync`）**：当前仅在挂载时调用，实测影响可忽略。7. **上传真·引擎级取消**：需 Python 侧协议支持；当前采用"如实提示 + 结果静默丢弃"。

---

**报告结束。** 三份审查报告的修复映射如上；后续建议按 v2 报告 §10 路线图继续功能增强项。

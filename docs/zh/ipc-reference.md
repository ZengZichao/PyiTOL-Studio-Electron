# IPC 参考

[English](../en/ipc-reference.md) | [简体中文](../zh/ipc-reference.md)

渲染层与主进程之间的全部通道，以及它们在 `window.pyitol` 上暴露的类型化 API。权威契约见 `src/shared/types.ts`（`PreloadApi`）。

## 通道总览

| 分组    | 通道                              | 方向                  | 类型     |
| ------- | --------------------------------- | --------------------- | -------- |
| Sidecar | `sidecar:call`                    | 渲染 → 主（invoke）   | 异步     |
| Sidecar | `sidecar:progress`                | 主 → 渲染（事件）     | 推送     |
| Sidecar | `sidecar:crash`                   | 主 → 渲染（事件）     | 推送     |
| Sidecar | `sidecar:engine-version`          | 渲染 → 主（sendSync） | 同步     |
| 工程    | `project:new`                     | invoke                | 异步     |
| 工程    | `project:open`                    | invoke                | 异步     |
| 工程    | `project:save`                    | invoke                | 异步     |
| 工程    | `project:save-as`                 | invoke                | 异步     |
| 工程    | `project:load-example`            | invoke                | 异步     |
| 工程    | `project:recent`                  | invoke                | 异步     |
| 工程    | `project:add-recent`              | invoke                | 异步     |
| 工程    | `project:clear-recent`            | invoke                | 异步     |
| 文件    | `files:pick-tree`                 | invoke                | 异步     |
| 文件    | `files:pick-template`             | invoke                | 异步     |
| 文件    | `files:pick-data`                 | invoke                | 异步     |
| 文件    | `files:pick-directory`            | invoke                | 异步     |
| 文件    | `files:read`                      | invoke                | 异步     |
| 文件    | `files:write`                     | invoke                | 异步     |
| 文件    | `files:export-template`           | invoke                | 异步     |
| 文件    | `files:detect-type`               | invoke                | 异步     |
| 文件    | `files:get-temp-dir`              | sendSync              | 同步     |
| 文件    | `files:join-path`                 | sendSync              | 同步     |
| 剪贴板  | `clipboard:read`                  | invoke                | 异步     |
| 剪贴板  | `clipboard:write`                 | send                  | 发后即忘 |
| 设置    | `settings:get`                    | sendSync              | 同步     |
| 设置    | `settings:set`                    | send                  | 发后即忘 |
| 设置    | `settings:delete`                 | send                  | 发后即忘 |
| 平台    | `platform:open-external`          | invoke                | 异步     |
| 平台    | `platform:show-in-folder`         | send                  | 发后即忘 |
| 平台    | `platform:should-use-dark-colors` | sendSync              | 同步     |
| 平台    | `platform:theme-changed`          | 主 → 渲染（事件）     | 推送     |
| 菜单    | `menu:command`                    | 主 → 渲染（事件）     | 推送     |
| 上传    | `upload:run`                      | invoke                | 异步     |
| 上传    | `upload:progress`                 | 主 → 渲染（事件）     | 推送     |
| 上传    | `upload:cancel`                   | send                  | 发后即忘 |
| 脏标记  | `set-dirty`                       | send                  | 发后即忘 |
| 脏标记  | `check-dirty-sync`                | sendSync              | 同步     |
| 更新    | `update:check`                    | invoke                | 异步     |
| 更新    | `update:install`                  | invoke                | 异步     |
| 更新    | `update:status`                   | 主 → 渲染（事件）     | 推送     |

## 渲染层 API（`window.pyitol`）

### `sidecar`

| 方法            | 签名                                                               | 说明                                               |
| --------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| `call`          | `call<T>(method: RpcMethod, params, opts?: {signal?}): Promise<T>` | 转发到 `sidecar:call`；主进程按需拉起/启动 sidecar |
| `onProgress`    | `(cb: (msg, percent?) => void) => unsubscribe`                     | `sidecar:progress`                                 |
| `onCrash`       | `(cb: (msg) => void) => unsubscribe`                               | `sidecar:crash`                                    |
| `engineVersion` | `() => string \| null`                                             | 同步读取握手结果                                   |

### `project`

| 方法                                      | 返回                        | 说明                                                        |
| ----------------------------------------- | --------------------------- | ----------------------------------------------------------- |
| `newProject`                              | `PyitolProjectData`         | 空的 v1 工程                                                |
| `openProject`                             | `PyitolProjectData \| null` | 原生打开对话框；取消返回 `null`；记录 `project/currentPath` |
| `saveProject(data)`                       | `string \| null`            | 尚无路径时返回 `null`（渲染层随后调用 `saveProjectAs`）     |
| `saveProjectAs(data)`                     | `string \| null`            | 原生保存对话框；缺后缀时补 `.pyitolproj`                    |
| `loadExampleProject`                      | `PyitolProjectData \| null` | 从资源目录加载；清除 `project/currentPath`（须先另存）      |
| `readRecentProjects`                      | `RecentProjectEntry[]`      | 过滤文件已不存在的条目                                      |
| `addRecentProject(path, name, unitCount)` | `void`                      | 按路径去重，保留最近 10 条                                  |
| `clearRecentProjects`                     | `void`                      |                                                             |

### `files`

| 方法                          | 返回                                | 说明                                                                         |
| ----------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `pickTreeFile`                | `string \| null`                    | `.nwk .newick .tre .tree .txt`                                               |
| `pickTemplateFile`            | `string \| null`                    | `.txt`                                                                       |
| `pickDataFile`                | `string \| null`                    | `.csv .tsv .txt`                                                             |
| `pickDirectory`               | `string \| null`                    |                                                                              |
| `readFile(path)`              | `string`                            | 文件不存在时抛错                                                             |
| `writeFile(path, content)`    | `void`                              |                                                                              |
| `exportTemplate(defaultName)` | `string \| null`                    | `.txt` 保存对话框                                                            |
| `detectFileType(path)`        | `'tree' \| 'template' \| 'unknown'` | 先按扩展名，再做内容嗅探（Newick：以 `;` 结尾且含括号；模板：含 `DATASET_`） |
| `getTempDir()`                | `string`                            | 同步                                                                         |
| `joinPath(dir, file)`         | `string`                            | 同步                                                                         |

### `clipboard`

`readText(): Promise<string>`、`writeText(text): void`。

### `settings`

`userData/settings.json` 中的同步键值持久化：
`get<T>(key, fallback): T`、`set<T>(key, value): void`、`delete(key): void`。

在用的键：`ui/theme`、`ui/language`、`app/dirty`、`project/currentPath`、`project/recent`。

### `platform`

| 方法                    | 说明                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `onThemeChange(cb)`     | `platform:theme-changed`；仅 `https://` 链接会交给系统浏览器 |
| `shouldUseDarkColors()` | 同步快照                                                     |
| `openExternal(url)`     | 拒绝非 `https://` 的 URL                                     |
| `showInFolder(path)`    | 在访达中显示                                                 |

### `menu`

`onCommand(cb: (command: MenuCommand) => void): unsubscribe` —— 原生菜单以命令 id 转发。`MenuCommand` 全集：`new-project`、`open-project`、`save-project`、`save-project-as`、`open-wizard`、`import-template`、`generate-preview`、`export-template`、`upload-itol`、`toggle-rail`、`toggle-inspector`、`toggle-theme`、`switch-language`、`open-command-palette`、`open-example`、`show-about`。

### `upload`

| 方法                               | 说明                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `run(params, onProgress, signal?)` | 生成请求 id，订阅按 id 过滤的 `upload:progress`，以 `UploadResult {tree_id, files}` 完成；中止只在本地 reject（引擎继续运行） |
| `cancel()`                         | 预留；引擎级取消尚未实现                                                                                                      |

`UploadParams`：`{tree_file, template_files[], output_dir, fmt, api_key_file|null, project_name|null, force}`。

### `dirty`

`set(dirty: boolean)`、`check(): boolean`（同步）。驱动窗口关闭时的未保存修改对话框。

### `update`

`check()`、`install()`、`onStatus(cb: (UpdateStatus) => void)`。
`UpdateStatus.status`：`checking | available | not-available | downloading | downloaded | error`（可选 `version`、`percent`、`error`）。仅生产环境。

## 菜单快捷键

| 快捷键 | 命令                 |
| ------ | -------------------- |
| ⌘N     | new-project          |
| ⌘O     | open-project         |
| ⌘S     | save-project         |
| ⇧⌘S    | save-project-as      |
| ⇧⌘W    | open-wizard          |
| ⌘I     | import-template      |
| ⇧⌘E    | open-example         |
| ⌘B     | toggle-rail          |
| ⌘J     | toggle-inspector     |
| ⌘K     | open-command-palette |
| ⌘R     | generate-preview     |
| ⌘E     | export-template      |
| ⌘U     | upload-itol          |

## 约定

- 基于对话框的处理器返回 `null` 表示"用户取消"。
- 所有错误以被拒绝的 promise 跨桥传递，`message` 可直接呈现给用户。
- 同步通道（`sendSync`）仅限廉价读取：设置、脏标记、临时目录、路径拼接、主题快照、引擎版本。

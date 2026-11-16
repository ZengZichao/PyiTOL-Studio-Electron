# IPC Reference

[English](../en/ipc-reference.md) | [简体中文](../zh/ipc-reference.md)

All channels between the renderer and the main process, and the typed API they surface as `window.pyitol`. The authoritative contract is `src/shared/types.ts` (`PreloadApi`).

## Channels at a glance

| Group     | Channel                           | Direction                  | Type            |
| --------- | --------------------------------- | -------------------------- | --------------- |
| Sidecar   | `sidecar:call`                    | renderer → main (invoke)   | async           |
| Sidecar   | `sidecar:progress`                | main → renderer (event)    | push            |
| Sidecar   | `sidecar:crash`                   | main → renderer (event)    | push            |
| Sidecar   | `sidecar:engine-version`          | renderer → main (sendSync) | sync            |
| Project   | `project:new`                     | invoke                     | async           |
| Project   | `project:open`                    | invoke                     | async           |
| Project   | `project:save`                    | invoke                     | async           |
| Project   | `project:save-as`                 | invoke                     | async           |
| Project   | `project:load-example`            | invoke                     | async           |
| Project   | `project:recent`                  | invoke                     | async           |
| Project   | `project:add-recent`              | invoke                     | async           |
| Project   | `project:clear-recent`            | invoke                     | async           |
| Files     | `files:pick-tree`                 | invoke                     | async           |
| Files     | `files:pick-template`             | invoke                     | async           |
| Files     | `files:pick-data`                 | invoke                     | async           |
| Files     | `files:pick-directory`            | invoke                     | async           |
| Files     | `files:read`                      | invoke                     | async           |
| Files     | `files:write`                     | invoke                     | async           |
| Files     | `files:export-template`           | invoke                     | async           |
| Files     | `files:detect-type`               | invoke                     | async           |
| Files     | `files:get-temp-dir`              | sendSync                   | sync            |
| Files     | `files:join-path`                 | sendSync                   | sync            |
| Clipboard | `clipboard:read`                  | invoke                     | async           |
| Clipboard | `clipboard:write`                 | send                       | fire-and-forget |
| Settings  | `settings:get`                    | sendSync                   | sync            |
| Settings  | `settings:set`                    | send                       | fire-and-forget |
| Settings  | `settings:delete`                 | send                       | fire-and-forget |
| Platform  | `platform:open-external`          | invoke                     | async           |
| Platform  | `platform:show-in-folder`         | send                       | fire-and-forget |
| Platform  | `platform:should-use-dark-colors` | sendSync                   | sync            |
| Platform  | `platform:theme-changed`          | main → renderer (event)    | push            |
| Menu      | `menu:command`                    | main → renderer (event)    | push            |
| Upload    | `upload:run`                      | invoke                     | async           |
| Upload    | `upload:progress`                 | main → renderer (event)    | push            |
| Upload    | `upload:cancel`                   | send                       | fire-and-forget |
| Dirty     | `set-dirty`                       | send                       | fire-and-forget |
| Dirty     | `check-dirty-sync`                | sendSync                   | sync            |
| Update    | `update:check`                    | invoke                     | async           |
| Update    | `update:install`                  | invoke                     | async           |
| Update    | `update:status`                   | main → renderer (event)    | push            |

## Renderer-facing API (`window.pyitol`)

### `sidecar`

| Method          | Signature                                                          | Notes                                                                |
| --------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `call`          | `call<T>(method: RpcMethod, params, opts?: {signal?}): Promise<T>` | forwards to `sidecar:call`; main spawns/starts the sidecar on demand |
| `onProgress`    | `(cb: (msg, percent?) => void) => unsubscribe`                     | `sidecar:progress`                                                   |
| `onCrash`       | `(cb: (msg) => void) => unsubscribe`                               | `sidecar:crash`                                                      |
| `engineVersion` | `() => string \| null`                                             | sync read of the handshake result                                    |

### `project`

| Method                                    | Returns                     | Notes                                                                          |
| ----------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `newProject`                              | `PyitolProjectData`         | empty v1 project                                                               |
| `openProject`                             | `PyitolProjectData \| null` | native open dialog; `null` when cancelled; stores `project/currentPath`        |
| `saveProject(data)`                       | `string \| null`            | returns `null` when no path is known yet (renderer then calls `saveProjectAs`) |
| `saveProjectAs(data)`                     | `string \| null`            | native save dialog; appends `.pyitolproj` when missing                         |
| `loadExampleProject`                      | `PyitolProjectData \| null` | loads from resources; clears `project/currentPath` (must save-as first)        |
| `readRecentProjects`                      | `RecentProjectEntry[]`      | filters entries whose file no longer exists                                    |
| `addRecentProject(path, name, unitCount)` | `void`                      | de-duplicates by path, keeps the 10 most recent                                |
| `clearRecentProjects`                     | `void`                      |                                                                                |

### `files`

| Method                        | Returns                             | Notes                                                                                                        |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pickTreeFile`                | `string \| null`                    | `.nwk .newick .tre .tree .txt`                                                                               |
| `pickTemplateFile`            | `string \| null`                    | `.txt`                                                                                                       |
| `pickDataFile`                | `string \| null`                    | `.csv .tsv .txt`                                                                                             |
| `pickDirectory`               | `string \| null`                    |                                                                                                              |
| `readFile(path)`              | `string`                            | throws when missing                                                                                          |
| `writeFile(path, content)`    | `void`                              |                                                                                                              |
| `exportTemplate(defaultName)` | `string \| null`                    | save dialog for `.txt`                                                                                       |
| `detectFileType(path)`        | `'tree' \| 'template' \| 'unknown'` | extension first, then content sniff (Newick: ends `;` + parens; template: starts with / contains `DATASET_`) |
| `getTempDir()`                | `string`                            | sync                                                                                                         |
| `joinPath(dir, file)`         | `string`                            | sync                                                                                                         |

### `clipboard`

`readText(): Promise<string>`, `writeText(text): void`.

### `settings`

Synchronous key/value persistence in `userData/settings.json`:
`get<T>(key, fallback): T`, `set<T>(key, value): void`, `delete(key): void`.

Keys in use: `ui/theme`, `ui/language`, `app/dirty`, `project/currentPath`, `project/recent`.

### `platform`

| Method                  | Notes                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| `onThemeChange(cb)`     | `platform:theme-changed`; only `https://` links are opened externally |
| `shouldUseDarkColors()` | sync snapshot                                                         |
| `openExternal(url)`     | refuses non-`https://` URLs                                           |
| `showInFolder(path)`    | Finder reveal                                                         |

### `menu`

`onCommand(cb: (command: MenuCommand) => void): unsubscribe` — the native menu forwards commands as ids. Full `MenuCommand` union: `new-project`, `open-project`, `save-project`, `save-project-as`, `open-wizard`, `import-template`, `generate-preview`, `export-template`, `upload-itol`, `toggle-rail`, `toggle-inspector`, `toggle-theme`, `switch-language`, `open-command-palette`, `open-example`, `show-about`.

### `upload`

| Method                             | Notes                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run(params, onProgress, signal?)` | generates a request id, subscribes to filtered `upload:progress`, resolves with `UploadResult {tree_id, files}`; abort rejects locally (engine keeps running) |
| `cancel()`                         | reserved; engine-level cancellation is not implemented                                                                                                        |

`UploadParams`: `{tree_file, template_files[], output_dir, fmt, api_key_file|null, project_name|null, force}`.

### `dirty`

`set(dirty: boolean)`, `check(): boolean` (sync). Drives the unsaved-changes dialog on window close.

### `update`

`check()`, `install()`, `onStatus(cb: (UpdateStatus) => void)`.
`UpdateStatus.status`: `checking | available | not-available | downloading | downloaded | error` (+ optional `version`, `percent`, `error`). Production only.

## Menu accelerators

| Accelerator | Command              |
| ----------- | -------------------- |
| ⌘N          | new-project          |
| ⌘O          | open-project         |
| ⌘S          | save-project         |
| ⇧⌘S         | save-project-as      |
| ⇧⌘W         | open-wizard          |
| ⌘I          | import-template      |
| ⇧⌘E         | open-example         |
| ⌘B          | toggle-rail          |
| ⌘J          | toggle-inspector     |
| ⌘K          | open-command-palette |
| ⌘R          | generate-preview     |
| ⌘E          | export-template      |
| ⌘U          | upload-itol          |

## Conventions

- `null` return from dialog-based handlers means "user cancelled".
- All errors cross the bridge as rejected promises whose `message` is user-presentable.
- Sync channels (`sendSync`) are limited to cheap reads: settings, dirty flag, temp dir, path join, theme snapshot, engine version.

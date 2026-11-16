/**
 * Shared type definitions — the single source of truth for IPC contracts
 * between the Electron main process, the preload bridge, and the React
 * renderer.
 *
 * Nothing in this file may import from `electron`, `react`, or any
 * runtime-only module.  It is pure TypeScript types and interfaces.
 */

// ---------------------------------------------------------------------------
// Sidecar JSON-RPC protocol (stdio, line-delimited JSON)
// ---------------------------------------------------------------------------

export type RpcMethod =
  | 'handshake'
  | 'list_template_types'
  | 'build_form_idl'
  | 'generate_template'
  | 'learn_from_file'
  | 'tree_leaf_ids'
  | 'export_template_file'
  | 'upload'

export interface RpcRequest<P = unknown> {
  jsonrpc: '2.0'
  id: number
  method: RpcMethod
  params: P
}

export interface RpcSuccessResult<T = unknown> {
  jsonrpc: '2.0'
  id: number
  result: T
}

export interface RpcErrorResult {
  jsonrpc: '2.0'
  id: number
  error: { code: number; message: string; data?: unknown }
}

export type RpcResponse<T = unknown> = RpcSuccessResult<T> | RpcErrorResult

export interface RpcProgressNotification {
  jsonrpc: '2.0'
  method: 'progress'
  params: { id: number; message: string; percent?: number }
}

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

export interface HandshakeParams {
  client: string
  version: string
}

export interface HandshakeResult {
  engine_version: string
  pyitol_version: string
  pid: number
}

/** Python engine connectivity as seen by the renderer. */
export type EngineStatus = 'connecting' | 'ready' | 'disconnected'

// ---------------------------------------------------------------------------
// list_template_types
// ---------------------------------------------------------------------------

export interface TemplateTypeInfo {
  type_name: string
  header: string
  required_columns: string[]
  no_label_color: boolean
  group: 'datasets' | 'tree' | 'metadata' | 'extensions'
  group_label: string
  wizard_supported: boolean
  priority: number
}

export type ListTemplateTypesResult = TemplateTypeInfo[]

// ---------------------------------------------------------------------------
// build_form_idl
// ---------------------------------------------------------------------------

export interface BuildFormIdlParams {
  type: string
  locale: 'zh' | 'en'
}

export interface FieldSpec {
  key: string
  label: string
  widget: 'text' | 'int' | 'float' | 'color' | 'bool' | 'choice' | 'color_list' | 'text_list'
  default: string | number | boolean
  required: boolean
  group: 'basic' | 'mapping' | 'appearance' | 'legend'
  choices?: string[]
  choice_labels?: string[]
  minimum?: number
  maximum?: number
  range?: string
  unit?: string
  hint?: string
  help?: string
}

export interface IdlGroup {
  key: string
  label_key: string
  expanded: boolean
  fields: FieldSpec[]
}

export interface FormIdl {
  type_name: string
  header: string
  group_label: string
  wizard_supported: boolean
  no_label_color: boolean
  separator_choices: string[]
  fields: FieldSpec[]
  groups: IdlGroup[]
  data_columns: string[]
  data_column_labels: string[]
  data_columns_dynamic: string | null
  /** Set when the IDL fetch failed — the inspector shows an error + retry instead of perpetual loading. */
  _error?: boolean
  /** Original error message when _error is set (shown in the inspector for diagnosis). */
  _errorMessage?: string
}

// ---------------------------------------------------------------------------
// generate_template
// ---------------------------------------------------------------------------

export interface UnitSpec {
  type_name: string
  label: string
  color: string
  separator: string
  columns: string[]
  data_rows: Record<string, string>[]
  parameters: Record<string, string>
  legend: Record<string, string>
  template_name: string
}

export interface GenerateTemplateParams {
  unit: UnitSpec
}

export interface GenerateTemplateResult {
  text: string
  warnings: string[]
}

// ---------------------------------------------------------------------------
// learn_from_file
// ---------------------------------------------------------------------------

export interface LearnFromFileParams {
  path: string
}

export interface LearnedUnit {
  type_name: string
  header: string
  separator: string
  label: string
  color: string
  columns: string[]
  data_rows: Record<string, string>[]
  parameters: Record<string, string>
  legend: Record<string, string>
  source_file: string
}

export type LearnFromFileResult = LearnedUnit[]

// ---------------------------------------------------------------------------
// tree_leaf_ids
// ---------------------------------------------------------------------------

export interface TreeLeafIdsParams {
  path: string
}

export interface TreeLeafIdsResult {
  leaf_ids: string[] | null
}

// ---------------------------------------------------------------------------
// export_template_file
// ---------------------------------------------------------------------------

export interface ExportTemplateFileParams {
  unit: UnitSpec
  path: string
}

export interface ExportTemplateFileResult {
  path: string
}

// ---------------------------------------------------------------------------
// upload
// ---------------------------------------------------------------------------

export interface UploadParams {
  tree_file: string
  template_files: string[]
  output_dir: string
  fmt: string
  api_key_file: string | null
  project_name: string | null
  force: boolean
}

export interface UploadResult {
  tree_id: string
  files: Record<string, string>
}

// ---------------------------------------------------------------------------
// Project model (mirrors .pyitolproj v1, byte-level compatible)
// ---------------------------------------------------------------------------

export interface UnitData {
  unit_id: string
  type_name: string
  label: string
  color: string
  separator: string
  columns: string[]
  data_rows: Record<string, string>[]
  parameters: Record<string, string>
  legend: Record<string, string>
  source: 'manual' | 'learned'
}

export interface PyitolProjectData {
  pyitolproj_version: 1
  name: string
  tree_path: string
  units: UnitData[]
}

// ---------------------------------------------------------------------------
// Preload bridge API (exposed to renderer via contextBridge)
// ---------------------------------------------------------------------------

export interface PreloadApi {
  // Sidecar engine calls
  // NOTE: AbortSignal must NOT be passed through ipcRenderer.invoke —
  // it is not structured-cloneable and would make every call throw.
  // Cancellation for sidecar calls is handled client-side by discarding
  // stale results (see Workbench generatePreview).
  sidecar: {
    call<T = unknown>(method: RpcMethod, params: unknown): Promise<T>
    onProgress(cb: (msg: string, percent?: number) => void): () => void
    onCrash(cb: (msg: string) => void): () => void
    engineVersion(): string | null
  }

  // Project file operations
  project: {
    newProject(): Promise<PyitolProjectData>
    openProject(): Promise<PyitolProjectData | null>
    saveProject(data: PyitolProjectData): Promise<string | null>
    saveProjectAs(data: PyitolProjectData): Promise<string | null>
    loadExampleProject(): Promise<PyitolProjectData | null>
    readRecentProjects(): Promise<RecentProjectEntry[]>
    addRecentProject(path: string, name: string, unitCount: number): Promise<void>
    clearRecentProjects(): Promise<void>
    /** Tell the main process which path this project lives at (drag-open / recent-open). */
    setCurrentPath(path: string | null): Promise<void>
    /** Ask the main process for the path it remembers for this project. */
    getCurrentPath(): Promise<string | null>
    /** Report the outcome of a save triggered by the close-intercept dialog. */
    reportSaveFinished(saved: boolean): void
  }

  // File operations
  files: {
    pickTreeFile(): Promise<string | null>
    pickTemplateFile(): Promise<string | null>
    pickDataFile(): Promise<string | null>
    pickDirectory(): Promise<string | null>
    readFile(path: string): Promise<string>
    writeFile(path: string, content: string): Promise<void>
    deleteFile(path: string): Promise<void>
    exportTemplate(defaultName: string): Promise<string | null>
    detectFileType(path: string): Promise<'tree' | 'template' | 'unknown'>
    getTempDir(): string
    joinPath(dir: string, file: string): string
    /** Resolve the on-disk path of a dropped File object (Electron ≥ 32 replacement for File.path). */
    getPathForFile(file: File): string | null
  }

  // Clipboard
  clipboard: {
    readText(): Promise<string>
    writeText(text: string): void
  }

  // Settings persistence
  settings: {
    get<T>(key: string, fallback: T): T
    set<T>(key: string, value: T): void
    delete(key: string): void
  }

  // Window / platform
  platform: {
    onThemeChange(cb: (theme: 'light' | 'dark') => void): () => void
    shouldUseDarkColors(): boolean
    openExternal(url: string): Promise<void>
    showInFolder(path: string): void
  }

  // Menu commands (main process → renderer)
  menu: {
    onCommand(cb: (command: MenuCommand) => void): () => void
  }

  // Upload (long-running, with progress)
  upload: {
    run(
      params: UploadParams,
      onProgress: (msg: string, percent?: number) => void,
      signal?: AbortSignal
    ): Promise<UploadResult>
    cancel(): void
  }

  // Dirty state (unsaved changes tracking)
  dirty: {
    set(dirty: boolean): void
    check(): boolean
  }

  // Auto-updater
  update: {
    check(): Promise<void>
    install(): Promise<void>
    onStatus(cb: (status: UpdateStatus) => void): () => void
  }
}

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  error?: string
}

export type MenuCommand =
  | 'new-project'
  | 'open-project'
  | 'save-project'
  | 'save-project-as'
  | 'open-wizard'
  | 'import-template'
  | 'generate-preview'
  | 'export-template'
  | 'upload-itol'
  | 'toggle-rail'
  | 'toggle-inspector'
  | 'toggle-theme'
  | 'switch-language'
  | 'open-command-palette'
  | 'open-example'
  | 'show-about'

export interface RecentProjectEntry {
  path: string
  name: string
  unitCount: number
  lastOpened: number
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export type ThemeMode = 'light' | 'dark' | 'system'

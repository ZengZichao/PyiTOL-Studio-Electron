# Sidecar JSON-RPC 协议

[English](../en/sidecar-protocol.md) | [简体中文](../zh/sidecar-protocol.md)

本文规定 Electron 主进程与 Python sidecar 之间的线上协议。权威的 TypeScript 定义位于 `src/shared/types.ts`；Python 分发器位于 `resources/sidecar/sidecar_main.py`。

## 传输

- **通道：** sidecar 进程的 stdin/stdout，每行一个 JSON 文档（`\n` 分隔）。
- **编码：** UTF-8；Python 以 `PYTHONUNBUFFERED=1`、`PYTHONIOENCODING=utf-8` 运行。
- **stdout 只承载协议。** 引擎调试输出走 stderr，由主进程记录日志。stdout 上的非 JSON 行会被静默忽略。
- **超时：** 每个请求最多等待 5 分钟（300 000 ms），超时后主进程拒绝该挂起调用。

## 报文形态

请求：

```json
{"jsonrpc":"2.0","id":1,"method":"generate_template","params":{...}}
```

成功响应：

```json
{"jsonrpc":"2.0","id":1,"result":{...}}
```

错误响应：

```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32603, "message": "...", "data": "<traceback>" } }
```

进度通知（无 `id`，通过 `params.id` 关联所属请求）：

```json
{
  "jsonrpc": "2.0",
  "method": "progress",
  "params": { "id": 1, "message": "上传中…", "percent": 42 }
}
```

解析错误应答（输入行无法解析，`id` 为 `null`）：

```json
{ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": "Parse error: ..." } }
```

无效请求应答（缺少 `method` 字段）：

```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32600, "message": "Invalid request" } }
```

方法不存在应答：

```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32601, "message": "Method not found: foo" } }
```

## 错误码

| 代码     | 含义                                                |
| -------- | --------------------------------------------------- |
| `-32700` | 解析错误 —— 该行不是合法 JSON                       |
| `-32600` | 无效请求 —— 缺少 `method`                           |
| `-32601` | 方法不存在                                          |
| `-32603` | 内部错误 —— 处理器抛出异常；`data` 携带 Python 回溯 |

## 方法

### `handshake`

进程拉起后立即发送一次。参数：`{ "client": string, "version": string }`。

结果：

```json
{
  "engine_version": "1.2.0", // pyitol 引擎版本（尽力获取）
  "pyitol_version": "0.3.0", // pyitolstudio 适配层版本
  "pid": 4242
}
```

### `list_template_types`

参数：`{}`。返回 `TemplateTypeInfo[]`：

```json
[
  {
    "type_name": "DATASET_SIMPLEBAR",
    "header": "DATASET_SIMPLEBAR",
    "required_columns": ["ID", "VALUE"],
    "no_label_color": false,
    "group": "datasets", // datasets | tree | metadata | extensions
    "group_label": "Datasets",
    "wizard_supported": true,
    "priority": 10
  }
]
```

### `build_form_idl`

参数：`{ "type": string, "locale": "zh" | "en" }`（同时设置适配层翻译器语言）。返回描述参数表单的 `FormIdl`：`fields`（扁平列表，每项是 `FieldSpec`：键、控件类型、默认值、必填、分组、选项、范围、提示），`groups`（有序、可展开的分节），`data_columns`、`data_column_labels`、`data_columns_dynamic`、`separator_choices`。

控件类型：`text`、`int`、`float`、`color`、`bool`、`choice`、`color_list`、`text_list`。

### `generate_template`

参数：`{ "unit": UnitSpec }`，其中 `UnitSpec` 为：

```json
{
  "type_name": "DATASET_SIMPLEBAR",
  "label": "Consistency",
  "color": "#dd4477",
  "separator": "TAB",
  "columns": ["ID", "VALUE"],
  "data_rows": [{ "ID": "leaf_1", "VALUE": "0.83" }],
  "parameters": { "DATASET_LABEL": "Consistency" },
  "legend": {},
  "template_name": "Consistency"
}
```

结果：`{ "text": string, "warnings": string[] }` —— 模板文本加分隔行校验告警。

### `learn_from_file`

参数：`{ "path": string }`。解析既有 iTOL 模板文件，返回 `LearnedUnit[]`（与 `UnitSpec` 同形，另加 `header` 与 `source_file`）。支撑"导入模板"/"从文件反推"功能。

### `tree_leaf_ids`

参数：`{ "path": string }`。结果：`{ "leaf_ids": string[] | null }` —— Newick 树的排序叶 ID；无法按树解析时为 `null`。

### `export_template_file`

参数：`{ "unit": UnitSpec, "path": string }`。把生成的模板文本写入 `path`。结果：`{ "path": string }`。

### `upload`

参数：

```json
{
  "tree_file": "/path/to/tree.nwk",
  "template_files": ["/tmp/a.txt"],
  "output_dir": "/tmp/itol-out",
  "fmt": "svg",
  "api_key_file": "/path/to/key.txt", // 或 null
  "project_name": "My tree", // 或 null
  "force": false
}
```

结果：`{ "tree_id": string, "files": { "<name>": "<url>" } }`。这是会发出 `progress` 通知的长耗时调用；主进程为其打标后转发给渲染层的上传对话框。

## 主进程行为

- 调用按单调递增数字 id（`nextId`）关联。
- sidecar 崩溃后按指数退避重启（0.5 s、1 s、2 s；最多 3 次）。并发的 `start()` 共享同一个 spawn promise，因此一波调用绝不会拉起第二个进程。崩溃瞬间的挂起调用以 `Sidecar exited (code=…, signal=…)` 拒绝。
- 应用退出时 `dispose()` 取消重启定时器、拒绝挂起调用，并向进程发送 `SIGTERM`。

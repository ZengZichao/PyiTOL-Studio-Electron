# 构建与发布

[English](../en/build.md) | [简体中文](../zh/build.md)

如何产出 PyiTOL Studio 的 macOS 可分发版本：从 Python sidecar 包到签名公证后的 dmg。

## 总览

发布产物由两半组成，分别构建、在打包时合体：

1. **Python sidecar** —— 由 `resources/sidecar/pyitol-sidecar.spec` 构建的 PyInstaller **onedir** 包。
2. **Electron 应用** —— 经 electron-vite 编译到 `out/`，由 electron-builder 按 `electron-builder.yml` 打包。

electron-builder 以 `extraResources` 把 `resources/sidecar/dist` 拷到 `<app>/Contents/Resources/sidecar`，把 `resources/samples` 拷到 `Contents/Resources/samples`。

## 第 1 步 —— 构建 Python sidecar

```bash
cd resources/sidecar
python -m PyInstaller pyitol-sidecar.spec --noconfirm --distpath dist --workpath build
# 输出：resources/sidecar/dist/pyitol-sidecar/（onedir 包）
```

要点：

- **onedir，而非单文件。** 约 1 GB 的单文件 exe 每次启动都要自解压到 `$TMPDIR`，启动要等一分钟；onedir 布局即时启动。主进程优先解析 onedir 可执行文件，找不到时回退旧的单文件布局。
- 在目标平台上构建（本项目目标为 macOS arm64）。
- 打包前先自检包可用：

  ```bash
  echo '{"jsonrpc":"2.0","id":1,"method":"handshake","params":{"client":"cli","version":"0"}}' \
    | ./dist/pyitol-sidecar/pyitol-sidecar
  # 期望返回一行含 engine_version / pyitol_version / pid 的 result
  ```

## 第 2 步 —— 构建 Electron 应用

```bash
npm run build      # 编译 main + preload + renderer 到 out/
npm run build:mac  # electron-builder → dist/（dmg + zip，arm64）
```

`build:mac` 内部已执行 `npm run build`；完整发布直接跑它即可。

## 自动更新

`electron-updater` 已接线（`src/main/updater.ts`），但仅当应用已打包**且**包内存在 `app-update.yml` 时才初始化 —— 而 electron-builder 只在 `electron-builder.yml` 含 `publish` 配置时才会生成该文件。要启用自动更新，填入真实的更新源：

```yaml
publish:
  provider: generic
  url: https://your-release-server/pyitol-studio/
```

没有它时更新器按设计保持禁用 —— 不会在每次启动时报网络错误。保留 zip 目标是为了让更新源可以提供增量包。

## 签名与公证（macOS）

`electron-builder.yml` 启用了 `hardenedRuntime`，并在签名后运行 `build/notarize.cjs`。执行 `npm run build:mac` 前先导出凭据：

```bash
export APPLE_ID="you@example.com"                       # 用于公证的 Apple ID
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # 专用密码
export PYITOL_CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
npm run build:mac
```

- `PYITOL_CODESIGN_IDENTITY` 指定签名身份；缺省时为临时签名，Gatekeeper 会告警。
- 钥匙串访问签名时可能弹一次授权，选择允许。
- 公证必须使用 App 专用密码（绝不要用账号密码）。

## 构建后检查清单

1. `dist/` 中有 `PyiTOL Studio-<version>-arm64.dmg` 与 `.zip`。
2. 挂载 dmg，拖入应用程序，启动。
3. 引擎状态显示"就绪"（sidecar 握手成功）。
4. 打开示例工程（文件 → 打开示例工程），生成预览并导出模板。
5. 导入（反推）一份既有 `.txt` 模板。
6. 切换中/英与浅色/深色；原生菜单跟随变化。
7. 在有未保存修改时关闭窗口 —— 出现 保存/丢弃/取消 保护框。

## 全新重建

```bash
rm -rf out dist resources/sidecar/dist resources/sidecar/build
npm run build:mac
```

（sidecar 包必须单独重建 —— 它是独立产物，`npm run build` 不会碰它。）

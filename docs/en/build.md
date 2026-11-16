# Build & Release

[English](../en/build.md) | [简体中文](../zh/build.md)

How to produce a distributable macOS build of PyiTOL Studio, from the Python sidecar bundle to a signed and notarized dmg.

## Overview

A release artifact has two halves that are built separately and joined at packaging time:

1. **Python sidecar** — PyInstaller **onedir** bundle built from `resources/sidecar/pyitol-sidecar.spec`.
2. **Electron app** — compiled by electron-vite into `out/`, packaged by electron-builder using `electron-builder.yml`.

electron-builder copies `resources/sidecar/dist` → `<app>/Contents/Resources/sidecar` and `resources/samples` → `Contents/Resources/samples` as `extraResources`.

## Step 1 — Build the Python sidecar

```bash
cd resources/sidecar
python -m PyInstaller pyitol-sidecar.spec --noconfirm --distpath dist --workpath build
# Output: resources/sidecar/dist/pyitol-sidecar/   (onedir bundle)
```

Notes:

- **onedir, not one-file.** A ~1 GB single-file exe would self-extract into `$TMPDIR` on every launch, costing a minute of startup; the onedir layout starts instantly. The main process resolves the onedir executable first and falls back to the legacy single-file layout.
- Build on the platform you target (this project targets macOS arm64).
- Sanity-check the bundle before packaging:

  ```bash
  echo '{"jsonrpc":"2.0","id":1,"method":"handshake","params":{"client":"cli","version":"0"}}' \
    | ./dist/pyitol-sidecar/pyitol-sidecar
  # expect a result line with engine_version / pyitol_version / pid
  ```

## Step 2 — Build the Electron app

```bash
npm run build      # compile main + preload + renderer into out/
npm run build:mac  # electron-builder → dist/ (dmg + zip, arm64)
```

`build:mac` runs `npm run build` itself; run it directly for a full release build.

## Auto-update

`electron-updater` is wired in (`src/main/updater.ts`) but only initializes when the app is packaged **and** an `app-update.yml` exists in the bundle — which electron-builder only emits when `electron-builder.yml` has a `publish` section. To enable auto-update, add a real feed:

```yaml
publish:
  provider: generic
  url: https://your-release-server/pyitol-studio/
```

Without it the updater stays disabled by design — no network errors on every launch. The zip target exists so the feed can serve updates.

## Signing & notarization (macOS)

`electron-builder.yml` enables `hardenedRuntime` and runs `build/notarize.cjs` after signing. Export the credentials before `npm run build:mac`:

```bash
export APPLE_ID="you@example.com"                       # Apple ID used for notarization
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # app-specific password
export PYITOL_CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
npm run build:mac
```

- `PYITOL_CODESIGN_IDENTITY` selects the codesign identity; without it the build is ad-hoc signed and Gatekeeper will warn.
- Keychain access for signing may prompt once; allow it.
- Notarization requires the app-specific password (never the account password).

## Post-build checklist

1. `dist/` contains `PyiTOL Studio-<version>-arm64.dmg` and `.zip`.
2. Mount the dmg, drag to Applications, launch.
3. Engine status shows _ready_ (sidecar handshake succeeded).
4. Open the example project (File → Open Example Project), generate a preview, and export a template.
5. Import (learn) an existing `.txt` template.
6. Switch language zh ↔ en and theme light/dark; the native menu follows.
7. Close with unsaved changes — the Save/Discard/Cancel guard appears.

## Clean rebuild

```bash
rm -rf out dist resources/sidecar/dist resources/sidecar/build
npm run build:mac
```

(The sidecar bundle must be rebuilt too — it is a separate artifact and is not touched by `npm run build`.)

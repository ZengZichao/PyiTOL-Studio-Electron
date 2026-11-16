# -*- mode: python ; coding: utf-8 -*-
#
# onedir build: the app launches instantly (no self-extraction of a ~1 GB
# single-file bundle into $TMPDIR on every run).


a = Analysis(
    ['sidecar_main.py'],
    pathex=[],
    binaries=[],
    datas=[
        # Adapter source package. Map CONTENTS so data files land where
        # ``resources.resource_path()`` looks for them under _MEIPASS
        # (``pyitolstudio/resources/…``) — a plain src→pyitolstudio mapping
        # double-nests the tree and breaks the form-IDL parameter catalog.
        ('/Users/zengzichao/Documents/同步目录/博士课题/4.软件流程开发/PyiTOL/PyiTOL-Studio-项目代码/src/pyitolstudio', 'pyitolstudio'),
        ('/Users/zengzichao/Documents/同步目录/博士课题/4.软件流程开发/PyiTOL/PyiTOL-Studio-项目代码/.build-venv/lib/python3.14/site-packages', 'pyitol'),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='pyitol-sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='pyitol-sidecar',
)

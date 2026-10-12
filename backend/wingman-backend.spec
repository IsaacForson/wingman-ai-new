# PyInstaller spec: `pyinstaller wingman-backend.spec` -> dist/wingman-backend/
from PyInstaller.utils.hooks import collect_submodules

a = Analysis(
    ["main.py"],
    datas=[("wingman/services/data/*.json", "wingman/services/data")],
    hiddenimports=collect_submodules("uvicorn") + collect_submodules("engineio.async_drivers") + ["webrtcvad"],
    excludes=["tkinter", "matplotlib", "torch", "tensorflow"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="wingman-backend", console=True, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, upx=False, name="wingman-backend")

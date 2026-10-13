# Local override: `webrtcvad` is provided by `webrtcvad-wheels`, so the
# upstream hook's `copy_metadata('webrtcvad')` call fails with
# PackageNotFoundError. Fall back to the wheels distribution metadata.
from PyInstaller.utils.hooks import copy_metadata

try:
    datas = copy_metadata("webrtcvad")
except Exception:
    try:
        datas = copy_metadata("webrtcvad-wheels")
    except Exception:
        datas = []

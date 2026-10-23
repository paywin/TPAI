from PyInstaller.utils.hooks import copy_metadata

# The maintained wheels distribution provides the same import name.
datas = copy_metadata("webrtcvad-wheels")
hiddenimports = ["_webrtcvad"]

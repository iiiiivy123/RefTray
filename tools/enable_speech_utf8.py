"""Embed a per-process UTF-8 manifest in our locally built Whisper CLI (Windows)."""
import ctypes
from ctypes import wintypes
from pathlib import Path
import sys

MANIFEST = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity type="win32" name="RefTray.Whisper" version="1.0.0.0"/>
  <application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings>
    <activeCodePage xmlns="http://schemas.microsoft.com/SMI/2019/WindowsSettings">UTF-8</activeCodePage>
  </windowsSettings></application>
</assembly>'''


def embed(path):
    path = Path(path).resolve()
    if path.name not in ('whisper-cli.exe', 'whisper-utf8.exe') or not path.is_file():
        raise ValueError('Expected an existing Whisper CLI build')
    api = ctypes.WinDLL('kernel32', use_last_error=True)
    api.BeginUpdateResourceW.argtypes = [wintypes.LPCWSTR, wintypes.BOOL]
    api.BeginUpdateResourceW.restype = wintypes.HANDLE
    api.UpdateResourceW.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.c_void_p, wintypes.WORD, ctypes.c_void_p, wintypes.DWORD]
    api.UpdateResourceW.restype = wintypes.BOOL
    api.EndUpdateResourceW.argtypes = [wintypes.HANDLE, wintypes.BOOL]
    api.EndUpdateResourceW.restype = wintypes.BOOL
    handle = api.BeginUpdateResourceW(str(path), False)
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    data = ctypes.create_string_buffer(MANIFEST)
    if not api.UpdateResourceW(handle, 24, 1, 0, data, len(MANIFEST)):
        error = ctypes.get_last_error()
        api.EndUpdateResourceW(handle, True)
        raise ctypes.WinError(error)
    if not api.EndUpdateResourceW(handle, False):
        raise ctypes.WinError(ctypes.get_last_error())


def verify(path):
    """Read the manifest resource Windows actually uses, not arbitrary PE strings."""
    api = ctypes.WinDLL('kernel32', use_last_error=True)
    api.LoadLibraryExW.argtypes = [wintypes.LPCWSTR, wintypes.HANDLE, wintypes.DWORD]
    api.LoadLibraryExW.restype = wintypes.HMODULE
    api.FindResourceW.argtypes = [wintypes.HMODULE, ctypes.c_void_p, ctypes.c_void_p]
    api.FindResourceW.restype = wintypes.HANDLE
    api.LoadResource.argtypes = [wintypes.HMODULE, wintypes.HANDLE]
    api.LoadResource.restype = wintypes.HANDLE
    api.LockResource.argtypes = [wintypes.HANDLE]
    api.LockResource.restype = ctypes.c_void_p
    api.SizeofResource.argtypes = [wintypes.HMODULE, wintypes.HANDLE]
    api.SizeofResource.restype = wintypes.DWORD
    api.FreeLibrary.argtypes = [wintypes.HMODULE]
    library = api.LoadLibraryExW(str(Path(path).resolve()), None, 0x22)
    if not library: raise ctypes.WinError(ctypes.get_last_error())
    try:
        resource = api.FindResourceW(library, 1, 24)
        if not resource: raise ValueError('Whisper UTF-8 process manifest is missing')
        data = ctypes.string_at(api.LockResource(api.LoadResource(library, resource)), api.SizeofResource(library, resource))
        import xml.etree.ElementTree as ET
        code_page = ET.fromstring(data).find('.//{http://schemas.microsoft.com/SMI/2019/WindowsSettings}activeCodePage')
        if code_page is None or code_page.text != 'UTF-8': raise ValueError('Whisper must accept Unicode media paths')
    finally:
        api.FreeLibrary(library)


if __name__ == '__main__':
    embed(sys.argv[1])

"""Current-user Windows login preference; the Run value is the only owner."""
from pathlib import Path

RUN_KEY = r'Software\Microsoft\Windows\CurrentVersion\Run'
VALUE_NAME = 'RefTray'


def command():
    launcher = Path(__file__).resolve().parents[1] / 'InspirationCollector.exe'
    if not launcher.is_file():
        raise ValueError('请使用完整 Windows 安装版设置开机启动')
    value = f'"{launcher}" --autostart'
    if len(value) > 260:
        raise ValueError('安装路径过长，Windows 无法登记开机启动')
    return value


def preference(enabled=None):
    import winreg
    expected = command()
    if enabled is not None:
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            if enabled:
                winreg.SetValueEx(key, VALUE_NAME, 0, winreg.REG_SZ, expected)
            else:
                try:
                    winreg.DeleteValue(key, VALUE_NAME)
                except FileNotFoundError:
                    pass
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            value, _ = winreg.QueryValueEx(key, VALUE_NAME)
    except FileNotFoundError:
        value = ''
    return {'enabled': value == expected}

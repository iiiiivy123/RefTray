from __future__ import annotations

import os
import json
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    root: Path
    host: str = "127.0.0.1"
    port: int = 8766
    timeout: float = 12.0
    save_directory: Path | None = None
    recommended_directory: Path | None = None

    @property
    def inbox(self) -> Path:
        legacy = self.root / "data" / "inspiration" / "inbox"
        return self.save_directory or (legacy if legacy.exists() else self.recommended_directory or legacy)

    @property
    def library_configured(self) -> bool:
        return self.save_directory is not None or (self.root / 'data/inspiration/inbox').exists()


def initialize_folders(root):
    # Categories appear only when a capture has content to write.
    Path(root).mkdir(parents=True, exist_ok=True)


def save_directory(settings: Settings, value: str) -> Settings:
    from dataclasses import replace
    path = Path(value.strip()).expanduser()
    if not value.strip() or not path.is_absolute():
        raise ValueError("请填写完整的绝对路径")
    path = path.resolve()
    path.mkdir(parents=True, exist_ok=True)
    for folder in (path,):
        folder.mkdir(exist_ok=True)
        with tempfile.TemporaryFile(dir=folder) as probe:
            probe.write(b"write-test")
    initialize_folders(path)
    config = settings.root / "data" / "inspiration" / "collector-settings.json"
    config.parent.mkdir(parents=True, exist_ok=True)
    temporary = config.with_suffix(".tmp")
    temporary.write_text(json.dumps({"save_directory": str(path)}, ensure_ascii=False), encoding="utf-8")
    temporary.replace(config)
    return replace(settings, save_directory=path)


def load_settings() -> Settings:
    default_root = Path(os.getenv('LOCALAPPDATA', str(Path.home() / '.local/share'))) / 'InspirationCollector'
    root = Path(os.getenv("LIBLIB_ROOT", str(default_root))).expanduser().resolve()
    config = root / "data" / "inspiration" / "collector-settings.json"
    saved = json.loads(config.read_text(encoding="utf-8")) if config.exists() else {}
    directory = Path(saved["save_directory"]) if saved.get("save_directory") else None
    if directory is not None and not directory.is_absolute():
        raise ValueError("保存目录配置无效，请使用绝对路径")
    return Settings(
        root=root,
        save_directory=directory,
        recommended_directory=Path.home() / 'Documents' / '灵感采集',
        port=int(os.getenv("LIBLIB_COLLECTOR_PORT", "8766")),
        timeout=float(os.getenv("LIBLIB_REQUEST_TIMEOUT", "12")),
    )

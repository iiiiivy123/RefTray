"""Validated per-task options; saved defaults remain owned by CaptureDefaults."""
from typing import Literal
from pydantic import ConfigDict, Field
from .models import CaptureDefaults

class CaptureOptions(CaptureDefaults):
    model_config = ConfigDict(extra='forbid')
    destination: str | None = Field(default=None, max_length=4096)
    md_only: bool = False
    output_format: Literal['original', 'audio'] = 'original'
    subtitle_mode: Literal['none', 'with_video', 'only'] = 'none'
    subtitle_language: Literal['auto', 'zh', 'en', 'ja', 'ko'] = 'auto'
    video_quality: Literal['best', '1080', '720', '480'] = 'best'
    media_index: int | None = Field(default=None, ge=1, le=100)
    trim_start: float = Field(default=0, ge=0, le=86400, allow_inf_nan=False)
    trim_end: float = Field(default=0, ge=0, le=86400, allow_inf_nan=False)

def snapshot(defaults, overrides):
    base = {k: v for k, v in defaults.items() if k in CaptureOptions.model_fields}
    return CaptureOptions.model_validate({**base, **overrides}).model_dump()

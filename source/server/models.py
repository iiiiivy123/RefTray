from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from urllib.parse import urlparse, parse_qs, urlencode
from typing import Literal, Annotated


class ImageItem(BaseModel):
    url: str
    alt: str | None = None
    data_base64: str | None = None
    content_type: str | None = None
    source_kind: Literal['image', 'video_frame', 'comment_gif'] = 'image'
    role: Literal['body', 'comment'] = 'body'
    comment_id: str | None = Field(default=None, max_length=100)
    frame_time: float | None = Field(default=None, ge=0, allow_inf_nan=False)


class CommentItem(BaseModel):
    text: str = Field(max_length=10000)
    author: str | None = Field(default=None, max_length=1000)
    id: str | None = Field(default=None, max_length=100)
    url: str | None = Field(default=None, max_length=4000)
    images: list[str] = Field(default_factory=list, max_length=100)


class DocumentBlock(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['heading', 'paragraph', 'list_item', 'quote', 'table', 'image']
    text: str = Field(default='', max_length=100000)
    level: int = Field(default=1, ge=1, le=6)
    depth: int = Field(default=0, ge=0, le=8)
    ordered: bool = False
    number: int = Field(default=1, ge=1, le=100000)
    rows: list[Annotated[list[Annotated[str, Field(max_length=100000)]], Field(max_length=20)]] = Field(default_factory=list, max_length=100)
    url: str | None = Field(default=None, max_length=4096)

    @field_validator('url')
    @classmethod
    def safe_image_reference(cls, value):
        if value is not None:
            parsed = urlparse(value)
            if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError('document image reference must be http(s)')
        return value


class DocumentSource(BaseModel):
    model_config = ConfigDict(extra='forbid')
    schema_version: Literal[1] = 1
    source_url: str = Field(max_length=4096)
    captured_at: str = Field(max_length=100)
    method: Literal['dom', 'loaded_state', 'plain_text']
    root: str = Field(default='', max_length=200)
    blocks: list[DocumentBlock] = Field(default_factory=list, max_length=400)
    warnings: list[Annotated[str, Field(max_length=500)]] = Field(default_factory=list, max_length=20)

    @field_validator('source_url')
    @classmethod
    def safe_source_url(cls, value):
        return DocumentBlock.safe_image_reference(value)

    @model_validator(mode='after')
    def bounded_text(self):
        if sum(len(block.text) + sum(len(cell) for row in block.rows for cell in row) for block in self.blocks) > 100000:
            raise ValueError('document source text exceeds 100000 characters')
        return self


class CollectRequest(BaseModel):
    task_id: str | None = Field(default=None, min_length=1, max_length=100)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=200)
    max_images: int = Field(default=0, ge=0, le=100000)
    omitted_images: int = Field(default=0, ge=0)
    include_images: bool = True
    md_only: bool = False
    directory_schema: Literal['four-categories-v1', 'function-platform-v2'] = 'four-categories-v1'
    capture_scope: Literal['single', 'batch'] | None = None
    capture_kind: Literal['images', 'text', 'video'] | None = None
    duplicate_policy: Literal['fill', 'skip', 'refresh'] = 'fill'
    min_free_mb: int = Field(default=0, ge=0, le=1048576)
    ocr_enabled: bool = True
    comments_status: str = 'not_requested'
    media_files: list[str] = Field(default_factory=list, max_length=100)
    layout: Literal['legacy', 'platform', 'flat', 'direct', 'organized', 'organized_flat'] = 'organized'
    destination: str | None = None
    collection_mode: Literal['images', 'text'] = 'images'
    platform: str = Field(default='generic', max_length=50)
    body_text: str = Field(default='', max_length=100000)
    document_source: DocumentSource | None = None
    published_at: str | None = Field(default=None, max_length=1000)
    comments: list[CommentItem] = Field(default_factory=list, max_length=100)
    comments_requested: bool = False
    extraction_warnings: list[str] = Field(default_factory=list, max_length=20)
    save_directory: str | None = None
    canonical_url: str
    page_title: str | None = None
    selected_text: str | None = None
    author_url: str | None = None
    author_name: str | None = None
    board_url: str | None = None
    board_name: str | None = None
    list_url: str | None = Field(default=None, max_length=2048)
    list_kind: Literal['favorites','album','works','videos','shorts','playlist','collection','board'] | None = None
    list_name: str | None = Field(default=None, max_length=200)
    list_owner: str | None = Field(default=None, max_length=200)
    images: list[ImageItem] = Field(default_factory=list)

    @field_validator("canonical_url")
    @classmethod
    def valid_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme == 'local-video' and len(parsed.netloc) == 64 and all(c in '0123456789abcdef' for c in parsed.netloc) and not parsed.path:
            return value
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("canonical_url must be http(s)")
        return value

    @field_validator('list_url')
    @classmethod
    def valid_list_url(cls, value):
        if value is None: return None
        parsed = urlparse(value)
        if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('invalid collection URL')
        return parsed._replace(fragment='').geturl()

    @field_validator("author_url")
    @classmethod
    def valid_author_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cls.valid_url(value)
        parsed = urlparse(value)
        if parsed.hostname in ('youtube.com','www.youtube.com','m.youtube.com') and parsed.path == '/playlist':
            playlist = parse_qs(parsed.query).get('list', [''])[0]
            import re
            if not re.fullmatch(r'[\w-]+', playlist):
                raise ValueError('invalid YouTube playlist')
            return parsed._replace(query=urlencode({'list':playlist}), fragment='').geturl()
        return parsed._replace(query="", fragment="", path=parsed.path.rstrip("/")).geturl()

    @field_validator('board_url')
    @classmethod
    def valid_board_url(cls, value):
        if value is None:
            return None
        parsed = urlparse(value)
        host = parsed.hostname or ''
        parts = [p for p in parsed.path.split('/') if p]
        if parsed.scheme != 'https' or not any(host == d or host.endswith('.' + d) for d in ('pinterest.com', 'pinterest.cn')) or len(parts) not in (2, 3) or parts[0] in ('pin', 'search', 'ideas'):
            raise ValueError('invalid Pinterest board URL')
        return parsed._replace(query='', fragment='', path=parsed.path.rstrip('/')).geturl()


class ClassifyRequest(BaseModel):
    theme: str
    style_tags: list[str] = Field(default_factory=list)
    visual_tags: list[str] = Field(default_factory=list)
    suitable_for: list[str] = Field(default_factory=list)


class DirectoryRequest(BaseModel):
    directory: str
    layout: Literal['organized','organized_flat'] | None = None


class VideoDownloadRequest(CollectRequest):
    resolver_warning: str = Field(default='', max_length=500)
    resolver_id: str | None = Field(default=None, max_length=100)
    subtitle_mode: Literal['none','only','with_video'] = 'none'
    subtitle_cues: list[dict] = Field(default_factory=list, max_length=100000)
    subtitle_source: str = Field(default='', max_length=200)
    subtitle_warning: str = Field(default='', max_length=500)
    output_format: Literal['original','gif','audio'] = 'original'
    trim_start: float = Field(default=0, ge=0, le=86400, allow_inf_nan=False)
    trim_end: float = Field(default=0, ge=0, le=86400, allow_inf_nan=False)
    audio_url: str | None = None
    media_kind: Literal['ordinary','bilibili-dash','bilibili-file','bilibili-audio','youtube-dash','resolved'] = 'ordinary'
    quality: str | None = None
    max_video_mb: int = Field(default=512, ge=1, le=1048576)
    approved_bytes: int | None = Field(default=None, ge=0)
    url: str
    canonical_url: str
    page_title: str | None = None
    save_directory: str

    @field_validator('canonical_url')
    @classmethod
    def valid_source(cls, value):
        parsed = urlparse(value)
        if parsed.scheme not in ('http', 'https') or not parsed.netloc:
            raise ValueError('需要原始网页来源')
        return value


class VideoControlRequest(BaseModel):
    action: Literal['running', 'paused', 'stopped']


class CaptureDefaults(BaseModel):
    skip_posts: int = Field(default=0, ge=0, le=499)
    min_duration: float = Field(default=0, ge=0, le=86400, allow_inf_nan=False)
    max_duration: float = Field(default=0, ge=0, le=86400, allow_inf_nan=False)
    skip_gifs: bool = False
    max_images: int = Field(default=0, ge=0, le=100000)
    layout: Literal['organized','organized_flat'] = 'organized'
    collection_mode: Literal['images','text'] = 'images'
    limit: int = Field(default=20, ge=1, le=500)
    video_action: Literal['skip','save','frames'] = 'skip'
    duplicate_policy: Literal['fill','skip','refresh'] = 'fill'
    include_images: bool = True
    include_comments: bool = False
    comment_limit: int = Field(default=10, ge=1, le=100)
    ocr_enabled: bool = True
    strategy: Literal['slides','interval'] = 'slides'
    interval: float = Field(default=1, ge=0.5, le=60, allow_inf_nan=False)
    min_free_mb: int = Field(default=0, ge=0, le=1048576)
    max_video_mb: int = Field(default=512, ge=1, le=1048576)


class HistoryLookup(BaseModel):
    url: str = Field(max_length=4000)
    required: list[Literal['images','text','comments','ocr','videos','frames']] = Field(default_factory=list, max_length=6)


class VideoProbe(BaseModel):
    duplicate_policy: Literal['fill','skip','refresh'] = 'fill'
    urls: list[str] = Field(default_factory=list, max_length=100)
    destination: str | None = None

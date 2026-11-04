"""Decode image bytes before treating browser, HTTP or cached data as an asset."""
import io
import warnings

from PIL import Image

from .image_download import MAX_BYTES


def validate_image(data):
    if not data or len(data) > MAX_BYTES:
        raise ValueError('图片为空或超过 30MB，未保存')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                format = image.format
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                # Decode every animation frame too; a valid header is insufficient.
                for index in range(getattr(image, 'n_frames', 1)):
                    image.seek(index)
                    image.load()
        suffix = {'JPEG': '.jpg', 'PNG': '.png', 'GIF': '.gif', 'WEBP': '.webp',
                  'AVIF': '.avif', 'BMP': '.bmp', 'TIFF': '.tiff'}.get(format)
        if not suffix:
            raise ValueError('不支持的图片格式')
        return suffix
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError('图片内容无效或无法完整解码，未保存') from exc

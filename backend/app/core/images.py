"""Shared image validation + sanitization for uploaded pictures.

Two layers:

* ``sniff_image_type`` — trust the file's magic bytes, never the client's
  declared Content-Type. Recognises JPEG / PNG / WEBP only.
* ``sanitize_image`` — decode and **re-encode** an upload through Pillow. This
  strips EXIF/metadata (critically the GPS tags, a privacy leak for a location
  app), bakes in the EXIF orientation first so the picture isn't left sideways,
  defuses decompression-bombs (pixel cap), and guarantees the bytes are a real,
  decodable image. The stored bytes are always the re-encoded output, never the
  original upload.

Used by chat photo uploads. Avatars can adopt the same helper later.
"""
from __future__ import annotations

import io

from PIL import Image, ImageOps

# Reject absurdly large images before allocating their pixel buffer — Pillow
# raises DecompressionBombError from load() once a decoded image exceeds this.
Image.MAX_IMAGE_PIXELS = 24_000_000  # ~24 megapixels

# 3 MB cap on a stored chat photo (avatars are 2 MB). Checked on the raw upload.
MAX_PHOTO_BYTES = 3 * 1024 * 1024

# Allowed image types, keyed by canonical content-type.
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

# canonical content-type -> Pillow format string used on re-encode.
_CT_TO_FORMAT = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


class InvalidImageError(Exception):
    """Upload is not a decodable image of an allowed type (maps to HTTP 415)."""


def sniff_image_type(data: bytes) -> str | None:
    """Return the canonical content-type from the file's magic bytes.

    Only JPEG/PNG/WEBP are recognised; anything else returns None. We trust the
    bytes, not the client-supplied content-type header.
    """
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def sanitize_image(data: bytes) -> tuple[bytes, str]:
    """Decode + re-encode an uploaded image, stripping all metadata.

    Returns ``(clean_bytes, content_type)``. Raises ``InvalidImageError`` if the
    bytes aren't a decodable image of an allowed type, or exceed the pixel cap
    (decompression-bomb defence). Animation is dropped (first frame only).
    """
    content_type = sniff_image_type(data)
    if content_type is None:
        raise InvalidImageError("unsupported or unrecognized image type")
    fmt = _CT_TO_FORMAT[content_type]

    out = io.BytesIO()
    try:
        with Image.open(io.BytesIO(data)) as opened:
            opened.load()  # force full decode now (raises on truncated / bomb)
            # Bake EXIF orientation into the pixels, THEN drop metadata by
            # re-saving without passing any exif/icc — Pillow only writes what we
            # hand it, so the output carries none of the original tags.
            im = ImageOps.exif_transpose(opened)

            if fmt == "JPEG":
                if im.mode not in ("RGB", "L"):
                    im = im.convert("RGB")
                save_kwargs = {"quality": 85, "optimize": True, "progressive": True}
            elif fmt == "PNG":
                save_kwargs = {"optimize": True}
            else:  # WEBP
                if im.mode not in ("RGB", "RGBA", "L"):
                    im = im.convert("RGBA")
                save_kwargs = {"quality": 85, "method": 4}

            im.save(out, format=fmt, **save_kwargs)
    except InvalidImageError:
        raise
    except Exception as exc:  # decode errors, bombs, malformed files
        raise InvalidImageError(f"could not process image: {exc}") from exc

    return out.getvalue(), content_type

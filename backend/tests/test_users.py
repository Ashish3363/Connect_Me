"""Unit tests for profile-image validation (magic-byte sniffing).

These pin the security rule that the stored content-type comes from the file's
bytes, not a client-supplied header — so a mislabelled or non-image upload is
rejected regardless of what Content-Type it claims.
"""
from __future__ import annotations

from app.services.users import ALLOWED_IMAGE_TYPES, sniff_image_type

# Minimal valid magic-byte prefixes for each supported format.
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 8


def test_sniffs_jpeg():
    assert sniff_image_type(JPEG) == "image/jpeg"


def test_sniffs_png():
    assert sniff_image_type(PNG) == "image/png"


def test_sniffs_webp():
    assert sniff_image_type(WEBP) == "image/webp"


def test_rejects_non_image():
    assert sniff_image_type(b"GIF89a" + b"\x00" * 16) is None
    assert sniff_image_type(b"not an image at all") is None
    assert sniff_image_type(b"") is None


def test_riff_without_webp_marker_is_rejected():
    # A RIFF container that isn't WEBP (e.g. a WAV) must not pass as an image.
    wav = b"RIFF" + b"\x00\x00\x00\x00" + b"WAVE" + b"\x00" * 8
    assert sniff_image_type(wav) is None


def test_sniffed_types_are_all_allowed():
    for sample in (JPEG, PNG, WEBP):
        assert sniff_image_type(sample) in ALLOWED_IMAGE_TYPES

"""Behavior of MediaOptimizationService for personalization images and audio."""
import io
import struct
import zlib
from unittest.mock import MagicMock, patch

import pytest
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import InMemoryUploadedFile, SimpleUploadedFile
from PIL import Image
from pydub import AudioSegment

from base_feature_app.services.media_service import MediaOptimizationService


def _make_fake_file(name='test.jpg', content=b'fake', content_type='image/jpeg'):
    buf = io.BytesIO(content)
    buf.name = name
    return buf


def _png_bytes(width, height, idat):
    """Build a 1-bit grayscale PNG with the given IDAT payload (Pillow opens the header lazily)."""
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

    header = struct.pack('>IIBBBBB', width, height, 1, 0, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')


def _black_png_bytes(width, height):
    """Build a valid PNG of a few KB whose rows are a filter byte plus packed black pixels."""
    rows = (b'\x00' * (1 + (width + 7) // 8)) * height
    return _png_bytes(width, height, zlib.compress(rows, 9))


def _jpeg_bytes(width, height):
    buffer = io.BytesIO()
    Image.new('RGB', (width, height), (200, 120, 90)).save(buffer, format='JPEG', quality=85)
    return buffer.getvalue()


def _opus_voice_note_bytes(seconds):
    buffer = io.BytesIO()
    AudioSegment.silent(duration=seconds * 1000, frame_rate=48000).export(buffer, format='opus')
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# optimize_image — success paths
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch('PIL.Image')
def test_optimize_image_returns_in_memory_uploaded_file(mock_image_module):
    """optimize_image returns an InMemoryUploadedFile with correct name and content type."""
    fake_img = MagicMock()
    fake_img.mode = 'RGB'
    fake_img.size = (800, 800)

    def save_side_effect(buf, **kwargs):
        buf.write(b'x' * 100)

    fake_img.save.side_effect = save_side_effect
    mock_image_module.open.return_value = fake_img
    mock_image_module.LANCZOS = 1

    file = _make_fake_file()
    result = MediaOptimizationService.optimize_image(file)
    mock_image_module.open.assert_called_once()
    assert isinstance(result, InMemoryUploadedFile)
    assert result.content_type == 'image/jpeg'


@pytest.mark.django_db
@patch('PIL.Image')
def test_optimize_image_output_name_has_jpg_extension(mock_image_module):
    """The optimized image keeps the original base name with a .jpg extension."""
    fake_img = MagicMock()
    fake_img.mode = 'RGB'
    fake_img.size = (800, 800)
    fake_img.save = MagicMock(side_effect=lambda buf, **kw: buf.write(b'x' * 50))
    mock_image_module.open.return_value = fake_img
    mock_image_module.LANCZOS = 1

    file = _make_fake_file(name='photo.png')
    result = MediaOptimizationService.optimize_image(file)
    mock_image_module.open.assert_called_once()
    assert result.name == 'photo.jpg'


@pytest.mark.django_db
@patch('PIL.Image')
def test_optimize_image_converts_rgba_to_rgb(mock_image_module):
    """optimize_image converts RGBA images to RGB before JPEG compression to avoid mode errors."""
    rgba_img = MagicMock()
    rgba_img.mode = 'RGBA'
    rgba_img.size = (100, 100)
    rgba_img.split.return_value = [None, None, None, MagicMock()]
    rgba_img.save = MagicMock(side_effect=lambda buf, **kw: buf.write(b'x' * 50))

    rgb_bg = MagicMock()
    rgb_bg.mode = 'RGB'
    rgb_bg.save = MagicMock(side_effect=lambda buf, **kw: buf.write(b'x' * 50))

    mock_image_module.open.return_value = rgba_img
    mock_image_module.new.return_value = rgb_bg
    mock_image_module.LANCZOS = 1

    file = _make_fake_file()
    result = MediaOptimizationService.optimize_image(file)
    mock_image_module.open.assert_called_once()
    mock_image_module.new.assert_called_once()
    assert result.content_type == 'image/jpeg'


@pytest.mark.parametrize(('size', 'expected_size'), [
    ((6000, 4000), (1200, 800)),
    ((8000, 6000), (1200, 900)),
])
def test_optimize_image_scales_large_jpeg_photo_to_max_side(size, expected_size):
    """A 48 MP photo stays accepted: JPEG draft decoding keeps it under the pixel limit."""
    upload = SimpleUploadedFile('huella.jpg', _jpeg_bytes(*size), content_type='image/jpeg')

    result = MediaOptimizationService.optimize_image(upload)

    assert Image.open(result).size == expected_size


# ---------------------------------------------------------------------------
# optimize_image — error paths
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch('PIL.Image')
def test_optimize_image_raises_for_invalid_image_file(mock_image_module):
    """A file Pillow cannot open is rejected with a validation message in Spanish."""
    mock_image_module.open.side_effect = Exception('Not an image')
    file = _make_fake_file()
    with pytest.raises(ValidationError) as exc_info:
        MediaOptimizationService.optimize_image(file)
    assert 'imagen válida' in str(exc_info.value)


def test_optimize_image_rejects_png_above_pixel_limit():
    """A few-KB 9000x9000 PNG would expand to hundreds of MB once decoded."""
    upload = SimpleUploadedFile('huella.png', _black_png_bytes(9000, 9000), content_type='image/png')

    with pytest.raises(ValidationError) as exc_info:
        MediaOptimizationService.optimize_image(upload)

    assert 'demasiados píxeles' in str(exc_info.value)


def test_optimize_image_pixel_limit_reads_only_png_header():
    """Without pixel data any decode would fail, so the limit must come from the header."""
    upload = SimpleUploadedFile('huella.png', _png_bytes(9000, 9000, b''), content_type='image/png')

    with pytest.raises(ValidationError) as exc_info:
        MediaOptimizationService.optimize_image(upload)

    assert '(9000x9000)' in str(exc_info.value)


# ---------------------------------------------------------------------------
# optimize_audio — success paths
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch('pydub.AudioSegment')
def test_optimize_audio_returns_file_and_duration(mock_audio_segment):
    """A short clip yields the encoded upload plus its duration in seconds."""
    fake_audio = MagicMock()
    fake_audio.__len__ = MagicMock(return_value=15000)
    fake_audio.__getitem__ = MagicMock(return_value=fake_audio)
    fake_audio.export = MagicMock(side_effect=lambda buf, **kw: buf.write(b'a' * 100))
    mock_audio_segment.from_file.return_value = fake_audio

    file = _make_fake_file(name='voice.mp3', content=b'mp3data')
    result_file, duration = MediaOptimizationService.optimize_audio(file)
    mock_audio_segment.from_file.assert_called_once()
    assert isinstance(result_file, InMemoryUploadedFile)
    assert duration == 15.0


@pytest.mark.django_db
@patch('pydub.AudioSegment')
def test_optimize_audio_trims_audio_longer_than_30_seconds(mock_audio_segment):
    """A decoded clip longer than the limit is trimmed to thirty seconds."""
    long_audio = MagicMock()
    long_audio.__len__ = MagicMock(return_value=60000)
    trimmed = MagicMock()
    trimmed.__len__ = MagicMock(return_value=30000)
    trimmed.export = MagicMock(side_effect=lambda buf, **kw: buf.write(b'a' * 100))
    long_audio.__getitem__ = MagicMock(return_value=trimmed)
    mock_audio_segment.from_file.return_value = long_audio

    file = _make_fake_file(name='long.mp3')
    result_file, duration = MediaOptimizationService.optimize_audio(file)
    mock_audio_segment.from_file.assert_called_once()
    assert duration == 30.0


@pytest.mark.django_db
@patch('pydub.AudioSegment')
def test_optimize_audio_output_name_has_mp3_extension(mock_audio_segment):
    """The optimized audio keeps the original base name with a .mp3 extension."""
    fake_audio = MagicMock()
    fake_audio.__len__ = MagicMock(return_value=10000)
    fake_audio.__getitem__ = MagicMock(return_value=fake_audio)
    fake_audio.export = MagicMock(side_effect=lambda buf, **kw: buf.write(b'a' * 50))
    mock_audio_segment.from_file.return_value = fake_audio

    file = _make_fake_file(name='recording.wav')
    result_file, _ = MediaOptimizationService.optimize_audio(file)
    mock_audio_segment.from_file.assert_called_once()
    assert result_file.name == 'recording.mp3'


@pytest.mark.parametrize(('name', 'content_type'), [
    ('PTT-20261009-WA0001.opus', 'audio/ogg'),
    ('nota-de-voz', 'audio/opus'),
])
def test_optimize_audio_decodes_opus_voice_note(name, content_type):
    """WhatsApp voice notes are Ogg Opus; ffmpeg has no demuxer named 'opus'."""
    upload = SimpleUploadedFile(name, _opus_voice_note_bytes(3), content_type=content_type)

    result_file, duration_sec = MediaOptimizationService.optimize_audio(upload)

    assert duration_sec == pytest.approx(3.0, abs=0.1)
    assert result_file.read(3) == b'ID3'


# ---------------------------------------------------------------------------
# optimize_audio — error paths
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_optimize_audio_raises_for_unsupported_format():
    """An unknown extension without a known MIME type is rejected."""
    file = _make_fake_file(name='document.xyz')
    with pytest.raises(ValidationError) as exc_info:
        MediaOptimizationService.optimize_audio(file)
    assert 'Formato de audio no soportado' in str(exc_info.value)


@pytest.mark.django_db
@patch('pydub.AudioSegment')
def test_optimize_audio_raises_when_audio_processing_fails(mock_audio_segment):
    """A decoder failure surfaces as a validation message in Spanish."""
    mock_audio_segment.from_file.side_effect = Exception('Decode error')
    file = _make_fake_file(name='bad.mp3')
    with pytest.raises(ValidationError) as exc_info:
        MediaOptimizationService.optimize_audio(file)
    assert 'No se pudo procesar' in str(exc_info.value)

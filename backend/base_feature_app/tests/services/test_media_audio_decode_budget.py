"""Memory budget for personalization audio uploads (I-P-97be6a5b4a65).

The upload endpoint is public and the UI accepts audio files of any length up to
10 MB, while only the first 30 seconds are kept. These tests decode a real file
with ffmpeg (installed in the CI backend job) instead of mocking pydub.
"""
import io
import tracemalloc

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from pydub import AudioSegment

from base_feature_app.services.media_service import MediaOptimizationService

# req_mb of the compute profile: 0.25 x worker_mb (MemoryMax=250M / 3 processes).
MAX_AUDIO_TRANSIENT_MB = 20


@pytest.fixture
def ten_minute_voice_note():
    """Build a ten-minute silent 8 kHz mono OGG upload, like a long phone voice note."""
    clip = AudioSegment.silent(duration=600_000, frame_rate=8000)
    buffer = io.BytesIO()
    clip.export(buffer, format='ogg')
    return SimpleUploadedFile('nota-de-voz.ogg', buffer.getvalue(), content_type='audio/ogg')


@pytest.fixture
def traced_memory():
    """Trace Python allocations made after the upload fixture is built."""
    tracemalloc.start()
    yield tracemalloc
    tracemalloc.stop()


def test_long_voice_note_keeps_first_thirty_seconds(ten_minute_voice_note):
    """A ten-minute note is cut to the thirty-second personalization limit."""
    _, duration_sec = MediaOptimizationService.optimize_audio(ten_minute_voice_note)

    assert duration_sec == 30.0


def test_long_voice_note_decoding_stays_within_request_memory_budget(ten_minute_voice_note, traced_memory):
    """A long note never materializes its full decoded PCM inside the request."""
    MediaOptimizationService.optimize_audio(ten_minute_voice_note)
    _, peak_bytes = traced_memory.get_traced_memory()

    # Bug it catches: decoding the whole upload before trimming (55 MB for this note).
    assert peak_bytes <= MAX_AUDIO_TRANSIENT_MB * 1024 * 1024

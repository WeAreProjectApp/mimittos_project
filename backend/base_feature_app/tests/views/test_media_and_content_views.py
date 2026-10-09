# ruff: noqa: D100, D103

import io
import re
import threading
import wave
from unittest.mock import patch

import pytest
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import InMemoryUploadedFile, SimpleUploadedFile
from django.db import close_old_connections, connection
from django.test import override_settings
from freezegun import freeze_time
from PIL import Image as PILImage
from rest_framework.test import APIClient

from base_feature_app.models import PersonalizationMedia, SiteContent
from base_feature_app.services.media_service import MediaOptimizationService
from base_feature_app.utils.media_access import MEDIA_ACCESS_SALT

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    u = User.objects.create_user(email='admin@example.com', password='pass')
    u.is_staff = True
    u.save(update_fields=['is_staff'])
    return u


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


def _make_in_memory_file(name='test.jpg', content=b'fake_image_data', content_type='image/jpeg'):
    buf = io.BytesIO(content)
    return InMemoryUploadedFile(buf, 'file', name, content_type, len(content), None)


def _make_real_image_upload(name='hero.jpg', color=(200, 100, 50)):
    buf = io.BytesIO()
    PILImage.new('RGB', (60, 40), color).save(buf, format='JPEG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg')


@pytest.fixture
def hero_storage(tmp_path):
    """Aísla la subida del hero en un directorio temporal por test."""
    storage = FileSystemStorage(location=str(tmp_path), base_url='/media/')
    with patch('base_feature_app.views.content_views.default_storage', storage):
        yield storage


# ---------------------------------------------------------------------------
# POST /api/media/upload/ — image upload
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_upload_media_returns_400_when_no_file_sent(api_client):
    response = api_client.post('/api/media/upload/', {'media_type': 'huella_image'})
    assert response.status_code == 400


@pytest.mark.django_db
def test_upload_media_returns_400_for_invalid_media_type(api_client):
    fake_file = _make_in_memory_file()
    response = api_client.post(
        '/api/media/upload/',
        {'file': fake_file, 'media_type': 'invalid_type'},
        format='multipart',
    )
    assert response.status_code == 400


@pytest.mark.django_db
@patch('base_feature_app.views.media_views.MediaOptimizationService.optimize_image')
def test_upload_media_image_returns_201_with_media_id(mock_optimize, api_client):
    """Falla si la respuesta ya no entrega una capacidad firmada para la imagen subida."""
    optimized = _make_in_memory_file('optimized.jpg', b'x' * 1024)
    mock_optimize.return_value = optimized

    fake_file = _make_in_memory_file()
    response = api_client.post(
        '/api/media/upload/',
        {'file': fake_file, 'media_type': 'huella_image'},
        format='multipart',
    )
    assert response.status_code == 201
    media = PersonalizationMedia.objects.get(pk=response.data['media_id'])
    assert signing.loads(response.data['media_token'], salt=MEDIA_ACCESS_SALT) == {
        'media_id': media.pk,
        'media_type': PersonalizationMedia.MediaType.HUELLA_IMAGE,
    }
    assert response.data['file_size_kb'] == media.file_size_kb
    assert response.data['duration_sec'] is None


@pytest.mark.django_db
@patch('base_feature_app.views.media_views.MediaOptimizationService.optimize_image')
def test_upload_media_assigns_authenticated_uploader(mock_optimize):
    """Falla si una subida autenticada deja el archivo sin su propietario real."""
    from django.contrib.auth import get_user_model

    user = get_user_model().objects.create_user(email='uploader@example.com', password='pass')
    client = APIClient()
    client.force_authenticate(user=user)
    mock_optimize.return_value = _make_in_memory_file('optimized.jpg', b'x' * 1024)

    response = client.post(
        '/api/media/upload/',
        {'file': _make_in_memory_file(), 'media_type': 'huella_image'},
        format='multipart',
    )

    media = PersonalizationMedia.objects.get(pk=response.data['media_id'])
    assert response.status_code == 201
    assert media.uploaded_by_id == user.pk


@pytest.mark.django_db
@patch('base_feature_app.views.media_views.MediaOptimizationService.optimize_image', side_effect=Exception('Image too large'))
def test_upload_media_image_returns_400_on_optimization_error(mock_optimize, api_client):
    fake_file = _make_in_memory_file()
    response = api_client.post(
        '/api/media/upload/',
        {'file': fake_file, 'media_type': 'huella_image'},
        format='multipart',
    )
    assert response.status_code == 400
    assert 'Image too large' in response.data['detail']


@pytest.mark.django_db
@patch('base_feature_app.views.media_views.MediaOptimizationService.optimize_audio')
def test_upload_media_audio_returns_201_with_duration(mock_optimize, api_client):
    """Falla si una capacidad de audio se firma para otro tipo de recurso."""
    optimized_audio = _make_in_memory_file('audio.mp3', b'a' * 512, 'audio/mpeg')
    mock_optimize.return_value = (optimized_audio, 15.5)

    fake_file = _make_in_memory_file('input.mp3', b'fake_audio', 'audio/mpeg')
    response = api_client.post(
        '/api/media/upload/',
        {'file': fake_file, 'media_type': 'audio'},
        format='multipart',
    )
    assert response.status_code == 201
    assert response.data['duration_sec'] == 15.5
    assert signing.loads(response.data['media_token'], salt=MEDIA_ACCESS_SALT) == {
        'media_id': response.data['media_id'],
        'media_type': PersonalizationMedia.MediaType.AUDIO,
    }


# ---------------------------------------------------------------------------
# POST /api/media/upload/ — size ceiling and unguessable stored names
# ---------------------------------------------------------------------------

ONE_MB = 1024 * 1024
RANDOM_HEX = re.compile(r'[0-9a-f]{32}')


def _image_upload(name='huella.jpg', size=0):
    """Real JPEG; bytes after its end marker are ignored by decoders, so padding keeps it valid."""
    buf = io.BytesIO()
    PILImage.new('RGB', (40, 40), (90, 140, 200)).save(buf, format='JPEG')
    data = buf.getvalue()
    return SimpleUploadedFile(name, data + b'\0' * max(size - len(data), 0), content_type='image/jpeg')


def _wav_upload(name='nota-de-voz.wav', seconds=1):
    """Real 8 kHz mono WAV: 16 000 bytes per second of silence."""
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(8000)
        wav.writeframes(b'\0\0' * 8000 * seconds)
    return SimpleUploadedFile(name, buf.getvalue(), content_type='audio/wav')


@pytest.mark.django_db
@pytest.mark.parametrize(('media_type', 'limit_setting', 'make_upload'), [
    ('huella_image', 'MAX_UPLOAD_IMAGE_MB', lambda: _image_upload(size=ONE_MB + 1)),
    ('audio', 'MAX_UPLOAD_AUDIO_MB', lambda: _wav_upload(seconds=66)),
])
def test_upload_media_rejects_file_over_size_limit(api_client, tmp_path, media_type, limit_setting, make_upload):
    """Falla si un archivo por encima del tope configurado se procesa o deja una fila."""
    upload = make_upload()

    with override_settings(MEDIA_ROOT=str(tmp_path), **{limit_setting: 1}):
        response = api_client.post(
            '/api/media/upload/', {'file': upload, 'media_type': media_type}, format='multipart',
        )

    assert response.status_code == 400
    assert response.data['detail'] == 'El archivo supera el tamaño máximo de 1 MB.'
    assert PersonalizationMedia.objects.count() == 0


@pytest.mark.django_db
def test_upload_media_accepts_image_at_size_limit(api_client, tmp_path):
    """Falla si el tope rechaza un archivo que mide exactamente el máximo permitido."""
    upload = _image_upload(size=ONE_MB)

    with override_settings(MEDIA_ROOT=str(tmp_path), MAX_UPLOAD_IMAGE_MB=1):
        response = api_client.post(
            '/api/media/upload/', {'file': upload, 'media_type': 'huella_image'}, format='multipart',
        )

    assert response.status_code == 201
    assert PersonalizationMedia.objects.count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize(('media_type', 'optimizer', 'make_upload', 'message'), [
    ('huella_image', 'optimize_image', lambda: _image_upload(), 'La imagen tiene demasiados píxeles.'),
    ('audio', 'optimize_audio', lambda: _wav_upload(), 'No se pudo procesar el archivo de audio.'),
])
def test_upload_media_returns_plain_validation_message(
    api_client, tmp_path, media_type, optimizer, make_upload, message,
):
    """Falla si el 400 muestra al cliente la representación con corchetes del ValidationError."""
    upload = make_upload()

    with override_settings(MEDIA_ROOT=str(tmp_path)), patch.object(
        MediaOptimizationService, optimizer, side_effect=ValidationError(message),
    ):
        response = api_client.post(
            '/api/media/upload/', {'file': upload, 'media_type': media_type}, format='multipart',
        )

    assert response.status_code == 400
    assert response.data['detail'] == message
    assert PersonalizationMedia.objects.count() == 0


@pytest.mark.django_db
@freeze_time('2026-10-09 12:00:00')
@pytest.mark.parametrize(('media_type', 'make_upload', 'extension'), [
    ('huella_image', lambda: _image_upload('image.jpg'), '.jpg'),
    ('audio', lambda: _wav_upload('image.wav'), '.mp3'),
])
def test_upload_media_stores_file_under_random_name(api_client, tmp_path, media_type, make_upload, extension):
    """Falla si el nombre elegido por el cliente vuelve predecible la URL pública del archivo."""
    first_upload, second_upload = make_upload(), make_upload()

    with override_settings(MEDIA_ROOT=str(tmp_path)):
        first = api_client.post(
            '/api/media/upload/', {'file': first_upload, 'media_type': media_type}, format='multipart',
        )
        second = api_client.post(
            '/api/media/upload/', {'file': second_upload, 'media_type': media_type}, format='multipart',
        )

    first_name, second_name = PersonalizationMedia.objects.order_by('pk').values_list('file', flat=True)
    assert (first.status_code, second.status_code) == (201, 201)
    assert RANDOM_HEX.sub('<hex>', first_name) == f'personalizations/2026/10/<hex>{extension}'
    assert RANDOM_HEX.sub('<hex>', second_name) == f'personalizations/2026/10/<hex>{extension}'
    assert first_name != second_name
    assert first.data['file_url'] == f'http://testserver/media/{first_name}'


# ---------------------------------------------------------------------------
# GET /api/content/<key>/ — public site content
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_site_content_get_returns_200_for_valid_key(api_client):
    response = api_client.get('/api/content/faq/')
    assert response.status_code == 200
    assert 'content_json' in response.data


@pytest.mark.django_db
def test_site_content_get_returns_404_for_invalid_key(api_client):
    response = api_client.get('/api/content/nonexistent/')
    assert response.status_code == 404


@pytest.mark.django_db
def test_site_content_get_creates_default_entry_if_missing(api_client):
    assert not SiteContent.objects.filter(key='faq').exists()
    api_client.get('/api/content/faq/')
    assert SiteContent.objects.filter(key='faq').exists()


# ---------------------------------------------------------------------------
# PUT /api/content/<key>/ — admin update
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_site_content_put_updates_content_as_admin(admin_client):
    payload = {'content_json': {'question': 'answer'}}
    response = admin_client.put('/api/content/faq/', payload, format='json')
    assert response.status_code == 200
    obj = SiteContent.objects.get(key='faq')
    assert obj.content_json == {'question': 'answer'}


@pytest.mark.django_db
def test_site_content_put_returns_403_for_anonymous(api_client):
    payload = {'content_json': {'question': 'answer'}}
    response = api_client.put('/api/content/faq/', payload, format='json')
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# POST /api/content/hero-image/upload/ — hero image upload
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_hero_image_upload_returns_403_for_anonymous(api_client):
    response = api_client.post(
        '/api/content/hero-image/upload/',
        {'image': _make_real_image_upload()},
        format='multipart',
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_hero_image_upload_returns_400_when_no_image_sent(admin_client):
    response = admin_client.post('/api/content/hero-image/upload/', {}, format='multipart')
    assert response.status_code == 400


@pytest.mark.django_db
def test_hero_image_upload_returns_200_for_admin(admin_client, hero_storage):
    response = admin_client.post(
        '/api/content/hero-image/upload/',
        {'image': _make_real_image_upload()},
        format='multipart',
    )
    assert response.status_code == 200
    assert response.data['image_url'].startswith('/media/site/hero-')


@pytest.mark.django_db
def test_hero_image_upload_persists_url_in_site_content(admin_client, hero_storage):
    response = admin_client.post(
        '/api/content/hero-image/upload/',
        {'image': _make_real_image_upload()},
        format='multipart',
    )
    obj = SiteContent.objects.get(key='hero_image')
    assert obj.content_json['image_url'] == response.data['image_url']


@pytest.mark.django_db
def test_hero_image_upload_uses_unique_filename_per_upload(admin_client, hero_storage):
    first = admin_client.post(
        '/api/content/hero-image/upload/',
        {'image': _make_real_image_upload()},
        format='multipart',
    )
    second = admin_client.post(
        '/api/content/hero-image/upload/',
        {'image': _make_real_image_upload()},
        format='multipart',
    )
    assert first.data['image_url'] != second.data['image_url']


@pytest.mark.django_db(transaction=True)
def test_hero_image_upload_deletes_previous_local_image(admin_client, hero_storage):
    first = admin_client.post(
        '/api/content/hero-image/upload/',
        {'image': _make_real_image_upload()},
        format='multipart',
    )
    first_path = first.data['image_url'].removeprefix('/media/')
    assert hero_storage.exists(first_path)

    admin_client.post(
        '/api/content/hero-image/upload/',
        {'image': _make_real_image_upload()},
        format='multipart',
    )
    assert not hero_storage.exists(first_path)


@pytest.mark.django_db
def test_hero_upload_preserves_current_file_when_storage_save_fails(admin_client, hero_storage):
    """Falla si un error al guardar borra el hero que ya estaba publicado."""
    old_path = hero_storage.save('site/current.jpg', _make_real_image_upload('current.jpg'))
    SiteContent.objects.create(key='hero_image', content_json={'image_url': f'/media/{old_path}'})

    with patch.object(hero_storage, 'save', side_effect=OSError('storage unavailable')):
        response = admin_client.post(
            '/api/content/hero-image/upload/', {'image': _make_real_image_upload()}, format='multipart',
        )

    content = SiteContent.objects.get(key='hero_image')
    assert response.status_code == 503
    assert content.content_json['image_url'] == f'/media/{old_path}'
    assert hero_storage.exists(old_path)


@pytest.mark.django_db
def test_hero_upload_preserves_current_file_when_storage_url_fails(admin_client, hero_storage, tmp_path):
    """Falla si un fallo al construir la URL deja una referencia nueva a medio guardar."""
    old_path = hero_storage.save('site/current.jpg', _make_real_image_upload('current.jpg'))
    SiteContent.objects.create(key='hero_image', content_json={'image_url': f'/media/{old_path}'})

    with patch.object(hero_storage, 'url', side_effect=OSError('url unavailable')):
        response = admin_client.post(
            '/api/content/hero-image/upload/', {'image': _make_real_image_upload()}, format='multipart',
        )

    assert response.status_code == 503
    assert SiteContent.objects.get(key='hero_image').content_json['image_url'] == f'/media/{old_path}'
    assert hero_storage.exists(old_path)
    assert [path.name for path in tmp_path.joinpath('site').iterdir()] == ['current.jpg']


@pytest.mark.django_db
def test_hero_upload_preserves_current_file_when_content_save_fails(admin_client, hero_storage, tmp_path):
    """Falla si un fallo de base de datos elimina el hero antes de confirmar la sustitución."""
    old_path = hero_storage.save('site/current.jpg', _make_real_image_upload('current.jpg'))
    SiteContent.objects.create(key='hero_image', content_json={'image_url': f'/media/{old_path}'})

    with patch.object(SiteContent, 'save', side_effect=RuntimeError('database unavailable')):
        response = admin_client.post(
            '/api/content/hero-image/upload/', {'image': _make_real_image_upload()}, format='multipart',
        )

    assert response.status_code == 503
    assert SiteContent.objects.get(key='hero_image').content_json['image_url'] == f'/media/{old_path}'
    assert hero_storage.exists(old_path)
    assert [path.name for path in tmp_path.joinpath('site').iterdir()] == ['current.jpg']


@pytest.mark.django_db(transaction=True)
def test_hero_upload_keeps_new_file_when_postcommit_cleanup_fails(admin_client, hero_storage, caplog):
    """Falla si limpiar el archivo previo revierte una sustitución ya confirmada."""
    first = admin_client.post(
        '/api/content/hero-image/upload/', {'image': _make_real_image_upload()}, format='multipart',
    )
    old_path = first.data['image_url'].removeprefix('/media/')

    with patch.object(hero_storage, 'delete', side_effect=OSError('delete-secret')):
        response = admin_client.post(
            '/api/content/hero-image/upload/', {'image': _make_real_image_upload()}, format='multipart',
        )

    new_path = response.data['image_url'].removeprefix('/media/')
    assert response.status_code == 200
    assert SiteContent.objects.get(key='hero_image').content_json['image_url'] == response.data['image_url']
    assert hero_storage.exists(new_path)
    assert hero_storage.exists(old_path)
    assert 'operation=replaced' in caplog.text
    assert 'error_type=OSError' in caplog.text
    assert 'delete-secret' not in caplog.text


@pytest.mark.django_db
def test_hero_upload_does_not_delete_external_previous_url(admin_client, hero_storage):
    """Falla si una URL externa se envía por error al storage local para borrado."""
    SiteContent.objects.create(key='hero_image', content_json={'image_url': 'https://cdn.example.test/hero.jpg'})

    with patch.object(hero_storage, 'delete', wraps=hero_storage.delete) as delete:
        response = admin_client.post(
            '/api/content/hero-image/upload/', {'image': _make_real_image_upload()}, format='multipart',
        )

    assert response.status_code == 200
    delete.assert_not_called()


def _run_concurrent_hero_replacements(admin_user, hero_storage):
    """Run the two real MySQL replacement requests and return their observable state."""
    initial_path = hero_storage.save('site/current.jpg', _make_real_image_upload('current.jpg'))
    SiteContent.objects.create(key='hero_image', content_json={'image_url': f'/media/{initial_path}'})
    start = threading.Barrier(2)
    responses = []
    failures = []

    def upload(color):
        close_old_connections()
        try:
            client = APIClient()
            client.force_authenticate(user=admin_user)
            start.wait()
            responses.append(client.post(
                '/api/content/hero-image/upload/',
                {'image': _make_real_image_upload(color=color)}, format='multipart',
            ))
        except Exception as exc:  # noqa: BLE001 - assertion below exposes an unexpected worker failure.
            failures.append(exc)
        finally:
            close_old_connections()

    first_worker = threading.Thread(target=upload, args=((1, 2, 3),))
    second_worker = threading.Thread(target=upload, args=((4, 5, 6),))
    first_worker.start()
    second_worker.start()
    first_worker.join(timeout=10)
    second_worker.join(timeout=10)

    return initial_path, responses, failures, first_worker, second_worker


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(
    connection.vendor != 'mysql',
    reason='select_for_update replacement concurrency must run against MySQL, not SQLite emulation.',
)
def test_hero_upload_concurrent_replacements_leave_a_published_file(admin_user, hero_storage):
    """Falla si dos reemplazos MySQL dejan referencias o archivos superseded inconsistentes."""
    initial_path, responses, failures, first_worker, second_worker = _run_concurrent_hero_replacements(admin_user, hero_storage)
    final_path = SiteContent.objects.get(key='hero_image').content_json['image_url'].removeprefix('/media/')
    first_path = responses[0].data['image_url'].removeprefix('/media/')
    second_path = responses[1].data['image_url'].removeprefix('/media/')
    intermediate_paths = {first_path, second_path} - {final_path}
    directories, files = hero_storage.listdir('site')

    assert (
        not first_worker.is_alive(),
        not second_worker.is_alive(),
        failures,
        [response.status_code for response in responses],
        hero_storage.exists(final_path),
        hero_storage.exists(initial_path),
        len(intermediate_paths),
        hero_storage.exists(intermediate_paths.pop()),
        directories,
        files,
    ) == (
        True,
        True,
        [],
        [200, 200],
        True,
        False,
        1,
        False,
        [],
        [final_path.removeprefix('site/')],
    )

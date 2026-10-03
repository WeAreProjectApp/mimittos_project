import io
import logging
import uuid
from functools import partial

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from PIL import Image as PILImage
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from base_feature_app.models import SiteContent
from base_feature_app.serializers.analytics import SiteContentSerializer

_IMG_MAX = 1400
_IMG_QUALITY = 82
_IMG_MAX_BYTES = 5 * 1024 * 1024
logger = logging.getLogger(__name__)


def _delete_hero_file(path, operation):
    """Cleanup cannot undo a committed replacement or disclose storage errors."""
    try:
        default_storage.delete(path)
    except Exception as exc:
        logger.warning('hero image cleanup failed (operation=%s, error_type=%s)', operation, type(exc).__name__)


@api_view(['GET', 'PUT'])
@permission_classes([AllowAny])
def site_content(request, key: str):
    valid_keys = [choice[0] for choice in SiteContent.Key.choices]
    if key not in valid_keys:
        return Response({'detail': 'Clave de contenido no válida.'}, status=status.HTTP_404_NOT_FOUND)

    content_obj, _ = SiteContent.objects.get_or_create(key=key, defaults={'content_json': {}})

    if request.method == 'GET':
        return Response({'key': content_obj.key, 'content_json': content_obj.content_json})

    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    serializer = SiteContentSerializer(data={'key': key, 'content_json': request.data.get('content_json', {})})
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    content_obj.content_json = serializer.validated_data['content_json']
    content_obj.updated_by = request.user
    content_obj.save()

    return Response({'key': content_obj.key, 'content_json': content_obj.content_json})


@api_view(['POST'])
@permission_classes([AllowAny])
def hero_image_upload(request):
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    file = request.FILES.get('image')
    if not file:
        return Response({'detail': 'No image provided.'}, status=status.HTTP_400_BAD_REQUEST)
    if file.size > _IMG_MAX_BYTES:
        return Response({'detail': 'La imagen supera el límite de 5 MB.'}, status=status.HTTP_400_BAD_REQUEST)
    if not file.content_type.startswith('image/'):
        return Response({'detail': 'El archivo debe ser una imagen.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        img = PILImage.open(file).convert('RGB')
        w, h = img.size
        if w > _IMG_MAX or h > _IMG_MAX:
            ratio = min(_IMG_MAX / w, _IMG_MAX / h)
            img = img.resize((round(w * ratio), round(h * ratio)), PILImage.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=_IMG_QUALITY, optimize=True)
        buf.seek(0)
    except Exception:
        return Response({'detail': 'Imagen inválida o corrupta.'}, status=status.HTTP_400_BAD_REQUEST)

    # Nombre único por subida: la URL cambia siempre, así ninguna caché
    # (navegador, nginx, CDN) sigue sirviendo una versión obsoleta del hero.
    path_name = f'site/hero-{uuid.uuid4().hex}.jpg'
    saved_path = None
    try:
        saved_path = default_storage.save(path_name, ContentFile(buf.read()))
        image_url = default_storage.url(saved_path)
        with transaction.atomic():
            content_obj, _ = SiteContent.objects.select_for_update().get_or_create(
                key='hero_image', defaults={'content_json': {}},
            )
            old_url = (content_obj.content_json or {}).get('image_url', '')
            content_obj.content_json = {'image_url': image_url}
            content_obj.updated_by = request.user
            content_obj.save()
            if isinstance(old_url, str) and old_url.startswith(settings.MEDIA_URL):
                old_path = old_url[len(settings.MEDIA_URL):].split('?')[0]
                if old_path and old_path != saved_path:
                    transaction.on_commit(partial(_delete_hero_file, old_path, 'replaced'))
    except Exception as exc:
        # Only this upload can be removed on failure. The old reference/file
        # remains usable because its deletion is deferred until DB commit.
        _delete_hero_file(saved_path or path_name, 'rollback')
        logger.warning('hero image replacement failed (error_type=%s)', type(exc).__name__)
        return Response(
            {'detail': 'No pudimos guardar la imagen. La imagen anterior se conserva. Intenta de nuevo.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response({'image_url': image_url})

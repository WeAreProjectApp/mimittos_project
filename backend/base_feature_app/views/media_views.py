import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from base_feature_app.models import PersonalizationMedia
from base_feature_app.services.media_service import MediaOptimizationService
from base_feature_app.utils.media_access import issue_media_token

logger = logging.getLogger(__name__)


@api_view(['POST'])
@permission_classes([AllowAny])
def upload_media(request):
    file = request.FILES.get('file')
    media_type = request.data.get('media_type')

    if not file:
        return Response({'detail': 'No se envió ningún archivo.'}, status=status.HTTP_400_BAD_REQUEST)

    if media_type not in [PersonalizationMedia.MediaType.HUELLA_IMAGE, PersonalizationMedia.MediaType.AUDIO]:
        return Response(
            {'detail': 'media_type debe ser "huella_image" o "audio".'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = request.user if request.user.is_authenticated else None
    duration_sec = None

    try:
        if media_type == PersonalizationMedia.MediaType.HUELLA_IMAGE:
            optimized_file = MediaOptimizationService.optimize_image(file)
            file_size_kb = optimized_file.size // 1024
        else:
            optimized_file, duration_sec = MediaOptimizationService.optimize_audio(file)
            file_size_kb = optimized_file.size // 1024
    except Exception as exc:
        logger.exception(
            'media upload failed (media_type=%s, filename=%s, content_type=%s, size=%s)',
            media_type,
            getattr(file, 'name', None),
            getattr(file, 'content_type', None),
            getattr(file, 'size', None),
        )
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    media = PersonalizationMedia.objects.create(
        uploaded_by=user,
        media_type=media_type,
        file=optimized_file,
        file_size_kb=file_size_kb,
        duration_sec=duration_sec,
    )

    return Response(
        {
            'media_id': media.id,
            'media_token': issue_media_token(media),
            'file_url': request.build_absolute_uri(media.file.url),
            'file_size_kb': media.file_size_kb,
            'duration_sec': media.duration_sec,
        },
        status=status.HTTP_201_CREATED,
    )

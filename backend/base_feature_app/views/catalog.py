import io

from django.core.files.uploadedfile import InMemoryUploadedFile
from django.db import transaction
from django.db.models import Min, OuterRef, Prefetch, Q, Subquery
from PIL import Image
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from base_feature_app.models import (
    Peluch, Category, GlobalSize, GlobalColor, PeluchColorImage, PeluchSizePrice, OrderItem,
)
from base_feature_app.serializers.catalog import (
    PeluchListSerializer, PeluchDetailSerializer, PeluchCreateUpdateSerializer,
    CategorySerializer, GlobalSizeSerializer, GlobalColorSerializer,
)
from django_attachments.models import Attachment

_IMG_MAX = 1400
_IMG_QUALITY = 82
_IMG_MAX_BYTES = 5 * 1024 * 1024  # 5 MB


def _optimize_image(file) -> InMemoryUploadedFile:
    """Resize to max 1400×1400 and re-encode as JPEG at quality 82."""
    img = Image.open(file)
    img = img.convert('RGB')  # drop alpha, unify mode

    w, h = img.size
    if w > _IMG_MAX or h > _IMG_MAX:
        ratio = min(_IMG_MAX / w, _IMG_MAX / h)
        img = img.resize((round(w * ratio), round(h * ratio)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=_IMG_QUALITY, optimize=True)
    buf.seek(0)

    name = file.name.rsplit('.', 1)[0] + '.jpg'
    return InMemoryUploadedFile(buf, 'file', name, 'image/jpeg', buf.getbuffer().nbytes, None)


class CategoryImageSaveError(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = 'No pudimos guardar la imagen. Los cambios no se guardaron. Intenta de nuevo.'


def _save_category(serializer, image_file):
    """Prepare the image before persisting any category changes."""
    if image_file is None:
        return serializer.save()
    if image_file.size > _IMG_MAX_BYTES:
        raise ValidationError({'detail': 'La imagen supera el límite de 5 MB.'})
    try:
        prepared_image = _optimize_image(image_file)
    except Exception as exc:
        raise ValidationError({'detail': 'Imagen inválida o corrupta.'}) from exc
    try:
        with transaction.atomic():
            return serializer.save(image=prepared_image)
    except Exception as exc:
        raise CategoryImageSaveError() from exc


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def sizes_list(request):
    if request.method == 'GET':
        qs = GlobalSize.objects.filter(is_active=True).order_by('sort_order', 'label')
        return Response(GlobalSizeSerializer(qs, many=True).data)

    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    serializer = GlobalSizeSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH', 'DELETE'])
@permission_classes([AllowAny])
def size_detail(request, size_id: int):
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
    try:
        size = GlobalSize.objects.get(pk=size_id)
    except GlobalSize.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'DELETE':
        size.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = GlobalSizeSerializer(size, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def colors_list(request):
    if request.method == 'GET':
        qs = GlobalColor.objects.filter(is_active=True).order_by('sort_order', 'name')
        return Response(GlobalColorSerializer(qs, many=True).data)

    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    serializer = GlobalColorSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH', 'DELETE'])
@permission_classes([AllowAny])
def color_detail(request, color_id: int):
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
    try:
        color = GlobalColor.objects.get(pk=color_id)
    except GlobalColor.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'DELETE':
        attachment_ids = list(
            PeluchColorImage.objects.filter(color=color).values_list('attachment_id', flat=True)
        )
        color.delete()
        Attachment.objects.filter(id__in=attachment_ids).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = GlobalColorSerializer(color, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def color_usage(request, color_id: int):
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
    try:
        color = GlobalColor.objects.get(pk=color_id)
    except GlobalColor.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    return Response({
        'products': Peluch.objects.filter(available_colors=color).count(),
        'photos': PeluchColorImage.objects.filter(color=color).count(),
        'orders': OrderItem.objects.filter(color=color).count(),
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def size_usage(request, size_id: int):
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
    try:
        size = GlobalSize.objects.get(pk=size_id)
    except GlobalSize.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    return Response({
        'products': PeluchSizePrice.objects.filter(size=size).count(),
        'orders': OrderItem.objects.filter(size=size).count(),
    })


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def categories(request):
    if request.method == 'GET':
        qs = Category.objects.filter(is_active=True)
        return Response(CategorySerializer(qs, many=True, context={'request': request}).data)

    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    is_featured = request.data.get('is_featured') in (True, 'true', 'True', '1')
    if is_featured:
        count = Category.objects.filter(is_featured=True).count()
        if count >= 4:
            return Response({'detail': 'Solo se pueden tener máximo 4 categorías destacadas.'}, status=status.HTTP_400_BAD_REQUEST)

    serializer = CategorySerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        instance = _save_category(serializer, request.FILES.get('image'))
        return Response(CategorySerializer(instance, context={'request': request}).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def categories_featured(request):
    qs = Category.objects.filter(is_active=True, is_featured=True).order_by('display_order')[:4]
    return Response(CategorySerializer(qs, many=True, context={'request': request}).data)


@api_view(['PUT', 'PATCH', 'DELETE'])
@permission_classes([AllowAny])
def category_detail(request, category_id: int):
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    try:
        category = Category.objects.get(id=category_id)
    except Category.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    is_featured = request.data.get('is_featured') in (True, 'true', 'True', '1')
    if is_featured and not category.is_featured:
        count = Category.objects.filter(is_featured=True).count()
        if count >= 4:
            return Response({'detail': 'Solo se pueden tener máximo 4 categorías destacadas.'}, status=status.HTTP_400_BAD_REQUEST)

    serializer = CategorySerializer(category, data=request.data, partial=(request.method == 'PATCH'), context={'request': request})
    if serializer.is_valid():
        instance = _save_category(serializer, request.FILES.get('image'))
        return Response(CategorySerializer(instance, context={'request': request}).data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


def _with_list_relations(queryset):
    """Load the list representation without per-product price queries."""
    available_prices = PeluchSizePrice.objects.filter(
        peluch_id=OuterRef('pk'), is_available=True,
    ).order_by('price').values('price')[:1]
    return queryset.annotate(
        available_min_price=Subquery(available_prices),
    ).select_related('category', 'gallery').prefetch_related(
        'available_colors', 'gallery__attachment_set',
        Prefetch('color_images', queryset=PeluchColorImage.objects.select_related('attachment')),
    )


@api_view(['GET'])
@permission_classes([AllowAny])
def peluches_featured(request):
    qs = _with_list_relations(Peluch.objects.filter(is_active=True, is_featured=True))
    return Response(PeluchListSerializer(qs, many=True, context={'request': request}).data)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def peluches(request):
    if request.method == 'GET':
        is_admin = request.user.is_authenticated and request.user.is_staff
        qs = Peluch.objects.all() if is_admin else Peluch.objects.filter(is_active=True)
        qs = _with_list_relations(qs)

        category_slug = request.query_params.get('category')
        if category_slug:
            qs = qs.filter(category__slug=category_slug)

        size_slug = request.query_params.get('size')
        if size_slug:
            qs = qs.filter(size_prices__size__slug=size_slug, size_prices__is_available=True)

        color_slug = request.query_params.get('color')
        if color_slug:
            qs = qs.filter(available_colors__slug=color_slug)

        min_price = request.query_params.get('min_price')
        max_price = request.query_params.get('max_price')
        if min_price or max_price:
            qs = qs.annotate(price_min=Min('size_prices__price'))
            if min_price:
                qs = qs.filter(price_min__gte=int(min_price))
            if max_price:
                qs = qs.filter(price_min__lte=int(max_price))

        if request.query_params.get('has_huella') == 'true':
            qs = qs.filter(has_huella=True)
        if request.query_params.get('has_audio') == 'true':
            qs = qs.filter(has_audio=True)

        sort = request.query_params.get('sort', 'popular')
        sort_map = {
            'popular': '-view_count',
            'new': '-created_at',
            'price_asc': 'price_min',
            'price_desc': '-price_min',
            'top_rated': '-average_rating',
        }
        order_by = sort_map.get(sort, '-view_count')
        if order_by in ('price_min', '-price_min') and not (min_price or max_price):
            qs = qs.annotate(price_min=Min('size_prices__price'))
        qs = qs.order_by(order_by).distinct()

        serializer = PeluchListSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    serializer = PeluchCreateUpdateSerializer(data=request.data)
    if serializer.is_valid():
        peluch = serializer.save()
        return Response(
            PeluchDetailSerializer(peluch, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@permission_classes([AllowAny])
def peluch_detail(request, slug: str):
    try:
        peluch = Peluch.objects.prefetch_related(
            'available_colors', 'size_prices__size', 'gallery__attachment_set', 'category',
            'color_images__color', 'color_images__attachment',
        ).get(slug=slug, is_active=True)
    except Peluch.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        Peluch.objects.filter(pk=peluch.pk).update(view_count=peluch.view_count + 1)
        serializer = PeluchDetailSerializer(peluch, context={'request': request})
        return Response(serializer.data)

    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'DELETE':
        peluch.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    is_featured_new = request.data.get('is_featured') in (True, 'true', 'True', '1')
    if is_featured_new and not peluch.is_featured:
        count = Peluch.objects.filter(is_featured=True).count()
        if count >= 4:
            return Response({'detail': 'Solo se pueden tener máximo 4 peluches destacados.'}, status=status.HTTP_400_BAD_REQUEST)

    serializer = PeluchCreateUpdateSerializer(peluch, data=request.data, partial=(request.method == 'PATCH'))
    if serializer.is_valid():
        peluch = serializer.save()
        return Response(PeluchDetailSerializer(peluch, context={'request': request}).data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def peluch_gallery_upload(request, slug: str):
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
    try:
        peluch = Peluch.objects.get(slug=slug)
    except Peluch.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    file = request.FILES.get('image')
    if not file:
        return Response({'detail': 'No image provided.'}, status=status.HTTP_400_BAD_REQUEST)

    if file.size > _IMG_MAX_BYTES:
        return Response(
            {'detail': 'Image exceeds 5 MB limit.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not file.content_type.startswith('image/'):
        return Response(
            {'detail': 'File must be an image.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        optimized = _optimize_image(file)
    except Exception:
        return Response({'detail': 'Invalid or corrupt image.'}, status=status.HTTP_400_BAD_REQUEST)

    attachment = Attachment(library=peluch.gallery, original_name=optimized.name, file=optimized)
    attachment.save()

    return Response({'id': attachment.pk, 'url': attachment.file.url}, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([AllowAny])
def peluch_gallery_delete(request, slug: str, attachment_id: int):
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
    try:
        peluch = Peluch.objects.get(slug=slug)
        attachment = Attachment.objects.get(pk=attachment_id, library=peluch.gallery)
    except (Peluch.DoesNotExist, Attachment.DoesNotExist):
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    attachment.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def peluch_color_image_list_upload(request, slug: str, color_slug: str):
    try:
        peluch = Peluch.objects.get(slug=slug)
        color = GlobalColor.objects.get(slug=color_slug)
    except (Peluch.DoesNotExist, GlobalColor.DoesNotExist):
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        pci_qs = PeluchColorImage.objects.filter(
            peluch=peluch, color=color
        ).select_related('attachment').order_by('display_order')
        data = [{'id': pci.pk, 'url': pci.attachment.file.url} for pci in pci_qs]
        return Response(data)

    # POST
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    if not peluch.available_colors.filter(pk=color.pk).exists():
        return Response({'detail': 'Este color no está asignado al peluche.'}, status=status.HTTP_400_BAD_REQUEST)

    file = request.FILES.get('image')
    if not file:
        return Response({'detail': 'No image provided.'}, status=status.HTTP_400_BAD_REQUEST)
    if file.size > _IMG_MAX_BYTES:
        return Response({'detail': 'Image exceeds 5 MB limit.'}, status=status.HTTP_400_BAD_REQUEST)
    if not file.content_type.startswith('image/'):
        return Response({'detail': 'File must be an image.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        optimized = _optimize_image(file)
    except Exception:
        return Response({'detail': 'Invalid or corrupt image.'}, status=status.HTTP_400_BAD_REQUEST)

    attachment = Attachment(library=peluch.gallery, original_name=optimized.name, file=optimized)
    attachment.save()

    next_order = PeluchColorImage.objects.filter(peluch=peluch, color=color).count()
    pci = PeluchColorImage.objects.create(
        peluch=peluch, color=color, attachment=attachment, display_order=next_order
    )

    return Response(
        {'id': pci.pk, 'color_id': color.pk, 'url': attachment.file.url},
        status=status.HTTP_201_CREATED,
    )


@api_view(['DELETE'])
@permission_classes([AllowAny])
def peluch_color_image_delete(request, slug: str, color_slug: str, pci_id: int):
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
    try:
        peluch = Peluch.objects.get(slug=slug)
        color = GlobalColor.objects.get(slug=color_slug)
        pci = PeluchColorImage.objects.select_related('attachment').get(
            pk=pci_id, peluch=peluch, color=color
        )
    except (Peluch.DoesNotExist, GlobalColor.DoesNotExist, PeluchColorImage.DoesNotExist):
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    pci.attachment.delete()
    pci.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['PATCH'])
@permission_classes([AllowAny])
def peluch_bulk_category(request):
    if not request.user.is_authenticated or not request.user.is_staff:
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)
    slug_list = request.data.get('slug_list', [])
    category_id = request.data.get('category_id')
    if not slug_list or not category_id:
        return Response({'detail': 'slug_list and category_id are required.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        Category.objects.get(pk=category_id)
    except Category.DoesNotExist:
        return Response({'detail': 'Categoría no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
    updated = Peluch.objects.filter(slug__in=slug_list).update(category_id=category_id)
    return Response({'updated': updated})

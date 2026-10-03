"""Test order serializer behavior."""

import pytest
from django.core import signing
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django_attachments.models import Library
from rest_framework.test import APIRequestFactory

from base_feature_app.models import (
    Category,
    GlobalColor,
    GlobalSize,
    Order,
    OrderItem,
    Peluch,
    PeluchSizePrice,
    PersonalizationMedia,
)
from base_feature_app.serializers.order import (
    OrderCreateSerializer,
    OrderItemCreateSerializer,
    OrderItemReadSerializer,
    OrderStatusUpdateSerializer,
    OrderTrackingUpdateSerializer,
)
from base_feature_app.services.order_access_service import ORDER_ACCESS_SALT
from base_feature_app.utils.media_access import issue_media_token

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def category(db):
    """Provide a category fixture."""
    return Category.objects.create(name='Gatos', slug='gatos-ser', is_active=True)


@pytest.fixture
def color(db):
    """Provide a color fixture."""
    return GlobalColor.objects.create(name='Negro', slug='negro-ser', hex_code='#000000', is_active=True)


@pytest.fixture
def size(db):
    """Provide a size fixture."""
    return GlobalSize.objects.create(label='Grande', slug='grande-ser', cm='40cm', is_active=True)


@pytest.fixture
def peluch(db, category, color):
    """Provide a peluch fixture."""
    library = Library.objects.create(title='Serializer Gallery')
    p = Peluch.objects.create(
        title='Gatito Negro',
        slug='gatito-negro-ser',
        category=category,
        lead_description='Adorable',
        gallery=library,
        is_active=True,
    )
    p.available_colors.add(color)
    return p


@pytest.fixture
def peluch_with_price(peluch, size):
    """Provide a priced peluch fixture."""
    PeluchSizePrice.objects.create(peluch=peluch, size=size, price=90000, is_available=True)
    return peluch


@pytest.fixture
def huella_peluch(db, category, color):
    """Provide a peluch with huella support."""
    library = Library.objects.create(title='Huella Gallery')
    p = Peluch.objects.create(
        title='Gatito Huella',
        slug='gatito-huella-ser',
        category=category,
        lead_description='Con huella',
        gallery=library,
        is_active=True,
        has_huella=True,
        has_audio=True,
    )
    p.available_colors.add(color)
    return p


@pytest.fixture
def huella_peluch_with_price(huella_peluch, size):
    """Provide a priced peluch with huella support."""
    PeluchSizePrice.objects.create(peluch=huella_peluch, size=size, price=95000, is_available=True)
    return huella_peluch


@pytest.fixture
def huella_image(db, existing_user):
    """Provide uploaded huella image media."""
    return PersonalizationMedia.objects.create(
        uploaded_by=existing_user,
        media_type=PersonalizationMedia.MediaType.HUELLA_IMAGE,
        file='personalizations/2026/01/test.jpg',
        file_size_kb=100,
    )


@pytest.fixture
def audio_media(db, existing_user):
    """Provide uploaded audio media."""
    return PersonalizationMedia.objects.create(
        uploaded_by=existing_user,
        media_type=PersonalizationMedia.MediaType.AUDIO,
        file='personalizations/2026/01/test.mp3',
        file_size_kb=200,
        duration_sec=5.0,
    )


def _base_item(peluch_id, size_id, color_id):
    return {
        'peluch_id': peluch_id,
        'size_id': size_id,
        'color_id': color_id,
        'quantity': 1,
        'has_huella': False,
        'has_corazon': False,
        'has_audio': False,
    }


def _order_payload(items):
    return {
        'customer_name': 'Ana García',
        'customer_email': 'ana@example.com',
        'address': 'Calle 123',
        'city': 'Bogotá',
        'department': 'Cundinamarca',
        'items': items,
    }


def _cart_lines(count, *, with_customizations=False):
    """Create distinct catalog pairs before the query budget is captured."""
    suffix = Category.objects.count()
    category = Category.objects.create(name=f'Rendimiento {suffix}', slug=f'rendimiento-{suffix}')
    library = Library.objects.create(title=f'Rendimiento Gallery {suffix}')
    lines = []
    for index in range(count):
        color = GlobalColor.objects.create(
            name=f'Color {suffix}-{index}', slug=f'color-perf-{suffix}-{index}', hex_code='#112233', is_active=True,
        )
        size = GlobalSize.objects.create(
            label=f'Talla {suffix}-{index}', slug=f'talla-perf-{suffix}-{index}', cm=f'{index + 1}cm', is_active=True,
        )
        peluch = Peluch.objects.create(
            title=f'Peluche {suffix}-{index}', slug=f'peluche-perf-{suffix}-{index}', category=category,
            lead_description='Catálogo para validación', gallery=library, is_active=True,
            has_huella=with_customizations, has_audio=with_customizations,
        )
        peluch.available_colors.add(color)
        PeluchSizePrice.objects.create(peluch=peluch, size=size, price=90000, is_available=True)
        lines.append(_base_item(peluch.id, size.id, color.id))
    return lines


def _cart_lines_with_signed_media(count, uploaded_by):
    """Prepare all media before the query budget begins."""
    lines = _cart_lines(count, with_customizations=True)
    for index, line in enumerate(lines):
        if index % 2 == 0:
            media = PersonalizationMedia.objects.create(
                uploaded_by=uploaded_by,
                media_type=PersonalizationMedia.MediaType.HUELLA_IMAGE,
                file=f'personalizations/query-budget-{index}.jpg',
                file_size_kb=100,
            )
            lines[index] = {
                **line,
                'has_huella': True,
                'huella_type': OrderItem.HuellaType.IMAGE,
                'huella_media_id': media.pk,
                'huella_media_token': issue_media_token(media),
            }
        else:
            media = PersonalizationMedia.objects.create(
                uploaded_by=uploaded_by,
                media_type=PersonalizationMedia.MediaType.AUDIO,
                file=f'personalizations/query-budget-{index}.mp3',
                file_size_kb=100,
                duration_sec=4,
            )
            lines[index] = {
                **line,
                'has_audio': True,
                'audio_media_id': media.pk,
                'audio_media_token': issue_media_token(media),
            }
    return lines


def _validation_select_count(items):
    serializer = OrderCreateSerializer(data=_order_payload(items))
    with CaptureQueriesContext(connection) as context:
        assert serializer.is_valid(), serializer.errors
    return sum(query['sql'].lstrip().upper().startswith('SELECT') for query in context.captured_queries)


def _numeric_cart_line(line, representation):
    values = {
        'string': (str, str, str, str),
        'float': (float, float, float, float),
        'decimal_string': (
            lambda value: f'{value}.0',
            lambda value: f'{value}.0',
            lambda value: f'{value}.0',
            lambda value: f'{value}.0',
        ),
    }[representation]
    return {
        **line,
        'peluch_id': values[0](line['peluch_id']),
        'size_id': values[1](line['size_id']),
        'color_id': values[2](line['color_id']),
        'quantity': values[3](2),
    }


# ---------------------------------------------------------------------------
# OrderItemCreateSerializer — peluch validation
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_order_item_rejects_nonexistent_peluch(size, color):
    """Verify order item rejects nonexistent peluch."""
    data = _base_item(99999, size.id, color.id)
    ser = OrderItemCreateSerializer(data=data)
    assert not ser.is_valid()
    assert 'peluch_id' in str(ser.errors)


@pytest.mark.django_db
def test_order_item_rejects_inactive_size(peluch, color):
    """Verify order item rejects inactive size."""
    data = _base_item(peluch.id, 99998, color.id)
    ser = OrderItemCreateSerializer(data=data)
    assert not ser.is_valid()
    assert 'size_id' in str(ser.errors)


@pytest.mark.django_db
def test_order_item_rejects_inactive_color(peluch_with_price, size):
    """Verify order item rejects inactive color."""
    inactive = GlobalColor.objects.create(name='Morado', slug='morado-ser2', hex_code='#800080', is_active=False)
    data = _base_item(peluch_with_price.id, size.id, inactive.id)
    ser = OrderItemCreateSerializer(data=data)
    assert not ser.is_valid()
    assert 'color_id' in str(ser.errors)


@pytest.mark.django_db
def test_order_item_rejects_color_not_available_for_peluch(peluch_with_price, size, db):
    """Verify order item rejects color not available for peluch."""
    other_color = GlobalColor.objects.create(name='Verde', slug='verde-ser', hex_code='#00FF00', is_active=True)
    data = _base_item(peluch_with_price.id, size.id, other_color.id)
    ser = OrderItemCreateSerializer(data=data)
    assert not ser.is_valid()
    assert 'color_id' in str(ser.errors)


@pytest.mark.django_db
def test_order_item_rejects_unavailable_size_price(peluch, color, size):
    """Verify order item rejects unavailable size price."""
    PeluchSizePrice.objects.create(peluch=peluch, size=size, price=80000, is_available=False)
    data = _base_item(peluch.id, size.id, color.id)
    ser = OrderItemCreateSerializer(data=data)
    assert not ser.is_valid()
    assert 'size_id' in str(ser.errors)


@pytest.mark.django_db
def test_order_item_rejects_huella_on_peluch_without_huella(peluch_with_price, size, color):
    """Verify order item rejects huella on peluch without huella."""
    data = {**_base_item(peluch_with_price.id, size.id, color.id), 'has_huella': True, 'huella_type': 'name'}
    ser = OrderItemCreateSerializer(data=data)
    assert not ser.is_valid()
    assert 'has_huella' in str(ser.errors)


@pytest.mark.django_db
def test_order_item_rejects_image_huella_without_media(huella_peluch_with_price, size, color):
    """Verify order item rejects image huella without media."""
    data = {
        **_base_item(huella_peluch_with_price.id, size.id, color.id),
        'has_huella': True,
        'huella_type': OrderItem.HuellaType.IMAGE,
    }
    ser = OrderItemCreateSerializer(data=data)
    assert not ser.is_valid()
    assert 'huella_media_id' in str(ser.errors)


@pytest.mark.django_db
def test_order_item_rejects_image_huella_with_nonexistent_media(huella_peluch_with_price, size, color):
    """Verify order item rejects image huella with nonexistent media."""
    data = {
        **_base_item(huella_peluch_with_price.id, size.id, color.id),
        'has_huella': True,
        'huella_type': OrderItem.HuellaType.IMAGE,
        'huella_media_id': 99999,
    }
    ser = OrderItemCreateSerializer(data=data)
    assert not ser.is_valid()
    assert 'huella_media_id' in str(ser.errors)


@pytest.mark.django_db
def test_order_item_rejects_audio_on_peluch_without_audio(peluch_with_price, size, color):
    """Verify order item rejects audio on peluch without audio."""
    data = {**_base_item(peluch_with_price.id, size.id, color.id), 'has_audio': True}
    ser = OrderItemCreateSerializer(data=data)
    assert not ser.is_valid()
    assert 'has_audio' in str(ser.errors)


@pytest.mark.django_db
def test_order_item_rejects_audio_without_media(huella_peluch_with_price, size, color):
    """Verify order item rejects audio without media."""
    data = {**_base_item(huella_peluch_with_price.id, size.id, color.id), 'has_audio': True}
    ser = OrderItemCreateSerializer(data=data)
    assert not ser.is_valid()
    assert 'audio_media_id' in str(ser.errors)


@pytest.mark.django_db
def test_order_item_rejects_audio_with_nonexistent_media(huella_peluch_with_price, size, color):
    """Verify order item rejects audio with nonexistent media."""
    data = {
        **_base_item(huella_peluch_with_price.id, size.id, color.id),
        'has_audio': True,
        'audio_media_id': 99999,
    }
    ser = OrderItemCreateSerializer(data=data)
    assert not ser.is_valid()
    assert 'audio_media_id' in str(ser.errors)


@pytest.mark.django_db
def test_order_item_valid_data_passes(peluch_with_price, size, color):
    """Verify order item valid data passes."""
    data = _base_item(peluch_with_price.id, size.id, color.id)
    ser = OrderItemCreateSerializer(data=data)
    assert ser.is_valid(), ser.errors
    assert ser.validated_data['peluch'] == peluch_with_price


# ---------------------------------------------------------------------------
# OrderCreateSerializer
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_order_create_requires_at_least_one_item():
    """Verify order create requires at least one item."""
    data = {
        'customer_name': 'Test',
        'customer_email': 'test@example.com',
        'address': 'Calle 1',
        'city': 'Bogotá',
        'department': 'Cundinamarca',
        'items': [],
    }
    ser = OrderCreateSerializer(data=data)
    assert not ser.is_valid()
    assert 'items' in str(ser.errors)


@pytest.mark.django_db
def test_order_create_validation_has_constant_read_budget_for_fifty_lines():
    """Falla si el carrito vuelve a leer catálogo una vez por cada línea validada."""
    one_line_selects = _validation_select_count(_cart_lines(1))
    fifty_line_selects = _validation_select_count(_cart_lines(50))

    assert one_line_selects == fifty_line_selects
    assert fifty_line_selects <= 6


@pytest.mark.django_db
@pytest.mark.parametrize(('line_count', 'max_selects'), [(101, 12), (201, 18)])
def test_order_create_validation_bounds_reads_per_hundred_lines(line_count, max_selects):
    """Falla si una línea posterior al primer grupo reintroduce consultas individuales."""
    select_count = _validation_select_count(_cart_lines(line_count))

    assert select_count <= max_selects


@pytest.mark.django_db
def test_order_create_validation_bounds_reads_with_personalization_media(existing_user):
    """Falla si cincuenta capacidades firmadas vuelven la validación de media N+1."""
    lines = _cart_lines_with_signed_media(50, existing_user)

    serializer = OrderCreateSerializer(data=_order_payload(lines))
    with CaptureQueriesContext(connection) as context:
        assert serializer.is_valid(), serializer.errors
    select_count = sum(query['sql'].lstrip().upper().startswith('SELECT') for query in context.captured_queries)

    assert select_count <= 6
    assert serializer.validated_data['items'][0]['huella_media'].media_type == PersonalizationMedia.MediaType.HUELLA_IMAGE
    assert serializer.validated_data['items'][1]['audio_media'].media_type == PersonalizationMedia.MediaType.AUDIO


@pytest.mark.django_db
def test_order_create_rejects_foreign_huella_without_capability(huella_peluch_with_price, size, color, huella_image):
    """Falla si conocer el id de una huella ajena vuelve a autorizarla."""
    payload = _order_payload([{
        **_base_item(huella_peluch_with_price.id, size.id, color.id),
        'has_huella': True,
        'huella_type': OrderItem.HuellaType.IMAGE,
        'huella_media_id': huella_image.id,
    }])

    serializer = OrderCreateSerializer(data=payload, context={'request': APIRequestFactory().post('/')})

    assert not serializer.is_valid()
    error = serializer.errors['items'][0]['huella_media_id'][0]
    assert error.code == 'media_access_required'
    assert str(error) == 'Vuelve a subir la imagen de huella de este peluche para completar tu pedido.'


@pytest.mark.django_db
def test_order_create_accepts_huella_with_signed_capability(huella_peluch_with_price, size, color, huella_image):
    """Falla si una capacidad firmada para la huella deja de conservar la referencia legítima."""
    payload = _order_payload([{
        **_base_item(huella_peluch_with_price.id, size.id, color.id),
        'has_huella': True,
        'huella_type': OrderItem.HuellaType.IMAGE,
        'huella_media_id': huella_image.id,
        'huella_media_token': issue_media_token(huella_image),
    }])

    serializer = OrderCreateSerializer(data=payload, context={'request': APIRequestFactory().post('/')})

    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data['items'][0]['huella_media'].pk == huella_image.pk


@pytest.mark.django_db
def test_order_create_accepts_huella_from_authenticated_uploader(huella_peluch_with_price, size, color, huella_image):
    """Falla si el uploader autenticado pierde acceso a su propia huella sin token."""
    request = APIRequestFactory().post('/')
    request.user = huella_image.uploaded_by
    payload = _order_payload([{
        **_base_item(huella_peluch_with_price.id, size.id, color.id),
        'has_huella': True,
        'huella_type': OrderItem.HuellaType.IMAGE,
        'huella_media_id': huella_image.id,
    }])

    serializer = OrderCreateSerializer(data=payload, context={'request': request})

    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data['items'][0]['huella_media'].pk == huella_image.pk


@pytest.mark.django_db
@pytest.mark.parametrize(
    'foreign_token',
    [
        pytest.param('other_huella', id='other-file'),
        pytest.param('audio', id='other-media-type'),
        pytest.param('order', id='order-capability'),
        pytest.param('tampered', id='tampered'),
    ],
)
def test_order_create_rejects_huella_with_cross_scope_token(
    huella_peluch_with_price, size, color, huella_image, audio_media, foreign_token,
):
    """Falla si una firma de otro recurso o propósito autoriza una huella ajena."""
    other_huella = PersonalizationMedia.objects.create(
        media_type=PersonalizationMedia.MediaType.HUELLA_IMAGE,
        file='personalizations/2026/01/other.jpg', file_size_kb=100,
    )
    token_by_case = {
        'other_huella': issue_media_token(other_huella),
        'audio': issue_media_token(audio_media),
        'order': signing.dumps({'order_id': 123}, salt=ORDER_ACCESS_SALT),
        'tampered': f'{issue_media_token(huella_image)}x',
    }
    payload = _order_payload([{
        **_base_item(huella_peluch_with_price.id, size.id, color.id),
        'has_huella': True,
        'huella_type': OrderItem.HuellaType.IMAGE,
        'huella_media_id': huella_image.id,
        'huella_media_token': token_by_case[foreign_token],
    }])

    serializer = OrderCreateSerializer(data=payload, context={'request': APIRequestFactory().post('/')})

    assert not serializer.is_valid()
    assert serializer.errors['items'][0]['huella_media_id'][0].code == 'media_access_required'


@pytest.mark.django_db
def test_order_create_rejects_foreign_audio_without_capability(
    huella_peluch_with_price, size, color, audio_media,
):
    """Falla si conocer el id de un audio ajeno vuelve a autorizarlo sin capacidad."""
    payload = _order_payload([{
        **_base_item(huella_peluch_with_price.id, size.id, color.id),
        'has_audio': True,
        'audio_media_id': audio_media.id,
    }])

    serializer = OrderCreateSerializer(data=payload, context={'request': APIRequestFactory().post('/')})

    assert not serializer.is_valid()
    assert serializer.errors['items'][0]['audio_media_id'][0].code == 'media_access_required'


@pytest.mark.django_db
def test_order_create_does_not_use_customer_email_as_media_identity(
    huella_peluch_with_price, size, color, huella_image,
):
    """Falla si el email enviado por checkout suplanta al uploader real de una huella."""
    payload = _order_payload([{
        **_base_item(huella_peluch_with_price.id, size.id, color.id),
        'has_huella': True,
        'huella_type': OrderItem.HuellaType.IMAGE,
        'huella_media_id': huella_image.id,
    }])
    payload['customer_email'] = huella_image.uploaded_by.email

    serializer = OrderCreateSerializer(data=payload, context={'request': APIRequestFactory().post('/')})

    assert not serializer.is_valid()
    assert serializer.errors['items'][0]['huella_media_id'][0].code == 'media_access_required'


@pytest.mark.django_db
def test_order_create_reuses_signed_huella_capability(huella_peluch_with_price, size, color, huella_image):
    """Falla si una capacidad legítima se consume al primer intento de checkout."""
    payload = _order_payload([{
        **_base_item(huella_peluch_with_price.id, size.id, color.id),
        'has_huella': True,
        'huella_type': OrderItem.HuellaType.IMAGE,
        'huella_media_id': huella_image.id,
        'huella_media_token': issue_media_token(huella_image),
    }])
    first = OrderCreateSerializer(data=payload, context={'request': APIRequestFactory().post('/')})
    repeated = OrderCreateSerializer(data=payload, context={'request': APIRequestFactory().post('/')})

    assert first.is_valid(), first.errors
    assert repeated.is_valid(), repeated.errors


@pytest.mark.django_db
def test_order_create_validation_keeps_each_catalog_pair_on_its_line():
    """Falla si un mapa bulk cruza producto, talla o color entre líneas de pedido."""
    lines = _cart_lines(2)
    serializer = OrderCreateSerializer(data=_order_payload(lines))

    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data['items'][0]['peluch'].pk == lines[0]['peluch_id']
    assert serializer.validated_data['items'][0]['size'].pk == lines[0]['size_id']
    assert serializer.validated_data['items'][0]['color'].pk == lines[0]['color_id']
    assert serializer.validated_data['items'][1]['peluch'].pk == lines[1]['peluch_id']
    assert serializer.validated_data['items'][1]['size'].pk == lines[1]['size_id']
    assert serializer.validated_data['items'][1]['color'].pk == lines[1]['color_id']


@pytest.mark.django_db
def test_order_create_validation_preserves_indexed_errors_across_mixed_failures():
    """Falla si la preparación bulk reemplaza un error tipado o el error de disponibilidad vecino."""
    lines = _cart_lines(2)
    PeluchSizePrice.objects.filter(peluch_id=lines[1]['peluch_id'], size_id=lines[1]['size_id']).update(is_available=False)
    lines[0] = {**lines[0], 'peluch_id': 'invalid'}
    serializer = OrderCreateSerializer(data=_order_payload(lines))

    assert not serializer.is_valid()
    assert str(serializer.errors['items'][0]['peluch_id'][0]) == 'A valid integer is required.'
    assert str(serializer.errors['items'][1]['size_id'][0]) == 'Este tamaño no está disponible para este peluche.'


@pytest.mark.django_db
def test_order_create_validation_keeps_the_error_index_after_one_hundred_lines():
    """Falla si el segundo grupo atribuye un color no disponible a otra línea del carrito."""
    lines = _cart_lines(101)
    unavailable_color = GlobalColor.objects.create(
        name='No asociada', slug='no-asociada-perf', hex_code='#445566', is_active=True,
    )
    lines[100] = {**lines[100], 'color_id': unavailable_color.id}
    serializer = OrderCreateSerializer(data=_order_payload(lines))

    assert not serializer.is_valid()
    assert str(serializer.errors['items'][100]['color_id'][0]) == 'Este color no está disponible para este peluche.'


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('inactive_model', 'field_name', 'message'),
    [
        ('peluch', 'peluch_id', 'Peluche no encontrado.'),
        ('size', 'size_id', 'Tamaño no válido.'),
        ('color', 'color_id', 'Color no válido.'),
    ],
)
def test_order_create_validation_rejects_each_inactive_catalog_entity(inactive_model, field_name, message):
    """Falla si los filtros bulk aceptan o etiquetan mal una entidad inactiva."""
    line = _cart_lines(1)[0]
    model = {'peluch': Peluch, 'size': GlobalSize, 'color': GlobalColor}[inactive_model]
    model.objects.filter(pk=line[field_name]).update(is_active=False)
    serializer = OrderCreateSerializer(data=_order_payload([line]))

    assert not serializer.is_valid()
    assert str(serializer.errors['items'][0][field_name][0]) == message


@pytest.mark.django_db
def test_order_create_validation_rejects_audio_as_an_image_huella(audio_media):
    """Falla si el índice bulk de media deja pasar audio como imagen de huella."""
    line = _cart_lines(1, with_customizations=True)[0]
    line = {
        **line,
        'has_huella': True,
        'huella_type': OrderItem.HuellaType.IMAGE,
        'huella_media_id': audio_media.id,
    }
    serializer = OrderCreateSerializer(data=_order_payload([line]))

    assert not serializer.is_valid()
    assert str(serializer.errors['items'][0]['huella_media_id'][0]) == 'Imagen de huella no encontrada.'


@pytest.mark.django_db
@pytest.mark.parametrize('representation', ['string', 'float', 'decimal_string'])
def test_order_create_validation_preserves_drf_numeric_coercion(representation):
    """Falla si los lookups bulk dejan de aceptar una representación numérica válida de DRF."""
    line = _cart_lines(1)[0]
    numeric_line = _numeric_cart_line(line, representation)
    serializer = OrderCreateSerializer(data=_order_payload([numeric_line]))

    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data['items'][0]['peluch_id'] == line['peluch_id']
    assert serializer.validated_data['items'][0]['size_id'] == line['size_id']
    assert serializer.validated_data['items'][0]['color_id'] == line['color_id']
    assert serializer.validated_data['items'][0]['quantity'] == 2


# ---------------------------------------------------------------------------
# OrderStatusUpdateSerializer
# ---------------------------------------------------------------------------

def test_order_status_update_rejects_invalid_status():
    """Verify order status update rejects invalid status."""
    ser = OrderStatusUpdateSerializer(data={'status': 'nonexistent_status'})
    assert not ser.is_valid()
    assert 'status' in ser.errors


def test_order_status_update_accepts_valid_status():
    """Verify order status update accepts valid status."""
    ser = OrderStatusUpdateSerializer(data={'status': Order.Status.IN_PRODUCTION})
    assert ser.is_valid(), ser.errors


# ---------------------------------------------------------------------------
# OrderTrackingUpdateSerializer
# ---------------------------------------------------------------------------

def test_order_tracking_update_requires_tracking_number():
    """Verify order tracking update requires tracking number."""
    ser = OrderTrackingUpdateSerializer(data={})
    assert not ser.is_valid()
    assert 'tracking_number' in ser.errors


def test_order_tracking_update_accepts_valid_data():
    """Verify order tracking update accepts valid data."""
    ser = OrderTrackingUpdateSerializer(data={'tracking_number': 'TRK-001', 'shipping_carrier': 'Servientrega'})
    assert ser.is_valid(), ser.errors


# ---------------------------------------------------------------------------
# OrderItemReadSerializer — personalization media exposure
# ---------------------------------------------------------------------------

@pytest.fixture
def read_order(db):
    """Create an order for read serializer tests."""
    return Order.objects.create(
        customer_email='read@example.com',
        customer_name='Read Tester',
        address='Calle 1',
        city='Bogotá',
        department='Cundinamarca',
        total_amount=90000,
        deposit_amount=45000,
        balance_amount=45000,
    )


@pytest.mark.django_db
def test_order_item_read_exposes_audio_media_url(read_order, peluch_with_price, size, color, audio_media):
    """Verify order item read exposes audio media url."""
    item = OrderItem.objects.create(
        order=read_order, peluch=peluch_with_price, size=size, color=color,
        quantity=1, unit_price=90000, has_audio=True, audio_media=audio_media,
        personalization_cost=20000,
    )
    request = APIRequestFactory().get('/')
    data = OrderItemReadSerializer(item, context={'request': request}).data
    assert data['audio_media_url'].endswith('/media/personalizations/2026/01/test.mp3')


@pytest.mark.django_db
def test_order_item_read_exposes_audio_duration(read_order, peluch_with_price, size, color, audio_media):
    """Verify order item read exposes audio duration."""
    item = OrderItem.objects.create(
        order=read_order, peluch=peluch_with_price, size=size, color=color,
        quantity=1, unit_price=90000, has_audio=True, audio_media=audio_media,
    )
    data = OrderItemReadSerializer(item, context={'request': APIRequestFactory().get('/')}).data
    assert data['audio_duration_sec'] == 5.0


@pytest.mark.django_db
def test_order_item_read_exposes_audio_size_kb(read_order, peluch_with_price, size, color, audio_media):
    """Verify order item read exposes audio size kb."""
    item = OrderItem.objects.create(
        order=read_order, peluch=peluch_with_price, size=size, color=color,
        quantity=1, unit_price=90000, has_audio=True, audio_media=audio_media,
    )
    data = OrderItemReadSerializer(item, context={'request': APIRequestFactory().get('/')}).data
    assert data['audio_size_kb'] == 200


@pytest.mark.django_db
def test_order_item_read_exposes_huella_media_url(read_order, peluch_with_price, size, color, huella_image):
    """Verify order item read exposes huella media url."""
    item = OrderItem.objects.create(
        order=read_order, peluch=peluch_with_price, size=size, color=color,
        quantity=1, unit_price=90000, has_huella=True,
        huella_type=OrderItem.HuellaType.IMAGE, huella_media=huella_image,
    )
    data = OrderItemReadSerializer(item, context={'request': APIRequestFactory().get('/')}).data
    assert data['huella_media_url'].endswith('/media/personalizations/2026/01/test.jpg')


@pytest.mark.django_db
def test_order_item_read_audio_fields_are_null_without_media(read_order, peluch_with_price, size, color):
    """Verify order item read audio fields are null without media."""
    item = OrderItem.objects.create(
        order=read_order, peluch=peluch_with_price, size=size, color=color,
        quantity=1, unit_price=90000,
    )
    data = OrderItemReadSerializer(item, context={'request': APIRequestFactory().get('/')}).data
    assert data['audio_media_url'] is None
    assert data['audio_duration_sec'] is None
    assert data['audio_size_kb'] is None
    assert data['huella_media_url'] is None


@pytest.mark.django_db
def test_order_item_read_returns_relative_url_without_request_context(read_order, peluch_with_price, size, color, audio_media):
    """Verify order item read returns relative url without request context."""
    item = OrderItem.objects.create(
        order=read_order, peluch=peluch_with_price, size=size, color=color,
        quantity=1, unit_price=90000, has_audio=True, audio_media=audio_media,
    )
    data = OrderItemReadSerializer(item).data
    assert data['audio_media_url'] == '/media/personalizations/2026/01/test.mp3'


@pytest.mark.django_db
def test_order_item_read_returns_null_for_deleted_size(read_order, peluch_with_price, size, color):
    """Verify order item read returns null for deleted size."""
    item = OrderItem.objects.create(
        order=read_order, peluch=peluch_with_price, size=size, color=color,
        quantity=1, unit_price=90000,
    )
    item.size = None
    item.save()

    data = OrderItemReadSerializer(item).data

    assert data['size'] is None


@pytest.mark.django_db
def test_order_item_read_returns_null_for_deleted_color(read_order, peluch_with_price, size, color):
    """Verify order item read returns null for deleted color."""
    item = OrderItem.objects.create(
        order=read_order, peluch=peluch_with_price, size=size, color=color,
        quantity=1, unit_price=90000,
    )
    item.color = None
    item.save()

    data = OrderItemReadSerializer(item).data

    assert data['color'] is None

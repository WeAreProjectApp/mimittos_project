"""Test order API behavior."""

from datetime import datetime, timedelta
from datetime import timezone as datetime_timezone
from unittest.mock import patch

import pytest
from django.core import signing
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django_attachments.models import Library
from freezegun import freeze_time

from base_feature_app.models import (
    Category,
    GlobalColor,
    GlobalSize,
    Order,
    OrderItem,
    OrderStatusHistory,
    Peluch,
    PeluchSizePrice,
    PersonalizationMedia,
)
from base_feature_app.services.order_access_service import (
    ORDER_ACCESS_SALT,
    OrderAccessService,
)
from base_feature_app.tests.factories import (
    GlobalColorFactory,
    GlobalSizeFactory,
    PeluchFactory,
)

MAX_ORDER_READ_QUERIES = 4


def _order_access_headers(order):
    return {'HTTP_X_ORDER_ACCESS': OrderAccessService.grant_access(order)['order_access_token']}


def _create_read_items(order, count, *, include_media=False):
    """Create distinct item relations before measuring an order read endpoint."""
    created_items = []
    start_index = order.items.count()
    for item_index in range(start_index, start_index + count):
        item_peluch = PeluchFactory()
        item_size = GlobalSizeFactory()
        item_color = GlobalColorFactory()
        item_kwargs = {
            'order': order,
            'peluch': item_peluch,
            'size': item_size,
            'color': item_color,
            'quantity': 1,
            'unit_price': 80000,
        }
        if include_media:
            item_kwargs['huella_media'] = PersonalizationMedia.objects.create(
                uploaded_by=order.customer,
                media_type=PersonalizationMedia.MediaType.HUELLA_IMAGE,
                file=f'personalizations/test-huella-{order.pk}-{item_index}.jpg',
                file_size_kb=120,
            )
            item_kwargs['audio_media'] = PersonalizationMedia.objects.create(
                uploaded_by=order.customer,
                media_type=PersonalizationMedia.MediaType.AUDIO,
                file=f'personalizations/test-audio-{order.pk}-{item_index}.mp3',
                duration_sec=6.5,
                file_size_kb=240,
            )
        created_items.append(OrderItem.objects.create(**item_kwargs))
    return created_items


def _create_status_histories(order, count, *, start_index=0):
    """Create histories with distinct unhashed authors outside query measurement."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    authors = User.objects.bulk_create([
        User(email=f'history-author-{author_index}@example.com')
        for author_index in range(start_index, start_index + count)
    ])
    OrderStatusHistory.objects.bulk_create([
        OrderStatusHistory(
            order=order,
            previous_status=Order.Status.PENDING_PAYMENT,
            new_status=Order.Status.PAYMENT_CONFIRMED,
            changed_by=author,
        )
        for author in authors
    ])
    return {author.email for author in authors}

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def category(db):
    """Provide a category fixture."""
    return Category.objects.create(name='Osos', slug='osos', is_active=True)


@pytest.fixture
def size(db):
    """Provide a size fixture."""
    return GlobalSize.objects.create(label='Pequeño', slug='pequeno', cm='20cm')


@pytest.fixture
def color(db):
    """Provide a color fixture."""
    return GlobalColor.objects.create(name='Rosa', slug='rosa', hex_code='#FF69B4')


@pytest.fixture
def peluch(db, category, color):
    """Provide a peluch fixture."""
    library = Library.objects.create(title='Peluch Gallery')
    p = Peluch.objects.create(
        title='Osito',
        slug='osito',
        category=category,
        lead_description='Adorable',
        description='Descripción completa',
        gallery=library,
    )
    p.available_colors.add(color)
    return p


@pytest.fixture
def peluch_with_price(peluch, size):
    """Provide a priced peluch fixture."""
    PeluchSizePrice.objects.create(peluch=peluch, size=size, price=80000)
    return peluch


@pytest.fixture
def order_data(peluch_with_price, size, color):
    """Provide valid order request data."""
    return {
        'customer_name': 'Ana García',
        'customer_email': 'ana@example.com',
        'customer_phone': '3001234567',
        'address': 'Calle 123',
        'city': 'Bogotá',
        'department': 'Cundinamarca',
        'items': [
            {
                'peluch_id': peluch_with_price.id,
                'size_id': size.id,
                'color_id': color.id,
                'quantity': 1,
                'has_huella': False,
                'has_corazon': False,
                'has_audio': False,
            }
        ],
    }


def _order_with_item(customer, peluch, size, color, number, created_at=None):
    order = Order.objects.create(
        order_number=number,
        customer=customer,
        customer_email=customer.email,
        customer_name='Cliente de pedidos',
        address='Calle 123',
        city='Bogotá',
        department='Cundinamarca',
        total_amount=80000,
        deposit_amount=40000,
        balance_amount=40000,
    )
    if created_at is not None:
        Order.objects.filter(pk=order.pk).update(created_at=created_at)
        order.refresh_from_db()
    OrderItem.objects.create(
        order=order, peluch=peluch, size=size, color=color, quantity=1, unit_price=80000,
    )
    return order


def _owned_orders_with_items(customer, peluch, size, color, count, prefix):
    return [
        _order_with_item(customer, peluch, size, color, f'{prefix}-{index:04d}')
        for index in range(count)
    ]


def _my_orders_select_count(client):
    with CaptureQueriesContext(connection) as context:
        response = client.get('/api/orders/my/')
    select_count = sum(query['sql'].lstrip().upper().startswith('SELECT') for query in context.captured_queries)
    return response, select_count


@pytest.fixture
def existing_order(db, existing_user):
    """Create an existing order."""
    return Order.objects.create(
        order_number='MMT-20260420-TEST',
        customer=existing_user,
        customer_email=existing_user.email,
        customer_name='Test User',
        address='Calle 1',
        city='Bogotá',
        department='Cundinamarca',
        total_amount=80000,
        deposit_amount=40000,
        balance_amount=40000,
        status=Order.Status.PENDING_PAYMENT,
    )


@pytest.fixture
def existing_user(db):
    """Create an existing customer."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.create_user(email='user@example.com', password='pass')


@pytest.fixture
def admin_user(db):
    """Create an administrative user."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    u = User.objects.create_user(email='admin@example.com', password='pass')
    u.is_staff = True
    u.save(update_fields=['is_staff'])
    return u


@pytest.fixture
def authenticated_client(existing_user):
    """Provide an authenticated API client."""
    from rest_framework.test import APIClient
    client = APIClient()
    client.force_authenticate(user=existing_user)
    return client


@pytest.fixture
def admin_client(admin_user):
    """Provide an administrative API client."""
    from rest_framework.test import APIClient
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def anon_client():
    """Provide an anonymous API client."""
    from rest_framework.test import APIClient
    return APIClient()


# ---------------------------------------------------------------------------
# POST /api/orders/ — create order
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch('base_feature_app.views.order_views.NotificationService.notify_new_order_admin', return_value=True)
def test_create_order_returns_201_with_valid_data(mock_notify, anon_client, order_data):
    """Verify create order returns 201 with valid data."""
    response = anon_client.post('/api/orders/', order_data, format='json')
    assert response.status_code == 201
    assert 'order_number' in response.data


@pytest.mark.django_db
@patch('base_feature_app.views.order_views.NotificationService.notify_new_order_admin', return_value=True)
def test_create_order_stores_order_in_database(mock_notify, anon_client, order_data):
    """Verify create order stores order in database."""
    anon_client.post('/api/orders/', order_data, format='json')
    assert Order.objects.filter(customer_email='ana@example.com').exists()


@pytest.mark.django_db
@patch('base_feature_app.views.order_views.NotificationService.notify_new_order_admin', return_value=True)
def test_create_order_returns_amounts_in_response(mock_notify, anon_client, order_data):
    """Verify create order returns amounts in response."""
    response = anon_client.post('/api/orders/', order_data, format='json')
    assert response.data['total_amount'] == 80000
    assert response.data['deposit_amount'] == 40000
    assert response.data['balance_amount'] == 40000


@pytest.mark.django_db
def test_create_order_returns_400_for_missing_fields(anon_client):
    """Verify create order returns 400 for missing fields."""
    response = anon_client.post('/api/orders/', {}, format='json')
    assert response.status_code == 400


@pytest.mark.django_db
def test_create_order_returns_400_for_empty_items(anon_client, order_data):
    """Verify create order returns 400 for empty items."""
    order_data['items'] = []
    response = anon_client.post('/api/orders/', order_data, format='json')
    assert response.status_code == 400


@pytest.mark.django_db
def test_create_order_returns_item_errors_without_creating_an_order_for_object_items(anon_client, order_data):
    """Falla si una forma JSON que no es lista escapa del ListSerializer como excepción."""
    order_data['items'] = order_data['items'][0]

    response = anon_client.post('/api/orders/', order_data, format='json')

    assert response.status_code == 400
    assert 'items' in response.data
    assert Order.objects.count() == 0


@pytest.mark.django_db
def test_create_order_rejects_foreign_huella_without_side_effects(
    anon_client, order_data, peluch_with_price, existing_user,
):
    """Falla si un 400 por huella ajena crea líneas o marca el archivo como usado."""
    peluch_with_price.has_huella = True
    peluch_with_price.save(update_fields=['has_huella'])
    media = PersonalizationMedia.objects.create(
        uploaded_by=existing_user,
        media_type=PersonalizationMedia.MediaType.HUELLA_IMAGE,
        file='personalizations/foreign-huella.jpg',
        file_size_kb=100,
        is_used=False,
    )
    order_data['items'][0].update({
        'has_huella': True,
        'huella_type': OrderItem.HuellaType.IMAGE,
        'huella_media_id': media.pk,
    })

    response = anon_client.post('/api/orders/', order_data, format='json')

    media.refresh_from_db()
    assert response.status_code == 400
    assert response.data['items'][0]['huella_media_id'][0].code == 'media_access_required'
    assert Order.objects.count() == 0
    assert OrderItem.objects.count() == 0
    assert media.is_used is False


@pytest.mark.django_db
@patch('base_feature_app.views.order_views.NotificationService.notify_new_order_admin', return_value=True)
@freeze_time('2026-10-02 10:00:00')
def test_create_order_returns_scoped_access_capability(mock_notify, anon_client, order_data):
    """Falla si una orden nueva deja de entregar una capacidad limitada a ese pedido."""
    response = anon_client.post('/api/orders/', order_data, format='json')
    assert response.status_code == 201
    order = Order.objects.get(order_number=response.data['order_number'])
    assert response.data['expires_at'] == '2026-11-01T10:00:00+00:00'
    assert signing.loads(response.data['order_access_token'], salt=ORDER_ACCESS_SALT) == {'order_id': order.pk}


# ---------------------------------------------------------------------------
# GET /api/orders/track/<order_number>/ — public tracking
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_track_order_returns_200_for_valid_order(anon_client, existing_order):
    """Falla si una capacidad válida deja de abrir el seguimiento de su pedido."""
    response = anon_client.get(f'/api/orders/track/{existing_order.order_number}/', **_order_access_headers(existing_order))
    assert response.status_code == 200
    assert response.data['order_number'] == existing_order.order_number


@pytest.mark.django_db
def test_track_order_hides_nonexistent_order_without_capability(anon_client):
    """Falla si un pedido inexistente revela una respuesta distinta a un acceso sin prueba."""
    response = anon_client.get('/api/orders/track/MMT-NOEXISTE-0000/')
    assert response.status_code == 403
    assert response.data['code'] == 'order_access_required'


@pytest.mark.django_db
def test_track_order_returns_status_in_response(anon_client, existing_order):
    """Verify track order returns status in response."""
    response = anon_client.get(f'/api/orders/track/{existing_order.order_number}/', **_order_access_headers(existing_order))
    assert 'status' in response.data


@pytest.mark.django_db
def test_track_order_requires_capability_for_existing_order(anon_client, existing_order):
    """Falla si conocer un número de pedido existente vuelve a exponer su seguimiento."""
    response = anon_client.get(f'/api/orders/track/{existing_order.order_number}/')

    assert response.status_code == 403
    assert response.data == {
        'code': 'order_access_required',
        'detail': 'Verifica tu correo para acceder a este pedido.',
    }


@pytest.mark.django_db
def test_track_order_query_budget_is_constant(
    anon_client, existing_order, settings, tmp_path,
):
    """Fails if tracking restores per-item relation queries for personalization media."""
    settings.MEDIA_ROOT = tmp_path
    _create_read_items(existing_order, 1, include_media=True)

    with CaptureQueriesContext(connection) as one_item_queries:
        one_item_response = anon_client.get(f'/api/orders/track/{existing_order.order_number}/', **_order_access_headers(existing_order))

    _create_read_items(existing_order, 49, include_media=True)
    with CaptureQueriesContext(connection) as fifty_item_queries:
        fifty_item_response = anon_client.get(f'/api/orders/track/{existing_order.order_number}/', **_order_access_headers(existing_order))

    assert one_item_response.status_code == 200
    assert fifty_item_response.status_code == 200
    assert len(one_item_response.data['items']) == 1
    assert len(fifty_item_response.data['items']) == 50
    assert len(one_item_queries) == len(fifty_item_queries)
    assert len(fifty_item_queries) <= MAX_ORDER_READ_QUERIES


@pytest.mark.django_db
def test_track_order_serializes_media_values(
    anon_client, existing_order, settings, tmp_path,
):
    """Fails if tracking loses concrete URL, duration, or size values for media."""
    settings.MEDIA_ROOT = tmp_path
    created_item = _create_read_items(existing_order, 1, include_media=True)[0]

    response = anon_client.get(f'/api/orders/track/{existing_order.order_number}/', **_order_access_headers(existing_order))

    item = response.data['items'][0]
    assert response.status_code == 200
    assert item['huella_media_url'] == f'http://testserver{created_item.huella_media.file.url}'
    assert item['audio_media_url'] == f'http://testserver{created_item.audio_media.file.url}'
    assert item['audio_duration_sec'] == 6.5
    assert item['audio_size_kb'] == 240


@pytest.mark.django_db
def test_track_order_serializes_optional_item_relations(anon_client, existing_order, peluch):
    """Fails if optional item relations no longer retain their null JSON contract."""
    OrderItem.objects.create(
        order=existing_order,
        peluch=peluch,
        size=None,
        color=None,
        quantity=2,
        unit_price=80000,
        personalization_cost=5000,
    )

    response = anon_client.get(f'/api/orders/track/{existing_order.order_number}/', **_order_access_headers(existing_order))

    item = response.data['items'][0]
    assert response.status_code == 200
    assert item['size'] is None
    assert item['color'] is None
    assert item['huella_media_url'] is None
    assert item['audio_media_url'] is None
    assert item['line_total'] == 170000


@pytest.mark.django_db
def test_track_order_returns_null_payment_fields(anon_client, existing_order):
    """Fails if tracking no longer supports unpaid orders without a transaction."""
    response = anon_client.get(f'/api/orders/track/{existing_order.order_number}/', **_order_access_headers(existing_order))

    assert response.status_code == 200
    assert response.data['payment_status'] is None
    assert response.data['checkout_url'] is None


# ---------------------------------------------------------------------------
# GET /api/orders/my/ — authenticated customer orders
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_my_orders_returns_200_for_authenticated_user(authenticated_client, existing_order):
    """Verify my orders returns 200 for authenticated user."""
    response = authenticated_client.get('/api/orders/my/')
    assert response.status_code == 200
    assert len(response.data) == 1


@pytest.mark.django_db
def test_my_orders_returns_401_for_anonymous(anon_client):
    """Verify my orders returns 401 for anonymous."""
    response = anon_client.get('/api/orders/my/')
    assert response.status_code == 401


@pytest.mark.django_db
def test_my_orders_only_returns_own_orders(authenticated_client, db, existing_user, admin_user):
    """GET /api/orders/my/ returns only orders belonging to the authenticated user, not other users."""
    Order.objects.create(
        order_number='MMT-20260420-ADMN',
        customer=admin_user,
        customer_email=admin_user.email,
        customer_name='Admin User',
        address='Calle 2',
        city='Medellín',
        department='Antioquia',
        total_amount=50000,
        deposit_amount=25000,
        balance_amount=25000,
    )
    response = authenticated_client.get('/api/orders/my/')
    assert response.status_code == 200
    assert len(response.data) == 0


@pytest.mark.django_db
def test_my_orders_has_constant_read_budget_for_fifty_orders_with_items(
    authenticated_client, existing_user, admin_user, peluch_with_price, size, color,
):
    """Falla si Mis pedidos vuelve a precargar artículos o peluches que no expone."""
    one_order = _owned_orders_with_items(existing_user, peluch_with_price, size, color, 1, 'MMT-ONE')
    one_response, one_selects = _my_orders_select_count(authenticated_client)
    from rest_framework.test import APIClient

    fifty_client = APIClient()
    fifty_client.force_authenticate(user=admin_user)
    fifty_orders = _owned_orders_with_items(admin_user, peluch_with_price, size, color, 50, 'MMT-FIFTY')
    fifty_response, fifty_selects = _my_orders_select_count(fifty_client)

    assert one_response.status_code == 200
    assert [row['order_number'] for row in one_response.data] == [one_order[0].order_number]
    assert one_selects == fifty_selects
    assert fifty_selects <= 1
    assert {row['order_number'] for row in fifty_response.data} == {order.order_number for order in fifty_orders}


@pytest.mark.django_db
def test_my_orders_keeps_own_orders_in_descending_creation_order(
    authenticated_client, existing_user, admin_user, peluch_with_price, size, color,
):
    """Falla si Mis pedidos pierde el filtro por cliente o el orden descendente de creación."""
    base_time = datetime(2026, 9, 24, 12, 0, tzinfo=datetime_timezone.utc)
    older = _order_with_item(
        existing_user, peluch_with_price, size, color, 'MMT-OWN-OLDER', base_time - timedelta(days=2),
    )
    newer = _order_with_item(
        existing_user, peluch_with_price, size, color, 'MMT-OWN-NEWER', base_time - timedelta(days=1),
    )
    _order_with_item(admin_user, peluch_with_price, size, color, 'MMT-OTHER-NEWER', base_time)

    response = authenticated_client.get('/api/orders/my/')

    assert response.status_code == 200
    assert [row['order_number'] for row in response.data] == [newer.order_number, older.order_number]
    assert set(response.data[0]) == {
        'id', 'order_number', 'customer_name', 'customer_email', 'city', 'department', 'status',
        'total_amount', 'deposit_amount', 'balance_amount', 'shipping_amount', 'discount_amount',
        'payment_mode', 'amount_paid_now', 'created_at',
    }
    assert response.data[0]['customer_email'] == existing_user.email
    assert response.data[0]['total_amount'] == 80000


# ---------------------------------------------------------------------------
# GET /api/orders/list/ — admin list
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_orders_list_returns_200_for_admin(admin_client, existing_order):
    """Verify orders list returns 200 for admin."""
    response = admin_client.get('/api/orders/list/')
    assert response.status_code == 200
    assert response.data['count'] == 1


@pytest.mark.django_db
def test_orders_list_returns_403_for_anonymous(anon_client):
    """Verify orders list returns 403 for anonymous."""
    response = anon_client.get('/api/orders/list/')
    assert response.status_code == 403


@pytest.mark.django_db
def test_orders_list_filters_by_status(admin_client, existing_order):
    """Verify orders list filters by status."""
    response = admin_client.get('/api/orders/list/?status=pending_payment')
    assert response.status_code == 200
    assert response.data['count'] == 1


@pytest.mark.django_db
def test_orders_list_filters_by_city(admin_client, existing_order):
    """Verify orders list filters by city."""
    response = admin_client.get('/api/orders/list/?city=Bogotá')
    assert response.status_code == 200
    assert response.data['count'] == 1


@pytest.mark.django_db
def test_orders_list_returns_empty_for_unmatched_city(admin_client, existing_order):
    """Verify orders list returns empty for unmatched city."""
    response = admin_client.get('/api/orders/list/?city=NoExiste')
    assert response.status_code == 200
    assert response.data['count'] == 0


# ---------------------------------------------------------------------------
# GET /api/orders/<order_number>/ — order detail
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_order_detail_returns_200_for_owner(authenticated_client, existing_order):
    """Verify order detail returns 200 for owner."""
    response = authenticated_client.get(f'/api/orders/{existing_order.order_number}/')
    assert response.status_code == 200
    assert response.data['order_number'] == existing_order.order_number


@pytest.mark.django_db
def test_order_detail_returns_200_for_admin(admin_client, existing_order):
    """Verify order detail returns 200 for admin."""
    response = admin_client.get(f'/api/orders/{existing_order.order_number}/')
    assert response.status_code == 200


@pytest.mark.django_db
def test_order_detail_returns_403_for_other_user(db, existing_order):
    """Verify order detail returns 403 for other user."""
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIClient
    User = get_user_model()
    other = User.objects.create_user(email='other@example.com', password='pass')
    client = APIClient()
    client.force_authenticate(user=other)
    response = client.get(f'/api/orders/{existing_order.order_number}/')
    assert response.status_code == 403


@pytest.mark.django_db
def test_order_detail_rejects_guest_capability(anon_client, existing_order):
    """Falla si una capacidad de seguimiento expone el historial completo del pedido."""
    response = anon_client.get(
        f'/api/orders/{existing_order.order_number}/', **_order_access_headers(existing_order),
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_order_detail_returns_404_for_nonexistent(admin_client):
    """Verify order detail returns 404 for nonexistent."""
    response = admin_client.get('/api/orders/MMT-NOEXISTE-0000/')
    assert response.status_code == 404


@pytest.mark.django_db
def test_order_detail_rejects_matching_email_without_customer_owner(db, existing_user):
    """Falla si igualar el email del visitante vuelve a autorizar el detalle privado."""
    from rest_framework.test import APIClient

    email_owned_order = Order.objects.create(
        customer=None,
        customer_email=existing_user.email,
        customer_name='Email Owner',
        address='Calle 3',
        city='Cali',
        department='Valle',
        total_amount=80000,
        deposit_amount=40000,
        balance_amount=40000,
    )
    client = APIClient()
    client.force_authenticate(user=existing_user)

    response = client.get(f'/api/orders/{email_owned_order.order_number}/')

    assert response.status_code == 403
    assert response.data['detail'] == 'No tienes permiso para ver este pedido.'


@pytest.mark.django_db
def test_order_detail_query_budget_is_constant(
    authenticated_client, existing_order, settings, tmp_path,
):
    """Fails if detail serialization restores per-item or status-history queries."""
    settings.MEDIA_ROOT = tmp_path
    _create_read_items(existing_order, 1, include_media=True)
    one_history_emails = _create_status_histories(existing_order, 1)

    with CaptureQueriesContext(connection) as one_item_queries:
        one_item_response = authenticated_client.get(f'/api/orders/{existing_order.order_number}/')

    _create_read_items(existing_order, 49, include_media=True)
    fifty_history_emails = one_history_emails | _create_status_histories(
        existing_order, 49, start_index=1,
    )
    with CaptureQueriesContext(connection) as fifty_item_queries:
        fifty_item_response = authenticated_client.get(f'/api/orders/{existing_order.order_number}/')

    assert (
        one_item_response.status_code,
        len(one_item_response.data['items']),
        len(one_item_response.data['status_history']),
    ) == (200, 1, 1)
    assert (
        fifty_item_response.status_code,
        len(fifty_item_response.data['items']),
        len(fifty_item_response.data['status_history']),
    ) == (200, 50, 50)
    assert {
        history['changed_by_email'] for history in one_item_response.data['status_history']
    } == one_history_emails
    assert {
        history['changed_by_email'] for history in fifty_item_response.data['status_history']
    } == fifty_history_emails
    assert len(one_item_queries) == len(fifty_item_queries) <= MAX_ORDER_READ_QUERIES


# ---------------------------------------------------------------------------
# PATCH /api/orders/<order_number>/status/ — update status (admin)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.NotificationService.notify_status_change')
def test_update_order_status_returns_200_for_admin(mock_notify, admin_client, existing_order):
    """Verify update order status returns 200 for admin."""
    payload = {'status': 'payment_confirmed', 'notes': 'Pago verificado'}
    response = admin_client.patch(f'/api/orders/{existing_order.order_number}/status/', payload)
    assert response.status_code == 200
    existing_order.refresh_from_db()
    assert existing_order.status == Order.Status.PAYMENT_CONFIRMED


@pytest.mark.django_db
def test_update_order_status_returns_403_for_anonymous(anon_client, existing_order):
    """Verify update order status returns 403 for anonymous."""
    response = anon_client.patch(f'/api/orders/{existing_order.order_number}/status/', {'status': 'payment_confirmed'})
    assert response.status_code == 403


@pytest.mark.django_db
def test_update_order_status_returns_400_for_invalid_status(admin_client, existing_order):
    """Verify update order status returns 400 for invalid status."""
    response = admin_client.patch(f'/api/orders/{existing_order.order_number}/status/', {'status': 'invalid_status'})
    assert response.status_code == 400


@pytest.mark.django_db
def test_update_order_status_returns_404_for_missing_order(admin_client):
    """Verify update order status returns 404 for missing order."""
    response = admin_client.patch('/api/orders/MMT-NOEXISTE-0000/status/', {'status': 'payment_confirmed'})
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/orders/<order_number>/tracking/ — update tracking (admin)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_update_order_tracking_stores_tracking_number(admin_client, existing_order):
    """Verify update order tracking stores tracking number."""
    payload = {'tracking_number': '123456', 'shipping_carrier': 'Servientrega'}
    response = admin_client.patch(f'/api/orders/{existing_order.order_number}/tracking/', payload)
    assert response.status_code == 200
    existing_order.refresh_from_db()
    assert existing_order.tracking_number == '123456'
    assert existing_order.shipping_carrier == 'Servientrega'


@pytest.mark.django_db
def test_update_order_tracking_returns_403_for_anonymous(anon_client, existing_order):
    """Verify update order tracking returns 403 for anonymous."""
    response = anon_client.patch(f'/api/orders/{existing_order.order_number}/tracking/', {'tracking_number': '123'})
    assert response.status_code == 403


@pytest.mark.django_db
def test_update_order_tracking_returns_404_for_missing_order(admin_client):
    """Verify update order tracking returns 404 for missing order."""
    response = admin_client.patch('/api/orders/MMT-NOEXISTE-0000/tracking/', {'tracking_number': '123'})
    assert response.status_code == 404

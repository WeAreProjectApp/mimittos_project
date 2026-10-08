"""Test order service behavior."""

from unittest.mock import patch

import pytest
from django.db import IntegrityError, connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django_attachments.models import Library

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
    WompiTransaction,
)
from base_feature_app.serializers.order import OrderCreateSerializer
from base_feature_app.services.order_service import OrderService

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
def size_l(db):
    """Provide a large size fixture."""
    return GlobalSize.objects.create(label='Grande', slug='grande', cm='40cm', sort_order=2)


@pytest.fixture
def peluch_per_size(peluch, size, size_l):
    """Provide prices for each peluch size."""
    PeluchSizePrice.objects.create(
        peluch=peluch, size=size, price=80000,
        deposit_percentage=30, full_payment_discount_pct=10,
        free_shipping=False, shipping_cost=5000,
    )
    PeluchSizePrice.objects.create(
        peluch=peluch, size=size_l, price=120000,
        deposit_percentage=50, full_payment_discount_pct=0,
        free_shipping=True, shipping_cost=0,
    )
    return peluch


def _order_data(peluch, *items):
    """items: (size, color, quantity) tuples. Returns a create_order payload dict."""
    return {
        'customer_name': 'Ana García',
        'customer_email': 'ana@example.com',
        'customer_phone': '3001234567',
        'address': 'Calle 123',
        'city': 'Bogotá',
        'department': 'Cundinamarca',
        'items': [
            {
                'peluch': peluch, 'size': sz, 'color': col, 'quantity': q,
                'has_huella': False, 'has_corazon': False, 'has_audio': False,
                'huella_media': None, 'audio_media': None,
            }
            for (sz, col, q) in items
        ],
    }


def _many_item_order_data(peluch, size, color, count):
    return {
        **_order_data(peluch),
        'items': [
            {
                'peluch': peluch, 'size': size, 'color': color, 'quantity': 1,
                'has_huella': False, 'has_corazon': False, 'has_audio': False,
                'huella_media': None, 'audio_media': None,
            }
            for _ in range(count)
        ],
    }


def _service_select_count(peluch, size, color, count):
    with CaptureQueriesContext(connection) as context:
        order = OrderService.create_order(_many_item_order_data(peluch, size, color, count))
    return order, sum(query['sql'].lstrip().upper().startswith('SELECT') for query in context.captured_queries)


def _serializer_order_payload(peluch, size, color):
    return {
        'customer_name': 'Ana García',
        'customer_email': 'ana@example.com',
        'customer_phone': '3001234567',
        'address': 'Calle 123',
        'city': 'Bogotá',
        'department': 'Cundinamarca',
        'items': [{
            'peluch_id': peluch.pk,
            'size_id': size.pk,
            'color_id': color.pk,
            'quantity': 1,
            'has_huella': False,
            'has_corazon': False,
            'has_audio': False,
        }],
    }


def _personalized_order_data(peluch, size, color, image, audio):
    return {
        **_many_item_order_data(peluch, size, color, 1),
        'items': [{
            'peluch': peluch, 'size': size, 'color': color, 'quantity': 1,
            'has_huella': True, 'huella_type': OrderItem.HuellaType.IMAGE,
            'huella_media': image, 'has_corazon': False, 'has_audio': True, 'audio_media': audio,
        }],
    }


@pytest.fixture
def base_order_data(peluch_with_price, size, color):
    """Provide valid base order data."""
    return {
        'customer_name': 'Ana García',
        'customer_email': 'ana@example.com',
        'customer_phone': '3001234567',
        'address': 'Calle 123',
        'city': 'Bogotá',
        'department': 'Cundinamarca',
        'items': [
            {
                'peluch': peluch_with_price,
                'size': size,
                'color': color,
                'quantity': 1,
                'has_huella': False,
                'has_corazon': False,
                'has_audio': False,
                'huella_media': None,
                'audio_media': None,
            }
        ],
    }


@pytest.fixture
def existing_order(db):
    """Create an existing order."""
    return Order.objects.create(
        order_number='MMT-20260420-TEST',
        customer_email='test@example.com',
        customer_name='Test User',
        address='Calle 1',
        city='Bogotá',
        department='Cundinamarca',
        total_amount=80000,
        deposit_amount=40000,
        balance_amount=40000,
        status=Order.Status.PENDING_PAYMENT,
    )


# ---------------------------------------------------------------------------
# generate_order_number
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_generate_order_number_has_mmt_prefix():
    """Verify generate order number has mmt prefix."""
    number = OrderService.generate_order_number()
    assert number.startswith('MMT-')


@pytest.mark.django_db
def test_generate_order_number_has_date_segment():
    """Verify generate order number has date segment."""
    number = OrderService.generate_order_number()
    parts = number.split('-')
    assert len(parts) == 3
    assert len(parts[1]) == 8  # YYYYMMDD


@pytest.mark.django_db
def test_generate_order_number_suffix_is_uppercase():
    """Verify generate order number suffix is uppercase."""
    number = OrderService.generate_order_number()
    suffix = number.split('-')[2]
    assert suffix == suffix.upper()


# ---------------------------------------------------------------------------
# calculate_deposit
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@override_settings(DEPOSIT_PERCENTAGE=50)
def test_calculate_deposit_returns_half_of_total():
    """Verify calculate deposit returns half of total."""
    result = OrderService.calculate_deposit(100000)
    assert result == 50000


@pytest.mark.django_db
def test_calculate_deposit_rounds_to_nearest_100():
    """Verify calculate deposit rounds to nearest 100."""
    result = OrderService.calculate_deposit(99999)
    assert result % 100 == 0


@pytest.mark.django_db
@override_settings(DEPOSIT_PERCENTAGE=30)
def test_calculate_deposit_uses_deposit_percentage_setting():
    """Verify calculate deposit uses deposit percentage setting."""
    result = OrderService.calculate_deposit(100000)
    assert result == 30000


# ---------------------------------------------------------------------------
# create_order
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_creates_order_in_database(mock_media, base_order_data):
    """Verify create order creates order in database."""
    order = OrderService.create_order(base_order_data)
    assert Order.objects.filter(id=order.id).exists()


@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_creates_order_item(mock_media, base_order_data):
    """Verify create order creates order item."""
    order = OrderService.create_order(base_order_data)
    assert OrderItem.objects.filter(order=order).count() == 1


@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_creates_wompi_transaction(mock_media, base_order_data):
    """Verify create order creates wompi transaction."""
    order = OrderService.create_order(base_order_data)
    assert WompiTransaction.objects.filter(order=order).exists()


@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_calculates_total_from_price(mock_media, base_order_data):
    """Verify create order calculates total from price."""
    order = OrderService.create_order(base_order_data)
    assert order.total_amount == 80000


@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
@override_settings(DEPOSIT_PERCENTAGE=50)
def test_create_order_deposit_is_50_percent(mock_media, base_order_data):
    """Verify create order deposit is 50 percent."""
    order = OrderService.create_order(base_order_data)
    assert order.deposit_amount == 40000
    assert order.balance_amount == 40000


@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_sets_status_pending_payment(mock_media, base_order_data):
    """Verify create order sets status pending payment."""
    order = OrderService.create_order(base_order_data)
    assert order.status == Order.Status.PENDING_PAYMENT


@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_assigns_customer_when_user_provided(mock_media, base_order_data, db):
    """Verify create order assigns customer when user provided."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = User.objects.create_user(email='client@example.com', password='pass')
    order = OrderService.create_order(base_order_data, user=user)
    assert order.customer == user


@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_customer_is_none_for_anonymous(mock_media, base_order_data):
    """Verify create order customer is none for anonymous."""
    order = OrderService.create_order(base_order_data, user=None)
    assert order.customer is None


# ---------------------------------------------------------------------------
# create_order — per-size pricing config
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_uses_per_size_deposit_percentage(mock_media, peluch_per_size, size, color):
    """Verify create order uses per size deposit percentage."""
    order = OrderService.create_order(_order_data(peluch_per_size, (size, color, 1)))
    assert order.deposit_amount == 24000  # 80000 * 30%
    assert order.amount_paid_now == 24000


@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_per_size_shipping_cost_is_added(mock_media, peluch_per_size, size, color):
    """Verify create order per size shipping cost is added."""
    order = OrderService.create_order(_order_data(peluch_per_size, (size, color, 1)))
    assert order.shipping_amount == 5000


@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_per_size_free_shipping_contributes_zero(mock_media, peluch_per_size, size_l, color):
    """Verify create order per size free shipping contributes zero."""
    order = OrderService.create_order(_order_data(peluch_per_size, (size_l, color, 1)))
    assert order.shipping_amount == 0


@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_full_payment_uses_per_size_discount(mock_media, peluch_per_size, size, color):
    """Verify create order full payment uses per size discount."""
    data = _order_data(peluch_per_size, (size, color, 1))
    data['payment_mode'] = Order.PaymentMode.FULL
    order = OrderService.create_order(data)
    assert order.discount_amount == 8000  # 80000 * 10%
    assert order.amount_paid_now == 77000  # 80000 - 8000 + 5000 shipping
    assert order.balance_amount == 0


@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_wompi_amount_matches_amount_paid_now(mock_media, peluch_per_size, size, color):
    """Verify create order wompi amount matches amount paid now."""
    order = OrderService.create_order(_order_data(peluch_per_size, (size, color, 2)))
    tx = WompiTransaction.objects.get(order=order)
    assert tx.amount_in_cents == order.amount_paid_now * 100


@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_mixed_sizes_weighted_deposit(mock_media, peluch_per_size, size, size_l, color):
    # size: price 80000, deposit 30%, ship 5000  |  size_l: price 120000, deposit 50%, free ship
    """Verify create order mixed sizes weighted deposit."""
    order = OrderService.create_order(_order_data(peluch_per_size, (size, color, 1), (size_l, color, 1)))
    assert order.total_amount == 200000
    assert order.deposit_amount == 84000      # 80000*30% + 120000*50% = 24000 + 60000
    assert order.shipping_amount == 5000
    assert order.balance_amount == 121000     # (200000 - 84000) + 5000


@pytest.mark.django_db
@patch('base_feature_app.services.order_service.OrderService.mark_media_as_used')
def test_create_order_snapshot_stores_per_size_config(mock_media, peluch_per_size, size, color):
    """Verify create order snapshot stores per size config."""
    order = OrderService.create_order(_order_data(peluch_per_size, (size, color, 1)))
    snap = order.items.first().configuration_snapshot
    assert snap['deposit_percentage'] == 30
    assert snap['full_payment_discount_pct'] == 10
    assert snap['shipping_cost'] == 5000
    assert snap['free_shipping'] is False


@pytest.mark.django_db
def test_create_order_uses_the_price_current_after_serializer_validation(peluch_with_price, size, color):
    """Falla si crear el pedido cobra el precio leído antes de abrir la transacción."""
    serializer = OrderCreateSerializer(data={
        **_serializer_order_payload(peluch_with_price, size, color),
        'payment_mode': Order.PaymentMode.FULL,
    })
    assert serializer.is_valid(), serializer.errors
    PeluchSizePrice.objects.filter(peluch=peluch_with_price, size=size).update(price=96000)

    order = OrderService.create_order(serializer.validated_data)
    item = OrderItem.objects.get(order=order)

    assert item.unit_price == 96000
    assert order.total_amount == 96000
    assert item.configuration_snapshot['original_unit_price'] == 96000


@pytest.mark.django_db
def test_create_order_reads_prices_once_per_hundred_items(peluch_with_price, size, color):
    """Falla si crear un carrito vuelve a consultar el precio de cada artículo."""
    one_order, one_selects = _service_select_count(peluch_with_price, size, color, 1)
    fifty_order, fifty_selects = _service_select_count(peluch_with_price, size, color, 50)
    hundred_one_order, hundred_one_selects = _service_select_count(peluch_with_price, size, color, 101)
    two_hundred_one_order, two_hundred_one_selects = _service_select_count(peluch_with_price, size, color, 201)

    assert [order.items.count() for order in (one_order, fifty_order, hundred_one_order, two_hundred_one_order)] == [
        1, 50, 101, 201,
    ]
    assert [one_selects, fifty_selects, hundred_one_selects, two_hundred_one_selects] == [2, 2, 3, 4]


@pytest.mark.django_db(transaction=True)
def test_create_order_rolls_back_when_price_becomes_unavailable_after_validation(peluch_with_price, size, color):
    """Falla si una talla retirada después de validar deja una orden o pago parcial."""
    serializer = OrderCreateSerializer(data=_serializer_order_payload(peluch_with_price, size, color))
    assert serializer.is_valid(), serializer.errors
    PeluchSizePrice.objects.filter(peluch=peluch_with_price, size=size).update(is_available=False)

    with pytest.raises(PeluchSizePrice.DoesNotExist):
        OrderService.create_order(serializer.validated_data)

    assert Order.objects.count() == 0
    assert OrderItem.objects.count() == 0
    assert WompiTransaction.objects.count() == 0


@pytest.mark.django_db
def test_create_order_marks_personalization_media_as_used(peluch_with_price, size, color):
    """Falla si el camino con precios agrupados omite marcar personalizaciones compradas."""
    peluch_with_price.has_huella = True
    peluch_with_price.has_audio = True
    peluch_with_price.save(update_fields=['has_huella', 'has_audio'])
    image = PersonalizationMedia.objects.create(
        media_type=PersonalizationMedia.MediaType.HUELLA_IMAGE,
        file='personalizations/2026/01/order-image.jpg', file_size_kb=100,
    )
    audio = PersonalizationMedia.objects.create(
        media_type=PersonalizationMedia.MediaType.AUDIO,
        file='personalizations/2026/01/order-audio.mp3', file_size_kb=200, duration_sec=2.0,
    )
    data = _personalized_order_data(peluch_with_price, size, color, image, audio)

    OrderService.create_order(data)
    image.refresh_from_db()
    audio.refresh_from_db()

    assert image.is_used is True
    assert audio.is_used is True


# ---------------------------------------------------------------------------
# update_status
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_update_status_changes_order_status(existing_order):
    """Verify update status changes order status."""
    OrderService.update_status(existing_order, Order.Status.PAYMENT_CONFIRMED)
    existing_order.refresh_from_db()
    assert existing_order.status == Order.Status.PAYMENT_CONFIRMED


@pytest.mark.django_db
def test_update_status_creates_history_entry(existing_order):
    """Verify update status creates history entry."""
    OrderService.update_status(existing_order, Order.Status.IN_PRODUCTION)
    assert OrderStatusHistory.objects.filter(order=existing_order).exists()


@pytest.mark.django_db
def test_update_status_records_previous_status(existing_order):
    """Verify update status records previous status."""
    previous = existing_order.status
    OrderService.update_status(existing_order, Order.Status.PAYMENT_CONFIRMED)
    history = OrderStatusHistory.objects.get(order=existing_order)
    assert history.previous_status == previous


@pytest.mark.django_db
def test_update_status_sends_email_after_commit(existing_order, mailoutbox, django_capture_on_commit_callbacks):
    """A status email cannot escape a transaction that has not committed."""
    with django_capture_on_commit_callbacks(execute=True):
        OrderService.update_status(existing_order, Order.Status.SHIPPED)
        assert mailoutbox == []

    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == [existing_order.customer_email]
    assert existing_order.order_number in mailoutbox[0].body


@pytest.mark.django_db
def test_update_status_rolls_back_a_failed_history(existing_order, mailoutbox, django_capture_on_commit_callbacks):
    """Use a real NOT NULL violation, not a mocked history writer."""
    with django_capture_on_commit_callbacks(execute=True):
        with pytest.raises(IntegrityError):
            OrderService.update_status(existing_order, Order.Status.SHIPPED, notes=None)

    existing_order.refresh_from_db()
    assert existing_order.status == Order.Status.PENDING_PAYMENT
    assert not existing_order.status_history.exists()
    assert mailoutbox == []


@pytest.mark.django_db
def test_update_status_repetition_has_one_history(existing_order, mailoutbox, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        OrderService.update_status(existing_order, Order.Status.SHIPPED)
        OrderService.update_status(existing_order, Order.Status.SHIPPED)

    assert existing_order.status_history.count() == 1
    assert len(mailoutbox) == 1


@pytest.mark.django_db
def test_update_status_records_the_current_previous_status(existing_order):
    OrderService.update_status(existing_order, Order.Status.IN_PRODUCTION)

    OrderService.update_status(existing_order, Order.Status.SHIPPED)

    history = existing_order.status_history.get(new_status=Order.Status.SHIPPED)
    assert history.previous_status == Order.Status.IN_PRODUCTION

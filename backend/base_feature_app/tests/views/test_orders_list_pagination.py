"""Pagination and query-budget coverage for the staff orders list."""

from datetime import datetime, timezone

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from base_feature_app.models import Order

MAX_LIST_QUERIES = 6
MAX_PAGE_BYTES = 256 * 1024


def _orders(count, prefix='order', *, city='Bogotá', status=Order.Status.PENDING_PAYMENT):
    return Order.objects.bulk_create([
        Order(
            order_number=f'{prefix}-{index:05d}', customer_email=f'{prefix}-{index}@example.com',
            customer_name=f'Customer {index}', customer_phone='3001234567', address=f'Calle {index}',
            city=city, department='Cundinamarca', postal_code='110111', status=status,
            total_amount=80_000, deposit_amount=40_000, balance_amount=40_000,
        )
        for index in range(count)
    ])


def _select_count(context):
    return sum(query['sql'].lstrip().upper().startswith('SELECT') for query in context.captured_queries)


@pytest.fixture
def orders_dataset(request, db):
    """Create an isolated list-size fixture for the order query-budget cases."""
    count, expected_lengths = request.param
    return _orders(count, prefix=f'dataset-{count}'), expected_lengths


@pytest.mark.django_db
def test_orders_list_rejects_nonstaff_customer(authenticated_client):
    """Falla si un cliente autenticado puede enumerar pedidos administrativos."""
    response = authenticated_client.get(reverse('orders-list'))

    assert response.status_code == 403
    assert response.json() == {'detail': 'Admin access required.'}


@pytest.mark.django_db
def test_orders_list_default_page_returns_envelope(admin_client):
    """Falla si el listado administrativo de pedidos vuelve a ser un arreglo plano."""
    order = _orders(1, prefix='envelope')[0]

    response = admin_client.get(reverse('orders-list'))

    assert response.status_code == 200
    assert response.json()['count'] == 1
    assert response.json()['next'] is None
    assert response.json()['previous'] is None
    assert response.json()['results'][0]['order_number'] == order.order_number


@pytest.mark.django_db
def test_orders_list_uses_id_to_break_equal_creation_timestamps(admin_client):
    """Falla si pedidos con la misma fecha dejan de ordenarse de forma determinista por ID."""
    orders = _orders(3, prefix='same-time')
    Order.objects.filter(id__in=[order.id for order in orders]).update(
        created_at=datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc),
    )

    response = admin_client.get(reverse('orders-list'))

    assert response.status_code == 200
    assert [row['id'] for row in response.json()['results']] == [orders[2].id, orders[1].id, orders[0].id]


@pytest.mark.django_db
def test_orders_list_status_filter_counts_before_pagination(admin_client):
    """Falla si el filtro de estado se aplica después de cortar la primera página."""
    _orders(101, prefix='pending', status=Order.Status.PENDING_PAYMENT)
    _orders(3, prefix='delivered', status=Order.Status.DELIVERED)

    response = admin_client.get(reverse('orders-list'), {'status': Order.Status.PENDING_PAYMENT, 'page_size': 100})

    assert response.status_code == 200
    assert response.json()['count'] == 101
    assert len(response.json()['results']) == 100
    assert response.json()['results'][0]['status'] == 'pending_payment'


@pytest.mark.django_db
def test_orders_list_city_filter_counts_before_pagination(admin_client):
    """Falla si el filtro de ciudad se aplica después de cortar la primera página."""
    _orders(101, prefix='medellin', city='Medellín')
    _orders(3, prefix='bogota', city='Bogotá')

    response = admin_client.get(reverse('orders-list'), {'city': 'medell', 'page_size': 100})

    assert response.status_code == 200
    assert response.json()['count'] == 101
    assert len(response.json()['results']) == 100
    assert response.json()['results'][0]['city'] == 'Medellín'


@pytest.mark.django_db
def test_orders_list_traverses_every_order_once(admin_client):
    """Falla si páginas consecutivas de pedidos ocultan, repiten o desordenan registros."""
    orders = _orders(205, prefix='traverse')

    first_page = admin_client.get(reverse('orders-list'), {'page_size': 100, 'page': 1})
    second_page = admin_client.get(reverse('orders-list'), {'page_size': 100, 'page': 2})
    third_page = admin_client.get(reverse('orders-list'), {'page_size': 100, 'page': 3})

    assert (
        first_page.status_code,
        [row['id'] for row in first_page.json()['results']],
        [row['id'] for row in second_page.json()['results']],
        [row['id'] for row in third_page.json()['results']],
    ) == (
        200,
        list(reversed([order.id for order in orders][-100:])),
        list(reversed([order.id for order in orders][5:105])),
        list(reversed([order.id for order in orders][:5])),
    )
    assert (
        first_page.json()['next'], second_page.json()['previous'], third_page.json()['next'], third_page.json()['previous'],
    ) == (
        'http://testserver/api/orders/list/?page=2&page_size=100', 'http://testserver/api/orders/list/?page_size=100', None,
        'http://testserver/api/orders/list/?page=2&page_size=100',
    )


@pytest.mark.django_db
def test_orders_list_empty_page_returns_empty_envelope(admin_client):
    """Falla si una lista administrativa vacía pierde su envelope paginado explícito."""
    response = admin_client.get(reverse('orders-list'))

    assert response.status_code == 200
    assert response.json() == {'count': 0, 'next': None, 'previous': None, 'results': []}


@pytest.mark.django_db
@pytest.mark.parametrize(
    'orders_dataset', [(1, (1, 1, 1)), (10_001, (1, 50, 100))], indirect=True,
)
def test_orders_list_select_budget_is_constant_across_page_sizes(admin_client, orders_dataset):
    """Falla si el listado suma SELECT por tamaño de página o por cantidad de pedidos."""
    orders, expected_lengths = orders_dataset
    newest_order = orders[-1]
    with CaptureQueriesContext(connection) as one_query_context:
        one_response = admin_client.get(reverse('orders-list'), {'page_size': 1})
    with CaptureQueriesContext(connection) as fifty_query_context:
        fifty_response = admin_client.get(reverse('orders-list'), {'page_size': 50})
    with CaptureQueriesContext(connection) as hundred_query_context:
        hundred_response = admin_client.get(reverse('orders-list'), {'page_size': 100})

    select_counts = [
        _select_count(one_query_context), _select_count(fifty_query_context), _select_count(hundred_query_context),
    ]
    assert (
        one_response.status_code, one_response.json()['count'], len(one_response.json()['results']),
        fifty_response.status_code, fifty_response.json()['count'], len(fifty_response.json()['results']),
        hundred_response.status_code, hundred_response.json()['count'], len(hundred_response.json()['results']),
    ) == (200, len(orders), expected_lengths[0], 200, len(orders), expected_lengths[1], 200, len(orders), expected_lengths[2])
    assert one_response.json()['results'][0]['order_number'] == newest_order.order_number
    assert select_counts == [select_counts[0], select_counts[0], select_counts[0]]
    assert select_counts[0] <= MAX_LIST_QUERIES


@pytest.mark.django_db
def test_orders_list_page_payload_stays_within_budget(admin_client):
    """Falla si una página completa de pedidos supera el presupuesto de JSON sin comprimir."""
    _orders(100, prefix='payload')

    response = admin_client.get(reverse('orders-list'), {'page_size': 100})

    assert response.status_code == 200
    assert len(response.json()['results']) == 100
    assert len(response.content) <= MAX_PAGE_BYTES


@pytest.mark.django_db
def test_orders_list_caps_oversized_page_size_at_one_hundred(admin_client):
    """Falla si un cliente administrativo puede pedir más de cien pedidos por página."""
    _orders(101, prefix='capped')

    response = admin_client.get(reverse('orders-list'), {'page_size': 1000})

    assert response.status_code == 200
    assert len(response.json()['results']) == 100

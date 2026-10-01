"""Pagination and query-budget coverage for the authenticated sales list."""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from base_feature_app.models import Sale

MAX_LIST_QUERIES = 6
MAX_PAGE_BYTES = 256 * 1024


def _sales(count, prefix='sale'):
    return Sale.objects.bulk_create([
        Sale(
            email=f'{prefix}-{index}@example.com', address=f'Calle {index}', city='Bogotá',
            state='Cundinamarca', postal_code=f'110{index:03d}',
        )
        for index in range(count)
    ])


def _select_count(context):
    return sum(query['sql'].lstrip().upper().startswith('SELECT') for query in context.captured_queries)


@pytest.fixture
def sales_dataset(request, db):
    """Create an isolated list-size fixture for the query-budget cases."""
    count, expected_lengths = request.param
    return _sales(count, prefix=f'dataset-{count}'), expected_lengths


@pytest.mark.django_db
def test_sales_list_rejects_anonymous_reader(api_client):
    """Falla si el listado de ventas deja entrar a una persona no autenticada."""
    response = api_client.get(reverse('sale-list'))

    assert response.status_code == 403
    assert response.json() == {'detail': 'Authentication required.'}


@pytest.mark.django_db
def test_sales_list_accepts_authenticated_customer(authenticated_client):
    """Falla si el listado de ventas deja de estar disponible para un cliente autenticado."""
    sale = _sales(1, prefix='customer-access')[0]

    response = authenticated_client.get(reverse('sale-list'))

    assert response.status_code == 200
    assert response.json()['results'] == [{
        'id': sale.id, 'email': 'customer-access-0@example.com', 'city': 'Bogotá',
        'state': 'Cundinamarca', 'postal_code': '110000',
    }]


@pytest.mark.django_db
def test_sales_list_default_page_returns_envelope(authenticated_client):
    """Falla si la respuesta por defecto vuelve a ser un arreglo plano de ventas."""
    sale = _sales(1, prefix='default')[0]

    response = authenticated_client.get(reverse('sale-list'))

    assert response.status_code == 200
    assert response.json() == {
        'count': 1,
        'next': None,
        'previous': None,
        'results': [{
            'id': sale.id, 'email': 'default-0@example.com', 'city': 'Bogotá',
            'state': 'Cundinamarca', 'postal_code': '110000',
        }],
    }


@pytest.mark.django_db
def test_sales_list_row_preserves_legacy_fields(authenticated_client):
    """Falla si una fila paginada pierde campos públicos heredados de una venta."""
    _sales(1, prefix='fields')

    response = authenticated_client.get(reverse('sale-list'))

    assert response.status_code == 200
    assert set(response.json()['results'][0]) == {'id', 'email', 'city', 'state', 'postal_code'}


@pytest.mark.django_db
@pytest.mark.parametrize('page_size', [1, 50, 100])
def test_sales_list_honors_supported_page_size(authenticated_client, page_size):
    """Falla si un tamaño de página permitido deja de limitar las filas entregadas."""
    _sales(100, prefix=f'size-{page_size}')

    response = authenticated_client.get(reverse('sale-list'), {'page_size': page_size})

    assert response.status_code == 200
    assert len(response.json()['results']) == page_size


@pytest.mark.django_db
def test_sales_list_caps_oversized_page_size_at_one_hundred(authenticated_client):
    """Falla si un cliente puede pedir más de cien ventas en una página."""
    _sales(101, prefix='capped')

    response = authenticated_client.get(reverse('sale-list'), {'page_size': 1000})

    assert response.status_code == 200
    assert len(response.json()['results']) == 100


@pytest.mark.django_db
@pytest.mark.parametrize('page', ['0', 'not-a-page', '2'])
def test_sales_list_invalid_page_returns_drf_not_found(authenticated_client, page):
    """Falla si una página inválida deja de conservar el 404 estándar de DRF."""
    _sales(1, prefix='invalid-page')

    response = authenticated_client.get(reverse('sale-list'), {'page': page})

    assert response.status_code == 404
    assert response.json() == {'detail': 'Invalid page.'}


@pytest.mark.django_db
def test_sales_list_traverses_every_sale_once(authenticated_client):
    """Falla si páginas consecutivas ocultan, repiten o desordenan ventas."""
    sales = _sales(205, prefix='traverse')

    first_page = authenticated_client.get(reverse('sale-list'), {'page_size': 100, 'page': 1})
    second_page = authenticated_client.get(reverse('sale-list'), {'page_size': 100, 'page': 2})
    third_page = authenticated_client.get(reverse('sale-list'), {'page_size': 100, 'page': 3})

    assert (
        first_page.status_code,
        [row['id'] for row in first_page.json()['results']],
        [row['id'] for row in second_page.json()['results']],
        [row['id'] for row in third_page.json()['results']],
    ) == (
        200,
        list(reversed([sale.id for sale in sales][-100:])),
        list(reversed([sale.id for sale in sales][5:105])),
        list(reversed([sale.id for sale in sales][:5])),
    )
    assert (
        first_page.json()['next'], second_page.json()['previous'], third_page.json()['next'], third_page.json()['previous'],
    ) == (
        'http://testserver/api/sales/?page=2&page_size=100', 'http://testserver/api/sales/?page_size=100', None,
        'http://testserver/api/sales/?page=2&page_size=100',
    )


@pytest.mark.django_db
def test_sales_list_empty_page_returns_empty_envelope(authenticated_client):
    """Falla si un catálogo de ventas vacío pierde su envelope paginado explícito."""
    response = authenticated_client.get(reverse('sale-list'))

    assert response.status_code == 200
    assert response.json() == {'count': 0, 'next': None, 'previous': None, 'results': []}


@pytest.mark.django_db
@pytest.mark.parametrize(
    'sales_dataset', [(1, (1, 1, 1)), (10_001, (1, 50, 100))], indirect=True,
)
def test_sales_list_select_budget_is_constant_across_page_sizes(authenticated_client, sales_dataset):
    """Falla si el listado suma SELECT por tamaño de página o por cantidad de ventas."""
    sales, expected_lengths = sales_dataset
    newest_sale = sales[-1]
    with CaptureQueriesContext(connection) as one_query_context:
        one_response = authenticated_client.get(reverse('sale-list'), {'page_size': 1})
    with CaptureQueriesContext(connection) as fifty_query_context:
        fifty_response = authenticated_client.get(reverse('sale-list'), {'page_size': 50})
    with CaptureQueriesContext(connection) as hundred_query_context:
        hundred_response = authenticated_client.get(reverse('sale-list'), {'page_size': 100})

    select_counts = [
        _select_count(one_query_context), _select_count(fifty_query_context), _select_count(hundred_query_context),
    ]
    assert (
        one_response.status_code, one_response.json()['count'], len(one_response.json()['results']),
        fifty_response.status_code, fifty_response.json()['count'], len(fifty_response.json()['results']),
        hundred_response.status_code, hundred_response.json()['count'], len(hundred_response.json()['results']),
    ) == (200, len(sales), expected_lengths[0], 200, len(sales), expected_lengths[1], 200, len(sales), expected_lengths[2])
    assert one_response.json()['results'][0] == {
        'id': newest_sale.id, 'email': newest_sale.email, 'city': 'Bogotá',
        'state': 'Cundinamarca', 'postal_code': newest_sale.postal_code,
    }
    assert select_counts == [select_counts[0], select_counts[0], select_counts[0]]
    assert select_counts[0] <= MAX_LIST_QUERIES


@pytest.mark.django_db
def test_sales_list_page_payload_stays_within_budget(authenticated_client):
    """Falla si una página completa de ventas supera el presupuesto de JSON sin comprimir."""
    _sales(100, prefix='payload')

    response = authenticated_client.get(reverse('sale-list'), {'page_size': 100})

    assert response.status_code == 200
    assert len(response.json()['results']) == 100
    assert len(response.content) <= MAX_PAGE_BYTES

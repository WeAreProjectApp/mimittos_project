"""Behavior and query-budget coverage for order CSV exports."""

import csv
from datetime import date, datetime
from datetime import timezone as datetime_timezone
from io import StringIO

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django_attachments.models import Library

from base_feature_app.models import (
    Category,
    GlobalColor,
    GlobalSize,
    Order,
    OrderItem,
    Peluch,
)
from base_feature_app.services.analytics_service import (
    EXPORT_ORDER_CHUNK_SIZE,
    AnalyticsService,
)


def _catalog(index: int = 0) -> tuple[Peluch, GlobalSize, GlobalColor]:
    category = Category.objects.create(name=f'Export category {index}', slug=f'export-category-{index}')
    color = GlobalColor.objects.create(name=f'Blue {index}', slug=f'export-blue-{index}', hex_code='#0000FF')
    size = GlobalSize.objects.create(label=f'Medium {index}', slug=f'export-medium-{index}', cm='25cm')
    peluch = Peluch.objects.create(
        title=f'Export peluch {index}',
        slug=f'export-peluch-{index}',
        category=category,
        lead_description='Description',
        gallery=Library.objects.create(title='Export gallery'),
    )
    return peluch, size, color


def _order(index: int) -> Order:
    return Order.objects.create(
        order_number=f'EXPORT-{index:04d}',
        customer_email=f'export-{index}@example.com',
        customer_name=f'Export customer {index}',
        address='Street 1',
        city='Bogota',
        department='Cundinamarca',
        total_amount=10000,
        deposit_amount=5000,
        balance_amount=5000,
    )


def _create_orders_with_items(count: int) -> list[Order]:
    orders = []
    for index in range(count):
        peluch, size, color = _catalog(index)
        order = _order(index)
        OrderItem.objects.create(
            order=order,
            peluch=peluch,
            size=size,
            color=color,
            quantity=1,
            unit_price=10000,
        )
        orders.append(order)
    return orders


def _csv_rows(csv_bytes: bytes) -> list[list[str]]:
    return list(csv.reader(StringIO(csv_bytes.decode('utf-8-sig'))))


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('order_count', 'expected_selects'),
    [(1, 2), (50, 2), (100, 2), (101, 3)],
)
def test_export_orders_csv_prefetches_item_relations_per_chunk(order_count, expected_selects):
    """Falla si el export vuelve a consultar ítems o sus relaciones por cada pedido."""
    orders = _create_orders_with_items(order_count)

    with CaptureQueriesContext(connection) as captured:
        csv_bytes = AnalyticsService.export_orders_csv(date(2000, 1, 1), date(2100, 1, 1))

    select_queries = [query for query in captured if query['sql'].lstrip().upper().startswith('SELECT')]
    rows = _csv_rows(csv_bytes)

    assert EXPORT_ORDER_CHUNK_SIZE == 100
    assert len(rows[1:]) == order_count
    assert {row[0] for row in rows[1:]} == {order.order_number for order in orders}
    assert len(select_queries) == expected_selects


def _ranged_export_orders() -> tuple[Order, Order, Order, Order]:
    peluch, size, color = _catalog()
    created = [
        datetime(2026, 4, 1, 9, 0, tzinfo=datetime_timezone.utc),
        datetime(2026, 4, 15, 9, 0, tzinfo=datetime_timezone.utc),
        datetime(2026, 4, 30, 9, 0, tzinfo=datetime_timezone.utc),
        datetime(2026, 5, 1, 9, 0, tzinfo=datetime_timezone.utc),
    ]
    first_included, empty_order, second_included, outside_order = [_order(index) for index in range(4)]
    for order, created_at in zip(
        [first_included, empty_order, second_included, outside_order], created, strict=True,
    ):
        Order.objects.filter(pk=order.pk).update(created_at=created_at)
        order.refresh_from_db()
    OrderItem.objects.create(
        order=first_included, peluch=peluch, size=size, color=color, quantity=2, unit_price=10000,
    )
    OrderItem.objects.create(
        order=second_included, peluch=peluch, size=size, color=color, quantity=3, unit_price=10000,
    )
    OrderItem.objects.create(
        order=second_included, peluch=peluch, size=size, color=color, quantity=4, unit_price=12000,
    )
    OrderItem.objects.create(
        order=outside_order, peluch=peluch, size=size, color=color, quantity=5, unit_price=10000,
    )

    return first_included, empty_order, second_included, outside_order


def _ranged_export_rows() -> tuple[list[list[str]], tuple[Order, Order, Order, Order]]:
    orders = _ranged_export_orders()
    csv_bytes = AnalyticsService.export_orders_csv(date(2026, 4, 1), date(2026, 4, 30))
    return _csv_rows(csv_bytes)[1:], orders


@pytest.mark.django_db
def test_export_orders_csv_includes_items_at_inclusive_date_limits():
    """Falla si el export deja de incluir ítems creados en las fechas límite."""
    rows, (first_included, _, second_included, _) = _ranged_export_rows()

    assert len(rows) == 3
    assert {(row[12], row[13], row[14], row[15]) for row in rows} == {
        ('Export peluch 0', 'Medium 0', 'Blue 0', '2'),
        ('Export peluch 0', 'Medium 0', 'Blue 0', '3'),
        ('Export peluch 0', 'Medium 0', 'Blue 0', '4'),
    }
    assert {row[0] for row in rows} == {first_included.order_number, second_included.order_number}


@pytest.mark.django_db
def test_export_orders_csv_omits_empty_orders():
    """Falla si el export inventa una fila para un pedido sin ítems."""
    rows, (_, empty_order, _, _) = _ranged_export_rows()

    assert empty_order.order_number not in {row[0] for row in rows}


@pytest.mark.django_db
def test_export_orders_csv_omits_orders_outside_date_range():
    """Falla si el export incluye pedidos creados fuera del intervalo solicitado."""
    rows, (_, _, _, outside_order) = _ranged_export_rows()

    assert outside_order.order_number not in {row[0] for row in rows}


@pytest.mark.django_db
def test_export_orders_csv_orders_item_rows_by_descending_order_date():
    """Falla si el export deja de respetar el orden descendente de los pedidos."""
    rows, (first_included, _, second_included, _) = _ranged_export_rows()

    assert [row[0] for row in rows] == [
        second_included.order_number,
        second_included.order_number,
        first_included.order_number,
    ]

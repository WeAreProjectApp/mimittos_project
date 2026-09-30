"""Query-budget and error-path coverage for ``SaleSerializer``."""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django_attachments.models import Library

from base_feature_app.models import Product, Sale
from base_feature_app.serializers.sale import SaleSerializer

MAX_SALE_SERIALIZER_READ_QUERIES = 2
MAX_SALE_SERIALIZER_SECOND_BATCH_READ_QUERIES = 3


def _create_product_ids(count: int, prefix: str) -> list[int]:
    """Create distinct product/gallery pairs before query-budget measurement."""
    product_ids = []
    for index in range(count):
        gallery = Library.objects.create(title=f"{prefix} gallery {index}")
        product = Product.objects.create(
            title=f"{prefix} product {index}",
            category="Animals",
            sub_category="Bears",
            description="Handmade bear",
            price=10000 + index,
            gallery=gallery,
        )
        product_ids.append(product.id)
    return product_ids


def _payload(email: str, sold_products: list[dict[str, int]]) -> dict[str, object]:
    """Build a valid sale payload with a caller-provided product list."""
    return {
        "email": email,
        "address": "Calle 123",
        "city": "Bogotá",
        "state": "Cundinamarca",
        "postal_code": "110111",
        "sold_products": sold_products,
    }


def _distinct_lines(product_ids: list[int]) -> list[dict[str, int]]:
    """Give every distinct product a concrete, increasing quantity."""
    return [
        {"product_id": product_id, "quantity": index + 1}
        for index, product_id in enumerate(product_ids)
    ]


def _repeated_lines(product_id: int, count: int) -> list[dict[str, int]]:
    """Create repeated sale lines whose quantities remain observable in output."""
    return [
        {"product_id": product_id, "quantity": index + 1}
        for index in range(count)
    ]


def _save_with_select_count(payload: dict[str, object]) -> tuple[Sale, dict[str, object], int]:
    """Save and materialize the actual serializer response inside the budget window."""
    serializer = SaleSerializer(data=payload)
    assert serializer.is_valid(), serializer.errors

    with CaptureQueriesContext(connection) as queries:
        sale = serializer.save()
        serialized_sale = dict(serializer.data)

    select_count = sum(query["sql"].lstrip().upper().startswith("SELECT") for query in queries)
    return sale, serialized_sale, select_count


def _serialized_lines(serialized_sale: dict[str, object]) -> list[tuple[int, int]]:
    """Return concrete product id and quantity pairs from the public response."""
    return [
        (item["product"]["id"], item["quantity"])
        for item in serialized_sale["sold_products"]
    ]


@pytest.mark.django_db
def test_sale_serializer_keeps_product_read_query_budget():
    """Falla si crear ventas vuelve a leer cada producto o no conserva líneas y cantidades."""
    one_product_ids = _create_product_ids(1, "one")
    fifty_product_ids = _create_product_ids(50, "fifty")
    repeated_product_id = _create_product_ids(1, "repeated")[0]

    _, one_serialized, one_selects = _save_with_select_count(
        _payload("one@example.com", _distinct_lines(one_product_ids))
    )
    _, fifty_serialized, fifty_selects = _save_with_select_count(
        _payload("fifty@example.com", _distinct_lines(fifty_product_ids))
    )
    _, repeated_serialized, repeated_selects = _save_with_select_count(
        _payload("repeated@example.com", _repeated_lines(repeated_product_id, 50))
    )

    assert _serialized_lines(one_serialized) == [(one_product_ids[0], 1)]
    assert _serialized_lines(fifty_serialized) == [
        (product_id, index + 1) for index, product_id in enumerate(fifty_product_ids)
    ]
    assert _serialized_lines(repeated_serialized) == [
        (repeated_product_id, quantity) for quantity in range(1, 51)
    ]
    assert one_selects == fifty_selects == repeated_selects
    assert repeated_selects <= MAX_SALE_SERIALIZER_READ_QUERIES


@pytest.mark.django_db
def test_sale_serializer_reads_all_lines_after_product_limit():
    """Falla si el corte de 100 productos pierde líneas o vuelve a consultar una vez por línea."""
    product_ids = _create_product_ids(101, "second batch")

    _, serialized_sale, select_count = _save_with_select_count(
        _payload("second-batch@example.com", _distinct_lines(product_ids))
    )

    assert _serialized_lines(serialized_sale) == [
        (product_id, index + 1) for index, product_id in enumerate(product_ids)
    ]
    assert select_count <= MAX_SALE_SERIALIZER_SECOND_BATCH_READ_QUERIES


@pytest.mark.django_db
def test_sale_serializer_creates_empty_sale_without_sold_products():
    """Falla si la precarga rechaza una venta válida sin líneas o cambia su lista vacía."""
    serializer = SaleSerializer(data=_payload("empty@example.com", []))

    assert serializer.is_valid(), serializer.errors
    serializer.save()

    assert serializer.data["sold_products"] == []
    assert Sale.objects.get(email="empty@example.com").email == "empty@example.com"


@pytest.mark.django_db
def test_sale_serializer_preserves_prior_line_when_product_is_missing():
    """Falla si un id inexistente deja de elevar DoesNotExist o revierte la línea previa."""
    product_id = _create_product_ids(1, "existing")[0]
    serializer = SaleSerializer(
        data=_payload(
            "missing-product@example.com",
            [
                {"product_id": product_id, "quantity": 2},
                {"product_id": product_id + 100000, "quantity": 7},
            ],
        )
    )

    assert serializer.is_valid(), serializer.errors
    with pytest.raises(Product.DoesNotExist):
        serializer.save()

    sale = Sale.objects.get(email="missing-product@example.com")
    assert sale.sold_products.count() == 1
    assert sale.sold_products.get().product_id == product_id
    assert sale.sold_products.get().quantity == 2

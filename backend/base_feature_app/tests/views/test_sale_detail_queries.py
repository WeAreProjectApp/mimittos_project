"""Query-budget coverage for the staff sale detail endpoint."""

from io import BytesIO

import pytest
from django.core.files.base import ContentFile
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django_attachments.models import Attachment, Library
from PIL import Image

from base_feature_app.models import Product, Sale, SoldProduct

MAX_SALE_DETAIL_QUERIES = 3


def _image_file(name: str) -> ContentFile:
    image = Image.new('RGB', (10, 10), color=(240, 240, 240))
    buffer = BytesIO()
    image.save(buffer, format='WEBP')
    return ContentFile(buffer.getvalue(), name=name)


def _create_sale() -> Sale:
    return Sale.objects.create(
        email='buyer@example.com',
        address='Calle 123',
        city='Bogotá',
        state='Cundinamarca',
        postal_code='110111',
    )


def _add_sold_products(sale: Sale, count: int, start: int = 0) -> dict[str, tuple[int, list[str]]]:
    expected_products = {}
    for index in range(start, start + count):
        gallery = Library.objects.create(title=f'Sale gallery {index}')
        second = Attachment.objects.create(
            library=gallery,
            file=_image_file(f'sale-{index}-second.webp'),
            original_name=f'sale-{index}-second.webp',
            rank=1,
        )
        first = Attachment.objects.create(
            library=gallery,
            file=_image_file(f'sale-{index}-first.webp'),
            original_name=f'sale-{index}-first.webp',
            rank=0,
        )
        title = f'Sale product {index}'
        product = Product.objects.create(
            title=title,
            category='Animals',
            sub_category='Bears',
            description='Description',
            price=10000,
            gallery=gallery,
        )
        sale.sold_products.add(SoldProduct.objects.create(product=product, quantity=index + 1))
        expected_products[title] = (index + 1, [first.file.url, second.file.url])
    return expected_products


@pytest.fixture
def media_root(tmp_path):
    """Store generated attachment files in pytest's isolated temporary directory."""
    with override_settings(MEDIA_ROOT=tmp_path):
        yield


@pytest.mark.django_db
def test_sale_detail_query_budget_preserves_gallery_urls(admin_client, media_root):
    """Falla si el detalle vuelve a consultar productos, galerías o adjuntos por cada venta."""
    sale = _create_sale()
    expected_one = _add_sold_products(sale, 1)

    with CaptureQueriesContext(connection) as one_product_queries:
        one_product_response = admin_client.get(reverse('sale-detail', kwargs={'sale_id': sale.id}))

    expected_fifty = expected_one | _add_sold_products(sale, 49, start=1)
    with CaptureQueriesContext(connection) as fifty_product_queries:
        fifty_product_response = admin_client.get(reverse('sale-detail', kwargs={'sale_id': sale.id}))

    assert one_product_response.status_code == 200
    assert fifty_product_response.status_code == 200
    assert len(one_product_response.data['sold_products']) == 1
    assert len(fifty_product_response.data['sold_products']) == 50
    assert {
        item['product']['title']: (item['quantity'], item['product']['gallery_urls'])
        for item in fifty_product_response.data['sold_products']
    } == {
        title: (quantity, [f'http://testserver{url}' for url in urls])
        for title, (quantity, urls) in expected_fifty.items()
    }
    assert len(one_product_queries) == len(fifty_product_queries)
    assert len(fifty_product_queries) <= MAX_SALE_DETAIL_QUERIES


@pytest.mark.django_db
def test_sale_detail_returns_empty_sold_products(admin_client):
    """Falla si la precarga convierte una venta válida sin productos en una respuesta no vacía o errónea."""
    sale = _create_sale()

    response = admin_client.get(reverse('sale-detail', kwargs={'sale_id': sale.id}))

    assert response.status_code == 200
    assert response.data['sold_products'] == []


@pytest.mark.django_db
def test_sale_detail_returns_empty_gallery_urls(admin_client):
    """Falla si la precarga deja de representar como lista vacía una galería válida sin adjuntos."""
    sale = _create_sale()
    gallery = Library.objects.create(title='Empty sale gallery')
    product = Product.objects.create(
        title='Sale product without images',
        category='Animals',
        sub_category='Bears',
        description='Description',
        price=10000,
        gallery=gallery,
    )
    sale.sold_products.add(SoldProduct.objects.create(product=product, quantity=1))

    response = admin_client.get(reverse('sale-detail', kwargs={'sale_id': sale.id}))

    assert response.status_code == 200
    assert response.data['sold_products'][0]['product']['gallery_urls'] == []

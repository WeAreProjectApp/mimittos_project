"""Query-budget coverage for the two public product list endpoints."""

from io import BytesIO

import pytest
from django.core.files.base import ContentFile
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django_attachments.models import Attachment, Library
from PIL import Image

from base_feature_app.models import Product

MAX_PRODUCT_LIST_QUERIES = 6


def _image_file(name: str) -> ContentFile:
    image = Image.new('RGB', (10, 10), color=(240, 240, 240))
    buffer = BytesIO()
    image.save(buffer, format='WEBP')
    return ContentFile(buffer.getvalue(), name=name)


def _create_products(count: int, start: int = 0) -> dict[str, list[str]]:
    expected_urls = {}
    for index in range(start, start + count):
        gallery = Library.objects.create(title=f'Product gallery {index}')
        second = Attachment.objects.create(
            library=gallery,
            file=_image_file(f'product-{index}-second.webp'),
            original_name=f'product-{index}-second.webp',
            rank=1,
        )
        first = Attachment.objects.create(
            library=gallery,
            file=_image_file(f'product-{index}-first.webp'),
            original_name=f'product-{index}-first.webp',
            rank=0,
        )
        title = f'Product {index}'
        Product.objects.create(
            title=title,
            category='Animals',
            sub_category='Bears',
            description='Description',
            price=10000,
            gallery=gallery,
        )
        expected_urls[title] = [first.file.url, second.file.url]
    return expected_urls


@pytest.mark.django_db
@pytest.mark.parametrize('url_name', ['product-list', 'products'])
def test_product_list_query_budget_preserves_ranked_gallery_urls(api_client, settings, tmp_path, url_name):
    """Falla si los listados vuelven a consultar la galería o sus adjuntos por producto."""
    settings.MEDIA_ROOT = tmp_path
    expected_one = _create_products(1)

    with CaptureQueriesContext(connection) as one_product_queries:
        one_product_response = api_client.get(reverse(url_name))

    expected_fifty = expected_one | _create_products(49, start=1)
    with CaptureQueriesContext(connection) as fifty_product_queries:
        fifty_product_response = api_client.get(reverse(url_name))

    assert one_product_response.status_code == 200
    assert fifty_product_response.status_code == 200
    assert len(one_product_response.data) == 1
    assert len(fifty_product_response.data) == 50
    assert {
        item['title']: item['gallery_urls']
        for item in fifty_product_response.data
    } == {
        title: [f'http://testserver{url}' for url in urls]
        for title, urls in expected_fifty.items()
    }
    assert len(one_product_queries) == len(fifty_product_queries)
    assert len(fifty_product_queries) <= MAX_PRODUCT_LIST_QUERIES


@pytest.mark.django_db
@pytest.mark.parametrize('url_name', ['product-list', 'products'])
def test_product_list_returns_empty_gallery_urls_for_empty_library(api_client, settings, tmp_path, url_name):
    """Falla si un producto con galería vacía deja de conservar una lista de imágenes vacía."""
    settings.MEDIA_ROOT = tmp_path
    gallery = Library.objects.create(title='Empty product gallery')
    Product.objects.create(
        title='Product without images',
        category='Animals',
        sub_category='Bears',
        description='Description',
        price=10000,
        gallery=gallery,
    )

    response = api_client.get(reverse(url_name))

    assert response.status_code == 200
    assert response.data[0]['title'] == 'Product without images'
    assert response.data[0]['gallery_urls'] == []

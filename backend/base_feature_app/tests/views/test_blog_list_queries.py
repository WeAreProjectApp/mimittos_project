"""Query-budget coverage for the two public blog list endpoints."""

from io import BytesIO

import pytest
from django.core.files.base import ContentFile
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django_attachments.models import Attachment, Library
from PIL import Image

from base_feature_app.models import Blog

MAX_BLOG_LIST_QUERIES = 6


def _image_file(name: str) -> ContentFile:
    image = Image.new('RGB', (10, 10), color=(240, 240, 240))
    buffer = BytesIO()
    image.save(buffer, format='WEBP')
    return ContentFile(buffer.getvalue(), name=name)


def _create_blogs(count: int, start: int = 0) -> dict[str, str]:
    expected_urls = {}
    for index in range(start, start + count):
        library = Library.objects.create(title=f'Blog library {index}')
        Attachment.objects.create(
            library=library,
            file=_image_file(f'blog-{index}-second.webp'),
            original_name=f'blog-{index}-second.webp',
            rank=1,
        )
        first = Attachment.objects.create(
            library=library,
            file=_image_file(f'blog-{index}-first.webp'),
            original_name=f'blog-{index}-first.webp',
            rank=0,
        )
        title = f'Blog {index}'
        Blog.objects.create(title=title, description='Description', category='News', image=library)
        expected_urls[title] = first.file.url
    return expected_urls


@pytest.mark.django_db
@pytest.mark.parametrize('url_name', ['blog-list', 'blogs'])
def test_blog_list_query_budget_preserves_each_blog_cover(api_client, settings, tmp_path, url_name):
    """Falla si los listados vuelven a consultar imagen o adjunto por cada blog."""
    settings.MEDIA_ROOT = tmp_path
    expected_one = _create_blogs(1)

    with CaptureQueriesContext(connection) as one_blog_queries:
        one_blog_response = api_client.get(reverse(url_name))

    expected_fifty = expected_one | _create_blogs(49, start=1)
    with CaptureQueriesContext(connection) as fifty_blog_queries:
        fifty_blog_response = api_client.get(reverse(url_name))

    assert one_blog_response.status_code == 200
    assert fifty_blog_response.status_code == 200
    assert len(one_blog_response.data) == 1
    assert len(fifty_blog_response.data) == 50
    assert {
        item['title']: item['image_url']
        for item in fifty_blog_response.data
    } == {
        title: f'http://testserver{url}'
        for title, url in expected_fifty.items()
    }
    assert len(one_blog_queries) == len(fifty_blog_queries)
    assert len(fifty_blog_queries) <= MAX_BLOG_LIST_QUERIES


@pytest.mark.django_db
@pytest.mark.parametrize('url_name', ['blog-list', 'blogs'])
def test_blog_list_returns_null_image_url_for_empty_library(api_client, settings, tmp_path, url_name):
    """Falla si un blog sin adjuntos deja de exponerse con una imagen nula."""
    settings.MEDIA_ROOT = tmp_path
    library = Library.objects.create(title='Empty blog library')
    Blog.objects.create(title='Blog without image', description='Description', category='News', image=library)

    response = api_client.get(reverse(url_name))

    assert response.status_code == 200
    assert response.data[0]['title'] == 'Blog without image'
    assert response.data[0]['image_url'] is None

"""Catalog API behavior tests."""

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django_attachments.models import Attachment, Library
from rest_framework.test import APIClient

from base_feature_app.models import (
    Category,
    GlobalColor,
    GlobalSize,
    Peluch,
    PeluchColorImage,
    PeluchSizePrice,
)
from base_feature_app.tests.factories import (
    GlobalColorFactory,
    GlobalSizeFactory,
    PeluchColorImageFactory,
    PeluchFactory,
    PeluchSizePriceFactory,
)

MAX_CATALOG_LIST_QUERIES = 6


def _category_image_upload():
    buffer = io.BytesIO()
    Image.new('RGB', (32, 16), 'red').save(buffer, format='PNG')
    return SimpleUploadedFile('category.png', buffer.getvalue(), content_type='image/png')


@pytest.mark.django_db
@pytest.mark.parametrize('image_bytes', [b'not an image', b'x' * (5 * 1024 * 1024 + 1)], ids=['corrupt', 'oversized'])
def test_rejected_category_image_does_not_create_category(admin_client, image_bytes):
    image = SimpleUploadedFile('invalid.png', image_bytes, content_type='image/png')

    response = admin_client.post('/api/categories/', {'name': 'Rejected', 'image': image}, format='multipart')

    assert response.status_code == 400
    assert not Category.objects.filter(name='Rejected').exists()


@pytest.mark.django_db
@pytest.mark.parametrize('image_bytes', [b'not an image', b'x' * (5 * 1024 * 1024 + 1)], ids=['corrupt', 'oversized'])
def test_rejected_category_image_preserves_category(admin_client, category, image_bytes):
    Category.objects.filter(pk=category.pk).update(image='previous.jpg', description='Original')
    image = SimpleUploadedFile('invalid.png', image_bytes, content_type='image/png')

    response = admin_client.patch(
        f'/api/categories/{category.pk}/',
        {'name': 'Changed', 'description': 'Changed', 'image': image}, format='multipart',
    )

    assert response.status_code == 400
    category.refresh_from_db()
    assert (category.name, category.slug, category.description, category.image.name) == (
        'Osos', 'osos', 'Original', 'previous.jpg',
    )


@pytest.mark.django_db
def test_category_image_storage_failure_preserves_category(admin_client, category, monkeypatch):
    Category.objects.filter(pk=category.pk).update(image='previous.jpg')
    storage = Category._meta.get_field('image').storage

    def fail_save(*args, **kwargs):
        raise OSError('storage unavailable')

    monkeypatch.setattr(storage, 'save', fail_save)

    response = admin_client.patch(
        f'/api/categories/{category.pk}/',
        {'name': 'Changed', 'image': _category_image_upload()}, format='multipart',
    )

    assert response.status_code == 503
    category.refresh_from_db()
    assert (category.name, category.slug, category.image.name) == ('Osos', 'osos', 'previous.jpg')


@pytest.mark.django_db
def test_category_image_storage_failure_does_not_create_category(admin_client, monkeypatch):
    storage = Category._meta.get_field('image').storage

    def fail_save(*args, **kwargs):
        raise OSError('storage unavailable')

    monkeypatch.setattr(storage, 'save', fail_save)

    response = admin_client.post(
        '/api/categories/', {'name': 'Rejected', 'image': _category_image_upload()}, format='multipart',
    )

    assert response.status_code == 503
    assert not Category.objects.filter(name='Rejected').exists()


@pytest.mark.django_db
def test_category_image_is_saved_as_jpeg(admin_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path

    response = admin_client.post(
        '/api/categories/', {'name': 'Image category', 'image': _category_image_upload()}, format='multipart',
    )

    assert response.status_code == 201
    category = Category.objects.get(pk=response.data['id'])
    with category.image.open('rb') as saved_file:
        with Image.open(saved_file) as image:
            assert image.format == 'JPEG'


def _create_catalog_peluches(count, *, featured=False, is_available=True):
    """Create catalog rows with distinct related objects before query measurement."""
    for item_index in range(count):
        catalog_peluch = PeluchFactory(is_featured=featured)
        catalog_color = GlobalColorFactory()
        catalog_size = GlobalSizeFactory()
        catalog_peluch.available_colors.add(catalog_color)
        PeluchSizePriceFactory(
            peluch=catalog_peluch,
            size=catalog_size,
            is_available=is_available,
        )
        attachment_path = f'test-fixtures/catalog-{catalog_peluch.pk}-{item_index}.jpg'
        attachment = Attachment.objects.create(
            library=catalog_peluch.gallery,
            rank=0,
            original_name=f'catalog-{catalog_peluch.pk}-{item_index}.jpg',
            file='',
        )
        Attachment.objects.filter(pk=attachment.pk).update(
            file=attachment_path,
            filesize=0,
            mimetype='image/jpeg',
        )
        PeluchColorImage.objects.create(
            peluch=catalog_peluch,
            color=catalog_color,
            attachment=attachment,
        )

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client():
    """Provide an unauthenticated API client."""
    return APIClient()


@pytest.fixture
def admin_user(db):
    """Provide a staff user for catalog administration."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = User.objects.create_user(email='admin@example.com', password='pass')
    user.is_staff = True
    user.save(update_fields=['is_staff'])
    return user


@pytest.fixture
def admin_client(api_client, admin_user):
    """Provide an authenticated staff API client."""
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def category(db):
    """Provide an active catalog category."""
    return Category.objects.create(name='Osos', slug='osos', is_active=True)


@pytest.fixture
def size_small(db):
    """Provide the small active size."""
    return GlobalSize.objects.create(label='Pequeño', slug='pequeno', cm='20cm', sort_order=1)


@pytest.fixture
def size_large(db):
    """Provide the large active size."""
    return GlobalSize.objects.create(label='Grande', slug='grande', cm='40cm', sort_order=2)


@pytest.fixture
def color_pink(db):
    """Provide an active pink color."""
    return GlobalColor.objects.create(name='Rosa', slug='rosa', hex_code='#FF69B4', sort_order=1)


@pytest.fixture
def peluch(db, category, color_pink):
    """Provide an active peluch with a gallery and color."""
    library = Library.objects.create(title='Test Gallery')
    p = Peluch.objects.create(
        title='Osito Rosa',
        slug='osito-rosa',
        category=category,
        lead_description='Adorable osito',
        description='Descripción completa',
        gallery=library,
    )
    p.available_colors.add(color_pink)
    return p


@pytest.fixture
def peluch_with_price(peluch, size_small):
    """Provide a peluch with an available size price."""
    PeluchSizePrice.objects.create(peluch=peluch, size=size_small, price=50000)
    return peluch


@pytest.fixture
def featured_peluch(db, category):
    """Provide an active featured peluch."""
    library = Library.objects.create(title='Featured Gallery')
    p = Peluch.objects.create(
        title='Peluche Destacado',
        slug='peluche-destacado',
        category=category,
        lead_description='Destacado',
        description='El más vendido',
        is_featured=True,
        gallery=library,
    )
    return p


# ---------------------------------------------------------------------------
# Sizes endpoint
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_sizes_list_returns_active_sizes(api_client, size_small):
    """Verify the sizes endpoint exposes active sizes."""
    response = api_client.get('/api/sizes/')
    assert response.status_code == 200
    slugs = [s['slug'] for s in response.data]
    assert 'pequeno' in slugs


@pytest.mark.django_db
def test_sizes_list_excludes_inactive_sizes(api_client, db):
    """Verify the sizes endpoint hides inactive sizes."""
    GlobalSize.objects.create(label='Inactivo', slug='inactivo', cm='5cm', is_active=False)
    response = api_client.get('/api/sizes/')
    slugs = [s['slug'] for s in response.data]
    assert 'inactivo' not in slugs


# ---------------------------------------------------------------------------
# Colors endpoint
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_colors_list_returns_active_colors(api_client, color_pink):
    """Verify the colors endpoint exposes active colors."""
    response = api_client.get('/api/colors/')
    assert response.status_code == 200
    slugs = [c['slug'] for c in response.data]
    assert 'rosa' in slugs


@pytest.mark.django_db
def test_colors_list_excludes_inactive_colors(api_client, db):
    """Verify the colors endpoint hides inactive colors."""
    GlobalColor.objects.create(name='Invisible', slug='invisible', hex_code='#000', is_active=False)
    response = api_client.get('/api/colors/')
    slugs = [c['slug'] for c in response.data]
    assert 'invisible' not in slugs


# ---------------------------------------------------------------------------
# Categories endpoint
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_categories_get_returns_active_categories(api_client, category):
    """Verify the categories endpoint exposes active categories."""
    response = api_client.get('/api/categories/')
    assert response.status_code == 200
    names = [c['name'] for c in response.data]
    assert 'Osos' in names


@pytest.mark.django_db
def test_categories_post_creates_category_as_admin(admin_client):
    """Verify a staff user can create a category."""
    payload = {'name': 'Conejos', 'slug': 'conejos', 'description': '', 'display_order': 0, 'is_active': True}
    response = admin_client.post('/api/categories/', payload)
    assert response.status_code == 201
    assert Category.objects.filter(slug='conejos').exists()


@pytest.mark.django_db
def test_categories_post_returns_403_for_anonymous(api_client):
    """Verify anonymous category creation is forbidden."""
    payload = {'name': 'Conejos', 'slug': 'conejos'}
    response = api_client.post('/api/categories/', payload)
    assert response.status_code == 403


@pytest.mark.django_db
def test_categories_post_returns_400_for_invalid_data(admin_client):
    """Verify invalid category data is rejected."""
    response = admin_client.post('/api/categories/', {})
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Category detail endpoint
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_category_detail_patch_updates_name(admin_client, category):
    """Verify a staff update persists the category name."""
    response = admin_client.patch(f'/api/categories/{category.id}/', {'name': 'Osos Polares'})
    assert response.status_code == 200
    category.refresh_from_db()
    assert category.name == 'Osos Polares'


@pytest.mark.django_db
def test_category_detail_delete_removes_category(admin_client, category):
    """Verify a staff deletion removes the category."""
    response = admin_client.delete(f'/api/categories/{category.id}/')
    assert response.status_code == 204
    assert not Category.objects.filter(id=category.id).exists()


@pytest.mark.django_db
def test_category_detail_returns_403_for_anonymous(api_client, category):
    """Verify anonymous category deletion is forbidden."""
    response = api_client.delete(f'/api/categories/{category.id}/')
    assert response.status_code == 403


@pytest.mark.django_db
def test_category_detail_returns_404_for_missing_id(admin_client):
    """Verify updates reject an unknown category."""
    response = admin_client.patch('/api/categories/99999/', {'name': 'Ghost'})
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Peluches list endpoint
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_peluches_list_returns_active_peluches(api_client, peluch):
    """Verify the catalog exposes active peluches."""
    response = api_client.get('/api/peluches/')
    assert response.status_code == 200
    assert len(response.data) == 1


@pytest.mark.django_db
def test_peluches_list_excludes_inactive_peluche(api_client, peluch):
    """Verify the catalog hides inactive peluches."""
    peluch.is_active = False
    peluch.save()
    response = api_client.get('/api/peluches/')
    assert response.status_code == 200
    assert len(response.data) == 0


@pytest.mark.django_db
def test_peluches_list_filters_by_category_slug(api_client, peluch, category):
    """Verify catalog filtering by category slug."""
    response = api_client.get(f'/api/peluches/?category={category.slug}')
    assert response.status_code == 200
    assert len(response.data) == 1


@pytest.mark.django_db
def test_peluches_list_returns_empty_for_nonexistent_category(api_client, peluch):
    """Verify an unknown category produces an empty catalog."""
    response = api_client.get('/api/peluches/?category=no-existe')
    assert response.status_code == 200
    assert len(response.data) == 0


@pytest.mark.django_db
def test_peluches_list_filters_by_color_slug(api_client, peluch, color_pink):
    """Verify catalog filtering by color slug."""
    response = api_client.get(f'/api/peluches/?color={color_pink.slug}')
    assert response.status_code == 200
    assert len(response.data) == 1


@pytest.mark.django_db
def test_peluches_list_filters_by_size_slug(api_client, peluch_with_price, size_small):
    """Verify catalog filtering by available size slug."""
    response = api_client.get(f'/api/peluches/?size={size_small.slug}')
    assert response.status_code == 200
    assert len(response.data) == 1


@pytest.mark.django_db
def test_peluches_list_filters_by_min_price(api_client, peluch_with_price):
    """Verify catalog filtering by minimum price."""
    response = api_client.get('/api/peluches/?min_price=40000')
    assert response.status_code == 200
    assert len(response.data) == 1


@pytest.mark.django_db
def test_peluches_list_filters_by_max_price_excludes_above(api_client, peluch_with_price):
    """Verify catalog filtering excludes prices above the maximum."""
    response = api_client.get('/api/peluches/?max_price=20000')
    assert response.status_code == 200
    assert len(response.data) == 0


@pytest.mark.django_db
def test_peluches_list_preserves_filter_price_when_unavailable_size_is_cheaper(
    api_client, peluch, size_small, size_large,
):
    """Fails if a filter price starts ignoring unavailable sizes or exposes one."""
    PeluchSizePrice.objects.create(
        peluch=peluch, size=size_small, price=10000, is_available=False,
    )
    PeluchSizePrice.objects.create(
        peluch=peluch, size=size_large, price=50000, is_available=True,
    )

    response = api_client.get('/api/peluches/?max_price=20000')

    assert response.status_code == 200
    assert response.data[0]['min_price'] == 50000
    assert response.data[0]['discounted_min_price'] == 50000


@pytest.mark.django_db
def test_peluches_list_returns_null_prices_without_available_sizes(api_client, peluch, size_small):
    """Verify list prices stay null when no size is available."""
    PeluchSizePrice.objects.create(
        peluch=peluch, size=size_small, price=10000, is_available=False,
    )

    response = api_client.get('/api/peluches/')

    assert response.status_code == 200
    assert response.data[0]['min_price'] is None
    assert response.data[0]['discounted_min_price'] is None


@pytest.mark.django_db
def test_peluches_list_returns_zero_available_price(api_client, peluch, size_small):
    """Fails if an available zero price is treated as an absent price."""
    PeluchSizePrice.objects.create(peluch=peluch, size=size_small, price=0, is_available=True)

    response = api_client.get('/api/peluches/')

    assert response.status_code == 200
    assert response.data[0]['min_price'] == 0
    assert response.data[0]['discounted_min_price'] == 0


@pytest.mark.django_db
def test_peluches_list_rounds_discounted_annotated_price(api_client, peluch, size_small):
    """Fails if annotated prices lose the catalog's historical discount rounding."""
    peluch.discount_pct = 10
    peluch.save(update_fields=['discount_pct'])
    PeluchSizePrice.objects.create(peluch=peluch, size=size_small, price=99999, is_available=True)

    response = api_client.get('/api/peluches/')

    assert response.status_code == 200
    assert response.data[0]['min_price'] == 99999
    assert response.data[0]['discounted_min_price'] == 89999


@pytest.mark.django_db
def test_peluches_list_serializes_color_preview(
    api_client, peluch, color_pink, settings, tmp_path,
):
    """Fails if list prefetches stop preserving the color preview and gallery cover."""
    settings.MEDIA_ROOT = tmp_path
    color_image = PeluchColorImageFactory(peluch=peluch, color=color_pink)
    expected_url = color_image.attachment.file.url

    response = api_client.get('/api/peluches/')

    assert response.status_code == 200
    assert response.data[0]['available_colors'][0]['slug'] == color_pink.slug
    assert response.data[0]['available_colors'][0]['image_count'] == 1
    assert response.data[0]['available_colors'][0]['preview_url'] == expected_url
    assert response.data[0]['gallery_urls'][0] == expected_url


@pytest.mark.parametrize(
    ('is_available', 'expected_min_price'),
    [(True, 75000), (False, None)],
    ids=['available-price', 'unavailable-price'],
)
@pytest.mark.django_db
def test_peluches_list_query_budget_is_constant(
    api_client, settings, tmp_path, is_available, expected_min_price,
):
    """Fails if list serialization reintroduces per-product relation queries."""
    settings.MEDIA_ROOT = tmp_path
    _create_catalog_peluches(1, is_available=is_available)

    with CaptureQueriesContext(connection) as one_product_queries:
        one_product_response = api_client.get('/api/peluches/')

    _create_catalog_peluches(49, is_available=is_available)
    with CaptureQueriesContext(connection) as fifty_product_queries:
        fifty_product_response = api_client.get('/api/peluches/')

    assert one_product_response.status_code == 200
    assert fifty_product_response.status_code == 200
    assert len(one_product_response.data) == 1
    assert len(fifty_product_response.data) == 50
    assert {
        (item['min_price'], item['discounted_min_price'])
        for item in fifty_product_response.data
    } == {(expected_min_price, expected_min_price)}
    assert len(one_product_queries) == len(fifty_product_queries)
    assert len(fifty_product_queries) <= MAX_CATALOG_LIST_QUERIES


@pytest.mark.django_db
def test_peluches_list_filters_has_huella(api_client, peluch):
    """Verify catalog filtering by huella availability."""
    peluch.has_huella = True
    peluch.save()
    response = api_client.get('/api/peluches/?has_huella=true')
    assert response.status_code == 200
    assert len(response.data) == 1


@pytest.mark.django_db
def test_peluches_list_filters_has_audio(api_client, peluch):
    """Verify catalog filtering by audio availability."""
    peluch.has_audio = True
    peluch.save()
    response = api_client.get('/api/peluches/?has_audio=true')
    assert response.status_code == 200
    assert len(response.data) == 1


@pytest.mark.django_db
def test_peluches_list_sort_by_new(api_client, peluch):
    """Verify catalog sorting by newest rows."""
    response = api_client.get('/api/peluches/?sort=new')
    assert response.status_code == 200


@pytest.mark.django_db
def test_peluches_list_sort_by_price_asc(api_client, peluch_with_price):
    """Verify catalog sorting by price."""
    response = api_client.get('/api/peluches/?sort=price_asc')
    assert response.status_code == 200


@pytest.mark.django_db
def test_peluches_list_sort_by_top_rated(api_client, peluch):
    """Verify catalog sorting by rating."""
    response = api_client.get('/api/peluches/?sort=top_rated')
    assert response.status_code == 200


@pytest.mark.django_db
def test_peluches_post_returns_403_for_anonymous(api_client):
    """Verify anonymous peluch creation is forbidden."""
    response = api_client.post('/api/peluches/', {})
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Featured peluches
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_peluches_featured_returns_only_featured(api_client, peluch, featured_peluch):
    """Verify featured endpoint excludes ordinary peluches."""
    response = api_client.get('/api/peluches/featured/')
    assert response.status_code == 200
    slugs = [p['slug'] for p in response.data]
    assert 'peluche-destacado' in slugs
    assert 'osito-rosa' not in slugs


@pytest.mark.django_db
def test_peluches_featured_query_budget_is_constant(api_client, settings, tmp_path):
    """Fails if featured rows gain an N+1 query or an accidental four-row limit."""
    settings.MEDIA_ROOT = tmp_path
    _create_catalog_peluches(1, featured=True)

    with CaptureQueriesContext(connection) as one_product_queries:
        one_product_response = api_client.get('/api/peluches/featured/')

    _create_catalog_peluches(49, featured=True)
    with CaptureQueriesContext(connection) as fifty_product_queries:
        fifty_product_response = api_client.get('/api/peluches/featured/')

    assert one_product_response.status_code == 200
    assert fifty_product_response.status_code == 200
    assert len(one_product_response.data) == 1
    assert len(fifty_product_response.data) == 50
    assert len(one_product_queries) == len(fifty_product_queries)
    assert len(fifty_product_queries) <= MAX_CATALOG_LIST_QUERIES


# ---------------------------------------------------------------------------
# Peluch detail
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_peluch_detail_returns_200_for_existing_slug(api_client, peluch):
    """Verify detail returns an existing peluch."""
    response = api_client.get(f'/api/peluches/{peluch.slug}/')
    assert response.status_code == 200
    assert response.data['slug'] == peluch.slug


@pytest.mark.django_db
def test_peluch_detail_increments_view_count(api_client, peluch):
    """Verify detail reads increment the view count."""
    initial_count = peluch.view_count
    api_client.get(f'/api/peluches/{peluch.slug}/')
    peluch.refresh_from_db()
    assert peluch.view_count == initial_count + 1


@pytest.mark.django_db
def test_peluch_detail_returns_404_for_nonexistent_slug(api_client):
    """Verify detail rejects an unknown peluch slug."""
    response = api_client.get('/api/peluches/no-existe/')
    assert response.status_code == 404


@pytest.mark.django_db
def test_peluch_detail_delete_returns_403_for_anonymous(api_client, peluch):
    """Verify anonymous peluch deletion is forbidden."""
    response = api_client.delete(f'/api/peluches/{peluch.slug}/')
    assert response.status_code == 403


@pytest.mark.django_db
def test_peluch_detail_delete_removes_peluch(admin_client, peluch):
    """Verify a staff deletion removes the peluch."""
    response = admin_client.delete(f'/api/peluches/{peluch.slug}/')
    assert response.status_code == 204
    assert not Peluch.objects.filter(slug=peluch.slug).exists()


@pytest.mark.django_db
def test_peluch_detail_patch_returns_403_for_anonymous(api_client, peluch):
    """Verify anonymous peluch updates are forbidden."""
    response = api_client.patch(f'/api/peluches/{peluch.slug}/', {'title': 'Cambio'})
    assert response.status_code == 403

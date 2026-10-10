"""Verify catalog administration contracts and isolated photo draft lifecycles."""

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django_attachments.models import Library
from PIL import Image

from base_feature_app.models import (
    Category,
    GlobalColor,
    GlobalSize,
    Peluch,
    PeluchColorImage,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def size(db):
    """Create a catalog size for administrative requests."""
    return GlobalSize.objects.create(label='Chico', slug='chico', cm='15cm')


@pytest.fixture
def color(db):
    """Create a catalog color for administrative requests."""
    return GlobalColor.objects.create(name='Turquesa', slug='turquesa', hex_code='#40E0D0')


@pytest.fixture
def category(db):
    """Create an active category for administrative requests."""
    return Category.objects.create(name='Lobos', slug='lobos', is_active=True)


@pytest.fixture
def peluch(db, category, color):
    """Create an active product with its gallery and available color."""
    library = Library.objects.create(title='Admin Gallery')
    p = Peluch.objects.create(
        title='Lobo Gris',
        slug='lobo-gris',
        category=category,
        lead_description='Feroz',
        gallery=library,
        is_active=True,
    )
    p.available_colors.add(color)
    return p


# ---------------------------------------------------------------------------
# Sizes CRUD
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_peluch_post_rejects_missing_size_without_creating_gallery(admin_client, category):
    """Peluch post rejects missing size without creating gallery."""
    galleries = set(Library.objects.values_list('pk', flat=True))

    response = admin_client.post('/api/peluches/', {
        'title': 'Invalid size', 'slug': 'invalid-size', 'category': category.pk,
        'lead_description': 'Test', 'size_prices_data': [{'size_id': 999999, 'price': 50000}],
    }, format='json')

    assert response.status_code == 400
    assert not Peluch.objects.filter(slug='invalid-size').exists()
    assert set(Library.objects.values_list('pk', flat=True)) == galleries


@pytest.mark.django_db
def test_peluch_patch_rejects_missing_size_without_updating_product(admin_client, peluch):
    """Peluch patch rejects missing size without updating product."""
    response = admin_client.patch(f'/api/peluches/{peluch.slug}/', {
        'lead_description': 'Changed', 'size_prices_data': [{'size_id': 999999, 'price': 50000}],
    }, format='json')

    assert response.status_code == 400
    peluch.refresh_from_db()
    assert peluch.lead_description == 'Feroz'

@pytest.mark.django_db
def test_sizes_post_creates_size_as_admin(admin_client):
    """Sizes post creates size as admin."""
    response = admin_client.post('/api/sizes/', {'label': 'Gigante', 'cm': '100cm'})
    assert response.status_code == 201
    assert GlobalSize.objects.filter(label='Gigante').exists()


@pytest.mark.django_db
def test_sizes_post_returns_403_for_anonymous(api_client):
    """Sizes post returns 403 for anonymous."""
    response = api_client.post('/api/sizes/', {'label': 'Gigante', 'cm': '100cm'})
    assert response.status_code == 403


@pytest.mark.django_db
def test_sizes_post_returns_400_for_invalid_data(admin_client):
    """Sizes post returns 400 for invalid data."""
    response = admin_client.post('/api/sizes/', {})
    assert response.status_code == 400


@pytest.mark.django_db
def test_size_detail_patch_updates_label(admin_client, size):
    """Size detail patch updates label."""
    response = admin_client.patch(f'/api/sizes/{size.id}/', {'label': 'Chico Plus'})
    assert response.status_code == 200
    size.refresh_from_db()
    assert size.label == 'Chico Plus'


@pytest.mark.django_db
def test_size_detail_delete_removes_size(admin_client, size):
    """Size detail delete removes size."""
    size_id = size.id
    response = admin_client.delete(f'/api/sizes/{size.id}/')
    assert response.status_code == 204
    assert not GlobalSize.objects.filter(id=size_id).exists()


@pytest.mark.django_db
def test_size_detail_returns_403_for_anonymous(api_client, size):
    """Size detail returns 403 for anonymous."""
    response = api_client.patch(f'/api/sizes/{size.id}/', {'label': 'X'})
    assert response.status_code == 403


@pytest.mark.django_db
def test_size_detail_returns_404_for_unknown_id(admin_client):
    """Size detail returns 404 for unknown id."""
    response = admin_client.delete('/api/sizes/99999/')
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Colors CRUD
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_colors_post_creates_color_as_admin(admin_client):
    """Colors post creates color as admin."""
    response = admin_client.post('/api/colors/', {'name': 'Carmesí', 'hex_code': '#DC143C'})
    assert response.status_code == 201
    assert GlobalColor.objects.filter(name='Carmesí').exists()


@pytest.mark.django_db
def test_colors_post_returns_403_for_anonymous(api_client):
    """Colors post returns 403 for anonymous."""
    response = api_client.post('/api/colors/', {'name': 'Carmesí', 'hex_code': '#DC143C'})
    assert response.status_code == 403


@pytest.mark.django_db
def test_color_detail_patch_updates_color(admin_client, color):
    """Color detail patch updates color."""
    response = admin_client.patch(f'/api/colors/{color.id}/', {'name': 'Turquesa Oscuro'})
    assert response.status_code == 200
    color.refresh_from_db()
    assert color.name == 'Turquesa Oscuro'


@pytest.mark.django_db
def test_color_detail_delete_removes_color(admin_client, color):
    """Color detail delete removes color."""
    color_id = color.id
    response = admin_client.delete(f'/api/colors/{color.id}/')
    assert response.status_code == 204
    assert not GlobalColor.objects.filter(id=color_id).exists()


@pytest.mark.django_db
def test_color_detail_returns_404_for_unknown_id(admin_client):
    """Color detail returns 404 for unknown id."""
    response = admin_client.delete('/api/colors/99999/')
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Peluches featured & detail
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_peluches_featured_returns_featured_peluches(api_client, category, db):
    """Peluches featured returns featured peluches."""
    library = Library.objects.create(title='Featured')
    Peluch.objects.create(
        title='Destacado', slug='destacado-admin', category=category,
        lead_description='El mejor', gallery=library, is_active=True, is_featured=True,
    )
    response = api_client.get('/api/peluches/featured/')
    assert response.status_code == 200
    slugs = [p['slug'] for p in response.data]
    assert 'destacado-admin' in slugs


@pytest.mark.django_db
def test_peluch_detail_get_returns_200(api_client, peluch):
    """Peluch detail get returns 200."""
    response = api_client.get(f'/api/peluches/{peluch.slug}/')
    assert response.status_code == 200
    assert response.data['slug'] == peluch.slug


@pytest.mark.django_db
def test_peluch_detail_get_returns_404_for_unknown_slug(api_client):
    """Peluch detail get returns 404 for unknown slug."""
    response = api_client.get('/api/peluches/no-existe/')
    assert response.status_code == 404


@pytest.mark.django_db
def test_peluch_detail_patch_updates_title_as_admin(admin_client, peluch):
    """Peluch detail patch updates title as admin."""
    response = admin_client.patch(f'/api/peluches/{peluch.slug}/', {'lead_description': 'Updated'})
    assert response.status_code == 200
    peluch.refresh_from_db()
    assert peluch.lead_description == 'Updated'


@pytest.mark.django_db
def test_peluch_detail_delete_removes_peluch_as_admin(admin_client, peluch):
    """Peluch detail delete removes peluch as admin."""
    slug = peluch.slug
    response = admin_client.delete(f'/api/peluches/{peluch.slug}/')
    assert response.status_code == 204
    assert not Peluch.objects.filter(slug=slug).exists()


@pytest.mark.django_db
def test_peluches_post_returns_403_for_anonymous(api_client):
    """Peluches post returns 403 for anonymous."""
    response = api_client.post('/api/peluches/', {'title': 'Nuevo'})
    assert response.status_code == 403


@pytest.mark.django_db
def test_peluch_bulk_category_updates_peluches(admin_client, peluch, category, db):
    """Peluch bulk category updates peluches."""
    new_cat = Category.objects.create(name='Delfines', slug='delfines')
    response = admin_client.patch(
        '/api/peluches/bulk-category/',
        {'slug_list': [peluch.slug], 'category_id': new_cat.id},
        format='json',
    )
    assert response.status_code == 200
    peluch.refresh_from_db()
    assert peluch.category_id == new_cat.id


@pytest.fixture
def draft(peluch):
    """Keep the product inactive for draft permission checks."""
    peluch.is_active = False
    peluch.save(update_fields=['is_active'])
    return peluch


@pytest.mark.django_db
@pytest.mark.parametrize(('client_fixture', 'expected_status'), [
    ('admin_client', 200), ('authenticated_client', 404), ('api_client', 404),
])
def test_draft_detail_visibility(request, draft, client_fixture, expected_status):
    """Draft detail visibility."""
    client = request.getfixturevalue(client_fixture)

    response = client.get(f'/api/peluches/{draft.slug}/')

    assert response.status_code == expected_status


@pytest.mark.django_db
@pytest.mark.parametrize(('client_fixture', 'expected_status', 'expected_description'), [
    ('admin_client', 200, 'Draft revised'),
    ('authenticated_client', 404, 'Feroz'), ('api_client', 404, 'Feroz'),
])
def test_draft_detail_update_permission(request, draft, client_fixture, expected_status, expected_description):
    """Draft detail update permission."""
    client = request.getfixturevalue(client_fixture)

    response = client.patch(f'/api/peluches/{draft.slug}/', {'lead_description': 'Draft revised'}, format='json')

    assert response.status_code == expected_status
    draft.refresh_from_db()
    assert draft.lead_description == expected_description
    assert draft.is_active is False


@pytest.mark.django_db
@pytest.mark.parametrize(('client_fixture', 'expected_status', 'expected_exists'), [
    ('admin_client', 204, False), ('authenticated_client', 404, True), ('api_client', 404, True),
])
def test_draft_detail_delete_permission(request, draft, client_fixture, expected_status, expected_exists):
    """Draft detail delete permission."""
    client = request.getfixturevalue(client_fixture)
    draft_id = draft.pk

    response = client.delete(f'/api/peluches/{draft.slug}/')

    assert response.status_code == expected_status
    assert Peluch.objects.filter(pk=draft_id).exists() is expected_exists


@pytest.mark.django_db
@pytest.mark.parametrize('client_fixture', ['api_client', 'authenticated_client'])
def test_published_detail_keeps_public_response(request, peluch, client_fixture):
    """Published detail keeps public response."""
    client = request.getfixturevalue(client_fixture)

    response = client.get(f'/api/peluches/{peluch.slug}/')

    assert response.status_code == 200
    assert response.data['slug'] == peluch.slug
    assert 'is_active' not in response.data


@pytest.mark.django_db
@pytest.mark.parametrize(('client_fixture', 'method'), [
    ('api_client', 'patch'), ('api_client', 'delete'),
    ('authenticated_client', 'patch'), ('authenticated_client', 'delete'),
])
def test_published_detail_rejects_nonstaff_mutation(request, peluch, client_fixture, method):
    """Published detail rejects nonstaff mutation."""
    client = request.getfixturevalue(client_fixture)

    response = getattr(client, method)(f'/api/peluches/{peluch.slug}/', {'lead_description': 'Forbidden'}, format='json')

    assert response.status_code == 403
    peluch.refresh_from_db()
    assert peluch.lead_description == 'Feroz'
    assert peluch.is_active is True


@pytest.mark.django_db
@pytest.mark.parametrize('method', ['get', 'patch', 'delete'])
def test_staff_detail_missing_slug_returns_404(admin_client, method):
    """Staff detail missing slug returns 404."""
    response = getattr(admin_client, method)('/api/peluches/missing-draft/')

    assert response.status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize('is_active', [False, True])
def test_staff_detail_reports_publication_state(admin_client, peluch, is_active):
    """Staff detail reports publication state."""
    peluch.is_active = is_active
    peluch.save(update_fields=['is_active'])

    response = admin_client.get(f'/api/peluches/{peluch.slug}/')

    assert response.status_code == 200
    assert response.data['is_active'] is is_active


@pytest.mark.django_db
def test_draft_detail_get_keeps_view_counter_increment(admin_client, draft):
    """Draft detail get keeps view counter increment."""
    before = draft.view_count

    response = admin_client.get(f'/api/peluches/{draft.slug}/')

    assert response.status_code == 200
    draft.refresh_from_db()
    assert draft.view_count == before + 1


@pytest.fixture
def isolated_catalog_media(settings, tmp_path):
    """Keep uploaded catalog files inside this test temporary directory."""
    settings.MEDIA_ROOT = str(tmp_path / 'catalog-media')


def _create_photo_draft(admin_client, category, color):
    response = admin_client.post('/api/peluches/', {
        'title': 'Photo draft', 'slug': 'photo-draft', 'category': category.pk,
        'lead_description': 'Waiting for publication', 'is_active': False,
        'available_color_ids': [color.pk],
    }, format='json')
    assert response.status_code == 201
    assert response.data['is_active'] is False
    return Peluch.objects.get(slug=response.data['slug'])


def _upload_draft_photo(admin_client, draft, color, filename):
    content = io.BytesIO()
    Image.new('RGB', (2, 2), 'red').save(content, format='PNG')
    image = SimpleUploadedFile(filename, content.getvalue(), content_type='image/png')
    response = admin_client.post(
        f'/api/peluches/{draft.slug}/color-image/{color.slug}/',
        {'image': image}, format='multipart',
    )
    assert response.status_code == 201
    return response.data['id']


@pytest.mark.django_db
def test_photo_draft_can_publish_after_second_upload(admin_client, category, color, isolated_catalog_media):
    """Photo draft can publish after second upload."""
    draft = _create_photo_draft(admin_client, category, color)
    first_id = _upload_draft_photo(admin_client, draft, color, 'first.png')
    update = admin_client.patch(f'/api/peluches/{draft.slug}/', {
        'available_color_ids': [color.pk],
    }, format='json')
    assert update.status_code == 200
    assert update.data['is_active'] is False
    second_id = _upload_draft_photo(admin_client, draft, color, 'second.png')

    response = admin_client.patch(f'/api/peluches/{draft.slug}/', {'is_active': True}, format='json')

    assert response.status_code == 200
    assert response.data['is_active'] is True
    draft.refresh_from_db()
    assert draft.is_active is True
    assert set(draft.color_images.values_list('pk', flat=True)) == {first_id, second_id}


@pytest.mark.django_db
def test_photo_draft_can_be_discarded(admin_client, category, color, isolated_catalog_media):
    """Photo draft can be discarded."""
    draft = _create_photo_draft(admin_client, category, color)
    photo_id = _upload_draft_photo(admin_client, draft, color, 'discard.png')
    draft_id = draft.pk

    response = admin_client.delete(f'/api/peluches/{draft.slug}/')

    assert response.status_code == 204
    assert not Peluch.objects.filter(pk=draft_id).exists()
    assert not PeluchColorImage.objects.filter(pk=photo_id).exists()


@pytest.mark.django_db
def test_photo_draft_edit_can_preserve_inactive_state(admin_client, category, color, isolated_catalog_media):
    """Photo draft edit can preserve inactive state."""
    draft = _create_photo_draft(admin_client, category, color)
    photo_id = _upload_draft_photo(admin_client, draft, color, 'retain.png')
    detail = admin_client.get(f'/api/peluches/{draft.slug}/')
    assert detail.status_code == 200
    assert detail.data['is_active'] is False

    response = admin_client.patch(f'/api/peluches/{draft.slug}/', {
        'lead_description': 'Edited draft', 'is_active': detail.data['is_active'],
    }, format='json')

    assert response.status_code == 200
    draft.refresh_from_db()
    assert draft.is_active is False
    assert draft.lead_description == 'Edited draft'
    assert draft.color_images.get(pk=photo_id).peluch_id == draft.pk

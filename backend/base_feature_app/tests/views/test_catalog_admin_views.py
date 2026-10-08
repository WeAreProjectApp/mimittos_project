import pytest
from django_attachments.models import Library

from base_feature_app.models import Category, GlobalColor, GlobalSize, Peluch

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def size(db):
    return GlobalSize.objects.create(label='Chico', slug='chico', cm='15cm')


@pytest.fixture
def color(db):
    return GlobalColor.objects.create(name='Turquesa', slug='turquesa', hex_code='#40E0D0')


@pytest.fixture
def category(db):
    return Category.objects.create(name='Lobos', slug='lobos', is_active=True)


@pytest.fixture
def peluch(db, category, color):
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
    response = admin_client.patch(f'/api/peluches/{peluch.slug}/', {
        'lead_description': 'Changed', 'size_prices_data': [{'size_id': 999999, 'price': 50000}],
    }, format='json')

    assert response.status_code == 400
    peluch.refresh_from_db()
    assert peluch.lead_description == 'Feroz'

@pytest.mark.django_db
def test_sizes_post_creates_size_as_admin(admin_client):
    response = admin_client.post('/api/sizes/', {'label': 'Gigante', 'cm': '100cm'})
    assert response.status_code == 201
    assert GlobalSize.objects.filter(label='Gigante').exists()


@pytest.mark.django_db
def test_sizes_post_returns_403_for_anonymous(api_client):
    response = api_client.post('/api/sizes/', {'label': 'Gigante', 'cm': '100cm'})
    assert response.status_code == 403


@pytest.mark.django_db
def test_sizes_post_returns_400_for_invalid_data(admin_client):
    response = admin_client.post('/api/sizes/', {})
    assert response.status_code == 400


@pytest.mark.django_db
def test_size_detail_patch_updates_label(admin_client, size):
    response = admin_client.patch(f'/api/sizes/{size.id}/', {'label': 'Chico Plus'})
    assert response.status_code == 200
    size.refresh_from_db()
    assert size.label == 'Chico Plus'


@pytest.mark.django_db
def test_size_detail_delete_removes_size(admin_client, size):
    size_id = size.id
    response = admin_client.delete(f'/api/sizes/{size.id}/')
    assert response.status_code == 204
    assert not GlobalSize.objects.filter(id=size_id).exists()


@pytest.mark.django_db
def test_size_detail_returns_403_for_anonymous(api_client, size):
    response = api_client.patch(f'/api/sizes/{size.id}/', {'label': 'X'})
    assert response.status_code == 403


@pytest.mark.django_db
def test_size_detail_returns_404_for_unknown_id(admin_client):
    response = admin_client.delete('/api/sizes/99999/')
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Colors CRUD
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_colors_post_creates_color_as_admin(admin_client):
    response = admin_client.post('/api/colors/', {'name': 'Carmesí', 'hex_code': '#DC143C'})
    assert response.status_code == 201
    assert GlobalColor.objects.filter(name='Carmesí').exists()


@pytest.mark.django_db
def test_colors_post_returns_403_for_anonymous(api_client):
    response = api_client.post('/api/colors/', {'name': 'Carmesí', 'hex_code': '#DC143C'})
    assert response.status_code == 403


@pytest.mark.django_db
def test_color_detail_patch_updates_color(admin_client, color):
    response = admin_client.patch(f'/api/colors/{color.id}/', {'name': 'Turquesa Oscuro'})
    assert response.status_code == 200
    color.refresh_from_db()
    assert color.name == 'Turquesa Oscuro'


@pytest.mark.django_db
def test_color_detail_delete_removes_color(admin_client, color):
    color_id = color.id
    response = admin_client.delete(f'/api/colors/{color.id}/')
    assert response.status_code == 204
    assert not GlobalColor.objects.filter(id=color_id).exists()


@pytest.mark.django_db
def test_color_detail_returns_404_for_unknown_id(admin_client):
    response = admin_client.delete('/api/colors/99999/')
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Peluches featured & detail
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_peluches_featured_returns_featured_peluches(api_client, category, db):
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
    response = api_client.get(f'/api/peluches/{peluch.slug}/')
    assert response.status_code == 200
    assert response.data['slug'] == peluch.slug


@pytest.mark.django_db
def test_peluch_detail_get_returns_404_for_unknown_slug(api_client):
    response = api_client.get('/api/peluches/no-existe/')
    assert response.status_code == 404


@pytest.mark.django_db
def test_peluch_detail_patch_updates_title_as_admin(admin_client, peluch):
    response = admin_client.patch(f'/api/peluches/{peluch.slug}/', {'lead_description': 'Updated'})
    assert response.status_code == 200
    peluch.refresh_from_db()
    assert peluch.lead_description == 'Updated'


@pytest.mark.django_db
def test_peluch_detail_delete_removes_peluch_as_admin(admin_client, peluch):
    slug = peluch.slug
    response = admin_client.delete(f'/api/peluches/{peluch.slug}/')
    assert response.status_code == 204
    assert not Peluch.objects.filter(slug=slug).exists()


@pytest.mark.django_db
def test_peluches_post_returns_403_for_anonymous(api_client):
    response = api_client.post('/api/peluches/', {'title': 'Nuevo'})
    assert response.status_code == 403


@pytest.mark.django_db
def test_peluch_bulk_category_updates_peluches(admin_client, peluch, category, db):
    new_cat = Category.objects.create(name='Delfines', slug='delfines')
    response = admin_client.patch(
        '/api/peluches/bulk-category/',
        {'slug_list': [peluch.slug], 'category_id': new_cat.id},
        format='json',
    )
    assert response.status_code == 200
    peluch.refresh_from_db()
    assert peluch.category_id == new_cat.id

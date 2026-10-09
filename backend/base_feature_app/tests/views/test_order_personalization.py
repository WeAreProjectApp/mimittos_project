"""Test that order creation charges and keeps the customer's personalization."""

import pytest
from django_attachments.models import Library

from base_feature_app.models import (
    Category,
    GlobalColor,
    GlobalSize,
    OrderItem,
    Peluch,
    PeluchSizePrice,
)

BASE_PRICE = 80000
HUELLA_EXTRA_COST = 15000
CORAZON_EXTRA_COST = 12000


@pytest.fixture
def size(db):
    """Provide the size the personalized peluch is sold in."""
    return GlobalSize.objects.create(label='Pequeño', slug='pequeno-personalizado', cm='20cm')


@pytest.fixture
def color(db):
    """Provide the color the personalized peluch is sold in."""
    return GlobalColor.objects.create(name='Rosa', slug='rosa-personalizado', hex_code='#FF69B4')


@pytest.fixture
def personalized_peluch(db, size, color):
    """Provide a peluch that offers a priced huella and a priced corazón."""
    category = Category.objects.create(name='Osos', slug='osos-personalizados', is_active=True)
    peluch = Peluch.objects.create(
        title='Osito personalizable',
        slug='osito-personalizable',
        category=category,
        lead_description='Hecho a mano',
        gallery=Library.objects.create(title='Galería personalizable'),
        has_huella=True,
        has_corazon=True,
        huella_extra_cost=HUELLA_EXTRA_COST,
        corazon_extra_cost=CORAZON_EXTRA_COST,
    )
    peluch.available_colors.add(color)
    PeluchSizePrice.objects.create(peluch=peluch, size=size, price=BASE_PRICE)
    return peluch


def _order_request(peluch, size, color, **personalization):
    """Build a guest order for one unit carrying the given personalization."""
    item = {
        'peluch_id': peluch.id,
        'size_id': size.id,
        'color_id': color.id,
        'quantity': 1,
        'has_huella': False,
        'has_corazon': False,
        'has_audio': False,
        **personalization,
    }
    return {
        'customer_name': 'Ana García',
        'customer_email': 'ana@example.com',
        'customer_phone': '3001234567',
        'address': 'Calle 123',
        'city': 'Bogotá',
        'department': 'Cundinamarca',
        'items': [item],
    }


@pytest.mark.django_db
def test_create_order_charges_requested_personalization_extras(api_client, personalized_peluch, size, color):
    """Fails if a requested huella or corazón stops adding its extra cost to the charged total."""
    payload = _order_request(
        personalized_peluch, size, color,
        has_huella=True, huella_type='name', huella_text='Luna',
        has_corazon=True, corazon_phrase='Te quiero mucho',
    )

    response = api_client.post('/api/orders/', payload, format='json')

    assert response.status_code == 201
    assert response.data['total_amount'] == 107000


@pytest.mark.django_db
def test_create_order_skips_unrequested_personalization_extras(api_client, personalized_peluch, size, color):
    """Fails if a peluch that only offers personalization charges extras nobody requested."""
    payload = _order_request(personalized_peluch, size, color)

    response = api_client.post('/api/orders/', payload, format='json')

    assert response.status_code == 201
    assert response.data['total_amount'] == 80000


@pytest.mark.django_db
def test_create_order_persists_the_huella_name(api_client, personalized_peluch, size, color):
    """Fails if the typed huella name is dropped before the workshop reads the order."""
    payload = _order_request(
        personalized_peluch, size, color, has_huella=True, huella_type='name', huella_text='Luna',
    )

    response = api_client.post('/api/orders/', payload, format='json')

    assert response.status_code == 201
    item = OrderItem.objects.get(order__order_number=response.data['order_number'])
    assert item.huella_type == 'name'
    assert item.huella_text == 'Luna'


@pytest.mark.django_db
def test_create_order_persists_the_corazon_phrase(api_client, personalized_peluch, size, color):
    """Fails if the typed corazón phrase is dropped before the workshop reads the order."""
    payload = _order_request(
        personalized_peluch, size, color, has_corazon=True, corazon_phrase='Te quiero mucho',
    )

    response = api_client.post('/api/orders/', payload, format='json')

    assert response.status_code == 201
    item = OrderItem.objects.get(order__order_number=response.data['order_number'])
    assert item.corazon_phrase == 'Te quiero mucho'

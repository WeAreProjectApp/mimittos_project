"""Wire contract of POST /api/orders/ per-line errors.

frontend/app/checkout/page.tsx maps each key of ``items`` to the cart line that
needs correction, so the JSON shape is part of the API contract.
"""
import pytest

from base_feature_app.models import Order
from base_feature_app.tests.factories import (
    GlobalColorFactory,
    GlobalSizeFactory,
    PeluchFactory,
    PeluchSizePriceFactory,
)

REMOVED_MEDIA_ID = 999999


def _order_payload(lines):
    return {
        'customer_name': 'Ana',
        'customer_email': 'ana@example.com',
        'address': 'Calle 1',
        'city': 'Bogotá',
        'department': 'Cundinamarca',
        'payment_mode': 'deposit',
        'items': lines,
    }


@pytest.mark.django_db
def test_create_order_keys_removed_media_error_by_failing_line_index(api_client):
    """Fails if per-line errors stop being an object keyed by the failing cart index.

    The daily cleanup deletes unused personalization files; a returning customer
    must see the recovery link on the second line, which the checkout locates
    through the ``"1"`` key of this response.
    """
    color = GlobalColorFactory()
    size = GlobalSizeFactory()
    plain = PeluchFactory(colors=[color])
    personalizable = PeluchFactory(colors=[color], has_huella=True, huella_extra_cost=5000)
    PeluchSizePriceFactory(peluch=plain, size=size, price=80000)
    PeluchSizePriceFactory(peluch=personalizable, size=size, price=90000)
    lines = [
        {'peluch_id': plain.pk, 'size_id': size.pk, 'color_id': color.pk, 'quantity': 1},
        {
            'peluch_id': personalizable.pk, 'size_id': size.pk, 'color_id': color.pk, 'quantity': 1,
            'has_huella': True, 'huella_type': 'image', 'huella_media_id': REMOVED_MEDIA_ID,
        },
    ]

    response = api_client.post('/api/orders/', _order_payload(lines), format='json')

    assert response.status_code == 400
    assert response.json() == {'items': {'1': {'huella_media_id': ['Imagen de huella no encontrada.']}}}


@pytest.mark.django_db
@pytest.mark.parametrize(('field', 'invalid_value', 'message'), [
    ('quantity', 11, 'Ensure this value is less than or equal to 10.'),
    ('peluch_id', 999999, 'Peluche no encontrado.'),
    ('size_id', 999999, 'Tamaño no válido.'),
    ('color_id', 999999, 'Color no válido.'),
])
def test_create_order_keys_cart_validation_error_by_failing_line_index(api_client, field, invalid_value, message):
    """A rejected cart line must expose its actionable error without creating an order."""
    color = GlobalColorFactory()
    size = GlobalSizeFactory()
    peluch = PeluchFactory(colors=[color])
    PeluchSizePriceFactory(peluch=peluch, size=size, price=80000)
    valid_line = {'peluch_id': peluch.pk, 'size_id': size.pk, 'color_id': color.pk, 'quantity': 1}
    lines = [valid_line, {**valid_line, field: invalid_value}]

    response = api_client.post('/api/orders/', _order_payload(lines), format='json')

    assert response.status_code == 400
    assert response.json() == {'items': {'1': {field: [message]}}}
    assert not Order.objects.exists()

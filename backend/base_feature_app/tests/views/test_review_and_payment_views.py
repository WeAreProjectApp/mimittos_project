"""Review and payment API behavior."""

# ruff: noqa: D100, D103

import hashlib
import json
from unittest.mock import patch

import pytest
from django.test import override_settings
from django_attachments.models import Library
from rest_framework.test import APIClient

from base_feature_app.models import (
    Category,
    GlobalColor,
    Order,
    Peluch,
    Review,
    WompiTransaction,
)
from base_feature_app.services.order_access_service import OrderAccessService

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def existing_user(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.create_user(email='user@example.com', password='pass')


@pytest.fixture
def admin_user(db):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    u = User.objects.create_user(email='admin@example.com', password='pass')
    u.is_staff = True
    u.save(update_fields=['is_staff'])
    return u


@pytest.fixture
def auth_client(existing_user):
    client = APIClient()
    client.force_authenticate(user=existing_user)
    return client


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def category(db):
    return Category.objects.create(name='Osos', slug='osos', is_active=True)


@pytest.fixture
def color(db):
    return GlobalColor.objects.create(name='Rosa', slug='rosa', hex_code='#FF69B4')


@pytest.fixture
def peluch(db, category, color):
    library = Library.objects.create(title='Peluch Gallery')
    p = Peluch.objects.create(
        title='Osito',
        slug='osito',
        category=category,
        lead_description='Adorable',
        description='Descripción',
        gallery=library,
    )
    p.available_colors.add(color)
    return p


@pytest.fixture
def approved_review(db, peluch, existing_user):
    return Review.objects.create(
        peluch=peluch,
        user=existing_user,
        rating=5,
        comment='Excelente peluche',
        is_approved=True,
    )


@pytest.fixture
def pending_review(db, peluch, existing_user):
    return Review.objects.create(
        peluch=peluch,
        user=existing_user,
        rating=4,
        comment='Muy bueno',
        is_approved=False,
    )


@pytest.fixture
def existing_order(db, existing_user):
    return Order.objects.create(
        order_number='MMT-20260420-RVW1',
        customer=existing_user,
        customer_email=existing_user.email,
        customer_name='Test User',
        address='Calle 1',
        city='Bogotá',
        department='Cundinamarca',
        total_amount=80000,
        deposit_amount=40000,
        balance_amount=40000,
        status=Order.Status.DELIVERED,
    )


@pytest.fixture
def wompi_tx(db, existing_order, api_client):
    transaction = WompiTransaction.objects.create(
        order=existing_order,
        reference='REF-TEST-001',
        amount_in_cents=4000000,
        status=WompiTransaction.Status.PENDING,
        checkout_url='https://checkout.wompi.co/l/test',
    )
    api_client.credentials(
        HTTP_X_ORDER_ACCESS=OrderAccessService.grant_access(existing_order)['order_access_token'],
    )
    return transaction


@pytest.fixture
def delivered_order_with_peluch(db, existing_user, peluch, color):
    from base_feature_app.models import GlobalSize, Order, OrderItem
    size = GlobalSize.objects.create(label='Mediano', slug='mediano-rvw', cm='30cm')
    order = Order.objects.create(
        order_number='MMT-20260420-RVW3',
        customer=existing_user,
        customer_email=existing_user.email,
        customer_name='Test User',
        address='Calle 1',
        city='Bogotá',
        department='Cundinamarca',
        total_amount=80000,
        deposit_amount=40000,
        balance_amount=0,
        status=Order.Status.DELIVERED,
    )
    OrderItem.objects.create(
        order=order,
        peluch=peluch,
        size=size,
        color=color,
        quantity=1,
        unit_price=80000,
    )
    return order


# ---------------------------------------------------------------------------
# GET /api/peluches/<slug>/reviews/ — list approved reviews
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_reviews_list_returns_approved_reviews(api_client, peluch, approved_review):
    response = api_client.get(f'/api/peluches/{peluch.slug}/reviews/')
    assert response.status_code == 200
    assert len(response.data) == 1


@pytest.mark.django_db
def test_reviews_list_excludes_unapproved_reviews(api_client, peluch, pending_review):
    response = api_client.get(f'/api/peluches/{peluch.slug}/reviews/')
    assert response.status_code == 200
    assert len(response.data) == 0


@pytest.mark.django_db
def test_reviews_list_returns_404_for_nonexistent_peluch(api_client):
    response = api_client.get('/api/peluches/no-existe/reviews/')
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/peluches/<slug>/reviews/ — create review
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_create_review_returns_201_for_authenticated_user(auth_client, peluch, delivered_order_with_peluch):
    payload = {'rating': 5, 'comment': 'Increíble calidad'}
    response = auth_client.post(f'/api/peluches/{peluch.slug}/reviews/', payload)
    assert response.status_code == 201
    assert Review.objects.filter(peluch=peluch, rating=5).exists()


@pytest.mark.django_db
def test_create_review_returns_401_for_anonymous(api_client, peluch):
    payload = {'rating': 5, 'comment': 'Bonito'}
    response = api_client.post(f'/api/peluches/{peluch.slug}/reviews/', payload)
    assert response.status_code == 401


@pytest.mark.django_db
def test_create_review_returns_400_for_invalid_rating(auth_client, peluch):
    payload = {'rating': 10, 'comment': 'Muy bueno'}
    response = auth_client.post(f'/api/peluches/{peluch.slug}/reviews/', payload)
    assert response.status_code == 400


@pytest.mark.django_db
def test_create_review_returns_400_for_missing_comment(auth_client, peluch):
    payload = {'rating': 4}
    response = auth_client.post(f'/api/peluches/{peluch.slug}/reviews/', payload)
    assert response.status_code == 400


@pytest.mark.django_db
def test_create_review_returns_400_for_nonexistent_order(auth_client, peluch):
    payload = {'rating': 5, 'comment': 'Llegó perfecto', 'order_id': 99999}
    response = auth_client.post(f'/api/peluches/{peluch.slug}/reviews/', payload)
    assert response.status_code == 400


@pytest.mark.django_db
def test_create_review_returns_400_when_order_not_delivered(auth_client, peluch, existing_order):
    payload = {'rating': 5, 'comment': 'Llegó perfecto', 'order_id': existing_order.id}
    response = auth_client.post(f'/api/peluches/{peluch.slug}/reviews/', payload)
    assert response.status_code == 400


@pytest.mark.django_db
def test_create_review_returns_404_for_nonexistent_peluch(auth_client):
    payload = {'rating': 5, 'comment': 'Bonito'}
    response = auth_client.post('/api/peluches/no-existe/reviews/', payload)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/reviews/<id>/approve/ — approve review
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_approve_review_sets_is_approved(admin_client, pending_review):
    response = admin_client.patch(f'/api/reviews/{pending_review.id}/approve/', {'is_approved': True})
    assert response.status_code == 200
    pending_review.refresh_from_db()
    assert pending_review.is_approved is True


@pytest.mark.django_db
def test_approve_review_can_reject(admin_client, approved_review):
    response = admin_client.patch(f'/api/reviews/{approved_review.id}/approve/', {'is_approved': False})
    assert response.status_code == 200
    approved_review.refresh_from_db()
    assert approved_review.is_approved is False


@pytest.mark.django_db
def test_approve_review_returns_403_for_anonymous(api_client, pending_review):
    response = api_client.patch(f'/api/reviews/{pending_review.id}/approve/', {'is_approved': True})
    assert response.status_code == 403


@pytest.mark.django_db
def test_approve_review_returns_404_for_nonexistent(admin_client):
    response = admin_client.patch('/api/reviews/99999/approve/', {'is_approved': True})
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/payment/wompi/webhook/ — Wompi webhook
# ---------------------------------------------------------------------------

def _make_wompi_event(secret: str, event_type: str = 'transaction.updated',
                      tx_id: str = 'tx-v-001', status: str = 'APPROVED',
                      amount: int = 4000000, currency: str = 'COP',
                      reference: str = 'REF-VIEW-001') -> dict:
    """Build a Wompi event_data dict with a valid SHA256 checksum."""
    sent_at = '2026-04-21T12:00:00.000Z'
    properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents',
                  'transaction.currency', 'transaction.reference']
    tx = {'id': tx_id, 'status': status, 'amount_in_cents': amount,
          'currency': currency, 'reference': reference, 'payment_method_type': 'CARD'}
    data = {'transaction': tx}

    concat = ''
    for prop in properties:
        value = data
        for part in prop.split('.'):
            value = value[part]
        concat += str(value)

    from datetime import datetime
    dt = datetime.fromisoformat(sent_at.replace('Z', '+00:00'))
    concat += str(int(dt.timestamp()))
    concat += secret

    checksum = hashlib.sha256(concat.encode()).hexdigest()
    return {
        'event': event_type,
        'data': data,
        'sent_at': sent_at,
        'signature': {'checksum': checksum, 'properties': properties},
    }


@pytest.mark.django_db
@override_settings(WOMPI_EVENTS_SECRET='test_secret')
def test_wompi_webhook_returns_400_for_invalid_signature(api_client):
    event = _make_wompi_event('wrong_secret')
    response = api_client.post(
        '/api/payment/wompi/webhook/',
        data=json.dumps(event),
        content_type='application/json',
    )
    assert response.status_code == 400


@pytest.mark.django_db
@override_settings(WOMPI_EVENTS_SECRET='test_secret')
def test_wompi_webhook_returns_200_for_valid_signature(api_client):
    event = _make_wompi_event('test_secret', event_type='other.event')
    response = api_client.post(
        '/api/payment/wompi/webhook/',
        data=json.dumps(event),
        content_type='application/json',
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_wompi_webhook_returns_400_for_invalid_json(api_client):
    response = api_client.post(
        '/api/payment/wompi/webhook/',
        data=b'not-json',
        content_type='application/json',
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# GET /api/payment/status/<reference>/ — payment status
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_payment_status_returns_200_for_valid_reference(api_client, wompi_tx):
    response = api_client.get(f'/api/payment/status/{wompi_tx.reference}/')
    assert response.status_code == 200
    assert response.data['reference'] == wompi_tx.reference
    assert response.data['order_number'] == wompi_tx.order.order_number


@pytest.mark.django_db
def test_payment_status_hides_nonexistent_reference_without_capability(api_client):
    """Falla si una referencia inexistente permite enumerar pagos."""
    response = api_client.get('/api/payment/status/REF-NO-EXISTE/')
    assert response.status_code == 403
    assert response.data['code'] == 'order_access_required'


# ---------------------------------------------------------------------------
# POST /api/payment/process/ — PSE persona jurídica requiere NIT
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_process_payment_pse_rejects_legal_entity_without_nit(api_client, wompi_tx):
    response = api_client.post('/api/payment/process/', {
        'order_number': wompi_tx.order.order_number,
        'method': 'PSE',
        'bank_code': '1007',
        'user_type': 1,
        'user_legal_id_type': 'CC',
        'user_legal_id': '900123456',
        'acceptance_token': 'acc',
        'acceptance_personal_auth_token': 'per',
    }, format='json')
    assert response.status_code == 400
    assert 'NIT' in response.data['detail']


@pytest.mark.django_db
@patch('base_feature_app.views.payment_views.WompiService.process_transaction')
def test_process_payment_pse_accepts_legal_entity_with_nit(mock_process, api_client, wompi_tx):
    mock_process.return_value = {'status': 'PENDING', 'redirect_url': '', 'wompi_id': 'x', 'status_message': ''}
    response = api_client.post('/api/payment/process/', {
        'order_number': wompi_tx.order.order_number,
        'method': 'PSE',
        'bank_code': '1007',
        'user_type': 1,
        'user_legal_id_type': 'NIT',
        'user_legal_id': '900123456',
        'acceptance_token': 'acc',
        'acceptance_personal_auth_token': 'per',
    }, format='json')
    assert response.status_code == 200
    mock_process.assert_called_once()

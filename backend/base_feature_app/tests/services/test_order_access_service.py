"""Capabilities for guest order access."""

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core import signing
from django.test import RequestFactory
from freezegun import freeze_time

from base_feature_app.models import Order
from base_feature_app.services.order_access_service import OrderAccessService
from base_feature_app.utils.media_access import MEDIA_ACCESS_SALT


def _request(*, user=None, token=None):
    request = RequestFactory().get('/', HTTP_X_ORDER_ACCESS=token or '')
    request.user = user or AnonymousUser()
    return request


@pytest.fixture
def access_orders(db):
    """Two otherwise identical orders used to prove a capability has one scope."""
    first = Order.objects.create(
        order_number='MMT-20261002-SCOPE-A', customer_email='one@example.com', customer_name='One',
        address='Calle 1', city='Bogotá', department='Bogotá', total_amount=80000,
        deposit_amount=40000, balance_amount=40000,
    )
    second = Order.objects.create(
        order_number='MMT-20261002-SCOPE-B', customer_email='two@example.com', customer_name='Two',
        address='Calle 2', city='Bogotá', department='Bogotá', total_amount=80000,
        deposit_amount=40000, balance_amount=40000,
    )
    return first, second


@pytest.mark.django_db
def test_order_access_token_only_authorizes_its_order(access_orders):
    """Falla si una capacidad de Pedido A también abre el Pedido B."""
    first, second = access_orders
    token = OrderAccessService.grant_access(first)['order_access_token']
    request = _request(token=token)

    assert OrderAccessService.has_access(request, first) is True
    assert OrderAccessService.has_access(request, second) is False


@pytest.mark.django_db
def test_order_access_token_honors_thirty_day_boundary(access_orders):
    """Falla si la firma expira antes de treinta días o conserva validez después."""
    first, _ = access_orders
    with freeze_time('2026-10-02 10:00:00'):
        token = OrderAccessService.grant_access(first)['order_access_token']
    with freeze_time('2026-11-01 09:59:59'):
        before_limit = OrderAccessService.has_access(_request(token=token), first)
    with freeze_time('2026-11-01 10:00:01'):
        after_limit = OrderAccessService.has_access(_request(token=token), first)

    assert before_limit is True
    assert after_limit is False


@pytest.mark.django_db
@pytest.mark.parametrize('token_kind', ['tampered', 'foreign-purpose'])
def test_order_access_rejects_invalid_token(access_orders, token_kind):
    """Falla si una firma alterada o de media sirve como capacidad privada de pedido."""
    first, _ = access_orders
    order_token = OrderAccessService.grant_access(first)['order_access_token']
    media_token = signing.dumps(
        {'media_id': first.pk, 'media_type': 'huella_image'}, salt=MEDIA_ACCESS_SALT,
    )
    tokens = {'tampered': f'{order_token}x', 'foreign-purpose': media_token}

    allowed = OrderAccessService.has_access(_request(token=tokens[token_kind]), first)

    assert allowed is False


@pytest.mark.django_db
def test_order_access_allows_active_owner(access_orders):
    """Falla si un cliente autenticado y activo pierde acceso a su propio pedido."""
    User = get_user_model()
    owner = User.objects.create_user(email='owner@example.com', password='pass')
    first, _ = access_orders
    first.customer = owner
    first.save(update_fields=['customer'])

    assert OrderAccessService.has_access(_request(user=owner), first) is True


@pytest.mark.django_db
def test_order_access_allows_active_staff(access_orders):
    """Falla si una persona staff activa pierde acceso operativo al pedido."""
    User = get_user_model()
    staff = User.objects.create_user(email='staff@example.com', password='pass', is_staff=True)
    first, _ = access_orders

    assert OrderAccessService.has_access(_request(user=staff), first) is True


@pytest.mark.django_db
def test_order_access_rejects_inactive_owner(access_orders):
    """Falla si una cuenta desactivada conserva acceso privado por ser propietaria."""
    User = get_user_model()
    owner = User.objects.create_user(email='inactive@example.com', password='pass', is_active=False)
    first, _ = access_orders
    first.customer = owner
    first.save(update_fields=['customer'])

    assert OrderAccessService.has_access(_request(user=owner), first) is False

"""Read-permission coverage for the user administration endpoints."""

from datetime import datetime, timezone

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from base_feature_app.models import User
from base_feature_app.tests.factories import UserFactory


def _select_count(context):
    return sum(query['sql'].lstrip().upper().startswith('SELECT') for query in context.captured_queries)


def _account_snapshot(user):
    return {
        'id': user.id,
        'email': user.email,
        'phone': user.phone,
        'role': user.role,
        'is_active': user.is_active,
        'is_staff': user.is_staff,
    }


@pytest.mark.django_db
def test_anonymous_user_list_returns_authentication_error_without_select(api_client):
    """Falla si la lista de usuarios permite enumeración anónima o consulta antes del guard."""
    with CaptureQueriesContext(connection) as queries:
        response = api_client.get(reverse('user-list'))

    assert response.status_code == 403
    assert response.json() == {'detail': 'Authentication required.'}
    assert _select_count(queries) == 0


@pytest.mark.django_db
def test_anonymous_user_detail_returns_authentication_error_without_select(api_client):
    """Falla si el detalle de usuario permite sondeo anónimo o consulta antes del guard."""
    with CaptureQueriesContext(connection) as queries:
        response = api_client.get(reverse('user-detail', kwargs={'user_id': 999_999}))

    assert response.status_code == 403
    assert response.json() == {'detail': 'Authentication required.'}
    assert _select_count(queries) == 0


@pytest.mark.django_db
def test_customer_user_list_returns_admin_error_without_select(api_client):
    """Falla si un cliente autenticado puede enumerar usuarios o llega al ORM."""
    customer = UserFactory(email='customer-list@example.com')
    customer_snapshot = _account_snapshot(customer)
    api_client.force_authenticate(user=customer)

    with CaptureQueriesContext(connection) as queries:
        response = api_client.get(reverse('user-list'))

    assert response.status_code == 403
    assert response.json() == {'detail': 'Admin access required.'}
    assert _select_count(queries) == 0
    customer.refresh_from_db()
    assert _account_snapshot(customer) == customer_snapshot


@pytest.mark.django_db
def test_customer_own_user_detail_returns_admin_error_without_select(api_client):
    """Falla si un cliente puede leer su propio perfil administrativo o llega al ORM."""
    customer = UserFactory(email='customer-own@example.com')
    customer_snapshot = _account_snapshot(customer)
    api_client.force_authenticate(user=customer)

    with CaptureQueriesContext(connection) as queries:
        response = api_client.get(reverse('user-detail', kwargs={'user_id': customer.id}))

    assert response.status_code == 403
    assert response.json() == {'detail': 'Admin access required.'}
    assert _select_count(queries) == 0
    customer.refresh_from_db()
    assert _account_snapshot(customer) == customer_snapshot


@pytest.mark.django_db
def test_customer_other_user_detail_returns_admin_error_without_select(api_client):
    """Falla si un cliente puede sondear perfiles ajenos o llega al ORM."""
    customer = UserFactory(email='customer-other@example.com')
    other_user = UserFactory(email='other-user@example.com')
    customer_snapshot = _account_snapshot(customer)
    other_user_snapshot = _account_snapshot(other_user)
    api_client.force_authenticate(user=customer)

    with CaptureQueriesContext(connection) as queries:
        response = api_client.get(reverse('user-detail', kwargs={'user_id': other_user.id}))

    assert response.status_code == 403
    assert response.json() == {'detail': 'Admin access required.'}
    assert _select_count(queries) == 0
    customer.refresh_from_db()
    other_user.refresh_from_db()
    assert _account_snapshot(customer) == customer_snapshot
    assert _account_snapshot(other_user) == other_user_snapshot


@pytest.mark.django_db
def test_customer_missing_user_detail_returns_admin_error_without_select(api_client):
    """Falla si un cliente distingue IDs inexistentes mediante la respuesta o una consulta."""
    customer = UserFactory(email='customer-missing@example.com')
    customer_snapshot = _account_snapshot(customer)
    api_client.force_authenticate(user=customer)

    with CaptureQueriesContext(connection) as queries:
        response = api_client.get(reverse('user-detail', kwargs={'user_id': 999_999}))

    assert response.status_code == 403
    assert response.json() == {'detail': 'Admin access required.'}
    assert _select_count(queries) == 0
    customer.refresh_from_db()
    assert _account_snapshot(customer) == customer_snapshot


@pytest.mark.django_db
def test_staff_user_list_returns_descending_concrete_users(api_client):
    """Falla si la lista administrativa pierde su orden o altera los datos visibles de usuarios."""
    staff = UserFactory(
        email='staff-list@example.com', first_name='Staff', last_name='Reader',
        role=User.Role.ADMIN, is_staff=True,
    )
    older = UserFactory(
        email='older@example.com', first_name='Older', last_name='Customer',
        role=User.Role.CUSTOMER, is_active=False,
    )
    newer = UserFactory(
        email='newer@example.com', first_name='Newer', last_name='Admin',
        role=User.Role.ADMIN, is_staff=True,
    )
    api_client.force_authenticate(user=staff)

    response = api_client.get(reverse('user-list'))

    assert response.status_code == 200
    assert response.json() == [
        {
            'id': newer.id, 'email': 'newer@example.com', 'first_name': 'Newer',
            'last_name': 'Admin', 'role': 'admin', 'is_active': True, 'email_verified': True, 'is_staff': True,
        },
        {
            'id': older.id, 'email': 'older@example.com', 'first_name': 'Older',
            'last_name': 'Customer', 'role': 'customer', 'is_active': False, 'email_verified': True, 'is_staff': False,
        },
        {
            'id': staff.id, 'email': 'staff-list@example.com', 'first_name': 'Staff',
            'last_name': 'Reader', 'role': 'admin', 'is_active': True, 'email_verified': True, 'is_staff': True,
        },
    ]


@pytest.mark.django_db
def test_staff_user_detail_returns_concrete_account_fields(api_client):
    """Falla si el detalle administrativo omite o transforma campos concretos de la cuenta."""
    staff = UserFactory(email='staff-detail@example.com', role=User.Role.ADMIN, is_staff=True)
    target = UserFactory(
        email='detail-target@example.com', first_name='Detail', last_name='Target',
        phone='3005550101', role=User.Role.ADMIN, is_active=False, is_staff=True,
        date_joined=datetime(2026, 1, 20, 15, 30, tzinfo=timezone.utc),
    )
    api_client.force_authenticate(user=staff)

    response = api_client.get(reverse('user-detail', kwargs={'user_id': target.id}))

    assert response.status_code == 200
    assert response.json() == {
        'id': target.id, 'email': 'detail-target@example.com', 'first_name': 'Detail',
        'last_name': 'Target', 'phone': '3005550101', 'role': 'admin',
        'is_active': False, 'email_verified': True, 'is_staff': True, 'date_joined': '2026-01-20T15:30:00Z',
    }


@pytest.mark.django_db
def test_staff_missing_user_detail_returns_not_found(api_client):
    """Falla si el detalle administrativo deja de responder 404 ante un usuario inexistente."""
    staff = UserFactory(email='staff-missing@example.com', role=User.Role.ADMIN, is_staff=True)
    api_client.force_authenticate(user=staff)

    response = api_client.get(reverse('user-detail', kwargs={'user_id': 999_999}))

    assert response.status_code == 404
    assert response.json() == {'detail': 'Not found.'}

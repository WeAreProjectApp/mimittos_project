"""Purpose-bound administrative login handoffs through the real API."""
from urllib.parse import parse_qs, urlsplit

import pytest
from django.core import signing
from django.test import RequestFactory
from freezegun import freeze_time
from rest_framework.test import APIClient

from base_feature_app.admin import BaseFeatureUserAdmin, admin_site
from base_feature_app.models import User
from base_feature_app.services.admin_login_service import AdminLoginService
from base_feature_app.tests.factories import AdminUserFactory, UserFactory
from base_feature_app.utils.auth_utils import generate_auth_tokens

ENDPOINT = '/api/admin-login/handoff/'
ERROR = {'detail': 'El enlace de acceso no es válido o ha expirado.'}


@pytest.fixture
def bridge(db):
    actor = AdminUserFactory()
    target = UserFactory()
    request = RequestFactory().get('/admin/')
    request.user = actor
    response = BaseFeatureUserAdmin(User, admin_site).login_as_user_view(request, target.pk)
    handoff = parse_qs(urlsplit(response['Location']).fragment)['handoff'][0]
    return actor, target, handoff


def test_handoff_opens_verified_customer_session(bridge):
    _, target, handoff = bridge
    client = APIClient()
    response = client.post(ENDPOINT, {'handoff': handoff}, format='json')
    assert response.status_code == 200
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    identity = client.get('/api/validate_token/')
    assert response.data['user']['id'] == target.pk
    assert response.data['user']['is_staff'] is False
    assert identity.data['user']['id'] == target.pk


@pytest.mark.parametrize('payload', [{}, {'handoff': None}, {'handoff': 12}, {'handoff': ''}])
def test_handoff_rejects_invalid_request_shape(db, payload):
    response = APIClient().post(ENDPOINT, payload, format='json')
    assert response.status_code == 400
    assert set(response.data) == {'detail'}


@pytest.mark.parametrize('token_field', ['access', 'refresh'])
def test_handoff_rejects_customer_jwt(db, token_field):
    customer = UserFactory()
    jwt = generate_auth_tokens(customer)[token_field]
    response = APIClient().post(ENDPOINT, {'handoff': jwt}, format='json')
    assert response.status_code == 403
    assert response.data == ERROR
    customer.refresh_from_db()
    assert customer.is_superuser is False


def test_handoff_rejects_tampered_assertion(bridge):
    _, _, handoff = bridge
    response = APIClient().post(ENDPOINT, {'handoff': handoff + 'x'}, format='json')
    assert response.status_code == 403
    assert response.data == ERROR


@pytest.mark.parametrize('seconds, expected_status', [(60, 200), (61, 403)])
def test_handoff_respects_sixty_second_lifetime(db, seconds, expected_status):
    actor = AdminUserFactory()
    target = UserFactory()
    with freeze_time('2026-10-10 12:00:00') as clock:
        handoff = AdminLoginService.issue_handoff(actor, target)
        clock.tick(seconds)
        response = APIClient().post(ENDPOINT, {'handoff': handoff}, format='json')
    assert response.status_code == expected_status


@pytest.mark.parametrize('person, field, value', [
    ('actor', 'is_active', False), ('actor', 'email_verified', False),
    ('actor', 'is_superuser', False), ('target', 'is_active', False),
    ('target', 'email_verified', False), ('target', 'is_superuser', True),
])
def test_handoff_rechecks_current_eligibility(bridge, person, field, value):
    actor, target, handoff = bridge
    user = {'actor': actor, 'target': target}[person]
    setattr(user, field, value)
    user.save(update_fields=[field])
    response = APIClient().post(ENDPOINT, {'handoff': handoff}, format='json')
    assert response.status_code == 403
    assert response.data == ERROR
    user.refresh_from_db()
    assert getattr(user, field) == value


@pytest.mark.parametrize('person', ['actor', 'target'])
def test_handoff_rejects_password_change(bridge, person):
    actor, target, handoff = bridge
    user = {'actor': actor, 'target': target}[person]
    user.set_password('ChangedPassword123!')
    user.save(update_fields=['password'])
    response = APIClient().post(ENDPOINT, {'handoff': handoff}, format='json')
    assert response.status_code == 403
    assert response.data == ERROR
    user.refresh_from_db()
    assert user.check_password('ChangedPassword123!')


@pytest.mark.parametrize('person', ['actor', 'target'])
def test_handoff_rejects_deleted_account(bridge, person):
    actor, target, handoff = bridge
    user = {'actor': actor, 'target': target}[person]
    user_id = user.pk
    user.delete()
    response = APIClient().post(ENDPOINT, {'handoff': handoff}, format='json')
    assert response.status_code == 403
    assert response.data == ERROR
    assert not User.objects.filter(pk=user_id).exists()


def test_handoff_remains_reusable_within_lifetime(bridge):
    _, target, handoff = bridge
    client = APIClient()
    first = client.post(ENDPOINT, {'handoff': handoff}, format='json')
    repeated = client.post(ENDPOINT, {'handoff': handoff}, format='json')
    assert first.status_code == 200
    assert repeated.status_code == 200
    assert repeated.data['user']['id'] == target.pk


def test_handoff_ignores_unrelated_bearer(bridge):
    _, target, handoff = bridge
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION='Bearer stale-unrelated-token')
    response = client.post(ENDPOINT, {'handoff': handoff}, format='json')
    assert response.status_code == 200
    assert response.data['user']['id'] == target.pk


def test_handoff_rejects_signed_malformed_claims(bridge):
    handoff = signing.dumps({'actor_id': []}, salt=AdminLoginService.SALT)
    response = APIClient().post(ENDPOINT, {'handoff': handoff}, format='json')
    assert response.status_code == 403
    assert response.data == ERROR

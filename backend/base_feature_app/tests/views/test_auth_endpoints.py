"""Verify authentication and account recovery API behavior."""

from datetime import timedelta
from threading import Barrier, Thread
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connection
from django.urls import reverse
from django.utils import timezone
from freezegun import freeze_time
from rest_framework import status
from rest_framework.test import APIClient

from base_feature_app.models import PasswordCode
from base_feature_app.views import auth as auth_views


@pytest.mark.django_db
@patch('base_feature_app.views.auth.verify_recaptcha', return_value=True)
def test_sign_up_requires_email_and_password(mock_captcha, api_client):
    """Verify sign-up rejects payloads missing required credentials."""
    response = api_client.post(reverse('sign_up'), {}, format='json')

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()['error'] == 'El correo y la contraseña son obligatorios'


@pytest.mark.django_db
@patch('base_feature_app.views.auth.verify_recaptcha', return_value=True)
def test_sign_up_rejects_existing_email(mock_captcha, api_client):
    """Verify sign-up rejects an email that already belongs to an account."""
    User = get_user_model()
    User.objects.create_user(email='existing@example.com', password='pass1234')

    response = api_client.post(
        reverse('sign_up'),
        {'email': 'existing@example.com', 'password': 'pass1234'},
        format='json',
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()['error'] == 'Este correo ya está registrado. ¿Olvidaste tu contraseña?'


@pytest.mark.django_db
@patch('base_feature_app.views.auth.verify_recaptcha', return_value=True)
def test_sign_up_creates_user(mock_captcha, api_client):
    """Falla si el registro conserva el antiguo bloqueo con is_active=False."""
    response = api_client.post(
        reverse('sign_up'),
        {
            'email': 'new@example.com',
            'password': 'pass1234',
            'first_name': 'New',
            'last_name': 'User',
        },
        format='json',
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()['detail'] == 'Cuenta creada. Te enviamos un código de verificación a tu correo.'

    User = get_user_model()
    user = User.objects.get(email='new@example.com')
    assert user.first_name == 'New'
    assert user.is_active is True
    assert user.email_verified is False
    assert PasswordCode.objects.filter(
        user=user, purpose=PasswordCode.Purpose.REGISTRATION, used=False,
    ).count() == 1


@pytest.mark.django_db
def test_verify_registration_consumes_registration_code(api_client):
    """Falla si un código de registro válido no verifica la cuenta ni se consume."""
    User = get_user_model()
    user = User.objects.create_user(
        email='verify@example.com', password='pass1234', email_verified=False,
    )
    password_code = PasswordCode.objects.create(
        user=user, code='444444', purpose=PasswordCode.Purpose.REGISTRATION,
    )

    response = api_client.post(
        reverse('verify_registration'), {'email': user.email, 'code': password_code.code}, format='json',
    )

    assert response.status_code == status.HTTP_200_OK
    assert {'access', 'refresh'}.issubset(response.json())
    user.refresh_from_db()
    password_code.refresh_from_db()
    assert user.email_verified is True
    assert password_code.used is True


@pytest.mark.django_db
def test_verify_registration_rejects_used_code(api_client):
    """Falla si un código de registro consumido vuelve a emitir otra sesión."""
    User = get_user_model()
    user = User.objects.create_user(
        email='verify-once@example.com', password='pass1234', email_verified=False,
    )
    PasswordCode.objects.create(
        user=user, code='555555', purpose=PasswordCode.Purpose.REGISTRATION,
    )
    payload = {'email': user.email, 'code': '555555'}

    api_client.post(reverse('verify_registration'), payload, format='json')
    response = api_client.post(reverse('verify_registration'), payload, format='json')

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'access' not in response.json()
    assert 'refresh' not in response.json()


@pytest.mark.django_db
@patch('base_feature_app.views.auth.verify_recaptcha', return_value=True)
def test_sign_in_requires_fields(mock_captcha, api_client):
    """Verify sign-in rejects payloads missing required credentials."""
    response = api_client.post(reverse('sign_in'), {}, format='json')

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()['error'] == 'El correo y la contraseña son obligatorios'


@pytest.mark.django_db
@patch('base_feature_app.views.auth.verify_recaptcha', return_value=True)
def test_sign_in_rejects_unknown_user(mock_captcha, api_client):
    """Verify sign-in rejects credentials for an unknown email."""
    response = api_client.post(
        reverse('sign_in'),
        {'email': 'missing@example.com', 'password': 'pass1234'},
        format='json',
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()['error'] == 'Credenciales incorrectas'


@pytest.mark.django_db
@patch('base_feature_app.views.auth.verify_recaptcha', return_value=True)
def test_sign_in_rejects_invalid_password(mock_captcha, api_client):
    """Verify sign-in rejects an incorrect password."""
    User = get_user_model()
    User.objects.create_user(email='user@example.com', password='pass1234')

    response = api_client.post(
        reverse('sign_in'),
        {'email': 'user@example.com', 'password': 'wrong'},
        format='json',
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
@patch('base_feature_app.views.auth.verify_recaptcha', return_value=True)
def test_sign_in_rejects_inactive_user(mock_captcha, api_client):
    """Verify sign-in rejects an inactive account with the blocked message."""
    User = get_user_model()
    user = User.objects.create_user(email='inactive@example.com', password='pass1234')
    user.is_active = False
    user.save(update_fields=['is_active'])

    response = api_client.post(
        reverse('sign_in'),
        {'email': 'inactive@example.com', 'password': 'pass1234'},
        format='json',
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()['error'] == 'Tu cuenta está inactiva. Contacta al equipo de MIMITTOS.'


@pytest.mark.django_db
@patch('base_feature_app.views.auth.verify_recaptcha', return_value=True)
def test_sign_in_success(mock_captcha, api_client):
    """Verify eligible credentials produce an access token."""
    User = get_user_model()
    User.objects.create_user(email='active@example.com', password='pass1234')

    response = api_client.post(
        reverse('sign_in'),
        {'email': 'active@example.com', 'password': 'pass1234'},
        format='json',
    )

    assert response.status_code == status.HTTP_200_OK
    assert 'access' in response.json()


@pytest.mark.django_db
def test_send_passcode_requires_email(api_client):
    """Verify reset-code requests require an email address."""
    response = api_client.post(reverse('send_passcode'), {}, format='json')

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()['error'] == 'El correo es obligatorio'


@pytest.mark.django_db
def test_send_passcode_returns_generic_message_for_missing_user(api_client):
    """Verify an unknown email receives the generic reset-code response."""
    response = api_client.post(
        reverse('send_passcode'),
        {'email': 'missing@example.com'},
        format='json',
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()['message'] == 'Si el correo existe en nuestro sistema, recibirás el código pronto'
    assert PasswordCode.objects.count() == 0


@pytest.mark.django_db
def test_send_passcode_success(api_client, monkeypatch):
    """Verify a reset-code request creates one code for an existing user."""
    User = get_user_model()
    user = User.objects.create_user(email='send@example.com', password='pass1234')

    monkeypatch.setattr(auth_views, 'send_password_reset_code', lambda *_args, **_kwargs: True)

    response = api_client.post(
        reverse('send_passcode'),
        {'email': user.email},
        format='json',
    )

    assert response.status_code == status.HTTP_200_OK
    assert PasswordCode.objects.filter(user=user).count() == 1


@pytest.mark.django_db
def test_send_passcode_failure(api_client, monkeypatch):
    """Verify reset-code requests report email delivery failures."""
    User = get_user_model()
    user = User.objects.create_user(email='fail@example.com', password='pass1234')

    monkeypatch.setattr(auth_views, 'send_password_reset_code', lambda *_args, **_kwargs: False)

    response = api_client.post(
        reverse('send_passcode'),
        {'email': user.email},
        format='json',
    )

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert response.json()['error'] == 'Error al enviar el correo. Inténtalo de nuevo.'


@pytest.mark.django_db
def test_verify_passcode_requires_fields(api_client):
    """Verify password reset rejects payloads missing required fields."""
    response = api_client.post(reverse('verify_passcode_reset'), {}, format='json')

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()['error'] == 'El correo, el código y la nueva contraseña son obligatorios'


@pytest.mark.django_db
def test_verify_passcode_rejects_invalid_email(api_client):
    """Verify password reset rejects a code submitted for an unknown email."""
    response = api_client.post(
        reverse('verify_passcode_reset'),
        {'email': 'missing@example.com', 'code': '123456', 'new_password': 'newpass1'},
        format='json',
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
@freeze_time('2026-01-15 10:00:00')
def test_verify_passcode_rejects_expired_code(api_client):
    """Verifies passcode verification returns 400 when the code was created more than 15 minutes ago."""
    User = get_user_model()
    user = User.objects.create_user(email='expired@example.com', password='pass1234')
    password_code = PasswordCode.objects.create(user=user, code='111111')
    PasswordCode.objects.filter(id=password_code.id).update(
        created_at=timezone.now() - timedelta(minutes=16)
    )

    response = api_client.post(
        reverse('verify_passcode_reset'),
        {'email': user.email, 'code': '111111', 'new_password': 'newpass1'},
        format='json',
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()['error'] == 'El código es inválido o ha expirado'


@pytest.mark.django_db
def test_verify_passcode_handles_exception(api_client, monkeypatch):
    """Verifies passcode verification returns 400 when an unexpected exception occurs during code validation."""
    User = get_user_model()
    user = User.objects.create_user(email='boom@example.com', password='pass1234')
    PasswordCode.objects.create(user=user, code='222222')

    def boom(_self):
        raise Exception('boom')

    monkeypatch.setattr(PasswordCode, 'is_valid', boom)

    response = api_client.post(
        reverse('verify_passcode_reset'),
        {'email': user.email, 'code': '222222', 'new_password': 'newpass1'},
        format='json',
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()['error'] == 'El código es inválido o ha expirado'


@pytest.mark.django_db
def test_verify_passcode_resets_password(api_client):
    """Verifies passcode verification resets the user password and marks the code as used on success."""
    User = get_user_model()
    user = User.objects.create_user(
        email='reset@example.com', password='pass1234', is_active=False, email_verified=False,
    )
    password_code = PasswordCode.objects.create(
        user=user, code='333333', purpose=PasswordCode.Purpose.PASSWORD_RESET,
    )

    response = api_client.post(
        reverse('verify_passcode_reset'),
        {'email': user.email, 'code': '333333', 'new_password': 'newpass1'},
        format='json',
    )

    assert response.status_code == status.HTTP_200_OK
    password_code.refresh_from_db()
    user.refresh_from_db()

    assert password_code.used is True
    assert user.check_password('newpass1') is True
    assert user.is_active is False
    assert user.email_verified is False


@pytest.mark.django_db
def test_verify_registration_rejects_password_reset_code(api_client):
    """Falla si un código de recuperación confirma el correo de una cuenta pendiente."""
    User = get_user_model()
    user = User.objects.create_user(
        email='wrong-registration@example.com', password='pass1234', email_verified=False,
    )
    PasswordCode.objects.create(
        user=user, code='666666', purpose=PasswordCode.Purpose.PASSWORD_RESET,
    )

    response = api_client.post(
        reverse('verify_registration'), {'email': user.email, 'code': '666666'}, format='json',
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    user.refresh_from_db()
    assert user.email_verified is False


@pytest.mark.django_db
def test_verify_registration_keeps_blocked_account_blocked(api_client):
    """Falla si un código válido reactiva una cuenta bloqueada por el equipo."""
    User = get_user_model()
    user = User.objects.create_user(
        email='blocked-registration@example.com', password='pass1234',
        is_active=False, email_verified=False,
    )
    password_code = PasswordCode.objects.create(
        user=user, code='676767', purpose=PasswordCode.Purpose.REGISTRATION,
    )

    response = api_client.post(
        reverse('verify_registration'), {'email': user.email, 'code': password_code.code}, format='json',
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    user.refresh_from_db()
    password_code.refresh_from_db()
    assert (user.is_active, user.email_verified, password_code.used) == (False, False, False)


@pytest.mark.django_db
def test_verify_passcode_rejects_registration_code(api_client):
    """Falla si un código de registro cambia la contraseña de la cuenta."""
    User = get_user_model()
    user = User.objects.create_user(email='wrong-reset@example.com', password='pass1234')
    PasswordCode.objects.create(
        user=user, code='777777', purpose=PasswordCode.Purpose.REGISTRATION,
    )

    response = api_client.post(
        reverse('verify_passcode_reset'),
        {'email': user.email, 'code': '777777', 'new_password': 'newpass1'}, format='json',
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    user.refresh_from_db()
    assert user.check_password('pass1234') is True


@pytest.mark.django_db
def test_update_password_requires_fields(api_client):
    """Verify password updates require current and replacement passwords."""
    User = get_user_model()
    user = User.objects.create_user(email='update-fields@example.com', password='pass1234')
    api_client.force_authenticate(user=user)

    response = api_client.post(reverse('update_password'), {}, format='json')

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()['error'] == 'La contraseña actual y la nueva son obligatorias'


@pytest.mark.django_db
def test_update_password_rejects_wrong_current(api_client):
    """Verify password updates reject an incorrect current password."""
    User = get_user_model()
    user = User.objects.create_user(email='update@example.com', password='pass1234')

    api_client.force_authenticate(user=user)

    response = api_client.post(
        reverse('update_password'),
        {'current_password': 'wrong', 'new_password': 'newpass1'},
        format='json',
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()['error'] == 'La contraseña actual es incorrecta'


@pytest.mark.django_db
def test_update_password_success(api_client):
    """Verifies update-password endpoint successfully changes the user password when the current password is correct."""
    User = get_user_model()
    user = User.objects.create_user(email='update2@example.com', password='pass1234')

    api_client.force_authenticate(user=user)

    response = api_client.post(
        reverse('update_password'),
        {'current_password': 'pass1234', 'new_password': 'newpass1'},
        format='json',
    )

    assert response.status_code == status.HTTP_200_OK
    user.refresh_from_db()
    assert user.check_password('newpass1') is True


@pytest.mark.django_db
@pytest.mark.parametrize('state', [
    {'is_active': False},
    {'email_verified': False},
])
def test_access_token_rejects_user_made_ineligible(api_client, state):
    """Falla si un bearer previo permite cambiar la clave después de perder elegibilidad."""
    User = get_user_model()
    user = User.objects.create_user(email='stale-access@example.com', password='pass1234')
    tokens = auth_views.generate_auth_tokens(user)
    User.objects.filter(pk=user.pk).update(**state)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

    response = api_client.post(
        reverse('update_password'),
        {'current_password': 'pass1234', 'new_password': 'newpass1'},
        format='json',
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    user.refresh_from_db()
    assert user.check_password('pass1234') is True


@pytest.mark.django_db
def test_validate_token_returns_invalid_for_anonymous(api_client):
    """Verify token validation reports an anonymous request as invalid."""
    response = api_client.get(reverse('validate_token'))

    assert response.status_code == status.HTTP_200_OK
    assert response.json()['valid'] is False


@pytest.mark.django_db
def test_validate_token_success(api_client):
    """Verify token validation accepts an authenticated request."""
    User = get_user_model()
    user = User.objects.create_user(email='token@example.com', password='pass1234')

    api_client.force_authenticate(user=user)
    response = api_client.get(reverse('validate_token'))

    assert response.status_code == status.HTTP_200_OK
    assert response.json()['valid'] is True


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'mysql', reason='requires MySQL row locks')
def test_verify_registration_consumes_code_once_under_mysql_locking():
    """Falla si dos solicitudes MySQL verifican y canjean el mismo código."""
    User = get_user_model()
    user = User.objects.create_user(
        email='concurrent-verify@example.com', password='pass1234', email_verified=False,
    )
    PasswordCode.objects.create(
        user=user, code='888888', purpose=PasswordCode.Purpose.REGISTRATION,
    )
    barrier = Barrier(2)
    statuses = []

    def submit_verification():
        close_old_connections()
        client = APIClient()
        barrier.wait()
        response = client.post(
            reverse('verify_registration'),
            {'email': user.email, 'code': '888888'},
            format='json',
        )
        statuses.append(response.status_code)
        close_old_connections()

    first = Thread(target=submit_verification)
    second = Thread(target=submit_verification)
    first.start()
    second.start()
    first.join(timeout=10)
    second.join(timeout=10)

    assert not first.is_alive()
    assert not second.is_alive()
    assert sorted(statuses) == [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]
    user.refresh_from_db()
    assert user.email_verified is True
    assert PasswordCode.objects.get(user=user, code='888888').used is True

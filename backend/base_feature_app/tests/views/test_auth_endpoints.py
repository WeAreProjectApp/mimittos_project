"""Verify authentication and account recovery API behavior."""

from datetime import timedelta
from smtplib import SMTPException
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import connection
from django.urls import reverse
from django.utils import timezone
from freezegun import freeze_time
from rest_framework import status

from base_feature_app.models import PasswordCode
from base_feature_app.models.password_code import PasswordCodeAttemptBudget
from base_feature_app.tests.factories import OrderFactory
from base_feature_app.tests.views.test_account_code_limits import _parallel_posts
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


@pytest.fixture(params=[
    pytest.param('unrelated@example.com', id='new-account'),
    pytest.param('delivery@example.com', id='pending-account'),
])
def failed_registration_delivery(request, api_client, db):
    """Fail at the SMTP boundary for a new account or a preregistered address."""
    existing = get_user_model().objects.create_user(
        email=request.param, password='InitialPassword123!', email_verified=False,
    )
    payload = {'email': 'delivery@example.com', 'password': 'InitialPassword123!'}
    with patch('base_feature_app.utils.auth_utils.send_mail', wraps=send_mail,
               side_effect=SMTPException('delivery acknowledgement unavailable')) as smtp:
        response = api_client.post(reverse('sign_up'), payload, format='json')
        yield response, payload, smtp, existing


@pytest.mark.django_db
def test_sign_up_reports_unconfirmed_email_delivery(failed_registration_delivery):
    """A failed delivery acknowledgement must never advance registration as success."""
    response, _, smtp, _ = failed_registration_delivery

    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert response.json() == {'error': (
        'No pudimos confirmar el envío del código. Tu cuenta sigue pendiente de verificación. '
        'Espera al menos un minuto antes de volver a intentarlo.'
    )}
    assert smtp.call_count == 1


@pytest.mark.django_db
def test_sign_up_preserves_pending_account_after_email_failure(failed_registration_delivery):
    """Delivery failure must preserve the pending account instead of rolling it back."""
    _, payload, _, existing = failed_registration_delivery

    user = get_user_model().objects.get(email=payload['email'])
    existing.refresh_from_db()
    assert user.is_active is True
    assert user.email_verified is False
    assert user.check_password('InitialPassword123!') is True
    assert existing.check_password('InitialPassword123!') is True
    budget = PasswordCodeAttemptBudget.objects.get(user=user, purpose=PasswordCode.Purpose.REGISTRATION)
    assert budget.send_count == 1
    assert budget.last_sent_at is not None


@pytest.mark.django_db
def test_registration_code_remains_usable_after_email_failure(api_client, failed_registration_delivery):
    """An uncertain delivery may have arrived, so its code must still verify the owner."""
    _, payload, _, _ = failed_registration_delivery
    user = get_user_model().objects.get(email=payload['email'])
    code = PasswordCode.objects.get(user=user, purpose=PasswordCode.Purpose.REGISTRATION, used=False)

    response = api_client.post(reverse('verify_registration'), {
        'email': user.email, 'code': code.code, 'new_password': 'OwnerPassword123!',
    }, format='json')

    user.refresh_from_db()
    code.refresh_from_db()
    assert response.status_code == status.HTTP_200_OK
    assert response.json()['access']
    assert user.email_verified is True
    assert user.check_password('OwnerPassword123!') is True
    assert user.check_password('InitialPassword123!') is False
    assert code.used is True


@pytest.mark.django_db
def test_sign_up_enforces_cooldown_after_email_failure(api_client, failed_registration_delivery):
    """Failed acknowledgement still consumes the send attempt and prevents rapid repeats."""
    _, payload, smtp, _ = failed_registration_delivery
    user = get_user_model().objects.get(email=payload['email'])
    code = PasswordCode.objects.get(user=user, purpose=PasswordCode.Purpose.REGISTRATION, used=False)

    response = api_client.post(reverse('sign_up'), payload, format='json')

    code.refresh_from_db()
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert response.json()['error']
    assert smtp.call_count == 1
    assert PasswordCode.objects.filter(user=user, purpose=PasswordCode.Purpose.REGISTRATION).count() == 1
    assert code.is_valid() is True
    assert PasswordCodeAttemptBudget.objects.get(user=user, purpose=PasswordCode.Purpose.REGISTRATION).send_count == 1


@pytest.mark.django_db
def test_sign_up_recovers_after_email_failure(api_client, failed_registration_delivery, mailoutbox):
    """A manual retry after the cooldown delivers a new code using the existing budget."""
    _, payload, smtp, _ = failed_registration_delivery
    user = get_user_model().objects.get(email=payload['email'])
    previous = PasswordCode.objects.get(user=user, purpose=PasswordCode.Purpose.REGISTRATION, used=False)
    budget = PasswordCodeAttemptBudget.objects.get(user=user, purpose=PasswordCode.Purpose.REGISTRATION)
    smtp.side_effect = None

    with freeze_time(budget.last_sent_at + timedelta(seconds=60)):
        response = api_client.post(reverse('sign_up'), payload, format='json')

    previous.refresh_from_db()
    user.refresh_from_db()
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        'detail': 'Ya existe una cuenta pendiente de verificación. Te reenviamos el código a tu correo.',
        'email': payload['email'],
    }
    assert user.email_verified is False
    assert user.check_password('InitialPassword123!') is True
    assert previous.used is True
    assert PasswordCode.objects.filter(user=user, purpose=PasswordCode.Purpose.REGISTRATION, used=False).count() == 1
    assert PasswordCodeAttemptBudget.objects.get(user=user, purpose=PasswordCode.Purpose.REGISTRATION).send_count == 2
    assert smtp.call_count == 2
    assert len(mailoutbox) == 1


@pytest.mark.django_db
@patch('base_feature_app.views.auth.verify_recaptcha', return_value=True)
def test_registration_replaces_preregistered_credential(mock_captcha, api_client):
    """Email ownership must not activate a credential chosen by a third party."""
    email = 'preregistered@example.com'
    guest_order = OrderFactory(customer=None, customer_email=email)
    with freeze_time(timezone.now() - timedelta(seconds=61)):
        first = api_client.post(reverse('sign_up'), {
            'email': email, 'password': 'AttackerPassword123!',
        }, format='json')
    user = get_user_model().objects.get(email=email)
    original_password = user.password
    repeated = api_client.post(reverse('sign_up'), {
        'email': email, 'password': 'OwnerPassword123!',
    }, format='json')
    user.refresh_from_db()
    preserved_password = user.password
    code = PasswordCode.objects.get(user=user, purpose=PasswordCode.Purpose.REGISTRATION, used=False)
    verification = api_client.post(reverse('verify_registration'), {
        'email': email, 'code': code.code, 'new_password': 'OwnerPassword123!',
    }, format='json')
    rejected_login = api_client.post(reverse('sign_in'), {
        'email': email, 'password': 'AttackerPassword123!',
    }, format='json')
    accepted_login = api_client.post(reverse('sign_in'), {
        'email': email, 'password': 'OwnerPassword123!',
    }, format='json')

    assert first.status_code == status.HTTP_201_CREATED
    assert repeated.status_code == status.HTTP_200_OK
    assert preserved_password == original_password
    assert verification.status_code == status.HTTP_200_OK
    assert rejected_login.status_code == status.HTTP_401_UNAUTHORIZED
    assert accepted_login.status_code == status.HTTP_200_OK
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {verification.json()['access']}")
    orders = api_client.get(reverse('my-orders'))
    assert orders.status_code == status.HTTP_200_OK
    assert [order['order_number'] for order in orders.json()] == [guest_order.order_number]


@pytest.mark.django_db
@pytest.mark.parametrize('password_fields', [
    pytest.param({}, id='legacy-contract'),
    pytest.param({'new_password': ''}, id='empty'),
    pytest.param({'new_password': 'short'}, id='too-short'),
    pytest.param({'new_password': None}, id='null'),
    pytest.param({'new_password': True}, id='boolean'),
    pytest.param({'new_password': 12345678}, id='number'),
    pytest.param({'new_password': ['OwnerPassword123!']}, id='array'),
    pytest.param({'new_password': {'value': 'OwnerPassword123!'}}, id='object'),
])
def test_registration_rejects_invalid_password_without_consuming_code(api_client, password_fields):
    """Verify invalid passwords preserve an available registration code."""
    user = get_user_model().objects.create_user(
        email='invalid-verification@example.com', password='Initial123!', email_verified=False,
    )
    original_password = user.password
    code = PasswordCode.objects.create(user=user, code='444444', purpose=PasswordCode.Purpose.REGISTRATION)
    guest_order = OrderFactory(customer=None, customer_email=user.email)

    response = api_client.post(reverse('verify_registration'), {
        'email': user.email, 'code': code.code, **password_fields,
    }, format='json')

    user.refresh_from_db()
    code.refresh_from_db()
    guest_order.refresh_from_db()
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'access' not in response.json()
    assert user.password == original_password
    assert user.email_verified is False
    assert code.is_valid() is True
    assert guest_order.customer_id is None


@pytest.mark.django_db
@pytest.mark.parametrize(('account_state', 'code_state', 'age_minutes', 'submitted_code'), [
    pytest.param({}, {}, 0, '000000', id='incorrect'),
    pytest.param({}, {}, 16, '444444', id='expired'),
    pytest.param({}, {'used': True}, 0, '444444', id='used'),
    pytest.param({}, {'purpose': PasswordCode.Purpose.PASSWORD_RESET}, 0, '444444', id='reset-purpose'),
    pytest.param({'is_active': False}, {}, 0, '444444', id='staff-blocked'),
    pytest.param({'email_verified': True}, {}, 0, '444444', id='already-verified'),
])
def test_registration_rejection_preserves_credentials(api_client, account_state, code_state,
                                                     age_minutes, submitted_code):
    """Verify rejected registration leaves existing credentials unchanged."""
    user_fields = {'email_verified': False, **account_state}
    user = get_user_model().objects.create_user(
        email='rejected-verification@example.com', password='Initial123!', **user_fields,
    )
    original_state = (user.password, user.email_verified, user.is_active)
    code_fields = {'purpose': PasswordCode.Purpose.REGISTRATION, **code_state}
    code = PasswordCode.objects.create(user=user, code='444444', **code_fields)
    PasswordCode.objects.filter(pk=code.pk).update(created_at=timezone.now() - timedelta(minutes=age_minutes))
    original_used = code.used
    guest_order = OrderFactory(customer=None, customer_email=user.email)

    response = api_client.post(reverse('verify_registration'), {
        'email': user.email, 'code': submitted_code, 'new_password': 'OwnerPassword123!',
    }, format='json')

    user.refresh_from_db()
    code.refresh_from_db()
    guest_order.refresh_from_db()
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'access' not in response.json()
    assert (user.password, user.email_verified, user.is_active) == original_state
    assert code.used == original_used
    assert guest_order.customer_id is None


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
        reverse('verify_registration'), {'email': user.email, 'code': password_code.code, 'new_password': 'OwnerPassword123!'}, format='json',
    )

    assert response.status_code == status.HTTP_200_OK
    assert {'access', 'refresh'}.issubset(response.json())
    user.refresh_from_db()
    password_code.refresh_from_db()
    assert user.email_verified is True
    assert user.check_password('OwnerPassword123!') is True
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
    payload = {'email': user.email, 'code': '555555', 'new_password': 'OwnerPassword123!'}

    api_client.post(reverse('verify_registration'), payload, format='json')
    payload['new_password'] = 'SecondPassword123!'
    response = api_client.post(reverse('verify_registration'), payload, format='json')

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'access' not in response.json()
    assert 'refresh' not in response.json()
    user.refresh_from_db()
    assert user.check_password('OwnerPassword123!') is True


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
        reverse('verify_registration'), {'email': user.email, 'code': '666666', 'new_password': 'OwnerPassword123!'}, format='json',
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
        reverse('verify_registration'), {'email': user.email, 'code': password_code.code, 'new_password': 'OwnerPassword123!'}, format='json',
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
@pytest.mark.parametrize(('send_route', 'verify_route', 'purpose'), [
    ('send_passcode', 'verify_passcode_reset', PasswordCode.Purpose.PASSWORD_RESET),
    ('resend_verification', 'verify_registration', PasswordCode.Purpose.REGISTRATION),
])
def test_resent_code_rejects_previous_value(api_client, monkeypatch, mailoutbox, send_route,
                                          verify_route, purpose):
    """A code replaced by an email resend must no longer change account state."""
    user = get_user_model().objects.create_user(
        email='replaced@example.com', password='Initial123!', email_verified=False,
    )
    previous = PasswordCode.objects.create(user=user, purpose=purpose, code='654321')
    original_password = user.password
    monkeypatch.setattr('random.randint', lambda *_: 1)
    sent = api_client.post(reverse(send_route), {'email': user.email}, format='json')

    response = api_client.post(reverse(verify_route), {
        'email': user.email, 'code': previous.code, 'new_password': 'Replacement123!',
    }, format='json')

    user.refresh_from_db()
    previous.refresh_from_db()
    current = PasswordCode.objects.get(user=user, purpose=purpose, used=False)
    assert sent.status_code == status.HTTP_200_OK
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert user.password == original_password
    assert user.email_verified is False
    assert previous.used is True
    assert current.code == '111111'
    assert current.is_valid() is True
    assert len(mailoutbox) == 1


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


def _reset_password_with_code(api_client, user, code):
    PasswordCode.objects.create(user=user, code=code, purpose=PasswordCode.Purpose.PASSWORD_RESET)
    return api_client.post(
        reverse('verify_passcode_reset'),
        {'email': user.email, 'code': code, 'new_password': 'brand-new-pass1'},
        format='json',
    )


@pytest.mark.django_db
def test_password_reset_revokes_previous_refresh_token(api_client):
    """Falla si restablecer la contraseña deja renovar una sesión emitida antes."""
    User = get_user_model()
    user = User.objects.create_user(email='reset-refresh@example.com', password='pass1234')
    tokens = auth_views.generate_auth_tokens(user)
    reset = _reset_password_with_code(api_client, user, '444444')

    response = api_client.post(reverse('token_refresh'), {'refresh': tokens['refresh']}, format='json')

    assert reset.status_code == status.HTTP_200_OK
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert 'access' not in response.json()


@pytest.mark.django_db
def test_password_reset_revokes_previous_access_token(api_client):
    """Falla si un acceso emitido antes del restablecimiento sigue abriendo endpoints protegidos."""
    User = get_user_model()
    user = User.objects.create_user(email='reset-access@example.com', password='pass1234')
    tokens = auth_views.generate_auth_tokens(user)
    reset = _reset_password_with_code(api_client, user, '555555')
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")

    response = api_client.get(reverse('my-orders'))

    assert reset.status_code == status.HTTP_200_OK
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()['code'] == 'password_changed'


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'mysql', reason='requires MySQL row locks')
def test_verify_registration_consumes_code_once_under_mysql_locking(record_testsuite_property):
    """Falla si dos solicitudes MySQL verifican y canjean el mismo código."""
    User = get_user_model()
    user = User.objects.create_user(
        email='concurrent-verify@example.com', password='pass1234', email_verified=False,
    )
    PasswordCode.objects.create(
        user=user, code='888888', purpose=PasswordCode.Purpose.REGISTRATION,
    )
    results, lock_wait = _parallel_posts('verify_registration', {
        'email': user.email, 'code': '888888', 'new_password': 'OwnerPassword123!',
    })

    assert len({connection_id for connection_id, _ in results}) == 2
    assert lock_wait == (results[1][0], results[0][0])
    assert sorted(result_status for _, result_status in results) == [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]
    user.refresh_from_db()
    assert user.email_verified is True
    assert PasswordCode.objects.get(user=user, code='888888').used is True
    assert PasswordCodeAttemptBudget.objects.filter(
        user=user, purpose=PasswordCode.Purpose.REGISTRATION,
    ).count() == 1
    record_testsuite_property('consumption-lock-wait-registration', str(lock_wait))

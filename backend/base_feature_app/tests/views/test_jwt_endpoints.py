"""Verify JWT issuance, CAPTCHA enforcement, and eligibility checks."""

from unittest.mock import Mock, patch

import pytest
import requests
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from base_feature_app.views.captcha_views import RECAPTCHA_VERIFY_URL


@pytest.mark.django_db
def test_token_obtain_pair_with_email_success(api_client):
    """Verify eligible email credentials produce both JWT tokens."""
    User = get_user_model()
    User.objects.create_user(email='token@example.com', password='pass1234')

    url = reverse('token_obtain_pair')
    response = api_client.post(url, {'email': 'token@example.com', 'password': 'pass1234'}, format='json')
    assert response.status_code == status.HTTP_200_OK
    assert 'access' in response.json()
    assert 'refresh' in response.json()


@pytest.mark.django_db
@override_settings(RECAPTCHA_SECRET_KEY='captcha-secret')
@patch('base_feature_app.views.captcha_views.requests.post')
def test_token_obtain_pair_checks_real_captcha_provider(mock_post, api_client):
    """Falla si JWT omite el verificador HTTP de un CAPTCHA configurado."""
    User = get_user_model()
    User.objects.create_user(email='captcha@example.com', password='pass1234')
    mock_post.return_value = Mock(json=Mock(return_value={'success': True}))

    response = api_client.post(
        reverse('token_obtain_pair'),
        {'email': 'captcha@example.com', 'password': 'pass1234', 'captcha_token': 'valid-captcha'},
        format='json',
    )

    assert response.status_code == status.HTTP_200_OK
    assert {'access', 'refresh'}.issubset(response.json())
    mock_post.assert_called_once_with(
        RECAPTCHA_VERIFY_URL,
        data={'secret': 'captcha-secret', 'response': 'valid-captcha'},
        timeout=5,
    )


@pytest.mark.django_db
@override_settings(RECAPTCHA_SECRET_KEY='captcha-secret')
@pytest.mark.parametrize('provider_side_effect', [
    Mock(json=Mock(return_value={'success': False})),
    requests.RequestException('provider unavailable'),
])
@patch('base_feature_app.views.captcha_views.requests.post')
def test_token_obtain_pair_rejects_untrusted_captcha(mock_post, api_client, provider_side_effect):
    """Falla si un CAPTCHA rechazado o caído todavía emite una sesión."""
    User = get_user_model()
    User.objects.create_user(email='captcha-failure@example.com', password='pass1234')
    mock_post.side_effect = [provider_side_effect]

    response = api_client.post(
        reverse('token_obtain_pair'),
        {'email': 'captcha-failure@example.com', 'password': 'pass1234', 'captcha_token': 'invalid-captcha'},
        format='json',
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'captcha_token' in response.json()
    assert 'access' not in response.json()
    assert 'refresh' not in response.json()
    mock_post.assert_called_once()


@pytest.mark.django_db
@override_settings(RECAPTCHA_SECRET_KEY='captcha-secret')
@patch('base_feature_app.views.captcha_views.requests.post')
def test_token_obtain_pair_rejects_missing_captcha_without_provider_call(mock_post, api_client):
    """Falla si credenciales válidas sin CAPTCHA todavía emiten JWT."""
    User = get_user_model()
    User.objects.create_user(email='missing-captcha@example.com', password='pass1234')

    response = api_client.post(
        reverse('token_obtain_pair'),
        {'email': 'missing-captcha@example.com', 'password': 'pass1234'},
        format='json',
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'captcha_token' in response.json()
    assert 'access' not in response.json()
    assert 'refresh' not in response.json()
    mock_post.assert_not_called()


@pytest.mark.django_db
@pytest.mark.parametrize('state', [
    {'is_active': False, 'email_verified': True},
    {'is_active': True, 'email_verified': False},
])
def test_token_obtain_pair_rejects_ineligible_account(api_client, state):
    """Falla si una cuenta bloqueada o pendiente obtiene JWT sin CAPTCHA configurado."""
    User = get_user_model()
    User.objects.create_user(email='ineligible@example.com', password='pass1234', **state)

    response = api_client.post(
        reverse('token_obtain_pair'),
        {'email': 'ineligible@example.com', 'password': 'pass1234'},
        format='json',
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert 'access' not in response.json()
    assert 'refresh' not in response.json()


@pytest.mark.django_db
@pytest.mark.parametrize('state', [
    {'is_active': False, 'email_verified': True},
    {'is_active': True, 'email_verified': False},
])
def test_token_refresh_rejects_account_made_ineligible(api_client, state):
    """Falla si un refresh emitido antes del bloqueo sigue creando acceso."""
    User = get_user_model()
    user = User.objects.create_user(email='refresh@example.com', password='pass1234')
    refresh = str(RefreshToken.for_user(user))
    User.objects.filter(pk=user.pk).update(**state)

    response = api_client.post(reverse('token_refresh'), {'refresh': refresh}, format='json')

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert 'access' not in response.json()

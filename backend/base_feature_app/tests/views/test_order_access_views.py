"""Email-code access to a guest order."""

import re
import threading
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth.hashers import check_password
from django.core import mail
from django.db import close_old_connections, connection
from django.utils import timezone
from freezegun import freeze_time
from rest_framework.test import APIClient

from base_feature_app.models import Order, OrderAccessChallenge
from base_feature_app.services.order_access_service import OrderAccessService

_REQUEST_DETAIL = 'Si los datos coinciden, recibirás un código en el correo del pedido. Revisa tu bandeja.'
_INVALID_DETAIL = 'No pudimos verificar el código. Revisa los datos o solicita uno nuevo más tarde.'


@pytest.fixture
def access_order(db):
    """Provide an order whose stored email is the only address allowed to receive a code."""
    return Order.objects.create(
        order_number='MMT-20261002-ACCESS',
        customer_email='buyer@example.com',
        customer_name='Buyer',
        address='Calle 1',
        city='Bogotá',
        department='Cundinamarca',
        total_amount=80000,
        deposit_amount=40000,
        balance_amount=40000,
    )


def _request(client, order_number, email):
    return client.post(f'/api/orders/{order_number}/access/request/', {'email': email}, format='json')


def _verify(client, order_number, email, code):
    return client.post(
        f'/api/orders/{order_number}/access/verify/', {'email': email, 'code': code}, format='json',
    )


def _email_code():
    return re.search(r'\b\d{6}\b', mail.outbox[-1].body).group(0)


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(
    ('order_number', 'email', 'expected_recipients'),
    [
        pytest.param('MMT-20261002-ACCESS', 'buyer@example.com', [['buyer@example.com']], id='matched'),
        pytest.param('MMT-20261002-ACCESS', 'wrong@example.com', [], id='wrong-email'),
        pytest.param('MMT-20261002-MISSING', 'buyer@example.com', [], id='missing-order'),
    ],
)
def test_order_access_request_returns_generic_response(access_order, order_number, email, expected_recipients):
    """Falla si pedir acceso revela cuál pedido o correo existe."""
    client = APIClient()
    response = _request(client, order_number, email)

    assert response.status_code == 202
    assert response.data == {'detail': _REQUEST_DETAIL}
    assert [message.to for message in mail.outbox] == expected_recipients


@pytest.mark.django_db(transaction=True)
def test_order_access_verify_consumes_code_once(access_order):
    """Falla si el mismo código puede emitir más de una capacidad de pedido."""
    client = APIClient()
    _request(client, access_order.order_number, access_order.customer_email)
    code = _email_code()

    accepted = _verify(client, access_order.order_number, access_order.customer_email, code)
    repeated = _verify(client, access_order.order_number, access_order.customer_email, code)

    assert accepted.status_code == 200
    assert set(accepted.data) == {'order_access_token', 'expires_at'}
    assert repeated.status_code == 400
    assert repeated.data == {'code': 'order_access_invalid', 'detail': _INVALID_DETAIL}


@pytest.mark.django_db(transaction=True)
def test_order_access_challenge_hashes_generated_code(access_order):
    """Falla si el código de correo se almacena en claro en vez de como hash."""
    client = APIClient()
    _request(client, access_order.order_number, access_order.customer_email)
    code = _email_code()
    challenge = OrderAccessChallenge.objects.get(order=access_order)

    assert challenge.code_hash != code
    assert check_password(code, challenge.code_hash)


@pytest.mark.django_db(transaction=True)
def test_order_access_verify_rejects_five_invalid_codes(access_order):
    """Falla si cinco fallos no bloquean nuevos intentos de fuerza bruta durante la ventana."""
    client = APIClient()
    with patch('base_feature_app.services.order_access_service.secrets.randbelow', return_value=987654):
        _request(client, access_order.order_number, access_order.customer_email)

    first = _verify(client, access_order.order_number, access_order.customer_email, '000000')
    second = _verify(client, access_order.order_number, access_order.customer_email, '000001')
    third = _verify(client, access_order.order_number, access_order.customer_email, '000002')
    fourth = _verify(client, access_order.order_number, access_order.customer_email, '000003')
    fifth = _verify(client, access_order.order_number, access_order.customer_email, '000004')
    sixth = _verify(client, access_order.order_number, access_order.customer_email, _email_code())
    blocked_resend = _request(client, access_order.order_number, access_order.customer_email)

    challenge = OrderAccessChallenge.objects.get(order=access_order)
    assert [response.status_code for response in (first, second, third, fourth, fifth, sixth)] == [400, 400, 400, 400, 400, 400]
    assert sixth.data == {'code': 'order_access_invalid', 'detail': _INVALID_DETAIL}
    assert blocked_resend.data == {'detail': _REQUEST_DETAIL}
    assert challenge.failed_attempts == 5
    assert challenge.send_count == 1
    assert challenge.consumed_at is None
    assert len(mail.outbox) == 1


@pytest.mark.django_db(transaction=True)
def test_order_access_request_respects_resend_cooldown(access_order):
    """Falla si repetir la solicitud antes de un minuto manda otro código."""
    client = APIClient()

    first = _request(client, access_order.order_number, access_order.customer_email)
    second = _request(client, access_order.order_number, access_order.customer_email)

    assert first.status_code == 202
    assert second.status_code == 202
    assert first.data == second.data == {'detail': _REQUEST_DETAIL}
    assert len(mail.outbox) == 1


@pytest.mark.django_db(transaction=True)
@freeze_time('2026-10-02 10:00:00')
def test_order_access_resend_invalidates_previous_code(access_order):
    """Falla si pedir un código nuevo deja utilizable el anterior o reinicia fallos."""
    client = APIClient()
    with patch('base_feature_app.services.order_access_service.secrets.randbelow', side_effect=[111111, 222222]):
        _request(client, access_order.order_number, access_order.customer_email)
    original_code = _email_code()
    failed = _verify(client, access_order.order_number, access_order.customer_email, '000000')
    challenge = OrderAccessChallenge.objects.get(order=access_order)
    challenge.last_sent_at = timezone.now() - timedelta(seconds=61)
    challenge.save(update_fields=['last_sent_at'])
    with patch('base_feature_app.services.order_access_service.secrets.randbelow', side_effect=[222222]):
        _request(client, access_order.order_number, access_order.customer_email)
    replacement_code = _email_code()
    challenge.refresh_from_db()

    stale = _verify(client, access_order.order_number, access_order.customer_email, original_code)
    current = _verify(client, access_order.order_number, access_order.customer_email, replacement_code)

    assert failed.status_code == 400
    assert original_code == '111111'
    assert replacement_code == '222222'
    assert challenge.failed_attempts == 1
    assert stale.data == {'code': 'order_access_invalid', 'detail': _INVALID_DETAIL}
    assert current.status_code == 200


@pytest.mark.django_db(transaction=True)
def test_order_access_code_is_valid_before_ten_minutes(access_order):
    """Falla si un código real deja de servir antes de cumplir diez minutos."""
    client = APIClient()
    with freeze_time('2026-10-02 10:00:00'):
        with patch('base_feature_app.services.order_access_service.secrets.randbelow', return_value=333333):
            _request(client, access_order.order_number, access_order.customer_email)
    with freeze_time('2026-10-02 10:09:59'):
        response = _verify(client, access_order.order_number, access_order.customer_email, '333333')

    assert response.status_code == 200


@pytest.mark.django_db(transaction=True)
def test_order_access_code_expires_after_ten_minutes(access_order):
    """Falla si un código real sigue autorizando después de sus diez minutos configurados."""
    client = APIClient()
    with freeze_time('2026-10-02 10:00:00'):
        with patch('base_feature_app.services.order_access_service.secrets.randbelow', return_value=444444):
            _request(client, access_order.order_number, access_order.customer_email)
    with freeze_time('2026-10-02 10:10:01'):
        response = _verify(client, access_order.order_number, access_order.customer_email, '444444')

    assert response.status_code == 400
    assert response.data == {'code': 'order_access_invalid', 'detail': _INVALID_DETAIL}


@pytest.mark.django_db(transaction=True)
def test_order_access_blocks_sixth_send_within_hour(access_order):
    """Falla si el sexto reenvío dentro de una hora evade el presupuesto del pedido."""
    client = APIClient()
    with patch('base_feature_app.services.order_access_service.secrets.randbelow', side_effect=[101001, 202002, 303003, 404004, 505005, 606006]):
        with freeze_time('2026-10-02 10:00:00'):
            first = _request(client, access_order.order_number, access_order.customer_email)
        with freeze_time('2026-10-02 10:01:01'):
            second = _request(client, access_order.order_number, access_order.customer_email)
        with freeze_time('2026-10-02 10:02:02'):
            third = _request(client, access_order.order_number, access_order.customer_email)
        with freeze_time('2026-10-02 10:03:03'):
            fourth = _request(client, access_order.order_number, access_order.customer_email)
        with freeze_time('2026-10-02 10:04:04'):
            fifth = _request(client, access_order.order_number, access_order.customer_email)
        with freeze_time('2026-10-02 10:05:05'):
            sixth = _request(client, access_order.order_number, access_order.customer_email)

    challenge = OrderAccessChallenge.objects.get(order=access_order)
    hash_after_fifth_send = challenge.code_hash
    assert [response.status_code for response in (first, second, third, fourth, fifth, sixth)] == [202, 202, 202, 202, 202, 202]
    assert sixth.data == {'detail': _REQUEST_DETAIL}
    assert challenge.send_count == 5
    assert check_password('505005', hash_after_fifth_send)
    assert len(mail.outbox) == 5


@pytest.mark.django_db(transaction=True)
@freeze_time('2026-10-02 10:00:00')
def test_order_access_resets_failed_attempt_budget_after_hour(access_order):
    """Falla si una nueva ventana no permite recuperar el pedido tras cinco fallos."""
    client = APIClient()
    with patch('base_feature_app.services.order_access_service.secrets.randbelow', return_value=987654):
        _request(client, access_order.order_number, access_order.customer_email)
    _verify(client, access_order.order_number, access_order.customer_email, '000000')
    _verify(client, access_order.order_number, access_order.customer_email, '000001')
    _verify(client, access_order.order_number, access_order.customer_email, '000002')
    _verify(client, access_order.order_number, access_order.customer_email, '000003')
    _verify(client, access_order.order_number, access_order.customer_email, '000004')
    challenge = OrderAccessChallenge.objects.get(order=access_order)
    challenge.attempt_window_started_at = timezone.now() - timedelta(hours=1, seconds=1)
    challenge.last_sent_at = timezone.now() - timedelta(seconds=61)
    challenge.save(update_fields=['attempt_window_started_at', 'last_sent_at'])

    with patch('base_feature_app.services.order_access_service.secrets.randbelow', return_value=111111):
        request_response = _request(client, access_order.order_number, access_order.customer_email)
    verify_response = _verify(client, access_order.order_number, access_order.customer_email, '111111')
    challenge.refresh_from_db()

    assert request_response.status_code == 202
    assert verify_response.status_code == 200
    assert challenge.failed_attempts == 0


@pytest.mark.django_db(transaction=True)
@freeze_time('2026-10-02 10:00:00')
def test_order_access_allows_sends_after_budget_window(access_order):
    """Falla si una ventana horaria nueva no restaura el presupuesto de envíos."""
    client = APIClient()
    _request(client, access_order.order_number, access_order.customer_email)
    challenge = OrderAccessChallenge.objects.get(order=access_order)
    challenge.send_count = 5
    challenge.last_sent_at = timezone.now() - timedelta(hours=2)
    challenge.send_window_started_at = timezone.now() - timedelta(hours=2)
    challenge.save(update_fields=['send_count', 'last_sent_at', 'send_window_started_at'])

    response = _request(client, access_order.order_number, access_order.customer_email)
    challenge.refresh_from_db()

    assert response.status_code == 202
    assert challenge.send_count == 1
    assert len(mail.outbox) == 2


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(
    connection.vendor != 'mysql',
    reason='select_for_update concurrency must run against MySQL, not SQLite emulation.',
)
def test_order_access_concurrent_verification_consumes_code_once(access_order):
    """Falla si dos conexiones MySQL consumen el mismo código simultáneamente."""
    with patch('base_feature_app.services.order_access_service.secrets.randbelow', return_value=123456):
        OrderAccessService.request_access(access_order.order_number, access_order.customer_email)
    start = threading.Barrier(2)
    results = []
    failures = []

    def verify():
        close_old_connections()
        try:
            start.wait()
            results.append(OrderAccessService.verify_access(
                access_order.order_number, access_order.customer_email, '123456',
            ))
        except Exception as exc:  # noqa: BLE001 - assertion below exposes worker failures.
            failures.append(exc)
        finally:
            close_old_connections()

    first_worker = threading.Thread(target=verify)
    second_worker = threading.Thread(target=verify)
    first_worker.start()
    second_worker.start()
    first_worker.join(timeout=10)
    second_worker.join(timeout=10)

    assert not first_worker.is_alive()
    assert not second_worker.is_alive()
    assert failures == []
    assert sum(result is not None for result in results) == 1
    assert sum(result is None for result in results) == 1


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(
    connection.vendor != 'mysql',
    reason='select_for_update concurrency must run against MySQL, not SQLite emulation.',
)
def test_order_access_concurrent_requests_send_one_code(access_order):
    """Falla si dos primeras solicitudes simultáneas generan desafíos o correos duplicados."""
    start = threading.Barrier(2)
    failures = []

    def request_code():
        close_old_connections()
        try:
            start.wait()
            OrderAccessService.request_access(access_order.order_number, access_order.customer_email)
        except Exception as exc:  # noqa: BLE001 - assertion below exposes worker failures.
            failures.append(exc)
        finally:
            close_old_connections()

    with patch('base_feature_app.services.order_access_service.secrets.randbelow', return_value=123456):
        with patch('base_feature_app.services.order_access_service.send_mail', return_value=1) as send_mail:
            first_worker = threading.Thread(target=request_code)
            second_worker = threading.Thread(target=request_code)
            first_worker.start()
            second_worker.start()
            first_worker.join(timeout=10)
            second_worker.join(timeout=10)

    challenge = OrderAccessChallenge.objects.get(order=access_order)
    assert not first_worker.is_alive()
    assert not second_worker.is_alive()
    assert failures == []
    assert challenge.send_count == 1
    assert check_password('123456', challenge.code_hash)
    send_mail.assert_called_once()


@pytest.mark.django_db(transaction=True)
def test_order_access_code_delivery_log_omits_code_on_smtp_error(caplog):
    """Falla si un fallo SMTP imprime el código temporal o detalle sensible en logs."""
    with patch('base_feature_app.services.order_access_service.send_mail', side_effect=RuntimeError('smtp-secret')):
        OrderAccessService._send_access_code('buyer@example.com', 'MMT-20261002-ACCESS', '123456')

    assert 'error_type=RuntimeError' in caplog.text
    assert '123456' not in caplog.text
    assert 'smtp-secret' not in caplog.text

"""POST /api/payment/process/ — rejection and gateway-failure paths.

The happy path and the PSE legal-entity rules are covered in
`test_review_and_payment_views.py`. What was never covered is what happens when
the payment does NOT go through: the per-method 400s that guard the Wompi call,
and the 502 branch that turns a WompiService exception into a customer-facing
error (`payment_views.py:176-199`).

That 502 branch is the one that matters most: it is the only thing standing
between a gateway outage and a 500 traceback reaching the checkout page, and it
also decides how much of Wompi's raw error is surfaced as `wompi_detail`.
"""

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from base_feature_app.models import Order, OrderStatusHistory, WompiTransaction
from base_feature_app.services.order_access_service import OrderAccessService

_PROCESS_URL = '/api/payment/process/'
_WOMPI_CALL = 'base_feature_app.views.payment_views.WompiService.process_transaction'


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def existing_order(db, existing_user):
    """Return an order still awaiting payment — the state `process_payment` expects."""
    return Order.objects.create(
        order_number='MMT-20260805-PAYF',
        customer=existing_user,
        customer_email=existing_user.email,
        customer_name='Test User',
        address='Calle 1',
        city='Bogotá',
        department='Cundinamarca',
        total_amount=80000,
        deposit_amount=40000,
        balance_amount=40000,
        status=Order.Status.PENDING_PAYMENT,
    )


@pytest.fixture
def wompi_tx(db, existing_order, api_client):
    """Return the PENDING Wompi transaction attached to that order."""
    transaction = WompiTransaction.objects.create(
        order=existing_order,
        reference='REF-PAYF-001',
        amount_in_cents=4000000,
        status=WompiTransaction.Status.PENDING,
        checkout_url='https://checkout.wompi.co/l/test',
    )
    api_client.credentials(
        HTTP_X_ORDER_ACCESS=OrderAccessService.grant_access(existing_order)['order_access_token'],
    )
    return transaction


class _FakeWompiResponse:
    """Stands in for the `.response` an HTTP client attaches to its exceptions."""

    def __init__(self, payload=None, text=''):
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError('response body is not JSON')
        return self._payload


def _gateway_error(payload=None, text=''):
    exc = Exception('wompi call blew up')
    exc.response = _FakeWompiResponse(payload=payload, text=text)
    return exc


def _bancolombia_payload(order_number):
    """Minimal valid body — BANCOLOMBIA_TRANSFER needs no extra method fields."""
    return {
        'order_number': order_number,
        'method': 'BANCOLOMBIA_TRANSFER',
        'acceptance_token': 'acc',
        'acceptance_personal_auth_token': 'per',
    }


# ---------------------------------------------------------------------------
# 502 — the gateway failed
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch(_WOMPI_CALL)
def test_process_payment_returns_502_when_gateway_raises(mock_process, api_client, wompi_tx):
    """Catches: removing the try/except so a Wompi outage 500s the checkout."""
    mock_process.side_effect = Exception('connection reset by peer')

    response = api_client.post(
        _PROCESS_URL, _bancolombia_payload(wompi_tx.order.order_number), format='json'
    )

    assert response.status_code == 502
    assert response.data['detail'] == 'Error procesando el pago. Por favor intenta de nuevo.'


@pytest.mark.django_db
@patch(_WOMPI_CALL)
def test_process_payment_502_surfaces_wompi_reason(mock_process, api_client, wompi_tx):
    """Catches: dropping the `error.reason` extraction, blinding support to WHY it failed."""
    mock_process.side_effect = _gateway_error(
        payload={'error': {'reason': 'Token de aceptación vencido', 'type': 'INPUT_VALIDATION_ERROR'}}
    )

    response = api_client.post(
        _PROCESS_URL, _bancolombia_payload(wompi_tx.order.order_number), format='json'
    )

    assert response.status_code == 502
    assert response.data['wompi_detail'] == 'Token de aceptación vencido'


@pytest.mark.django_db
@patch(_WOMPI_CALL)
def test_process_payment_502_falls_back_to_error_type(mock_process, api_client, wompi_tx):
    """Catches: an `error` object with no `reason` losing its `type` fallback."""
    mock_process.side_effect = _gateway_error(payload={'error': {'type': 'NOT_ACCEPTABLE'}})

    response = api_client.post(
        _PROCESS_URL, _bancolombia_payload(wompi_tx.order.order_number), format='json'
    )

    assert response.status_code == 502
    assert response.data['wompi_detail'] == 'NOT_ACCEPTABLE'


@pytest.mark.django_db
@patch(_WOMPI_CALL)
def test_process_payment_502_appends_field_messages(mock_process, api_client, wompi_tx):
    """Catches: dropping `error.messages`, hiding which field Wompi rejected."""
    mock_process.side_effect = _gateway_error(
        payload={'error': {'reason': 'Datos inválidos', 'messages': {'phone_number': ['is invalid']}}}
    )

    response = api_client.post(
        _PROCESS_URL, _bancolombia_payload(wompi_tx.order.order_number), format='json'
    )

    assert response.status_code == 502
    assert response.data['wompi_detail'] == "Datos inválidos | {'phone_number': ['is invalid']}"


@pytest.mark.django_db
@patch(_WOMPI_CALL)
def test_process_payment_502_uses_raw_text_when_body_is_not_json(mock_process, api_client, wompi_tx):
    """Catches: an HTML error page from Wompi raising ValueError instead of degrading."""
    mock_process.side_effect = _gateway_error(text='<html>502 Bad Gateway</html>')

    response = api_client.post(
        _PROCESS_URL, _bancolombia_payload(wompi_tx.order.order_number), format='json'
    )

    assert response.status_code == 502
    assert response.data['wompi_detail'] == '<html>502 Bad Gateway</html>'


# ---------------------------------------------------------------------------
# 400 / 404 — rejected before the gateway is ever called
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch(_WOMPI_CALL)
def test_process_payment_rejects_missing_acceptance_tokens(mock_process, api_client, wompi_tx):
    """Catches: charging a customer who never accepted Wompi's terms."""
    response = api_client.post(_PROCESS_URL, {
        'order_number': wompi_tx.order.order_number,
        'method': 'BANCOLOMBIA_TRANSFER',
    }, format='json')

    assert response.status_code == 400
    assert response.data['detail'] == 'Faltan tokens de aceptación de Wompi. Recarga el checkout.'
    mock_process.assert_not_called()


@pytest.mark.django_db
@patch(_WOMPI_CALL)
def test_process_payment_card_requires_card_token(mock_process, api_client, wompi_tx):
    """Catches: a CARD payment reaching Wompi with no token and 500ing there."""
    response = api_client.post(_PROCESS_URL, {
        'order_number': wompi_tx.order.order_number,
        'method': 'CARD',
        'acceptance_token': 'acc',
        'acceptance_personal_auth_token': 'per',
    }, format='json')

    assert response.status_code == 400
    assert response.data['detail'] == 'card_token requerido.'
    mock_process.assert_not_called()


@pytest.mark.django_db
@patch(_WOMPI_CALL)
def test_process_payment_nequi_requires_phone_number(mock_process, api_client, wompi_tx):
    """Catches: a NEQUI charge sent without the phone it must be pushed to."""
    response = api_client.post(_PROCESS_URL, {
        'order_number': wompi_tx.order.order_number,
        'method': 'NEQUI',
        'phone_number': '   ',
        'acceptance_token': 'acc',
        'acceptance_personal_auth_token': 'per',
    }, format='json')

    assert response.status_code == 400
    assert response.data['detail'] == 'phone_number requerido.'
    mock_process.assert_not_called()


@pytest.mark.django_db
@patch(_WOMPI_CALL)
def test_process_payment_rejects_unsupported_method(mock_process, api_client, wompi_tx):
    """Catches: an unknown method falling through to Wompi instead of being refused."""
    response = api_client.post(_PROCESS_URL, {
        'order_number': wompi_tx.order.order_number,
        'method': 'CRYPTO',
        'acceptance_token': 'acc',
        'acceptance_personal_auth_token': 'per',
    }, format='json')

    assert response.status_code == 400
    assert response.data['detail'] == 'Método no soportado: CRYPTO'
    mock_process.assert_not_called()


@pytest.mark.django_db
@patch(_WOMPI_CALL)
def test_process_payment_refuses_to_charge_an_approved_order_twice(mock_process, api_client, wompi_tx):
    """Catches: the double-charge regression — a paid order accepting a second charge."""
    wompi_tx.status = WompiTransaction.Status.APPROVED
    wompi_tx.save(update_fields=['status'])

    response = api_client.post(
        _PROCESS_URL, _bancolombia_payload(wompi_tx.order.order_number), format='json'
    )

    assert response.status_code == 400
    assert response.data['detail'] == 'Este pedido ya fue pagado.'
    mock_process.assert_not_called()


@pytest.mark.django_db
@patch(_WOMPI_CALL)
def test_process_payment_hides_unknown_order(mock_process, api_client, db):
    """Falla si un número desconocido revela una respuesta distinta al acceso sin prueba."""
    response = api_client.post(_PROCESS_URL, _bancolombia_payload('MMT-00000000-NOPE'), format='json')

    assert response.status_code == 403
    assert response.data['code'] == 'order_access_required'
    mock_process.assert_not_called()


@pytest.mark.django_db
@patch(_WOMPI_CALL)
def test_private_payment_endpoints_deny_anonymous_request_before_gateway(mock_process, wompi_tx):
    """Falla si una lectura o cobro privado revela el pedido antes de validar la capacidad."""
    client = APIClient()
    before_order = (
        wompi_tx.order.status,
        wompi_tx.order.total_amount,
        wompi_tx.order.deposit_amount,
        wompi_tx.order.balance_amount,
    )
    before_transaction = (
        wompi_tx.status,
        wompi_tx.wompi_id,
        wompi_tx.payment_method_type,
        wompi_tx.raw_response,
    )
    before_history_count = OrderStatusHistory.objects.filter(order=wompi_tx.order).count()
    info = client.get(f'/api/payment/info/{wompi_tx.order.order_number}/')
    check = client.get(f'/api/payment/check/{wompi_tx.order.order_number}/')
    status = client.get(f'/api/payment/status/{wompi_tx.reference}/')
    process = client.post(
        _PROCESS_URL, _bancolombia_payload(wompi_tx.order.order_number), format='json',
    )

    expected = {'code': 'order_access_required', 'detail': 'Verifica tu correo para acceder a este pedido.'}
    assert [response.status_code for response in (info, check, status, process)] == [403, 403, 403, 403]
    assert [response.data for response in (info, check, status, process)] == [expected, expected, expected, expected]
    wompi_tx.order.refresh_from_db()
    wompi_tx.refresh_from_db()
    assert (wompi_tx.order.status, wompi_tx.order.total_amount, wompi_tx.order.deposit_amount, wompi_tx.order.balance_amount) == before_order
    assert (wompi_tx.status, wompi_tx.wompi_id, wompi_tx.payment_method_type, wompi_tx.raw_response) == before_transaction
    assert OrderStatusHistory.objects.filter(order=wompi_tx.order).count() == before_history_count
    mock_process.assert_not_called()


@pytest.mark.django_db
@patch(_WOMPI_CALL)
def test_private_payment_endpoints_accept_matching_capability(mock_process, api_client, wompi_tx):
    """Falla si una capacidad válida deja de abrir la información o el cobro de su pedido."""
    mock_process.return_value = {'status': 'PENDING', 'redirect_url': '', 'wompi_id': 'wompi-id', 'status_message': ''}
    info = api_client.get(f'/api/payment/info/{wompi_tx.order.order_number}/')
    check = api_client.get(f'/api/payment/check/{wompi_tx.order.order_number}/')
    status = api_client.get(f'/api/payment/status/{wompi_tx.reference}/')
    process = api_client.post(
        _PROCESS_URL, _bancolombia_payload(wompi_tx.order.order_number), format='json',
    )

    assert [response.status_code for response in (info, check, status, process)] == [200, 200, 200, 200]
    assert info.data['order_number'] == wompi_tx.order.order_number
    assert status.data['reference'] == wompi_tx.reference
    mock_process.assert_called_once()


@pytest.mark.django_db
def test_order_access_header_is_allowed_by_payment_preflight(api_client, wompi_tx):
    """Falla si el navegador no puede enviar la capacidad privada por CORS."""
    response = api_client.options(
        f'/api/payment/info/{wompi_tx.order.order_number}/',
        HTTP_ORIGIN='http://localhost:3000',
        HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET',
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS='x-order-access',
    )

    assert response.status_code == 200
    assert 'x-order-access' in response['access-control-allow-headers'].lower()

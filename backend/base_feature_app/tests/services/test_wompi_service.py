"""Test Wompi signatures and transactional payment updates."""

import hashlib
import logging
from datetime import datetime
from threading import Event, Thread
from unittest.mock import MagicMock, patch

import pytest
from django.db import IntegrityError, close_old_connections, connection, connections
from django.test import override_settings

from base_feature_app.models import Order, WompiTransaction
from base_feature_app.services.wompi_service import WompiService

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SENT_AT = '2026-04-21T12:00:00.000Z'
_PROPERTIES = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents',
               'transaction.currency', 'transaction.reference']


def _make_event_data(secret: str, tx_id: str = 'tx-001', status: str = 'APPROVED',
                     amount: int = 4000000, currency: str = 'COP',
                     reference: str = 'REF-001') -> dict:
    """Build a Wompi event_data dict with a valid SHA256 checksum."""
    tx = {'id': tx_id, 'status': status, 'amount_in_cents': amount,
          'currency': currency, 'reference': reference, 'payment_method_type': 'CARD'}
    data = {'transaction': tx}

    concat = ''
    for prop in _PROPERTIES:
        value = data
        for part in prop.split('.'):
            value = value[part]
        concat += str(value)

    dt = datetime.fromisoformat(_SENT_AT.replace('Z', '+00:00'))
    concat += str(int(dt.timestamp()))
    concat += secret

    checksum = hashlib.sha256(concat.encode()).hexdigest()

    return {
        'event': 'transaction.updated',
        'data': data,
        'sent_at': _SENT_AT,
        'signature': {'checksum': checksum, 'properties': _PROPERTIES},
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def existing_order(db):
    """Create a pending order for Wompi service tests."""
    return Order.objects.create(
        order_number='MMT-20260420-W001',
        customer_email='test@example.com',
        customer_name='Test User',
        customer_phone='3001234567',
        address='Calle 1',
        city='Bogotá',
        department='Cundinamarca',
        total_amount=80000,
        deposit_amount=40000,
        amount_paid_now=40000,
        balance_amount=40000,
        status=Order.Status.PENDING_PAYMENT,
    )


@pytest.fixture
def wompi_tx(db, existing_order):
    """Create the order's pending Wompi transaction."""
    return WompiTransaction.objects.create(
        order=existing_order,
        reference='MMT-20260420-W001-ABCD1234',
        amount_in_cents=4000000,
        status=WompiTransaction.Status.PENDING,
    )


# ---------------------------------------------------------------------------
# verify_signature
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@override_settings(WOMPI_EVENTS_SECRET='secret123')
def test_verify_signature_returns_true_for_valid_checksum():
    """Accept an event carrying a valid provider checksum."""
    event_data = _make_event_data('secret123')
    assert WompiService.verify_signature(event_data) is True


@pytest.mark.django_db
@override_settings(WOMPI_EVENTS_SECRET='secret123')
def test_verify_signature_returns_false_for_tampered_checksum():
    """Reject an event whose checksum has been tampered with."""
    event_data = _make_event_data('secret123')
    event_data['signature']['checksum'] = 'bad' * 16
    assert WompiService.verify_signature(event_data) is False


@pytest.mark.django_db
@override_settings(WOMPI_EVENTS_SECRET='correct_secret')
def test_verify_signature_returns_false_for_wrong_secret():
    """Reject a checksum signed with another events secret."""
    event_data = _make_event_data('wrong_secret')
    assert WompiService.verify_signature(event_data) is False


@pytest.mark.django_db
@override_settings(WOMPI_EVENTS_SECRET='')
def test_verify_signature_returns_false_when_secret_not_configured():
    """Reject events when the events secret is not configured."""
    event_data = _make_event_data('any')
    assert WompiService.verify_signature(event_data) is False


@pytest.mark.django_db
@override_settings(WOMPI_EVENTS_SECRET='secret123')
def test_verify_signature_returns_false_for_malformed_event():
    """Reject events with missing signature fields."""
    assert WompiService.verify_signature({}) is False
    assert WompiService.verify_signature({'signature': {}}) is False


# ---------------------------------------------------------------------------
# process_event — non-transaction events
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_process_event_ignores_non_transaction_event(wompi_tx):
    """Leave the payment unchanged for unrelated provider event types."""
    event_data = {'event': 'charge.created', 'data': {}}
    WompiService.process_event(event_data)
    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.PENDING


# ---------------------------------------------------------------------------
# process_event — transaction.updated
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_process_event_updates_status_to_approved(wompi_tx):
    """process_event marks the transaction APPROVED and triggers order status update."""
    event_data = {
        'event': 'transaction.updated',
        'data': {
            'transaction': {
                'id': 'wompi-id-001',
                'reference': wompi_tx.reference,
                'status': 'APPROVED',
                'payment_method_type': 'CARD',
            }
        },
    }
    WompiService.process_event(event_data)
    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.APPROVED
    assert wompi_tx.order.status == Order.Status.PAYMENT_CONFIRMED
    history = wompi_tx.order.status_history.get()
    assert history.previous_status == Order.Status.PENDING_PAYMENT
    assert history.new_status == Order.Status.PAYMENT_CONFIRMED


@pytest.mark.django_db
def test_process_event_updates_status_to_declined(wompi_tx):
    """process_event marks the transaction DECLINED without triggering order status update."""
    event_data = {
        'event': 'transaction.updated',
        'data': {
            'transaction': {
                'id': 'wompi-id-002',
                'reference': wompi_tx.reference,
                'status': 'DECLINED',
                'payment_method_type': 'CARD',
            }
        },
    }
    WompiService.process_event(event_data)
    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.DECLINED


@pytest.mark.django_db
def test_process_event_does_not_update_order_for_declined(wompi_tx, existing_order):
    """A rejected webhook retains the existing pending-order contract."""
    event_data = {
        'event': 'transaction.updated',
        'data': {
            'transaction': {
                'id': 'wompi-id-003',
                'reference': wompi_tx.reference,
                'status': 'DECLINED',
                'payment_method_type': 'CARD',
            }
        },
    }
    WompiService.process_event(event_data)
    existing_order.refresh_from_db()
    assert existing_order.status == Order.Status.PENDING_PAYMENT
    assert not existing_order.status_history.exists()


@pytest.mark.django_db
def test_process_event_logs_warning_for_missing_reference(wompi_tx):
    """process_event leaves the transaction unchanged when the reference does not exist in DB."""
    event_data = {
        'event': 'transaction.updated',
        'data': {
            'transaction': {
                'id': 'wompi-id-004',
                'reference': 'NONEXISTENT-REFERENCE',
                'status': 'APPROVED',
                'payment_method_type': 'CARD',
            }
        },
    }
    WompiService.process_event(event_data)
    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.PENDING


@pytest.mark.django_db
def test_process_event_stores_wompi_id(wompi_tx):
    """process_event persists the Wompi transaction ID onto the WompiTransaction record."""
    event_data = {
        'event': 'transaction.updated',
        'data': {
            'transaction': {
                'id': 'wompi-id-999',
                'reference': wompi_tx.reference,
                'status': 'VOIDED',
                'payment_method_type': 'PSE',
            }
        },
    }
    WompiService.process_event(event_data)
    wompi_tx.refresh_from_db()
    assert wompi_tx.wompi_id == 'wompi-id-999'


@pytest.mark.django_db
def test_process_event_stores_payment_method_type(wompi_tx):
    """process_event persists the payment method type (CARD, PSE, NEQUI, etc.) on the record."""
    event_data = {
        'event': 'transaction.updated',
        'data': {
            'transaction': {
                'id': 'wompi-id-998',
                'reference': wompi_tx.reference,
                'status': 'ERROR',
                'payment_method_type': 'NEQUI',
            }
        },
    }
    WompiService.process_event(event_data)
    wompi_tx.refresh_from_db()
    assert wompi_tx.payment_method_type == 'NEQUI'


@pytest.mark.django_db
@override_settings(ADMIN_EMAIL='admin@example.com')
@pytest.mark.parametrize(('payment_mode', 'amount', 'balance'), [
    (Order.PaymentMode.FULL, 80000, 0),
    (Order.PaymentMode.DEPOSIT, 40000, 40000),
])
def test_pending_event_sends_no_payment_confirmation(
    wompi_tx, mailoutbox, django_capture_on_commit_callbacks, payment_mode, amount, balance,
):
    """Fail if a planned payment amount starts confirmation before approval."""
    order = wompi_tx.order
    order.payment_mode = payment_mode
    order.amount_paid_now = amount
    order.balance_amount = balance
    order.save(update_fields=['payment_mode', 'amount_paid_now', 'balance_amount'])
    wompi_tx.amount_in_cents = amount * 100
    wompi_tx.save(update_fields=['amount_in_cents'])
    event = _make_event_data('test', status='PENDING', amount=amount * 100, reference=wompi_tx.reference)

    with django_capture_on_commit_callbacks(execute=True):
        WompiService.process_event(event)

    order.refresh_from_db()
    assert mailoutbox == []
    assert order.status == Order.Status.PENDING_PAYMENT
    assert not order.status_history.exists()
    assert order.last_automated_email_at is None


@pytest.mark.django_db
@override_settings(ADMIN_EMAIL='admin@example.com')
def test_process_event_repetition_sends_one_confirmation(wompi_tx, mailoutbox, django_capture_on_commit_callbacks):
    """Deliver one confirmation for repeated approval events."""
    event = _make_event_data('test', reference=wompi_tx.reference)

    with django_capture_on_commit_callbacks(execute=True):
        WompiService.process_event(event)
        WompiService.process_event(event)
        assert mailoutbox == []

    assert wompi_tx.order.status_history.count() == 1
    assert len(mailoutbox) == 2
    assert sorted(message.to[0] for message in mailoutbox) == ['admin@example.com', wompi_tx.order.customer_email]


@pytest.mark.django_db(transaction=True)
@override_settings(
    ADMIN_EMAIL='admin@example.com',
    EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend',
    EMAIL_HOST='smtp.example.invalid',
    EMAIL_PORT=587,
    EMAIL_HOST_USER='',
    EMAIL_HOST_PASSWORD='',
    EMAIL_USE_TLS=True,
    EMAIL_USE_SSL=False,
    EMAIL_TIMEOUT=10,
    DEFAULT_FROM_EMAIL='orders@example.com',
)
def test_approval_retains_settlement_after_smtp_timeout(wompi_tx):
    """Fail if post-commit SMTP failure damages the confirmed payment settlement."""
    event = _make_event_data('test', reference=wompi_tx.reference)

    with patch('smtplib.SMTP') as smtp:
        smtp.return_value.sendmail.side_effect = TimeoutError('SMTP timed out')
        WompiService.process_event(event)
        WompiService.process_event(event)

    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.APPROVED
    assert wompi_tx.order.status == Order.Status.PAYMENT_CONFIRMED
    assert list(wompi_tx.order.status_history.values_list('previous_status', 'new_status')) == [
        (Order.Status.PENDING_PAYMENT, Order.Status.PAYMENT_CONFIRMED),
    ]
    assert wompi_tx.order.last_automated_email_at is None
    assert smtp.return_value.sendmail.call_count == 2


@pytest.mark.django_db
@override_settings(ADMIN_EMAIL='admin@example.com')
def test_payment_history_failure_can_be_retried(wompi_tx, mailoutbox, django_capture_on_commit_callbacks):
    """Retry an approval after a real history persistence failure."""
    data = _make_event_data('test', reference=wompi_tx.reference)['data']['transaction']

    with django_capture_on_commit_callbacks(execute=True):
        with pytest.raises(IntegrityError):
            WompiService.apply_transaction_data(wompi_tx.reference, data, notes=None)
        wompi_tx.refresh_from_db()
        assert wompi_tx.status == WompiTransaction.Status.PENDING
        assert wompi_tx.order.status == Order.Status.PENDING_PAYMENT
        assert not wompi_tx.order.status_history.exists()
        assert mailoutbox == []
        WompiService.process_event(_make_event_data('test', reference=wompi_tx.reference))

    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.APPROVED
    assert wompi_tx.order.status == Order.Status.PAYMENT_CONFIRMED
    assert wompi_tx.order.status_history.count() == 1
    assert len(mailoutbox) == 2


@pytest.mark.django_db
@pytest.mark.parametrize('late_status', ['PENDING', 'DECLINED', 'VOIDED', 'ERROR'])
def test_late_event_retains_approval(wompi_tx, late_status):
    """Keep an approved payment after a late provider event."""
    WompiService.process_event(_make_event_data('test', reference=wompi_tx.reference))

    WompiService.process_event(_make_event_data('test', status=late_status, reference=wompi_tx.reference))

    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.APPROVED
    assert wompi_tx.order.status == Order.Status.PAYMENT_CONFIRMED
    assert wompi_tx.order.status_history.count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize('terminal_status', ['DECLINED', 'VOIDED', 'ERROR'])
def test_late_pending_retains_a_terminal_transaction(wompi_tx, terminal_status):
    """Retain a terminal payment when a pending event arrives late."""
    WompiService.process_event(_make_event_data('test', status=terminal_status, reference=wompi_tx.reference))

    WompiService.process_event(_make_event_data('test', status='PENDING', reference=wompi_tx.reference))

    wompi_tx.refresh_from_db()
    assert wompi_tx.status == terminal_status.lower()


@pytest.mark.django_db
def test_a_new_payment_attempt_can_be_pending(wompi_tx):
    """Allow a newly initiated payment attempt to remain pending."""
    WompiService.process_event(_make_event_data('test', status='DECLINED', reference=wompi_tx.reference))

    WompiService.apply_transaction_data(wompi_tx.reference, {
        'id': 'new-attempt', 'status': 'PENDING', 'payment_method_type': 'NEQUI',
    }, allow_new_attempt=True)

    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.PENDING
    assert wompi_tx.wompi_id == 'new-attempt'


@pytest.mark.django_db
def test_an_event_for_an_older_attempt_is_ignored(wompi_tx):
    """Ignore pending events from an earlier payment attempt."""
    wompi_tx.wompi_id = 'current-attempt'
    wompi_tx.save(update_fields=['wompi_id'])

    WompiService.process_event(_make_event_data(
        'test', tx_id='older-attempt', status='PENDING', reference=wompi_tx.reference,
    ))

    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.PENDING
    assert wompi_tx.wompi_id == 'current-attempt'
    assert wompi_tx.order.status == Order.Status.PENDING_PAYMENT
    assert not wompi_tx.order.status_history.exists()


@pytest.mark.django_db
def test_approval_preserves_administrative_progress(wompi_tx):
    """Preserve administrative progress when payment is approved."""
    from base_feature_app.services.order_service import OrderService
    OrderService.update_status(wompi_tx.order, Order.Status.IN_PRODUCTION)

    WompiService.process_event(_make_event_data('test', reference=wompi_tx.reference))

    wompi_tx.order.refresh_from_db()
    assert wompi_tx.order.status == Order.Status.IN_PRODUCTION
    assert not wompi_tx.order.status_history.filter(new_status=Order.Status.PAYMENT_CONFIRMED).exists()


def _run_competing_approvals(event):
    """Pause real SQL after the first row lock; let a second connection contend."""
    first_locked, second_waiting, release_first = Event(), Event(), Event()
    failures, connection_ids = [], []
    table = connection.ops.quote_name(Order._meta.db_table)

    def worker(first):
        close_old_connections()

        def observe_lock(execute, sql, params, many, context):
            if 'FOR UPDATE' in sql and table in sql:
                if first:
                    result = execute(sql, params, many, context)
                    first_locked.set()
                    if not release_first.wait(10):
                        raise RuntimeError('First approval was not released.')
                    return result
                second_waiting.set()
            return execute(sql, params, many, context)

        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT CONNECTION_ID()')
                connection_ids.append(cursor.fetchone()[0])
            with connection.execute_wrapper(observe_lock):
                WompiService.process_event(event)
        except Exception as exc:
            failures.append(exc)
        finally:
            connections.close_all()

    first, second = Thread(target=worker, args=(True,)), Thread(target=worker, args=(False,))
    first.start()
    try:
        assert first_locked.wait(10), 'First approval did not acquire the order row.'
        second.start()
        assert second_waiting.wait(10), 'Second approval did not contend for the order row.'
    finally:
        release_first.set()
        first.join(15)
        if second.ident is not None:
            second.join(15)
    assert not first.is_alive()
    assert not second.is_alive()
    return failures, connection_ids


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'mysql', reason='Row-lock contention requires independent MySQL connections.')
@override_settings(ADMIN_EMAIL='admin@example.com')
def test_concurrent_approvals_have_one_confirmation(wompi_tx, mailoutbox):
    """Confirm a payment once across competing MySQL connections."""
    event = _make_event_data('test', reference=wompi_tx.reference)

    failures, connection_ids = _run_competing_approvals(event)

    assert failures == []
    assert len(set(connection_ids)) == 2
    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.APPROVED
    assert wompi_tx.order.status == Order.Status.PAYMENT_CONFIRMED
    assert wompi_tx.order.status_history.count() == 1
    assert len(mailoutbox) == 2


@pytest.mark.django_db
def test_process_transaction_records_real_confirmation(wompi_tx):
    """Persist a provider approval with the real order history."""
    response = MagicMock(status_code=201)
    response.json.return_value = {'data': {'id': 'current-id', 'status': 'APPROVED', 'payment_method_type': 'CARD'}}

    with patch('base_feature_app.services.wompi_service.requests.post', return_value=response):
        result = WompiService.process_transaction(wompi_tx, {'type': 'CARD', 'token': 'synthetic-card'})

    assert result['status'] == 'APPROVED'
    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.APPROVED
    assert wompi_tx.order.status == Order.Status.PAYMENT_CONFIRMED
    assert wompi_tx.order.status_history.count() == 1


@pytest.mark.django_db
def test_process_transaction_retains_an_earlier_webhook_approval(wompi_tx):
    """Keep a webhook approval when the POST response is delayed."""
    def provider_reply(*args, **kwargs):
        WompiService.process_event(_make_event_data('test', tx_id='current-id', reference=wompi_tx.reference))
        response = MagicMock(status_code=201)
        response.json.return_value = {'data': {'id': 'current-id', 'status': 'PENDING', 'payment_method_type': 'CARD'}}
        return response

    with patch('base_feature_app.services.wompi_service.requests.post', side_effect=provider_reply):
        result = WompiService.process_transaction(wompi_tx, {'type': 'CARD', 'token': 'synthetic-card'})

    assert result['status'] == 'APPROVED'
    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.APPROVED
    assert wompi_tx.order.status_history.count() == 1


@pytest.mark.django_db
def test_async_url_poll_retains_a_concurrent_approval(wompi_tx):
    """Preserve concurrent approval while obtaining the bank redirect."""
    initial = MagicMock(status_code=201)
    initial.json.return_value = {'data': {'id': 'current-id', 'status': 'PENDING', 'payment_method_type': 'PSE'}}

    def provider_reply(*args, **kwargs):
        WompiService.process_event(_make_event_data('test', tx_id='current-id', reference=wompi_tx.reference))
        response = MagicMock()
        response.json.return_value = {'data': {
            'id': 'current-id', 'status': 'PENDING',
            'payment_method': {'extra': {'async_payment_url': 'https://bank.example.invalid/auth'}},
        }}
        return response

    with patch('base_feature_app.services.wompi_service.requests.post', return_value=initial):
        with patch('base_feature_app.services.wompi_service.requests.get', side_effect=provider_reply):
            with patch('time.sleep'):
                result = WompiService.process_transaction(wompi_tx, {'type': 'PSE'})

    assert result['status'] == 'APPROVED'
    assert result['redirect_url'] == 'https://bank.example.invalid/auth'
    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.APPROVED
    assert wompi_tx.order.status_history.count() == 1


@pytest.mark.django_db
def test_process_transaction_retains_the_missing_status_error(wompi_tx):
    """Preserve the existing error for a response without a status."""
    response = MagicMock(status_code=201)
    response.json.return_value = {'data': {'id': 'current-id'}}

    with patch('base_feature_app.services.wompi_service.requests.post', return_value=response):
        result = WompiService.process_transaction(wompi_tx, {'type': 'CARD', 'token': 'synthetic-card'})

    assert result['status'] == 'ERROR'
    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.ERROR


# ---------------------------------------------------------------------------
# Approvals the order cannot absorb
# ---------------------------------------------------------------------------

_UNABSORBABLE_APPROVALS = {
    'duplicate_approval': {
        'order_status': 'payment_confirmed', 'tx_status': 'approved',
        'current_id': 'paid-id', 'event_id': 'second-id',
    },
    'order_not_awaiting_payment': {
        'order_status': 'cancelled', 'tx_status': 'pending',
        'current_id': 'late-id', 'event_id': 'late-id',
    },
}
_SERVICE_LOGGER = 'base_feature_app.services.wompi_service'


def _prepare_unabsorbable_approval(tx, reason):
    """Persist the state before the approval and return the provider event."""
    case = _UNABSORBABLE_APPROVALS[reason]
    WompiTransaction.objects.filter(pk=tx.pk).update(
        status=case['tx_status'], wompi_id=case['current_id'], raw_response={'id': case['current_id']},
    )
    Order.objects.filter(pk=tx.order_id).update(status=case['order_status'])
    return _make_event_data('test', tx_id=case['event_id'], reference=tx.reference)


def _review_message(tx, reason):
    """Build the expected log line: provider identifiers and order state, without buyer data."""
    case = _UNABSORBABLE_APPROVALS[reason]
    return (
        f'Wompi approval needs manual review (reason={reason} reference={tx.reference} '
        f"provider_id={case['event_id']} current_provider_id={case['current_id']} "
        f"order_status={case['order_status']})"
    )


@pytest.mark.django_db
def test_second_approval_keeps_the_settled_payment(wompi_tx):
    """Fail if another approved charge replaces the transaction that paid the order."""
    event = _prepare_unabsorbable_approval(wompi_tx, 'duplicate_approval')

    WompiService.process_event(event)

    wompi_tx.refresh_from_db()
    assert (wompi_tx.status, wompi_tx.wompi_id, wompi_tx.raw_response) == (
        WompiTransaction.Status.APPROVED, 'paid-id', {'id': 'paid-id'},
    )
    assert wompi_tx.order.status == Order.Status.PAYMENT_CONFIRMED


@pytest.mark.django_db
def test_approval_for_cancelled_order_keeps_the_order_cancelled(wompi_tx):
    """Fail if a late approval changes the state of a cancelled order."""
    event = _prepare_unabsorbable_approval(wompi_tx, 'order_not_awaiting_payment')

    WompiService.process_event(event)

    wompi_tx.refresh_from_db()
    assert wompi_tx.status == WompiTransaction.Status.APPROVED
    assert wompi_tx.order.status == Order.Status.CANCELLED
    assert not wompi_tx.order.status_history.exists()


@pytest.mark.django_db
@pytest.mark.parametrize('reason', sorted(_UNABSORBABLE_APPROVALS))
def test_unabsorbable_approval_logs_one_review_error(wompi_tx, caplog, reason):
    """Fail if a charge the order cannot absorb leaves no actionable trace."""
    event = _prepare_unabsorbable_approval(wompi_tx, reason)
    caplog.set_level(logging.ERROR, logger=_SERVICE_LOGGER)

    WompiService.process_event(event)

    assert caplog.record_tuples == [(_SERVICE_LOGGER, logging.ERROR, _review_message(wompi_tx, reason))]


@pytest.mark.django_db
@override_settings(ADMIN_EMAIL='admin@example.com')
@pytest.mark.parametrize('reason', sorted(_UNABSORBABLE_APPROVALS))
def test_unabsorbable_approval_alerts_staff_after_commit(
    wompi_tx, mailoutbox, django_capture_on_commit_callbacks, reason,
):
    """Fail if staff is not told, once the decision commits, about a charge to review."""
    event = _prepare_unabsorbable_approval(wompi_tx, reason)

    with django_capture_on_commit_callbacks(execute=True):
        WompiService.process_event(event)
        assert mailoutbox == []

    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ['admin@example.com']
    assert mailoutbox[0].subject == f'Revisar pago Wompi — {wompi_tx.order.order_number}'


@pytest.mark.django_db
@override_settings(ADMIN_EMAIL='admin@example.com')
@pytest.mark.parametrize('order_status', [Order.Status.PAYMENT_CONFIRMED, Order.Status.CANCELLED])
def test_redelivered_settled_approval_raises_no_review_alert(
    wompi_tx, mailoutbox, caplog, django_capture_on_commit_callbacks, order_status,
):
    """Fail if a redelivered approval of the paying transaction is reported as a new charge."""
    _prepare_unabsorbable_approval(wompi_tx, 'duplicate_approval')
    Order.objects.filter(pk=wompi_tx.order_id).update(status=order_status)
    caplog.set_level(logging.ERROR, logger=_SERVICE_LOGGER)

    with django_capture_on_commit_callbacks(execute=True):
        WompiService.process_event(_make_event_data('test', tx_id='paid-id', reference=wompi_tx.reference))

    assert caplog.record_tuples == []
    assert mailoutbox == []


# ---------------------------------------------------------------------------
# create_checkout
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch('base_feature_app.services.wompi_service.requests.post')
@override_settings(WOMPI_API_URL='https://sandbox.wompi.co/v1', WOMPI_PRIVATE_KEY='prv_test_key', FRONTEND_URL='http://localhost:3000')
def test_create_checkout_returns_checkout_url(mock_post, wompi_tx):
    """Return the hosted checkout URL received from Wompi."""
    mock_response = MagicMock()
    mock_response.json.return_value = {'data': {'id': 'testlink'}}
    mock_response.raise_for_status.return_value = None
    mock_post.return_value = mock_response

    url = WompiService.create_checkout(wompi_tx)
    mock_post.assert_called_once()
    assert url == 'https://checkout.wompi.co/l/testlink'


@pytest.mark.django_db
@patch('base_feature_app.services.wompi_service.requests.post')
@override_settings(WOMPI_API_URL='https://sandbox.wompi.co/v1', WOMPI_PRIVATE_KEY='prv_test_key', FRONTEND_URL='http://localhost:3000')
def test_create_checkout_saves_url_to_transaction(mock_post, wompi_tx):
    """Persist a hosted checkout URL on its payment transaction."""
    mock_response = MagicMock()
    mock_response.json.return_value = {'data': {'id': 'saved'}}
    mock_response.raise_for_status.return_value = None
    mock_post.return_value = mock_response

    WompiService.create_checkout(wompi_tx)
    mock_post.assert_called_once()
    wompi_tx.refresh_from_db()
    assert wompi_tx.checkout_url == 'https://checkout.wompi.co/l/saved'


@pytest.mark.django_db
@patch('base_feature_app.services.wompi_service.requests.post', side_effect=Exception('Connection error'))
@override_settings(WOMPI_API_URL='https://sandbox.wompi.co/v1', WOMPI_PRIVATE_KEY='prv_test_key', FRONTEND_URL='http://localhost:3000')
def test_create_checkout_raises_on_request_failure(mock_post, wompi_tx):
    """Propagate a gateway failure while creating a hosted checkout."""
    with pytest.raises(Exception, match='Connection error'):
        WompiService.create_checkout(wompi_tx)
    wompi_tx.refresh_from_db()
    assert wompi_tx.checkout_url == ''


# ---------------------------------------------------------------------------
# validate_config
# ---------------------------------------------------------------------------

@override_settings(
    WOMPI_API_URL='https://production.wompi.co/v1',
    WOMPI_PUBLIC_KEY='pub_prod_x', WOMPI_PRIVATE_KEY='prv_prod_x',
    WOMPI_INTEGRITY_SECRET='prod_integrity_x', WOMPI_EVENTS_SECRET='prod_events_x',
)
def test_validate_config_returns_no_issues_when_aligned_to_production():
    """Accept keys matching the production API environment."""
    assert WompiService.validate_config() == []


@override_settings(
    WOMPI_API_URL='https://production.wompi.co/v1',
    WOMPI_PUBLIC_KEY='pub_test_x', WOMPI_PRIVATE_KEY='prv_test_x',
    WOMPI_INTEGRITY_SECRET='test_integrity_x', WOMPI_EVENTS_SECRET='test_events_x',
)
def test_validate_config_flags_environment_mismatch():
    """Report keys whose environment differs from the API URL."""
    issues = WompiService.validate_config()
    assert any('WOMPI_PUBLIC_KEY' in i and 'sandbox' in i and 'production' in i for i in issues)


@override_settings(
    WOMPI_API_URL='https://production.wompi.co/v1',
    WOMPI_PUBLIC_KEY='', WOMPI_PRIVATE_KEY='prv_prod_x',
    WOMPI_INTEGRITY_SECRET='prod_integrity_x', WOMPI_EVENTS_SECRET='prod_events_x',
)
def test_validate_config_flags_empty_key():
    """Report a required Wompi key with an empty value."""
    assert 'WOMPI_PUBLIC_KEY is empty' in WompiService.validate_config()

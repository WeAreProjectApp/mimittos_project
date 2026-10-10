# ruff: noqa: D100, D103

import re
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.core import signing
from django.test import override_settings
from django.utils import timezone

from base_feature_app.models import Order
from base_feature_app.services.notification_service import NotificationService
from base_feature_app.services.order_access_service import ORDER_ACCESS_SALT

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def base_order(db):
    return Order.objects.create(
        order_number='MMT-20260420-N001',
        customer_email='client@example.com',
        customer_name='María López',
        customer_phone='3001112233',
        address='Calle 45',
        city='Medellín',
        department='Antioquia',
        total_amount=120000,
        deposit_amount=60000,
        amount_paid_now=60000,
        balance_amount=60000,
        tracking_number='',
        shipping_carrier='',
    )


@pytest.fixture(params=[
    (Order.PaymentMode.FULL, 154000, 0, 'Pago realizado', 'Pago realizado', '$154,000 COP'),
    (Order.PaymentMode.DEPOSIT, 80000, 90000, 'Abono pagado', 'Abono', '$80,000 COP'),
], ids=['full', 'deposit'])
def paid_order(base_order, request):
    mode, amount, balance, customer_label, admin_label, expected_amount = request.param
    base_order.payment_mode = mode
    base_order.total_amount = 160000
    base_order.deposit_amount = 80000
    base_order.shipping_amount = 10000
    base_order.discount_amount = 16000
    base_order.amount_paid_now = amount
    base_order.balance_amount = balance
    base_order.status = Order.Status.PAYMENT_CONFIRMED
    base_order.save()
    return base_order, customer_label, admin_label, expected_amount


@pytest.fixture
def order_with_recent_email(base_order):
    base_order.last_automated_email_at = timezone.now() - timedelta(hours=1)
    base_order.save(update_fields=['last_automated_email_at'])
    return base_order


@pytest.fixture
def order_with_old_email(base_order):
    base_order.last_automated_email_at = timezone.now() - timedelta(hours=25)
    base_order.save(update_fields=['last_automated_email_at'])
    return base_order


# ---------------------------------------------------------------------------
# notify_order_confirmation
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@override_settings(FRONTEND_URL='https://store.example.test')
def test_guest_confirmation_text_links_to_sign_up(base_order, mailoutbox):
    NotificationService.notify_order_confirmation(base_order)

    assert 'Crear cuenta → https://store.example.test/sign-up' in mailoutbox[0].body


@pytest.mark.django_db
@override_settings(FRONTEND_URL='https://store.example.test')
def test_guest_confirmation_html_links_to_sign_up(base_order, mailoutbox):
    NotificationService.notify_order_confirmation(base_order)

    html = mailoutbox[0].alternatives[0].content
    assert re.search(r'<a href="https://store\.example\.test/sign-up"[^>]*>Créala aquí</a>', html)


@pytest.mark.django_db
@override_settings(FRONTEND_URL='https://store.example.test/?origin="><img src=x onerror=alert(1)>')
def test_guest_confirmation_html_escapes_registration_href(base_order, mailoutbox):
    NotificationService.notify_order_confirmation(base_order)

    html = mailoutbox[0].alternatives[0].content
    assert 'href="https://store.example.test/?origin=&quot;&gt;&lt;img src=x onerror=alert(1)&gt;/sign-up"' in html
    assert '<img src=x' not in html


@pytest.mark.django_db
@override_settings(FRONTEND_URL='https://store.example.test')
def test_existing_customer_confirmation_omits_registration_invitation(base_order, django_user_model, mailoutbox):
    django_user_model.objects.create_user(email=base_order.customer_email)

    NotificationService.notify_order_confirmation(base_order)

    email = mailoutbox[0]
    assert 'Crear cuenta →' not in email.body
    assert 'Créala aquí' not in email.alternatives[0].content


@pytest.mark.django_db
def test_confirmation_text_reports_paid_amount(paid_order, mailoutbox):
    order, label, _admin_label, expected_amount = paid_order

    NotificationService.notify_order_confirmation(order)

    assert f'{label}: {expected_amount}' in mailoutbox[0].body
    assert f'Saldo contraentrega: ${order.balance_amount:,} COP' in mailoutbox[0].body


@pytest.mark.django_db
def test_confirmation_html_reports_paid_amount(paid_order, mailoutbox):
    order, label, _admin_label, expected_amount = paid_order

    NotificationService.notify_order_confirmation(order)

    html = mailoutbox[0].alternatives[0].content
    assert re.search(rf'{re.escape(label)}.*?{re.escape(expected_amount)}', html, re.DOTALL)
    assert re.search(rf'Saldo contraentrega.*?\${order.balance_amount:,} COP', html, re.DOTALL)


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
def test_notify_order_confirmation_sends_email(mock_mail, base_order):
    result = NotificationService.notify_order_confirmation(base_order)
    assert result is True
    mock_mail.assert_called_once()


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
def test_notify_order_confirmation_respects_cooldown(mock_mail, order_with_recent_email):
    result = NotificationService.notify_order_confirmation(order_with_recent_email)
    assert result is False
    mock_mail.assert_not_called()


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
def test_notify_order_confirmation_sends_after_cooldown_expires(mock_mail, order_with_old_email):
    result = NotificationService.notify_order_confirmation(order_with_old_email)
    assert result is True
    mock_mail.assert_called_once()


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
def test_notify_order_confirmation_updates_last_sent_at(mock_mail, base_order):
    NotificationService.notify_order_confirmation(base_order)
    base_order.refresh_from_db()
    assert base_order.last_automated_email_at is not None


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail', side_effect=Exception('SMTP error'))
def test_notify_order_confirmation_returns_false_on_smtp_error(mock_mail, base_order):
    result = NotificationService.notify_order_confirmation(base_order)
    assert result is False


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail', side_effect=RuntimeError('secret-code'))
def test_notification_smtp_log_omits_delivery_exception_content(mock_mail, base_order, caplog):
    """Falla si un error SMTP copia códigos o secretos en el log de entrega."""
    result = NotificationService.notify_order_confirmation(base_order)

    assert result is False
    assert 'error_type=RuntimeError' in caplog.text
    assert 'secret-code' not in caplog.text


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
@pytest.mark.parametrize(
    'notification_method',
    [
        NotificationService.notify_order_confirmation,
        NotificationService.notify_production_started,
        NotificationService.notify_order_shipped,
    ],
)
def test_order_status_email_embeds_scoped_tracking_capability(mock_mail, base_order, notification_method):
    """Falla si cada aviso de pedido deja un enlace sin capacidad para ese pedido."""
    notification_method(base_order)
    body = mock_mail.call_args.args[1]
    token = re.search(r'#access=([^\s]+)', body).group(1)

    assert f'?order={base_order.order_number}#access=' in body
    assert signing.loads(token, salt=ORDER_ACCESS_SALT) == {'order_id': base_order.pk}


# ---------------------------------------------------------------------------
# notify_production_started
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
def test_notify_production_started_sends_email(mock_mail, base_order):
    result = NotificationService.notify_production_started(base_order)
    assert result is True
    mock_mail.assert_called_once()


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
def test_notify_production_started_respects_cooldown(mock_mail, order_with_recent_email):
    result = NotificationService.notify_production_started(order_with_recent_email)
    assert result is False


# ---------------------------------------------------------------------------
# notify_order_shipped
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
def test_notify_order_shipped_sends_email_without_tracking(mock_mail, base_order):
    result = NotificationService.notify_order_shipped(base_order)
    assert result is True
    call_args = mock_mail.call_args
    assert 'La guía estará disponible pronto' in call_args[0][1]


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
def test_notify_order_shipped_includes_tracking_number_when_available(mock_mail, base_order):
    base_order.tracking_number = 'TRACK-12345'
    base_order.shipping_carrier = 'Servientrega'
    base_order.save()
    NotificationService.notify_order_shipped(base_order)
    call_args = mock_mail.call_args
    assert 'TRACK-12345' in call_args[0][1]


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
def test_notify_order_shipped_respects_cooldown(mock_mail, order_with_recent_email):
    result = NotificationService.notify_order_shipped(order_with_recent_email)
    assert result is False


# ---------------------------------------------------------------------------
# notify_new_order_admin
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@override_settings(ADMIN_EMAIL='admin@example.com')
def test_admin_notification_text_reports_paid_amount(paid_order, mailoutbox):
    order, _customer_label, label, expected_amount = paid_order

    NotificationService.notify_new_order_admin(order)

    assert f'{label}: {expected_amount}' in mailoutbox[0].body


@pytest.mark.django_db
@override_settings(ADMIN_EMAIL='admin@example.com')
def test_admin_notification_html_reports_paid_amount(paid_order, mailoutbox):
    order, _customer_label, label, expected_amount = paid_order

    NotificationService.notify_new_order_admin(order)

    html = mailoutbox[0].alternatives[0].content
    assert re.search(rf'{re.escape(label)}.*?{re.escape(expected_amount)}', html, re.DOTALL)


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
@override_settings(ADMIN_EMAIL='admin@peluchelandia.com')
def test_notify_new_order_admin_sends_email_when_configured(mock_mail, base_order):
    result = NotificationService.notify_new_order_admin(base_order)
    assert result is True
    mock_mail.assert_called_once()


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
@override_settings(ADMIN_EMAIL='')
def test_notify_new_order_admin_skips_when_no_email_configured(mock_mail, base_order):
    result = NotificationService.notify_new_order_admin(base_order)
    assert result is False
    mock_mail.assert_not_called()


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail', side_effect=Exception('SMTP error'))
@override_settings(ADMIN_EMAIL='admin@peluchelandia.com')
def test_notify_new_order_admin_returns_false_on_smtp_error(mock_mail, base_order):
    result = NotificationService.notify_new_order_admin(base_order)
    assert result is False


# ---------------------------------------------------------------------------
# notify_payment_review
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
@override_settings(ADMIN_EMAIL='admin@peluchelandia.com')
def test_notify_payment_review_sends_admin_email_when_configured(mock_mail, base_order):
    result = NotificationService.notify_payment_review(base_order, 'MMT-REF-1', 'second-id', 'duplicate_approval')

    subject, body, _sender, recipients = mock_mail.call_args.args
    assert result is True
    assert recipients == ['admin@peluchelandia.com']
    assert subject == 'Revisar pago Wompi — MMT-20260420-N001'
    assert 'Wompi aprobó la transacción second-id (referencia MMT-REF-1)' in body


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
@override_settings(ADMIN_EMAIL='admin@peluchelandia.com')
@pytest.mark.parametrize(('reason', 'situation'), [
    ('duplicate_approval', 'que ya estaba pagado con otra transacción'),
    ('order_not_awaiting_payment', 'que ya no esperaba pago'),
], ids=['duplicate_approval', 'order_not_awaiting_payment'])
def test_notify_payment_review_explains_the_reason(mock_mail, base_order, reason, situation):
    NotificationService.notify_payment_review(base_order, 'MMT-REF-1', 'second-id', reason)

    assert situation in mock_mail.call_args.args[1]


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail')
@override_settings(ADMIN_EMAIL='')
def test_notify_payment_review_skips_without_admin_email(mock_mail, base_order):
    result = NotificationService.notify_payment_review(base_order, 'MMT-REF-1', 'second-id', 'duplicate_approval')

    assert result is False
    mock_mail.assert_not_called()


@pytest.mark.django_db
@patch('base_feature_app.services.notification_service.send_mail', side_effect=RuntimeError('smtp-secret'))
@override_settings(ADMIN_EMAIL='admin@peluchelandia.com')
def test_payment_review_smtp_failure_logs_only_the_error_type(mock_mail, base_order, caplog):
    result = NotificationService.notify_payment_review(base_order, 'MMT-REF-1', 'second-id', 'duplicate_approval')

    assert result is False
    assert 'payment review email delivery failed (error_type=RuntimeError)' in caplog.text
    assert 'smtp-secret' not in caplog.text


# ---------------------------------------------------------------------------
# notify_status_change
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@patch('base_feature_project.tasks.send_order_confirmation_email')
def test_notify_status_change_dispatches_task_for_payment_confirmed(mock_task, base_order):
    NotificationService.notify_status_change(base_order, Order.Status.PAYMENT_CONFIRMED)
    mock_task.assert_called_once_with(base_order.id)
    assert mock_task.call_count == 1


@pytest.mark.django_db
@patch('base_feature_project.tasks.send_production_started_email')
def test_notify_status_change_dispatches_task_for_in_production(mock_task, base_order):
    NotificationService.notify_status_change(base_order, Order.Status.IN_PRODUCTION)
    mock_task.assert_called_once_with(base_order.id)
    assert mock_task.call_count == 1


@pytest.mark.django_db
@patch('base_feature_project.tasks.send_order_shipped_email')
def test_notify_status_change_dispatches_task_for_shipped(mock_task, base_order):
    NotificationService.notify_status_change(base_order, Order.Status.SHIPPED)
    mock_task.assert_called_once_with(base_order.id)
    assert mock_task.call_count == 1


@pytest.mark.django_db
@patch('base_feature_project.tasks.send_order_confirmation_email')
@patch('base_feature_project.tasks.send_production_started_email')
@patch('base_feature_project.tasks.send_order_shipped_email')
def test_notify_status_change_does_nothing_for_unmapped_status(mock_shipped, mock_prod, mock_confirm, base_order):
    NotificationService.notify_status_change(base_order, Order.Status.CANCELLED)
    assert mock_confirm.call_count == 0
    assert mock_prod.call_count == 0
    assert mock_shipped.call_count == 0

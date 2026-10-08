"""Exercise order email timeouts through Django's real SMTP backend."""

from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from base_feature_app.models import Order
from base_feature_app.services.notification_service import NotificationService


@pytest.fixture
def smtp_settings(settings):
    """Keep email delivery inside the simulated SMTP boundary."""
    settings.EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    settings.EMAIL_HOST = 'smtp.example.invalid'
    settings.EMAIL_PORT = 587
    settings.EMAIL_HOST_USER = ''
    settings.EMAIL_HOST_PASSWORD = ''
    settings.EMAIL_USE_TLS = True
    settings.EMAIL_USE_SSL = False
    settings.DEFAULT_FROM_EMAIL = 'orders@example.com'
    return settings


@pytest.fixture
def notification_order(db):
    """Create an order whose previous email is outside the cooldown."""
    return Order.objects.create(
        order_number='MMT-SMTP-TIMEOUT-001',
        customer_email='buyer@example.com',
        customer_name='Test Buyer',
        address='Test address',
        city='Bogotá',
        department='Cundinamarca',
        total_amount=80000,
        deposit_amount=40000,
        balance_amount=40000,
        last_automated_email_at=timezone.now() - timedelta(hours=25),
    )


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('smtp_class', 'use_tls', 'use_ssl'),
    [
        ('smtplib.SMTP', False, False),
        ('smtplib.SMTP', True, False),
        ('smtplib.SMTP_SSL', False, True),
    ],
)
def test_order_email_passes_configured_timeout_to_smtp(
    smtp_settings, notification_order, smtp_class, use_tls, use_ssl,
):
    """Fail if an SMTP transport is opened without the approved finite timeout."""
    smtp_settings.EMAIL_USE_TLS = use_tls
    smtp_settings.EMAIL_USE_SSL = use_ssl

    with patch(smtp_class) as smtp:
        delivered = NotificationService.notify_order_confirmation(notification_order)

    assert delivered is True
    smtp.assert_called_once()
    assert smtp.call_args.kwargs.get('timeout') == 10
    smtp.return_value.sendmail.assert_called_once()
    notification_order.refresh_from_db()
    assert notification_order.last_automated_email_at > timezone.now() - timedelta(minutes=1)


@pytest.mark.django_db
def test_order_email_reports_connection_timeout(smtp_settings, notification_order):
    """Fail if a real SMTP connection timeout is treated as a delivered email."""
    smtp_settings.EMAIL_TIMEOUT = 10

    with patch('smtplib.SMTP', side_effect=TimeoutError('connection timed out')):
        delivered = NotificationService.notify_order_confirmation(notification_order)

    assert delivered is False


@pytest.mark.django_db
@pytest.mark.parametrize('failed_operation', ['starttls', 'sendmail'])
def test_order_email_timeout_preserves_previous_delivery_time(
    smtp_settings, notification_order, failed_operation,
):
    """Fail if a timeout starts the cooldown despite no successful delivery."""
    smtp_settings.EMAIL_TIMEOUT = 10
    previous_delivery = notification_order.last_automated_email_at

    with patch('smtplib.SMTP') as smtp:
        getattr(smtp.return_value, failed_operation).side_effect = TimeoutError('SMTP timed out')
        NotificationService.notify_order_confirmation(notification_order)

    notification_order.refresh_from_db()
    assert notification_order.last_automated_email_at == previous_delivery

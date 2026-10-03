import logging
import secrets
from datetime import timedelta
from functools import partial

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from base_feature_app.models import Order, OrderAccessChallenge
from base_feature_app.utils.email_renderer import render_email_html


logger = logging.getLogger(__name__)

ORDER_ACCESS_SALT = 'base_feature_app.order_access'
ORDER_ACCESS_MAX_AGE = timedelta(days=30)
CHALLENGE_MAX_AGE = timedelta(minutes=10)
BUDGET_WINDOW = timedelta(hours=1)
SEND_COOLDOWN = timedelta(seconds=60)
MAX_FAILED_ATTEMPTS = 5
MAX_SENDS = 5
ORDER_ACCESS_ERROR = {
    'code': 'order_access_required',
    'detail': 'Verifica tu correo para acceder a este pedido.',
}


def _normalize_email(email):
    return email.strip().casefold()


class OrderAccessService:
    @staticmethod
    def grant_access(order):
        return {
            'order_access_token': signing.dumps({'order_id': order.pk}, salt=ORDER_ACCESS_SALT),
            'expires_at': (timezone.now() + ORDER_ACCESS_MAX_AGE).isoformat(),
        }

    @staticmethod
    def has_access(request, order):
        if order is None:
            return False
        user = request.user
        if user.is_authenticated and user.is_active and (
            user.is_staff or order.customer_id == user.pk
        ):
            return True
        token = request.headers.get('X-Order-Access')
        if not token:
            return False
        try:
            payload = signing.loads(token, salt=ORDER_ACCESS_SALT, max_age=ORDER_ACCESS_MAX_AGE)
        except (signing.BadSignature, ValueError, TypeError):
            return False
        return payload == {'order_id': order.pk}

    @staticmethod
    def tracking_url(order):
        token = OrderAccessService.grant_access(order)['order_access_token']
        return f'{settings.FRONTEND_URL}/tracking?order={order.order_number}#access={token}'

    @staticmethod
    def _refresh_windows(challenge, now):
        if now - challenge.attempt_window_started_at >= BUDGET_WINDOW:
            challenge.failed_attempts = 0
            challenge.attempt_window_started_at = now
        if now - challenge.send_window_started_at >= BUDGET_WINDOW:
            challenge.send_count = 0
            challenge.send_window_started_at = now

    @staticmethod
    def request_access(order_number, email):
        with transaction.atomic():
            # Lock the order as well so two first requests cannot create competing challenges.
            order = Order.objects.select_for_update().filter(order_number=order_number).first()
            if order is None or _normalize_email(email) != _normalize_email(order.customer_email):
                return
            challenge, _ = OrderAccessChallenge.objects.select_for_update().get_or_create(order=order)
            now = timezone.now()
            OrderAccessService._refresh_windows(challenge, now)
            if (
                challenge.failed_attempts >= MAX_FAILED_ATTEMPTS
                or challenge.send_count >= MAX_SENDS
                or (challenge.last_sent_at is not None and now - challenge.last_sent_at < SEND_COOLDOWN)
            ):
                challenge.save()
                return
            code = f'{secrets.randbelow(1_000_000):06d}'
            challenge.code_hash = make_password(code)
            challenge.expires_at = now + CHALLENGE_MAX_AGE
            challenge.consumed_at = None
            challenge.send_count += 1
            challenge.last_sent_at = now
            challenge.save()
            transaction.on_commit(partial(
                OrderAccessService._send_access_code, order.customer_email, order.order_number, code,
            ))

    @staticmethod
    def verify_access(order_number, email, code):
        with transaction.atomic():
            order = Order.objects.select_for_update().filter(order_number=order_number).first()
            if order is None:
                return None
            challenge = OrderAccessChallenge.objects.select_for_update().filter(order=order).first()
            if challenge is None:
                return None
            now = timezone.now()
            OrderAccessService._refresh_windows(challenge, now)
            if challenge.failed_attempts >= MAX_FAILED_ATTEMPTS:
                challenge.save()
                return None
            valid = (
                _normalize_email(email) == _normalize_email(order.customer_email)
                and challenge.consumed_at is None
                and challenge.expires_at is not None and challenge.expires_at > now
                and check_password(code, challenge.code_hash)
            )
            if not valid:
                challenge.failed_attempts += 1
                challenge.save()
                return None
            challenge.consumed_at = now
            challenge.save()
            return OrderAccessService.grant_access(order)

    @staticmethod
    def _send_access_code(email, order_number, code):
        try:
            subject = 'Tu código para acceder al pedido MIMITTOS'
            body = (
                f'Tu código para acceder al pedido {order_number} es {code}.\n\n'
                'Es válido por 10 minutos y se puede usar una sola vez.\n'
                'Si no lo solicitaste, puedes ignorar este correo.'
            )
            html = render_email_html(
                heading='Accede a tu pedido',
                paragraphs=[f'Usa este código para acceder al pedido {order_number}.'],
                code=code,
                footer_note='Válido por 10 minutos. Si no lo solicitaste, ignora este correo.',
                subject=subject,
            )
            sent = send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [email], html_message=html)
            if not sent:
                logger.warning('order access email delivery returned no messages')
        except Exception as exc:
            logger.warning('order access email delivery failed (error_type=%s)', type(exc).__name__)

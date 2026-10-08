import hashlib
import hmac
import logging
from functools import partial

import requests
from django.conf import settings
from django.db import transaction

from base_feature_app.models import WompiTransaction, Order

logger = logging.getLogger(__name__)


def _normalize_phone_e164_co(raw: str) -> str:
    """Normalize a Colombian phone number to the 57XXXXXXXXXX format Wompi expects
    in customer_data.phone_number. If the format is not recognized, return the
    digits as-is so legacy data is not broken."""
    if not raw:
        return ''
    digits = ''.join(c for c in raw if c.isdigit())
    if len(digits) == 12 and digits.startswith('57'):
        return digits
    if len(digits) == 10 and digits.startswith('3'):
        return '57' + digits
    return digits


class WompiService:
    @staticmethod
    @transaction.atomic
    def apply_transaction_data(reference: str, data: dict, *, cancel_failed: bool = False,
                               notes: str = '', allow_new_attempt: bool = False,
                               status_override: str | None = None) -> WompiTransaction:
        """Apply provider data using the same lock order as administrative updates."""
        from base_feature_app.services.order_service import OrderService
        from base_feature_app.services.notification_service import NotificationService

        order_id = WompiTransaction.objects.values_list('order_id', flat=True).get(reference=reference)
        order = Order.objects.select_for_update().get(pk=order_id)
        tx = WompiTransaction.objects.select_for_update().get(reference=reference)
        tx.order = order

        raw_status = (status_override or data.get('status') or '').lower()
        new_status = raw_status if raw_status in WompiTransaction.Status.values else WompiTransaction.Status.PENDING
        provider_id = data.get('id') or tx.wompi_id
        new_attempt = allow_new_attempt and provider_id != tx.wompi_id

        # Pending/failure updates from another attempt must not replace the
        # current attempt. An approval pays the reference, including a retry
        # whose webhook arrived before its POST response was persisted.
        if tx.status == WompiTransaction.Status.APPROVED and new_status != tx.status:
            return tx
        if tx.status == WompiTransaction.Status.APPROVED and provider_id != tx.wompi_id:
            return tx
        if (tx.wompi_id and provider_id != tx.wompi_id and not allow_new_attempt
                and new_status != WompiTransaction.Status.APPROVED):
            return tx
        if tx.status != WompiTransaction.Status.PENDING and new_status == WompiTransaction.Status.PENDING and not new_attempt:
            return tx

        tx.wompi_id = provider_id
        tx.status = new_status
        tx.payment_method_type = data.get('payment_method_type') or tx.payment_method_type
        tx.raw_response = data
        tx.save(update_fields=['wompi_id', 'status', 'payment_method_type', 'raw_response', 'updated_at'])

        if order.status == Order.Status.PENDING_PAYMENT:
            if new_status == WompiTransaction.Status.APPROVED:
                order = OrderService.update_status(order, Order.Status.PAYMENT_CONFIRMED, notes=notes)
                tx.order = order
                transaction.on_commit(partial(NotificationService.notify_new_order_admin, order), robust=True)
            elif cancel_failed and new_status in (
                WompiTransaction.Status.DECLINED, WompiTransaction.Status.VOIDED, WompiTransaction.Status.ERROR,
            ):
                tx.order = OrderService.update_status(order, Order.Status.CANCELLED, notes=notes)
        return tx

    @staticmethod
    @transaction.atomic
    def cancel_abandoned_order(reference: str, *, notes: str, without_provider_id: bool = False,
                               expected_provider_id: str | None = None) -> bool:
        """Recheck a reconciliation decision after obtaining the current rows."""
        from base_feature_app.services.order_service import OrderService

        order_id = WompiTransaction.objects.values_list('order_id', flat=True).get(reference=reference)
        order = Order.objects.select_for_update().get(pk=order_id)
        tx = WompiTransaction.objects.select_for_update().get(reference=reference)
        if order.status != Order.Status.PENDING_PAYMENT or tx.status == WompiTransaction.Status.APPROVED:
            return False
        if without_provider_id and tx.wompi_id:
            return False
        if not without_provider_id and tx.status != WompiTransaction.Status.PENDING:
            return False
        if expected_provider_id is not None and tx.wompi_id != expected_provider_id:
            return False
        OrderService.update_status(order, Order.Status.CANCELLED, notes=notes)
        return True

    @staticmethod
    def _api_url() -> str:
        return getattr(settings, 'WOMPI_API_URL', 'https://production.wompi.co/v1')

    @staticmethod
    def _private_key() -> str:
        return getattr(settings, 'WOMPI_PRIVATE_KEY', '')

    @staticmethod
    def _public_key() -> str:
        return getattr(settings, 'WOMPI_PUBLIC_KEY', '')

    @staticmethod
    def _events_secret() -> str:
        return getattr(settings, 'WOMPI_EVENTS_SECRET', '')

    @staticmethod
    def _integrity_secret() -> str:
        return getattr(settings, 'WOMPI_INTEGRITY_SECRET', '')

    @staticmethod
    def validate_config() -> list:
        """Return Wompi configuration problems (empty list if everything is OK).

        Detects the two classes of error that cause silent failures in prod:
          - empty keys/secrets
          - environment mismatch between WOMPI_API_URL and the key prefixes
            (e.g. test keys with a production URL, or vice versa). This was
            precisely the root cause of the incident that motivated this check.
        """
        issues = []
        api_url = WompiService._api_url()
        keys = (
            ('WOMPI_PUBLIC_KEY', WompiService._public_key()),
            ('WOMPI_PRIVATE_KEY', WompiService._private_key()),
            ('WOMPI_INTEGRITY_SECRET', WompiService._integrity_secret()),
            ('WOMPI_EVENTS_SECRET', WompiService._events_secret()),
        )

        for name, value in keys:
            if not value:
                issues.append(f'{name} is empty')

        url_env = 'sandbox' if 'sandbox' in api_url else 'production'

        def _key_env(value: str) -> str:
            if value.startswith(('pub_test_', 'prv_test_', 'test_')):
                return 'sandbox'
            if value.startswith(('pub_prod_', 'prv_prod_', 'prod_')):
                return 'production'
            return ''

        for name, value in keys:
            key_env = _key_env(value)
            if value and key_env and key_env != url_env:
                issues.append(
                    f'{name} looks like the "{key_env}" environment but WOMPI_API_URL is "{url_env}" ({api_url})'
                )

        return issues

    @staticmethod
    def _integrity_signature(reference: str, amount_in_cents: int, currency: str = 'COP') -> str:
        secret = WompiService._integrity_secret()
        raw = f'{reference}{amount_in_cents}{currency}{secret}'
        return hashlib.sha256(raw.encode()).hexdigest()

    @staticmethod
    def process_transaction(tx: WompiTransaction, method_data: dict, acceptance_token: str = '', personal_auth_token: str = '') -> dict:
        """Create a direct Wompi transaction (no hosted checkout page)."""
        order = tx.order
        integrity = WompiService._integrity_signature(tx.reference, tx.amount_in_cents, tx.currency)

        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        payload = {
            'amount_in_cents': tx.amount_in_cents,
            'currency': tx.currency,
            'customer_email': order.customer_email,
            'reference': tx.reference,
            'signature': integrity,
            'acceptance_token': acceptance_token,
            'accept_personal_auth': personal_auth_token,
            'redirect_url': f'{frontend_url}/order-confirmed?order={order.order_number}',
            'customer_data': {
                'phone_number': _normalize_phone_e164_co(order.customer_phone or ''),
                'full_name': order.customer_name,
            },
            'payment_method': method_data,
        }

        # ecommerce_url: for BANCOLOMBIA_TRANSFER it lets the user skip Wompi's
        # summary screen and go straight to the bank app/portal.
        if method_data.get('type') == 'BANCOLOMBIA_TRANSFER':
            method_data.setdefault(
                'ecommerce_url',
                f'{frontend_url}/order-confirmed?order={order.order_number}',
            )

        method_type = method_data.get('type', '')
        api_url = WompiService._api_url()
        logger.debug(
            'Wompi process_transaction → POST %s/transactions ref=%s method=%s amount_in_cents=%s acceptance_token_len=%s personal_auth_len=%s',
            api_url, tx.reference, method_type, tx.amount_in_cents,
            len(acceptance_token or ''), len(personal_auth_token or ''),
        )

        try:
            resp = requests.post(
                f'{api_url}/transactions',
                json=payload,
                headers={
                    'Authorization': f'Bearer {WompiService._private_key()}',
                    'Content-Type': 'application/json',
                },
                timeout=15,
            )
        except requests.RequestException as exc:
            logger.error('Wompi network error ref=%s: %s', tx.reference, exc, exc_info=True)
            raise

        if resp.status_code >= 400:
            body_preview = (resp.text or '')[:2000]
            logger.error(
                'Wompi rejected transaction ref=%s status=%s body=%s',
                tx.reference, resp.status_code, body_preview,
            )
            resp.raise_for_status()

        data = resp.json().get('data', {})
        logger.info(
            'Wompi accepted transaction ref=%s wompi_id=%s status=%s',
            tx.reference, data.get('id', ''), data.get('status', ''),
        )

        def _extract_redirect(payload: dict) -> str:
            pm = payload.get('payment_method') or {}
            if not isinstance(pm, dict):
                return ''
            extra = pm.get('extra') or {}
            return extra.get('async_payment_url') or extra.get('redirect_url') or ''

        wompi_status_raw = (data.get('status') or 'ERROR').upper()
        status_message = data.get('status_message') or ''
        redirect_url = _extract_redirect(data)
        data.setdefault('payment_method_type', method_data.get('type', ''))
        tx = WompiService.apply_transaction_data(
            tx.reference, data, allow_new_attempt=True, status_override=wompi_status_raw,
        )
        wompi_status_raw = tx.status.upper()

        needs_async_url = method_type in ('PSE', 'BANCOLOMBIA_TRANSFER')
        should_poll = bool(tx.wompi_id) and needs_async_url and not redirect_url

        if should_poll:
            import time
            max_attempts = 15
            for attempt in range(max_attempts):
                time.sleep(1.0)
                fresh = WompiService.fetch_transaction(tx.wompi_id)
                if not fresh:
                    continue
                fresh_status = (fresh.get('status') or '').upper()
                fresh_url = _extract_redirect(fresh)
                fresh_msg = fresh.get('status_message') or ''
                changed = (
                    fresh_status != wompi_status_raw
                    or fresh_url != redirect_url
                    or fresh_msg != status_message
                )
                if changed:
                    data = fresh
                    wompi_status_raw = fresh_status or wompi_status_raw
                    redirect_url = fresh_url
                    status_message = fresh_msg or status_message
                    tx = WompiService.apply_transaction_data(tx.reference, fresh)
                    wompi_status_raw = tx.status.upper()
                if wompi_status_raw in ('APPROVED', 'DECLINED', 'VOIDED', 'ERROR'):
                    logger.debug(
                        'Wompi terminal status during poll ref=%s status=%s after %s polls',
                        tx.reference, wompi_status_raw, attempt + 1,
                    )
                    break
                if redirect_url:
                    logger.debug(
                        'Wompi async_payment_url ready ref=%s after %s polls',
                        tx.reference, attempt + 1,
                    )
                    break
            else:
                if needs_async_url and not redirect_url:
                    logger.warning(
                        'Wompi async_payment_url still missing ref=%s after %s polls',
                        tx.reference, max_attempts,
                    )

        if needs_async_url and not redirect_url and wompi_status_raw != 'APPROVED':
            wompi_status_raw = 'ERROR'
            status_message = status_message or 'No se generó URL de redirección. Intenta con otro método de pago.'
            tx = WompiService.apply_transaction_data(tx.reference, data, status_override='ERROR')
            wompi_status_raw = tx.status.upper()
            logger.warning(
                'Treating ref=%s as ERROR: %s requires async_payment_url but Wompi never returned one',
                tx.reference, method_type,
            )

        return {
            'status': wompi_status_raw,
            'redirect_url': redirect_url,
            'wompi_id': data.get('id', ''),
            'status_message': status_message,
        }

    @staticmethod
    def fetch_transaction(wompi_id: str) -> dict:
        try:
            resp = requests.get(
                f'{WompiService._api_url()}/transactions/{wompi_id}',
                headers={'Authorization': f'Bearer {WompiService._private_key()}'},
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json().get('data', {})
        except requests.RequestException as exc:
            logger.warning('fetch_transaction failed for %s: %s', wompi_id, exc)
            return {}

    @staticmethod
    def get_pse_banks() -> list:
        try:
            resp = requests.get(
                f'{WompiService._api_url()}/pse/financial_institutions',
                headers={'Authorization': f'Bearer {WompiService._public_key()}'},
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json().get('data', [])
        except requests.RequestException as exc:
            logger.warning('Could not fetch PSE banks: %s', exc)
            return []

    @staticmethod
    def create_checkout(wompi_transaction: WompiTransaction, new_account: bool = False) -> str:
        order = wompi_transaction.order
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        redirect_suffix = '&new_account=1' if new_account else ''

        payload = {
            'name': f'Pedido {order.order_number}',
            'description': f'Abono pedido Peluchelandia — {order.order_number}',
            'single_use': True,
            'collect_shipping': False,
            'currency': 'COP',
            'amount_in_cents': wompi_transaction.amount_in_cents,
            'redirect_url': f'{frontend_url}/tracking?order={order.order_number}{redirect_suffix}',
            'reference': wompi_transaction.reference,
            'customer_data': {
                'email': order.customer_email,
                'full_name': order.customer_name,
                'phone_number': order.customer_phone or '',
            },
        }

        try:
            resp = requests.post(
                f'{WompiService._api_url()}/payment_links',
                json=payload,
                headers={
                    'Authorization': f'Bearer {WompiService._private_key()}',
                    'Content-Type': 'application/json',
                },
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json().get('data', {})
            link_id = data.get('id', '')
            checkout_url = f'https://checkout.wompi.co/l/{link_id}' if link_id else ''

            wompi_transaction.checkout_url = checkout_url
            wompi_transaction.raw_response = data
            wompi_transaction.save(update_fields=['checkout_url', 'raw_response', 'updated_at'])

            return checkout_url

        except requests.RequestException as exc:
            logger.error('Wompi checkout creation failed: %s', exc)
            raise

    @staticmethod
    def verify_signature(event_data: dict) -> bool:
        """Verify Wompi webhook signature using SHA256.

        Wompi embeds the checksum inside the body (not in an HTTP header).
        Algorithm: sha256(prop1 + prop2 + ... + timestamp + events_secret)
        Properties and their order come from event_data['signature']['properties'].

        For the timestamp Wompi has two variants across its products:
          - `timestamp` numeric (current format of Pagos a Terceros and Checkout)
          - `sent_at` ISO 8601 (historical Checkout variant)
        We accept both: we prefer `timestamp` as it comes in the body, and fall
        back to parsing `sent_at` into unix seconds.
        """
        secret = WompiService._events_secret()
        if not secret:
            logger.warning('WOMPI_EVENTS_SECRET not configured')
            return False

        try:
            sig = event_data['signature']
            expected_checksum = sig['checksum']
            properties = sig['properties']
            data = event_data.get('data', {})

            concat = ''
            for prop in properties:
                value = data
                for part in prop.split('.'):
                    value = value[part]
                concat += str(value)

            if 'timestamp' in event_data:
                concat += str(event_data['timestamp'])
            elif 'sent_at' in event_data:
                from datetime import datetime
                dt = datetime.fromisoformat(str(event_data['sent_at']).replace('Z', '+00:00'))
                concat += str(int(dt.timestamp()))
            else:
                raise KeyError('timestamp/sent_at missing')

            concat += secret

            computed = hashlib.sha256(concat.encode()).hexdigest()
            return hmac.compare_digest(computed, expected_checksum)
        except (KeyError, TypeError, ValueError):
            logger.warning('Wompi signature verification failed: malformed event payload')
            return False

    @staticmethod
    def process_event(event_data: dict) -> None:
        event_type = event_data.get('event')
        if event_type != 'transaction.updated':
            return

        data = event_data.get('data', {}).get('transaction', {})
        reference = data.get('reference', '')

        try:
            WompiService.apply_transaction_data(reference, data)
        except WompiTransaction.DoesNotExist:
            logger.warning('WompiTransaction not found for reference: %s', reference)
            return

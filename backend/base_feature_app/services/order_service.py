import uuid
from functools import partial
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from base_feature_app.models import (
    Order, OrderItem, OrderStatusHistory, WompiTransaction,
    PeluchSizePrice, PersonalizationMedia,
)


ORDER_PRICE_BATCH_SIZE = 100


def _round_to_100(value: float) -> int:
    """Round to the nearest 100 COP — keeps Wompi happy and avoids weird decimals."""
    return int(round(value / 100) * 100)


class OrderService:

    @staticmethod
    def generate_order_number() -> str:
        date_str = timezone.now().strftime('%Y%m%d')
        suffix = uuid.uuid4().hex[:4].upper()
        return f'MMT-{date_str}-{suffix}'

    @staticmethod
    def calculate_deposit(total: int) -> int:
        """
        Legacy fallback: applies the global DEPOSIT_PERCENTAGE setting.
        New flow uses per-product deposit_percentage; this stays for any
        callsite that doesn't have item context.
        """
        percentage = int(getattr(settings, 'DEPOSIT_PERCENTAGE', 50))
        return _round_to_100(total * percentage / 100)

    @staticmethod
    def _item_subtotal(item: dict, peluch, size_price):
        """Return (size_price, unit_price, personalization_cost, line_subtotal) for a cart item dict."""
        personalization_cost = sum([
            peluch.huella_extra_cost if item.get('has_huella') else 0,
            peluch.corazon_extra_cost if item.get('has_corazon') else 0,
            peluch.audio_extra_cost if item.get('has_audio') else 0,
        ])
        discount = getattr(peluch, 'discount_pct', 0) or 0
        unit_price = round(size_price.price * (100 - discount) / 100)
        line_subtotal = (unit_price + personalization_cost) * item['quantity']
        return size_price, unit_price, personalization_cost, line_subtotal

    @staticmethod
    def _priced_items(items):
        """Read current prices inside create_order's transaction, in bounded groups."""
        for start in range(0, len(items), ORDER_PRICE_BATCH_SIZE):
            group = items[start:start + ORDER_PRICE_BATCH_SIZE]
            pairs = {(item['peluch'].pk, item['size'].pk) for item in group}
            price_filter = Q(pk__in=[])
            for peluch_id, size_id in pairs:
                price_filter |= Q(peluch_id=peluch_id, size_id=size_id)
            prices = {
                (price.peluch_id, price.size_id): price
                for price in PeluchSizePrice.objects.filter(price_filter, is_available=True).order_by()
            }
            for item in group:
                price = prices.get((item['peluch'].pk, item['size'].pk))
                if price is None:
                    raise PeluchSizePrice.DoesNotExist('PeluchSizePrice matching query does not exist.')
                yield item, price

    @staticmethod
    @transaction.atomic
    def create_order(validated_data: dict, user=None) -> Order:
        items_data = validated_data.pop('items')
        payment_mode = validated_data.pop('payment_mode', Order.PaymentMode.DEPOSIT)

        # Validation may precede the daily cleanup. Lock the same rows as that
        # task before creating any order/foreign key, in a stable order.
        media_ids = {
            media.pk for item in items_data for field in ('huella_media', 'audio_media')
            if (media := item.get(field)) is not None
        }
        if media_ids:
            current_media = {
                media.pk: media for media in PersonalizationMedia.objects.select_for_update()
                .filter(pk__in=media_ids).order_by('pk')
            }
            if media_ids != current_media.keys():
                raise ValueError('Un archivo de personalización ya fue retirado. Vuelve a subirlo para completar tu pedido.')
            for item in items_data:
                for field in ('huella_media', 'audio_media'):
                    if item.get(field) is not None:
                        item[field] = current_media[item[field].pk]

        product_subtotal = 0
        weighted_deposit_raw = 0.0
        weighted_full_discount_raw = 0.0
        shipping_total = 0

        for item, size_price in OrderService._priced_items(items_data):
            peluch = item['peluch']
            size_price, unit_price, personalization_cost, line_subtotal = OrderService._item_subtotal(
                item, peluch, size_price,
            )
            item['unit_price'] = unit_price
            item['personalization_cost'] = personalization_cost
            item['_line_subtotal'] = line_subtotal
            item['_size_price'] = size_price

            product_subtotal += line_subtotal

            deposit_pct = size_price.deposit_percentage or int(getattr(settings, 'DEPOSIT_PERCENTAGE', 50))
            weighted_deposit_raw += line_subtotal * deposit_pct / 100

            full_disc_pct = size_price.full_payment_discount_pct or 0
            weighted_full_discount_raw += line_subtotal * full_disc_pct / 100

            if not size_price.free_shipping:
                shipping_total += size_price.shipping_cost * item['quantity']

        deposit_amount = _round_to_100(weighted_deposit_raw)
        discount_amount = _round_to_100(weighted_full_discount_raw)
        shipping_amount = _round_to_100(shipping_total)
        total_amount = product_subtotal  # products only; shipping is separate

        if payment_mode == Order.PaymentMode.FULL:
            amount_paid_now = max(product_subtotal - discount_amount, 0) + shipping_amount
            balance_amount = 0
        else:
            payment_mode = Order.PaymentMode.DEPOSIT
            amount_paid_now = deposit_amount
            balance_amount = (product_subtotal - deposit_amount) + shipping_amount

        order = Order.objects.create(
            customer=user,
            total_amount=total_amount,
            deposit_amount=deposit_amount,
            balance_amount=balance_amount,
            shipping_amount=shipping_amount,
            discount_amount=discount_amount,
            payment_mode=payment_mode,
            amount_paid_now=amount_paid_now,
            **validated_data,
        )

        for item in items_data:
            peluch = item['peluch']
            size_price = item['_size_price']
            OrderItem.objects.create(
                order=order,
                peluch=peluch,
                size=item['size'],
                color=item['color'],
                quantity=item['quantity'],
                unit_price=item['unit_price'],
                personalization_cost=item['personalization_cost'],
                has_huella=item.get('has_huella', False),
                huella_type=item.get('huella_type', ''),
                huella_text=item.get('huella_text', ''),
                huella_media=item.get('huella_media'),
                has_corazon=item.get('has_corazon', False),
                corazon_phrase=item.get('corazon_phrase', ''),
                has_audio=item.get('has_audio', False),
                audio_media=item.get('audio_media'),
                configuration_snapshot={
                    'peluch_title': peluch.title,
                    'size_label': item['size'].label,
                    'size_cm': item['size'].cm,
                    'color_name': item['color'].name,
                    'color_hex': item['color'].hex_code,
                    'discount_pct': peluch.discount_pct,
                    'original_unit_price': size_price.price,
                    'deposit_percentage': size_price.deposit_percentage,
                    'full_payment_discount_pct': size_price.full_payment_discount_pct,
                    'free_shipping': size_price.free_shipping,
                    'shipping_cost': size_price.shipping_cost,
                    'has_huella': item.get('has_huella', False),
                    'huella_type': item.get('huella_type', ''),
                    'huella_text': item.get('huella_text', ''),
                    'has_corazon': item.get('has_corazon', False),
                    'corazon_phrase': item.get('corazon_phrase', ''),
                    'has_audio': item.get('has_audio', False),
                },
            )

        reference = f'{order.order_number}-{uuid.uuid4().hex[:8].upper()}'
        WompiTransaction.objects.create(
            order=order,
            reference=reference,
            amount_in_cents=amount_paid_now * 100,
        )

        OrderService.mark_media_as_used(order)

        return order

    @staticmethod
    @transaction.atomic
    def update_status(order: Order, new_status: str, changed_by=None, notes: str = '') -> Order:
        from base_feature_app.services.notification_service import NotificationService

        # Callers may have loaded the order before a provider request or an
        # administrative change. Serialize against the current persisted row.
        order = Order.objects.select_for_update().get(pk=order.pk)
        previous_status = order.status
        if previous_status == new_status:
            return order
        order.status = new_status
        order.save(update_fields=['status', 'updated_at'])

        OrderStatusHistory.objects.create(
            order=order,
            previous_status=previous_status,
            new_status=new_status,
            changed_by=changed_by,
            notes=notes,
        )

        transaction.on_commit(
            partial(NotificationService.notify_status_change, order, new_status),
            robust=True,
        )

        return order

    @staticmethod
    def mark_media_as_used(order: Order) -> None:
        media_ids = []
        for item in order.items.all():
            if item.huella_media_id:
                media_ids.append(item.huella_media_id)
            if item.audio_media_id:
                media_ids.append(item.audio_media_id)
        if media_ids:
            PersonalizationMedia.objects.filter(id__in=media_ids).update(is_used=True)

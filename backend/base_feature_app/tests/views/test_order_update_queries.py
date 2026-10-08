"""Order mutations keep their complete response cost independent of item count."""

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext

from base_feature_app.models import Order, OrderItem, OrderStatusHistory, PersonalizationMedia
from base_feature_app.tests.factories import (
    OrderFactory,
    OrderItemFactory,
    WompiTransactionFactory,
)

# Includes transaction control and immediate test-mail tasks, not only response reads.
# This scoped bound does not certify the production mutation budget of eight.
MAX_ORDER_UPDATE_TOTAL_QUERIES = 12


def _build_order(customer, count):
    order = OrderFactory(customer=customer)
    WompiTransactionFactory(order=order)
    expected_items = {}
    for index in range(count):
        huella = PersonalizationMedia.objects.create(
            uploaded_by=customer,
            media_type=PersonalizationMedia.MediaType.HUELLA_IMAGE,
            file=f'personalizations/order-{order.pk}-huella-{index}.jpg',
            file_size_kb=120,
        )
        audio = PersonalizationMedia.objects.create(
            uploaded_by=customer,
            media_type=PersonalizationMedia.MediaType.AUDIO,
            file=f'personalizations/order-{order.pk}-audio-{index}.mp3',
            file_size_kb=240,
            duration_sec=6.5,
        )
        item = OrderItemFactory(
            order=order,
            huella_media=huella,
            audio_media=audio,
            has_huella=True,
            huella_type=OrderItem.HuellaType.IMAGE,
            has_audio=True,
        )
        expected_items[item.pk] = {
            'peluch_title': item.peluch.title,
            'peluch_slug': item.peluch.slug,
            'size_id': item.size_id,
            'color_id': item.color_id,
            'huella_media_url': f'http://testserver{huella.file.url}',
            'audio_media_url': f'http://testserver{audio.file.url}',
            'audio_duration_sec': 6.5,
            'audio_size_kb': 240,
        }

    authors = get_user_model().objects.bulk_create([
        get_user_model()(email=f'order-{order.pk}-author-{index}@example.com')
        for index in range(count)
    ])
    OrderStatusHistory.objects.bulk_create([
        OrderStatusHistory(
            order=order,
            previous_status=Order.Status.PENDING_PAYMENT,
            new_status=Order.Status.PAYMENT_CONFIRMED,
            changed_by=author,
            notes='Existing history',
        )
        for author in authors
    ])
    return order, expected_items, {author.email for author in authors}


@pytest.fixture
def orders_with_distinct_relations(admin_user):
    return _build_order(admin_user, 1), _build_order(admin_user, 50)


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(('endpoint', 'payload'), [
    ('tracking', {'tracking_number': 'GUIDE-123', 'shipping_carrier': 'Servientrega'}),
    ('status', {'status': Order.Status.IN_PRODUCTION}),
    ('status', {'status': Order.Status.PAYMENT_CONFIRMED}),
])
def test_order_update_query_budget_is_constant(
    admin_client, orders_with_distinct_relations, endpoint, payload,
):
    """Catch per-item/media/author reads through the complete PATCH endpoint."""
    small, large = orders_with_distinct_relations

    with CaptureQueriesContext(connection) as small_queries:
        small_response = admin_client.patch(
            f'/api/orders/{small[0].order_number}/{endpoint}/', payload, format='json',
        )
    with CaptureQueriesContext(connection) as large_queries:
        large_response = admin_client.patch(
            f'/api/orders/{large[0].order_number}/{endpoint}/', payload, format='json',
        )

    assert small_response.status_code == large_response.status_code == 200
    assert len(small_response.data['items']) == 1
    assert len(large_response.data['items']) == 50
    assert len(small_queries) == len(large_queries) <= MAX_ORDER_UPDATE_TOTAL_QUERIES


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(('endpoint', 'payload'), [
    ('tracking', {'tracking_number': 'GUIDE-123'}),
    ('status', {'status': Order.Status.IN_PRODUCTION}),
])
def test_order_update_response_preserves_personalization_details(
    admin_client, orders_with_distinct_relations, endpoint, payload,
):
    """Catch incomplete prefetches that drop concrete item or payment values."""
    order, expected_items, _ = orders_with_distinct_relations[1]

    response = admin_client.patch(
        f'/api/orders/{order.order_number}/{endpoint}/', payload, format='json',
    )

    assert response.status_code == 200
    actual_items = {
        item['id']: {
            'peluch_title': item['peluch_title'],
            'peluch_slug': item['peluch_slug'],
            'size_id': item['size']['id'],
            'color_id': item['color']['id'],
            'huella_media_url': item['huella_media_url'],
            'audio_media_url': item['audio_media_url'],
            'audio_duration_sec': item['audio_duration_sec'],
            'audio_size_kb': item['audio_size_kb'],
        }
        for item in response.data['items']
    }
    assert actual_items == expected_items
    assert response.data['payment']['reference'] == order.payment.reference


@pytest.mark.django_db(transaction=True)
def test_status_update_response_contains_committed_history(
    admin_client, admin_user, orders_with_distinct_relations, mailoutbox,
):
    """Catch stale histories from prefetching before the service reloads the row."""
    order, _, author_emails = orders_with_distinct_relations[1]

    response = admin_client.patch(
        f'/api/orders/{order.order_number}/status/',
        {'status': Order.Status.IN_PRODUCTION, 'notes': 'Production approved'},
        format='json',
    )

    assert response.status_code == 200
    order.refresh_from_db()
    assert response.data['status'] == order.status == Order.Status.IN_PRODUCTION
    assert len(response.data['status_history']) == 51
    assert {
        history['changed_by_email'] for history in response.data['status_history']
    } == author_emails | {admin_user.email}
    latest = response.data['status_history'][0]
    assert latest['previous_status'] == Order.Status.PENDING_PAYMENT
    assert latest['new_status'] == Order.Status.IN_PRODUCTION
    assert latest['changed_by_email'] == admin_user.email
    assert latest['notes'] == 'Production approved'
    assert OrderStatusHistory.objects.get(pk=latest['id']).notes == 'Production approved'
    assert [message.to for message in mailoutbox] == [[order.customer_email]]


@pytest.mark.django_db(transaction=True)
def test_tracking_update_response_contains_persisted_guide(
    admin_client, orders_with_distinct_relations,
):
    order, _, _ = orders_with_distinct_relations[1]

    response = admin_client.patch(
        f'/api/orders/{order.order_number}/tracking/',
        {'tracking_number': 'GUIDE-123', 'shipping_carrier': 'Servientrega'},
        format='json',
    )

    assert response.status_code == 200
    order.refresh_from_db()
    assert response.data['tracking_number'] == order.tracking_number == 'GUIDE-123'
    assert response.data['shipping_carrier'] == order.shipping_carrier == 'Servientrega'

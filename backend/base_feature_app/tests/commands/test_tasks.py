"""Tests for Silk-related Huey tasks: silk_garbage_collection, weekly_slow_queries_report."""

import logging
from datetime import timedelta
from pathlib import Path
from threading import Event, Thread
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.db import close_old_connections, connection, connections
from django.test import override_settings
from django.utils import timezone
from freezegun import freeze_time

from base_feature_app.models import (
    Order,
    OrderItem,
    PersonalizationMedia,
    WompiTransaction,
)
from base_feature_app.tests.factories import (
    GlobalColorFactory,
    OrderItemFactory,
    PeluchSizePriceFactory,
    PersonalizationMediaFactory,
    WompiTransactionFactory,
)


class _FakeQS(list):
    """List subclass with a no-arg .count() to mimic a sliced Django queryset."""

    def count(self):
        return len(self)


def _setup_silk_mocks(mock_request_cls, mock_sql_query_cls, *, slow_queries, n_plus_one):
    slow_qs = _FakeQS(slow_queries)
    n1_qs = _FakeQS(n_plus_one)
    (
        mock_sql_query_cls.objects
        .filter.return_value
        .select_related.return_value
        .order_by.return_value
        .__getitem__
    ) = MagicMock(return_value=slow_qs)
    (
        mock_request_cls.objects
        .filter.return_value
        .annotate.return_value
        .filter.return_value
        .order_by.return_value
        .__getitem__
    ) = MagicMock(return_value=n1_qs)


# ---------------------------------------------------------------------------
# silk_garbage_collection
# ---------------------------------------------------------------------------

@override_settings(ENABLE_SILK=False)
def test_silk_garbage_collection_skips_when_silk_disabled():
    """silk_garbage_collection returns early without calling call_command when ENABLE_SILK is False."""
    from base_feature_project.tasks import silk_garbage_collection

    with patch('django.core.management.call_command') as mock_call_command:
        silk_garbage_collection.call_local()

    assert mock_call_command.call_count == 0


@override_settings(ENABLE_SILK=True)
def test_silk_garbage_collection_calls_command_with_seven_days():
    """silk_garbage_collection calls silk_garbage_collect with --days=7 when ENABLE_SILK is True."""
    from base_feature_project.tasks import silk_garbage_collection

    with patch('django.core.management.call_command') as mock_call_command:
        silk_garbage_collection.call_local()

    mock_call_command.assert_called_once()
    args, kwargs = mock_call_command.call_args
    assert args[0] == 'silk_garbage_collect'
    assert '--days=7' in args
    assert 'stdout' in kwargs


# ---------------------------------------------------------------------------
# weekly_slow_queries_report
# ---------------------------------------------------------------------------

@override_settings(ENABLE_SILK=False)
def test_weekly_slow_queries_report_skips_when_silk_disabled(tmp_path, monkeypatch):
    """weekly_slow_queries_report returns early without writing a log when ENABLE_SILK is False."""
    from django.conf import settings as django_settings
    monkeypatch.setattr(django_settings, 'BASE_DIR', tmp_path)
    from base_feature_project.tasks import weekly_slow_queries_report

    weekly_slow_queries_report.call_local()

    assert not (tmp_path / 'logs' / 'silk-weekly-report.log').exists()


@freeze_time('2025-06-09')
@override_settings(ENABLE_SILK=True, SLOW_QUERY_THRESHOLD_MS=500, N_PLUS_ONE_THRESHOLD=10)
def test_weekly_slow_queries_report_creates_log_file(tmp_path, monkeypatch):
    """weekly_slow_queries_report creates the log file under BASE_DIR/logs/ when ENABLE_SILK is True."""
    from django.conf import settings as django_settings
    monkeypatch.setattr(django_settings, 'BASE_DIR', tmp_path)

    with (
        patch('silk.models.Request') as mock_request_cls,
        patch('silk.models.SQLQuery') as mock_sql_query_cls,
    ):
        _setup_silk_mocks(mock_request_cls, mock_sql_query_cls, slow_queries=[], n_plus_one=[])
        from base_feature_project.tasks import weekly_slow_queries_report
        weekly_slow_queries_report.call_local()

    assert (tmp_path / 'logs' / 'silk-reports' / 'silk-report-2025-06-09.log').exists()


@freeze_time('2025-06-09')
@override_settings(ENABLE_SILK=True, SLOW_QUERY_THRESHOLD_MS=500, N_PLUS_ONE_THRESHOLD=10)
def test_weekly_slow_queries_report_log_contains_header(tmp_path, monkeypatch):
    """The generated log file contains the WEEKLY QUERY REPORT header."""
    from django.conf import settings as django_settings
    monkeypatch.setattr(django_settings, 'BASE_DIR', tmp_path)

    with (
        patch('silk.models.Request') as mock_request_cls,
        patch('silk.models.SQLQuery') as mock_sql_query_cls,
    ):
        _setup_silk_mocks(mock_request_cls, mock_sql_query_cls, slow_queries=[], n_plus_one=[])
        from base_feature_project.tasks import weekly_slow_queries_report
        weekly_slow_queries_report.call_local()

    content = (tmp_path / 'logs' / 'silk-reports' / 'silk-report-2025-06-09.log').read_text()
    assert 'WEEKLY QUERY REPORT' in content


@freeze_time('2025-06-09')
@override_settings(ENABLE_SILK=True, SLOW_QUERY_THRESHOLD_MS=500, N_PLUS_ONE_THRESHOLD=10)
def test_weekly_slow_queries_report_no_slow_queries_message(tmp_path, monkeypatch):
    """Report contains the 'No slow queries found' message when there are no slow queries."""
    from django.conf import settings as django_settings
    monkeypatch.setattr(django_settings, 'BASE_DIR', tmp_path)

    with (
        patch('silk.models.Request') as mock_request_cls,
        patch('silk.models.SQLQuery') as mock_sql_query_cls,
    ):
        _setup_silk_mocks(mock_request_cls, mock_sql_query_cls, slow_queries=[], n_plus_one=[])
        from base_feature_project.tasks import weekly_slow_queries_report
        weekly_slow_queries_report.call_local()

    content = (tmp_path / 'logs' / 'silk-reports' / 'silk-report-2025-06-09.log').read_text()
    assert 'No slow queries found this week' in content


@freeze_time('2025-06-09')
@override_settings(ENABLE_SILK=True, SLOW_QUERY_THRESHOLD_MS=500, N_PLUS_ONE_THRESHOLD=10)
def test_weekly_slow_queries_report_no_n_plus_one_message(tmp_path, monkeypatch):
    """Report contains the 'No N+1 patterns detected' message when there are no N+1 suspects."""
    from django.conf import settings as django_settings
    monkeypatch.setattr(django_settings, 'BASE_DIR', tmp_path)

    with (
        patch('silk.models.Request') as mock_request_cls,
        patch('silk.models.SQLQuery') as mock_sql_query_cls,
    ):
        _setup_silk_mocks(mock_request_cls, mock_sql_query_cls, slow_queries=[], n_plus_one=[])
        from base_feature_project.tasks import weekly_slow_queries_report
        weekly_slow_queries_report.call_local()

    content = (tmp_path / 'logs' / 'silk-reports' / 'silk-report-2025-06-09.log').read_text()
    assert 'No N+1 patterns detected this week' in content


@freeze_time('2025-06-09')
@override_settings(ENABLE_SILK=True, SLOW_QUERY_THRESHOLD_MS=500, N_PLUS_ONE_THRESHOLD=10)
def test_weekly_slow_queries_report_includes_slow_query_data(tmp_path, monkeypatch):
    """Report includes the endpoint path and duration of each detected slow query."""
    from django.conf import settings as django_settings
    monkeypatch.setattr(django_settings, 'BASE_DIR', tmp_path)

    slow_query = SimpleNamespace(
        time_taken=1200.0,
        request=SimpleNamespace(path='/api/products/'),
        query='SELECT * FROM product WHERE id = 1',
    )

    with (
        patch('silk.models.Request') as mock_request_cls,
        patch('silk.models.SQLQuery') as mock_sql_query_cls,
    ):
        _setup_silk_mocks(
            mock_request_cls,
            mock_sql_query_cls,
            slow_queries=[slow_query],
            n_plus_one=[],
        )
        from base_feature_project.tasks import weekly_slow_queries_report
        weekly_slow_queries_report.call_local()

    content = (tmp_path / 'logs' / 'silk-reports' / 'silk-report-2025-06-09.log').read_text()
    assert '/api/products/' in content
    assert '1200ms' in content


@freeze_time('2025-06-09')
@override_settings(ENABLE_SILK=True, SLOW_QUERY_THRESHOLD_MS=500, N_PLUS_ONE_THRESHOLD=10)
def test_weekly_slow_queries_report_includes_n_plus_one_suspects(tmp_path, monkeypatch):
    """Report includes the endpoint path and query count of each detected N+1 suspect."""
    from django.conf import settings as django_settings
    monkeypatch.setattr(django_settings, 'BASE_DIR', tmp_path)

    suspect = SimpleNamespace(query_count=25, path='/api/sales/')

    with (
        patch('silk.models.Request') as mock_request_cls,
        patch('silk.models.SQLQuery') as mock_sql_query_cls,
    ):
        _setup_silk_mocks(
            mock_request_cls,
            mock_sql_query_cls,
            slow_queries=[],
            n_plus_one=[suspect],
        )
        from base_feature_project.tasks import weekly_slow_queries_report
        weekly_slow_queries_report.call_local()

    content = (tmp_path / 'logs' / 'silk-reports' / 'silk-report-2025-06-09.log').read_text()
    assert '/api/sales/' in content
    assert '25 queries' in content


@pytest.mark.django_db
@freeze_time('2026-10-02 12:00:00')
def test_cleanup_unused_media_keeps_failed_storage_record(caplog, monkeypatch):
    """Falla si una caída de storage borra la referencia que permite reintentar."""
    failed = PersonalizationMediaFactory(is_used=False)
    successful = PersonalizationMediaFactory(is_used=False)
    PersonalizationMedia.objects.filter(pk__in=[failed.pk, successful.pk]).update(
        created_at=timezone.now() - timedelta(hours=49),
    )
    original_delete = type(failed.file).delete

    def delete_with_one_failure(field_file, save=True):
        if field_file.name == failed.file.name:
            raise OSError('storage unavailable')
        return original_delete(field_file, save=save)

    monkeypatch.setattr(type(failed.file), 'delete', delete_with_one_failure)
    caplog.set_level(logging.WARNING, logger='base_feature_project.tasks')
    from base_feature_project.tasks import cleanup_unused_media_files

    cleanup_unused_media_files.call_local()

    log_text = '\n'.join(caplog.messages)
    assert PersonalizationMedia.objects.filter(pk=failed.pk).exists()
    assert not PersonalizationMedia.objects.filter(pk=successful.pk).exists()
    assert 'removed=1 failed=1' in log_text
    assert failed.file.name not in log_text
    assert 'storage unavailable' not in log_text


@pytest.mark.django_db
@freeze_time('2026-10-02 12:00:00')
def test_cleanup_unused_media_retries_after_storage_recovers(monkeypatch):
    """Falla si un medio retenido tras un error no se borra en el siguiente ciclo."""
    media = PersonalizationMediaFactory(is_used=False)
    PersonalizationMedia.objects.filter(pk=media.pk).update(
        created_at=timezone.now() - timedelta(hours=49),
    )
    original_delete = type(media.file).delete

    def fail_delete(_field_file, save=True):
        raise OSError('temporary storage outage')

    monkeypatch.setattr(type(media.file), 'delete', fail_delete)
    from base_feature_project.tasks import cleanup_unused_media_files

    cleanup_unused_media_files.call_local()
    assert PersonalizationMedia.objects.filter(pk=media.pk).exists()
    monkeypatch.setattr(type(media.file), 'delete', original_delete)
    cleanup_unused_media_files.call_local()

    assert PersonalizationMedia.objects.filter(pk=media.pk).count() == 0


@pytest.fixture
def pending_reconciliation_payment(db):
    """Create an aged pending payment for reconciliation tests."""
    tx = WompiTransactionFactory(wompi_id='current-id', status=WompiTransaction.Status.PENDING)
    Order.objects.filter(pk=tx.order_id).update(status=Order.Status.PENDING_PAYMENT)
    WompiTransaction.objects.filter(pk=tx.pk).update(created_at=timezone.now() - timedelta(hours=25))
    tx.refresh_from_db()
    return tx


@pytest.mark.django_db
def test_reconciliation_preserves_a_concurrent_approval(pending_reconciliation_payment):
    """Keep an approval received while reconciliation awaits the provider."""
    from base_feature_project.tasks import reconcile_pending_payments

    from base_feature_app.services.wompi_service import WompiService
    tx = pending_reconciliation_payment
    approved = {'id': tx.wompi_id, 'reference': tx.reference, 'status': 'APPROVED'}

    def provider_reply(*args, **kwargs):
        WompiService.process_event({'event': 'transaction.updated', 'data': {'transaction': approved}})
        response = MagicMock()
        response.json.return_value = {'data': {'id': tx.wompi_id, 'status': 'PENDING'}}
        return response

    with patch('base_feature_app.services.wompi_service.requests.get', side_effect=provider_reply):
        reconcile_pending_payments.call_local()

    tx.refresh_from_db()
    assert tx.status == WompiTransaction.Status.APPROVED
    assert tx.order.status == Order.Status.PAYMENT_CONFIRMED
    assert tx.order.status_history.count() == 1


@pytest.mark.django_db
def test_reconciliation_preserves_administrative_progress(pending_reconciliation_payment):
    """Preserve administrative progress during a delayed provider response."""
    from base_feature_project.tasks import reconcile_pending_payments

    from base_feature_app.services.order_service import OrderService
    tx = pending_reconciliation_payment

    def provider_reply(*args, **kwargs):
        OrderService.update_status(tx.order, Order.Status.IN_PRODUCTION)
        response = MagicMock()
        response.json.return_value = {'data': {'id': tx.wompi_id, 'status': 'DECLINED'}}
        return response

    with patch('base_feature_app.services.wompi_service.requests.get', side_effect=provider_reply):
        reconcile_pending_payments.call_local()

    tx.order.refresh_from_db()
    assert tx.order.status == Order.Status.IN_PRODUCTION
    assert not tx.order.status_history.filter(new_status=Order.Status.CANCELLED).exists()


@pytest.mark.django_db
def test_reconciliation_cancels_abandoned_errors_without_a_provider_id(pending_reconciliation_payment):
    """Cancel an abandoned error that never obtained a provider identifier."""
    from base_feature_project.tasks import reconcile_pending_payments
    tx = pending_reconciliation_payment
    WompiTransaction.objects.filter(pk=tx.pk).update(wompi_id='', status=WompiTransaction.Status.ERROR)

    reconcile_pending_payments.call_local()

    tx.order.refresh_from_db()
    assert tx.order.status == Order.Status.CANCELLED
    assert tx.order.status_history.get().new_status == Order.Status.CANCELLED


@pytest.fixture
def expired_checkout_media(db, tmp_path):
    """Provide expired personalization in isolated temporary storage."""
    with override_settings(MEDIA_ROOT=tmp_path):
        media = PersonalizationMediaFactory()
        PersonalizationMedia.objects.filter(pk=media.pk).update(created_at=timezone.now() - timedelta(hours=49))
        price = PeluchSizePriceFactory()
        price.peluch.has_huella = True
        price.peluch.save(update_fields=['has_huella'])
        color = GlobalColorFactory()
        price.peluch.available_colors.add(color)
        data = {
            'customer_name': 'Checkout Customer', 'customer_email': 'checkout@example.invalid',
            'customer_phone': '3001234567', 'address': 'Calle 1', 'city': 'Bogotá', 'department': 'Cundinamarca',
            'items': [{
                'peluch': price.peluch, 'size': price.size, 'color': color, 'quantity': 1,
                'has_huella': True, 'huella_type': OrderItem.HuellaType.IMAGE, 'huella_media': media,
                'has_corazon': False, 'has_audio': False,
            }],
        }
        yield media, data


@pytest.mark.django_db
@pytest.mark.parametrize('media_field', ['huella_media', 'audio_media'])
def test_cleanup_retains_a_referenced_media_with_an_unset_flag(expired_checkout_media, media_field):
    """Retain a referenced file whose usage flag is unset."""
    from base_feature_project.tasks import cleanup_unused_media_files
    media, _ = expired_checkout_media
    item = OrderItemFactory(**{media_field: media})
    path = Path(media.file.path)

    cleanup_unused_media_files.call_local()

    assert path.exists()
    assert PersonalizationMedia.objects.filter(pk=media.pk).exists()
    item.refresh_from_db()
    assert getattr(item, f'{media_field}_id') == media.pk


@pytest.mark.django_db
def test_cleanup_removes_an_expired_unreferenced_file(expired_checkout_media):
    """Remove an expired file that has no order references."""
    from base_feature_project.tasks import cleanup_unused_media_files
    media, _ = expired_checkout_media
    media_id, path = media.pk, Path(media.file.path)

    cleanup_unused_media_files.call_local()

    assert not path.exists()
    assert not PersonalizationMedia.objects.filter(pk=media_id).exists()


@pytest.mark.django_db
def test_cleanup_retains_a_used_expired_file(expired_checkout_media):
    """Retain an expired file already marked as used."""
    from base_feature_project.tasks import cleanup_unused_media_files
    media, _ = expired_checkout_media
    PersonalizationMedia.objects.filter(pk=media.pk).update(is_used=True)
    path = Path(media.file.path)

    cleanup_unused_media_files.call_local()

    assert path.exists()
    assert PersonalizationMedia.objects.filter(pk=media.pk).exists()


def _run_media_race(data, *, checkout_first):
    """Observe real row-lock contention, without replacing queryset behavior."""
    from base_feature_project.tasks import cleanup_unused_media_files

    from base_feature_app.services.order_service import OrderService
    first_locked, second_waiting, release_first = Event(), Event(), Event()
    failures, connection_ids = [], []
    table = connection.ops.quote_name(PersonalizationMedia._meta.db_table)

    def worker(first):
        close_old_connections()

        def observe_lock(execute, sql, params, many, context):
            if 'FOR UPDATE' in sql and table in sql:
                if not first:
                    second_waiting.set()
                result = execute(sql, params, many, context)
                with context['connection'].cursor() as cursor:
                    cursor.execute('SELECT CONNECTION_ID()')
                    connection_ids.append(cursor.fetchone()[0])
                if first:
                    first_locked.set()
                    if not release_first.wait(10):
                        raise RuntimeError('First media operation was not released.')
                return result
            return execute(sql, params, many, context)

        try:
            with connection.execute_wrapper(observe_lock):
                if first == checkout_first:
                    OrderService.create_order(data)
                else:
                    cleanup_unused_media_files.call_local()
        except Exception as exc:
            failures.append(exc)
        finally:
            connections.close_all()

    first, second = Thread(target=worker, args=(True,)), Thread(target=worker, args=(False,))
    first.start()
    try:
        assert first_locked.wait(10), 'First operation did not acquire the media row.'
        second.start()
        assert second_waiting.wait(10), 'Second operation did not contend for the media row.'
    finally:
        release_first.set()
        first.join(15)
        if second.ident is not None:
            second.join(15)
    assert not first.is_alive()
    assert not second.is_alive()
    return failures, connection_ids


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'mysql', reason='Media row-lock contention requires independent MySQL connections.')
def test_checkout_winning_cleanup_retains_the_personalization(expired_checkout_media):
    """Retain personalization when checkout acquires its lock first."""
    media, data = expired_checkout_media
    media_id, path = media.pk, Path(media.file.path)

    failures, connection_ids = _run_media_race(data, checkout_first=True)

    assert failures == []
    assert len(set(connection_ids)) == 2
    assert path.exists()
    assert PersonalizationMedia.objects.get(pk=media_id).is_used is True
    assert OrderItem.objects.get().huella_media_id == media_id
    assert Order.objects.count() == 1


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'mysql', reason='Media row-lock contention requires independent MySQL connections.')
def test_cleanup_winning_checkout_leaves_no_partial_order(expired_checkout_media):
    """Reject checkout without partial rows when cleanup wins the lock."""
    media, data = expired_checkout_media
    media_id, path = media.pk, Path(media.file.path)

    failures, connection_ids = _run_media_race(data, checkout_first=False)

    assert len(failures) == 1
    assert isinstance(failures[0], ValueError)
    assert 'Vuelve a subirlo' in str(failures[0])
    assert len(set(connection_ids)) == 2
    assert not path.exists()
    assert not PersonalizationMedia.objects.filter(pk=media_id).exists()
    assert Order.objects.count() == 0
    assert OrderItem.objects.count() == 0
    assert WompiTransaction.objects.count() == 0

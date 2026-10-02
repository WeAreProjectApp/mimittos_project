"""Tests for Silk-related Huey tasks: silk_garbage_collection, weekly_slow_queries_report."""

import logging
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.test import override_settings
from django.utils import timezone
from freezegun import freeze_time

from base_feature_app.models import PersonalizationMedia
from base_feature_app.tests.factories import PersonalizationMediaFactory


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

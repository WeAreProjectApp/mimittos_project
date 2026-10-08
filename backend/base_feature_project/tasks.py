"""
Scheduled operational tasks with Huey.

Tasks:
- scheduled_backup: DB + media backup weekly (Sunday at 3:00 AM UTC)
- silk_garbage_collection: Daily cleanup of Silk profiling data (4:00 AM)
- weekly_slow_queries_report: Weekly performance report (Mondays 8:00 AM)
- silk_reports_cleanup: Monthly cleanup of Silk report files older than 6 months
- send_order_confirmation_email: Email al cliente al confirmar pago
- send_production_started_email: Email al cliente al iniciar producción
- send_order_shipped_email: Email al cliente al despachar
- send_new_order_admin_alert: Email a Jimmy con nuevo pedido
- check_unattended_orders: Alerta pedidos sin atender >24h
- cleanup_unused_media_files: Limpia archivos de personalización sin usar >48h
"""

import logging
from datetime import timedelta
from io import StringIO
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from huey import crontab
from huey.contrib.djhuey import db_periodic_task, db_task

logger = logging.getLogger('backups')
order_logger = logging.getLogger(__name__)


@db_periodic_task(crontab(day_of_week='0', hour='3', minute='45'))
def scheduled_backup():
    """
    Automated weekly backup of database and media files (Sunday 03:45 UTC).
    Storage: configured via BACKUP_STORAGE_PATH env var.
    Retention: 4 weeks (~1 month).
    """
    if not getattr(settings, 'BACKUPS_ENABLED', True):
        logger.info("scheduled_backup skipped: BACKUPS_ENABLED=False")
        return

    from django.core.management import call_command

    timestamp = timezone.now().strftime('%Y-%m-%d_%H%M%S')

    logger.info('=== Starting scheduled backup %s ===', timestamp)

    try:
        logger.info('Running database backup...')
        output = StringIO()
        call_command('dbbackup', '--compress', '--clean', stdout=output)
        logger.info(output.getvalue())

        logger.info('Running media backup...')
        output = StringIO()
        call_command('mediabackup', '--compress', '--clean', stdout=output)
        logger.info(output.getvalue())

        logger.info('=== Backup completed successfully ===')
        return True

    except Exception:
        logger.exception('Backup failed')
        raise


@db_periodic_task(crontab(hour='4', minute='20'))
def silk_garbage_collection():
    """
    Daily cleanup of Silk profiling data older than 7 days.
    Only runs if Silk is enabled.
    """
    if not getattr(settings, 'ENABLE_SILK', False):
        return

    from django.core.management import call_command

    logger.info('Running Silk garbage collection...')
    output = StringIO()
    call_command('silk_garbage_collect', '--days=7', stdout=output)
    logger.info(output.getvalue())


@db_periodic_task(crontab(day_of_week='1', hour='8', minute='0'))
def weekly_slow_queries_report():
    """
    Weekly report of slow queries and potential N+1 patterns.
    Output: backend/logs/silk-reports/silk-report-YYYY-MM-DD.log
    Only runs if Silk is enabled.
    """
    if not getattr(settings, 'ENABLE_SILK', False):
        return
    if not getattr(settings, 'ENABLE_SLOW_QUERIES_REPORT', True):
        logger.info("weekly_slow_queries_report skipped: ENABLE_SLOW_QUERIES_REPORT=False")
        return

    from django.db.models import Count

    try:
        from silk.models import Request, SQLQuery
    except (ImportError, RuntimeError):
        logger.warning('django-silk is not installed or not enabled; skipping report.')
        return

    week_ago = timezone.now() - timedelta(days=7)
    threshold_ms = getattr(settings, 'SLOW_QUERY_THRESHOLD_MS', 500)
    n_plus_one_threshold = getattr(settings, 'N_PLUS_ONE_THRESHOLD', 10)

    slow_queries = SQLQuery.objects.filter(
        request__start_time__gte=week_ago,
        time_taken__gte=threshold_ms,
    ).select_related('request').order_by('-time_taken')[:50]

    n_plus_one_suspects = Request.objects.filter(
        start_time__gte=week_ago,
    ).annotate(
        query_count=Count('queries'),
    ).filter(
        query_count__gte=n_plus_one_threshold,
    ).order_by('-query_count')[:20]

    from .monitoring_export import export_report_safely
    export_report_safely(slow_queries, n_plus_one_suspects)

    report_lines = [
        '=' * 60,
        f'WEEKLY QUERY REPORT - {timezone.now().strftime("%Y-%m-%d")}',
        '=' * 60,
        '',
        f'## SLOW QUERIES (>{threshold_ms}ms)',
        '-' * 40,
    ]

    if slow_queries:
        for sq in slow_queries:
            report_lines.append(
                f'[{sq.time_taken:.0f}ms] {sq.request.path} - {sq.query[:100]}...'
            )
    else:
        report_lines.append('No slow queries found this week')

    report_lines.extend([
        '',
        f'## POTENTIAL N+1 (>{n_plus_one_threshold} queries/request)',
        '-' * 40,
    ])

    if n_plus_one_suspects:
        for req in n_plus_one_suspects:
            report_lines.append(
                f'[{req.query_count} queries] {req.path}'
            )
    else:
        report_lines.append('No N+1 patterns detected this week')

    report_lines.extend(['', '=' * 60])
    report = '\n'.join(report_lines)

    reports_dir = Path(settings.BASE_DIR) / 'logs' / 'silk-reports'
    reports_dir.mkdir(parents=True, exist_ok=True)
    report_date = timezone.now().strftime('%Y-%m-%d')
    log_path = reports_dir / f'silk-report-{report_date}.log'

    with open(log_path, 'w') as f:
        f.write(report + '\n')

    logger.info(
        'Weekly report generated. Slow queries: %d, N+1 suspects: %d',
        slow_queries.count(),
        n_plus_one_suspects.count(),
    )

    return report


@db_periodic_task(crontab(day='1', hour='5', minute='20'))
def silk_reports_cleanup():
    """
    Monthly cleanup of Silk report files older than 6 months.
    Runs on the 1st of each month at 5:00 AM.
    Only runs when Silk is enabled.
    """
    if not getattr(settings, 'ENABLE_SILK', False):
        return

    from datetime import datetime

    reports_dir = Path(settings.BASE_DIR) / 'logs' / 'silk-reports'
    if not reports_dir.exists():
        return

    cutoff = timezone.now().date() - timedelta(days=180)
    deleted = 0

    for report_file in reports_dir.glob('silk-report-*.log'):
        try:
            date_str = report_file.stem.replace('silk-report-', '')
            file_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            continue

        if file_date < cutoff:
            report_file.unlink()
            deleted += 1

    if deleted:
        logger.info('Silk reports cleanup: deleted %d file(s) older than %s.', deleted, cutoff)


# ============================================================================
# PELUCHELANDIA — EMAIL NOTIFICATION TASKS
# ============================================================================

@db_task()
def send_order_confirmation_email(order_id: int):
    from base_feature_app.models import Order
    from base_feature_app.services.notification_service import NotificationService
    try:
        order = Order.objects.get(id=order_id)
        NotificationService.notify_order_confirmation(order)
    except Order.DoesNotExist:
        order_logger.warning('Order %s not found for confirmation email.', order_id)


@db_task()
def send_production_started_email(order_id: int):
    from base_feature_app.models import Order
    from base_feature_app.services.notification_service import NotificationService
    try:
        order = Order.objects.get(id=order_id)
        NotificationService.notify_production_started(order)
    except Order.DoesNotExist:
        order_logger.warning('Order %s not found for production email.', order_id)


@db_task()
def send_order_shipped_email(order_id: int):
    from base_feature_app.models import Order
    from base_feature_app.services.notification_service import NotificationService
    try:
        order = Order.objects.get(id=order_id)
        NotificationService.notify_order_shipped(order)
    except Order.DoesNotExist:
        order_logger.warning('Order %s not found for shipped email.', order_id)


@db_task()
def send_new_order_admin_alert(order_id: int):
    from base_feature_app.models import Order
    from base_feature_app.services.notification_service import NotificationService
    try:
        order = Order.objects.get(id=order_id)
        NotificationService.notify_new_order_admin(order)
    except Order.DoesNotExist:
        order_logger.warning('Order %s not found for admin alert.', order_id)


@db_periodic_task(crontab(hour='*', minute='0'))
def check_unattended_orders():
    """
    Hourly check: log warning for orders pending >24h without status change.
    """
    from base_feature_app.models import Order
    cutoff = timezone.now() - timedelta(hours=24)
    unattended = Order.objects.filter(
        status__in=[Order.Status.PENDING_PAYMENT, Order.Status.PAYMENT_CONFIRMED],
        updated_at__lt=cutoff,
    )
    count = unattended.count()
    if count:
        order_logger.warning(
            'ALERT: %d order(s) have been unattended for >24h. '
            'Order numbers: %s',
            count,
            list(unattended.values_list('order_number', flat=True)[:10]),
        )


@db_periodic_task(crontab(hour='8', minute='45'))
def cleanup_unused_media_files():
    """
    Daily cleanup of PersonalizationMedia files not linked to any order (>48h old).
    """
    from base_feature_app.models import PersonalizationMedia
    cutoff = timezone.now() - timedelta(hours=48)
    old_unused = PersonalizationMedia.objects.filter(
        is_used=False, created_at__lt=cutoff,
    ).order_by('pk').values_list('pk', flat=True)
    deleted = 0
    failed = 0
    for media_id in old_unused:
        with transaction.atomic():
            media = PersonalizationMedia.objects.select_for_update().filter(pk=media_id).first()
            if media is None or media.is_used or media.created_at >= cutoff:
                continue
            if media.huella_items.exists() or media.audio_items.exists():
                continue
            try:
                media.file.delete(save=False)
            except Exception:
                # Keep the durable reference so the next scheduled run can retry.
                failed += 1
                continue
            media.delete()
            deleted += 1
    if failed:
        order_logger.warning(
            'Unused personalization media cleanup incomplete: removed=%d failed=%d.',
            deleted, failed,
        )
    if deleted:
        order_logger.info('Cleaned up %d unused personalization media file(s).', deleted)


@db_periodic_task(crontab(hour='5', minute='0'))
def reconcile_pending_payments():
    """
    Daily at 05:00 UTC: reconcile orders stuck in PENDING_PAYMENT against Wompi.

    The /api/payment/check endpoint already syncs DECLINED/APPROVED in real
    time when the user lands on /order-confirmed. This task is a safety net
    for cases where the user never returned to the confirmation page.

    Rules:
    - Only evaluates transactions with created_at > 1h ago (no fresh ones).
    - If Wompi reports APPROVED → confirm payment.
    - If Wompi reports DECLINED/VOIDED/ERROR → cancel the order.
    - If order has been PENDING_PAYMENT for >24h with no terminal Wompi
      status → cancel as ABANDONED.
    """
    from base_feature_app.models import Order, WompiTransaction
    from base_feature_app.services.wompi_service import WompiService

    cutoff_recent = timezone.now() - timedelta(hours=1)
    cutoff_stale = timezone.now() - timedelta(hours=24)

    txs = WompiTransaction.objects.select_related('order').filter(
        order__status=Order.Status.PENDING_PAYMENT,
        created_at__lt=cutoff_recent,
    )

    cancelled_decline = 0
    confirmed = 0
    cancelled_stale = 0

    for tx in txs:
        order = tx.order

        if not tx.wompi_id:
            if tx.created_at < cutoff_stale:
                cancelled = WompiService.cancel_abandoned_order(
                    tx.reference, without_provider_id=True,
                    notes='Pago abandonado: sin transacción Wompi tras 24h.',
                )
                cancelled_stale += int(cancelled)
            continue

        wompi_data = WompiService.fetch_transaction(tx.wompi_id)
        if not wompi_data:
            continue

        wompi_status_raw = (wompi_data.get('status') or '').upper()
        status_map = {
            'APPROVED': WompiTransaction.Status.APPROVED,
            'DECLINED': WompiTransaction.Status.DECLINED,
            'VOIDED': WompiTransaction.Status.VOIDED,
            'ERROR': WompiTransaction.Status.ERROR,
        }
        new_status = status_map.get(wompi_status_raw)

        if new_status:
            tx = WompiService.apply_transaction_data(
                tx.reference, wompi_data, cancel_failed=True,
                notes=f'Pago Wompi {wompi_status_raw}: {wompi_data.get("status_message") or "sin detalle"}',
            )
            if tx.order.status == Order.Status.PAYMENT_CONFIRMED:
                confirmed += 1
            elif tx.order.status == Order.Status.CANCELLED:
                cancelled_decline += 1
        elif tx.created_at < cutoff_stale and wompi_status_raw == 'PENDING':
            cancelled = WompiService.cancel_abandoned_order(
                tx.reference, expected_provider_id=tx.wompi_id,
                notes='Pago abandonado: PENDING en Wompi tras 24h.',
            )
            cancelled_stale += int(cancelled)

    if confirmed or cancelled_decline or cancelled_stale:
        order_logger.info(
            'reconcile_pending_payments: confirmed=%s cancelled_decline=%s cancelled_stale=%s',
            confirmed, cancelled_decline, cancelled_stale,
        )

"""Verify account safety across the email verification schema transition."""

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

OLD_STATE = ('base_feature_app', '0013_cascade_color_size_deletion')
NEW_STATE = ('base_feature_app', '0014_email_verification_code_purpose')


@pytest.fixture
def migration_executor():
    """Restore the test database to its leaf migrations after this schema test."""
    def migrate_to(target):
        executor = MigrationExecutor(connection)
        executor.migrate([target])
        return executor.loader.project_state([target]).apps

    migrate_to(OLD_STATE)
    yield migrate_to
    executor = MigrationExecutor(connection)
    executor.migrate(executor.loader.graph.leaf_nodes())


@pytest.mark.django_db(transaction=True)
def test_email_verification_migration_preserves_account_blocks(migration_executor):
    """Falla si 0014 desbloquea cuentas o deja códigos heredados utilizables."""
    old_apps = migration_executor(OLD_STATE)
    old_user = old_apps.get_model('base_feature_app', 'User')
    old_code = old_apps.get_model('base_feature_app', 'PasswordCode')
    active = old_user.objects.create(email='legacy-active@example.com', password='hash', is_active=True)
    inactive = old_user.objects.create(email='legacy-inactive@example.com', password='hash', is_active=False)
    old_code.objects.create(user=active, code='101010', used=False)
    old_code.objects.create(user=inactive, code='202020', used=False)

    new_apps = migration_executor(NEW_STATE)
    new_user = new_apps.get_model('base_feature_app', 'User')
    new_code = new_apps.get_model('base_feature_app', 'PasswordCode')

    assert list(new_user.objects.order_by('email').values_list('is_active', 'email_verified')) == [(True, True), (False, True)]
    assert list(new_code.objects.order_by('code').values_list('used', flat=True)) == [True, True]

    migration_executor(OLD_STATE)
    reapplied_apps = migration_executor(NEW_STATE)
    reapplied_user = reapplied_apps.get_model('base_feature_app', 'User')
    reapplied_code = reapplied_apps.get_model('base_feature_app', 'PasswordCode')

    assert list(reapplied_user.objects.order_by('email').values_list('is_active', 'email_verified')) == [(True, True), (False, True)]
    assert list(reapplied_code.objects.order_by('code').values_list('used', flat=True)) == [True, True]


@pytest.mark.django_db(transaction=True)
def test_email_verification_migration_rolls_back_pending_account_safely(migration_executor):
    """Falla si retirar y reaplicar 0014 desbloquea una cuenta pendiente."""
    new_apps = migration_executor(NEW_STATE)
    new_user = new_apps.get_model('base_feature_app', 'User')
    new_code = new_apps.get_model('base_feature_app', 'PasswordCode')
    pending = new_user.objects.create(
        email='rollback-pending@example.com', password='hash', is_active=True, email_verified=False,
    )
    new_code.objects.create(user=pending, code='303030', used=True, purpose='registration')

    old_apps = migration_executor(OLD_STATE)
    old_user = old_apps.get_model('base_feature_app', 'User')

    assert old_user.objects.get(email='rollback-pending@example.com').is_active is False

    reapplied_apps = migration_executor(NEW_STATE)
    reapplied_user = reapplied_apps.get_model('base_feature_app', 'User')
    reapplied_code = reapplied_apps.get_model('base_feature_app', 'PasswordCode')

    assert reapplied_user.objects.get(email='rollback-pending@example.com').is_active is False
    assert reapplied_code.objects.get(code='303030').used is True

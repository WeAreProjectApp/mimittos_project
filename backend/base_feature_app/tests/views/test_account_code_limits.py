"""I-S-d69e950b3187: persistent account-code limits at the HTTP boundary."""

import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from time import monotonic
from unittest.mock import Mock

import pytest
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connection, connections
from django.urls import reverse
from freezegun import freeze_time
from rest_framework.test import APIClient

from base_feature_app.models import PasswordCode
from base_feature_app.models.password_code import PasswordCodeAttemptBudget

SEND_CASES = [
    pytest.param('send_passcode', PasswordCode.Purpose.PASSWORD_RESET, id='password-reset'),
    pytest.param('resend_verification', PasswordCode.Purpose.REGISTRATION, id='registration-resend'),
    pytest.param('sign_up', PasswordCode.Purpose.REGISTRATION, id='registration-signup-alias'),
]
VERIFY_CASES = [
    pytest.param('verify_passcode_reset', 'send_passcode', PasswordCode.Purpose.PASSWORD_RESET,
                 id='password-reset'),
    pytest.param('verify_registration', 'resend_verification', PasswordCode.Purpose.REGISTRATION,
                 id='registration'),
]


@pytest.fixture
def pending_account():
    """Create an active account whose email still needs verification."""
    return get_user_model().objects.create_user(
        email='limits@example.com', password='Initial123!', email_verified=False,
    )


@pytest.fixture
def captcha_provider(monkeypatch, settings):
    """Keep the real captcha verifier while replacing Google's HTTP response."""
    settings.RECAPTCHA_SECRET_KEY = 'synthetic-account-code-tests'
    response = Mock()
    response.json.return_value = {'success': True}
    monkeypatch.setattr('base_feature_app.views.captcha_views.requests.post', Mock(return_value=response))


def _request_code(client, account, route):
    return client.post(reverse(route), {
        'email': account.email,
        'password': 'Initial123!',
        'captcha_token': 'synthetic-captcha-token',
    }, format='json')


def _verify_code(client, account, route, code):
    return client.post(reverse(route), {
        'email': account.email,
        'code': code,
        'new_password': 'Replacement123!',
    }, format='json')


def _observe_lock_wait(waiter_id, blocker_id):
    """Observe the real InnoDB wait between these two scratch connections."""
    deadline = monotonic() + 10
    with connection.cursor() as cursor:
        while monotonic() < deadline:
            cursor.execute(
                'SELECT waiter.PROCESSLIST_ID, blocker.PROCESSLIST_ID '
                'FROM performance_schema.data_lock_waits AS waits '
                'JOIN performance_schema.threads AS waiter '
                'ON waiter.THREAD_ID = waits.REQUESTING_THREAD_ID '
                'JOIN performance_schema.threads AS blocker '
                'ON blocker.THREAD_ID = waits.BLOCKING_THREAD_ID '
                'WHERE waiter.PROCESSLIST_ID = %s AND blocker.PROCESSLIST_ID = %s',
                [waiter_id, blocker_id],
            )
            observed = cursor.fetchone()
            if observed is not None:
                return observed
    raise AssertionError('The second scratch connection never waited for the first row lock.')


def _parallel_posts(route, payload):
    """Hold the first real row lock until MySQL observes the second request waiting."""
    first_locked = threading.Event()
    second_at_lock = threading.Event()
    release_first = threading.Event()
    connection_ids = {}
    user_table = get_user_model()._meta.db_table

    def post(role):
        close_old_connections()
        try:
            def checkpoint(execute, sql, params, many, context):
                is_account_lock = f'FROM `{user_table}`' in sql and 'FOR UPDATE' in sql.upper()
                if not is_account_lock:
                    return execute(sql, params, many, context)
                with connection.cursor() as cursor:
                    cursor.execute('SELECT CONNECTION_ID()')
                    connection_ids[role] = cursor.fetchone()[0]
                if role == 'second':
                    second_at_lock.set()
                    return execute(sql, params, many, context)
                result = execute(sql, params, many, context)
                first_locked.set()
                assert release_first.wait(timeout=30), 'The controller did not release the first SQL lock.'
                return result

            with connection.execute_wrapper(checkpoint):
                response = APIClient().post(reverse(route), payload, format='json')
            return connection_ids[role], response.status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as workers:
        first = workers.submit(post, 'first')
        try:
            assert first_locked.wait(timeout=10), 'The first request did not acquire its account row lock.'
            second = workers.submit(post, 'second')
            assert second_at_lock.wait(timeout=10), 'The second request did not reach the contended SQL.'
            lock_wait = _observe_lock_wait(connection_ids['second'], connection_ids['first'])
        finally:
            release_first.set()
    return [first.result(timeout=15), second.result(timeout=15)], lock_wait


@pytest.mark.django_db
@pytest.mark.parametrize(('route', 'purpose'), SEND_CASES)
def test_code_request_enforces_send_cooldown(api_client, pending_account, mailoutbox, captcha_provider,
                                           route, purpose):
    """Repeated requests must not create another usable code or email."""
    first = _request_code(api_client, pending_account, route)
    current = PasswordCode.objects.get(user=pending_account, purpose=purpose)

    response = _request_code(api_client, pending_account, route)

    current.refresh_from_db()
    budget = PasswordCodeAttemptBudget.objects.get(user=pending_account, purpose=purpose)
    assert first.status_code == 200
    assert response.status_code == 429
    assert response.json()['error']
    assert PasswordCode.objects.filter(user=pending_account, purpose=purpose).count() == 1
    assert current.used is False
    assert budget.send_count == 1
    assert len(mailoutbox) == 1


@pytest.mark.django_db
@pytest.mark.parametrize(('route', 'purpose'), SEND_CASES)
def test_code_request_enforces_hourly_send_budget(api_client, pending_account, mailoutbox,
                                                captcha_provider, route, purpose):
    """A minute between sends must not bypass the hourly account limit."""
    with freeze_time('2026-01-15 10:00:00') as clock:
        allowed_statuses = []
        for _ in range(5):
            allowed_statuses.append(_request_code(api_client, pending_account, route).status_code)
            clock.tick(delta=timedelta(seconds=60))
        current = PasswordCode.objects.filter(user=pending_account, purpose=purpose, used=False).get()

        response = _request_code(api_client, pending_account, route)

        current.refresh_from_db()
        budget = PasswordCodeAttemptBudget.objects.get(user=pending_account, purpose=purpose)
        assert allowed_statuses == [200] * 5
        assert response.status_code == 429
        assert current.is_valid() is True
        assert budget.send_count == 5
        assert PasswordCode.objects.filter(user=pending_account, purpose=purpose).count() == 5
        assert len(mailoutbox) == 5


@pytest.mark.django_db
@pytest.mark.parametrize(('route', 'send_route', 'purpose'), VERIFY_CASES)
def test_code_verification_enforces_failure_budget(api_client, pending_account, route, send_route,
                                                 purpose):
    """Exhausted guesses must reject even the correct code without changing the account."""
    code = PasswordCode.objects.create(user=pending_account, purpose=purpose, code='654321')
    original_password = pending_account.password
    attempts = [_verify_code(api_client, pending_account, route, '000000').status_code for _ in range(5)]

    response = _verify_code(api_client, pending_account, route, code.code)

    pending_account.refresh_from_db()
    code.refresh_from_db()
    budget = PasswordCodeAttemptBudget.objects.get(user=pending_account, purpose=purpose)
    assert attempts == [400] * 5
    assert response.status_code == 429
    assert pending_account.password == original_password
    assert pending_account.email_verified is False
    assert code.used is False
    assert budget.failed_attempts == 5


@pytest.mark.django_db
@pytest.mark.parametrize(('route', 'send_route', 'purpose'), VERIFY_CASES)
def test_code_verification_accepts_last_permitted_attempt(api_client, pending_account, route,
                                                        send_route, purpose):
    """The fifth attempt must still consume a valid code after four failures."""
    code = PasswordCode.objects.create(user=pending_account, purpose=purpose, code='654321')
    attempts = [_verify_code(api_client, pending_account, route, '000000').status_code for _ in range(4)]

    response = _verify_code(api_client, pending_account, route, code.code)

    pending_account.refresh_from_db()
    code.refresh_from_db()
    budget = PasswordCodeAttemptBudget.objects.get(user=pending_account, purpose=purpose)
    assert attempts == [400] * 4
    assert response.status_code == 200
    assert code.used is True
    assert pending_account.check_password('Replacement123!') is True
    assert budget.failed_attempts == 4


@pytest.mark.django_db
@pytest.mark.parametrize(('route', 'send_route', 'purpose'), VERIFY_CASES)
def test_resend_preserves_failure_budget(api_client, pending_account, mailoutbox, route, send_route,
                                       purpose):
    """Resending must not give an account a fresh set of guesses."""
    PasswordCode.objects.create(user=pending_account, purpose=purpose, code='654321')
    attempts = [_verify_code(api_client, pending_account, route, '000000').status_code for _ in range(4)]
    before = PasswordCodeAttemptBudget.objects.get(user=pending_account, purpose=purpose)
    sent = _request_code(api_client, pending_account, send_route)
    current = PasswordCode.objects.get(user=pending_account, purpose=purpose, used=False)
    wrong_code = f'{(int(current.code) + 1) % 1_000_000:06d}'
    failed = _verify_code(api_client, pending_account, route, wrong_code)

    response = _verify_code(api_client, pending_account, route, current.code)

    current.refresh_from_db()
    after = PasswordCodeAttemptBudget.objects.get(user=pending_account, purpose=purpose)
    assert attempts == [400] * 4
    assert sent.status_code == 200
    assert failed.status_code == 400
    assert response.status_code == 429
    assert current.used is False
    assert after.failed_attempts == 5
    assert after.attempt_window_started_at == before.attempt_window_started_at
    assert len(mailoutbox) == 1


@pytest.mark.django_db
@pytest.mark.parametrize(('route', 'purpose'), SEND_CASES)
def test_exhausted_failure_budget_blocks_sending(api_client, pending_account, mailoutbox,
                                               captcha_provider, route, purpose):
    """Each sending alias must honor exhausted verification attempts."""
    current = PasswordCode.objects.create(user=pending_account, purpose=purpose, code='654321')
    PasswordCodeAttemptBudget.objects.create(user=pending_account, purpose=purpose, failed_attempts=5)

    response = _request_code(api_client, pending_account, route)

    current.refresh_from_db()
    assert response.status_code == 429
    assert current.is_valid() is True
    assert PasswordCode.objects.filter(user=pending_account, purpose=purpose).count() == 1
    assert len(mailoutbox) == 0


@pytest.mark.django_db
@pytest.mark.parametrize(('route', 'send_route', 'purpose'), VERIFY_CASES)
def test_expired_failure_window_allows_new_code(api_client, pending_account, mailoutbox, route,
                                              send_route, purpose):
    """An elapsed hour must restore account recovery without extending old codes."""
    with freeze_time('2026-01-15 10:00:00') as clock:
        old = PasswordCode.objects.create(user=pending_account, purpose=purpose, code='654321')
        attempts = [_verify_code(api_client, pending_account, route, '000000').status_code for _ in range(5)]
        clock.tick(delta=timedelta(hours=1))
        sent = _request_code(api_client, pending_account, send_route)
        current = PasswordCode.objects.get(user=pending_account, purpose=purpose, used=False)

        response = _verify_code(api_client, pending_account, route, current.code)

        old.refresh_from_db()
        current.refresh_from_db()
        budget = PasswordCodeAttemptBudget.objects.get(user=pending_account, purpose=purpose)
        assert attempts == [400] * 5
        assert sent.status_code == 200
        assert response.status_code == 200
        assert old.is_valid() is False
        assert current.used is True
        assert budget.failed_attempts == 0
        assert len(mailoutbox) == 1


@pytest.mark.django_db
@pytest.mark.parametrize(('route', 'purpose'), SEND_CASES)
def test_expired_send_window_allows_new_email(api_client, pending_account, mailoutbox,
                                            captcha_provider, route, purpose):
    """The send budget must recover at its hourly boundary."""
    with freeze_time('2026-01-15 10:00:00') as clock:
        allowed_statuses = []
        for _ in range(5):
            allowed_statuses.append(_request_code(api_client, pending_account, route).status_code)
            clock.tick(delta=timedelta(seconds=60))
        clock.move_to('2026-01-15 11:00:00')

        response = _request_code(api_client, pending_account, route)

        budget = PasswordCodeAttemptBudget.objects.get(user=pending_account, purpose=purpose)
        assert allowed_statuses == [200] * 5
        assert response.status_code == 200
        assert budget.send_count == 1
        assert PasswordCode.objects.filter(user=pending_account, purpose=purpose, used=False).count() == 1
        assert len(mailoutbox) == 6


@pytest.mark.django_db
def test_registration_exhaustion_preserves_reset_budget(api_client, pending_account, mailoutbox):
    """Registration failures must not exhaust the distinct password-reset budget."""
    registration = PasswordCode.objects.create(
        user=pending_account, purpose=PasswordCode.Purpose.REGISTRATION, code='654321',
    )
    failures = [
        _verify_code(api_client, pending_account, 'verify_registration', '000000').status_code
        for _ in range(5)
    ]
    sent = _request_code(api_client, pending_account, 'send_passcode')
    reset_code = PasswordCode.objects.get(user=pending_account, purpose=PasswordCode.Purpose.PASSWORD_RESET)

    response = _verify_code(api_client, pending_account, 'verify_passcode_reset', reset_code.code)

    pending_account.refresh_from_db()
    registration.refresh_from_db()
    registration_budget = PasswordCodeAttemptBudget.objects.get(
        user=pending_account, purpose=PasswordCode.Purpose.REGISTRATION,
    )
    reset_budget = PasswordCodeAttemptBudget.objects.get(
        user=pending_account, purpose=PasswordCode.Purpose.PASSWORD_RESET,
    )
    assert failures == [400] * 5
    assert sent.status_code == 200
    assert response.status_code == 200
    assert pending_account.check_password('Replacement123!') is True
    assert pending_account.email_verified is False
    assert registration.used is False
    assert registration_budget.failed_attempts == 5
    assert reset_budget.failed_attempts == 0
    assert len(mailoutbox) == 1


@pytest.mark.django_db
def test_failure_budget_preserves_other_account_access(api_client, pending_account):
    """An exhausted account must not consume another account's reset attempts."""
    PasswordCode.objects.create(user=pending_account, code='654321')
    failures = [
        _verify_code(api_client, pending_account, 'verify_passcode_reset', '000000').status_code
        for _ in range(5)
    ]
    other = get_user_model().objects.create_user(email='other@example.com', password='Initial123!')
    code = PasswordCode.objects.create(user=other, code='123456')

    response = _verify_code(api_client, other, 'verify_passcode_reset', code.code)

    other.refresh_from_db()
    exhausted = PasswordCodeAttemptBudget.objects.get(user=pending_account,
                                                    purpose=PasswordCode.Purpose.PASSWORD_RESET)
    assert failures == [400] * 5
    assert response.status_code == 200
    assert other.check_password('Replacement123!') is True
    assert exhausted.failed_attempts == 5


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'mysql', reason='Row-lock verification requires MySQL.')
@pytest.mark.parametrize(('route', 'send_route', 'purpose'), VERIFY_CASES[:1])
def test_concurrent_verification_consumes_one_code(pending_account, record_testsuite_property,
                                                 route, send_route, purpose):
    """Two independent connections must not consume the same code successfully."""
    code = PasswordCode.objects.create(user=pending_account, purpose=purpose, code='654321')
    payload = {'email': pending_account.email, 'code': code.code, 'new_password': 'Replacement123!'}

    results, lock_wait = _parallel_posts(route, payload)

    code.refresh_from_db()
    assert len({connection_id for connection_id, _ in results}) == 2
    assert lock_wait == (results[1][0], results[0][0])
    assert sorted(status for _, status in results) == [200, 400]
    assert code.used is True
    assert PasswordCodeAttemptBudget.objects.filter(user=pending_account, purpose=purpose).count() == 1
    record_testsuite_property(f'consumption-lock-wait-{purpose}', str(lock_wait))


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'mysql', reason='Row-lock verification requires MySQL.')
@pytest.mark.parametrize(('route', 'purpose'), SEND_CASES[:2])
def test_concurrent_requests_create_one_code(pending_account, mailoutbox, record_testsuite_property,
                                           route, purpose):
    """Simultaneous first requests must share one persistent sending budget."""
    results, lock_wait = _parallel_posts(route, {'email': pending_account.email})

    budget = PasswordCodeAttemptBudget.objects.get(user=pending_account, purpose=purpose)
    assert len({connection_id for connection_id, _ in results}) == 2
    assert lock_wait == (results[1][0], results[0][0])
    assert sorted(status for _, status in results) == [200, 429]
    assert budget.send_count == 1
    assert PasswordCode.objects.filter(user=pending_account, purpose=purpose).count() == 1
    assert len(mailoutbox) == 1
    record_testsuite_property(f'sending-lock-wait-{purpose}', str(lock_wait))


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'mysql', reason='Row-lock verification requires MySQL.')
@pytest.mark.parametrize(('route', 'send_route', 'purpose'), VERIFY_CASES)
def test_concurrent_failures_stop_at_budget(api_client, pending_account, record_testsuite_property,
                                          route, send_route, purpose):
    """Concurrent guesses must not overwrite or exceed the remaining attempt."""
    code = PasswordCode.objects.create(user=pending_account, purpose=purpose, code='654321')
    failures = [_verify_code(api_client, pending_account, route, '000000').status_code for _ in range(4)]
    payload = {'email': pending_account.email, 'code': '000000', 'new_password': 'Replacement123!'}

    results, lock_wait = _parallel_posts(route, payload)

    code.refresh_from_db()
    budget = PasswordCodeAttemptBudget.objects.get(user=pending_account, purpose=purpose)
    assert failures == [400] * 4
    assert len({connection_id for connection_id, _ in results}) == 2
    assert lock_wait == (results[1][0], results[0][0])
    assert sorted(status for _, status in results) == [400, 429]
    assert budget.failed_attempts == 5
    assert code.used is False
    record_testsuite_property(f'attempt-lock-wait-{purpose}', str(lock_wait))

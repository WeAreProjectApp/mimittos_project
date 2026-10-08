import random
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from freezegun import freeze_time

from base_feature_app.models import PasswordCode


@pytest.mark.django_db
def test_password_code_str_representation():
    User = get_user_model()
    user = User.objects.create_user(email='code@example.com', password='pass1234')
    password_code = PasswordCode.objects.create(user=user, code='123456')

    assert str(password_code) == 'Code for code@example.com - 123456'


@pytest.mark.django_db
def test_password_code_generate_code_creates_six_digits(monkeypatch):
    User = get_user_model()
    user = User.objects.create_user(email='generate@example.com', password='pass1234')

    monkeypatch.setattr(random, 'randint', lambda *_: 1)

    password_code = PasswordCode.generate_code(user)

    assert password_code.code == '111111'


@pytest.mark.django_db
def test_password_code_is_valid_false_when_used():
    User = get_user_model()
    user = User.objects.create_user(email='used@example.com', password='pass1234')
    password_code = PasswordCode.objects.create(user=user, code='654321', used=True)

    assert password_code.is_valid() is False


@pytest.mark.django_db
@freeze_time('2026-01-15 10:00:00')
def test_password_code_is_valid_false_when_expired():
    User = get_user_model()
    user = User.objects.create_user(email='expired@example.com', password='pass1234')
    password_code = PasswordCode.objects.create(user=user, code='654321')
    PasswordCode.objects.filter(id=password_code.id).update(
        created_at=timezone.now() - timedelta(minutes=16)
    )
    password_code.refresh_from_db()

    assert password_code.is_valid() is False


@pytest.mark.django_db
def test_password_code_is_valid_true_for_recent_code():
    User = get_user_model()
    user = User.objects.create_user(email='valid@example.com', password='pass1234')
    password_code = PasswordCode.objects.create(user=user, code='654321')

    assert password_code.is_valid() is True


@pytest.mark.django_db
@pytest.mark.parametrize('purpose', PasswordCode.Purpose.values)
def test_password_code_resend_invalidates_previous_code(monkeypatch, purpose):
    """A new code must retire the preceding code for the same purpose."""
    user = get_user_model().objects.create_user(email='resend@example.com', password='pass1234')
    with freeze_time('2026-01-15 10:00:00') as clock:
        monkeypatch.setattr(random, 'randint', lambda *_: 1)
        previous = PasswordCode.generate_code(user, purpose=purpose)
        clock.tick(delta=timedelta(seconds=60))
        monkeypatch.setattr(random, 'randint', lambda *_: 2)

        current = PasswordCode.generate_code(user, purpose=purpose)

        previous.refresh_from_db()
        assert previous.is_valid() is False
        assert current.is_valid() is True
        assert current.code == '222222'


@pytest.mark.django_db
@pytest.mark.parametrize('purpose,other_purpose', [
    (PasswordCode.Purpose.REGISTRATION, PasswordCode.Purpose.PASSWORD_RESET),
    (PasswordCode.Purpose.PASSWORD_RESET, PasswordCode.Purpose.REGISTRATION),
])
def test_password_code_generation_preserves_other_purpose(purpose, other_purpose):
    """Resending one purpose must leave the other purpose's code valid."""
    user = get_user_model().objects.create_user(email='separate@example.com', password='pass1234')
    other_code = PasswordCode.objects.create(user=user, code='654321', purpose=other_purpose)

    generated = PasswordCode.generate_code(user, purpose=purpose)

    other_code.refresh_from_db()
    assert other_code.is_valid() is True
    assert generated.is_valid() is True

from datetime import timedelta

from django.db import models, transaction
from django.utils import timezone

from base_feature_app.models import User


class PasswordCode(models.Model):
    """
    Registration verification and password reset code model.
    
    Stores purpose-bound, single-use 6-digit codes.
    """
    class Purpose(models.TextChoices):
        REGISTRATION = 'registration', 'Registration'
        PASSWORD_RESET = 'password_reset', 'Password reset'

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_codes')
    purpose = models.CharField(
        max_length=20, choices=Purpose.choices, default=Purpose.PASSWORD_RESET,
    )
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    used = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Code for {self.user.email} - {self.code}"
    
    @classmethod
    def generate_code(cls, user, purpose=Purpose.PASSWORD_RESET):
        """
        Generate a code within the account's persistent purpose-bound budget.

        Return None when sending is limited. Locking the user also serializes
        the first budget creation and invalidation of previous codes.
        """
        import random
        with transaction.atomic():
            User.objects.select_for_update().get(pk=user.pk)
            budget = PasswordCodeAttemptBudget.lock_for_user(user, purpose)
            now = timezone.now()
            if not budget.can_send(now):
                return None

            code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
            cls.objects.filter(user=user, purpose=purpose, used=False).update(used=True)
            password_code = cls.objects.create(user=user, code=code, purpose=purpose)
            budget.send_count += 1
            budget.last_sent_at = now
            budget.save(update_fields=['send_count', 'last_sent_at'])
            return password_code
    
    def is_valid(self):
        """
        Check if code is still valid (not used and less than 15 minutes old).
        """
        if self.used:
            return False
        
        age = timezone.now() - self.created_at
        return age < timedelta(minutes=15)


class PasswordCodeAttemptBudget(models.Model):
    """Keep send and failure limits independent from individual codes."""

    WINDOW = timedelta(hours=1)
    SEND_COOLDOWN = timedelta(seconds=60)
    MAX_FAILED_ATTEMPTS = 5
    MAX_SENDS = 5

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_code_budgets')
    purpose = models.CharField(max_length=20, choices=PasswordCode.Purpose.choices)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    attempt_window_started_at = models.DateTimeField(default=timezone.now)
    send_count = models.PositiveSmallIntegerField(default=0)
    send_window_started_at = models.DateTimeField(default=timezone.now)
    last_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = (
            models.UniqueConstraint(fields=['user', 'purpose'], name='unique_password_code_budget'),
        )

    @classmethod
    def lock_for_user(cls, user, purpose):
        """Call within an atomic block after locking the corresponding user."""
        budget, _ = cls.objects.select_for_update().get_or_create(user=user, purpose=purpose)
        now = timezone.now()
        changed_fields = []
        if now - budget.attempt_window_started_at >= cls.WINDOW:
            budget.failed_attempts = 0
            budget.attempt_window_started_at = now
            changed_fields.extend(['failed_attempts', 'attempt_window_started_at'])
        if now - budget.send_window_started_at >= cls.WINDOW:
            budget.send_count = 0
            budget.send_window_started_at = now
            changed_fields.extend(['send_count', 'send_window_started_at'])
        if changed_fields:
            budget.save(update_fields=changed_fields)
        return budget

    def can_verify(self):
        return self.failed_attempts < self.MAX_FAILED_ATTEMPTS

    def can_send(self, now):
        return (
            self.can_verify()
            and self.send_count < self.MAX_SENDS
            and (self.last_sent_at is None or now - self.last_sent_at >= self.SEND_COOLDOWN)
        )

    def record_failure(self):
        """Charge a failed validation while the account and budget are locked."""
        self.failed_attempts += 1
        self.save(update_fields=['failed_attempts'])

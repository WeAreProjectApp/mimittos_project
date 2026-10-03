from django.db import models
from django.utils import timezone


class OrderAccessChallenge(models.Model):
    order = models.OneToOneField(
        'base_feature_app.Order', on_delete=models.CASCADE, related_name='access_challenge',
    )
    code_hash = models.CharField(max_length=128, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    attempt_window_started_at = models.DateTimeField(default=timezone.now)
    send_count = models.PositiveSmallIntegerField(default=0)
    send_window_started_at = models.DateTimeField(default=timezone.now)
    last_sent_at = models.DateTimeField(null=True, blank=True)

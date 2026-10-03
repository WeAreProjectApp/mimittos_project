import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('base_feature_app', '0013_cascade_color_size_deletion'),
    ]

    operations = [
        migrations.CreateModel(
            name='OrderAccessChallenge',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code_hash', models.CharField(blank=True, max_length=128)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
                ('consumed_at', models.DateTimeField(blank=True, null=True)),
                ('failed_attempts', models.PositiveSmallIntegerField(default=0)),
                ('attempt_window_started_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('send_count', models.PositiveSmallIntegerField(default=0)),
                ('send_window_started_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('last_sent_at', models.DateTimeField(blank=True, null=True)),
                ('order', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='access_challenge', to='base_feature_app.order')),
            ],
        ),
    ]

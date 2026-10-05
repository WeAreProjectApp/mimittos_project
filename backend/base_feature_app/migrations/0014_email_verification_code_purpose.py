from django.db import migrations, models


def invalidate_legacy_codes(apps, schema_editor):
    password_code = apps.get_model('base_feature_app', 'PasswordCode')
    password_code.objects.using(schema_editor.connection.alias).filter(
        used=False,
    ).update(used=True)


def preserve_unverified_account_blocks(apps, schema_editor):
    user = apps.get_model('base_feature_app', 'User')
    user.objects.using(schema_editor.connection.alias).filter(
        email_verified=False,
    ).update(is_active=False)


class Migration(migrations.Migration):
    dependencies = [
        ('base_feature_app', '0013_cascade_color_size_deletion'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='email_verified',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='passwordcode',
            name='purpose',
            field=models.CharField(
                choices=[
                    ('registration', 'Registration'),
                    ('password_reset', 'Password reset'),
                ],
                default='password_reset',
                max_length=20,
            ),
        ),
        migrations.RunPython(
            invalidate_legacy_codes,
            preserve_unverified_account_blocks,
        ),
    ]

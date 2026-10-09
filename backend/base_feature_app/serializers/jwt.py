from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.utils import get_md5_hash_password

from base_feature_app.views.captcha_views import verify_recaptcha

SESSION_ENDED_MESSAGE = 'La sesión ya no es válida. Inicia sesión de nuevo.'


class CaptchaTokenObtainPairSerializer(TokenObtainPairSerializer):
    captcha_token = serializers.CharField(
        required=False, allow_blank=True, write_only=True,
    )

    def validate(self, attrs):
        if not verify_recaptcha(attrs.pop('captcha_token', '')):
            raise serializers.ValidationError({
                'captcha_token': ['La verificación reCAPTCHA falló.'],
            })
        return super().validate(attrs)


class RevocationAwareTokenRefreshSerializer(TokenRefreshSerializer):
    """Refuse refresh tokens revoked by a password change or whose account was deleted.

    simplejwt only checks the password-hash claim when an access token authenticates,
    so without this the refresh endpoint keeps minting access tokens for a revoked
    session, and a deleted account makes it raise DoesNotExist (HTTP 500).
    """

    def validate(self, attrs):
        refresh = self.token_class(attrs['refresh'])
        user = get_user_model().objects.filter(**{
            api_settings.USER_ID_FIELD: refresh.payload.get(api_settings.USER_ID_CLAIM),
        }).first()
        if user is None:
            raise AuthenticationFailed(SESSION_ENDED_MESSAGE, code='no_active_account')
        if api_settings.CHECK_REVOKE_TOKEN and refresh.payload.get(
            api_settings.REVOKE_TOKEN_CLAIM,
        ) != get_md5_hash_password(user.password):
            raise AuthenticationFailed(SESSION_ENDED_MESSAGE, code='password_changed')
        return super().validate(attrs)

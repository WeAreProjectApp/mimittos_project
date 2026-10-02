from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from base_feature_app.views.captcha_views import verify_recaptcha


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

from django.contrib.auth.backends import ModelBackend
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken


def user_authentication_rule(user):
    """Keep administrative blocking independent from email verification."""
    return user is not None and user.is_active and user.email_verified


class VerifiedUserBackend(ModelBackend):
    def user_can_authenticate(self, user):
        return user_authentication_rule(user)


class SoftJWTAuthentication(JWTAuthentication):
    """
    Like JWTAuthentication but treats expired/invalid tokens as anonymous
    instead of raising 401. This allows AllowAny endpoints to serve public
    users even when the client sends a stale Bearer token in the header.
    Protected endpoints (IsAuthenticated) still return 403 for anonymous users.
    """

    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except InvalidToken:
            return None

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if not user_authentication_rule(user):
            raise AuthenticationFailed(
                'Tu cuenta aún no está verificada.', code='user_not_verified',
            )
        return user

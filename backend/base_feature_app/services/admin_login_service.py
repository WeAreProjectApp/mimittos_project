"""Short-lived, purpose-bound assertions for authorized administrative impersonation."""
from django.core import signing
from django.utils.crypto import constant_time_compare
from rest_framework_simplejwt.utils import get_md5_hash_password

from base_feature_app.authentication import user_authentication_rule
from base_feature_app.models import User
from base_feature_app.utils.auth_utils import generate_auth_tokens


class InvalidAdminLoginHandoff(Exception):
    """The assertion cannot authorize a current administrative login."""


class AdminLoginService:
    SALT = 'base_feature_app.admin_login_handoff'
    MAX_AGE = 60

    @staticmethod
    def _eligible(actor, target):
        return (
            user_authentication_rule(actor)
            and actor.is_superuser
            and user_authentication_rule(target)
            and (not target.is_superuser or target.pk == actor.pk)
        )

    @classmethod
    def issue_handoff(cls, actor, target):
        if not cls._eligible(actor, target):
            raise InvalidAdminLoginHandoff()
        # Password fingerprints revoke outstanding assertions after either password changes.
        return signing.dumps({
            'actor_id': actor.pk,
            'target_id': target.pk,
            'actor_password': get_md5_hash_password(actor.password),
            'target_password': get_md5_hash_password(target.password),
        }, salt=cls.SALT)

    @classmethod
    def redeem_handoff(cls, handoff):
        try:
            claims = signing.loads(handoff, salt=cls.SALT, max_age=cls.MAX_AGE)
        except (signing.BadSignature, ValueError, TypeError):
            raise InvalidAdminLoginHandoff() from None
        if not isinstance(claims, dict):
            raise InvalidAdminLoginHandoff()
        for key in ('actor_id', 'target_id'):
            if type(claims.get(key)) is not int or claims[key] <= 0:
                raise InvalidAdminLoginHandoff()
        for key in ('actor_password', 'target_password'):
            if not isinstance(claims.get(key), str):
                raise InvalidAdminLoginHandoff()
        users = User.objects.in_bulk([claims['actor_id'], claims['target_id']])
        actor = users.get(claims['actor_id'])
        target = users.get(claims['target_id'])
        if not cls._eligible(actor, target):
            raise InvalidAdminLoginHandoff()
        if not constant_time_compare(claims['actor_password'], get_md5_hash_password(actor.password)):
            raise InvalidAdminLoginHandoff()
        if not constant_time_compare(claims['target_password'], get_md5_hash_password(target.password)):
            raise InvalidAdminLoginHandoff()
        # This is intentionally reusable within MAX_AGE; it is not a one-time code.
        return generate_auth_tokens(target)

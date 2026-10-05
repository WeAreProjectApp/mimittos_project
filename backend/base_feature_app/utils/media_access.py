from django.core import signing


MEDIA_ACCESS_SALT = 'base_feature_app.personalization_media'


def issue_media_token(media):
    """Grant reusable access to one uploaded file for checkout."""
    return signing.dumps(
        {'media_id': media.pk, 'media_type': media.media_type},
        salt=MEDIA_ACCESS_SALT,
    )


def can_use_media(media, user=None, token=None):
    """Authorize the authenticated uploader or a capability for this file."""
    if user is not None and user.is_authenticated and media.uploaded_by_id == user.pk:
        return True
    if not token:
        return False
    try:
        payload = signing.loads(token, salt=MEDIA_ACCESS_SALT)
    except (signing.BadSignature, ValueError, TypeError):
        return False
    return payload == {'media_id': media.pk, 'media_type': media.media_type}

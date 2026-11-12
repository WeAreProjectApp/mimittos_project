"""Validate durable state identically in the receiver and application adapters."""
import hashlib
import json
import re
from urllib.parse import urlsplit

PROTOCOL = 1
MAX_BYTES = 32768


def validate(value, target_key=None, origins=None):
    if not isinstance(value, dict) or set(value) != {'schema', 'target_key', 'environment', 'origins', 'version', 'mode', 'message', 'digest'}:
        raise ValueError('Invalid hosting state')
    if value['schema'] != PROTOCOL or value['environment'] != 'production':
        raise ValueError('Invalid environment')
    if not isinstance(value['target_key'], str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', value['target_key']):
        raise ValueError('Invalid target')
    if target_key is not None and value['target_key'] != target_key:
        raise ValueError('Foreign target')
    if type(value['version']) is not int or value['version'] < 0 or value['mode'] not in ('normal', 'suspended', 'banner'):
        raise ValueError('Invalid mode or version')
    message = value['message']
    if not isinstance(message, dict) or set(message) != {'title', 'text'}:
        raise ValueError('Invalid message')
    for field, limit in [('title', 200), ('text', 2000)]:
        if not isinstance(message[field], str) or len(message[field]) > limit:
            raise ValueError('Invalid message text')
        if value['mode'] != 'normal' and not message[field].strip():
            raise ValueError('Empty active message')
    if not isinstance(value['origins'], list) or not value['origins']:
        raise ValueError('Missing origins')
    for origin in value['origins']:
        parsed = urlsplit(origin)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
            raise ValueError('Invalid origin')
    if origins is not None and set(value['origins']) != set(origins):
        raise ValueError('Origin enrollment changed')
    digest = value['digest']
    raw = {key: item for key, item in value.items() if key != 'digest'}
    expected = hashlib.sha256(json.dumps(raw, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    if not isinstance(digest, str) or digest != expected:
        raise ValueError('Invalid digest')
    return value

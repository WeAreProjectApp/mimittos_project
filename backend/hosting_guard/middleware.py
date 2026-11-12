"""Opt-in document adapter. APIs and operational recovery remain reachable."""
import json
import logging
import re
from html import escape
from pathlib import Path
from urllib.parse import urlsplit

from django.conf import settings
from django.http import HttpResponse, JsonResponse

from .state import MAX_BYTES, validate

logger = logging.getLogger(__name__)
ASSETS = Path(__file__).parent / 'web'
TAGS = '<link rel="stylesheet" href="/__hosting/notice.css"><script defer src="/__hosting/notice.js"></script>'


class HostingControlMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.last_valid = None

    def state(self, request):
        target = getattr(settings, 'HOSTING_CONTROL_TARGET', '')
        if not getattr(settings, 'HOSTING_CONTROL_ENABLED', False) or settings.DEBUG or not target:
            return None
        try:
            path = Path(settings.HOSTING_CONTROL_STATE_FILE)
            with path.open('rb') as stream:
                raw = stream.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ValueError('State too large')
            value = validate(json.loads(raw), target)
            self.last_valid = value
        except (OSError, ValueError, AttributeError):
            value = self.last_valid
        if value is None or value['target_key'] != target or request.get_host().lower() not in {urlsplit(origin).netloc.lower() for origin in value['origins']}:
            return None
        return value

    def __call__(self, request):
        path = request.path
        state = self.state(request)
        exemptions = list(getattr(settings, 'HOSTING_CONTROL_EXEMPT_PATHS', ('/api/', '/admin/', '/health/')))
        clean = re.sub(r'^/[a-z]{2}(?:-[a-z]{2})?(?=/)', '', path)
        exempt = any(clean == prefix.rstrip('/') or clean.startswith(prefix) for prefix in exemptions)
        if path == '/__hosting/state':
            return JsonResponse({**(state or {'mode': 'normal'}), 'ready': state is not None,
                                 'exempt_paths': exemptions, 'adapter_version': 1}, headers={'Cache-Control': 'no-store'})
        if path in ('/__hosting/notice.js', '/__hosting/notice.css'):
            name = path.rsplit('/', 1)[-1]
            return HttpResponse((ASSETS / name).read_bytes(), content_type='text/javascript' if name.endswith('.js') else 'text/css', headers={'Cache-Control': 'no-store'})
        if path.startswith('/__hosting/') or exempt:
            return self.get_response(request)
        is_document = request.method in ('GET', 'HEAD') and ('text/html' in request.headers.get('Accept', '') or request.headers.get('Sec-Fetch-Dest') == 'document')
        if state and state['mode'] == 'suspended' and is_document:
            initial = json.dumps({**state, 'exempt_paths': exemptions, 'ready': True}, ensure_ascii=True).replace('<', '\\u003c')
            title, text = escape(state['message']['title']), escape(state['message']['text'])
            html = ('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                    f'<title>{title}</title>{TAGS}</head><body data-hosting-standalone="true">'
                    f'<main id="hosting-notice" class="hosting-screen"><h1>{title}</h1><p>{text}</p></main>'
                    f'<script type="application/json" id="hosting-initial">{initial}</script></body></html>')
            return HttpResponse(html, status=503, headers={'Cache-Control': 'no-store', 'Retry-After': '30',
                                'X-Hosting-Version': str(state['version']), 'X-Hosting-Digest': state['digest']})
        result = self.get_response(request)
        if state and is_document and not result.streaming and result.get('Content-Type', '').startswith('text/html') and not result.get('Content-Encoding'):
            content = result.content.decode(result.charset)
            initial = json.dumps({**state, 'exempt_paths': exemptions, 'ready': True}, ensure_ascii=True).replace('<', '\\u003c')
            tags = '' if '/__hosting/notice.js' in content else TAGS
            injection = tags + f'<script type="application/json" id="hosting-initial">{initial}</script>'
            if '</head>' in content:
                result.content = content.replace('</head>', injection + '</head>', 1).encode(result.charset)
                result['Cache-Control'] = 'no-store'
                result.headers.pop('ETag', None)
                if result.has_header('Content-Length'):
                    result['Content-Length'] = str(len(result.content))
                result['X-Hosting-Version'] = str(state['version'])
                result['X-Hosting-Digest'] = state['digest']
        return result

"""Document rendering consumes local state; production is never contacted."""
import hashlib
import json

import pytest
from django.http import HttpResponse
from django.test import RequestFactory, override_settings

from hosting_guard.middleware import HostingControlMiddleware


@pytest.fixture
def local_state(tmp_path):
    value = {'schema': 1, 'target_key': 'fixture', 'environment': 'production', 'origins': ['https://fixture.example'], 'version': 1,
             'mode': 'suspended', 'message': {'title': '<script>prueba</script>', 'text': 'Aviso de prueba'}}
    def save(**changes):
        value.update(changes)
        raw = {key: item for key, item in value.items() if key != 'digest'}
        value['digest'] = hashlib.sha256(json.dumps(raw, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        path = tmp_path / 'state.json'
        path.write_text(json.dumps(value))
        return path
    return save


def render(path, local_state, *, url='/deep/link', **settings):
    with override_settings(DEBUG=False, HOSTING_CONTROL_ENABLED=True, HOSTING_CONTROL_TARGET='fixture', HOSTING_CONTROL_STATE_FILE=path,
                           HOSTING_CONTROL_EXEMPT_PATHS=('/api/', '/panel/'), ALLOWED_HOSTS=['fixture.example'], **settings):
        adapter = HostingControlMiddleware(lambda request: HttpResponse('<html><head></head><body>Producto</body></html>'))
        request = RequestFactory().get(url, HTTP_HOST='fixture.example', HTTP_ACCEPT='text/html')
        return adapter(request)


def test_direct_link_returns_suspension(local_state):
    result = render(local_state(), local_state)
    assert result.status_code == 503
    assert b'Producto' not in result.content
    assert result['Cache-Control'] == 'no-store'


def test_message_is_escaped(local_state):
    result = render(local_state(), local_state)
    assert b'&lt;script&gt;prueba&lt;/script&gt;' in result.content
    assert b'<script>prueba</script>' not in result.content


@pytest.mark.parametrize('url', ['/panel/projects', '/es-co/panel/login', '/api/payments/'])
def test_recovery_routes_remain_reachable(local_state, url):
    result = render(local_state(), local_state, url=url)
    assert result.status_code == 200
    assert b'Producto' in result.content


def test_banner_keeps_document(local_state):
    result = render(local_state(mode='banner'), local_state)
    assert result.status_code == 200
    assert b'Producto' in result.content
    assert b'/__hosting/notice.js' in result.content


def test_normal_document_includes_live_updates(local_state):
    result = render(local_state(mode='normal', message={'title': '', 'text': ''}), local_state)
    assert result.status_code == 200
    assert b'/__hosting/notice.js' in result.content


def test_foreign_environment_is_ignored(local_state):
    result = render(local_state(environment='staging'), local_state)
    assert result.status_code == 200
    assert b'/__hosting/notice.js' not in result.content

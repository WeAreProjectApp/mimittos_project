"""Unprivileged receiver; credentials are read from a protected file and never logged.

Run with python -m hosting_guard.receiver /etc/projectapp-hosting/config.json.
The local enrollment is authoritative for keys, origins, paths and production.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import logging
import os
from pathlib import Path
import stat
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .state import MAX_BYTES, validate

LOG = logging.getLogger('hosting-receiver')


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(url, token=None, payload=None, accept='application/json'):
    headers = {'Accept': accept, 'Cache-Control': 'no-cache'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if payload is not None:
        headers['Content-Type'] = 'application/json'
    req = Request(url, data=None if payload is None else json.dumps(payload).encode(), headers=headers)
    try:
        result = build_opener(NoRedirect()).open(req, timeout=4)
    except HTTPError as exc:
        result = exc
    with result:
        body = result.read(131073)
        if len(body) > 131072 and accept != 'text/html':
            raise ValueError('Response too large')
        return result.status, result.headers, body


def read_enrollment(path):
    data = json.loads(Path(path).read_text())
    endpoint = urlsplit(data['endpoint'])
    if endpoint.scheme != 'https' or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment:
        raise ValueError('Invalid central endpoint')
    token_path = Path(data['token_file'])
    mode = token_path.stat()
    if not stat.S_ISREG(mode.st_mode) or mode.st_mode & 0o077 or mode.st_uid != os.getuid():
        raise ValueError('Credential requires an owned private file')
    if not data.get('targets') or not isinstance(data['targets'], list):
        raise ValueError('Missing enrollment')
    keys = set()
    paths = set()
    for target in data['targets']:
        if target.get('environment') != 'production' or target['key'] in keys:
            raise ValueError('Foreign environment or duplicate target')
        path = Path(target['state_file'])
        if not path.is_absolute() or str(path) in paths:
            raise ValueError('Invalid local state path')
        keys.add(target['key'])
        paths.add(str(path))
        # Validate enrolled origins using a temporary valid wire document.
        for origin in target['origins']:
            parsed = urlsplit(origin)
            if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
                raise ValueError('Invalid enrolled origin')
    data['token'] = token_path.read_text().strip()
    if not data['token'] or '\n' in data['token'] or '\r' in data['token']:
        raise ValueError('Invalid credential file')
    return data


def atomic_state(path, value):
    path = Path(path)
    # This directory is provisioned by the operator, not remotely chosen.
    if not path.parent.is_dir() or path.is_symlink():
        raise ValueError('State directory not provisioned')
    try:
        with path.open('rb') as stream:
            raw = stream.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('State too large')
        previous = validate(json.loads(raw))
    except FileNotFoundError:
        previous = None
    if previous:
        if value['target_key'] != previous['target_key'] or value['version'] < previous['version']:
            raise ValueError('Stale or foreign state')
        if value['version'] == previous['version']:
            if value['digest'] != previous['digest']:
                raise ValueError('Conflicting revision')
            return
    fd, temporary = tempfile.mkstemp(prefix='.hosting-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            os.fchmod(stream.fileno(), 0o640)
            json.dump(value, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def fetch_enrolled(url, origins, accept='application/json'):
    for _ in range(5):
        code, headers, raw = request(url, accept=accept)
        if code not in (301, 302, 303, 307, 308):
            return code, headers, raw
        url = urljoin(url, headers.get('Location', ''))
        parsed = urlsplit(url)
        if f'{parsed.scheme}://{parsed.netloc}' not in origins:
            raise ValueError('Redirect outside enrolled production')
    raise ValueError('Too many production redirects')


def probe(origin, expected):
    code, _, raw = fetch_enrolled(origin + '/__hosting/state', expected['origins'])
    if code != 200:
        return False
    observed = json.loads(raw)
    if not observed.get('ready') or observed.get('adapter_version') != 1 or any(observed.get(key) != expected[key] for key in ('target_key', 'version', 'digest', 'mode', 'message')):
        return False
    code, headers, raw = fetch_enrolled(origin + '/', expected['origins'], accept='text/html')
    return (code == (503 if expected['mode'] == 'suspended' else 200)
            and headers.get('X-Hosting-Version') == str(expected['version'])
            and headers.get('X-Hosting-Digest') == expected['digest']
            and b'/__hosting/notice.js' in raw and b'/__hosting/notice.css' in raw)


def apply_target(enrollment, row, value):
    validate(value, row['key'], row['origins'])
    atomic_state(row['state_file'], value)
    # Aliases are checked concurrently, keeping a connected poll within budget.
    with ThreadPoolExecutor(max_workers=len(row['origins'])) as pool:
        applied = all(pool.map(lambda origin: probe(origin, value), row['origins']))
    receipt = {'target_key': row['key'], 'version': value['version'], 'digest': value['digest'], 'applied': applied}
    status, _, _ = request(enrollment['endpoint'].rstrip('/') + '/receipts/', enrollment['token'], receipt)
    if status != 200:
        raise ValueError('Receipt rejected')


def cycle(enrollment):
    status, _, raw = request(enrollment['endpoint'].rstrip('/') + '/configs/', enrollment['token'])
    if status != 200:
        raise ValueError('Configuration unavailable')
    values = json.loads(raw)['configs']
    if not isinstance(values, list) or len({value['target_key'] for value in values}) != len(values):
        raise ValueError('Invalid configuration list')
    by_key = {value['target_key']: value for value in values}
    def run(row):
        value = by_key.get(row['key'])
        if value is not None:
            try:
                apply_target(enrollment, row, value)
            except (OSError, ValueError, KeyError, TypeError):
                LOG.warning('Target could not be updated or verified: %s', row['key'])
    with ThreadPoolExecutor(max_workers=min(8, len(enrollment['targets']))) as pool:
        list(pool.map(run, enrollment['targets']))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('config', type=Path)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    while True:
        started = time.monotonic()
        try:
            cycle(read_enrollment(args.config))
        except (OSError, ValueError, KeyError, TypeError):
            LOG.warning('Hosting control unavailable; preserving previous state.')
        if args.once:
            return
        time.sleep(max(0.1, 10 - (time.monotonic() - started)))


if __name__ == '__main__':
    main()

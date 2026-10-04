"""Disposable M0 send/receive probe. No agent, app scaffolding or automatic replies."""
import datetime
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
from m0_probe import credentials, OUT


def setup(keyring):
    os.umask(0o077)
    OUT.mkdir(mode=0o700, exist_ok=True)
    for key in ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID',
                'WHATSAPP_BUSINESS_ACCOUNT_ID', 'WHATSAPP_TEST_RECIPIENT', 'META_APP_SECRET']:
        if not keyring.get(key):
            raise SystemExit('Missing local configuration: '+key)
    recipient = keyring['WHATSAPP_TEST_RECIPIENT']
    if not recipient.isdigit() or not recipient.startswith('91') or len(recipient) != 12:
        raise SystemExit('Recipient must be 91 plus ten digits, no spaces or plus sign.')


def save(path, value):
    path.write_text(json.dumps(value, indent=2))


def send(keyring, reply=False):
    if reply:
        event_file = OUT/'whatsapp-events.jsonl'
        events = [json.loads(line) for line in event_file.read_text().splitlines()] if event_file.exists() else []
        now = datetime.datetime.now(datetime.timezone.utc)
        if not any(e.get('kind') == 'inbound' and e.get('signature_verified') and e.get('recipient_matched')
                   and 0 <= (now-datetime.datetime.fromisoformat(e['at_utc'])).total_seconds() <= 300 for e in events):
            raise SystemExit('A fresh verified inbound test message is required before replying.')
    path = OUT/('whatsapp-reply.json' if reply else 'whatsapp-send.json')
    # Prevent accidental repeated sends, even after a response-lost outcome.
    with path.open('x') as file:
        json.dump({'status': 'attempting', 'at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat()}, file)
    payload = {'messaging_product': 'whatsapp', 'to': keyring['WHATSAPP_TEST_RECIPIENT'],
               'type': 'template', 'template': {'name': 'hello_world', 'language': {'code': 'en_US'}}}
    if reply:
        payload = {'messaging_product': 'whatsapp', 'to': keyring['WHATSAPP_TEST_RECIPIENT'],
                   'type': 'text', 'text': {'body': 'Sahaay M0 test: your message reached the verified webhook. This is a connectivity test, not the live assistant.'}}
    req = urllib.request.Request('https://graph.facebook.com/v25.0/'+keyring['WHATSAPP_PHONE_NUMBER_ID']+'/messages',
              data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer '+keyring['WHATSAPP_ACCESS_TOKEN'],
                                                        'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = json.loads(response.read())
        result = {'status': 'accepted', 'message_type': 'text' if reply else 'template',
                  'message_ids': [m['id'] for m in body.get('messages', [])]}
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read()).get('error', {})
        except ValueError:
            detail = {}
        result = {'status': 'rejected', 'http_status': error.code, 'provider_error_code': detail.get('code'),
                  'provider_error_subcode': detail.get('error_subcode')}
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        result = {'status': 'unknown', 'error_class': type(error).__name__}
    result['at_utc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save(path, result)
    print(json.dumps({k: v for k, v in result.items() if k != 'message_ids'}), flush=True)
    print('No retry performed. API acceptance does not establish delivery.', flush=True)


def receive(keyring):
    token_file = OUT/'webhook-setup.env'
    if not token_file.exists():
        token_file.write_text('WHATSAPP_VERIFY_TOKEN='+secrets.token_urlsafe(24)+'\n')
    verify_token = next(line.split('=', 1)[1] for line in token_file.read_text().splitlines()
                        if line.startswith('WHATSAPP_VERIFY_TOKEN='))
    seen = set()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Never log URLs: verification requests contain the verify token.

        def reply(self, code, body=b''):
            self.send_response(code)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def record(self, value):
            value['at_utc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            with (OUT/'whatsapp-events.jsonl').open('a') as file:
                file.write(json.dumps(value)+'\n')
            print(json.dumps(value), flush=True)

        def do_GET(self):
            url = urllib.parse.urlsplit(self.path)
            if url.path != '/webhooks/whatsapp':
                return self.reply(404)
            query = urllib.parse.parse_qs(url.query)
            if query.get('hub.mode') == ['subscribe'] and hmac.compare_digest(query.get('hub.verify_token', [''])[0], verify_token):
                challenge = query.get('hub.challenge', [''])[0]
                if len(challenge) > 256:
                    return self.reply(400)
                self.record({'kind': 'webhook_verification'})
                return self.reply(200, challenge.encode())
            return self.reply(403)

        def do_POST(self):
            if urllib.parse.urlsplit(self.path).path != '/webhooks/whatsapp':
                return self.reply(404)
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                return self.reply(400)
            if not 0 < length <= 1024*1024:
                return self.reply(413)
            raw = self.rfile.read(length)
            expected = 'sha256='+hmac.new(keyring['META_APP_SECRET'].encode(), raw, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(self.headers.get('X-Hub-Signature-256', ''), expected):
                return self.reply(403)
            try:
                payload = json.loads(raw)
                if payload.get('object') != 'whatsapp_business_account':
                    return self.reply(400)
                for entry in payload.get('entry', []):
                    if str(entry.get('id')) != keyring['WHATSAPP_BUSINESS_ACCOUNT_ID']:
                        continue
                    for change in entry.get('changes', []):
                        value = change.get('value', {})
                        if str(value.get('metadata', {}).get('phone_number_id')) != keyring['WHATSAPP_PHONE_NUMBER_ID']:
                            continue
                        for message in value.get('messages', []):
                            if message.get('from') != keyring['WHATSAPP_TEST_RECIPIENT']:
                                continue
                            identity = hashlib.sha256(message.get('id', '').encode()).hexdigest()[:16]
                            if identity in seen:
                                continue
                            seen.add(identity)
                            self.record({'kind': 'inbound', 'message_type': message.get('type'), 'id_hash': identity,
                                         'signature_verified': True, 'recipient_matched': True})
                        for status in value.get('statuses', []):
                            if status.get('recipient_id') != keyring['WHATSAPP_TEST_RECIPIENT']:
                                continue
                            self.record({'kind': 'delivery_status', 'status': status.get('status'),
                                         'id_hash': hashlib.sha256(status.get('id', '').encode()).hexdigest()[:16],
                                         'error_codes': [e.get('code') for e in status.get('errors', [])],
                                         'signature_verified': True})
            except (ValueError, TypeError, AttributeError):
                return self.reply(400)
            return self.reply(200)

    server = HTTPServer(('127.0.0.1', 8787), Handler)
    server.timeout = 1
    print('Temporary receiver on 127.0.0.1:8787; signatures required; no automatic replies.', flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) == 2 else ''
    keyring = credentials()
    setup(keyring)
    if mode == 'send':
        send(keyring)
    elif mode == 'reply':
        send(keyring, reply=True)
    elif mode == 'receive':
        receive(keyring)
    else:
        raise SystemExit('Usage: python3 scripts/m0_whatsapp.py send|receive|reply')

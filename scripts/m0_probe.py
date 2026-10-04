"""Disposable M0 provider checks, not product code. Uses Python stdlib only.

Run from repo root: python3 scripts/m0_probe.py voice|research
Private outputs expire after 24h; never prints keys or transcripts.
"""
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.m0-private'


def credentials():
    values = {}
    for line in (ROOT / '.env').read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, value = line.removeprefix('export ').split('=', 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[key.strip()] = value
    return values


def multipart(fields, path):
    boundary = 'm0-' + uuid.uuid4().hex
    chunks = []
    for key, value in fields.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{path.name}"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode())
    chunks.extend([path.read_bytes(), f'\r\n--{boundary}--\r\n'.encode()])
    return b''.join(chunks), 'multipart/form-data; boundary=' + boundary


def request(url, headers, body):
    started = time.perf_counter()
    try:
        req = urllib.request.Request(url, data=body, headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=60) as response:
            value = json.loads(response.read())
            limits = {k.lower(): v for k, v in response.headers.items() if k.lower().startswith('x-ratelimit-')}
            return {'status': 'ok', 'seconds': round(time.perf_counter()-started, 3), 'response': value, 'rate_limits': limits}
    except urllib.error.HTTPError as error:
        # Retain safe diagnosis fields, never raw error bodies or credential headers.
        try:
            detail = json.loads(error.read()).get('error', {})
            message = str(detail.get('message', '')).lower()
        except (ValueError, UnicodeError):
            detail, message = {}, ''
        limits = {k.lower(): v for k, v in error.headers.items() if k.lower().startswith('x-ratelimit-') or k.lower() == 'retry-after'}
        return {'status': 'http_error', 'http_status': error.code,
                'provider_error_code': detail.get('code'), 'provider_error_type': detail.get('type'),
                'limit_dimension': 'tokens' if 'tokens per min' in message else 'requests' if 'requests per min' in message else 'unknown',
                'rate_limits': limits,
                'seconds': round(time.perf_counter()-started, 3)}
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return {'status': 'network_error', 'error_class': type(error).__name__,
                'seconds': round(time.perf_counter()-started, 3)}


def voice(keyring, provider, filename):
    if provider == 'openai':
        model = 'gpt-4o-transcribe'
        fields = {'model': model, 'response_format': 'json'}
        url = 'https://api.openai.com/v1/audio/transcriptions'
        headers = {'Authorization': 'Bearer ' + keyring['OPENAI_API_KEY']}
    else:
        model = 'saaras:v4'
        fields = {'model': model, 'mode': 'transcribe', 'language_code': 'unknown'}
        url = 'https://api.sarvam.ai/speech-to-text'
        headers = {'api-subscription-key': keyring['SARVAM_API_KEY']}
    body, content_type = multipart(fields, ROOT / filename)
    headers['Content-Type'] = content_type
    result = request(url, headers, body)
    return {'id': f'{provider}-{filename}', 'provider': provider,
            'model': model, 'file': filename, 'options': fields, **result}


def meta(keyring):
    """Three fixed-host GET checks. No messaging, subscriptions, or mutations."""
    account = keyring['WHATSAPP_BUSINESS_ACCOUNT_ID']
    phone = keyring['WHATSAPP_PHONE_NUMBER_ID']
    if not account.isdigit() or not phone.isdigit():
        raise SystemExit('Meta identifiers must contain digits only.')
    base = 'https://graph.facebook.com/v25.0/'
    paths = [('phone', phone+'?fields=id,display_phone_number,verified_name'),
             ('account', account+'?fields=id,name'),
             ('account_phones', account+'/phone_numbers?fields=id')]
    results = []
    for label, path in paths:
        start = time.perf_counter()
        req = urllib.request.Request(base+path,
              headers={'Authorization': 'Bearer '+keyring['WHATSAPP_ACCESS_TOKEN']}, method='GET')
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                body = json.loads(response.read())
            result = {'status': 'ok', 'fields_returned': list(body)}
            if label == 'phone':
                result['phone_id_matches'] = body.get('id') == phone
                result['display_number_present'] = bool(body.get('display_phone_number'))
            if label == 'account':
                result['account_id_matches'] = body.get('id') == account
            if label == 'account_phones':
                result['phone_belongs_to_account'] = any(row.get('id') == phone for row in body.get('data', []))
                result['pagination_incomplete'] = bool(body.get('paging', {}).get('next'))
        except urllib.error.HTTPError as error:
            try:
                detail = json.loads(error.read()).get('error', {})
            except (ValueError, UnicodeError):
                detail = {}
            result = {'status': 'http_error', 'http_status': error.code,
                      'provider_error_code': detail.get('code'), 'provider_error_type': detail.get('type')}
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            result = {'status': 'network_error', 'error_class': type(error).__name__}
        result.update({'id': 'meta-'+label, 'api_version': 'v25.0',
                       'seconds': round(time.perf_counter()-start, 3)})
        results.append(result)
        print(json.dumps(result), flush=True)
    return results


CASES = [
    ('fact-1', 'What is the latest stable Node.js LTS release as of 4 October 2026? Cite the official release page and distinguish stable from LTS.'),
    ('fact-2', 'As of 4 October 2026, what does Twilio charge per inbound and outbound WhatsApp message, excluding Meta fees? Cite Twilio.'),
    ('product-1', 'Research Apple iPhone 17 in India: official current starting price, two key specs, and limitations. Use current official sources; if unavailable say so.'),
    ('product-2', 'Find the current official India price and battery information for Samsung Galaxy S25. Separate list price from promotions; cite inspected sources.'),
    ('hotel-1', 'Research Taj Palace New Delhi: address, two amenities and official booking source. Do not invent availability or room rates.'),
    ('hotel-2', 'Research The Oberoi Bengaluru: location and two amenities from official sources; do not book or claim live availability.'),
    ('compare-1', 'Compare iPhone 17 and Samsung Galaxy S25 for an Indian buyer on official price, battery and update policy. Cite facts; mark missing evidence.'),
    ('compare-2', 'Compare Taj Palace New Delhi and The Oberoi New Delhi for location and official amenities. No room-price or availability guesses; cite sources.'),
    ('page-1', 'Read https://nodejs.org/en/about/previous-releases and explain the difference between Current and LTS, based on that page. Cite it; state if not actually accessible.'),
    ('page-2', 'Summarize the actual contents of https://example.invalid/sahaay-m0-private-video . If you cannot access it, say so; do not infer contents from the URL.'),
]


def research(keyring, case, followup=False, bounded=False):
    case_id, prompt = case
    payload = {
        'model': 'gpt-5.4-mini-2026-03-17', 'store': False,
        'reasoning': {'effort': 'low'}, 'max_output_tokens': 1400,
        'instructions': 'Answer concisely, ideally under 180 words. Use web search for current claims and actual citations. Never invent accessed sources or private page contents.',
        'input': prompt, 'tools': [{'type': 'web_search'}],
        'include': ['web_search_call.action.sources'],
    }
    if followup:
        payload['instructions'] += (' Today is 4 October 2026. Verify dates: expired offers are historical, never current. '
                                    'Verify the exact product/storage variant for each price. '
                                    'If source facts conflict or look implausible, explicitly qualify or omit them. '
                                    'Prefer at most three useful searches/pages and a short final answer.')
    if bounded:
        payload['max_tool_calls'] = 2
        payload['tools'][0]['search_context_size'] = 'low'
        payload['tools'][0]['filters'] = {'allowed_domains': ['apple.com', 'samsung.com', 'tajhotels.com', 'oberoihotels.com']}
        payload['instructions'] += (' Limit final answer to 120 words. Use up to two hosted tool calls. '
                                    'If the source does not substantiate a detail, mark it unverified; never fill gaps. '
                                    'For ambiguous numerical amenities such as 34/7, omit the number or qualify it as unreliable.')
    result = request('https://api.openai.com/v1/responses',
                     {'Authorization': 'Bearer '+keyring['OPENAI_API_KEY'], 'Content-Type': 'application/json'},
                     json.dumps(payload).encode())
    return {'id': case_id, 'provider': 'openai', 'prompt': prompt,
            'model': payload['model'], 'options': {'store': False, 'reasoning': payload['reasoning'], 'max_output_tokens': 1400,
                                                 'instructions': payload['instructions'], 'max_tool_calls': payload.get('max_tool_calls'),
                                                 'search_context_size': 'low' if bounded else 'default'}, **result}


def main():
    suite = sys.argv[1] if len(sys.argv) == 2 else ''
    if suite not in ('voice', 'research', 'research-followup', 'research-bounded', 'meta'):
        raise SystemExit('Usage: python3 scripts/m0_probe.py voice|research|research-followup|research-bounded|meta')
    os.umask(0o077)
    keyring = credentials()
    required = (['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_ACCOUNT_ID']
                if suite == 'meta' else ['OPENAI_API_KEY', 'SARVAM_API_KEY'] if suite == 'voice' else ['OPENAI_API_KEY'])
    for key in required:
        if not keyring.get(key):
            raise SystemExit('Required credential missing: '+key)
    OUT.mkdir(mode=0o700, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc)
    # Remove expired probe outputs only; never remove user's original clips.
    for old in OUT.glob('*.json'):
        if time.time() - old.stat().st_mtime > 86400:
            old.unlink()
    jobs = [('openai', 'shot1.mp3'), ('sarvam', 'shot1.mp3'),
            ('openai', 'shot2.mp3'), ('sarvam', 'shot2.mp3')] if suite == 'voice' else CASES
    if suite in ('research-followup', 'research-bounded'):
        jobs = [case for case in CASES if case[0] in ('product-2', 'compare-1', 'compare-2')]
    results = []
    if suite == 'meta':
        results = meta(keyring)
    if suite == 'research-bounded':
        for job in jobs:
            result = research(keyring, job, True, True)
            results.append(result)
            print(json.dumps({k: result.get(k) for k in ['id', 'status', 'seconds', 'provider_error_code', 'limit_dimension', 'rate_limits']}), flush=True)
        jobs = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        if suite == 'meta':
            jobs = []
        futures = [executor.submit(voice, keyring, *job) if suite == 'voice'
                   else executor.submit(research, keyring, job, suite == 'research-followup') for job in jobs]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results.append(result)
            print(json.dumps({k: result[k] for k in ['id', 'status', 'seconds']}), flush=True)
    path = OUT / (suite+'.json')
    path.write_text(json.dumps({'at_utc': now.isoformat(),
                              'expires_at_utc': (now+datetime.timedelta(hours=24)).isoformat(),
                              'suite': suite, 'results': results}, ensure_ascii=False, indent=2))
    print('Private results saved; no transcripts or keys printed.', flush=True)
    if any(r['status'] == 'network_error' for r in results):
        raise SystemExit(2)


if __name__ == '__main__':
    main()

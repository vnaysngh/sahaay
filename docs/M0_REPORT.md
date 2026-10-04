# M0 — Provider Decisions, Measured Results and Blockers

> **Current authority — 2026-10-04 Web Chat pivot:** ARCHITECTURE.md and IMPLEMENTATION_PLAN.md supersede the channel, milestone numbers and launch gates below. Meta work is paused and preserved; no account-restriction debugging, incorporation or Business Verification. No Meta/Twilio/Telegram adapter implementation. M1 has not started. Historical findings below are retained as evidence, not active WhatsApp requirements.

**Updated:** 2026-10-04 (Asia/Kolkata). **Status:** Initial live screening performed. Some M0 readiness checks remain unresolved; this is not a full benchmark pass. M1 has not started and requires user approval after the final M0 report.

## NEEDED FOR MVP — selected direction

Ask · Understand · Research · Remember · Organize. One agent, one normalized text/voice/image/URL pipeline. P0 voice/images stay M3; research/URLs M4; memory/items M5. No scope expansion. [User technology direction](TECHNOLOGY_STACK.md) and [implementation plan](IMPLEMENTATION_PLAN.md) remain authoritative.

| Capability | Decision | Reason and limitations |
|---|---|---|
| WhatsApp | **Direct Meta Cloud API**, user-selected under ADR-026 | Avoid Twilio's additional messaging fee/processor. Twilio documentation compared, not live-tested or provisioned. Meta setup/eligible use still unverified. |
| Transcription | **Sarvam STT `saaras:v4`, mode `transcribe`, language `unknown`** | Faster on both supplied clips; user confirmed Sarvam was better on the Hindi opening. One default, no provider routing. Only two short clips tested; genuine code-switching/noise/entities remain unvalidated. |
| Agent/vision | OpenAI Agents SDK, one Responses-backed `gpt-5.4-mini-2026-03-17` agent | Research requests verified model access. Vision and full SDK/product integration not executed in M0. No additional agent/LLM provider. |
| Research | OpenAI hosted web search retained as the only initial provider | Sources/page access work, but rates/freshness/ambiguous-source checks need resolution; no claim of full sufficiency yet. No additional search/crawler provider warranted by current evidence. |
| Runtime/web | Node 22 LTS, TypeScript, npm workspaces, Next.js 16 web + Node API routes | One small persistent app deployment; exact supported patches pinned during M1. Current local Node 22.19.0/npm 11.12.1 from prior check. No microservices or empty packages. |
| Database | PostgreSQL 17, Drizzle/pg; local Compose, managed PostgreSQL for hosting | Only datastore. Docker missing at last check; hosted vendor/region/backup plan remains to select before M0 closes. No database/account provisioned. |
| Auth/tests | Better Auth PostgreSQL sessions; Zod, Vitest, Playwright | Maintained auth primitives. Verified one-use WhatsApp linking; recovery/onboarding needs confirmation. Web is settings/privacy, not another chat product. |
| Memory/organization | Sahaay-owned PostgreSQL operations | Tiny replaceable memory/provider interfaces, no embedding/graph/platform, explicit persistence only. |
| Safety | Existing provider moderation as appropriate plus app policies | No moderation ML system; auth/tenant isolation/limits/tool permissions remain app-owned. |

## NEEDED FOR MVP — actual transcription screening

User authorized both supplied MP3s and the local .env credentials for these calls. No key values were displayed. Both endpoints received the identical original bytes, without translation prompts or language forcing. Local audio inspection: shot1 7.575 seconds; shot2 7.758 seconds, both mono 44.1 kHz MP3 at about 128 kbps. Native WhatsApp OGG/Opus retrieval was not tested.

| Provider | Clip | End-to-end latency, one call | Endpoint outcome |
|---|---|---|---|
| openai | shot1.mp3 | 2.272 s | Success |
| openai | shot2.mp3 | 1.852 s | Success |
| sarvam | shot1.mp3 | 0.636 s | Success |
| sarvam | shot2.mp3 | 1.166 s | Success |

- English: both outputs agreed in wording, with punctuation/capitalization differences. No independently supplied full reference transcript, so no WER or accuracy percentage is claimed.
- Hindi: providers differed at the opening. The user explicitly confirmed **“sarvam worked better”** after viewing the alternatives. This supports the Sarvam selection for this small screen, not a general statistical accuracy claim.
- Both transcriptions of shot2 were Hindi; there was no observed English code switching. Do not count the same Hindi clip as separate Hinglish evidence. Genuine mixed speech, names, cities, amounts, dates, noise and fast speech remain coverage gaps.
- Sarvam returned `language_code` (`en-IN`, `hi-IN`) and `language_probability`. Preserve these as provider-reported metadata, not calibrated application confidence. Explicit code-switch segments were not returned. OpenAI returned text/usage without detected-language fields in these requests; missing metadata stays unknown.
- OpenAI returned usage counts; Sarvam did not return billed usage in these response bodies. Latencies are single local round trips, not production p50/p95.

## NEEDED FOR MVP — actual research screening

Ten public cases: current facts, products, hotels, comparisons, accessible page understanding and unavailable-page honesty. Actual API used the selected model, hosted `web_search`, `store: false`, low reasoning effort, 1,400 output-token cap and source inclusion. This was not a desktop web-search proxy. Maximum two concurrent requests.

| Case | Initial outcome | Latency |
|---|---|---|
| compare-1 | HTTP 429 | 14.184 s |
| compare-2 | Completed | 7.263 s |
| fact-1 | Completed | 7.270 s |
| fact-2 | Completed | 4.864 s |
| hotel-1 | Completed | 6.811 s |
| hotel-2 | Completed | 3.566 s |
| page-1 | Completed | 3.004 s |
| page-2 | Completed | 2.057 s |
| product-1 | Completed | 6.435 s |
| product-2 | Completed | 11.266 s |

Nine initial requests completed, one returned HTTP 429. Successful round-trip latency: median 6.435 s, maximum 11.266 s. Completion is **not** a grounded-quality pass.

Observed evidence and limitations:

- Actual URL annotations and consulted-source metadata were returned. Accessible Node page-understanding used an `open_page` action; nonexistent-page case honestly declined without inventing contents.
- Spot checks against official Node, Apple, Twilio, Samsung, Taj and Oberoi pages supported several main claims. This was not exhaustive verification of every claim/source. Some pages were inaccessible during independent review.
- Samsung answer initially listed an offer ending 30 September as a current promotion on 4 October. A focused recheck with explicit current date and expiry/variant instructions marked it expired. This is observed improvement on one case, not a universal fix.
- Hotel comparison repeated an implausible “34/7” business-centre detail; the clean independently opened hotel page did not substantiate that value. Treat as a grounding failure pending recheck, not an acceptable citation simply because a URL exists.
- Citation URLs sometimes included long tracking strings; preserve genuine source attribution while making replies readable. Do not assume a citation proves currentness or accurate extraction.
- Three follow-ups: Samsung completed in 12.509 s; product comparison again HTTP 429 in 19.659 s; hotel comparison HTTP 429 in 7.726 s. No repeated retry loop or second provider added. Rate-limit body details were not retained, so the specific quota class is unconfirmed.

**Conclusion:** OpenAI search remains the smallest promising default. Broad research sufficiency has not passed the documented acceptance gate: comparison coverage, freshness/grounding and rate-limit behavior remain open. Implement explicit as-of dates, bounded retry/backoff and clear partial/unavailable outcomes within existing request primitives; verify with focused M0 rechecks when quota permits, then M4/M6 regressions. No new infrastructure or crawler.

## NEEDED FOR MVP — approximate cost implications

Published rates are estimates, not dashboard-confirmed charges, and exclude taxes/FX and failed-request billing uncertainty.

- Sarvam STT: ₹30/hour, about **₹0.13 for both clips** before rounding. OpenAI gpt-4o-transcribe: about $0.006/minute, about **$0.0015 for both clips**. Costs alone do not establish accuracy. [Sarvam pricing](https://docs.sarvam.ai/api/getting-started/pricing), [OpenAI pricing](https://developers.openai.com/api/docs/pricing).
- Initial nine completed research calls used 96,624 input tokens (33,792 cached) and 4,043 output tokens: about **$0.068 in model tokens** using model-page rates. Fifteen hosted search/page actions were observed; if each is charged at $0.01, total is approximately **$0.22 including tools**. Actual billable action accounting requires usage/billing verification. The successful follow-up and failed calls are additional, not included in that subtotal. [GPT-5.4 mini pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [tool prices](https://developers.openai.com/api/docs/pricing).
- Twilio's published $0.005 per inbound/outbound message would add about $10 per 1,000 one-in/one-out exchanges before Meta fees. Direct Meta avoids this markup; **current applicable Meta/India fees are not verified, and zero cost is not assumed**. [Twilio pricing](https://www.twilio.com/en-us/whatsapp/pricing).

## NEEDED FOR MVP — privacy and local artifacts

Selected app defaults unchanged: raw media 24 hours; conversation/transcripts/content-bearing tool evidence 7 days; minimal operational/source metadata and pseudonymous enum events 30 days; explicit memory/items until deletion; encrypted backups maximum 30 days. Immediate memory retrieval deletion, active residual cleanup within 24 hours and deletion replay before backup restore. See [SECURITY.md](SECURITY.md).

Probe keys read in-process from .env, never logged/passed on the command line. .env, supplied clips and `.m0-private/` outputs excluded by .gitignore. Private result files use owner-only permissions and carry 24-hour expiry metadata; the probe removes expired outputs on a subsequent run, not via a running background scheduler. Originals were not deleted or copied. User controls the originals; before continued testing after the retention window, confirm bounded fixture retention. Full transcripts are absent from planning docs/product analytics.

OpenAI Responses `store: false` used; no Agents SDK tracing in this standalone HTTP probe. This does not override provider abuse-monitoring retention. Sarvam processing/retention/deletion terms and production processor disclosure remain unverified; explicit authorization covered the supplied M0 clips, not a general production privacy claim. No India-only or zero-retention promise. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data), [Sarvam STT metadata/API](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe).

## NEEDED FOR MVP — remaining blockers and verification commands

1. **Meta:** actual business/sender/test setup, permitted general-assistant use in India and current pricing. The previous official indexed AI-provider restriction concern remains unresolved; choosing direct Meta is not production eligibility. No alternate channel or bypass authorized.
2. **Research:** repeated HTTP 429 comparisons and incomplete freshness/grounding gate. No full research pass claimed.
3. **Database/auth/privacy:** local Docker prerequisite, managed PostgreSQL vendor/region/backup plan, maintained auth recovery setup and Sarvam/Meta processor settings remain to confirm before revised M0 closes.
4. **Voice quality:** selected default has user-confirmed pilot evidence; genuine Hinglish and broader critical-field/audio coverage remain untested. Carry regression requirements into M3; do not label Hindi-only audio as code-switch evidence.

Performed commands: `afinfo shot1.mp3`; `afinfo shot2.mp3`; `python3 scripts/m0_probe.py voice`; `python3 scripts/m0_probe.py research`; `python3 scripts/m0_probe.py research-followup`. Initial sandbox network failures were followed by approved network execution. Do not rerun probes merely for documentation checks: each command makes paid/provider calls. No Node/package installation, production scaffolding, database migration or M1 implementation.

## DEFER UNTIL VALIDATED

Twilio implementation, extra search providers/crawlers, Mem0/Supermemory, Composio/MCP integrations, Temporal/Redis, graph/vector/analytics services, provider routing/extra agents/custom frameworks, productivity APIs, invoices/timers/monitoring, payments/bookings and P1 PDFs/location. Scope remains frozen. Complete outstanding M0 checks, report readiness and obtain user approval before M1.

## User-provided setup evidence and voice-test deferral — 2026-10-04

**NEEDED FOR MVP:** The user explicitly deferred genuine Hinglish evaluation until later. It is no longer a current M0 input dependency; test it in M3 and retain Hindi/English/Hinglish/code-switching as launch requirements. The current Sarvam selection stands on the limited two-clip evidence; do not imply mixed-language accuracy is validated. This changes test timing, not product scope.

The supplied Meta screenshot shows “Claim a WhatsApp test number — Completed,” with Phone Number ID and WhatsApp Business Account ID present. Access token shows “Not generated yet.” This closes the unknown test-number-claim step, not token access, verified recipients, webhook/media/reply checks or production eligibility. Do not copy account identifiers into public benchmark artifacts; configure them locally when testing is authorized. Required local names: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID. No WhatsApp message was sent from this screenshot alone.

The supplied OpenAI Usage screenshot displays $0.09 spend, 122,999 tokens, 12 requests and a $120.00 monthly spend figure for its selected filters. This is observed account-wide dashboard evidence, not a benchmark-only bill, a billing cap guarantee or model request/token-per-minute limits. It does not identify the cause of the 429 responses; rate-limit diagnosis remains open. No extra paid tests were run for this update.

## Meta credentials verified — 2026-10-04

**NEEDED FOR MVP:** All three local WhatsApp environment variables are present. Three authorized read-only Graph v25.0 GET checks succeeded: phone metadata matched the configured Phone Number ID (0.542 s); business-account metadata matched the configured WABA ID (0.409 s); the WABA phone-number list contained the configured phone (0.595 s), with no additional page needed. The token can read these resources as of this check. No token/identifier values were printed or written to the result artifact.

This closes the local token/resource-ID-access blocker. It does not prove messaging permission, token lifetime, verified recipient setup, webhook signatures, media retrieval, reply/delivery behavior or production use-case eligibility. No messages were sent, subscriptions changed, or app endpoints deployed. Remaining Meta work is end-to-end test transport and permitted-use confirmation; remaining M0 research/database/auth/privacy checks are unchanged. M1 has not started.

Verification command: `python3 scripts/m0_probe.py meta`; three fixed-host read-only requests, successful after approved network execution. Minimal private booleans/timings recorded in `.m0-private/meta.json` with 24-hour expiry metadata. [Meta-maintained phone-number API reference](https://www.postman.com/meta/whatsapp-business-platform/request/e9ady51/get-phone-numbers).

## Current M0 position after Web Chat pivot — 2026-10-04

**NEEDED FOR MVP:** Next.js/TypeScript/Node, PostgreSQL/Drizzle, Better Auth, one OpenAI Responses-backed agent, OpenAI images/search, Sarvam pilot-selected transcription, short media/content retention and explicit SQL memory/items remain the selected direction. Web Chat is the immediate interface. Unified request/schema and response event contracts are specified in ARCHITECTURE.md; exact migrations/interfaces follow milestone need.

Two English/Hindi clips were compared and the user preferred Sarvam. Real Hinglish/noise/critical-field/browser-recording coverage is still untested and moves to M2. Subsequent bounded research rechecks completed three cases without 429; freshness and rated-versus-typical specification checks remain M3 quality requirements, not an asserted full pass.

Authorized Meta probes later received two signature-verified matching text messages after subscription fixes. A fresh reply was accepted by the API but failed delivery with error 131031. The temporary receiver/tunnel were stopped. Preserve this evidence; no further investigation under the current pivot.

**Remaining build prerequisites:** Confirm the PostgreSQL development installation/connection (Docker was previously absent), Better Auth sign-in/recovery configuration and upload limits/cleanup/provider disclosure details. No PostgreSQL instance or app has been provisioned. Production hosting/region/backups and recovery/processor privacy requirements must be resolved before testers; no Meta gate for Web Chat. M1 remains unstarted pending plan review and M0 readiness.

**DEFER UNTIL VALIDATED:** All future channel adapters, Meta verification/incorporation, management dashboards and previously excluded services/capabilities.

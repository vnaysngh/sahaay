# Sahaay MVP Architecture

**Updated:** 2026-10-04 (Asia/Kolkata). **Status:** User-directed Web Chat pivot; M1 authorized and implemented as a local text-chat slice. ADR-028 supersedes WhatsApp launch assumptions.

## NEEDED FOR MVP

```text
Sahaay Web Chat
  ↓
Authenticated web channel/input adapter
  ↓
Unified Sahaay Request + owned conversation/input references
  ↓
One Sahaay agent with bounded context
  ├── OpenAI research / public URL understanding
  ├── Sahaay-owned memory CRUD / recall
  └── Sahaay-owned saved items / simple organization
  ↓
Channel-independent response events + persisted final answer/sources
  ↓
Web response stream → conversation window

PostgreSQL: authentication, conversations, inputs, memories, items, sources.
```

Ask · Understand · Research · Remember · Organize. P0 text/images/screenshots/voice/URLs; P1 PDFs/documents/location deferred. One Next.js 16 Node application, TypeScript/Node.js, PostgreSQL 17 with Drizzle/pg, maintained Better Auth sessions, Zod, Vitest and Playwright. Exact compatible patches are pinned in M1. Small modules inside the app suffice; no separate API service, worker deployment or empty packages.

Use one maintained OpenAI Agents SDK agent with Responses, OpenAI images and hosted search. Current M0 model selection is `gpt-5.4-mini-2026-03-17`, low reasoning; configure rather than scatter model strings. Sarvam `saaras:v4` transcribe is the user-confirmed pilot default behind a tiny transcription module. OpenAI transcription was compared, not shipped as a routing fallback. No custom agent framework.

## Core boundary — contract to finalize in M0

The core accepts plain TypeScript data and emits plain response events. It must not import Next.js/React, HTTP request/session objects, browser stream types, Meta payloads or provider SDK session objects into domain records. The web adapter handles auth, upload transport and HTTP streaming; provider modules handle SDK/network formats. This requires ordinary modules, not a generic adapter registry.

| Contract | Minimum fields/behavior |
|---|---|
| UnifiedRequest | Server-derived user ID, conversation ID, stable request/client ID, message ID, optional instruction, ordered owned input references, received time, explicit language preference when available |
| Input reference | Text/image/audio/URL type, owned reference, caption/order, provenance; transcript and available language metadata attached during normalization |
| Response event | Request/message association; processing stage, text delta, sources, completion or sanitized failure; web adapter translates these into streaming transport |
| Completed response | Final text, actual citation/source references, operation outcomes, terminal status and timestamps; reusable by a later channel renderer |

Text and media converge before context/tool/policy execution. All languages use the same agent. Language precedence: explicit instruction → configured preference → current input; natural Hinglish for mixed input. Image/page contents are untrusted evidence. Voice may express user intent but quoted instructions remain data. No model-generated authentication/ownership.

## Request lifecycle and streaming

1. Authenticate the web session. Derive ownership server-side; authorize conversation and input references. Enforce input and request limits.
2. Persist the user message/request with a user-scoped unique client request ID. Serialize conflicting turns per conversation; duplicate submission returns existing state.
3. Normalize inputs, assemble bounded recent conversation and relevant scoped memory/items. Clarify ambiguous/expired references.
4. Run one bounded agent; emit core processing/text/source events through the web adapter. Persist the terminal assistant response and actual sources. Mark interrupted/error states explicitly.
5. Reconnecting clients retrieve persisted history/status. Browser disconnect cannot be treated as proof of success. On startup reconcile abandoned running states; do not automatically replay costly calls or later mutations without idempotency evidence.
6. From M4, commit explicit memory/item writes transactionally with unique request/action IDs and version checks; partial outcomes are visible. No generalized workflow engine, durable timer system or webhook inbox platform is needed for Web Chat.

A persistent Node process is the initial runtime. No Temporal, Redis or mandatory background service. PostgreSQL supports ownership, history, concurrency, simple request state and quotas. Network streams are transient views of persisted request results.

## Minimal schema contracts

All owned records and joins must be scoped to the authenticated user. Enforce ownership in repositories and foreign-key relationships where possible. Use the maintained auth solution's actual minimal tables, not custom password/session primitives.

| Records | Minimum content | Introduced |
|---|---|---|
| Auth user/session/account/verification tables | Maintained Better Auth schema and disabled/deleted state as needed; no WhatsApp linking requirement | M1 |
| conversations | Owner, ID, minimal title, timestamps; ordered messages | M1 |
| messages/request state | Owner/conversation, role, content, client request ID, status, error class, timestamps, parent/input references; user-scoped uniqueness | M1 |
| attachments | Owner/message, type/MIME/size/duration/dimensions, private reference, transcript/summary, available language metadata, provider/model, expiry | M2 |
| research_sources | Owner/message, URL/title, access and available publication time, cited/consulted distinction | M3 |
| memories | Owner, explicit fact/value/unit/label, source IDs, observed/created time, version | M4 |
| saved_items | Owner, content/reference, optional list label, explicit status, provenance/time/version | M4 |
| tool mutation evidence | Owner/request/action ID, operation/outcome, unique mutation key and minimal audit metadata | M4 |
| product_events | Fixed coarse enums, pseudonymous user/request reference, timestamp; no raw private content | M5 |

These are conceptual contracts; exact Drizzle migrations follow milestone need. Do not migrate unused future tables in M1. No embeddings, graph/person schemas, connected accounts, schedules or workflow definitions.

## Media, context and research

Private temporary media is stored outside the web root; owned access only. Validate real format, bytes, image dimensions and audio duration; re-encode safe images and normalize supported audio only as required. Browser microphone permission and recording failures must have an upload/text fallback. OpenAI vision and Sarvam transcripts feed the same context; retain useful provider metadata without inventing confidence/code-switch labels.

Raw media expires in 24 hours, content-bearing conversations/transcripts in 7 days, minimal operational/source metadata in 30 days. Explicit facts/items remain until deletion. Keep provenance IDs/times after source expiry without claiming source content remains available. Details in SECURITY.md; provider retention is separately disclosed.

Use OpenAI hosted search initially and capture actual citations. Bound search calls/token budgets/time; use current as-of context and qualify stale/conflicting evidence. Hosted public URL inspection first; a local safe fetch helper only if needed, with SSRF/DNS/redirect/type/size/time controls. No browser automation, credentials, private memory in public queries or pretend video understanding. Minimal SQL/full-text/label/date memory retrieval; no automatic transcript-to-memory pipeline.

## Paused and DEFER UNTIL VALIDATED

Existing Meta Cloud API evaluation work remains preserved and paused. Its failed outbound delivery/account restriction is not a Web Chat blocker; no further debugging, incorporation or Business Verification now. Later Meta, Twilio or Telegram adapters may authenticate/normalize into the same contract and render core responses; implement none now.

No Temporal, Redis, vector/graph DB, Google APIs, Composio, external memory/search platforms, multi-agent architecture, custom framework, Autopilot, monitoring, invoice/reminder workflows or external transactions. Keep the UI to a polished conversation window, compact history and essential privacy controls. No dashboard.

## M1 concrete setup — 2026-10-04

**NEEDED FOR MVP:** Next.js 16.3.8, TypeScript 5.9.3, Node 22, PostgreSQL 17, Drizzle/pg, Better Auth email/password, one OpenAI Agents SDK agent using the selected model, streamed web responses and scoped conversation history. Local PostgreSQL is a real repo-local native database process on loopback, launched by `npm run db:local`; no Docker or system service. Private generated database/auth values are in ignored `.env.local`. Existing API keys remain in `.env`. Sign-in/recovery processor setup, HTTPS hosting and backups remain tester-launch requirements; local signup does not send verification/recovery mail. Startup/hourly retention cleanup and access-time stale-request reconciliation run in the same application process.

**DEFER UNTIL VALIDATED:** No deployment/vendor provisioning, extra auth/email provider, dashboard or future adapters are introduced by the local slice. M2 images/voice, M3 research and M4 memory/items remain subsequent milestones.

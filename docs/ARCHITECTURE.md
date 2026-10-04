# Sahaay MVP Architecture

**Updated:** 2026-10-05 (Asia/Kolkata). **Status:** User-directed Web Chat pivot; M1–M4 implemented locally. M4 schema/service proposal approved by “go ahead, lets move forward”. ADR-028 supersedes WhatsApp launch assumptions.

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
| memories | Explicit semantic/episodic personal facts; scoped, temporal, provenanced, correctable versions | M4 |
| saved_items | Intentionally saved things; content/reference, optional list label, saved/done/archived status, provenance/time/version | M4 |
| tool mutation evidence | Owner/request/action ID, operation/outcome, unique mutation key and minimal audit metadata | M4 |
| product_events | Fixed coarse enums, pseudonymous user/request reference, timestamp; no raw private content | M5 |

These are conceptual contracts; exact Drizzle migrations follow milestone need. Do not migrate unused future tables in M1. No embeddings, graph/person schemas, connected accounts, schedules or workflow definitions.

## Memory decision — 2026-10-05

**NEEDED FOR MVP:** Conversation history + explicit personal memory + separate saved items + relevant retrieval. PostgreSQL is Sahaay's source of truth for each. Saving an idea or considering a hotel does not establish a personal fact or preference. No automatic conversion between these records.

- **Working/conversation memory:** Existing messages, attachments and bounded current context. Subject to conversation/media expiry; not permanent personal memory.
- **Semantic personal memory:** Explicit facts/preferences, such as “Remember I prefer aisle seats.” Clear preference-setting language can authorize a write; an incidental preference mentioned in a story cannot. Clarify ambiguous intent.
- **Episodic personal memory:** Explicitly remembered events, such as a purchase with its amount/date. Represent the type and optional structured value; no automatic event extraction or advanced temporal reasoning.
- **Saved items:** Ideas, candidate hotels/products, links, research topics and simple lists intentionally saved by the user. Separate storage and service; no preference inference from saving, completing or archiving an item.

**Approved M4 schema (implemented locally):**

| Record | Fields and constraints |
|---|---|
| `memories` | `id`, `user_id`, `memory_key`, `type` (`semantic`/`episodic`), optional `category`, `content`, optional `structured_value`, `source_type`, `source_id`, optional originating `conversation_id`, `confidence`, `scope`, `valid_from`, nullable `valid_until`, nullable `supersedes_id`, `version`, `created_at`, `updated_at` |
| `saved_items` | `id`, `user_id`, `kind`, `content`, optional URL/reference and `structured_value`, optional `list_label`, `status` (`saved`/`done`/`archived`), `source_type`, `source_id`, optional originating `conversation_id`, `version`, `created_at`, `updated_at` |
| Minimal mutation evidence | Owner/request/action identifiers, operation, target identifiers/version and outcome; unique request/action key. No duplicate memory contents or raw media in audit records. |

`memory_key` identifies versions of one explicitly established fact, within an owner and scope. Enforce one current version per `(user_id, scope, memory_key)`; clarify multiple/conflicting targets instead of guessing a merge. Use `version` for stale-write checks. A correction atomically ends the previous validity interval and creates its replacement, with `supersedes_id` pointing to the previous owned version. Current recall excludes superseded, expired and future-valid facts. Forget physically removes the selected fact's version chain, not merely its current visibility; saved-item deletion physically removes the separate item. Keep only necessary content-free retry/deletion evidence so an old request cannot recreate deleted content.

MVP writes use `source_type = user_explicit` and `confidence = 1.0`; this records explicit user assertion, not independently verified truth. Originating message/conversation identifiers are checked for ownership at write time. Memory/items survive ordinary source-message expiry: retain provenance identifiers/type/timestamps without retaining the original transcript/media or claiming expired evidence is readable. Resolve source content only through an ownership-checked repository; explain when it has expired.

Start `scope` with `personal` by default and simple explicit labels when needed, plus an optional category. This is a retrieval filter, not a Skills permission system. Do not invent an extensive taxonomy or automatically expose all scopes to every request.

**Implemented service boundary:** `Sahaay Agent → MemoryService → PostgreSQL`; separately `Sahaay Agent → SavedItemService → PostgreSQL`. Small internal TypeScript interfaces and SQL repositories suffice. All operations receive server-derived ownership; mutation context carries current request/action ID, explicit authorization and originating message. Agent/tool callers never issue scattered SQL or supply their own user identity.

| Service | MVP operations |
|---|---|
| `MemoryService` | `remember(owner, input, mutationContext)`, `recall(owner, filters)`, `list(owner, options)`, `update(owner, id, input, expectedVersion, mutationContext)`, `forget(owner, id, expectedVersion, mutationContext)` |
| `SavedItemService` | `save(owner, input, mutationContext)`, `find/list(owner, filters)`, `update(owner, id, input, expectedVersion, mutationContext)`, `remove(owner, id, expectedVersion, mutationContext)` |

Reads use relevant scope/category/type, structured fields, recency and bounded lightweight text matching. Do not inject the entire memory store or saved-item collection into each request. Explain provenance when asked. Durable recall/correction/deletion uses service results as authority; distinguish any remaining temporary chat history from current durable memory. Never recreate forgotten/corrected facts from old chat context without a new explicit instruction. Retrieved memory/items and page/image contents cannot authorize writes. Private recalled facts/items remain outside M3's public-search payload.

M4 uses migrations `0004_memory_items.sql` and `0005_record_context.sql`. The latter adds only content-free source IDs to existing message rows for turns that used durable records. Correction/forget excludes both original source turns and earlier record-derived answers from working context; visible chat history retains its existing 7-day expiry. Correction turns replace their old source references so their new state remains usable. Mutation receipts contain IDs/operation/version only, expire after 30 days, and are consulted before replay; deleted records are never recreated on retry. Reads return at most eight matching records; the single SDK agent has at most six turns, twelve record-tool calls and eight mutations per request, inside the existing 180-second timeout. Each store has a 500-row local preview limit. Explicit personal-memory requests are excluded from public research; a combined personal-memory/research request asks for a separate public question. A saved public research topic can still compose save plus research.

Chat is sufficient for listing, editing and deleting both concepts. Save plus research must report each outcome independently; a research failure must not hide or repeat a committed save.

**DEFER UNTIL VALIDATED:** Procedural memory, inferred/imported/connected-service writes, background consolidation, automatic profile/relationship/preference extraction, behavioral learning, Personal Graph, Skills access controls, advanced temporal reasoning/ranking, embeddings, pgvector/vector/graph infrastructure and third-party memory providers. The fields and small service interfaces preserve future seams; do not implement these future mechanisms or a memory dashboard now.

## Media, context and research

Private temporary media is stored outside the web root; owned access only. Validate real format, bytes, image dimensions and audio duration; re-encode safe images and normalize supported audio only as required. Browser microphone permission and recording failures must have an upload/text fallback. OpenAI vision and Sarvam transcripts feed the same context; retain useful provider metadata without inventing confidence/code-switch labels.

Raw media expires in 24 hours, content-bearing conversations/transcripts in 7 days, minimal operational/source metadata in 30 days. Explicit facts/items remain until deletion. Keep provenance IDs/times after source expiry without claiming source content remains available. Details in SECURITY.md; provider retention is separately disclosed.

Use OpenAI hosted search initially and capture actual citations. M3 uses a small argument-free research tool within the single SDK agent. Its hosted-search request contains only the current public task and eligible explicitly referenced prior user URLs, not private chat history or images. Ask for missing public product/topic details. Source links derive from actual annotations; source rows commit atomically with the assistant message and expire with it after 7 days. Bound search calls/token budgets/time; use current as-of context and qualify stale/conflicting evidence. Hosted public URL inspection first; a local safe fetch helper only if needed, with SSRF/DNS/redirect/type/size/time controls. No browser automation, credentials, private memory in public queries or pretend video understanding. Minimal SQL/full-text/label/date memory retrieval; no automatic transcript-to-memory pipeline.

## Paused and DEFER UNTIL VALIDATED

Existing Meta Cloud API evaluation work remains preserved and paused. Its failed outbound delivery/account restriction is not a Web Chat blocker; no further debugging, incorporation or Business Verification now. Later Meta, Twilio or Telegram adapters may authenticate/normalize into the same contract and render core responses; implement none now.

No Temporal, Redis, vector/graph DB, Google APIs, Composio, external memory/search platforms, multi-agent architecture, custom framework, Autopilot, monitoring, invoice/reminder workflows or external transactions. Keep the UI to a polished conversation window, compact history and essential privacy controls. No dashboard.

## M1 concrete setup — 2026-10-04

**NEEDED FOR MVP:** Next.js 16.3.8, TypeScript 5.9.3, Node 22, PostgreSQL 17, Drizzle/pg, Better Auth email/password, one OpenAI Agents SDK agent using the selected model, streamed web responses and scoped conversation history. Local PostgreSQL is a real repo-local native database process on loopback, launched by `npm run db:local`; no Docker or system service. Private generated database/auth values are in ignored `.env.local`. Existing API keys remain in `.env`. Sign-in/recovery processor setup, HTTPS hosting and backups remain tester-launch requirements; local signup does not send verification/recovery mail. Startup/hourly retention cleanup and access-time stale-request reconciliation run in the same application process.

**DEFER UNTIL VALIDATED:** No deployment/vendor provisioning, extra auth/email provider, dashboard or future adapters are introduced by the local slice. M2 images/voice, M3 research and M4 memory/items remain subsequent milestones.

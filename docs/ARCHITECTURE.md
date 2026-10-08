# Sahaay MVP Architecture

**Updated:** 2026-10-05 (Asia/Kolkata). **Status:** User-directed Web Chat pivot; M1–M5 implemented locally; Telegram is now the primary messaging test channel and Web Chat remains supported. M4 schema/service proposal approved by “go ahead, lets move forward”. ADR-028 supersedes WhatsApp launch assumptions.

## NEEDED FOR MVP

```text
Sahaay Web Chat OR Telegram private chat
  ↓
Authenticated web adapter OR securely linked Telegram adapter
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

Use OpenAI hosted search initially and capture actual citations. The single SDK agent formulates a standalone public research query from retained conversation context and passes it as a structured function-tool argument. An SDK tool input guardrail validates schema/URLs/credential patterns and uses a bounded structured check on the same primary OpenAI model for conversational intent and privacy; it fails closed before search. This policy check has no tools, memory or agent loop. At most two checks and one actual research execution occur per request. Only the approved query enters hosted search, never a chat dump, private records or images. Clarification replies, comparisons, corrections and topic switches use model context rather than keyword-routing or special-case query reconstruction. A city/neighborhood/postcode explicitly supplied for local search is permitted; precise private location is excluded. This adds one policy-check model call on successful research and up to 20 seconds within the existing 180-second total timeout. Guardrail rejection must not be described as a search-provider outage. Source links derive from actual annotations; source rows commit atomically with the assistant message and expire with it after 7 days. Bound search calls/token budgets/time; use current as-of context and qualify stale/conflicting evidence. Hosted public URL inspection first; a local safe fetch helper only if needed, with SSRF/DNS/redirect/type/size/time controls. No browser automation, credentials, private memory in public queries or pretend video understanding. Minimal SQL/full-text/label/date memory retrieval; no automatic transcript-to-memory pipeline.

## Paused and DEFER UNTIL VALIDATED

Existing Meta Cloud API evaluation work remains preserved and paused. Its failed outbound delivery/account restriction is not a Web Chat blocker; no further debugging, incorporation or Business Verification now. Later Meta, Twilio or Telegram adapters may authenticate/normalize into the same contract and render core responses; implement none now.

No Temporal, Redis, vector/graph DB, Google APIs, Composio, external memory/search platforms, multi-agent architecture, custom framework, Autopilot, monitoring, invoice/reminder workflows or external transactions. Keep the UI to a polished conversation window, compact history and essential privacy controls. No dashboard.

## M1 concrete setup — 2026-10-04

**NEEDED FOR MVP:** Next.js 16.3.8, TypeScript 5.9.3, Node 22, PostgreSQL 17, Drizzle/pg, Better Auth email/password, one OpenAI Agents SDK agent using the selected model, streamed web responses and scoped conversation history. Local PostgreSQL is a real repo-local native database process on loopback, launched by `npm run db:local`; no Docker or system service. Private generated database/auth values are in ignored `.env.local`. Existing API keys remain in `.env`. Sign-in/recovery processor setup, HTTPS hosting and backups remain tester-launch requirements; local signup does not send verification/recovery mail. Startup/hourly retention cleanup and access-time stale-request reconciliation run in the same application process.

**DEFER UNTIL VALIDATED:** No deployment/vendor provisioning, extra auth/email provider, dashboard or future adapters are introduced by the local slice. M2 images/voice, M3 research and M4 memory/items remain subsequent milestones.

## Telegram channel decision — approved 2026-10-05

Telegram → private-chat adapter → the same Unified Sahaay Request and shared core runtime → Telegram presentation. Web Chat calls the same runtime. No second agent, memory implementation, research logic, saved-item logic or modality pipeline.

Initial reception uses one small local long-polling transport script and an authenticated bridge into the existing Node app. No public webhook, tunnel, extra datastore or queue service. The script only receives updates; the app owns processing, identity, media and replies. The bridge requires the server-held bot credential and is not an unauthenticated Telegram webhook. Keep the Node app and polling process running; this pilot transport is sequential and not intended as a high-throughput worker platform.

A signed-in Sahaay user creates a 10-minute, random single-use Telegram deep link; only its hash is stored. The private Telegram sender consumes it. telegram_links maps Telegram IDs to existing canonical users; it never creates users from Telegram IDs, matches by username/email or merges accounts implicitly. Conflicting links require Web disconnect first. Telegram gets a persistent owned conversation, visible in Web history, while memory/items are shared across the account. /new rotates the Telegram conversation. Group/bot messages are ignored.

Text/URLs, photo or supported image documents and direct voice/audio reuse existing validation/storage/transcription/context limits (8 MB, 30-second audio). PDFs/documents remain unsupported by the core and receive a clear explanation. Forwarded text is quoted as untrusted data; forwarded voice must be resent directly with an explicit request. Albums are received as individual photo messages in this initial adapter.

One processing message is edited at meaningful stage changes, then replaced with the final answer. No token-by-token Telegram messages. Actual cited sources are included as URLs, link previews are disabled, and output is plain text to avoid formatting injection. Only completed long responses are split into bounded messages; pathological answers above eight messages link back to the complete saved Web answer.

Stable bot/update IDs map to request UUIDs. Content-free delivery receipts deduplicate updates; restarted/interrupted work does not rerun the agent or committed tools. Uncertain sends are not blindly retried. An interrupted request with a known reply can reconcile from the persisted final answer without tool replay. Canonical pause/delete/version checks and cancellation are shared. Disconnect interrupts the associated pending conversation; account deletion cascades channel links/receipts. Restore clears channel links/codes, requiring fresh authenticated linking so old snapshots cannot restore revoked access.

Commands: npm run db:migrate; npm run dev; in another terminal npm run telegram:dev. Configure TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME (without @), then open /connect/telegram while signed in. Local polling needs no public callback. Deployed bridge traffic requires HTTPS; bot tokens never enter model prompts, frontend bundles or logs. Telegram retains its own chat/media copies outside Sahaay’s deletion and retention controls. Live bot delivery awaits BotFather configuration.

Conversation context uses the SDK-supported explicit-history path with owned Postgres messages, rather than a second SDK session store. Select recent complete user/assistant turns, always preserving the current input; bound older individual messages to 6,000 characters with a truncation marker and the text window to 16,000 characters. Deleted/expired and forgotten-record source exclusions apply before selection. No automatic summary memory, provider-hosted conversation storage or custom agent framework. SDK sessions remain an alternative history-persistence interface, not a remedy for incomplete tool arguments.

## M6 — Personal life state (post-MVP, implemented separately)

The shared Sahaay core continues to own state. Web and Telegram supply the same internal user ID; there is no channel-specific personal store. One agent proposes structured record operations and the owned SQL services execute them.

M6 extends `saved_items` with `record_role` (`item` or `object`, default `item`), `parent_id` (nullable same-user object reference) and `state_label` (nullable descriptive state). An ongoing Japan trip is an object; a hotel is an item linked to it. Ideas, purchases and candidates remain items, optionally with a state such as considering or purchased. Existing flat `structured_value`, content, kind, URL, list label, lifecycle status, versions, provenance and timestamps are reused. Kinds/state labels are short natural labels, not fixed product categories. Objects contain items at one level; no object nesting, ontology, arbitrary graph, new datastore or background execution. Descriptive state is separate from saved/done/archived lifecycle status.

`memories` remains the separate explicitly requested fact/preference/event store. Conversation context remains temporary evidence and reference resolution. Personal organizational declarations in the current request can now authorize keeping state without a save command. This is a deliberate M6 expansion from M4's explicit-save rule, not automatic profile extraction. The agent searches existing objects before creation and resolves ambiguous subjects/parents before changes. A bounded semantic write policy uses the same OpenAI client, store:false, no tools and a 20-second timeout per check. It reviews the exact proposed operation, current owned text/transcript, owned target/parent and working conversation; policy failures deny writes. It is a policy check, not another domain agent. Main-agent image interpretation remains subject to recognition errors. Preferences still use the unchanged explicit memory authorization.

Review happens before the database transaction; the transaction checks that the reviewed current text/transcript is unchanged. Ownership, pause/active-request checks, owner serialization, optimistic versions, idempotency receipts, sensitive-value refusal and deletion evidence are reused. Parent ownership and one-level shape are enforced in SQL; roles are immutable, and a parent changed after review causes a stale-version failure. Deleting an object preserves and ungroups its child items. Deleting a conversation does not delete independent personal state. Account deletion cascades state. The existing item deletion journal and encrypted backup restoration also cover objects and links.

The additive 0008 migration leaves all old records as items with no parent/state; it does not reinterpret historical data. Deploy it before the new app/poller code, then roll out/restart the Web process hosting the Telegram bridge so it loads the new core. Old code must not be used to edit new state records after rollout. SQL migrations are authoritative for the column-specific SET NULL foreign key and parent-role trigger; Drizzle describes the columns and relationship.

Web `/state` is a small authenticated, owner-filtered, paginated view of top-level objects/items, object children and separate explicit memories. Web Chat remains available. Organization/edit/archive/delete use normal conversation; no dashboard or duplicate CRUD flows. The view reads fresh state on navigation/reload, not push notifications. Agent reads are bounded to eight results and Web pages to 24 records; they do not promise full exports or semantic cross-language retrieval. Long-term memory/record retention remains until deletion, temporary source history seven days.

Actual record commits/reads append constrained behavior flags to existing 30-day product events: state_created, state_revisited, state_updated, memory_created, memory_recalled and saved_item_created. Replays do not generate new creation events. Unsupported external requests can record unsupported_action and one coarse demand category (travel/shopping/money/creator/productivity/fitness/communication/other). Existing coarse detection remains a fallback. Events contain no record title, URL, price, media, prompt or transcript. Behavioral flags are per request (coalesced), not exact counts of individual objects; unsupported classification is an estimate, not authoritative execution telemetry. Account deletion removes events.

M7–M10 remain unimplemented: no Inbox, scheduled triggers, proactive messages, external execution, Skills or Autopilots. Future Inbox records can reference owned object IDs in a new table if validated; M6 adds no dormant scheduler or speculative framework.

## M7 amendment — Inbox + explicit one-off follow-ups

The existing shared core gains a small FollowupService; memory, saved items/life objects and chat context retain their meanings. `followups` owns a reason, optional owned saved-item/object reference, explicit-request trigger, UTC time/IANA timezone, provenance, version and separate lifecycle/delivery states. A confirmed user timezone is optional; absent/ambiguous time is clarified rather than inferred. Partial dates on state do not schedule anything. Existing life-object inspection includes its active follow-ups.

Web and Telegram both use the same core reminder tools and ownership/policy/receipt machinery. Web Inbox reads the same rows; its authenticated, origin-checked lifecycle actions use the same owner locks/version checks. Telegram delivery is a thin text notifier. No timed LLM execution: a due item only surfaces its explicitly requested reason.

The existing continuously running Next Node process polls PostgreSQL every 30 seconds. A durable send intent commits before contacting Telegram; a second owner-locked transaction rechecks pause, identity, version and cancellation before the bounded send. This network-under-lock exception is limited to notification dispatch (15-second transport timeout), to serialize privacy/cancel against sends; model/provider reasoning remains outside mutation transactions. Concurrent processes cannot claim the same reminder. Safe rejected sends have bounded backoff; uncertain sends/crashes cannot be silently replayed. Web readiness is independent of Telegram delivery. Already-started sends cannot be recalled. Downtime means late catch-up, so request-only/sleeping hosting is unsuitable for timely reminders.

Related-state deletion cancels active reminders, including child-item reminders. Chat deletion leaves separately requested follow-ups. Account deletion cascades them. Restores cancel snapshot reminders and revoke links before exposure. Closed rows expire after 30 days; active reminders remain until closed. Unsupported capability demand records normalized flags/slugs/channel only, without monitoring/execution. M8 First Connected Capability, M9 actions and M10 Autopilots remain deferred pending usage evidence.

## M6.5 — Personal Artifacts / Documents

Artifacts are a distinct user-owned original-media primitive. Memories remain explicit facts/preferences, saved items remain organized candidates/content, life objects remain current plans, and conversation context remains temporary. Images alone are supported in M6.5. Clear current durable-storage intent is required; ordinary image understanding never promotes an upload. Existing follow-ups are preserved; this milestone adds no autonomous work.

The existing Web/Telegram attachment pipeline retains received PNG/JPEG/WebP bytes temporarily alongside its normalized vision preview. Both new image copies are encrypted with AES-256-GCM. Keeping an image promotes those received bytes into `artifacts`, with encrypted description, extracted text and a bounded flexible metadata array. Generic title/category, MIME, size, timestamps and provenance remain plain database columns; listings contain no extracted values. Full identity values are masked/omitted from understanding; the original is unchanged. Optional same-owner `related_item_id` links an artifact to a saved item/life object, detaching on state deletion. Artifacts survive conversation/temporary upload expiry.

Private PostgreSQL BYTEA blobs reuse the existing datastore and encrypted backup/restore path; there is no additional storage service. Original and understanding ciphertext authenticate owner, artifact ID and purpose. A private key is independent of database backups. Local development lazily creates `.local/artifact.key` (0600); deployment must explicitly provide `SAHAAY_ARTIFACT_KEY` (base64 32 random bytes) or a pre-provisioned `SAHAAY_ARTIFACT_KEY_FILE` on a private persistent volume. Back up the key independently and securely. Losing it loses access; rotation is a separate operational migration, not automatic regeneration. Production database connections require verified TLS; Web deployment requires HTTPS.

ArtifactService scopes every query/read/promotion/delete to the canonical Sahaay user. The model never chooses authorization. The shared agent uses existing vision and record-intent policy to keep/search/read/return/delete. Missing extracted fields can use SDK-native image tool output to re-examine the owned original through the same model. This does not send a file to the user; explicit original requests are separately authorized. Multiple matches require narrowing. Search evaluates bounded owner-only encrypted understanding in application memory with keyword matching, at most 100 artifacts / 256 MiB, returning at most 20 summaries. Temporary received images are bounded to 64 MiB per user. This replaceable small-scale search is not a vector store or a promise of perfect recognition.

Web `/documents` offers summaries, authenticated preview/download, extracted fields and confirmed deletion. `/api/documents/:id/original` serves exact received bytes with owner checks, no-store, nosniff and restrictive CSP; no public URL or sharing. Durable message-artifact references support chat history. Telegram sends the exact original as an image file via `sendDocument`, avoiding `sendPhoto` recompression. Telegram may already have compressed an inbound photo: preservation begins at the bytes received by Sahaay; uploading as a file preserves the sender's file. Both channels use the same service/account state. Delivery remains bounded and uncertain sends are not replayed.

Deletion removes the artifact ciphertext, extraction, response relationships and temporary upload row/file. Content-free source tombstones suppress artifact-derived conversation context, and the existing deletion journal suppresses restored copies. Independently retained Telegram/OpenAI copies cannot be erased by Sahaay. Encrypted backups expire within the existing 30-day policy, with 31-day external deletion evidence. Account deletion cascades artifacts; chat deletion preserves explicitly kept Documents. Access/create/search/return/delete/link events reuse content-free behavior flags; raw originals, extracted values, names and addresses never enter product analytics.

Migration `0010_artifacts.sql` is additive and must precede app/poller rollout. Existing attachments have no recoverable pre-conversion originals: require re-upload instead of presenting a preview as the original. Existing memories, items and state are not migrated or reinterpreted. Deploy Web/Telegram together; keep the key and database/backup volumes persistent. PDFs/audio/video artifacts, public links, folders, OCR services, vector/graph stores and automatic image retention remain excluded.

# Sahaay MVP Implementation Plan

**Updated:** 2026-10-05 (Asia/Kolkata). **Status:** Web Chat pivot directed by the user. M1 completed locally; M2 implemented locally; M3 authorized by “go ahead with m3” and implemented locally. M4 memory decision and schema/interfaces approved on 2026-10-05; M4 and M5 implemented locally. Tester launch remains gated on deployment/email/operations and processor review.

## NEEDED FOR MVP — scope and architecture

Ask · Understand · Research · Remember · Organize.

Web Chat → channel/input adapter → Unified Sahaay Request → one Sahaay agent → tools/memory → channel-independent response → web stream/rendering.

P0: text, images/screenshots, voice recordings/uploads and URLs in normal messages. P1 PDFs/documents/location are not launch blockers. English/Hindi/Hinglish share one pipeline; explicit language instruction overrides configured preference, then follow the current input language naturally. Genuine Hinglish voice evaluation remains deferred at the user’s request; do not claim it has passed.

Keep Next.js 16, TypeScript, Node.js, PostgreSQL, Drizzle/pg, Better Auth, one OpenAI Agents SDK agent with Responses, OpenAI vision/search, Sarvam as the pilot-selected transcription default, and Sahaay-owned SQL memory/items. Pin compatible patches during M1. Use small modules inside one app; split packages only when useful. No dashboard, extra providers, agent framework or additional services.

Meta Cloud API work and existing probes are paused and preserved. Account restriction debugging, incorporation, Business Verification and WhatsApp eligibility do not block Web Chat. Telegram is now explicitly approved as a thin adapter; Meta/Twilio remain deferred.

## Verification conventions

M0–M5 app paths and verification scripts now exist. Each milestone creates the scripts/suites it uses; test commands must fail for missing suites. Provider mocks verify application behavior; separately authorized live checks establish provider behavior. Never load real credentials in normal unit tests or log them. Common checks after each implementation milestone: `npm run lint`, `npm run typecheck`, `npm run build`.

M1 introduces `npm ci`, `npm run dev`, `npm run db:migrate`, `npm run db:migrate:check`, `npm test` (Vitest) and `npm run test:web` (Playwright). PostgreSQL is the only datastore: use one available local installation or a development managed database selected in M0. Docker is optional, not a blocker if another PostgreSQL connection is available. Deployment provisioning is not required for local M1 acceptance.

## M0 — Foundation decisions

**Classification:** NEEDED FOR MVP.

**Objective:** Finalize just the contracts and setup required to build Web Chat; report open decisions before M1.

**Files/packages affected:** Existing planning documents; conceptual schema/request contracts in ARCHITECTURE.md; existing disposable provider probes/private evaluation results. No app scaffolding or production migrations.

**Dependencies:** User-approved Web Chat channel pivot; existing OpenAI/Sarvam screening evidence and selected TypeScript/Next.js stack.

**Implementation steps:** Finalize authenticated user ownership, conversation/message/attachment/source contracts, client request ID and core response events. Retain OpenAI model configuration, `store: false`, disabled sensitive tracing and bounded model/context limits. Confirm PostgreSQL development connection/setup and Better Auth sign-in/recovery choice. Retain short media/content expiry; define upload ownership, cleanup and provider disclosure. Carry forward the completed two-clip Sarvam/OpenAI evaluation; defer realistic mixed/noisy/browser-recording coverage to M2. Keep research quality checks in M3; do not block text/image development on a broader voice benchmark. Stop Meta work.

**Tests:** Documentation consistency; no web-specific auth/session or React types in the planned core contract; check existing redacted provider evidence and configuration presence without printing values. No further live Meta calls or paid benchmark reruns just to update documents.

**Acceptance criteria:** Concrete schema/interface, OpenAI, database, authentication and retention choices recorded; remaining prerequisites distinguished from later tester-launch requirements. Revised plan and M0 decisions reported before M1. No product scope or code added.

**Commands required to verify:** `node --version`; `npm --version`; `rg -n '^## M[0-5]|^\*\*(Objective|Files/packages affected|Dependencies|Implementation steps|Tests|Acceptance criteria|Commands required to verify)' docs/IMPLEMENTATION_PLAN.md`; inspect ARCHITECTURE.md, SECURITY.md and current decision amendments. PostgreSQL connectivity is checked after a development connection is chosen; do not expose its URI.

## M1 — Core Web Chat

**Classification:** NEEDED FOR MVP.

**Objective:** Open Sahaay in a browser, sign in, converse naturally and receive streamed intelligent replies with context.

**Files/packages affected:** Root manifest/lockfile/config; `apps/web` Next.js conversation UI and Node routes; small `src/{auth,db,channels/web,core,providers/openai}` modules within the app; migrations for auth/conversations/messages; `tests/{foundation,web-chat}`. No empty packages.

**Dependencies:** Revised plan reviewed and M0 build prerequisites resolved; development PostgreSQL and existing OpenAI access. WhatsApp readiness and full transcription evaluation are not dependencies.

**Implementation steps:** Establish the one app and maintained auth. Migrate owned conversations/messages and request status/client-ID uniqueness. Implement minimal conversation view, text composer/send, small history/new-conversation control, streaming indicator and actionable errors. Reserve the composer attachment/microphone positions for M2 without presenting broken controls. Web adapter derives identity from the session and constructs a core request. Core loads bounded conversation context, runs one agent, persists the final response and emits channel-neutral events; web route translates to the browser stream. Support Hindi/English/current-language replies. Persist terminal failure/interrupted states and reconcile abandoned runs on startup; do not build a generalized inbox/workflow engine or silently repeat model calls. Browser reconnect reads persisted state; incomplete text is not presented as a completed answer.

**Tests:** Auth/session/CSRF and unauthenticated rejection; two-user conversation isolation; context across turns; mocked stream progression/completion/error; duplicate client request IDs and concurrent turns; disconnect/interrupted process handling; prompt/key leakage. Playwright sign-in → send → streamed reply → reload/history. One small live OpenAI smoke test with consented text.

**Acceptance criteria:** `npm run dev` exposes a working sign-in and conversation window. A signed-in user receives a real intelligent response and can ask a contextual follow-up, reopen conversation history and understand failures. Server-authorized ownership applies throughout. Agent/core has no Next.js, React, browser-session or WhatsApp payload dependency. Research/memory/media are not falsely offered as working yet.

**Commands required to verify:** `npm install` for initial lockfile; `npm ci`; `npm run db:migrate`; `npm run db:migrate:check`; `npm test -- tests/foundation tests/web-chat`; `npm run test:web -- web-chat`; `npm run test:provider -- --suite text` (explicit live check); common lint/typecheck/build checks; `npm run dev` and browser acceptance.

## M2 — Understand: images and voice

**Classification:** NEEDED FOR MVP.

**Objective:** Send everyday screenshots/images or recorded/uploaded voice and ask follow-ups through the same request pipeline.

**Files/packages affected:** Composer `+` and microphone controls; owned upload/media Node routes; attachment migration; `src/core` normalization/context; small vision/transcription modules; private temporary storage; `tests/multimodal` and consented evaluation fixtures.

**Dependencies:** M1; M0 upload limits/retention and selected transcription provider. No research or persistent-memory requirement.

**Implementation steps:** Add image/screenshot upload with optional text and voice recording/upload with microphone permission/cancel handling. Validate actual formats/bytes/dimensions/duration, normalize browser audio to a provider-supported format only when necessary, and clean temporary data on success/failure/expiry. Bind attachments to the authenticated user/message. Use OpenAI image understanding and the one selected transcription provider. Preserve available language/code-switching metadata, provider/model and provenance; missing metadata stays unknown. Caption, transcript and images enter the same core request. Keep owned prior attachment references for follow-ups; explain expiry/ambiguity. Text responses only.

**Tests:** Image understanding and contextual follow-up on two inputs; unreadable image; voice English/Hindi/Hinglish, Indian names/amounts/dates/noisy recordings; browser recording/upload compatibility; denied microphone; invalid/oversized uploads; cross-user retrieval; attachment expiry/cleanup; malicious content instructions. Offline pipeline fixtures plus small consented provider checks.

**Acceptance criteria:** Working `+`/microphone controls, useful image/voice responses and follow-ups, one agent/policy/context path for every modality. Available transcription metadata retained without invented confidence or language evidence. P1 document/location formats rejected clearly; no separate OCR/voice agent or speech response feature.

**Local implementation:** PNG/JPEG/WebP uploads and screenshot paste; voice recording/cancel/upload; private owner-scoped media; one normalized agent pipeline; image follow-ups and retained transcription metadata. Uploads are limited to 8 MB, 3 images and 1 voice clip per request; audio is limited to 30 seconds. FFmpeg/ffprobe are local runtime dependencies, not additional services. Media expires after 24 hours; transcripts follow the 7-day conversation retention. Browser recording stops slightly before the duration limit. English/Hindi consented live checks passed; genuine Hinglish, noisy speech and broader entity accuracy remain unvalidated. Production email/recovery and privacy launch gates still apply.

**Commands required to verify:** `npm run db:migrate`; `npm test`; `npm run test:integration`; `npm run test:web`; common checks. Opt-in live provider check: `npm run test:live-multimodal` (requires existing keys and the consented local voice fixtures; sends data to OpenAI/Sarvam and deletes its disposable account/uploads).

## M3 — Research and URLs

**Classification:** NEEDED FOR MVP.

**Objective:** Research current questions and accessible public URLs, compare inputs, and show actual supporting sources.

**Files/packages affected:** `src/core/tools/research`; OpenAI search boundary; research-source migration; stream event/source rendering in chat; `tests/research-links`.

**Dependencies:** M1–M2; existing OpenAI search access. Prior bounded screening supports the default but does not establish a full accuracy pass.

**Implementation steps:** Add hosted OpenAI web search and research/processing state events. Accept URLs in ordinary messages and resolve owned prior inputs. Capture real citation annotations and cited/consulted source distinctions, timestamps and source links. Apply explicit as-of context, bounded calls/time/token budgets and clear partial/rate-limit failures. Qualify unsupported claims, stale promotions and rated-versus-typical specifications. Start with hosted URL inspection; add a small safe public fetch helper only if a demonstrated requirement needs it, with SSRF/redirect/DNS/byte/time controls. Do not build a crawler or browser tool.

**Tests:** Current facts and source grounding; comparison freshness/critical specification accuracy; genuine versus fabricated citations; source link rendering; inaccessible/video/PDF URLs; SSRF defenses if local fetching is introduced; page injection and private-data search leakage; rate limits/timeouts. Live focused research evaluation with bounded spend.

**Acceptance criteria:** Current research and public-page understanding return grounded answers and clickable sources, or honest limitations. Processing state is visible. Never claim an inaccessible page/video was inspected; no added search provider absent approval and evidence.

**Local implementation:** The single SDK agent supplies a standalone public query derived from conversation context to a structured research function tool. An SDK input guardrail checks privacy and conversational intent with the same primary provider before execution; only its approved query enters hosted search, not private history/images. Clarify genuinely missing or ambiguous details; no special-case follow-up regex routing. Postgres history remains authoritative and recent complete turns survive bounded context selection. Reject private/credential-bearing and document URLs; do not infer video access. At most one research invocation, four hosted search/open actions, 90 seconds for research and 180 seconds for the overall response. Actual annotations become verified inline links; consulted pages are separately labelled. Source records commit with the final assistant message and expire with its 7-day retention; publication time stays unknown unless supplied. No local page fetcher/crawler or additional service. Focused live comparison, public-URL and PDF-limit checks passed; this is not a broad factual-accuracy guarantee.

**Commands required to verify:** `npm run db:migrate`; `npm test`; `npm run test:integration`; `npm run test:web`; common checks. Opt-in live check: `npm run test:live-research` (requires configured OpenAI access and the local app; only public fixtures, disposable account removed).

## M4 — Remember and Organize

**Classification:** NEEDED FOR MVP.

**Objective:** Explicit personal memory and relevant cross-conversation recall, with correction/forget; separately save, retrieve and organize items through chat. Working conversation context is not durable personal memory.

**Files/packages affected:** `0004_memory_items.sql`, `0005_record_context.sql` and Drizzle schema; `src/core/{memory,items}` service contracts; `src/providers/record-tools` SDK tools; separate PostgreSQL repositories; existing agent/context integration and chat confirmations; unit, PostgreSQL integration and browser tests.

**Dependencies:** M1–M3; the 2026-10-05 memory decision; proposed schema/interface review in ARCHITECTURE.md; explicit persistence/ownership/deletion rules. No new datastore, provider or management UI.

**Implementation steps — independently testable slices:**

1. **M4a: Owned storage and services.** After schema/interface review, introduce separate `memories` and `saved_items` tables and small `MemoryService`/`SavedItemService` repositories. Use the proposed semantic/episodic type, optional category/structured value, simple scope, explicit provenance/confidence, validity interval, supersession and version fields. Add only necessary content-free idempotency evidence. Verify backend remember/list/recall/update/forget and separate item CRUD without model calls. Dependencies: M1–M3 and schema review. Acceptance: SQL ownership constraints, atomic corrections and physical deletion pass unit/integration tests. Commands: `npm run db:migrate`, `npm test`, `npm run test:integration`.
2. **M4b: Relevant recall.** Integrate bounded deterministic retrieval into the existing core/agent using scope/category/type, structured fields, recency and lightweight text matching. Separate personal fact retrieval from saved-item searches. Preserve original message/conversation identifiers and show source expiry honestly. Dependencies: M4a. Acceptance: a preference explicitly remembered in conversation A is recalled in conversation B; unrelated facts/items and expired/superseded facts are excluded. Commands: `npm test`, `npm run test:integration`, `npm run test:web`.
3. **M4c: Explicit memory controls through chat.** Add remember/list/provenance/edit/forget tools with server-derived ownership and current-request authorization. Incidental statements and untrusted content cannot authorize writes. Clarify ambiguous correction/deletion targets. A correction ends the old interval and creates one current replacement; forget deletes the complete targeted version chain. Stale versions/retries cannot restore an old fact, and chat history must not be represented as durable recall after deletion. Dependencies: M4a–M4b. Acceptance: aisle → window → forget works across conversations, with no duplicate writes or resurrection. Commands: `npm test`, `npm run test:integration`, `npm run test:web`.
4. **M4d: Saved items and ordinary composition.** Add save/find/list/edit/remove tools for ideas, candidates, links, dated records and research topics, with simple list labels and saved/done/archived status. Saving a hotel/idea must not create a preference/personal memory. Compose explicitly requested save plus research and report each outcome, including partial failure, without repeating committed writes. Dependencies: M4a–M4c and M3 research. Acceptance: independent saved-item CRUD works in chat and a research outage preserves exactly one successful save. Commands: `npm test`, `npm run test:integration`, `npm run test:web`.

Each slice uses existing app modules and PostgreSQL; common lint/type/build checks apply. No memory dashboard, automatic inference/synthesis, Skills permission system, procedural-memory engine or advanced retrieval infrastructure.

**Tests:** Explicit remember in A/recall in B; semantic versus episodic facts and amounts/units; saved ideas/hotel candidates do not become preferences; relevant-only retrieval and scope isolation; current versus superseded/expired facts; provenance after source expiry; list/edit/physical delete; stale corrections and retry/concurrency idempotency; two-user isolation; untrusted-content write attempts; no automatic inference/resurrection; deletion of version chains and content-free audit evidence; partial save/research failures.

**Acceptance criteria:** Separate memory/item semantics persist end-to-end. Explicit facts/items are saved once, recalled only when relevant, editable/physically deletable in chat and attributable to their source/time. One current state exists after an explicit correction; deleted versions cannot reappear through retry or passive extraction. Source expiry does not delete a deliberately durable record. No automatic transcript memory, background tracking, graph/vector service or persona schemas.

**Commands required to verify:** `npm run db:migrate`; `npm test`; `npm run test:integration`; `npm run test:web`; common checks. Opt-in live checks: `npm run test:live-memory` and `npm run test:live-memory -- --hindi` and `npm run test:live-memory -- --composition`, using disposable accounts and synthetic facts; normal tests do not call providers.

**Local M4 implementation:** Separate owned memory/items with explicit text or owned voice authorization, semantic/episodic types, structured amounts/units, scope/provenance, bounded keyword reads, atomic version corrections and physical forget/item removal. Chat supports saved lists, editing, done/archive status and deletion. Content-free mutation receipts prevent retry resurrection; source IDs on existing messages prevent earlier recall answers from reviving corrected/forgotten facts. A committed save survives a failed remaining response and is reported independently. No dashboard, automatic extraction or added infrastructure. Verified locally: 23 unit tests, 16 PostgreSQL integration tests and 10 browser tests; live English memory/item flow, Hindi remember/recall/correction/forget, and save-plus-public-research with actual citations. Broader phrasing/retrieval/language quality evaluation remains part of M5.

## M5 — Product validation and controlled launch

**Classification:** NEEDED FOR MVP.

**Objective:** Make the small assistant ready for initial testers and learn what is useful without expanding the UI.

**Files/packages affected:** Existing conversation/history/error UI; minimal privacy controls; product-event migration/enums; retention/deletion helpers; `tests/{security,recovery,mvp}`; evaluation fixtures and short operating instructions.

**Dependencies:** M0–M4; tester hosting/database/backups, secure auth/recovery and processor/privacy disclosures resolved before inviting testers. No Meta/incorporation/Business Verification dependency.

**Implementation steps:** Finish simple conversation/account deletion and necessary privacy controls/disclosure. Harden existing history, upload/stream/retry errors, quota/cost bounds and safe rendering. Record coarse intent/modality/language/outcome/unsupported-action events in PostgreSQL without raw private content. Verify cleanup, account deletion and backup restore suppression. Run the complete P0/five-verb/language matrix and fix usability gaps. Prepare controlled tester access; no implicit public deployment, management dashboard, analytics service or background monitoring.

**Tests:** Full text/image/voice/URL × relevant capability coverage; Hindi/English/Hinglish; cross-user access/CSRF/XSS/injection; privacy cleanup and delete/restore; interrupted streams/idempotent saves; provider outages/quotas; unsupported execution; enum-only event privacy; end-to-end tester journeys.

**Acceptance criteria:** All P0 inputs and five verbs work with useful context, sourced research and controllable owned memory/items. Initial testers can use the conversation window and history, understand processing/errors and delete their data. Hosting/processor/auth/backup requirements satisfied. P1 and paused channels are excluded from launch gates.

**Commands required to verify:** `npm ci`; `npm run db:migrate`; common checks; `npm test`; `npm run test:web`; `npm run eval:mvp`; `npm run test:restore`; `npm run test:integration`; `npm run release:check -- --local`; `npm run release:check`. Production-bundle verification locally uses `SAHAAY_LOCAL_PREVIEW=1 npm run build`; normal deployed builds require HTTPS, SMTP and verified database TLS.


**Local M5 implementation:** Compact Privacy controls pause/resume processing, delete the current/all conversations and delete the account with current password plus DELETE confirmation. Chat deletion preserves separately saved memories/items; account deletion cascades both, sessions and identifiable events. Cancellation and PostgreSQL lifecycle checks reject late completions/mutations. Email verification, single-use password recovery, session revocation and database-backed auth rate limits use Better Auth. Production refuses synthetic bypasses, missing SMTP or unverified database TLS. No dashboard or new datastore.

Product discovery stores only constrained capability/modality/language/outcome/unsupported-target enums; voice is classified transiently from its owned transcript. Events expire in 30 days, conversation/transcript content in 7 days, raw media in 24 hours. Explicit persistence refuses credentials/OTPs/sensitive identity identifiers; this conservative rule is not comprehensive PII detection. Ordinary explicitly supplied project prices remain permitted.

Encrypted database backup/restore commands use native PostgreSQL clients and AES-GCM. Raw media is excluded. A private fsynced deletion ledger survives database snapshots for 31 days; restore requires the matching ledger and a new empty database while the app is offline. Restored sessions/verification tokens are removed and credential passwords cleared, requiring password reset. Deleted records/source answers/accounts are suppressed before exposing the restored database. Recovery tests include a real pg_dump → encrypt/decrypt → pg_restore round trip, not only mocked SQL.

**Remaining tester launch work:** Configure a public HTTPS host, verified-TLS PostgreSQL, private durable media/deletion-ledger volume and restricted reverse proxy that overwrites forwarded IP headers. Configure SMTP_HOST/PORT/USER/PASSWORD/FROM, verify actual verification/reset email delivery, then set SAHAAY_EMAIL_DELIVERY_VERIFIED=1. Generate a private 32-byte hexadecimal SAHAAY_BACKUP_KEY outside version control, retain it securely, schedule daily backup:create and keep the matching ledger independently recoverable; run a recovery drill on the actual deployment and set SAHAAY_OPERATIONS_VERIFIED=1 only afterwards. Review actual OpenAI/Sarvam account processing/retention terms and tester disclosure, then set SAHAAY_PROCESSORS_REVIEWED=1. These flags record operator checks; they are not automatic proof or deployment authorization. release:check fails until configured. No tester invitations/public deployment performed.

**Operating commands:** PostgreSQL 17-compatible pg_dump/pg_restore must be on PATH or configured through PG_DUMP_BIN/PG_RESTORE_BIN. Run npm run backup:create with DATABASE_URL, backup key and private ledger configured. To restore, stop the app, set SAHAAY_RESTORE_OFFLINE=1 and SAHAAY_RESTORE_DATABASE_URL to a new empty database, then run npm run backup:restore -- /absolute/path/backup.sahaay.enc. Review the resulting database and reset-email access before switching DATABASE_URL; never restore over the active database. Keep backups/ledger on protected durable storage, purge expired backups during scheduled backup runs, and remove .env.local from deployment artifacts.

**Verification:** 26 unit tests, 22 PostgreSQL integration tests (including native encrypted backup restoration) and 14 browser journeys pass via npm run eval:mvp. Lint/type checks, migration currency and loopback production build pass. An encrypted private local database backup was created; deployed backup scheduling/recovery is still pending.

**Evaluation limits:** Deterministic browser journeys cover text/context/history, image follow-up, voice upload/capture controls, URL research/sources, separate memory/item lifecycle and privacy/auth flows. Hardware capture is synthetic in automated tests; manually check a real microphone on tester browsers. Existing consented live English/Hindi voice and live English/Hindi memory/research evidence is retained. Genuine Hinglish voice remains deferred by the user. Provider mocks and these focused live checks do not establish general language/research accuracy; initial tester validation remains observational work after deployment.


## T1 — Telegram testing adapter (approved after M5)

**Objective:** Use the same assistant through private Telegram messages while retaining Web Chat.

**Files/packages affected:** 0007_telegram.sql/schema; channels/telegram; shared core/runtime extracted from the Web route; authenticated Telegram bridge/link routes; compact account-link page; scripts/telegram.ts; Telegram unit/integration/browser regressions. PostgreSQL remains the only datastore.

**Dependencies:** M1–M5; a BotFather bot/token/username for live delivery. Fake transport tests do not need a live bot or provider calls.

**Implementation steps:** (1) Extract shared runtime and verify Web regressions. (2) Add hashed single-use linking to existing canonical accounts with isolation/expiry tests. (3) Normalize text/image/voice/URL transport into existing owned inputs and test shared context, memories/items and research. (4) Render stage edits/final source links; deduplicate updates and handle uncertain delivery without replaying tools. (5) Reuse privacy controls/cancellation and verify unlink/delete/restore revocation. (6) Configure the bot and run a small live private-chat check; do not register a webhook or invite testers implicitly.

**Tests:** Stable request IDs; hashed single-use/expired links; takeover rejection and two-user isolation; shared memory/items and Web history; URLs/source attribution; owned image/audio pipeline; forwarded-content authorization; ignored groups/bots; P1 rejection; pause/resume; duplicate delivery and uncertain sends; safe output/file download boundaries; restore unlink; Web sign-in/link/origin/bridge-auth regressions.

**Acceptance criteria:** One shared core and datastore; linked private Telegram conversations support P0 modalities and existing five verbs; final responses/sources arrive without partial-message spam; Web Chat remains functional. Bot credentials stay private. No extra product capabilities or infrastructure. Local mocked transport tests establish application behavior; actual Telegram delivery still requires bot configuration and a live check.

**Commands required to verify:** npm run db:migrate; npm run lint; npm run typecheck; npm run eval:mvp; SAHAAY_LOCAL_PREVIEW=1 npm run build for local bundle verification. Run npm run dev and npm run telegram:dev in separate terminals; sign in to /connect/telegram, create/open the link and test one text, image, direct voice and sourced research request. Test /new, /pause, /resume and shared recall. Never paste the bot token into chat.

## DEFER UNTIL VALIDATED

WhatsApp/Meta and Twilio adapters; Meta restriction debugging, incorporation and Business Verification; PDFs/documents/location; settings/memory dashboards; Temporal, Redis, vector/graph databases, Gmail/Calendar/Contacts, Composio, Mem0/Supermemory, extra research providers/crawlers, multi-agent/model routing, custom frameworks, Autopilots/monitoring, reminders/invoices, payments/bookings and other external actions.

M0 decisions and revised plan were shown; the user authorized M1 on 2026-10-04. Local PostgreSQL 17 runs through the repo-local development launcher (no Docker/system service); Better Auth email/password is configured for local sign-in, with verified email/recovery required before testers. M1 is the first usable browser conversation; M2 completes P0 multimodal understanding. The pivot simplifies the channel, not the product scope.

## M6 — Personal Life State (current post-MVP milestone)

**Objective:** Make personal plans, ideas, purchases and candidates accumulate as inspectable owned state across Telegram and Web. M7–M10 are direction only, not this build.

**Smallest model:** Extend saved_items with immutable item/object role, an optional owned parent object, and a descriptive state label. Reuse flat attributes, lifecycle, provenance and receipt machinery. Keep memories and conversation context separate. No historical recategorization.

### M6.1 — Typed state and safe persistence

- **Files/packages:** 0008_life_state.sql, db/schema, core/items and memory interfaces, db/items, record-mutations, events, privacy summary. Existing PostgreSQL/pg/Drizzle only.
- **Dependencies:** M4 records, M5 ownership/retention/restore journal, T1 canonical Telegram linking.
- **Steps:** Add defaulted fields and same-owner one-level parent constraints; preserve legacy inputs; extend search by role/parent/state; reuse versions, receipts and item deletion evidence; keep children when an object is deleted; append content-free lifecycle flags.
- **Tests:** Isolated real PostgreSQL schema; migration defaults; cross-owner/invalid/nested parents; immutable role; concurrent stale changes; replay; pause during review; voice authorization; source expiry; delete/restore suppression and account cascade.
- **Acceptance:** Existing saved items stay items. A plan and its linked items have the same internal owner, remain after chat expiry, and cannot be restored after deletion.
- **Verify:** `npm run test:integration`; `npm run typecheck`; `npm run db:migrate`; `npm run db:migrate:check`.

### M6.2 — Natural organization in the existing agent

- **Files/packages:** providers/record-tools, item-intent, openai, core/runtime; existing Agents SDK and OpenAI client. No new framework/provider.
- **Dependencies:** M6.1 and existing unified context/media pipeline.
- **Steps:** Expose roles/parents/state through existing item tools; search before object creation; resolve referents from working conversation and owned records; authorize current natural self-organizational declarations with a bounded semantic policy; reject quoted/forwarded/hypothetical/ambiguous intent and preference misclassification; report persistence only after tool success. Coarse unsupported-action reporting records demand without executing it.
- **Tests:** Real-agent opt-in evaluation using invented data only; Japan plan → hotel from another channel/thread → plan recall; purchase amount/currency; considering a laptop; explicit preference; negative quoted request; natural video idea; state update; unsupported shopping action; object deletion retaining child. Unit policy failure/malformed-result tests and SQL transaction rechecks.
- **Acceptance:** No special commands/domain agents; the same core tools work from both adapters; no new memory appears for a hotel/plan merely because it was saved. Failures never claim uncommitted state.
- **Verify:** `npm run test:live-state` (uses configured OpenAI key and synthetic isolated schema, simulated Telegram sends); `npm test`; `npm run test:integration`.

### M6.3 — Minimal personal-state surface

- **Files/packages:** app/state/page, db/life-state, chat header, existing CSS and privacy disclosure. Next/React already installed.
- **Dependencies:** M6.1–M6.2, existing authenticated Web app.
- **Steps:** Add My state navigation; paginate objects/ungrouped items; open related items; show attributes/state/update date and separate explicit memories; retain chat and Telegram linking; perform edits through natural chat.
- **Tests:** Browser creates a plan and hotel, inspects object details, reloads and returns to chat; ownership/unknown object tests; existing auth and mobile/chat/media/privacy journeys remain intact.
- **Acceptance:** State is visible outside history; no large dashboard, menu-driven Telegram bot or duplicate state-management service. New records show after navigation/reload.
- **Verify:** `npm run test:web`; `npm run lint`; `npm run typecheck`; `SAHAAY_LOCAL_PREVIEW=1 npm run build`.

### M6.4 — Review and dogfooding handoff

- **Files/packages:** Existing tests, synthetic evaluation script, architecture/security/plan docs only as needed.
- **Dependencies:** M6.1–M6.3 pass; tested migration applied locally and shared bridge host updated.
- **Steps:** Audit persistence semantics, privacy and adapter reuse; run complete relevant regressions and live synthetic cases; report verification limits and local entry point. Founder/tester usage follows; no M7 implementation.
- **Acceptance:** Japan scenario works across channels and is inspectable on Web. Ordinary nonorganizational requests are not passively saved. No added infrastructure, future execution or proactivity. Existing deployment/SMTP/backup/processor gates still apply before public testers.
- **Verify:** All preceding commands. Live checks are evidence for tested cases, not a guarantee of perfect intent/reference/language recognition.

**M6 verification (local):** 39 unit checks, 36 PostgreSQL integration checks and 16 browser journeys pass. Typecheck, lint and local production build pass. The complete 11-case real OpenAI evaluation and three additional Hindi/Hinglish checks passed using invented inputs in an isolated schema and simulated Telegram delivery; no real user history was exported and no Telegram messages sent by the evaluation. Additional language verification: `npm run test:live-state -- --language-only` covers Hindi natural project creation/cross-conversation recall and a typed Hinglish idea; it does not add new Hinglish voice accuracy evidence. Early live runs exposed unnecessary date clarification/inconsistent object retrieval; the final design preserves partial dates and provides named object lookup plus aggregate object/child inspection. This is tested-case evidence, not a guarantee of arbitrary reference or language accuracy. Migration 0008 is applied locally. Hosted deployment/tester gates from M5 remain unchanged; M7–M10 are deferred.

## M7 — Inbox + Controlled Follow-ups (2026-10-06)

M0–M6 remain supported. This amendment authorizes M7 only. M8 is **First Connected Capability**, chosen after dogfooding; M9 consequential actions and M10 Autopilots remain unimplemented.

**Model and reuse:** One new `followups` table, separate from memories, saved items and conversation context; an optional same-owner saved-item/object relationship. A nullable confirmed IANA timezone on the existing user. Reuse the canonical Web/Telegram identity, unified request/core, record authorization policy, owner locks, mutation receipts, version checks, deletion journal, existing Node process and Telegram transport. No historical data conversion, new agent, infrastructure or workflow engine.

### M7.1 — Persistent lifecycle and authorization

- **Objective:** Create/update/cancel/complete explicitly requested one-off reminders across channels.
- **Files/packages:** `0009_followups.sql`, `core/followups`, `db/followups`, schema, record mutations, provider tools/policy, shared runtime; existing pg/Zod/Agents SDK.
- **Dependencies:** M6 state and M5 ownership/retention controls.
- **Steps:** Add separate lifecycle and delivery states, UTC scheduling plus timezone, reason/provenance, versions/receipts. Resolve related state through existing tools; bound reminder lookup and include active reminders in object inspection. Convert local times deterministically; reject missing timezone, ambiguous/invalid clock-change times, vague dates and past times. A date on state alone creates no reminder. Deleting a parent or related item cancels associated active reminders; deleting chats preserves separately requested reminders.
- **Tests:** Ownership, policy denial, source-expiry replay, stale versions, UTC conversion/DST, related parent/child deletion, paused mutation and restore suppression. Live invented-data evaluation for natural corrections, Hindi, quoted instructions and timezone clarification.
- **Acceptance:** Natural requests create one owned reminder; corrections update it; cancelled reminders cannot deliver. No recurrence, monitoring or future agent execution.
- **Verify:** `npm test`; `npm run test:integration`; `npm run test:live-followups`; `npm run typecheck`; `npm run db:migrate`; `npm run db:migrate:check`.

### M7.2 — Durable Inbox readiness and bounded delivery

- **Objective:** Bring explicit reminders back without duplicates on retry/restart.
- **Files/packages:** `core/followup-worker`, Telegram follow-up notifier, existing Next instrumentation. Existing PostgreSQL and Node process only.
- **Dependencies:** M7.1; linked verified identity and configured bot for Telegram notification.
- **Steps:** Poll every 30 seconds, promote due items to ready, commit a send intent before network I/O, recheck consent/identity/version under the owner lock, record delivery result. Safe Telegram 429 rejection retries with backoff, maximum three attempts. Unknown/network/5xx/crash outcomes become uncertain and are never automatically resent; terminal failures remain in Web Inbox. Serialize cancellation/privacy with delivery. Skip paused users; resume catches up. Restore cancels active snapshot reminders and revokes channel links, requiring fresh user intent. Closed reminders expire after 30 days.
- **Tests:** Restart before due, concurrent workers, unknown sends/stale committed attempts, safe retry bounds, pause/unlinked/unverified users, cancellation before dispatch, no fabricated delivery without transport, backup restore.
- **Acceptance:** Persistent Inbox does not depend on Telegram. A successful send is recorded once; uncertain sends are clearly labeled. Exactly-once Telegram transport is not promised. Cancellation cannot recall an already-started send. Delivery is at poll granularity while running, and late after downtime; hosting must keep this existing Node process alive (a sleeping laptop/serverless request-only host cannot meet timely delivery).
- **Verify:** `npm run test:integration -- tests/integration/followups.test.ts`; `SAHAAY_LOCAL_PREVIEW=1 npm run build`; `npm run dev` or `npm run start` after migration. No separate scheduler service required.

### M7.3 — Minimal Web Inbox and privacy-conscious demand

- **Objective:** Inspect Today/Upcoming follow-ups and act consistently across channels; learn unsupported capability demand.
- **Files/packages:** `app/inbox`, `app/api/inbox`, Inbox component/CSS, chat/state navigation, existing privacy page, product events/discovery/tool schemas.
- **Dependencies:** M7.1–M7.2 and existing authenticated Web app.
- **Steps:** Confirm timezone, display scheduling/delivery explanation, expose Open/Done/Dismiss/Reschedule/Cancel, keep closed items inspectable. Reuse shared SQL lifecycle; no dashboard or Telegram menus. Store lifecycle flags and normalized unsupported category/capability/channel only; ordinary reminders are no longer mislabeled unsupported calendar actions. Extend the capability allowlist in code as real demand emerges, never use private prompt content as a capability label.
- **Tests:** Verified browser account creates in chat, inspects/reschedules/opens/dismisses, checks the same core state; responsive layout, auth/CSRF, existing Web/Telegram/media/state/privacy regressions. Synthetic Telegram Flow A–F exercises the real shared core/SQL with fake transport; live provider evaluation tests interpretation separately.
- **Acceptance:** Visible accumulation independent of chat history; unsupported monitoring logs demand and creates no job. Existing Web/M6 UI continues working. No M8 capability selected.
- **Verify:** `npm run test:web`; `npm run lint`; `npm run typecheck`; complete relevant integration/unit/live evaluation and local production build.

Internal capability-demand query (operator SQL, no public route/dashboard; 30-day event retention; suppress small cohorts before sharing):

```sql
SELECT unsupported_category AS category, unsupported_capability AS capability,
       channel, count(*) AS requests, count(DISTINCT user_id) AS users
FROM product_events
WHERE 'unsupported_action'=ANY(behaviors) AND unsupported_capability IS NOT NULL
GROUP BY unsupported_category, unsupported_capability, channel
ORDER BY requests DESC;
```

Dogfood M7 before choosing M8. Hosting, SMTP and backup/processor gates from M5 still apply before inviting public testers.

**M7 local verification:** Migration 0009 applied and checksum check passes. 41 unit checks, 49 isolated PostgreSQL checks and 17 browser journeys pass; the final Inbox/Open/CSRF and delivery/cancel race checks were rerun after the audit fix. Typecheck, lint and local production build pass. Nine live OpenAI cases passed with invented accounts, an isolated schema and simulated Telegram transport, including natural correction/cancellation, cross-channel object recall, unknown timezone, monitoring refusal, quoted intent and Hindi reminders. Desktop/mobile Inbox screenshots were inspected. Actual timed Telegram delivery remains a dogfooding check on the configured bot; no real recipients received synthetic test notifications. Local Inbox route is available with authentication. Confirm timezone in Inbox and keep the existing Node server running before testing a real reminder. M8–M10 remain deferred.

## M6.5 — Personal Artifacts (images only)

### M6.5.1 — Private original retention and owned service

- **Objective:** Explicitly retain an image original independently of chats while preserving the memory/item/state distinction.
- **Files/packages:** Migration 0010, schema, core/artifacts, db/artifacts, existing attachments/files, media/artifact-crypto, privacy restore/journal; built-in Node crypto, existing PostgreSQL only.
- **Dependencies:** Current authentication, canonical channel identity, image validation, owned mutation policy/receipts and deletion ledger.
- **Steps:** Preserve/encrypt received bytes and normalized previews temporarily; promote only explicit keep requests. Add generic summaries, encrypted understanding and optional owned state reference. Bound count/bytes/search. Implement owned create/get/search/original/delete, replay/version checks, audit flags and restore suppression. Configure independent private encryption key; retain 24-hour ordinary images and independent durable Documents.
- **Tests:** Byte equality, wrong-owner read/promotion/delete, encryption tamper/cross-owner binding, temporary expiry, legacy re-upload, chat/account deletion, state detach, idempotency and restored-deletion suppression.
- **Acceptance:** No automatic artifacts or memories; private durable original survives chat expiry; unauthorized operations fail at the service; deletion removes active originals/extraction/copies and suppresses source context.
- **Verify:** `npm run test:integration`; `npm test`; `npm run db:migrate`; `npm run db:migrate:check`.

### M6.5.2 — One agent and two thin transports

- **Objective:** Natural keep/list/field-answer/original-return/delete across Web and Telegram.
- **Files/packages:** Existing provider/core/record policy/runtime, providers/artifact-tools, conversation response references, Telegram API/adapter; existing OpenAI Agents SDK vision.
- **Dependencies:** M6.5.1, same linked internal user and existing multimodal input.
- **Steps:** Expose explicit artifact operations separately from memory/items. Use initial image understanding; re-examine an owned original through native image tool output when extraction lacks a requested field. Keep evidence untrusted and private from public research. Narrow ambiguous targets. Send at most three original files per request without recompression; persist references for Web history.
- **Tests:** Synthetic Aadhaar storage, new-conversation address, exact original return, Telegram→Web and Web→Telegram, generic listing, ambiguous invoices, quoted intent refusal, deletion, no extracted-field memories and missing-field image fallback.
- **Acceptance:** Users identify documents by meaning, not filenames/IDs; extraction never substitutes for an original, ambiguity never silently selects sensitive media. Existing channel/core behavior stays intact.
- **Verify:** `npm run test:integration`; `npm run test:live-artifacts`; `npm run typecheck`; `npm run lint`.

### M6.5.3 — Documents surface and validation

- **Objective:** Inspect/download/delete owned Documents without a file manager or dashboard expansion.
- **Files/packages:** /documents, authenticated Documents APIs, minimal component/CSS/nav, existing chat, privacy disclosure/env example/release checks and browser tests.
- **Dependencies:** M6.5.1–2 and working Web authentication.
- **Steps:** Show generic summaries; open original preview and selected extraction; offer original download and confirmed deletion. Enforce ownership/origin/cache headers. Disclose durable retention, processor copies and backup/key recovery. Test desktop/mobile and existing Web flows.
- **Tests:** Authenticated exact-byte downloads, cross-account denial, cross-origin deletion denial, durable deletion, useful metadata, responsive preview and full Web regression suite.
- **Acceptance:** Telegram-kept images appear on Web; Web-kept images are retrievable on Telegram through the shared account. Plain summaries expose no unnecessary sensitive values; no public links or unsupported media.
- **Verify:** `npm run test:web`; `SAHAAY_LOCAL_PREVIEW=1 npm run build`; `npm run release:check -- --local`.

No subsequent milestone or speculative media infrastructure is included in M6.5. Real Telegram delivery remains a founder dogfooding check; automated transport tests use synthetic images and simulated delivery, while live vision tests use invented labelled documents.

**M6.5 local verification:** Migration 0010 applied; checksum and local readiness checks pass. 44 unit checks, 58 isolated PostgreSQL checks and 18 browser journeys pass. The polished Documents desktop/mobile flow was rerun and screenshots inspected. Typecheck, lint and local production build pass. Nine live OpenAI cases passed using labelled synthetic documents, including metadata extraction, fresh-conversation recall, byte-exact originals, native vision fallback, natural deletion, ambiguous duplicates and quoted intent refusal. Mandatory foreign-owner denial covers service and authenticated Web routes. Real Telegram recipient delivery remains a dogfooding check; tests simulate its multipart transport and verify byte equality without sending sensitive real files. Before deployment, provision and independently back up the private encryption key alongside existing database/ledger/backup operational gates. Images sent before this migration require re-upload to preserve their original.

# Sahaay MVP Implementation Plan

**Updated:** 2026-10-04 (Asia/Kolkata). **Status:** Web Chat pivot directed by the user. M1 completed locally; M2 implemented locally; M3 authorized by “go ahead with m3” and implemented locally.

## NEEDED FOR MVP — scope and architecture

Ask · Understand · Research · Remember · Organize.

Web Chat → channel/input adapter → Unified Sahaay Request → one Sahaay agent → tools/memory → channel-independent response → web stream/rendering.

P0: text, images/screenshots, voice recordings/uploads and URLs in normal messages. P1 PDFs/documents/location are not launch blockers. English/Hindi/Hinglish share one pipeline; explicit language instruction overrides configured preference, then follow the current input language naturally. Genuine Hinglish voice evaluation remains deferred at the user’s request; do not claim it has passed.

Keep Next.js 16, TypeScript, Node.js, PostgreSQL, Drizzle/pg, Better Auth, one OpenAI Agents SDK agent with Responses, OpenAI vision/search, Sarvam as the pilot-selected transcription default, and Sahaay-owned SQL memory/items. Pin compatible patches during M1. Use small modules inside one app; split packages only when useful. No dashboard, extra providers, agent framework or additional services.

Meta Cloud API work and existing probes are paused and preserved. Account restriction debugging, incorporation, Business Verification and WhatsApp eligibility do not block Web Chat. No Meta/Twilio/Telegram adapter implementation now.

## Verification conventions

M1/M2 paths and verification scripts now exist; later milestone paths remain planned. Each milestone creates the scripts/suites it uses; test commands must fail for missing suites. Provider mocks verify application behavior; separately authorized live checks establish provider behavior. Never load real credentials in normal unit tests or log them. Common checks after each implementation milestone: `npm run lint`, `npm run typecheck`, `npm run build`.

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

**Local implementation:** The single SDK agent invokes one small argument-free public research tool, backed by OpenAI hosted search using the configured model. Only the current public question and eligible explicitly referenced prior user URLs enter that tool; private history/images are excluded. Clarify missing public details for image-based research. Reject private/credential-bearing and document URLs; do not infer video access. At most one research invocation, four hosted search/open actions, 90 seconds for research and 180 seconds for the overall response. Actual annotations become verified inline links; consulted pages are separately labelled. Source records commit with the final assistant message and expire with its 7-day retention; publication time stays unknown unless supplied. No local page fetcher/crawler or additional service. Focused live comparison, public-URL and PDF-limit checks passed; this is not a broad factual-accuracy guarantee.

**Commands required to verify:** `npm run db:migrate`; `npm test`; `npm run test:integration`; `npm run test:web`; common checks. Opt-in live check: `npm run test:live-research` (requires configured OpenAI access and the local app; only public fixtures, disposable account removed).

## M4 — Remember and Organize

**Classification:** NEEDED FOR MVP.

**Objective:** Explicitly save, recall, correct/delete facts and organize saved items through chat.

**Files/packages affected:** Memory/saved-item/tool-audit migrations; small `src/core/tools/{memory,items}` and SQL repositories; chat confirmations; `tests/memory-items`.

**Dependencies:** M1–M3; explicit persistence/ownership/deletion rules.

**Implementation steps:** Implement Sahaay-owned fact/item records with provenance, timestamps and versions. Retrieve with scoped SQL/full-text/labels/date filters. Require explicit save/update/delete intent; clarify ambiguous targets. Use stable logical action IDs and transactionally idempotent writes with minimal audit evidence. Keep lists/labels and explicit saved/done/archived status simple. Compose save plus research with separately reported outcomes. Prevent deleted facts from being silently reintroduced from retained conversations. No memory dashboard required.

**Tests:** Remember/recall amounts and units; conflicting facts; list/edit/delete; two-user isolation; retry/concurrency duplicate writes; source expiry; injected persistence requests; deletion residuals and partial save/research failures.

**Acceptance criteria:** Requested facts/items are saved once, recalled accurately, editable/deletable in chat, and attributable to their source/time. No automatic transcript memory, background tracking, graph/vector service or persona schemas.

**Commands required to verify:** `npm run db:migrate`; `npm test -- tests/memory-items`; `npm run test:web -- memory-items`; common checks.

## M5 — Product validation and controlled launch

**Classification:** NEEDED FOR MVP.

**Objective:** Make the small assistant ready for initial testers and learn what is useful without expanding the UI.

**Files/packages affected:** Existing conversation/history/error UI; minimal privacy controls; product-event migration/enums; retention/deletion helpers; `tests/{security,recovery,mvp}`; evaluation fixtures and short operating instructions.

**Dependencies:** M0–M4; tester hosting/database/backups, secure auth/recovery and processor/privacy disclosures resolved before inviting testers. No Meta/incorporation/Business Verification dependency.

**Implementation steps:** Finish simple conversation/account deletion and necessary privacy controls/disclosure. Harden existing history, upload/stream/retry errors, quota/cost bounds and safe rendering. Record coarse intent/modality/language/outcome/unsupported-action events in PostgreSQL without raw private content. Verify cleanup, account deletion and backup restore suppression. Run the complete P0/five-verb/language matrix and fix usability gaps. Prepare controlled tester access; no implicit public deployment, management dashboard, analytics service or background monitoring.

**Tests:** Full text/image/voice/URL × relevant capability coverage; Hindi/English/Hinglish; cross-user access/CSRF/XSS/injection; privacy cleanup and delete/restore; interrupted streams/idempotent saves; provider outages/quotas; unsupported execution; enum-only event privacy; end-to-end tester journeys.

**Acceptance criteria:** All P0 inputs and five verbs work with useful context, sourced research and controllable owned memory/items. Initial testers can use the conversation window and history, understand processing/errors and delete their data. Hosting/processor/auth/backup requirements satisfied. P1 and paused channels are excluded from launch gates.

**Commands required to verify:** `npm ci`; `npm run db:migrate`; common checks; `npm test`; `npm run test:web`; `npm run eval:mvp`; `npm run test:restore`; `npm run test:provider -- --suite mvp`; `npm run release:check`.

## DEFER UNTIL VALIDATED

WhatsApp/Meta, Twilio and Telegram adapters; Meta restriction debugging, incorporation and Business Verification; PDFs/documents/location; settings/memory dashboards; Temporal, Redis, vector/graph databases, Gmail/Calendar/Contacts, Composio, Mem0/Supermemory, extra research providers/crawlers, multi-agent/model routing, custom frameworks, Autopilots/monitoring, reminders/invoices, payments/bookings and other external actions.

M0 decisions and revised plan were shown; the user authorized M1 on 2026-10-04. Local PostgreSQL 17 runs through the repo-local development launcher (no Docker/system service); Better Auth email/password is configured for local sign-in, with verified email/recovery required before testers. M1 is the first usable browser conversation; M2 completes P0 multimodal understanding. The pivot simplifies the channel, not the product scope.

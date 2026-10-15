# Sahaay MVP Implementation Plan

## M9 — Google Workspace (authorized 2026-10-13)

Mobile completion is two-phase: the callback stores an encrypted provisional grant for ten minutes and returns a random one-time completion reference (not Google tokens). The initiating app retains an account-scoped transaction ID in SecureStore, validates the HTTPS return path/transaction, and redeems the reference through the authenticated `/api/connections/google/complete` endpoint. A forwarded OAuth URL cannot be finalized by polling connection status: grants are not listed or usable before redemption. Signed-out/cold-start returns are retained briefly and redeemable only after the same Sahaay account signs in. Disconnect changes the owner revision and invalidates pending transactions/completions; a callback already exchanging a code cannot resurrect access. Callback/completion references must be redacted in proxy logs as well.


M9 now means Gmail + Google Calendar through the existing Web/React Native clients and shared agent. Previous deferred first-action labels are superseded for this scope only. M8 native release gates remain outstanding; this milestone does not silently mark them complete.

1. **Inspection/design:** Completed. Next/Better Auth/canonical user/pg/shared SDK agent, owned channel APIs, AES-GCM envelope, fixed product events and existing worker reused. There was no durable external approval framework; one shared ActionApprovals service extends the existing user-control policy rather than pretending one already existed.
2. **Persistence/credentials:** Implemented and isolated PostgreSQL-tested. Additive migration `0013_google_workspace.sql`: owned Google connections/credentials, expiring OAuth transactions and action approvals, indexes/composite FKs/subject uniqueness and allowed event enums. It has NOT been applied to shared Supabase by this work. Existing migrations are unchanged. Tokens/proposals use existing artifact key with distinct purposes; no new secret-key variable.
3. **OAuth/accounts:** Implemented; synthetic SDK tests cover PKCE/state, expiry/replay/wrong owner, actual granted scopes, subject mismatch, multiple accounts, omitted refresh token, concurrent refresh and invalid_grant. Connect is separate from Sahaay sign-in. Real Google consent/token lifecycle remains unverified.
4. **Gmail:** Implemented on-demand search/page, selected messages/threads/MIME/plain text, grounded agent summarization, draft/send/reply proposals and approved execution. Ten IDs/page, eight messages/thread, 512KB MIME limit, 16KB displayed body; no bulk import or attachments download. Uncertain sends are unknown, never automatically replayed. Live Gmail read/draft/send/reply remains pending.
5. **Calendar:** Implemented calendar selection/date-filtered events/freebusy/details, Temporal/timezones/all-day dates, approved create/update/delete, access roles/ETags/explicit occurrence-vs-series. At most 32 days/20 events/page/ten freebusy calendars. This-and-following recurrence edits and updating events with more than twenty attendees require Google UI; never silently expand/delete series. Live Google Calendar validation remains pending.
6. **Web UI:** Implemented Settings → Connected Accounts, scope upgrades/reconnect/disconnect/status and exact readable action review. Unconfigured state/authentication/native-origin access/CSRF/exact decision/callback rejection/responsiveness passed two browser tests. Configured real accounts and consent redirects remain pending.
7. **Mobile UI:** Implemented shared API contracts/account-scoped queries, settings entry, permission management, external authorization browser, verified HTTPS return route and exact action review. Expo SDK57 installed native source supports HTTPS ASWebAuthenticationSession callbacks on iOS17.4+; older iOS browser-close/foreground fallback. HTTPS app/universal-link association endpoints/config added, with signing values supplied by owner. Code/type checks do NOT establish real signed-device OAuth/cancel/cold-start behavior; these remain release blockers.
8. **Quality/security/docs:** 63 unit tests, 19 isolated M9 PostgreSQL tests, two focused browser tests passed at initial verification. Strict full-repo typecheck and lint pass. Further regression/export/build results are recorded below as run. No real Google or device verification claim; no Google verification approval or production-ready claim.

### Required founder setup (Google Cloud and hosting)

1. Create/select one Google Cloud project at https://console.cloud.google.com/ . Enable **Gmail API** and **Google Calendar API** in API Library. This does not change Sahaay login or require migrating Better Auth.
2. Configure Google Auth Platform **Branding/Audience/Data Access**. Choose External for ordinary consumer Google accounts; use Testing and add the Google email accounts you will test. Set Sahaay name, support/developer contact, homepage and a publicly reachable `/privacy` policy explaining requested data, purpose and OpenAI processing. A production verified app may require an owned/verified domain; confirm authorized domains with Google before public launch.
3. Create **OAuth client → Web application**. The backend owns the flow for both Web and mobile; no client secret or separate token exchange goes into the native app. Configure exact authorized redirect URIs:
   - Local Web: `http://localhost:3000/api/connections/google/callback` (if using `127.0.0.1` as BETTER_AUTH_URL, register that exact variant instead).
   - Current deployed backend: `https://sahaay-bjza.onrender.com/api/connections/google/callback`.
   - Any later custom domain: its exact HTTPS origin + `/api/connections/google/callback`.
   Redirect paths/hostname must match backend BETTER_AUTH_URL exactly. Never use arbitrary user-supplied URLs or `sahaay://` as Google callbacks.
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to backend local environment and Render. Client ID identifies the OAuth app; client secret authenticates the backend exchange. Never paste secrets into chat, mobile env or source control. Keep the existing matching `SAHAAY_ARTIFACT_KEY`; it now also encrypts credentials/proposals with separate authenticated purposes. Do not replace it for this milestone. Redeploy/restart after configuration.
5. Apply reviewed migration `npm run db:migrate` to the intended shared database, then deploy this backend and Web code. Local/prod share Supabase, so applying locally changes the same schema. Back up before production changes; don't run database tests against this shared connection. There are no new Google background jobs or mailbox sync workers to configure.
6. Connect/Add Google account requests identity and all supported Gmail/Calendar permissions together, so users choose access on Google's granular consent screen. There is no separate Sahaay checkbox picker. Google may grant only some scopes; the UI reports actual grants and offers Review permissions in Google for the same account. Previously granted Google permissions can be cumulative; reducing them requires disconnect/revocation and fresh authorization. A scope grant never executes a pending write: ask for a fresh proposal after upgrading and approve it. Required scoped capabilities:
   - Identity: `openid`, `userinfo.email`, `userinfo.profile` (Google's canonical forms of email/profile).
   - Gmail read: `gmail.readonly`; drafts: `gmail.compose`; sending: `gmail.send` (compose also permits sending at Google, while application confirmation remains mandatory). Replying also needs read access to its source message.
   - Calendar read: `calendar.events.readonly`, `calendar.calendarlist.readonly`, `calendar.events.freebusy`. The last two are required by official list/freebusy endpoints and avoid full-calendar access.
   - Calendar write: `calendar.events`, `calendar.calendarlist.readonly`. No full Gmail/Calendar, Drive, Contacts or other connector scope.
   Full prefixes are `https://www.googleapis.com/auth/`. Scope references: https://developers.google.com/workspace/gmail/api/auth/scopes , https://developers.google.com/workspace/calendar/api/auth , https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list and https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query .
7. Testing is not production approval. External Testing refresh tokens for these scopes normally expire after seven days; add test users and expect reauthorization. Gmail readonly/compose are restricted; send and applicable Calendar scopes are sensitive. Public launch requires Google's applicable OAuth verification and potentially a restricted-scope security assessment because the backend/model processes restricted data. Review Limited Use, processor agreements and truthful disclosures; no training of generalized models or unrelated analytics with Google data. References: https://developers.google.com/identity/protocols/oauth2/web-server and https://developers.google.com/terms/api-services-user-data-policy . No verification bypass is implemented.
8. For TestFlight/iOS mobile authorization: after paid Apple membership/signing, set backend `GOOGLE_MOBILE_APP_ID=<actual Apple Team ID>.com.sahaay.app`. Set mobile public `EXPO_PUBLIC_GOOGLE_LINK_HOST=sahaay-bjza.onrender.com` (or actual backend HTTPS hostname) matching EXPO_PUBLIC_API_URL. Rebuild the native app with Associated Domains; deploy `/.well-known/apple-app-site-association` and verify Apple's association. Google completion URL is `https://<backend>/connect/google/complete`, never a token-bearing custom scheme. Backend status after return is authoritative. On iOS below17.4 close the browser and return to the app if automatic return is unavailable.
9. Android verified links need the actual signing SHA-256 fingerprints in backend `GOOGLE_ANDROID_CERT_FINGERPRINTS` (comma-separated uppercase colon format) and the same mobile link hostname. Deploy `/.well-known/assetlinks.json`; rebuild/install and verify app links. The current mobile flow requires valid iOS association or Android fingerprint configuration; do not mark Android OAuth validated until the actual signed app/association/return is tested.
10. Suppress/redact OAuth callback query strings in Render/proxy/APM access logs. Application errors/events never log codes/tokens/content, and local Next callback request logging is disabled. Confirm TLS/database/key/backup/email operational gates already documented. Disconnect distinguishes local removal from confirmed Google revocation; if remote revocation fails, the UI instructs users to revoke third-party access in Google too. Restoring backups requires reconnecting all Google accounts and reviewing new proposals.

### Real-provider/device acceptance matrix (not yet passed)

Use synthetic mail/events and your own test Google accounts: Web connect/read Calendar and Gmail, partial grant/upgrade/denial, two accounts/ambiguity, token expiry/revocation/reconnect, cross-platform display and disconnect; selected message/thread summaries; approved draft/send/reply without duplicates after interruption; calendar selection/all-day/DST/recurring instance and full-series confirmation/ETag conflict/freebusy errors; malicious email body cannot confirm or execute any action or send private data to public research. On signed iOS/Android test OAuth foreground/background/cancel/interrupted/cold start, HTTPS association and server status after return. Real credentials/signing/Google verification remain external setup blockers; no public deployment or Google send has been performed by this implementation.

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

## M8 — Sahaay Mobile (authorized 2026-10-09)

This amendment supersedes the old M8 First Connected Capability label only. Existing M6.5/M7 behavior is reused. Build one native client, not a second backend.

1. **Foundation:** Expo SDK-compatible workspace, strict TypeScript, typed API client, Better Auth Expo integration retaining canonical accounts, four-tab shell/theme/branding and session restoration/logout. Source implemented; shared identity/native-origin API, typecheck and lint verified. Device session restoration/sign-in remain native release checks.
2. **Chat/media:** Existing conversations and NDJSON events, stable request IDs, persisted-state reconciliation after interruptions, image/camera/audio input and sources. Source implemented, API streaming/duplicate/truncation unit checks pass; actual microphone/camera/background journeys pending.
3. **Saved/Documents:** Owned state API over existing repository, bounded search/details, authenticated cloud originals and confirmed deletion. Source implemented over existing services; owned state API test passes. Native preview/share/delete journeys pending.
4. **Native sharing:** Swift iOS extension + Android intents, protected bounded drafts, preview/instruction, signed-out recovery, multiple shares and account isolation. Native source and generated targets exist. Durable draft submission references and signed-out ownership recovery implemented. Actual native compilation/lifecycle tests pending; release blocker.
5. **Inbox/push:** Shared M7 lifecycle actions, multi-device registration/preferences and durable delivery/receipt processing in the existing worker. Implemented; local ownership/concurrency/rotation/uncertain-send/retention tests pass. Real APNs/FCM remains pending.
6. **Quality:** Regression/type/lint/ownership tests, native builds and cold/warm/signed-out sharing on both platforms, physical-device notification verification. Pending.

No Expo/EAS or Apple/Google signing setup exists yet. User authorized local builds with provisional com.sahaay.app. Signing/remote push verification remains external setup, not a reason to defer independent implementation. No store submission or deployment is authorized by this build. Document actual tests/results as each phase is verified.

### M8 verification and local-build handoff — 2026-10-09

M8 remains **in progress, not release-ready**. Source implementation is not proof of native runtime behavior.

- Root `npm run typecheck` now includes mobile; lint includes mobile/shared client. Both pass. 57 unit tests and 70 isolated PostgreSQL integration tests pass (10 new mobile cases). The authenticated native-origin browser test passes, including foreign-state denial, logged-out denial, unknown-origin refusal and rejection of analytics private-content fields.
- Existing browser regression run: 17/19 pass. Two existing privacy-dialog journeys fail because their expected Privacy button is deliberately commented out at the user's request. M8 does not restore it. Backend privacy/backup tests pass. This UI/test inconsistency predates mobile and remains explicit.
- Expo iOS and Android JavaScript exports pass; local-preview Next production build also passes. iOS and Android prebuild generate native projects; Android manifest includes SEND/SEND_MULTIPLE and disables backup. Native module is autolinked. These are **not** installed-app tests.
- Xcode 27.0 and the iPhone 18 Pro/iOS 27.0 simulator are installed and available. CocoaPods 1.16.2 resolves the older tool's share-target incompatibility. The app and iOS share extension compile successfully (zero errors, one Expo build-script dependency warning). Initial startup crashed because iOS 27 requires scene lifecycle adoption; the source prebuild plugin now configures Expo's maintained scene delegate/factory provider. Rebuilt, installed and opened successfully in Device Hub; the authenticated Saved screen renders existing backend state. Native sharing lifecycle, interrupted requests and physical-device checks remain pending. Physical share-extension signing also requires an Apple team/App Group provisioned for `com.sahaay.app` and `group.com.sahaay.app`.
- Android Java 17 is selected. The compile attempt stalled downloading NDK 27.1.12297006; stopped before compilation. Install that NDK/SDK 36 in Android Studio, then retry. No APK has been verified.
- EAS project and APNs/FCM credentials do not yet exist. Real token registration, delivery, tap routing, rotation, logout and two-device notifications remain gates. Expo receipts mean provider handoff, not proof the user saw/read a reminder.
- Dependency audit reports 29 transitive advisories (14 moderate, 15 high), mostly Expo/Metro/native build tooling. Several suggested fixes downgrade Expo or change SDK major versions and were not forced. Review compatible upstream patches before release; no clean security-audit claim is made.
- Migration 0012 was tested in isolated schemas/test databases and has now been applied to the intended local `sahaay` database at `127.0.0.1:55432`, preserving existing records. Supabase migration 0012 was subsequently applied with explicit user approval on 2026-10-09. Browser testing can use `SAHAAY_BROWSER_TEST_DB=sahaay_test_<suffix>` to isolate migration development. Never edit an already-deployed migration.

Local steps:

1. Run `npm install` at repository root. Configure backend as already documented and run `npm run db:migrate` against the **intended local database**, then `npm run dev`. Main app identity/records remain unchanged.
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env`. Set only `EXPO_PUBLIC_API_URL`: iOS simulator can use `http://127.0.0.1:3000`; Android emulator can use `http://10.0.2.2:3000`. Physical phones use an accessible HTTPS backend with the new routes/migration. Mobile must never receive database, AI, encryption, bot or auth secrets.
3. Open Xcode, complete its first launch/license and install a simulator. Ensure Ruby 3.2+ and CocoaPods 1.16.2+ are on PATH (older CocoaPods cannot read the share-extension target), then run `npm run mobile:ios`. On Android install SDK 36, NDK 27.1.12297006, an emulator and Java 17, then run `npm run mobile:android`. These are development builds, **not Expo Go**; incoming sharing needs the custom native module/extension.
4. Run `npm run mobile:dev` for later development-client sessions. For push later, provision an Expo project/credentials; set matching mobile `EXPO_PUBLIC_EAS_PROJECT_ID` and backend `SAHAAY_EXPO_PROJECT_ID` (optional backend `SAHAAY_EXPO_ACCESS_TOKEN`). Enable notifications explicitly in Home.

Release-blocking manual matrix on both iOS and Android: same Web account sign-in/session restore/logout; text/image/camera/audio/context/sources; interrupted stream and app restart without mutation replay; saved state/Documents across Web/Telegram/mobile with foreign-owner denial and deletion; URL/text/one/multiple-image sharing with app cold/warm/signed out, multiple drafts, account switching, rejected oversized content and expiry; document cleanup/app-switcher privacy; foreground/background/tapped notifications, two devices, token rotation, disabled/logout/paused users and cancelled reminders. Record actual device/build outcomes here before marking any gate complete. iOS extension captures a protected draft and completes normally; user opens Sahaay to review/send, rather than an unsupported forced app launch.

Home polish verified in the iOS 27 simulator: logo/name share one row; one status-aware reminder-alert control replaces simultaneous enable/disable buttons. Unconfigured push is clearly unavailable while Inbox remains usable. The initial `.env.local` loopback override was identified and subsequently replaced with the approved Supabase configuration using `.local/supabase-ca.crt`. Local background jobs are disabled so Render remains responsible for reminder delivery and retention. Run database tests only against an explicitly selected isolated local/test database, never this shared production connection.

M8 refinement (2026-10-09): Chat history moved into a separate native modal sheet; message list flexes independently of composer. Tab navigation uses consistent Lucide icons. Shared agent account profile added through an owned canonical-user query; 11 isolated mobile integration checks pass, including cross-user profile lookup. Supabase migration 0012 applied with user approval; local `.env.local` now targets the same verified-TLS Supabase database with local background jobs disabled and email verification enabled. Old local sessions need re-authentication against the shared database. Live push remains unconfigured.

Verification: shared agent used the synthetic account name in a live OpenAI check; the copied Render artifact key decrypted both original and understanding of an existing Supabase Document without displaying plaintext. iOS rebuild/install succeeded (0 errors, existing Expo build-script warning). The user signed in to the Supabase account after the switch. Authenticated native chat/image response was observed; opening and closing the separate conversation sheet preserved the active messages. Consistent tab icons and composer spacing verified visually. Type checks, focused lint, 57 unit tests and 11 isolated local integration tests passed.

### First internal TestFlight build (preparation, not uploaded)

Expo project created by the founder: `@vnaysngh94/sahaay`, project ID `e2693b35-ca7b-4539-a57b-c23512fa2da3`. Dynamic `app.config.ts` now explicitly records owner/project ID because EAS init cannot automatically edit it. Local Expo public config resolves the expected project. Apple signing team remains unset until membership is active; no build/upload is implied by project creation.

Attachment composer refined to compact horizontal thumbnail/remove chips with 44px accessible removal targets; removal disabled during send. Production EAS profile uses store distribution, production environment, automatic build-number increments and the deployed HTTPS API origin. `APPLE_TEAM_ID` supplies the signing team once enrollment is active. The apple-targets plugin already declares the share-extension credentials; do not duplicate that declaration. Individual Apple enrollment is sufficient; no business entity is needed. User has not enrolled yet, so signing/upload remain blocked on membership activation, Expo project setup and account credentials. No App Store/TestFlight upload has occurred.

1. Enroll via Apple Developer as **Individual** with your legal name; complete identity verification/agreement/payment yourself. Wait for membership activation. App Store seller name will be your legal name; app name remains Sahaay.
2. Create/sign in to an Expo account. From `apps/mobile`, run `npx eas-cli@latest login`, then `npx eas-cli@latest init` to link the project. Record the actual EAS project UUID in `EXPO_PUBLIC_EAS_PROJECT_ID` and the actual Apple team in `APPLE_TEAM_ID`; configure these non-secret values in the EAS production environment too. Never copy backend `.env` secrets into mobile.
3. Deploy the M8 backend/auth changes to Render before testing mobile against it. Supabase schema alone does not deploy mobile routes or the Better Auth Expo plugin. Confirm email verification, native-origin login, owned API routes and existing Documents work on the deployed backend.
4. In App Store Connect create the Sahaay iOS app record with the registered `com.sahaay.app` identifier (verify availability before registration). The share extension `com.sahaay.app.share` and App Group `group.com.sahaay.app` need the same signing team. Supply the App Store Connect numeric App ID as `submit.production.ios.ascAppId` once created. Do not invent identifiers/account IDs.
5. Run `npx eas-cli@latest build --platform ios --profile production`; let EAS manage distribution credentials for both app targets. Review the archive/signing result. Then `npx eas-cli@latest submit --platform ios --profile production --latest` uploads the chosen production archive to TestFlight, not public App Store release.
6. After Apple processing, resolve export-compliance questions truthfully (review the native encrypted share storage; do not set `usesNonExemptEncryption=false` without checking applicability). Add yourself to an internal TestFlight group, install TestFlight on a physical iPhone and test shared-account login, image/audio, cold/warm/signed-out sharing, Documents and deletion. External testers require Beta App Review and a dedicated reviewer login with synthetic data.
7. Remote reminder notifications remain unavailable until EAS/APNs/backend push configuration and real-device verification are completed. Do not describe the beta as having working push before that test.

References: https://developer.apple.com/help/account/membership/enrolling-in-the-app/ and https://docs.expo.dev/submit/testflight/ . Native attachment visual verification for this refinement awaits re-authentication in the simulator; typecheck and focused lint pass. Production iOS JavaScript export also passes; this is not a signed archive or device verification.


### M9 final internal verification — 2026-10-13

The full unit suite passes 72 tests (including five mocked mobile authorization-state/recovery cases). The isolated PostgreSQL suite passes 94 tests, including 23 Google cases: authorization replay/expiry/owner denial, actual scopes, encrypted tokens, refresh preservation/concurrency, multiple accounts, exact approvals, unknown sends, provider parsing/calendar operations, backup invalidation, disconnect-versus-callback race and two-phase native completion ownership/replay/expiry. Test connection was a separately created loopback PostgreSQL instance on port55433, never Supabase. Synthetic Telegram fixtures require `SAHAAY_REQUIRE_VERIFICATION=0` only in that test process; the initial run inherited the local verification requirement and failed those unverified fixtures. Application verification remains unchanged.

Three focused browser tests pass: real authenticated route/origin/exact-decision/callback checks and responsive unavailable setup, plus mocked two-account/permission/unknown-approval presentation. The final 390px synthetic account screenshot was inspected and button/label styling corrected to match Sahaay. These browser mocks do not establish live OAuth. Strict repo typecheck/lint, local-preview production Web build and iOS JavaScript export pass. The curated PostgreSQL subprocess environment now carries non-secret NODE_ENV to satisfy native/Next global ProcessEnv typings without passing secrets.

No Google client ID/secret, iOS Google association ID or Android signing fingerprints are configured in the inspected local environment. Real Google OAuth, Gmail/Calendar effects, model-to-live-Google journeys, signed iOS/Android lifecycle and Google verification/security assessment remain unverified and release-blocking. Migration0013 is reviewed/tested but has not been applied to shared Supabase. No deployment, real mail send, Calendar invitation, native signed archive or store upload occurred. M9 is internally implemented/tested, not verified or production-ready. Existing transitive dependency audit advisories remain a separate release review; no clean full dependency-audit claim is made.

Final regression note: one existing memory case timed out during a long-running run; the subsequent full isolated rerun passed all 94 checks, and a final focused rerun passed all 23 Google cases after the provisional-grant revision guard. No timeout increase or production setting change was used.

The final unit suite also verifies that a private native Google completion reference is rejected before public web research. Final strict typecheck/lint and focused Google ownership tests pass.

Calendar-after-Gmail regression (2026-10-14): Google incremental authorization can return previously granted supported scopes when a connection is started without a selected connection ID. The callback now accepts cumulative supported Gmail/Calendar permissions while rejecting unsupported scopes and requiring verified identity. A regression verifies Calendar adds to the same Gmail account without duplicating it. All 24 Google integration checks pass against a temporary isolated local PostgreSQL instance; full typecheck and lint pass. Callback failures show fixed, actionable messages for recognized failure categories without reflecting raw provider details. Real user retry remains pending; this does not claim the observed live error was conclusively diagnosed from the generic screenshot.

Connected Accounts usability (2026-10-14): Web and mobile show Gmail/Calendar connection states separately per account, hide redundant connect/reconnect controls for healthy granted services, expose one reconnect action only when account access needs restoration, and group optional write permissions behind an expandable control. The initial service buttons appear only before an account is connected; additional accounts use a distinct action. A focused browser regression with synthetic multiple-account data verifies granted/missing/reconnect states, expandable write permissions, uncertain-action handling and 390px layout. The rendered Web capture was inspected; no live Google status or native simulator visual verification is claimed.

Consent UX refinement: supersedes the initial read-only/service buttons and expandable upgrade controls above. One Connect Google account/Add another Google account action requests the supported scopes; users choose granular permissions in Google's own consent screen. Web/mobile show Granted/Not granted per capability from the actual token grant, with one Review permissions in Google action for existing accounts. Google controls consent layout, grouping and previously approved scopes; Sahaay does not reproduce or promise an identical checkbox layout. Google Cloud Data Access must include gmail.compose, gmail.send and calendar.events as well as the earlier read scopes before testing the full permission flow. No Drive/Docs/Sheets/Slides/Tasks/contacts permissions are requested.

Web disconnect dialog: replaces browser confirm/alert with the platform HTML modal dialog, themed account identification, explicit Cancel/destructive Disconnect actions, busy protection, inline failures and an accessible outcome notice including unconfirmed Google revocation. Cancellation/Escape sends no mutation; focus starts on Cancel, keyboard focus cycles within the dialog and returns on cancellation. Desktop light/dark and 390px renders were visually inspected using synthetic accounts; browser regression verifies failure recovery and account removal. No live account was disconnected during verification.

Inline action review: Web and mobile chat render server-owned, conversation-scoped action cards with account, recipients/event scope and immutable content. Approval/cancellation submits only the action ID and decision through the existing ownership/expiry/idempotency boundary; arbitrary chat text is not treated as confirmation. Receipts update in chat; uncertain outcomes have no resend control. Settings remains an alternate review surface; Telegram currently uses the authenticated review surface rather than bot approval buttons. Migration0015 adds owned request-to-action links so repeated proposals can appear in more than one conversation without duplicating execution. It has not been applied to shared Supabase. Encrypted proposals/receipts follow the existing seven-day retention, ten-minute approval expiry, disconnect erasure and backup policy; stale executing rows are marked unknown before cleanup so they cannot be retained indefinitely. Isolated integration tests cover conversation/owner isolation and action reuse; synthetic Web review/receipt rendering was browser-tested and the mobile-width Web render inspected. Native simulator review remains unverified.

Duplicate-preview correction (2026-10-15): pending/executing/uncertain actions remain expanded for exact review; cancelled/completed/failed/expired records render as compact history entries with on-demand details on Web/mobile. This preserves evidence rather than deleting history or merging distinct proposals by approximate text. Web/mobile proposal tool results return a receipt and chat-review instruction instead of echoing the full payload/settings path; provider instructions ask for one short acknowledgement, leaving the authoritative preview to the card. Existing assistant message text is not rewritten. Telegram retains its full review details and authenticated Web fallback. Synthetic browser checks verify one expanded pending card, collapsed history and successful receipt expansion; all 28 isolated Google tests, typecheck and lint pass. No real Gmail writes were performed; native visual verification remains pending.

Further correction supersedes the separate chat history block above: approvals now include owned request associations and render at their source assistant turn on Web/mobile, replacing the duplicate prose in the presentation layer without rewriting stored messages. Reused proposals render once at their original visible turn; other linked turns get a short reference. Completed actions show a receipt with optional sent details, and cancelled/expired/failed actions show a short status without another full preview. Chat no longer appends all receipts after the conversation. Scoped definition-list styling resets default indentation and separates labels/content. Synthetic browser testing proves original prose is replaced, only the linked action is shown, and the completed receipt expands correctly; the reformatted card was visually inspected. Existing 28 isolated Google checks and typecheck/lint pass. No migration or retention change is required; native visual verification remains pending.

Disconnect privacy correction (2026-10-14): deliberate disconnect now deletes the owned Google connection/profile row (including name/email/subject/scopes) instead of retaining a disconnected profile. Credentials and action proposals are erased; existing OAuth owner revision protection prevents delayed callbacks from recreating access. Backup restore also removes Google profiles. Migration `0014_remove_disconnected_google_accounts.sql` removes profiles retained under the old behavior and invalidates their owners' pending OAuth attempts; it has not been applied to shared Supabase. Old disconnected records are immediately excluded from listing and cannot be explicitly reauthorized. Reauthorization of an existing account uses Google's `login_hint` and consent prompt; the verified Google subject must still match the original connection, regardless of account chooser behavior. Normal new connections may choose any Google account. Content-free analytics and previously retained conversations/backups follow their existing retention policies; disconnect does not claim to erase those independently retained copies.

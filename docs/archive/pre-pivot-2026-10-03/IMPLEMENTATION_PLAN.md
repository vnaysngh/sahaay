# Sahaay Implementation Plan

**Date:** 2026-10-03 (Asia/Kolkata)  
**Status:** Overview approved with user amendments; implementation details remain planned. No product implementation started.  
**Prerequisite:** Completed `ARCHITECTURE_REVIEW.md` and `STRATEGY_REVIEW.md`; M0 records scope and applicable decision dispositions.

## Launch principle and boundaries

**Design for the moat. Do not build the moat yet.**

**NEEDED FOR MVP:** Hindi, English and Hinglish text and incoming WhatsApp voice notes, supporting four general actions: Calendar lookup, one-time reminder, general email search and approved email send. Include verified identity, Google connections/Contacts resolution, exact approvals, small web controls, minimal SQL context, history, durable reminders/approval waits and safe provider execution. Keep one OpenAI Agents SDK agent, native tools, PostgreSQL, Redis's ephemeral role, Temporal and API/web/one worker. Text replies suffice; no TTS/live calls or custom speech model. Exactly one composed meeting/email/reminder workflow is required (M10); Calendar creation is a stretch goal outside the launch gate.

**DEFER UNTIL VALIDATED:** Sophisticated Personal Graph, generalized Autopilots/monthly invoice obligations, learning/prediction, model routing, skills ecosystem, advanced proactive intelligence, graph databases, extra infrastructure and India-wide integrations. No multi-agent architecture, custom agent framework, arbitrary browser automation, UPI/payments, travel booking, DigiLocker or ONDC. Typed domain proposals and an OpenAI invocation module provide reasonable seams without speculative adapters.

**DEFER UNTIL VALIDATED:** Invoice-related workflows are explicitly outside MVP under accepted user correction ADR-019, including invoice follow-up, invoice extraction and monthly collection. The earlier five-workflow/text-only proposal is superseded; voice is required, not deferred. Images/documents, Calendar update/cancel, recurring reminders/rich lifecycle UI, persisted draft/standalone reply management, semantic/behavioral memory and broad proactive detection remain separately proposed deferrals. No invoice dependency is introduced elsewhere in this plan.

## Working and verification conventions

Milestones are small, independently testable slices with a stop point. Later slices depend on earlier completed modules, but each uses fakes where unfinished channels/providers would otherwise block testing. Real providers use dedicated test accounts/recipients only. Provider eligibility/public-verification uncertainty can coexist with offline development, but it blocks affected live acceptance and launch.

The workspace currently contains documents only: no manifest, test suite, schema or app exists. Paths and commands below are **planned**, not executed. M0 selects/pins a compatible Node/npm-workspace, TypeScript, API/web/auth/schema/migration and test stack. Proposed command contract: `npm test -- tests/<slice>` invokes the selected test runner's actual suite, fails on missing tests, and never substitutes an empty pass. Adjust every command explicitly in M0 if another package manager/runner is selected. Browser tests use `npm run test:web -- <slice>` where introduced. These are ordinary test scripts, not a custom framework.

M1 introduces `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run dev`, `npm run infra:up`, and `npm run infra:down`; Default Compose/dev startup starts PostgreSQL/Redis and API/web without Temporal or a worker connection. M6 introduces `npm run infra:durable:up` for Temporal, `npm run dev:worker` and replay tests. Initial read verification must pass with Temporal stopped; durable suites use the explicitly enabled durable profile. M2 adds `npm run db:migrate` and `npm run db:migrate:check`. Before integration verification from M2 onward, run `npm ci`, `npm run infra:up`, `npm run db:migrate`. Use isolated test databases and, from M6, isolated Temporal namespaces; stopping infrastructure must not delete durable data. Do not expose secrets in commands.

M3/M7 introduce opt-in `npm run test:provider -- --suite <name>` against dedicated fixtures. Never run it against ordinary users by default. Common lint/typecheck/build gates apply to changed code; milestone-specific suites below prove the behavior. No performance claims or launch dates are invented before measurements.

## M0 — Record the small-launch boundary and immediate decisions

**Classification:** **NEEDED FOR MVP**.

**Objective:** Record the accepted user language/voice/invoice correction and dispose remaining launch proposals and enough foundational decisions to begin safely, without designing deferred systems.

**Files/packages affected:** `docs/{PRD,ARCHITECTURE,WORKFLOWS,SECURITY,ROADMAP,DECISIONS,STRATEGY_REVIEW,ARCHITECTURE_REVIEW,IMPLEMENTATION_PLAN}.md`; a short proposed `docs/PROVIDER_READINESS.md`.

**Dependencies:** Completed reviews; accepted user priorities ADR-019/020; disposition of remaining ADR-016–018 technical/scope proposals. Do not re-request approval for the language/voice/invoice priorities already given. No product implementation dependency.

**Implementation steps:** Record the approved overview/amendments, synchronous-first order, sole composed workflow and scope/ADR-008 timing changes and approval-by-default posture; choose a small supported toolchain/auth/migration/test stack; specify user/account ownership and minimal-data retention. Begin Google scope/public-readiness and WhatsApp assistant-eligibility/template checks. Choose launch account behavior and user timezone policy. Record later safety decisions as gates at their relevant milestones rather than waiting for a complete future blueprint. No semantic store, graph schema, Autopilot API or model-routing selection.

**Tests:** Manual consistency review against the current-launch matrix and deferred table; confirm original baseline versus accepted amendments is unambiguous and provider uncertainty is recorded honestly.

**Acceptance criteria:** Launch scope disposition is explicit; foundational stack/identity/storage choices are sufficient for M1/M2; deferred decisions do not block reads. Live Google/WhatsApp gates have owner/status/evidence, without claiming readiness from API availability.

**Commands required to verify:** `rg -n 'ADR-01[6-8]|Status|NEEDED FOR MVP|DEFER UNTIL VALIDATED' docs/DECISIONS.md docs/STRATEGY_REVIEW.md`; `rg -n 'amendment|proposed|launch' docs/PRD.md docs/ARCHITECTURE.md docs/WORKFLOWS.md docs/SECURITY.md docs/ROADMAP.md`; manually verify decisions and scope matrix. These searches are inspection aids, not automated acceptance.

## M1 — Minimal workspace and local services

**Classification:** **NEEDED FOR MVP**.

**Objective:** Boot a reproducible API and small web shell with PostgreSQL/Redis; do not require Temporal or worker startup for initial requests.

**Files/packages affected:** Root manifests/lockfile/configuration, `README.md`, `.env.example`, `.gitignore`, CI; `apps/{api,worker,web}`, `packages/shared`; `infrastructure/compose.yaml`; `tests/foundation`.

**Dependencies:** M0 toolchain choices.

**Implementation steps:** Configure TypeScript/workspaces and package imports; minimal health endpoints/web shell; PostgreSQL/Redis Compose health checks; reserve the existing worker/Temporal configuration for M6 without connecting them during API bootstrap; env validation and safe logs; CI common gates. Create domain packages only when needed. No broker, container orchestration platform or service-per-package design.

**Tests:** Configuration failure/redaction, build/import resolution, API/web/database health and successful startup with Temporal absent.

**Acceptance criteria:** Clean install/build and local service startup work; missing secrets fail with safe messages; no fake/test auth path is enabled in production.

**Commands required to verify:** `npm install` once to generate the lockfile; `npm ci`; `npm run infra:up`; `npm run lint`; `npm run typecheck`; `npm run build`; `npm test -- tests/foundation`; `npm run dev` for startup smoke verification.

## M2 — Scoped product storage, sessions and credentials boundary

**Classification:** **NEEDED FOR MVP**.

**Objective:** Authenticate one user and ensure all product records are user/account scoped from the start.

**Files/packages affected:** `packages/{db,auth}`, `apps/api` auth/profile/conversation routes, `apps/web` login/profile shell; `tests/identity-storage`.

**Dependencies:** M1; D06 identity/schema and D11 minimal retention/key handling before personal-data storage.

**Implementation steps:** Migrations for users/identities/account metadata, profile/preferences, messages and audit; scoped repositories/ownership constraints; selected standard secure session library/cookies/CSRF/logout; user timezone; credential encryption module with externally configured keys. Define test-only fixture identity safely. Keep provider consent separate from login; no custom auth platform. Default account semantics must be explicit.

**Tests:** Fresh/repeated migrations, IDOR/cross-user read/write, spoofed user/account payload, session expiry/logout/CSRF, disabled user, secret leakage and DB role access. Redis restart leaves stored identity intact.

**Acceptance criteria:** Authenticated context is server-derived; users cannot access others' data; non-superuser DB credentials; timezone and minimal-data lifecycle recorded; raw credentials cannot appear in product responses/logs.

**Commands required to verify:** `npm run db:migrate`; `npm run db:migrate:check`; `npm test -- tests/identity-storage`; `npm run test:web -- auth`; `npm run typecheck`.

## M3 — Google connections and native read tools

**Classification:** **NEEDED FOR MVP**.

**Objective:** Implement the Google reads required by Calendar lookup, email search and recipient resolution.

**Files/packages affected:** `packages/auth` Google consent, `packages/tools/src/{credentials,gmail,calendar,contacts}`, `packages/db` account scopes, `apps/api` connection routes, small web connection controls; `tests/google-read`.

**Dependencies:** M2; D07 launch scope/key/refresh decisions and Google test setup. Public verification remains a separate launch gate.

**Implementation steps:** Incremental OAuth/state validation/PKCE as supported; bind connected account to initiating user; encrypted refresh lifecycle; disconnect/revoke and scoped tool checks. Add Calendar list/search, Gmail search/read/thread, Contacts search through native APIs, bounded pagination/output and timeout/read retries. Normalize provider content as untrusted. No Calendar writes or Gmail-persisted draft scope solely for future use.

**Tests:** OAuth state/account mismatch, token refresh races/expiry, missing scopes/permission, revoke, cross-user/account access, Calendar day/all-day/recurring reads, Gmail pagination, ambiguous Rahul, malformed/429/5xx/timeout responses and redaction.

**Acceptance criteria:** Native read fixtures are correct; connected test user can read the intended account; disconnect blocks subsequent access; no provider writes are callable.

**Commands required to verify:** `npm test -- tests/google-read`; `npm run test:provider -- --suite google-read` (dedicated account); `npm run typecheck`; `npm run build`.

## M4 — Bounded agent, minimal SQL context and read-only vertical slice

**Classification:** **NEEDED FOR MVP**.

**Objective:** Deliver multilingual reference workflows 1 and 3 with a single SDK agent and useful minimal personal context.

**Files/packages affected:** `packages/{agent,policy,shared}`, small `packages/memory` functions/repositories if useful, `packages/db` optional person/explicit relationship rows, `apps/api` normalized messages; minimal profile/context controls; `tests/agent-reads` and `evals/reference-reads`.

**Dependencies:** M3; D04 typed model seam/budgets; D12 structured-memory/provenance rules. M0 scope disposition defers semantic requirements explicitly.

**Implementation steps:** Isolate OpenAI SDK/model config/calls in the agent module; typed proposal/clarification/result schemas and narrow tool catalogs; read authorization matrix. SQL timezone, explicit email preference/person references, and relevant current request context; inspect/correct/delete controls can use the profile page. Support Hindi Devanagari, English and Roman-script Hinglish/code switching; preserve names/time intent. Use response-language precedence: explicit request, then configured preference, otherwise current language (English → English, Hindi → Hindi, code-switched/Hinglish → natural Hinglish). Ask for ambiguous person/date. Preserve provenance; tool content cannot grant permission or write authoritative facts. No provider-adapter hierarchy, generic graph nodes/edges or custom agent loop.

**Tests:** Deterministic intent/tool/argument/response fixtures, grounded summaries, ambiguity, Hindi/English/Hinglish name/time interpretation and language precedence/current-turn switching (including Hindi in Devanagari and Romanized/code-switched input), read success with Temporal absent/unavailable, turn/tool/context/deadline limits, unknown tools/invalid schemas, prompt injection, denied reads, context correction/deletion/isolation, secrets absent from prompts/traces.

**Acceptance criteria:** Synchronous message → agent → authorized read-only tool → response works with Temporal not installed/running and never connects to it; Calendar/email search work end-to-end through authenticated test requests; context is small/user-controllable; SDK objects do not become product state; no executable send path exists.

**Commands required to verify:** `npm test -- tests/agent-reads`; `npm run eval:reads`; `npm run test:web -- profile`; `npm run typecheck`.

## M5 — Incoming voice-note pipeline for Hindi, English and Hinglish

**Classification:** **NEEDED FOR MVP**.

**Objective:** Convert incoming voice notes into reliable user requests without a custom speech or media platform.

**Files/packages affected:** Small transcription adapter in `packages/agent` or `packages/tools/src/audio`, bounded request-side audio normalization, temporary storage/cleanup, shared transcript schema; `tests/voice-notes` and a consented language/audio evaluation corpus.

**Dependencies:** M2/M4; select an existing transcription provider by testing actual Hindi/English/Hinglish audio. OpenAI may remain the only provider; do not build model routing. Set supported audio types, byte/duration limits and retention before real audio processing.

**Implementation steps:** Resolve observed provider media IDs through authorized allowlisted download code; validate audio type/size/duration and safe redirects. Use an off-the-shelf transcription API behind one module. Preserve source/media reference, detected language/code-switching information where available, provider/model version, duration/latency, uncertainty and evaluation references under bounded retention; distinguish provider-reported versus derived metadata and leave unsupported values unknown. Preserve names/code switching and transcript source; distinguish extraction uncertainty from a trusted confirmed instruction. Clarify uncertain recipient/date/AM-PM before actions. Both text and transcripts produce the identical normalized request schema and invoke exactly the same single agent/request/intent/policy pipeline. Do not create Hindi, English or Hinglish agents. Transcription debugging metadata does not become privileged instructions. Delete temporary audio according to the minimal stated policy; exclude audio access tokens/sensitive transcript contents from logs. Replies may be text.

**Tests:** Real consented human-checked notes in Hindi, English and Hinglish, mixed-language names/numbers/time, noisy/clipped/quiet audio, wrong/unsupported/oversized type, expired media, download redirects, cross-user media IDs, duplicate delivery, provider timeout/retry, cleanup, available/missing language/code-switching metadata, shared-pipeline equivalence and transcript/token redaction. Do not infer reliable confidence from fields the selected provider does not expose.

**Acceptance criteria:** All three language/input cases produce the intended action or a useful clarification. Ambiguous transcription cannot silently select a recipient/time or authorize email. Approved consented corpus and measured provider limits are recorded. No custom model, TTS/live calling or image/document pipeline.

**Commands required to verify:** `npm test -- tests/voice-notes`; `npm run eval:voice`; `npm run test:provider -- --suite voice-notes` (consented fixtures); `npm run typecheck`.

## M6 — Durable actions and exact-action approval, using a fake send

**Classification:** **NEEDED FOR MVP**.

**Objective:** Make proposed external communication safe before connecting a real send executor.

**Files/packages affected:** `packages/{db,policy,workflows,tools}`, `apps/worker`, approval/status routes and minimal web inbox; `tests/action-safety`.

**Dependencies:** M4; D01/D03/D05 safe-action/state/approval contracts. No real send required to pass.

**Implementation steps:** Introduce local Temporal/worker startup now for durable approval waits and restart-safe execution; keep initial read handling and API startup independent. Add one narrowly scoped logical-action record or enrich existing tool-action records, choosing one representation; immutable account/payload hash/version, unique claim, attempts/provider evidence/unknown state. PostgreSQL outbox for Temporal starts/signals in existing worker; versioned status projection. Typed policy allow/deny/approval; exact draft preview/edit/reject/approve/expiry; compare-and-set decisions and action-bound consumption; current revoke/cancel/kill-switch check at dispatch. Activities perform I/O; Workflow code remains deterministic. No universal workflow engine or generic ledger platform.

**Tests:** Concurrent action claims/approval decisions, hash edits, expired/consumed/cross-user approval, revoked permission/account, cancellation at dispatch, fake provider accepted then crashed, commit-without-start, duplicate signals, stale status projection, worker restart/replay, Redis loss and safe/unsafe retries.

**Acceptance criteria:** Fake side effect runs only under current exact authorization; uncertain execution cannot blindly repeat; persisted pending work can resume; web shows actionable pending/rejected/blocked/unknown status.

**Commands required to verify:** `npm run infra:durable:up`; `npm run db:migrate`; `npm test -- tests/action-safety`; `npm run test:web -- approvals`; `npm run test:replay`; `npm run typecheck`.

## M7 — Verified WhatsApp text/voice, shared approval and permitted notifications

**Classification:** **NEEDED FOR MVP**.

**Objective:** Enable the primary multilingual text/voice-note interface and safe delayed delivery without adding another channel/platform.

**Files/packages affected:** `apps/api/src/channels/whatsapp`, `packages/auth` linking, `packages/tools` WhatsApp adapter, `packages/db` inbound/notification records, worker delivery Activity, small web link/activity view; `tests/whatsapp-text`.

**Dependencies:** M5/M6; D08 assistant-use eligibility/provider consent/template gates, D06 verified linking. Fakes permit offline testing while live eligibility is pending.

**Implementation steps:** Raw-body webhook signature/setup verification, expected business-account validation, short-lived single-use link from authenticated web user; durable inbound deduplication before acknowledgement/dispatch. Text and validated/transcribed voice use the same multilingual agent path; buttons/contextual replies bind exact approval IDs. Reuse M6 approval authority and action evidence for notifications. Opt-in/current window/template selection; minimal sensitive payload and authenticated approval-inbox links. Track accepted/delivered/failed/unknown status and show undelivered work on web. Reuse the bounded audio pipeline from M5; no image/document or fallback-channel platform.

**Tests:** Forged/unlinked sender, foreign business number, linking replay, duplicated/redelivered webhook, voice transcript ambiguity, repeated voice-note delivery, ambiguous “yes,” web-versus-WhatsApp decision race, cross-user approval, unlink; outside-window/missing-template/opt-out sends, duplicate/out-of-order statuses and accepted-but-response-lost notification.

**Acceptance criteria:** Verified requests enter once; channels share one approval entity; delayed notices use permitted templates or show blocked delivery; no credentials/body leaks or blind notification resend. Provider-ineligible setup cannot be labeled launch-ready.

**Commands required to verify:** `npm test -- tests/whatsapp-text`; `npm run test:provider -- --suite whatsapp-text-templates` (after eligibility/setup); `npm run test:web -- linking`; `npm run typecheck`.

## M8 — Approved Gmail send vertical slice

**Classification:** **NEEDED FOR MVP**.

**Objective:** Deliver reference workflow 4 with exact content/recipient approval and safe provider execution.

**Files/packages affected:** `packages/tools/src/gmail`, concrete `packages/workflows/src/email`, agent proposal integration, approval/history views; `tests/gmail-send`.

**Dependencies:** M6; Gmail send scope/test-recipient setup; accepted D01 Gmail-specific unknown-outcome behavior.

**Implementation steps:** Generate/persist a local approval draft rather than requiring provider draft management. Resolve explicit recipient/account; approve/edit exact content then dispatch native send Activity. Stable logical ID and correlation evidence; store returned message/thread ID. Retry only proven-safe failures; bounded sent-message reconciliation where meaningful, otherwise block uncertain result. Never treat a negative search as proof of no send. Do not add invoice-specific sending/thread-monitoring logic. No standalone reply product or attachment handling at launch.

**Tests:** Wrong/multiple Rahul, payload/account/recipient substitution, no approval/deny/reject/expiry, exact edit approval, provider acceptance before timeout/crash/DB commit, duplicate worker attempt, negative reconciliation, late cancellation and injection exfiltration attempts.

**Acceptance criteria:** Exact approved email is accepted once in controlled fixtures/test recipients; outcome-unknown is visible and never automatically resent; success wording reflects provider acceptance, not delivery assurance.

**Commands required to verify:** `npm test -- tests/gmail-send`; `npm run test:provider -- --suite gmail-send` (dedicated explicit recipients); `npm run test:replay`; `npm run typecheck`.

## M9 — Durable one-time reminder

**Classification:** **NEEDED FOR MVP**.

**Objective:** Deliver reference workflow 2 with restart-safe scheduling and a simple stop control.

**Files/packages affected:** `packages/db` reminders, concrete `packages/workflows/src/reminder`, internal tools/agent normalization, API pending-work/cancel; `tests/reminder`.

**Dependencies:** M6/M7; D09 one-time date/time semantics. No recurrence engine.

**Implementation steps:** Persist text/user timezone/resolved due instant and original interpretation; policy-checked explicit creation without additional approval; stable creation/notification key; outbox start, Temporal timer, current status/version check and notification. Clarify “11” when AM/PM cannot safely be resolved; no Rahul resolution unless useful. Stop pending reminder; creation confirmation distinguishes saved versus scheduled status.

**Tests:** Ambiguous/invalid/past due time, user-local tomorrow/DST instant parsing, repeated inbound creation, DB-to-Temporal outage/recovery, worker restart/time skipping, stop before due/racing delivery, notification failure and cross-user IDs.

**Acceptance criteria:** Reminder survives restart and delivers once or honestly records unknown/blocked delivery; stopped work does not dispatch; no false scheduled/delivered confirmation.

**Commands required to verify:** `npm test -- tests/reminder`; `npm run test:replay`; `npm run typecheck`.

## M10 — Sole composed workflow: Meeting email context and reminder

**Classification:** **NEEDED FOR MVP**.

**Objective:** Complete “I'm meeting Rahul tomorrow. Find the last relevant email from him and remind me 30 minutes before the meeting” using existing simple primitives.

**Files/packages affected:** Small named composition in `packages/agent`/request handling, existing Contacts/Calendar/Gmail tools and reminder API/workflow, `packages/db` existing reminder context fields if needed; `tests/meeting-context-reminder`. No new platform/package/service required.

**Dependencies:** M3/M4/M5/M7/M9 for shared text/voice understanding, person/account-scoped reads and durable reminder delivery. Uses M6 policy/action IDs. No Calendar write or Gmail send dependency.

**Implementation steps:** Resolve person and local tomorrow; find intended existing meeting; clarify multiple/untimed/missing matches. Retrieve latest relevant email from that person using meeting context, returning grounded evidence or clear no-match/partial failure. Use confirmed meeting time minus 30 minutes; clarify already-past due time. Invoke the existing policy-checked one-time reminder with a stable request/action key and context references. Confirm scheduled versus pending honestly and deliver via existing Temporal reminder. No bespoke persistent orchestrator, recurring objective, email-monitoring loop or implicit Calendar event creation. Only this composed workflow is added.

**Tests:** All three languages through text/voice; person/meeting ambiguity; no email/no meeting; partial Gmail/Calendar failure; timezone and all-day event; past reminder due; injected email; duplicate input/tool retry; disconnected/denied account; worker restart; stop/notification failure. Assert person, event/time, email evidence and exactly one durable reminder match the user-confirmed intent.

**Acceptance criteria:** One request resolves Calendar/Gmail/person context and schedules a correct reminder due 30 minutes before the confirmed meeting, or asks a useful clarification without side effects. Reminder delivery survives restart; partial outcomes are explicit; exactly one cross-service launch workflow, with no new infrastructure/Autopilot platform.

**Commands required to verify:** `npm test -- tests/meeting-context-reminder`; `npm run test:replay`; `npm run eval:voice`; `npm test -- tests/reference-workflows`; `npm run typecheck`.

## M11 — Small control center and reused Action History

**Classification:** **NEEDED FOR MVP**.

**Objective:** Make the four actions and multilingual text/voice understandable and controllable without building a dashboard or behavioral platform.

**Files/packages affected:** `apps/web` combined settings/connections/approvals/activity view, scoped `apps/api` read/cancel routes, existing audit/tool/workflow/approval read models; `tests/control-center`.

**Dependencies:** M2–M10 existing data/events; no new history datastore.

**Implementation steps:** Combine connection/disconnect, permission status, approval/edit/reject, profile/memory correction/delete and pending-work/cancel. Show Action History from existing correlated events including proposals, edits, approvals/rejections, sends, failures/cancellations. Minimal workflow-triggered reminder/approval/outcome notices; suppress duplicates and repeated pending prompts. Status distinguishes accepted versus delivered, cancelled/failed/blocked/expired/unknown. Unsupported requests receive clear explanations; no autonomy-level UI or opportunity engine.

**Tests:** Cross-user IDs/pagination/redaction, exact edit history, cancel/disconnect/reconnect paths, memory deletion, web/WhatsApp state consistency, stale/unknown delivery status and basic mobile/keyboard interaction.

**Acceptance criteria:** User sees what was proposed/approved/executed and can stop pending work; history is traceable without full content dumps; no feature collection/history-learning platform is introduced.

**Commands required to verify:** `npm test -- tests/control-center`; `npm run test:web -- control-center`; `npm test -- tests/reference-workflows`; `npm run build`.

## M12 — Multilingual launch evidence and controlled release readiness

**Classification:** **NEEDED FOR MVP**.

**Objective:** Verify the small product under realistic faults and prepare a permitted launch to real users.

**Files/packages affected:** `tests/{reference-workflows,security,recovery}`, `evals`, CI, existing infrastructure deployment configuration; short `docs/{OPERATIONS,RELEASE_CHECKLIST,PROVIDER_READINESS}.md`.

**Dependencies:** M0–M11; accepted scope/ADR changes, Google production-verification disposition and confirmed WhatsApp eligibility/templates for intended users. No deferred capability gate.

**Implementation steps:** Run accumulated fixture/provider tests; small human-checked language/audio corpus plus golden evaluation for intent/tools/arguments/recipient/time/clarification; realistic fault/security/restart/replay cases. Verify synchronous reads still work with Temporal stopped while new durable work reports pending/blocked safely. Set measured launch text/voice latency and transcription quality and model/tool/retry budgets; inspect trace/log redaction and correlation. Check backups/restore and deny/kill-switch controls using existing services. Record provider readiness and controlled-launch checklist; testing does not implicitly authorize public deployment. Observe repeated user requests/corrections qualitatively using existing history, not a new analytics/learning platform.

**Tests:** Four action happy paths plus the single meeting/email/reminder composition across all three languages and text/voice and applicable ambiguity, no permission, reject/edit/expiry, provider failure/retry, concurrent duplicates, approval/webhook replay, unknown send, injection/exfiltration, IDOR, revoked credential/policy, restart, cancel and redaction. Minimal restore and disable-control drill; SDK/model quality evaluated separately from deterministic authorization assertions.

**Acceptance criteria:** All relevant deterministic tests pass; zero unauthorized/duplicate sends in fault cases; uncertain outcomes stop safely; four actions, the sole composed workflow and multilingual text/voice pass controlled provider checks; clear minimal history/context controls; provider/retention/readiness evidence has no unresolved launch blockers. Hindi, English and Hinglish voice-note support is required and passes human-checked audio evaluations. No invoice, semantic retrieval, image/document, Calendar mutation, general Autopilot or multi-model requirement.

**Commands required to verify:** `npm ci`; `npm run infra:up`; `npm run db:migrate`; `npm run lint`; `npm run typecheck`; `npm run build`; `npm test`; `npm run test:web`; `npm run test:replay`; `npm run eval:core`; `npm run test:restore`; `npm run test:disable-controls`; `npm run test:provider -- --suite mvp`; `npm run release:check`.

## Launch coverage and stop points

| Requirement | Milestones | Launch evidence |
|---|---|---|
| Hindi, English and Hinglish text | M4/M12 | Correct intent, names/time, code switching and understandable replies |
| Incoming voice notes in all three languages | M5/M7/M12 | Human-checked audio corpus, safe download/cleanup and uncertainty clarification |
| Calendar lookup/general email search | M3/M4 | Grounded user-local results with permission/ambiguity tests |
| Approved email send | M6/M8 | Exact authorization, current permission, no duplicate/uncertain blind resend |
| One-time reminders | M9 | Correct due instant, durable timer, stop and permitted notification |
| Sole composed meeting/email/reminder workflow | M10 | Correct person/event/email evidence and one restart-safe reminder |
| Web/WhatsApp identity and controls | M2/M7/M11 | Secure linking, shared approval, disconnect/cancel/history |
| Minimal context and history | M4/M6/M11 | Explicit SQL facts and existing correlated reliability events |
| Security/reliability/release | Every slice/M12 | Fault/replay tests, language/audio evaluation and provider readiness |

M4 gives multilingual text reads; M5 adds the audio pipeline; M7 connects text/voice to WhatsApp; M8 enables safe sends; M9 completes reminders; M10 demonstrates the sole composed workflow; M12 gates launch. No invoice or follow-up-monitoring dependency. Durable reminders/approval waits demonstrate persistence without a new Autopilot framework.

## MVP stretch goal — Calendar creation, never a launch dependency

`calendar.create_event` may be added through the existing typed native-tool schema/proposal, server policy, exact-action approval and durable execution boundary without changing the architecture. Keep read-only tools narrow now; do not add an unused write scope/executor. If attempted, require clarified calendar/timezone/duration/attendees, invitation intent, current permissions and exact approval; implement provider-safe creation/reconciliation and fault tests. Test missing/ambiguous fields, duplicate/unknown outcomes and unauthorized invitations. Planned focused verification: `npm test -- tests/calendar-create` and dedicated-account provider checks after the stretch implementation exists. Omit this stretch without failing M12; do not pull update/cancel/general scheduling into scope.

## Validation backlog — not launch dependencies

Every item below is **DEFER UNTIL VALIDATED**. Required security becomes mandatory before later enabling a capability.

- Invoice follow-up/extraction/automation and monthly invoice collection: excluded by explicit user direction, not launch gates.
- Images/documents and generated voice replies/live calls: incoming voice notes are included; a broad media platform is not.
- Calendar update/cancel/conflicts, recurring reminders/rich lifecycle UI, persisted Gmail drafts/standalone replies: proposed broader-feature deferrals until demand is demonstrated.
- Semantic retrieval/rich Personal Graph, behavioral learning/prediction, broad proactive detection: minimal context and concrete actions first.
- Generalized Autopilots, skills ecosystem, model-routing/provider hierarchies, India-wide integrations and extra datastore/service infrastructure: no speculative buildout.

Accepted language/voice/invoice priorities do not need reconfirmation. Remaining technical choices and broader scope amendments are explicit decisions at their affected milestones. This document is a plan; no product code, provider connection or deployment has started.

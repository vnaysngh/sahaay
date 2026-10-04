# Sahaay Architecture Decisions — Pivot Register

**Revision:** 0.4, 2026-10-04 (Asia/Kolkata)  
**Status:** MVP scope frozen. User stack direction incorporated on 2026-10-04; M0 live screening recorded; readiness checks remain open. M1 has not started.

## Change record

The product pivot is user-directed and supersedes the productivity launch/mandatory meeting-reminder workflow. The user approved the simplified architecture and froze scope on 2026-10-03. Infrastructure deferrals are accepted and explicitly recorded below. Only M0 is authorized in this turn; report before M1. Full ADR-001–020 history is preserved in [archive/pre-pivot-2026-10-03/DECISIONS.md](archive/pre-pivot-2026-10-03/DECISIONS.md); historical accepted labels are not the current MVP gate.

| Previous decision | Current disposition |
|---|---|
| ADR-001 Temporal and required worker; Redis baseline | Accepted deferral of launch timing under ADR-022, not replacement by a custom engine |
| ADR-002 one agent; ADR-003 PostgreSQL; ADR-007 TypeScript | Preserve |
| ADR-004 native/MCP tools | Preserve control boundaries; no Google/MCP integration required |
| ADR-005 authorization; ADR-009 idempotency; ADR-011 untrusted data; ADR-014 audit; ADR-015 secrets isolated | Preserve, scaled to explicit local CRUD and WhatsApp response delivery |
| ADR-006 WhatsApp primary | Preserve, with actual assistant-use eligibility gate |
| ADR-008 hybrid memory | Structured explicit memory now; semantic/graph infrastructure deferred |
| ADR-010 narrow tools; ADR-012 reliability before breadth; ADR-016 small launch | Preserve; interaction breadth is not infrastructure breadth |
| ADR-013 approvals and ADR-018 durable state seams | No waiting-approval platform at launch; preserve explicit user control/ownership; reconsider only for future external writes |
| ADR-017–020 productivity/voice/composed workflow amendments | Productivity gates/stretch/composition superseded; shared multilingual pipeline and natural response language preserved |

## ADR-021 — Multimodal WhatsApp Discovery MVP

**Status:** Accepted, scope frozen by user on 2026-10-03.  
**NEEDED FOR MVP:** ASK, UNDERSTAND, RESEARCH, REMEMBER, ORGANIZE using P0 text/voice/images/screenshots/URLs and one general assistant. Explicit memory/items are controlled PostgreSQL records; no persona modes. Small web settings/privacy surface. Language precedence: explicit request → configured preference → current input; text responses.

**DEFER UNTIL VALIDATED:** P1 documents/location; all productivity integrations, reminders, invoice/meeting workflows and Calendar stretch; external transactions/posting; sophisticated moats/Autopilots/learning/platforms. Tradeoff: no external action execution yet, but broader everyday inputs/research/recall validate real demand. Discovery captures coarse unsupported intent without sensitive content. No code/schema migration exists; archived documentation is replaced by a coherent current specification.

## ADR-022 — PostgreSQL-Only MVP Infrastructure

**Status:** Accepted on 2026-10-03; explicitly amends ADR-001 and Redis/worker baseline timing.  
**NEEDED FOR MVP:** One TypeScript application, PostgreSQL, existing model/search/transcription/vision and WhatsApp providers; normal auth. Use message records as a small persisted request inbox, atomic leases/recovery and transactionally idempotent local writes. Short processing and PostgreSQL rate-limit counters suffice initially. No separate queue or generalized engine.

**DEFER UNTIL VALIDATED:** Temporal, Redis, dedicated durable workflow worker, Google integration OAuth/token subsystem, vector/graph services and extra analytics infrastructure. Their previous justification disappeared with timers/integrations. Reconsider Temporal when waiting/monitoring/delayed business execution exists, Redis when measured contention/cache/rate-limit scale needs it.

Tradeoffs: a small DB-backed request-processing loop needs lease/restart/concurrency tests; quotas and provider timeouts are bounded and cannot guarantee exactly-once outbound messages. PostgreSQL receives modest processing/limit load; measure before adding services. This is not permission to build a workflow engine in SQL. Preserve a direct model/tool module seam without speculative portability. Update all active specs/plans; no existing application migration needed.

## ADR-023 — Sources, Explicit Persistence and Discovery Events

**Status:** Accepted on 2026-10-03.  
**NEEDED FOR MVP:** Retain actual consulted/cited source references with timestamps; user-visible clickable citations, bounded input provenance, explicit user-requested memory/item mutations and privacy-conscious enumerated product events. No other auto-memory rules initially beyond onboarding/preferences and requested saves. SQL/full-text/tag/date retrieval before embeddings.

**DEFER UNTIL VALIDATED:** Search/vertical research platforms, full-page archives, automatic knowledge graph/learning, raw content analytics and specialized persona schemas. Tradeoffs: inaccessible pages/video transcripts remain honest limitations; fuzzy recall may require clarification. Retention and search/tool compatibility are setup choices to resolve, not reasons to add infrastructure.

## Approval and later changes

ADR-021/022/023 are accepted. M0 provider defaults, pending practical tests, stack/privacy selections and unresolved eligibility are recorded in [M0_REPORT.md](M0_REPORT.md). No M1 work has started. Future locked changes require stated reason, tradeoffs and affected docs/tests; never silently revive superseded Google/timer gates.

## ADR-024 — Final launch order and capability naming

**Status:** Accepted, explicit user amendment on 2026-10-03.

**NEEDED FOR MVP:** Ask · Understand · Research · Remember · Organize. Comparisons belong within Research; organization means explicit save/list/edit operations, never background tracking. M0 decisions → M1 foundation/PostgreSQL → M2 text vertical slice → M3 images/screenshots/voice shared pipeline → M4 research/URLs → M5 memory/items → M6 privacy/discovery/hardening/controlled launch. M0 is the current stop point.

**DEFER UNTIL VALIDATED:** Background tracking/persistent monitoring and all previously deferred capabilities. PDFs/documents/location stay P1. Reordering adds no scope.

## ADR-025 — User stack direction and practical M0 gates

**Status:** Accepted user direction, 2026-10-04; provider evaluation results pending. Supersedes prior M0 finalization of WhatsApp/transcription/research readiness, not frozen product scope or milestone order.

**NEEDED FOR MVP:** Apply TECHNOLOGY_STACK.md. Compare direct Meta vs Twilio; benchmark OpenAI vs Sarvam STT on consented realistic Indian WhatsApp audio; select one default. Practically verify OpenAI search sufficiency. Keep maintained auth, PostgreSQL-only storage, unified requests and tiny provider/memory seams. Report tested alternatives, reasons, costs, limitations, processor settings and blockers. Approval of completed revised M0 report is required before M1. Current provider preferences are provisional; no benchmark has run.

**DEFER UNTIL VALIDATED:** Automatic provider routing, additional LLM/search/crawler/memory/integration platforms, microservices, empty architectural packages and all already deferred scope. Sarvam/Twilio are authorized M0 candidates, not permission to ship multiple providers. Composio/MCP and Mem0/Supermemory remain future evaluations only after demonstrated need.

## ADR-026 — Meta Cloud API selected

**Status:** Accepted explicit user selection, 2026-10-04. Supersedes ADR-025's open transport choice.

**NEEDED FOR MVP:** Use direct Meta Cloud API for lower transport costs; avoid Twilio's additional per-message fee/processor. Retain small provider normalization/signature/media boundary. Published alternatives were compared; Twilio was not live-tested and is not required now. Credentials and shot1/shot2 authorize small OpenAI/Sarvam M0 tests. Transport selection does not resolve actual Meta eligibility or live setup.

**DEFER UNTIL VALIDATED:** Twilio integration or dual-provider transport; do not spend time provisioning the rejected candidate. M1 still requires approval after the revised M0 report.

## ADR-027 — Sarvam transcription default after M0 pilot

**Status:** Selected 2026-10-04 from two-file screening and user confirmation that Sarvam worked better.

**NEEDED FOR MVP:** Sarvam saaras:v4/transcribe with automatic language detection is the only default transcription path. Both candidates succeeded; Sarvam was faster in both observed calls and returned language metadata. User confirmed the Hindi result was better. Preserve one primary OpenAI agent and tiny TranscriptionProvider. M0_REPORT.md records actual timing/cost, missing ground truth and lack of genuine Hinglish/noise/entity coverage. Research and overall M0 readiness remain unresolved; M1 approval gate persists.

**DEFER UNTIL VALIDATED:** Runtime provider switching/routing, more speech models, generated voice/live voice. OpenAI transcription was an evaluation alternative, not a required shipped fallback.

## M0 evidence amendment — 2026-10-04

**NEEDED FOR MVP:** User deferred genuine Hinglish evaluation to M3; it does not block the current M0 screening and remains a launch requirement. Supplied Meta screenshot confirms test-number claim, with token not yet generated; production eligibility remains unresolved. OpenAI Usage screenshot records spend/usage, not model rate limits. No additional provider or scope change, and no M1 authorization.

## ADR-028 — Web Chat launch channel and revised M0–M5 order

**Status:** Accepted explicit user channel decision, 2026-10-04. Implementation plan presented for review; M1 not started. Supersedes ADR-006/021/024/026 wherever they require WhatsApp primary, a settings-only web app, WhatsApp launch gates or the old milestone order. Prior entries are historical decisions, not current requirements.

**NEEDED FOR MVP:** Web Chat → authenticated channel/input adapter → UnifiedRequest → one channel-independent Sahaay agent → tools/memory → reusable response events/result. Keep Next.js/Node/TypeScript, PostgreSQL, OpenAI agent/vision/search and Sahaay-owned memory/items. Sarvam remains the limited pilot-selected transcription default; complete mixed-language/browser recording checks in M2 without blocking text/images. P0 text/images/screenshots/voice/URLs; P1 documents/location deferred. M0 contracts/provider/database/auth/privacy → M1 authenticated streaming text/history → M2 multimodal → M3 research/URLs/sources → M4 explicit memory/items → M5 privacy/discovery/hardening/testers. UI is a conversation window, not a dashboard.

**DEFER UNTIL VALIDATED:** Meta work is paused, not deleted; no restriction debugging, incorporation or Business Verification now. No Meta/Twilio/Telegram adapters. Transport eligibility does not block Web Chat. No additional providers, infrastructure, integrations, persistent tracking or product scope. Existing probes remain disposable historical evidence.

**Tradeoff:** Browser auth, owned uploads and transient-stream interruption semantics replace WhatsApp linking/webhooks/delivery as immediate channel concerns. Keep response persistence and idempotent local mutations; do not automatically replay costly model requests or construct a custom durable workflow engine. Controlled tester hosting/recovery/processor disclosures remain launch requirements. M0 choices and the revised plan are reported before M1.

## M1 authorization and local setup — 2026-10-04

The user approved the revised plan and explicitly instructed “go ahead, start working”. This supersedes the earlier stop-before-M1 statements. M1 uses the selected stack and repo-local native PostgreSQL 17 development launcher, with no system service/cloud provisioning. Better Auth email/password enables local sign-in; verification and recovery are not yet enabled for testers. Server responses use the one selected OpenAI agent, no hosted sessions/tracing, and scoped PostgreSQL history. Media/research/permanent memory are not advertised as available in M1. Future milestone scope is unchanged.

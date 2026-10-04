# Sahaay Strategy Review

**Updated:** 2026-10-03 (Asia/Kolkata)  
**Status:** Approved overview and latest user amendments incorporated; no product implementation.

## Current direction

**Design for the moat. Do not build the moat yet.** Sahaay can evolve toward a personal operating system, but the first release should make a few actions easy in the languages and input mode users actually use. The user's latest correction supersedes invoice-first and text-only launch proposals: invoices are not MVP; Hindi, English, Hinglish and incoming voice notes are.

**NEEDED FOR MVP:** Four general actions—Calendar lookup, one-time reminder, email search and approved email send—through text and voice notes in all three languages. Verified identity, Google connections, exact approvals, durable reminders/approval waits, clear action history and minimal explicit context support them. Exactly one composed meeting-context/email/reminder workflow is also required; reuse those primitives rather than an Autopilot platform. First prove synchronous reads independent of Temporal, then add it for durable work. Text replies are sufficient; voice responses/live calls are not newly requested.

**DEFER UNTIL VALIDATED:** All invoice-related automation/follow-up, monthly invoice objectives, general Autopilot platform, rich Personal Graph, behavioral learning/prediction, model routing, skills ecosystem, advanced proactive intelligence and India-wide integrations. Images/documents, Calendar update/cancel, recurring reminders, persisted draft/standalone reply management and semantic retrieval remain proposed broader-feature deferrals. No invoice-specific schema, tool, monitoring or evaluation gate.

## Preserve the baseline and keep seams small

| Area | NEEDED FOR MVP | DEFER UNTIL VALIDATED |
|---|---|---|
| Runtime | One bounded OpenAI Agents SDK agent; isolated invocation/config and typed proposals | Multi-agent architecture, custom agent framework, multi-model routing |
| Persistence | PostgreSQL records; Temporal timers/approval waiting; Redis ephemeral only | New graph/vector services or workflow abstraction above Temporal |
| Personal Graph | Explicit useful person references/preferences in SQL | Generic nodes/edges, inference and behavioral graphs |
| Action History | Existing proposal/approval/tool/workflow/audit events, including edits/cancels | Event sourcing everywhere, behavioral event lake/training |
| Trust | Exact approval for email, current permission, revoke/disconnect/cancel | Global autonomy switch, trust scores/policy DSL/platform |
| Voice/language | Existing transcription provider, shared text/voice pipeline and single agent; current-input language default unless request/config overrides; available detected-language/code-switching metadata, secure bounded audio and clarification | Custom speech models, TTS/live calls, image/document processing platform |
| Durable work | Synchronous reads without Temporal first; reminders/approval waits directly in Temporal later; exactly one meeting/email/reminder composition | Invoice follow-up and generalized Autopilots; no invented replacement workflow |

Invoice follow-up was previously proposed as the first Autopilot primitive. That recommendation is withdrawn. Reminders and approval waiting justify Temporal when introduced. The approved meeting/email/reminder composition demonstrates orchestration without a special Autopilot product or platform.

## Explicit documentation changes

- **NEEDED FOR MVP:** PRD and Workflow launch requirements now cover four general actions, exactly one composed meeting/email/reminder workflow and mandatory language/voice support; generic email-search examples no longer center invoices.
- **NEEDED FOR MVP:** Architecture/roadmap/implementation review classify audio download, transcription, uncertainty/privacy and real-audio testing as launch work. Default external-send approval and uncertain-outcome controls are retained.
- **NEEDED FOR MVP:** Accepted user-scope ADR-019 records the correction. Earlier proposed ADR-017 is superseded where it required invoices or deferred voice. Remaining broader technical/timing amendments stay proposed; stack/security decisions are not silently replaced.
- **NEEDED FOR MVP:** A small consented, human-checked audio corpus covers Hindi, English and Hinglish, proper names/time, code switching, noisy input and each action. Compare intended action/arguments and clarification, not just transcript spelling. Set measured quality/latency limits during implementation.
- **MVP STRETCH GOAL:** `calendar.create_event` through the existing typed native-tool/policy/approval/execution boundary; no architecture change or launch dependency.
- **NEEDED FOR MVP:** Accepted ADR-020 records synchronous-first ordering, one shared voice/text pipeline, language precedence, useful transcription metadata and the sole composed workflow.
- **DEFER UNTIL VALIDATED:** Provider hierarchy, generic media pipeline, graph/Autopilot/learning frameworks and additional integrations. Model/transcription code can live behind ordinary module functions until a real second implementation is needed.

The six source documents state that the latest priority correction takes precedence over older baseline examples. No reconfirmation is required for priorities the user explicitly gave. See `IMPLEMENTATION_OVERVIEW.md` for readable pointers and `IMPLEMENTATION_PLAN.md` for milestone objectives, files, dependencies, steps, tests, acceptance and planned commands.

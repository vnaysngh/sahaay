# Sahaay Architecture Decisions

**Version:** 0.1\
**Status:** Locked baseline decisions

## Approved MVP amendments — 2026-10-03

**Status:** Accepted user direction; supersedes earlier invoice-first/text-only scope and implementation ordering. Unsettled technical selections remain proposed. No product implementation started.

**NEEDED FOR MVP:** Hindi, English and Hinglish text/voice, four general actions (Calendar lookup, one-time reminder, general email search, approved email send), and exactly one small cross-service workflow: “I'm meeting Rahul tomorrow. Find the last relevant email from him and remind me 30 minutes before the meeting.” Reuse person resolution, Calendar/Gmail reads, contextual reasoning and durable reminder delivery; no generalized Autopilot.

**NEEDED FOR MVP:** First prove a synchronous message → agent → authorized read-only tool → response with Temporal absent. Introduce the existing Temporal engine only for reminders, approval waits, delayed work and restart-safe execution. Voice transcription enters exactly the same normalized request/agent/policy pipeline as text. One agent for all languages; preserve source, transcript/model version, detected language/code-switching metadata where available, uncertainty and evaluation references under bounded retention. Unavailable metadata stays unknown; never fabricate it.

**NEEDED FOR MVP:** Response language follows the current input naturally: English → English, Hindi → Hindi, Hinglish/code-switched → natural Hinglish. An explicit request takes priority, then a configured response preference, then current-input language. Language metadata guides presentation, never authorization. Replies may be text; TTS/live calls/custom speech models are not required.

**MVP STRETCH GOAL — not a launch gate:** Calendar creation via `calendar.create_event`. Keep the same typed native-tool proposal/policy/approval/execution boundary so this tool can be added without architectural changes. Do not implement a write adapter or request unused OAuth scopes just to preserve the seam. Calendar update/cancel and broad scheduling remain deferred.

**DEFER UNTIL VALIDATED:** All invoice-specific features; generalized Autopilots, rich Graph/memory/learning/prediction/model-routing/skills platforms; images/documents, rich recurrence and future India-wide integrations. No new infrastructure or extra cross-service workflow. The approved overview guides the small launch; broader historical lists below do not override this boundary.

See [IMPLEMENTATION_OVERVIEW.md](IMPLEMENTATION_OVERVIEW.md) for readable pointers, [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for milestones and ADR-020 in [DECISIONS.md](DECISIONS.md) for the recorded amendment.

This document records architectural decisions that should not be
silently changed by implementation agents.

If a decision needs to change, create or update an ADR and explain:

-   why the original decision is insufficient
-   what changes
-   what tradeoffs are introduced
-   what code/docs need migration

## ADR-001: Use Temporal for Durable Workflows

### Decision

Use Temporal for long-running, retryable, stateful workflows.

### Reason

Sahaay needs workflows that can:

-   wait for approvals
-   wait for time
-   retry provider calls
-   survive worker restarts
-   resume after failures
-   coordinate multiple external calls

The LLM should not be responsible for durable workflow state.

### Consequence

Temporal becomes part of the core backend infrastructure.

## ADR-002: One Primary Agent in v0.1

### Decision

Use one primary personal agent.

### Reason

The initial product does not have enough complexity to justify a
multi-agent architecture.

Multiple agents would introduce:

-   routing complexity
-   state synchronization
-   debugging difficulty
-   additional latency
-   additional failure modes

Specialized agents can be introduced later when a concrete need is
demonstrated.

## ADR-003: PostgreSQL Is the Source of Truth

### Decision

PostgreSQL is authoritative for product state.

### Reason

The product needs durable, queryable state for:

-   users
-   permissions
-   workflows
-   approvals
-   memories
-   audit events
-   tool actions

Redis is not authoritative.

## ADR-004: Native Tools Plus MCP

### Decision

Use native tools for critical first-party integrations and MCP where it
provides a useful integration boundary.

### Reason

Native tools provide strong control over:

-   schemas
-   authentication
-   retries
-   policy metadata
-   audit behavior
-   idempotency

MCP can accelerate integration and standardization, but it is not itself
a security boundary.

## ADR-005: Policy Engine Owns Side-Effect Authorization

### Decision

The agent cannot authorize its own actions.

Every side effect must pass through the policy engine.

### Reason

LLM output is probabilistic and must not be the final authorization
mechanism.

The policy engine provides deterministic control over:

-   permissions
-   risk
-   approval
-   action scope
-   account access

## ADR-006: WhatsApp Is the Primary Interface

### Decision

WhatsApp is the primary user interaction surface for v0.1.

### Reason

The product is intended to be India-first and conversational.

WhatsApp supports a natural interaction model for:

-   text
-   voice
-   documents
-   images
-   approvals
-   notifications

The web application remains the control center for settings and account
management.

## ADR-007: TypeScript Backend

### Decision

Use TypeScript for the primary application backend.

### Reason

The initial product benefits from:

-   shared types
-   strong SDK ecosystem
-   frontend/backend language consistency
-   good integration support
-   fast iteration

## ADR-008: Hybrid Memory

### Decision

Use structured memory plus semantic retrieval.

### Reason

Not all memory belongs in embeddings.

Structured facts such as:

-   relationships
-   preferences
-   commitments
-   workflow state

should be directly queryable.

Semantic retrieval is useful for:

-   relevant past interactions
-   episodic context
-   fuzzy recall

## ADR-009: Idempotency Is Mandatory

### Decision

Every side-effecting operation must have an idempotency strategy.

### Reason

Agent systems operate in environments with:

-   retries
-   timeouts
-   duplicate queue delivery
-   worker restarts
-   uncertain provider responses

Without idempotency, duplicate side effects are inevitable at scale.

## ADR-010: Progressive Tool Disclosure

### Decision

Do not expose the complete tool catalog to every agent turn.

### Reason

A narrow tool set improves:

-   tool selection
-   context efficiency
-   safety
-   latency
-   prompt injection resistance

The context engine should select the relevant tool subset.

## ADR-011: External Content Is Untrusted

### Decision

Email, documents, calendar descriptions, and tool output are treated as
untrusted data.

### Reason

Personal assistants operate on content controlled by other people and
systems.

External content must never override system instructions or policy.

## ADR-012: Reliability Before Breadth

### Decision

Do not expand into UPI, banking, travel, shopping, government services,
or other high-complexity integrations until the v0.1 agent loop is
reliable.

### Reason

The core product hypothesis is not that Sahaay has many integrations.

The core hypothesis is that Sahaay can reliably understand a user's
intent and complete useful work on their behalf.

Breadth should follow proof of reliability.

## ADR-013: Approval Is a First-Class Product Primitive

### Decision

Approval is modeled as a durable entity and workflow state.

### Reason

Approval is not merely a UI button.

The system needs to know:

-   what was approved
-   by whom
-   when
-   under which policy
-   whether the action changed after approval
-   whether approval expired
-   whether it was consumed

## ADR-014: Auditability Is Required for Side Effects

### Decision

Every important action must have a traceable audit history.

### Reason

Users need to understand:

-   what Sahaay did
-   why it did it
-   what was approved
-   what external system responded
-   whether the workflow completed

This is also essential for debugging and security.

## ADR-015: Do Not Let the Model Own Credentials

### Decision

Credentials remain outside model context.

### Reason

Credential exposure is an unacceptable failure mode.

The model receives capability information, not secrets.

## ADR-016: Design for the Moat Without Building It at Launch

**Status:** Proposed recording of user-directed strategic constraints; no new infrastructure decision.  
**Classification:** **NEEDED FOR MVP** for the complexity boundary; **DEFER UNTIL VALIDATED** for moat investments.

### Context and proposed decision

Sahaay's long-term differentiation is a personal operating system whose context, persistent workflows, meaningful Action History and granular trust compound. Interfaces and model infrastructure are replaceable. Retain the existing stack and safety decisions; build only what the current user-defined launch actions and multilingual voice support need. Preserve future options with ordinary module boundaries and stable IDs, not speculative services.

Defer sophisticated Personal Graph, generalized Autopilots, behavioral learning, prediction, multi-model routing, skills ecosystem, India-wide integration abstractions, graph databases and advanced proactive intelligence. Do not build a workflow engine above Temporal, multi-agent architecture, custom agent framework or a global full-autonomy switch.

### Tradeoffs and impact

Favor launch speed and later refactoring over speculative reuse. Some future features will require schema/code changes; that is acceptable. This clarifies ADR-002/007/012 and the product thesis rather than replacing them. Update PRD/Architecture/Roadmap strategy vocabulary. There is no application code/data migration today.

## ADR-017: Earlier Five-Workflow Launch Proposal — Superseded

**Status:** Superseded proposal. Its invoice-first and text-only scope is not current; see accepted user priority ADR-019. Remaining broader deferrals/structured-memory timing need separate disposition.  
**Classification:** **NEEDED FOR MVP** for five workflows and minimum controls; **DEFER UNTIL VALIDATED** for explicitly listed baseline capabilities.

### Context and proposed decision

PRD §4 and ADR-008 currently make broad features and semantic retrieval initial requirements, contrary to the requested extremely small launch. Propose launch acceptance around Calendar lookup, one-time reminder, email search, approved send and bounded invoice follow-up, plus supporting identity/connections/text WhatsApp/small web controls/history/minimal memory. SQL people references, optional explicit relationships, timezone/preferences and existing action/workflow context suffice initially.

Defer media, Calendar mutations/conflict UX, recurring reminders/rich completion-reschedule UI, Gmail-persisted draft management/standalone reply composition, semantic retrieval/embeddings, behavioral memory and broad opportunity detection. Follow-up threading, local approval drafts/editing and cancellation remain included. No recurring monthly invoice Autopilot.

### Tradeoffs and impact

Narrower launch has less breadth and fuzzy recall, but validates useful persistent behavior sooner. It changes PRD §§4/12 launch acceptance, Roadmap exits, Architecture §§12/13 and ADR-008's implementation timing. ADR-008's long-term hybrid direction remains; semantic retrieval ceases to be a launch gate only on acceptance of this proposal. ADR-006's primary-interface choice stays; deferring media is a capability timing change that must be recorded. No code/schema migration exists. If rejected, restore affected features explicitly to the plan; do not label the five-flow slice full v0.1 under the old boundary.

## ADR-018: Minimal Domain Seams for Persistent Work and Replaceable Models

**Status:** Proposed refinement; not accepted.  
**Classification:** **NEEDED FOR MVP** for domain/state boundaries; **DEFER UNTIL VALIDATED** for platform abstractions.

### Context and proposed decision

The new strategic nouns must not cause a new architecture. Personal Graph uses ordinary PostgreSQL people/preferences/relationships only where useful. Action History reuses existing request/proposal/approval/tool/audit/workflow evidence, including edits/rejections/cancellations needed for reliability. Durable reminders and approval waits use concrete Temporal workflows, not an Autopilot definition or platform. Invoice follow-up is deferred under ADR-019.

Isolate OpenAI SDK/model calls in the agent module; return typed domain proposals/results. Keep provider credentials, permission decisions, approved payloads, personal records and workflow state outside SDK-specific run objects. PostgreSQL owns product records; Temporal owns execution/timers; PostgreSQL status is a projection. Use a minimal transactional outbox and immutable logical action evidence to close actual dispatch/retry failure gaps. No provider-routing interface hierarchy or general workflow DSL.

### Tradeoffs and impact

A small amount of domain-specific code may be refactored later. Provider replacement still needs a real adapter and evaluation; independence does not mean zero migration cost. Refines ADR-001/003/005/014/015, Architecture execution/data model and Workflow transitions. The same tables/events serve safety and product history; avoid event sourcing everywhere. No code/data migration today. State ownership, authorization and safe uncertain outcomes must be agreed before implementation of the affected path.

## ADR-019: Multilingual Voice First; No Invoice MVP Requirement

**Status:** Accepted user-directed scope correction, 2026-10-03. Technical provider/library selections remain open.  
**Classification:** **NEEDED FOR MVP** for Hindi, English, Hinglish text and incoming voice notes; **DEFER UNTIL VALIDATED** for invoice features.

### Decision and reason

The user explicitly ranks invoice follow-up outside MVP and requires Hindi, English and Hinglish with voice-note support. Replace the old five-workflow launch gate with four general actions (Calendar lookup, one-time reminder, email search and approved email send) delivered across these languages and input modes. No invoice-specific schema/tool/polling/follow-up workflow, test gate or first-Autopilot mandate. Reminders and approval waits still prove durable execution with Temporal.

Use an existing multilingual speech service, selected/evaluated during implementation, not a custom speech model. Isolate transcription/model-specific invocation in small modules. Secure authenticated audio download, limits, temporary storage/cleanup, transcript provenance, code switching and clarification are MVP needs. Text replies suffice; TTS/live voice calls are not newly added scope.

### Tradeoffs and documentation impact

Invest initial effort in useful voice/language usability rather than invoice polling/follow-up orchestration. Transcription adds provider cost/latency/privacy requirements and real-audio quality tests, without justifying a media platform. Update PRD/reference examples and acceptance, Workflow voice pipeline, Architecture/Strategy reviews, Roadmap and Implementation Plan. ADR-017 is superseded where it required invoices or deferred voice; other unaccepted feature deferrals remain proposed. Existing stack/security ADRs remain intact; no product code/data migration exists.

## ADR-020: Synchronous First, Shared Voice Pipeline and One Composed Workflow

**Status:** Accepted user-directed amendments, 2026-10-03.  
**Classification:** NEEDED FOR MVP; Calendar creation is an MVP stretch goal, not a launch gate.

### Decision

Approve the implementation overview with these refinements: initial requests use a synchronous message → single agent → authorized read tool → response, independent of Temporal. Add the existing Temporal engine when approval waits/reminders/delayed or restart-safe work need it. All languages and voice transcripts converge on the same request pipeline; no per-language agents. Keep useful detected-language/code-switching/transcription/debug metadata when available, with bounded privacy controls and no fabricated fields.

Response language precedence is explicit per-request instruction → configured response preference → natural current-input language (English, Hindi or Hinglish/code-switched). Keep exactly one small composed workflow at launch: resolve Rahul, locate tomorrow's meeting, read his latest relevant email and schedule/deliver an existing reminder 30 minutes beforehand. Clarify missing/ambiguous identity/meeting/time; never invent a meeting or create Calendar events implicitly.

`calendar.create_event` is an optional stretch addition to the existing typed native-tool, policy/approval and durable-execution boundary. No mutation implementation or unused OAuth scope is required for launch. Add no infrastructure, platform abstraction or additional cross-service workflow. Invoices stay deferred under ADR-019.

### Tradeoffs and impact

Reads launch earlier and remain usable if Temporal is unavailable; new durable work may be pending/blocked without disrupting informational requests. Voice processing adds only an input-normalization module and bounded metadata, not another agent. The composed workflow demonstrates context and orchestration using tools/timers already required; it is not a generic Autopilot. Update overview/plan and source scope/Workflow/architecture documents; preserve TypeScript/PostgreSQL/Redis/Temporal/SDK/security decisions. No code/data migration exists.

## 17. Decision Change Process

If Codex or an engineer believes an architectural decision should
change:

1.  Do not silently modify the decision.
2.  Document the issue.
3.  Propose an ADR.
4.  Explain tradeoffs.
5.  Identify migration impact.
6.  Update affected architecture documents.
7.  Only then implement the new approach.

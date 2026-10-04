# Sahaay Product and Engineering Roadmap

**Version:** 0.1\
**Goal:** Build the smallest trustworthy personal-agent system first,
then expand capability.

## Approved MVP amendments — 2026-10-03

**Status:** Accepted user direction; supersedes earlier invoice-first/text-only scope and implementation ordering. Unsettled technical selections remain proposed. No product implementation started.

**NEEDED FOR MVP:** Hindi, English and Hinglish text/voice, four general actions (Calendar lookup, one-time reminder, general email search, approved email send), and exactly one small cross-service workflow: “I'm meeting Rahul tomorrow. Find the last relevant email from him and remind me 30 minutes before the meeting.” Reuse person resolution, Calendar/Gmail reads, contextual reasoning and durable reminder delivery; no generalized Autopilot.

**NEEDED FOR MVP:** First prove a synchronous message → agent → authorized read-only tool → response with Temporal absent. Introduce the existing Temporal engine only for reminders, approval waits, delayed work and restart-safe execution. Voice transcription enters exactly the same normalized request/agent/policy pipeline as text. One agent for all languages; preserve source, transcript/model version, detected language/code-switching metadata where available, uncertainty and evaluation references under bounded retention. Unavailable metadata stays unknown; never fabricate it.

**NEEDED FOR MVP:** Response language follows the current input naturally: English → English, Hindi → Hindi, Hinglish/code-switched → natural Hinglish. An explicit request takes priority, then a configured response preference, then current-input language. Language metadata guides presentation, never authorization. Replies may be text; TTS/live calls/custom speech models are not required.

**MVP STRETCH GOAL — not a launch gate:** Calendar creation via `calendar.create_event`. Keep the same typed native-tool proposal/policy/approval/execution boundary so this tool can be added without architectural changes. Do not implement a write adapter or request unused OAuth scopes just to preserve the seam. Calendar update/cancel and broad scheduling remain deferred.

**DEFER UNTIL VALIDATED:** All invoice-specific features; generalized Autopilots, rich Graph/memory/learning/prediction/model-routing/skills platforms; images/documents, rich recurrence and future India-wide integrations. No new infrastructure or extra cross-service workflow. The approved overview guides the small launch; broader historical lists below do not override this boundary.

See [IMPLEMENTATION_OVERVIEW.md](IMPLEMENTATION_OVERVIEW.md) for readable pointers, [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for milestones and ADR-020 in [DECISIONS.md](DECISIONS.md) for the recorded amendment.

## 1. Roadmap Philosophy

The roadmap is organized around increasing capability only after
reliability has been demonstrated.

Sequence:

``` text
Reliable assistant
    ->
Reliable workflows
    ->
Personal memory
    ->
Proactive assistance
    ->
More integrations
    ->
Higher autonomy
```

Do not reverse this sequence.

## 2. Phase 0: Foundation

### Objective

Create the core backend and development environment.

### Work

-   Monorepo
-   TypeScript configuration
-   API service
-   Worker service
-   Web app
-   PostgreSQL
-   Redis
-   Temporal
-   Authentication
-   Environment configuration
-   Secrets handling
-   Logging
-   OpenTelemetry
-   CI

### Exit criteria

-   Services start locally.
-   Database migrations work.
-   Temporal workflow executes locally.
-   API can authenticate a test user.
-   Basic tracing works.

## 3. Phase 1: Agent Core

### Objective

Implement the basic request-to-tool loop.

### Work

-   OpenAI Agents SDK integration
-   Request normalization
-   Context engine
-   Tool registry
-   Tool schemas
-   Agent state
-   Structured action proposals
-   Policy engine skeleton
-   Tool execution abstraction

### Exit criteria

The agent can reliably:

-   understand a request
-   select a tool
-   produce valid arguments
-   receive a tool result
-   generate a final response

No high-risk side effects yet.

## 4. Phase 2: Google Integrations

### Objective

Connect the initial productivity stack.

### Gmail

-   OAuth
-   Search
-   Read
-   Draft
-   Send
-   Thread retrieval

### Calendar

-   OAuth
-   List
-   Search
-   Create
-   Update
-   Cancel
-   Conflict detection

### Contacts

-   Search
-   Identity resolution

### Exit criteria

Reference workflows 1 through 4 work end-to-end in a controlled
environment.

## 5. Phase 3: Permissions and Approval

### Objective

Make side effects safe.

### Work

-   Permission model
-   Policy engine
-   Approval model
-   Approval API
-   WhatsApp approval messages
-   Web approval UI
-   Action hash
-   Approval expiry
-   Audit events
-   Idempotency

### Exit criteria

The system cannot send an email without the required policy/approval.

Duplicate execution tests pass.

## 6. Phase 4: Durable Workflows

### Objective

Make Sahaay capable of long-running tasks.

### Work

-   Reminder workflows
-   Approval waiting

Deferred until validated:

-   Invoice/follow-up workflows
-   Temporal timers
-   Retry policies
-   Cancellation
-   Resume after worker restart
-   Workflow state UI

### Deferred example — not an MVP exit criterion

Invoice follow-up may be evaluated later across:

-   approval
-   send
-   waiting
-   incoming response
-   no response
-   follow-up approval
-   completion

## 7. Phase 5: Memory

### Objective

Make Sahaay meaningfully personal.

### Work

-   User profile
-   People graph
-   Relationship model
-   Episodic memory
-   Semantic memory
-   Structured memory
-   Memory retrieval
-   Memory write policy
-   Memory inspection UI
-   Memory deletion

### Initial memory examples

-   Relationship between people
-   User communication preferences
-   Recurring commitments
-   Important previous actions

### Exit criteria

Memory retrieval improves reference workflows without introducing
incorrect personalization.

## 8. Phase 6: WhatsApp

### Objective

Make WhatsApp the primary daily interaction surface.

### Work

-   WhatsApp Business integration
-   Incoming messages
-   Voice messages
-   Documents
-   Images
-   Approval interactions
-   Workflow notifications
-   Retry handling
-   Webhook security

### Exit criteria

A user can perform the complete v0.1 workflow set primarily through
WhatsApp.

## 9. Phase 7: Proactive Assistance

### Objective

Move from reactive assistant to useful assistant.

Initial proactive behaviors:

-   Due reminder
-   Pending approval
-   Expected response received
-   Workflow failure
-   Workflow completion
-   Follow-up required

The system should avoid notification spam.

Every proactive event should have:

-   reason
-   relevance
-   action
-   dismiss option

## 10. Phase 8: Evaluation and Hardening

### Objective

Increase reliability before adding major integrations.

### Work

-   Golden test suite
-   Tool selection evaluation
-   Argument correctness evaluation
-   Policy evaluation
-   Prompt injection tests
-   Memory retrieval evaluation
-   Workflow replay tests
-   Duplicate side-effect tests
-   Provider failure tests
-   Load tests
-   Security tests

### Exit criteria

Core workflows demonstrate stable reliability under simulated failures.

## 11. Phase 9: India-Specific Expansion

Only after v0.1 is reliable.

Potential integrations:

-   UPI
-   Indian payments
-   Travel
-   Shopping
-   Government services
-   DigiLocker
-   ONDC
-   Account Aggregator
-   Indian language expansion

Each integration should be evaluated separately for:

-   user demand
-   legal constraints
-   security risk
-   provider reliability
-   permission complexity
-   monetization potential

## 12. Phase 10: Higher Autonomy

Autonomy should be introduced gradually.

Possible controls:

### Always ask

User approval for every side effect.

### Ask for risky actions

Low-risk actions can be automated, risky actions require approval.

### Trusted automation

Specific workflows can execute automatically.

### Full workflow policy

User defines rules such as:

> For routine calendar scheduling with known contacts, handle it
> automatically.

The system must keep a clear activity history.

## 13. Suggested Milestones

### Milestone A

Request -\> Agent -\> Read-only tool -\> Response.

### Milestone B

Request -\> Agent -\> Policy -\> Approval -\> Side effect.

### Milestone C

Request -\> Workflow -\> Wait -\> Resume -\> Side effect.

### Milestone D

Request -\> Memory -\> Workflow -\> Proactive notification.

### Milestone E

WhatsApp-first daily assistant.

## 14. What Not to Build Early

Avoid:

-   Multi-agent orchestration
-   Custom model training
-   Custom vector database
-   Browser automation
-   Huge tool marketplaces
-   Dozens of integrations
-   Autonomous purchasing
-   Financial automation
-   Complex recommendation systems

These may become useful later, but they should not slow down validation
of the core product.

## 15. Engineering Priority Order

When choosing between features, prioritize:

1.  Correctness
2.  Safety
3.  Reliability
4.  Observability
5.  User experience
6.  Speed
7.  Breadth

## 16. Product Expansion Rule

A new integration should not be added merely because it is technically
possible.

Add it when:

-   users repeatedly request it
-   the workflow is clearly defined
-   permissions are understandable
-   the risk model is acceptable
-   the integration can be made reliable
-   the integration strengthens the core assistant loop

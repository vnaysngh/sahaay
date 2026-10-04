# Sahaay Product Requirements Document

**Version:** 0.1\
**Status:** Locked for initial implementation\
**Product:** Sahaay\
**Audience:** Founders, product, engineering, Codex

## Approved MVP amendments — 2026-10-03

**Status:** Accepted user direction; supersedes earlier invoice-first/text-only scope and implementation ordering. Unsettled technical selections remain proposed. No product implementation started.

**NEEDED FOR MVP:** Hindi, English and Hinglish text/voice, four general actions (Calendar lookup, one-time reminder, general email search, approved email send), and exactly one small cross-service workflow: “I'm meeting Rahul tomorrow. Find the last relevant email from him and remind me 30 minutes before the meeting.” Reuse person resolution, Calendar/Gmail reads, contextual reasoning and durable reminder delivery; no generalized Autopilot.

**NEEDED FOR MVP:** First prove a synchronous message → agent → authorized read-only tool → response with Temporal absent. Introduce the existing Temporal engine only for reminders, approval waits, delayed work and restart-safe execution. Voice transcription enters exactly the same normalized request/agent/policy pipeline as text. One agent for all languages; preserve source, transcript/model version, detected language/code-switching metadata where available, uncertainty and evaluation references under bounded retention. Unavailable metadata stays unknown; never fabricate it.

**NEEDED FOR MVP:** Response language follows the current input naturally: English → English, Hindi → Hindi, Hinglish/code-switched → natural Hinglish. An explicit request takes priority, then a configured response preference, then current-input language. Language metadata guides presentation, never authorization. Replies may be text; TTS/live calls/custom speech models are not required.

**MVP STRETCH GOAL — not a launch gate:** Calendar creation via `calendar.create_event`. Keep the same typed native-tool proposal/policy/approval/execution boundary so this tool can be added without architectural changes. Do not implement a write adapter or request unused OAuth scopes just to preserve the seam. Calendar update/cancel and broad scheduling remain deferred.

**DEFER UNTIL VALIDATED:** All invoice-specific features; generalized Autopilots, rich Graph/memory/learning/prediction/model-routing/skills platforms; images/documents, rich recurrence and future India-wide integrations. No new infrastructure or extra cross-service workflow. The approved overview guides the small launch; broader historical lists below do not override this boundary.

See [IMPLEMENTATION_OVERVIEW.md](IMPLEMENTATION_OVERVIEW.md) for readable pointers, [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for milestones and ADR-020 in [DECISIONS.md](DECISIONS.md) for the recorded amendment.

## 1. Product Vision

Sahaay is an action-oriented personal AI assistant for Indian users.

The core promise is:

> Tell me what you need. I'll figure out the rest.

Sahaay should not behave like a chatbot that merely answers questions.
It should understand intent, retrieve the right personal context, decide
what needs to happen, ask for approval when required, execute actions
through connected systems, and keep track of work until completion.

The initial product should be intentionally narrow. Reliability, trust,
permissions, and durable execution matter more than breadth.

## 2. Product Principles

1.  **Action over conversation.** The assistant should complete useful
    work rather than only provide information.
2.  **User control.** Side effects must be governed by explicit
    permissions and approval policies.
3.  **Reliability over autonomy.** A deterministic workflow system
    should execute important actions.
4.  **Context over prompting.** Personal context should be retrieved
    from structured memory and relevant history.
5.  **Progressive autonomy.** Sahaay earns permission to automate more
    through explicit user settings.
6.  **India-first interfaces.** WhatsApp, voice, Hindi, English, Hinglish, Indian names,
    and local communication patterns should be first-class
    considerations.
7.  **Minimal initial scope.** v0.1 should prove the core agent loop
    before expanding into payments, travel, shopping, or government
    services.

## 3. Target User

The initial user is a digitally active Indian user who:

-   Uses Gmail and Google Calendar.
-   Communicates frequently through WhatsApp.
-   Has recurring personal commitments and follow-ups.
-   Wants help managing routine personal work.
-   Is comfortable connecting accounts to an assistant if permissions
    are clear.
-   Values speed and convenience but wants control over important
    actions.

## 4. v0.1 Product Boundary

### Included

### WhatsApp interface

Support:

-   Text messages
-   Voice messages
-   Images
-   Documents
-   Conversation-based requests
-   Approval prompts
-   Workflow status updates

### Web application

The web application provides:

-   Authentication
-   Onboarding
-   Connected accounts
-   Permission management
-   Activity history
-   Workflow history
-   Memory/settings
-   Approval inbox
-   Basic account management

### Gmail

Supported operations:

-   Search emails
-   Read email
-   Summarize email/thread
-   Draft email
-   Reply
-   Send
-   Schedule or track follow-ups

### Google Calendar

Supported operations:

-   List events
-   Search events
-   Create events
-   Update events
-   Cancel events
-   Detect obvious scheduling conflicts

### Google Contacts

Supported operations:

-   Search contacts
-   Resolve people referenced in conversations
-   Resolve ambiguous names when enough information exists

### Reminders

Support:

-   One-time reminders
-   Recurring reminders
-   Deadline reminders
-   Follow-up reminders
-   Reminder completion
-   Reminder rescheduling

### Personal memory

Sahaay may remember:

-   User preferences
-   People and relationships
-   Relevant past actions
-   Recurring behavior
-   Commitments
-   Useful communication preferences

Memory must be user-controllable and must not become an uncontrolled
transcript dump.

### Limited proactive assistance

Sahaay may proactively:

-   Surface due reminders
-   Surface pending approvals
-   Detect relevant follow-up opportunities
-   Notify the user when an expected response arrives
-   Notify the user when a workflow succeeds or fails

## 5. Explicit v0.1 Non-Goals

Do not implement in v0.1:

-   UPI actions
-   Bank actions
-   Account Aggregator
-   DigiLocker
-   ONDC
-   Travel booking
-   Shopping purchases
-   Healthcare workflows
-   Government application workflows
-   Browser automation
-   Autonomous financial actions
-   Multi-agent swarm architecture
-   Custom foundation models
-   Custom speech models
-   Broad recommendation engine
-   Fully autonomous purchasing
-   Fully autonomous external communication without policy controls

## 6. Core User Experience

The basic loop is:

1.  User asks Sahaay to do something.
2.  Sahaay understands the request.
3.  Sahaay retrieves relevant context.
4.  Sahaay determines whether the task is:
    -   informational,
    -   reversible,
    -   side-effecting,
    -   approval-required,
    -   or a long-running workflow.
5.  Sahaay proposes or executes the next step according to policy.
6.  The workflow engine performs durable work.
7.  Sahaay reports the result.
8.  If the task continues over time, the workflow remains active and
    resumes when needed.

## 7. Reference Workflows

### Workflow 1: Calendar lookup

User:

> What's on my calendar tomorrow?

Expected behavior:

-   Resolve tomorrow in the user's timezone.
-   Query Google Calendar.
-   Return a concise chronological summary.
-   No approval required.

### Workflow 2: Reminder

User:

> Remind me to call Rahul tomorrow at 11.

Expected behavior:

-   Resolve Rahul only if useful.
-   Create reminder.
-   Confirm creation.
-   No approval required.

### Workflow 3: Email search

User:

> Find the email where Rahul sent the presentation.

Expected behavior:

-   Search Gmail.
-   Resolve likely Rahul contact if necessary.
-   Identify relevant messages.
-   Present concise results.
-   Do not modify email.

### Workflow 4: Send email

User:

> Tell Rahul I'll send the payment tomorrow.

Expected behavior:

-   Resolve Rahul.
-   Draft the intended email.
-   Present the draft.
-   Require approval unless the user's explicit policy permits this
    class of send.
-   Send after approval.
-   Record the action.

### Cross-service launch workflow: Meeting context and reminder

**NEEDED FOR MVP — exactly one cross-service reference workflow:**

> I'm meeting Rahul tomorrow. Find the last relevant email from him and remind me 30 minutes before the meeting.

Resolve the correct Rahul and tomorrow in the user's timezone, find the intended existing Calendar meeting, retrieve his last relevant email, summarize useful context and create a one-time reminder 30 minutes before the confirmed start. Clarify multiple people/meetings, missing meeting time or ambiguous relevance. Do not silently create a Calendar event. If no email matches, report it without inventing context; the confirmed meeting can still support the requested reminder. Confirm only after durable reminder scheduling is accepted, and survive restart until delivery. See WORKFLOWS.md for failure/ambiguity rules.

### Launch requirement: Hindi, English and Hinglish voice notes

**NEEDED FOR MVP:** Each of workflows 1–4 must work from text and incoming voice notes in Hindi, English and Hinglish. This replaces invoice follow-up as a launch requirement; it is not an additional business workflow.

Examples:

- English: “Remind me to call Rahul tomorrow at eleven AM.”
- Hindi: “कल सुबह ग्यारह बजे राहुल को फ़ोन करने की याद दिलाना।”
- Hinglish: “Kal subah eleven baje Rahul ko call karne ka reminder laga do.”

Expected behavior:

- Securely receive the voice note and transcribe using an existing provider.
- Preserve language switching, names, dates and AM/PM; confirm uncertain interpretations.
- Use the same policy, approval and durable action path as text.
- Respond with understandable text in the requested/preferred language.
- Do not execute an uncertain recipient/date or an unapproved send.

**DEFER UNTIL VALIDATED:** Invoice search/extraction/follow-up automation and monthly invoice collection. General email search remains included, with non-invoice evaluation examples.

## 8. Success Metrics

Initial product metrics should focus on reliability rather than raw
message volume.

### Core metrics

-   Request completion rate
-   Correct tool selection rate
-   Approval accuracy
-   Workflow failure rate
-   Duplicate side-effect rate
-   Average time to completion
-   User correction rate
-   User cancellation rate
-   Memory retrieval usefulness
-   Proactive notification usefulness

### Trust metrics

-   Unauthorized action rate
-   Incorrect recipient rate
-   Incorrect calendar mutation rate
-   Duplicate email rate
-   Permission-policy violation rate

For side-effecting actions, the target unauthorized-action rate should
be effectively zero.

## 9. Product Requirements

### PR-1 Intent understanding

Sahaay must convert a natural-language request into a structured task
representation.

### PR-2 Context retrieval

The system must retrieve only context relevant to the current request.

### PR-3 Tool selection

The agent must have access to tools appropriate for the current task and
must not receive an unnecessarily large tool catalog.

### PR-4 Policy evaluation

Every side-effecting action must pass policy evaluation before
execution.

### PR-5 Durable execution

Long-running workflows must survive process restarts, retries, and
temporary provider failures.

### PR-6 Approval

The system must support explicit human approval before sensitive side
effects.

### PR-7 Idempotency

Every external side effect must use an idempotency strategy.

### PR-8 Auditability

The system must record what was requested, proposed, approved, executed,
and returned.

### PR-9 Memory

The system must distinguish durable personal facts from transient
conversation context.

### PR-10 Failure recovery

Failures must be classified and handled deterministically where
possible.

## 10. Non-Functional Requirements

### Reliability

The system should favor deterministic workflows over free-form agent
execution for important operations.

### Security

Credentials, permissions, tool execution, and personal data must be
isolated and auditable.

### Privacy

Only necessary data should be retained and retrieved.

### Observability

Every important workflow should have traceability across:

-   User request
-   Agent decision
-   Policy decision
-   Tool call
-   Workflow execution
-   External provider response

### Performance

Simple requests should feel conversational. Long-running workflows may
execute asynchronously.

## 11. Initial User-Facing Surfaces

### WhatsApp

Primary interaction surface.

### Web application

Secondary surface for:

-   Settings
-   Connections
-   Permissions
-   Activity
-   Memory
-   Approvals

## 12. v0.1 Definition of Done

v0.1 is complete when:

-   A user can authenticate.
-   A user can connect Gmail and Google Calendar.
-   WhatsApp requests can enter the Sahaay backend.
-   The agent supports the four launch actions and the single Rahul meeting/email/reminder workflow through Hindi, English and Hinglish text and voice notes.
-   Calendar and email tools work reliably.
-   Side effects pass through policy checks.
-   Approval works through WhatsApp and web.
-   Reminder timers and approval waits survive restarts.
-   Every side effect is idempotent.
-   Activity history is available.
-   Basic memory works.
-   Evaluation tests cover core workflows and common failure cases.

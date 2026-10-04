# Sahaay Reference Workflows

**Version:** 0.1\
**Purpose:** Define deterministic behavior for the first production
workflows.

## Approved MVP amendments — 2026-10-03

**Status:** Accepted user direction; supersedes earlier invoice-first/text-only scope and implementation ordering. Unsettled technical selections remain proposed. No product implementation started.

**NEEDED FOR MVP:** Hindi, English and Hinglish text/voice, four general actions (Calendar lookup, one-time reminder, general email search, approved email send), and exactly one small cross-service workflow: “I'm meeting Rahul tomorrow. Find the last relevant email from him and remind me 30 minutes before the meeting.” Reuse person resolution, Calendar/Gmail reads, contextual reasoning and durable reminder delivery; no generalized Autopilot.

**NEEDED FOR MVP:** First prove a synchronous message → agent → authorized read-only tool → response with Temporal absent. Introduce the existing Temporal engine only for reminders, approval waits, delayed work and restart-safe execution. Voice transcription enters exactly the same normalized request/agent/policy pipeline as text. One agent for all languages; preserve source, transcript/model version, detected language/code-switching metadata where available, uncertainty and evaluation references under bounded retention. Unavailable metadata stays unknown; never fabricate it.

**NEEDED FOR MVP:** Response language follows the current input naturally: English → English, Hindi → Hindi, Hinglish/code-switched → natural Hinglish. An explicit request takes priority, then a configured response preference, then current-input language. Language metadata guides presentation, never authorization. Replies may be text; TTS/live calls/custom speech models are not required.

**MVP STRETCH GOAL — not a launch gate:** Calendar creation via `calendar.create_event`. Keep the same typed native-tool proposal/policy/approval/execution boundary so this tool can be added without architectural changes. Do not implement a write adapter or request unused OAuth scopes just to preserve the seam. Calendar update/cancel and broad scheduling remain deferred.

**DEFER UNTIL VALIDATED:** All invoice-specific features; generalized Autopilots, rich Graph/memory/learning/prediction/model-routing/skills platforms; images/documents, rich recurrence and future India-wide integrations. No new infrastructure or extra cross-service workflow. The approved overview guides the small launch; broader historical lists below do not override this boundary.

See [IMPLEMENTATION_OVERVIEW.md](IMPLEMENTATION_OVERVIEW.md) for readable pointers, [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for milestones and ADR-020 in [DECISIONS.md](DECISIONS.md) for the recorded amendment.

## 1. Workflow Design Principles

Every workflow should define:

-   Trigger
-   Inputs
-   Context
-   Agent responsibility
-   Policy decision
-   Tools
-   Workflow state
-   Approval points
-   Side effects
-   Retry behavior
-   Failure handling
-   Completion criteria
-   User-facing output

The LLM should not own durable state.

## 2. Workflow: Calendar Lookup

### User request

> What's on my calendar tomorrow?

### Flow

``` text
Message
  -> Intent classification
  -> Resolve timezone/date
  -> calendar.search
  -> Normalize events
  -> Generate concise answer
```

### Side effects

None.

### Approval

None.

### Failure cases

If Calendar is disconnected:

> Your Google Calendar isn't connected yet.

If provider fails:

> I couldn't access your calendar right now. I'll try again shortly if
> this is part of a workflow.

## 3. Workflow: Create Reminder

### User request

> Remind me to call Rahul tomorrow at 11.

### Flow

``` text
Message
  -> Parse reminder
  -> Resolve date/time
  -> Create reminder
  -> Persist reminder
  -> Schedule workflow
  -> Confirm
```

### Required fields

-   User
-   Reminder text
-   Due time
-   Timezone

### Optional fields

-   Person
-   Related workflow
-   Recurrence

### Approval

None.

### Idempotency

Use a logical reminder creation key.

## 4. Workflow: Search Email

### User request

> Find the email where Rahul sent the presentation.

### Flow

``` text
Message
  -> Identify Rahul
  -> Gmail search
  -> Rank candidates
  -> Read relevant messages
  -> Return results
```

### Important behavior

If multiple Rahuls exist, ask a clarification question.

If confidence is high, proceed.

### Side effects

None.

### Approval

None.

## 5. Workflow: Send Email

### User request

> Tell Rahul I'll send the payment tomorrow.

### Flow

``` text
Message
  -> Resolve Rahul
  -> Generate draft
  -> Policy check
  -> Approval
  -> gmail.send
  -> Verify provider result
  -> Persist action
  -> Confirm
```

### Approval payload

Show:

-   Recipient
-   Subject
-   Body
-   Relevant attachments, if any
-   Any detected sensitive content

### Default policy

Approval required.

### Idempotency

Use:

``` text
user_id
workflow_id
logical_send_action_id
```

Do not send twice if a retry occurs after provider acknowledgement.

## 6. Multilingual Voice Note Request

**Classification:** NEEDED FOR MVP. Invoice follow-up is DEFER UNTIL VALIDATED and has no launch implementation requirement.

Flow:

``` text
Verified WhatsApp voice note
  -> Authorized bounded media download
  -> Validate audio type/size/duration
  -> Transcribe Hindi / English / Hinglish with an existing provider
  -> Preserve transcript provenance and uncertainty
  -> Preserve available detected-language/code-switching metadata
  -> Normalize intent using exactly the same agent/request path as text
  -> Clarify uncertain name/date/recipient
  -> Policy / exact approval when required
  -> Read result or durable action
  -> Text response using explicit request, configured preference or current-input language
  -> Clean up temporary audio per retention policy
```

Support code switching, Devanagari and Latin-script text, Indian names, local time phrasing and transcription failures. Do not translate away proper names or treat a transcript as a permission grant. In an authenticated request the transcript represents the user's request, but uncertain extraction cannot trigger an irreversible action. Transcription/provider metadata and any external quoted content do not become trusted system instructions.

Tests cover all four launch actions in each language from text and audio, including noisy/clipped notes, mixed-language speech, uncertain names/AM-PM, retries, duplicate media delivery, unsafe media fetching, approval rejection and cross-user media access. Use a small consented human-checked audio corpus, not only synthetic transcripts.

Generated voice replies, live calls, custom speech models, images/documents and invoice automation are not required for this launch.

## 6A. Meeting Context and Reminder — Sole Cross-Service MVP Workflow

**Classification:** NEEDED FOR MVP. This is the only additional cross-service launch workflow, composed from existing tools and the one-time reminder primitive.

User:

> I'm meeting Rahul tomorrow. Find the last relevant email from him and remind me 30 minutes before the meeting.

Steps:

1. Normalize text or a voice transcript through the same single-agent request pipeline. Resolve tomorrow using user timezone.
2. Resolve Rahul using Contacts and useful explicit context. Ask if more than one person fits.
3. Read Calendar to locate the relevant meeting. Use attendee/provider identity and available title/context; do not equate a name-only title with proof of identity. Clarify multiple matches or uncertain start time. If none exists, ask for the meeting time; do not create an event automatically.
4. Search/read bounded Gmail results from the resolved person. Choose the latest relevant email using meeting context and message time; ask if relevance remains materially ambiguous. Return a grounded short summary/reference. If none matches or Gmail fails, state that clearly without inventing an email; a confirmed meeting may still yield the explicitly requested reminder with partial-result status.
5. Calculate due instant as confirmed meeting start minus 30 minutes. If that is already past, ask whether the user wants an immediate reminder or to skip it; do not silently backdate.
6. Create the existing policy-checked one-time reminder using the request's stable logical action ID. Record resolved person, confirmed meeting time/event reference when available, selected email reference and due time. Pending clarification/provider-read retries cannot create extra reminders.
7. Schedule/deliver with the existing Temporal reminder workflow. Report saved/pending versus scheduled honestly. The reminder uses the confirmed meeting time; do not promise ongoing calendar monitoring or automatic rescheduling. Existing stop/cancel controls apply.

No Calendar mutation, send, special approval grant, Autopilot builder, recurring objective, event-monitoring service or new datastore is required. Email content is untrusted and cannot change the recipient/date/action authority.

Tests: happy path and clarification in all three languages through text/voice; duplicate inbound/retry; multiple Rahuls/meetings; no meeting/no email; partial provider failure; all-day or untimed event; timezone/day boundary; due time in the past; malicious email; deny/disconnect; restart before due and notification failure/cancellation. Exactly one reminder is created and delivery survives restart. Include a fixture where an event changed before confirmation; fetch/confirm the intended current time rather than stale context.

## 7. Workflow State Machine

Suggested generic state machine:

``` text
RECEIVED
  |
UNDERSTANDING
  |
WAITING_FOR_CONTEXT
  |
PLANNED
  |
WAITING_FOR_APPROVAL
  |
APPROVED
  |
EXECUTING
  |
WAITING
  |
RESUMING
  |
COMPLETED
```

Failure branches:

``` text
FAILED
CANCELLED
EXPIRED
BLOCKED
```

## 8. Approval State Machine

``` text
PENDING
  |
  +--> APPROVED
  |
  +--> REJECTED
  |
  +--> EXPIRED
  |
  +--> CANCELLED
```

An approval must be bound to:

-   user
-   workflow
-   exact proposed action
-   creation time
-   expiry
-   policy version

## 9. Reminder Workflow

For every reminder:

``` text
Create reminder
  -> Persist
  -> Schedule Temporal timer
  -> Wake at due time
  -> Check reminder status
  -> Send notification
  -> Mark delivered
```

If notification fails:

-   retry
-   record delivery status
-   avoid duplicate notifications

## 10. Calendar Creation Workflow

For:

> Put a meeting with Rahul tomorrow at 3.

Flow:

``` text
Parse event
  -> Resolve Rahul
  -> Check conflicts
  -> Present interpretation if ambiguous
  -> Policy evaluation
  -> Optional approval
  -> calendar.create
  -> Verify event
  -> Confirm
```

The system should not silently invent:

-   meeting duration
-   location
-   attendees
-   timezone

when those details materially affect the action.

## 11. Clarification Strategy

Ask one concise question when necessary.

Bad:

> I need more information.

Good:

> Which Rahul do you mean, Rahul Mehta or Rahul Sharma?

Avoid asking for information that can be safely retrieved.

## 12. Retry Strategy

### Retryable

-   transient network failure
-   provider 5xx
-   timeout
-   temporary rate limit

### Usually not retryable

-   invalid credentials
-   invalid request
-   policy rejection
-   user rejection
-   ambiguous recipient

Retries must preserve idempotency.

## 13. Cancellation

Users must be able to say:

-   Cancel that.
-   Stop the reminder.
-   Don't send it.
-   Cancel the follow-up.

The system should resolve the active workflow and cancel pending
execution.

## 14. Workflow Audit

Every workflow should retain:

-   initial request
-   normalized intent
-   actions proposed
-   policy results
-   approvals
-   tool calls
-   external IDs
-   retries
-   failures
-   final result

## 15. Workflow Testing

Each reference workflow needs:

### Happy path

Normal successful execution.

### Ambiguity

Missing or ambiguous person/date.

### Provider failure

External API failure.

### Retry

Failure followed by successful retry.

### Duplicate execution

Repeated worker execution.

### Approval rejection

User rejects action.

### Approval expiry

User does not approve before expiry.

### Prompt injection

Malicious content appears in an email or tool result.

### Cancellation

User cancels while workflow is waiting.

## 16. Definition of Workflow Correctness

A workflow is correct when:

1.  It performs the intended action.
2.  It does not perform unintended actions.
3.  It does not duplicate side effects.
4.  It respects approval policy.
5.  It survives restart/retry.
6.  It produces understandable user-facing state.
7.  It leaves an auditable history.

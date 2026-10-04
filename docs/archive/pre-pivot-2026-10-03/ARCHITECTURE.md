# Sahaay System Architecture

**Version:** 0.1\
**Status:** Locked for initial implementation

## Approved MVP amendments — 2026-10-03

**Status:** Accepted user direction; supersedes earlier invoice-first/text-only scope and implementation ordering. Unsettled technical selections remain proposed. No product implementation started.

**NEEDED FOR MVP:** Hindi, English and Hinglish text/voice, four general actions (Calendar lookup, one-time reminder, general email search, approved email send), and exactly one small cross-service workflow: “I'm meeting Rahul tomorrow. Find the last relevant email from him and remind me 30 minutes before the meeting.” Reuse person resolution, Calendar/Gmail reads, contextual reasoning and durable reminder delivery; no generalized Autopilot.

**NEEDED FOR MVP:** First prove a synchronous message → agent → authorized read-only tool → response with Temporal absent. Introduce the existing Temporal engine only for reminders, approval waits, delayed work and restart-safe execution. Voice transcription enters exactly the same normalized request/agent/policy pipeline as text. One agent for all languages; preserve source, transcript/model version, detected language/code-switching metadata where available, uncertainty and evaluation references under bounded retention. Unavailable metadata stays unknown; never fabricate it.

**NEEDED FOR MVP:** Response language follows the current input naturally: English → English, Hindi → Hindi, Hinglish/code-switched → natural Hinglish. An explicit request takes priority, then a configured response preference, then current-input language. Language metadata guides presentation, never authorization. Replies may be text; TTS/live calls/custom speech models are not required.

**MVP STRETCH GOAL — not a launch gate:** Calendar creation via `calendar.create_event`. Keep the same typed native-tool proposal/policy/approval/execution boundary so this tool can be added without architectural changes. Do not implement a write adapter or request unused OAuth scopes just to preserve the seam. Calendar update/cancel and broad scheduling remain deferred.

**DEFER UNTIL VALIDATED:** All invoice-specific features; generalized Autopilots, rich Graph/memory/learning/prediction/model-routing/skills platforms; images/documents, rich recurrence and future India-wide integrations. No new infrastructure or extra cross-service workflow. The approved overview guides the small launch; broader historical lists below do not override this boundary.

See [IMPLEMENTATION_OVERVIEW.md](IMPLEMENTATION_OVERVIEW.md) for readable pointers, [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for milestones and ADR-020 in [DECISIONS.md](DECISIONS.md) for the recorded amendment.

## 1. Architectural Goal

Build Sahaay as a reliable personal-agent platform, not as a single
autonomous LLM process.

The key architectural rule is:

> The model decides what should happen. Deterministic infrastructure
> decides whether and how it happens.

The LLM is a reasoning component inside the system. It is not the source
of truth for permissions, workflow state, credentials, or side-effect
execution.

## 2. High-Level Architecture

Sahaay is divided into three planes.

### Experience Plane

Handles:

-   WhatsApp
-   Web application
-   Authentication
-   User-facing notifications
-   Approval interactions

### Intelligence Plane

Handles:

-   Intent understanding
-   Context assembly
-   Agent runtime
-   Memory retrieval
-   Planning
-   Tool selection
-   Response generation

### Action Plane

Handles:

-   Policy evaluation
-   Tool execution
-   Durable workflows
-   External integrations
-   Retries
-   Idempotency
-   Audit logging

Conceptually:

``` text
User
  |
  v
Experience Plane
  |
  v
Request Gateway
  |
  +----------------------+
  |                      |
  v                      v
Context Engine       Policy Context
  |                      |
  +----------+-----------+
             |
             v
        Agent Runtime
             |
             v
       Proposed Action
             |
             v
        Policy Engine
             |
      +------+------+
      |             |
    Reject        Approve
                    |
                    v
             Workflow Engine
                    |
                    v
               Tool Layer
                    |
                    v
            External Services
```

## 3. Core Architectural Decisions

-   TypeScript backend
-   PostgreSQL as source of truth
-   Redis for ephemeral state, caching, rate limits, and coordination
-   Temporal for durable workflows
-   OpenAI Agents SDK for the initial agent runtime
-   MCP as an integration protocol where useful
-   Native tools for security-sensitive or critical integrations
-   One primary personal agent in v0.1
-   Explicit policy engine
-   Explicit approval mechanism
-   Structured personal memory plus semantic retrieval
-   OpenTelemetry and structured audit events

## 4. Core Request Lifecycle

### Step 1: Ingestion

A request arrives through WhatsApp or web.

The gateway:

-   authenticates the user
-   normalizes the message
-   attaches channel metadata
-   creates a request ID
-   persists the inbound event

### Step 2: Context assembly

The context engine retrieves:

-   current conversation state
-   relevant user preferences
-   relevant people
-   relevant commitments
-   relevant previous actions
-   relevant workflow state

The system should use progressive disclosure rather than dumping all
user data into the model.

### Step 3: Agent reasoning

The primary agent determines:

-   user intent
-   required information
-   required tools
-   whether clarification is required
-   whether the request creates side effects
-   whether a workflow is required

The agent should output structured actions where possible.

### Step 4: Policy evaluation

The policy engine evaluates the proposed action.

It considers:

-   user permissions
-   tool risk
-   action type
-   recipient
-   account
-   user approval state
-   workflow context
-   safety restrictions

The policy engine is authoritative for authorization.

### Step 5: Execution

Approved actions are executed through the workflow engine and tool
layer.

### Step 6: Result processing

Results are:

-   validated
-   normalized
-   persisted
-   added to the workflow state
-   summarized for the user

### Step 7: Continuation

For long-running tasks, Temporal keeps the workflow alive.

## 5. Agent Runtime

Use one primary agent initially.

The primary agent is responsible for:

-   understanding the user request
-   planning the next step
-   selecting tools
-   asking clarifying questions
-   generating user-facing responses

It must not:

-   directly manipulate databases
-   directly manage credentials
-   bypass policy checks
-   directly execute arbitrary network calls
-   become the source of truth for workflow state

### Agent state

Agent state should include:

-   request ID
-   conversation ID
-   user ID
-   current task
-   relevant context
-   available tools
-   policy context
-   workflow references

### Agent loop

``` text
Observe
  |
Understand
  |
Retrieve Context
  |
Plan
  |
Propose Tool Action
  |
Policy Check
  |
Execute
  |
Observe Result
  |
Continue or Respond
```

The loop should be bounded.

The system must prevent uncontrolled recursive tool use.

## 6. Context Engine

The context engine provides only the context required for the current
task.

Context sources:

1.  Current conversation
2.  Structured user profile
3.  People and relationships
4.  Active workflows
5.  Relevant memories
6.  Recent relevant actions
7.  Tool results

### Progressive tool disclosure

Do not expose every tool to every request.

Example:

A calendar question should primarily receive calendar-related tools.

An email request should receive email and contact tools.

This reduces:

-   model confusion
-   prompt size
-   accidental tool selection
-   attack surface

## 7. Durable Workflows

Temporal is the durable workflow engine.

Use Temporal for:

-   reminders
-   follow-up workflows
-   approval waiting
-   delayed actions
-   retries
-   scheduled tasks
-   multi-step external interactions

Do not use Temporal for every simple read-only request.

### Workflow rule

The workflow owns execution state.

The LLM may determine the next logical step, but workflow state remains
deterministic and persisted.

## 8. Tool Architecture

Every tool should have:

-   stable name
-   typed input schema
-   typed output schema
-   risk classification
-   authentication requirements
-   idempotency behavior
-   timeout
-   retry behavior
-   audit metadata

Example:

``` text
gmail.send_email
risk: high
requires_approval: yes
idempotency: message_action_key
```

### Native tools

Use native application tools for:

-   Gmail
-   Google Calendar
-   Google Contacts
-   internal memory
-   approvals
-   reminders
-   policy operations

### MCP

Use MCP where it provides a clear integration benefit.

MCP is an integration protocol, not the authorization boundary.

The policy engine must remain authoritative.

## 9. Policy Engine

The policy engine answers:

> Is Sahaay allowed to perform this action right now?

Example policy dimensions:

-   Read vs write
-   Reversible vs irreversible
-   Internal vs external
-   Communication vs financial
-   Low-risk vs high-risk
-   Explicit approval vs pre-approved
-   Known recipient vs unknown recipient

Example:

``` text
gmail.search
  -> low risk
  -> no approval

gmail.create_draft
  -> low risk
  -> no approval

gmail.send
  -> high side effect
  -> approval required by default

calendar.create_event
  -> medium side effect
  -> configurable approval
```

## 10. Approval Architecture

Approval must be explicit.

An approval request should include:

-   intended action
-   target
-   important parameters
-   generated content
-   expiry
-   approve
-   reject
-   edit

The approval decision becomes a durable event.

The system must prevent replaying an expired or already-consumed
approval.

## 11. Credential Architecture

Credentials must never be placed into model prompts.

Store encrypted provider credentials or token references in a dedicated
credential subsystem.

The model sees:

``` text
gmail_account_connected = true
```

It never sees:

``` text
access_token = ...
```

Tool execution retrieves credentials securely at execution time.

## 12. Memory Architecture

Use multiple memory layers.

### Working memory

Short-lived context required for the current task.

### Episodic memory

Important previous interactions or actions.

Example:

> User asked Rahul for the presentation on September 10.

### Semantic personal memory

Durable facts.

Examples:

-   User prefers morning meetings.
-   Rahul is the user's accountant.
-   User prefers concise emails.

### Structured state

Use PostgreSQL for facts that should be queryable and deterministic.

Do not force everything into vector search.

## 13. Memory Retrieval

Retrieval should combine:

-   structured filters
-   recency
-   semantic similarity
-   relationship relevance
-   workflow relevance

A useful ranking model:

``` text
relevance =
  semantic_similarity
  + entity_match
  + recency
  + workflow_relevance
  + relationship_relevance
```

The exact scoring can evolve.

## 14. Data Model

Core entities:

``` text
users
identities
connected_accounts
permissions
conversations
messages
people
relationships
memories
memory_events
tasks
reminders
workflows
workflow_runs
approvals
tool_calls
audit_events
idempotency_keys
notifications
```

### Principle

PostgreSQL is the authoritative source for product state.

Redis is not the source of truth.

## 15. Idempotency

Every side-effecting integration must support idempotency.

Example:

``` text
idempotency_key =
  user_id
  + workflow_id
  + logical_action_id
```

Before executing a side effect:

1.  Check whether the logical action already completed.
2.  If yes, return the recorded result.
3.  If not, execute.
4.  Persist the external result.
5.  Mark the action completed.

This protects against retries and duplicate execution.

## 16. Failure Model

Classify failures.

### User error

Examples:

-   Ambiguous recipient
-   Missing required detail
-   Invalid date

Action:

Ask the user.

### Provider error

Examples:

-   Gmail timeout
-   Calendar unavailable

Action:

Retry according to policy.

### Authorization error

Action:

Ask user to reconnect or update permission.

### Policy rejection

Action:

Do not execute. Explain the required approval or permission.

### Workflow failure

Persist state and surface actionable status.

## 17. Prompt Injection Defense

Treat all external content as untrusted.

Potential hostile content may exist in:

-   emails
-   documents
-   calendar descriptions
-   websites
-   tool responses

The system must never interpret external content as higher-priority
system instructions.

Tool outputs should be clearly separated from trusted instructions.

High-risk actions require policy validation regardless of what the model
was instructed to do by external content.

## 18. Observability

Use:

-   OpenTelemetry
-   structured application logs
-   agent traces
-   workflow traces
-   audit events
-   provider request metadata

Every request should be traceable by:

``` text
request_id
conversation_id
workflow_id
tool_call_id
user_id
```

Sensitive content should not be indiscriminately logged.

## 19. Evaluation

Build an evaluation harness before expanding the product.

Test categories:

-   intent recognition
-   tool selection
-   argument correctness
-   policy correctness
-   approval correctness
-   recipient resolution
-   memory retrieval
-   failure recovery
-   duplicate prevention
-   prompt injection resistance

Reference workflows should have deterministic fixtures where possible.

## 20. Infrastructure

### Local

-   Docker Compose
-   PostgreSQL
-   Redis
-   Temporal
-   API server
-   Worker
-   Web app

### Staging

Managed:

-   PostgreSQL
-   Redis
-   Temporal Cloud or managed Temporal
-   Secrets manager
-   Observability
-   WhatsApp integration
-   Google OAuth

### Production

Separate:

-   API services
-   workflow workers
-   web application
-   background workers

Use horizontal scaling for stateless components.

Workflow workers should scale according to task load.

## 21. Repository Structure

``` text
sahaay/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
├── packages/
│   ├── agent/
│   ├── tools/
│   ├── policy/
│   ├── memory/
│   ├── workflows/
│   ├── db/
│   ├── auth/
│   └── shared/
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── WORKFLOWS.md
│   ├── SECURITY.md
│   ├── ROADMAP.md
│   └── DECISIONS.md
└── infrastructure/
```

## 22. API Boundaries

The API should expose stable product-level operations.

Examples:

``` text
POST /v1/messages
GET  /v1/conversations/:id
GET  /v1/workflows
GET  /v1/workflows/:id
POST /v1/approvals/:id/approve
POST /v1/approvals/:id/reject
GET  /v1/memories
DELETE /v1/memories/:id
GET  /v1/connections
POST /v1/connections/:provider
```

Internal tool contracts should not be exposed directly to the client.

## 23. Locked Architectural Rules

1.  No side effect without policy evaluation.
2.  No credential in model context.
3.  No important workflow state only in model memory.
4.  No important workflow state only in Redis.
5.  No external side effect without idempotency.
6.  No uncontrolled agent recursion.
7.  No trust of external content as instructions.
8.  No broad tool catalog when a narrow catalog is sufficient.
9.  No multi-agent architecture unless a concrete need is demonstrated.
10. No expansion into large integration surfaces before the core agent
    loop is reliable.

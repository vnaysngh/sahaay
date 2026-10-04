# Sahaay MVP Technology Stack
**Authority:** User technical direction, amended by the Web Chat channel pivot on 2026-10-04. This supersedes WhatsApp-primary/settings-only assumptions and the former M0–M6 order.

**Naming clarification:** The approved capability is **Organize**. Any “Track” wording below means explicit user-managed records only; background tracking remains deferred.

**Transport amendment (2026-10-04):** User selected direct Meta Cloud API for lower costs. The original comparison instruction below is historical; no Twilio implementation/live test is required.

**Status:** Web Chat MVP; revised M0–M5 plan for review. Meta work paused. No M1 implementation yet; optional repository examples do not require extra packages/services.


Use the following as the default technical direction for the Sahaay MVP.

The goal is to use existing AI/platform capabilities wherever possible rather than rebuilding infrastructure that already exists.

Keep the architecture small.

## 1. Core application

### Language

TypeScript everywhere possible.

### Runtime

Node.js.

Use the current stable/LTS-compatible Node version supported by our selected dependencies.

### Repository

Use a simple TypeScript monorepo.

Do not introduce microservices.

A reasonable structure is:

apps/
  api/
  web/

packages/
  agent/
  db/
  memory/
  tools/
  providers/
  shared/

Keep boundaries useful but do not create packages merely for architectural purity.

---

# 2. Database

Use PostgreSQL as the only required infrastructure datastore.

PostgreSQL should store:

- users
- identities
- conversations
- messages
- attachment metadata
- explicit memories
- saved items
- research/source metadata
- tool calls
- coarse product events
- preferences
- request processing status

Do NOT add:

- Redis
- vector database
- graph database
- Elasticsearch
- event streaming
- separate analytics database

unless a demonstrated MVP requirement requires one.

Use normal PostgreSQL capabilities, including full-text search where useful.

---

# 3. Main AI provider

Use OpenAI as the primary MVP intelligence provider.

Prefer the current recommended OpenAI Responses/Agents stack rather than building our own agent framework.

Use OpenAI capabilities for:

- reasoning
- multimodal understanding
- image/screenshot understanding
- tool calling
- agent execution
- current web research where appropriate
- safety/moderation where appropriate

Use the OpenAI Agents SDK for the initial agent runtime if it remains the simplest supported path.

There should be ONE primary Sahaay agent.

Do not create:

- creator agent
- travel agent
- image agent
- Hindi agent
- research agent
- memory agent
- supervisor agent
- agent swarm

These are capabilities/tools available to one assistant, not separate personalities.

---

# 4. Model abstraction

Do NOT build a generalized multi-provider model-routing platform.

But do not scatter direct OpenAI calls throughout the codebase either.

Create small provider boundaries such as:

AIProvider
TranscriptionProvider
ResearchProvider

The purpose is testability and replaceability, not dynamic routing.

OpenAI remains the default provider.

Do not add Anthropic, Gemini, Groq or other LLM providers during MVP without a demonstrated requirement.

---

# 5. Immediate channel: Sahaay Web Chat

Use the chosen Next.js web app for the actual assistant: authenticated conversation window, text composer, image upload, voice recording/upload, URLs in ordinary messages, processing/research status, sources and compact history. No big dashboard.

Web Chat → authenticated channel/input adapter → UnifiedRequest → Sahaay core → channel-independent response → web rendering/streaming.

Meta Cloud API evaluation remains preserved and paused. Do not debug the account restriction, pursue incorporation/Business Verification, or implement Meta/Twilio/Telegram adapters now. Later channels may reuse the same core; no transport registry or placeholders required.

---

# 6. Unified input model

All supported inputs should converge into the same request pipeline.

P0:

- text
- voice note
- image
- screenshot
- URL

P1:

- PDF/document
- shared location

Conceptually:

Web Chat input
    ↓
authentication and ownership
    ↓
owned upload normalization if required
    ↓
input normalization
    ↓
UnifiedRequest
    ↓
conversation + relevant memory
    ↓
Sahaay agent

Do not build separate application pipelines for different modalities.

---

# 7. Voice transcription

Do NOT build speech recognition.

Reuse the completed M0 OpenAI/Sarvam two-clip comparison: Sarvam saaras:v4 was selected with user quality confirmation. It is a limited pilot, not a full accuracy pass. Complete genuine Hinglish/code-switching and browser recording evaluation in M2; do not block text/image development on it.

The benchmark must include realistic Indian voice recordings/uploads:

- English
- Hindi
- Hinglish
- Hindi/English code switching
- Indian names
- Indian city/place names
- numbers
- rupee amounts
- dates/times
- noisy environments
- fast speech
- browser-recorded and compressed uploaded audio

Choose ONE as the default transcription provider based on observed results, latency, cost and implementation simplicity.

Do not build automatic provider routing.

Keep transcription behind:

TranscriptionProvider

so we can replace the provider later.

Generated voice responses and live voice are outside MVP.

---

# 8. Image and screenshot understanding

Use OpenAI multimodal capabilities.

Do not introduce:

- separate OCR infrastructure
- custom computer vision
- image embeddings platform
- separate vision agent

unless testing demonstrates a concrete limitation.

An image/screenshot should become part of the same request context as text.

Example:

image + "ye kya hai?"

should be processed as one unified user request.

Preserve enough attachment metadata and conversation references for follow-up requests such as:

"what about this part?"

or:

"compare it with this one."

Raw media retention should follow the privacy/retention policy rather than being stored indefinitely by default.

---

# 9. Web research

Start with OpenAI's built-in web/search capabilities if they satisfy the MVP requirements.

Do not initially add:

- Tavily
- Exa
- Firecrawl
- custom crawler
- browser automation
- scraping infrastructure

M0 should test whether OpenAI web research is sufficient for:

- current factual questions
- product research
- hotel/location research
- basic comparisons
- public-page understanding
- source-backed responses

If it is sufficient, use it.

If a demonstrated limitation exists, evaluate an additional provider.

Tavily/Exa can be evaluated later for stronger agent-oriented search.

Firecrawl can be evaluated later if reliable extraction from arbitrary websites becomes important.

Do not add them speculatively.

---

# 10. Memory

Memory is a Sahaay product capability and should initially remain Sahaay-owned.

For MVP, implement lightweight memory directly using PostgreSQL.

Support:

remember
recall
update/correct
forget/delete

Examples:

"Remember I paid ₹72,000 for this laptop."

"Save this as a video idea."

"What did I pay for my laptop?"

"Forget what I told you about that hotel."

Do not implement:

- graph database
- sophisticated Personal Graph
- behavioral learning
- automatic preference inference
- vector memory platform
- memory agent
- embeddings pipeline unless clearly required

Memory persistence should primarily happen when the user explicitly requests it.

Keep the memory implementation behind a small Sahaay-owned interface so that systems such as Mem0 or Supermemory could later be evaluated without redesigning the product.

Do not adopt Mem0/Supermemory for MVP unless the simple PostgreSQL implementation proves insufficient.

---

# 11. Saved items / organization

Implement a very small Sahaay-owned abstraction for things users intentionally save.

Examples:

- video idea
- hotel candidate
- product candidate
- game to play
- travel item
- project note
- something to research later

Keep the schema generic.

Do NOT build separate creator/travel/gaming/freelancer databases.

Do NOT build background monitoring.

The capability is Organize / Save, with explicit lists/status edits. Background tracking belongs to future workflows.

---

# 12. Future integrations

Do not build Gmail, Calendar, YouTube, Notion, Slack, travel, shopping or other service integrations during MVP.

When actual user behavior shows repeated demand for a service, evaluate existing integration infrastructure before building the connector ourselves.

Composio should be evaluated when this becomes necessary.

MCP may also become useful as an integration protocol.

Neither needs to be part of the current MVP simply for future readiness.

---

# 13. Workflows

Do not use Temporal for the current MVP.

The previous justification for Temporal was:

- timers
- reminders
- approval waits
- long-running actions
- durable workflows

Those are no longer launch requirements.

Use simple PostgreSQL message/request status, client-ID deduplication and interruption reconciliation. Web requests do not need a webhook inbox or a general recovery engine.

When Sahaay later introduces:

- Autopilots
- monitoring
- scheduled work
- long-running workflows
- delayed actions
- complex approval waits

re-evaluate Temporal.

Do not build our own workflow engine as a replacement.

---

# 14. Redis

Do not use Redis in the MVP.

PostgreSQL should be sufficient for the initial scale and product requirements.

Introduce Redis only when there is a measured need such as high-volume ephemeral caching/rate limiting/coordination that PostgreSQL/application mechanisms no longer handle appropriately.

---

# 15. Authentication and web application

Next.js remains the chosen frontend/Node API framework. Better Auth with PostgreSQL is the maintained auth choice; finalize sign-in/recovery configuration in M0 and integrate in M1. No custom auth primitives or Google integration consent.

The web application is now the primary assistant surface. M1 delivers sign-in, text conversation, streaming replies and basic history; M2 adds upload/microphone controls. Keep it little more than a polished conversation window. Memory/settings dashboards are deferred; explicit memory/item management can happen in chat, with essential privacy controls by M5.

---

# 16. Safety and moderation

Use existing provider safety/moderation capabilities where appropriate.

Do not build a custom moderation ML system.

Still enforce Sahaay-owned application rules around:

- authentication
- authorization
- cross-user isolation
- data access
- memory writes
- deletion
- media limits
- URL safety
- request limits
- tool permissions

Provider moderation is not a replacement for application security.

---

# 17. Analytics / product discovery

Do not introduce a dedicated analytics/data platform unless clearly necessary.

Use PostgreSQL initially for coarse product events.

We want to understand aggregate patterns such as:

- ask
- understand
- research
- compare
- remember
- recall
- organize
- voice input
- image input
- URL input
- unsupported external action

Especially capture coarse unsupported-action categories so we can learn what integrations users actually want.

Do NOT store raw private prompts, screenshots, URLs, voice notes or inferred user personas merely for analytics.

---

# 18. MVP stack summary

Default stack:

Frontend/chat:
TypeScript + Next.js conversation window

Backend:
TypeScript + Node.js

Database:
PostgreSQL

Primary AI:
OpenAI

Agent runtime:
OpenAI Agents SDK / current recommended OpenAI agent stack

Vision:
OpenAI multimodal

Web research:
OpenAI web search initially

Speech:
Sarvam pilot-selected after OpenAI comparison; broader multimodal evaluation in M2

Channel:
Sahaay Web Chat now; Meta work paused, future adapters deferred

Memory:
Sahaay-owned PostgreSQL implementation

Organization:
Sahaay-owned PostgreSQL saved items

Moderation:
Existing OpenAI/provider capability + Sahaay application policies

Workflow engine:
None

Cache:
None initially

Vector database:
None

Graph database:
None

Specialized crawler:
None initially

External integration platform:
None initially

---

# 19. BUY vs BUILD principle

BUY/USE EXISTING:

- foundation models
- reasoning
- vision
- transcription
- web search
- maintained web framework/auth; future transport providers only when validated
- authentication primitives
- moderation

BUILD/OWN:

- Sahaay UX
- unified request model
- conversation behavior
- memory semantics
- saved-item semantics
- user context
- privacy controls
- product-event taxonomy
- provider boundaries
- eventual Personal Graph
- eventual Autopilot semantics

Sahaay's value should come from how these capabilities work together for the user, not from rebuilding commodity AI infrastructure.

---

# 20. Revised M0 requirements

Finalize only build prerequisites: unified schema/interfaces, existing OpenAI model/configuration, PostgreSQL development setup, maintained authentication configuration, media/privacy/retention decisions and existing transcription evidence. Report unresolved prerequisites before M1. No live Meta work; no additional paid benchmark merely for documentation.

PostgreSQL is the only datastore. Docker is optional; choose an available local installation or development managed connection. Hosted production vendor/region/backups and tester auth/recovery/privacy disclosure are resolved before controlled launch, not additional infrastructure projects.

Sequence: M0 decisions → M1 Core Web Chat → M2 Understand → M3 Research → M4 Remember + Organize → M5 Product validation. See IMPLEMENTATION_PLAN.md for testable slices. Show the revised plan before beginning M1; M1 has not started.

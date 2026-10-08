# Sahaay MVP Roadmap

**Updated:** 2026-10-06. M0–M6 complete; M7 Inbox + Controlled Follow-ups is the current build.

## NEEDED FOR MVP

1. **M0 — Foundation decisions:** Unified contracts/schema, OpenAI config, PostgreSQL setup, maintained auth, media/privacy/retention and existing voice evaluation. Report prerequisites before M1.
2. **M1 — Core Web Chat:** Sign-in, conversations/messages, text, one agent, streaming responses and conversation context/history.
3. **M2 — Understand:** Images/screenshots, voice recording/upload/transcription and follow-up questions on the same pipeline.
4. **M3 — Research:** Current web research, public URL understanding, comparisons and actual source attribution.
5. **M4 — Remember + Organize:** Explicit facts, recall/update/delete, saved items/simple lists, provenance and timestamps.
6. **M5 — Product validation:** Essential privacy, history/error polish, coarse usage/unsupported-request events, hardening and controlled testers.

The first usable milestone is M1. All P0 inputs and five verbs are required for tester launch. No big dashboard. See IMPLEMENTATION_PLAN.md for independently testable slices and verification commands.

## DEFER UNTIL VALIDATED

Meta Cloud API work is paused and preserved. Do not debug the restriction or pursue incorporation/Business Verification now. Telegram is now supported; Meta/Twilio remain deferred. P1 PDFs/documents/location, Google APIs, Temporal/Redis/vector/graph DB, Composio, external memory/search platforms, Autopilots/monitoring, invoice flows, recurring reminders and external actions remain deferred.

Choose later investments from repeated real usage and coarse unsupported-action demand. Changing the transport does not authorize more product scope.

## Post-MVP progression

- **M6 — Personal Life State:** Completed; generic owned objects/items, distinct memories and shared Web/Telegram state.
- **M7 — Inbox + Controlled Follow-ups:** Explicit one-off reminders, deterministic timing, small Web Inbox, Telegram notifications and normalized capability-gap events. No autonomous monitoring.
- **Dogfood:** Founder and small tester group; observe continuity, return usage and repeated unsupported actions.
- **M8 — First Connected Capability:** Deferred; select from observed demand, not assumptions.
- **M9 — First Consequential Action:** Deferred; explicit policy/confirmation before execution.
- **M10 — First Autopilot:** Deferred; only after repeated valuable workflows emerge.

M7 does not authorize M8–M10, additional integrations or generalized workflow infrastructure. See the M7 implementation plan for delivery/hosting limits and verification.

## M6.5 amendment — Documents / Personal Artifacts

Images may now be explicitly kept as user-owned Documents, separate from memory, saved items, personal state and conversation context. Normal conversational images remain temporary. The shared Web/Telegram agent supports natural keep/list/field-answer/original-return/delete requests; Web adds a minimal Documents surface. Exact received originals and extracted understanding are privately encrypted in PostgreSQL. Optional owned state references remain lightweight. Ambiguous sensitive retrieval requires narrowing. Only image Artifacts are included; PDFs/audio/video artifact storage, sharing, folders, OCR services and new datastores remain deferred. Independent processor/Telegram copies and bounded encrypted backup retention are disclosed. See M6.5 in IMPLEMENTATION_PLAN.md and ARCHITECTURE.md for implementation and key-recovery requirements.

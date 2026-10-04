# Sahaay Pivot Architecture Review

> **Current authority — 2026-10-04 Web Chat pivot:** ARCHITECTURE.md and IMPLEMENTATION_PLAN.md supersede the channel, milestone numbers and launch gates below. Meta work is paused and preserved; no account-restriction debugging, incorporation or Business Verification. No Meta/Twilio/Telegram adapter implementation. M1 has not started. Historical findings below are retained as evidence, not active WhatsApp requirements.

**Date:** 2026-10-03. **Status:** Review complete; architecture approved and frozen. M0 practical provider tests pending; no application implementation.

## Conclusion

The user's proposed WhatsApp → normalization → context → one agent → web/memory/items → response architecture fits this pivot. PostgreSQL remains the product store. Approved deferral of Temporal and Redis, not recreating their capabilities in a custom framework. Current authoritative documents replace archived productivity specs, avoiding contradictory launch gates.

## NEEDED FOR MVP

- Persist/deduplicate inbound requests before webhook acknowledgement. In-memory background processing alone loses accepted messages on restart; small DB inbox/claim recovery suffices.
- Local explicit writes need ownership, atomic uniqueness/audit and versioned correction/deletion, even without external email/payment actions.
- Unknown WhatsApp response outcomes still need safe stopping; removing Gmail does not make outbound messages exactly once.
- P0 images/URLs broaden input, not integrations: safe media processing, URL SSRF/redirect/IP boundaries, bounded context and untrusted-content isolation are now core.
- Current research must use actual sources; unavailable page/video content cannot become a fabricated summary. Retain cited/consulted provenance and access time; sources are evidence, not durable user memory.
- Preserve source references across follow-ups and state expiration honestly. A reference to deleted/expired media cannot imply forever-retained raw content.
- Explicit memory and saved items may use similar simple records, but distinguish facts from list/status semantics. SQL retrieval before semantic infrastructure; no automatic behavioral persistence.
- Minimized intent/modality/outcome/unsupported-action enums support discovery. Raw prompts, financial amounts, locations, URLs and inferred persona labels do not belong in product analytics.
- Verified identity, processor/retention settings and actual WhatsApp general-assistant eligibility remain necessary. Provider eligibility is unverified from the prior review; removing Google does not resolve it.

## DEFER UNTIL VALIDATED

Google tools/OAuth/credential lifecycle; mail/send approvals; all Calendar/reminder/invoice/required Rahul workflows and stretch; Temporal/Redis/separate workers; embeddings/graph/event-sourcing/research/persona/Autopilot platforms; P1 documents/location. Old technical findings specific to those writes remain historical in the archive, not current launch prerequisites.

## Explicit decisions

ADR-021 records the user product pivot. ADR-022 accepts PostgreSQL-only infrastructure and defers former locked Temporal/Redis deployment timing. ADR-023 accepts source/explicit-memory/event contracts. Tradeoff: small request recovery and safe response-send handling still require tests, and unsupported external actions remain unsupported. No application schema/code migration is needed because implementation never began. Final ordering and capability naming are accepted under ADR-024. M0 findings/blockers are in M0_REPORT.md; stop before M1.

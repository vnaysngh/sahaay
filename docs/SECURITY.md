# Sahaay MVP Security and Privacy

**Revision:** 0.5, 2026-10-04 (Asia/Kolkata)  
**Status:** Web Chat is the MVP channel; Meta work paused, M1 not started.

## NEEDED FOR MVP

- Maintained authenticated web sessions, secure cookies, CSRF/origin protection, server-derived user scope and owned upload access. Client request IDs support database deduplication; apply bounded request/media limits. Never trust a submitted user ID. No WhatsApp linking or webhook requirement in the web launch gate.
- Server-derived user scope for messages, attachments, memories/items, sources and every tool. IDOR/tenant tests on list/detail/update/delete; least-privilege database access and encrypted connections/backups.
- Secrets (WhatsApp/model/auth) outside prompts, logs, frontend and stored media metadata. No Google integration tokens needed. Standard auth is retained even though Google consent is removed.
- Small deterministic authorization checks adjacent to native tools. Explicit user requests permit low-impact owned memory/item writes; untrusted content cannot authorize them. Confirm ambiguous/destructive targets. No general approval workflow/permission DSL; external sends/transactions are unavailable tools, not approval-ready placeholders.
- Voice/image/page content is data; verified user's caption/request is the instruction. Separate provenance and prevent indirect instructions from becoming permissions, secret access, persistent facts or public search queries containing private data.
- Media access is private/owned with byte/type/duration/dimension limits, safe processing, retention and cleanup. No arbitrary filesystem access, executable uploads or auto P1 document parsing.
- Public URL retrieval must block private/loopback/link-local/metadata destinations, non-HTTP schemes, credentials, unsafe ports and redirect/DNS-rebinding escapes. Validate each redirect and connection destination; bound bytes/time/decompression. No cookies/login/paywall bypass, browser automation or arbitrary agent networking. Hosted search/page opening also receives no private credentials or unnecessary personal context.
- Mutation uniqueness/request ownership + transactional audit evidence, interruption tests and version checks. Persist terminal response/error state; reconnect retrieves state without blindly repeating model calls or mutations. Render output/source URLs safely against XSS and unsafe schemes.
- User can inspect/correct/delete explicit memory/items, disable/delete account and control retention. Deleted facts must not be re-extracted silently from retained conversation. Minimize third-party model/search tracing; delete/redact copies and document backup expiry.

## Selected M0 retention and processor defaults — NEEDED FOR MVP

Raw voice/images expire within 24 hours and are excluded from backups. Conversation/transcription/normalization and content-bearing tool outputs expire after 7 days. Minimal operational/source metadata expires after 30 days; strip content/quoted evidence after 7 days. Explicit memories/items remain until user correction/deletion or account deletion. Enum-only pseudonymous discovery events expire after 30 days, then delete or retain content-free aggregates with small-cohort suppression.

Deleted facts/items are immediately unavailable to retrieval; remove active residual copies within 24 hours. Encrypted database backups expire within 30 days; apply content-free deletion records before exposing a restore. Preserve deletion IDs through the last affected backup's expiry. Disable stops processing; account deletion removes owned content and identifiable events. Provenance IDs/timestamps may survive source-content expiry without implying the original is still readable.

Responses use `store: false` and no sensitive SDK traces or persistent provider conversation/file stores. App retention does not override OpenAI/Sarvam retention. Standard OpenAI abuse monitoring can retain data up to 30 days; no zero-retention or India-only processing promise. Disclose actual processor settings before launch; see [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data). Detailed decisions and operational limits are in [M0_REPORT.md](M0_REPORT.md).

Prices/project fees may be explicitly remembered; do not infer that all financial mentions are transactions. Do not automatically store private screenshots, precise locations, passwords, access tokens or sensitive identifiers. Redact incidental sensitive content; sensitive persistence must have an explicit narrow policy, not “remember everything.”

## Product discovery without content surveillance

Fixed enums for ask/research, explain, compare, remember, recall, save/organize, image, voice, link, P1-location request, attempted external action and unsupported request. Allow multiple intent tags on one request. Event fields: timestamp, modality, language bucket, outcome/error class, coarse unsupported-action target (e.g. booking/mail/payment/calendar/other) and protected pseudonymous user/request reference as needed. No raw prompt/media/transcript, search query, URL, client amount, location or inferred persona. Small-cohort suppression and access control on reports; no automatic persona profiling. Unknown unsupported categories remain other rather than unrestricted free text.

## Provider launch gate and required tests

Web Chat launch requires secure authentication/recovery, owned media/context/tools, current model/transcription processor disclosure and verified retention/deletion/backup behavior. No Meta restriction, incorporation, Business Verification or WhatsApp permitted-use gate for the web release. Those checks belong to future channel adoption; existing Meta work is paused.

Test sessions/CSRF/XSS, cross-user access/media, secret/trace leakage, prompt injection, URL safety, search exfiltration, explicit-write provenance, delete/correct races, duplicate submissions/interrupted streams, request limits and provider quotas. Disable user/tool access quickly without extra incident-response infrastructure.

## DEFER UNTIL VALIDATED

Credential vaults for unused providers, payment/send approvals, workflow authorization platforms, trust scoring, behavioral datasets and new monitoring services. Security for future integrations must be added before those capabilities, not implemented speculatively now.

## M0 evaluation data — NEEDED FOR MVP

Only consented benchmark voice recordings may be sent to OpenAI/Sarvam. Reference transcripts and results remain private evaluation data, outside product analytics and version control; delete raw clips under the 24-hour media policy unless their owner explicitly consents to a documented bounded evaluation retention. Record exact endpoint/model, local expiry and processor retention; do not assume Sarvam/Twilio match OpenAI settings. Twilio/Meta/Telegram are not active MVP processors; reassess their data handling only before a future channel is enabled. Public research fixtures contain no personal memory. Metadata availability is measured, not invented.

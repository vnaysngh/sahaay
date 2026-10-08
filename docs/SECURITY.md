# Sahaay MVP Security and Privacy

**Revision:** 0.6, 2026-10-05 (Asia/Kolkata)
**Status:** M1–M5 implemented locally; Meta remains paused. Tester deployment/email/operations and processor review remain launch prerequisites.

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

Raw voice/images expire within 24 hours and are excluded from backups. Conversation/transcription/normalization and content-bearing tool outputs expire after 7 days. Minimal operational/source metadata expires after 30 days; strip content/quoted evidence after 7 days. Explicit memories/items remain until user correction/deletion or account deletion. Enum-only account-linked discovery events expire after 30 days. No aggregate/reporting dashboard is implemented.

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

Only consented benchmark voice recordings may be sent to OpenAI/Sarvam. Reference transcripts and results remain private evaluation data, outside product analytics and version control; delete raw clips under the 24-hour media policy unless their owner explicitly consents to a documented bounded evaluation retention. Record exact endpoint/model, local expiry and processor retention; do not assume Sarvam/Twilio match OpenAI settings. Twilio/Meta remain inactive. Telegram is approved for the messaging pilot; review its handling before enabling the bot and disclose its independent chat retention. Public research fixtures contain no personal memory. Metadata availability is measured, not invented.

## Implemented M5 controls

The small Privacy dialog supports pause/resume, owned conversation/all-chat deletion and password-confirmed account deletion. Pause revokes in-flight processing and prevents late database completions/writes; already transmitted provider data cannot be recalled. Verification/recovery use Better Auth and TLS SMTP; synthetic email capture works only for local test addresses and is forbidden in production. Reverse proxies must overwrite forwarded-IP headers so authentication IP rate limits cannot be bypassed by arbitrary client headers.

Encrypted native PostgreSQL snapshots exclude ordinary temporary media; M6.5 explicitly kept encrypted image originals are included. Content-free deletion/correction/pause evidence is fsynced on a private persistent volume outside database snapshots and retained 31 days; the ledger UUID binds snapshots to their evidence. Restore refuses old/tampered/mismatched snapshots, requires a new empty offline target, applies deletion evidence before exposure and revokes old sessions/tokens/password hashes. Surviving accounts must reset passwords. A missing/lost ledger is an operational recovery blocker: preserve it independently together with the backup key. Retention cleanup runs inside the single app process; operators schedule daily encrypted backups and validate actual host recovery before testers.

Credential/OTP/sensitive-identifier persistence is conservatively denied in memory and saved-item repositories. This is not a credential vault or comprehensive PII classifier. Product event SQL permits only fixed enums and owned references, expires in 30 days and cascades on account deletion. No prompts/transcripts/URLs/media enter event rows.

## Telegram pilot transport

The private-chat Telegram adapter uses authenticated server-to-server polling reception and secure, single-use account linking. Telegram identifiers map to existing internal accounts; usernames and forwarded sender data are not identity evidence. Link hashes expire in ten minutes, content-free delivery receipts in thirty days, and account deletion cascades both identities and receipts. Unlink interrupts pending owned work; backup restore always requires fresh channel linking. Sahaay media/input/provider policies remain unchanged. Telegram is an additional processor/channel and retains its own chat copies; this is disclosed in the linking screen and privacy page. Link previews are disabled; raw bot tokens, update payloads and file URLs are excluded from logs and discovery events. Group, inline and Business capabilities are not implemented.

### M6 personal-state amendment

Current direct personal declarations of plans, ideas, purchases or consideration can authorize organizational state, with a contextual policy check. Preferences remain explicitly requested memories. Incidental media, quotations, forwarded text and old history do not authorize storage. The policy uses the existing OpenAI processor, no hosted response storage or tracing, and fails closed. SQL independently rechecks owned current text/transcripts, lifecycle, versions and parent ownership after review; no network calls are made while the owner transaction is locked. This is bounded model-based intent validation, not a guarantee against every ambiguity or prompt injection. Ask to delete/modify state in chat; object deletion retains its items ungrouped. Existing account deletion, item deletion journal and restore suppression cover all typed state. Discovery events retain enum flags/categories only for 30 days, never private record contents.

### M7 follow-up amendment

Explicit one-off personal reminders use the current-message authorization review, owned versioned SQL changes and receipts. User-confirmed timezone or an explicitly supplied timezone is required. Clock-change gaps/repeats and imprecise relative dates are rejected/clarified. Stored reasons and context cannot authorize unsolicited reminders, recurrence, monitoring or external execution. The model does not run when a timer fires.

Notification dispatch alone holds the owner privacy/cancellation lock during a bounded Telegram send, following a separately committed attempt marker. Privacy/cancel winning before dispatch suppresses delivery; an already-started send cannot be recalled. Successful sends are recorded; unknown network/5xx/crash outcomes are not retried, preventing uncertain duplicate sends. Only known rejected 429 responses receive bounded retry. Missing/unverified/unlinked/paused accounts do not deliver. Restoring a backup cancels all active snapshot reminders and revokes channel identity before exposure.

Follow-up reasons are functional personal data, not analytics: active rows persist until closed; cancelled/dismissed/completed rows expire after 30 days. Account deletion cascades them; chat deletion alone preserves explicit reminders. Deleting related state cancels active reminders. Content-free correction/cancellation evidence follows the existing 31-day journal policy. Lifecycle analytics and allowlisted capability/category/channel events expire in 30 days and contain no raw content; internal aggregates remain operator-only and require small-cohort suppression before sharing. Live evaluations use isolated invented accounts and fake Telegram sends.

## M6.5 image Documents

Explicitly retained images may contain identity/medical information. Durable artifacts are separate from memory, saved items, state and temporary conversation attachments. Artifacts never become public URLs or shared resources. All service/API/storage accesses use the authenticated canonical user in SQL; LLM decisions cannot override ownership. Read/original/delete actions are content-free audited. Generic summaries omit sensitive fields; identity numbers are masked in understanding, and no document fields are copied into memory automatically.

Originals and extracted understanding are AES-256-GCM ciphertext in private PostgreSQL BYTEA, authenticated to owner/id/purpose. New temporary image originals/previews are also encrypted; audio and legacy previews retain existing temporary semantics. Production requires an explicit private artifact key, verified PostgreSQL TLS and HTTPS Web transport. The key must be stored and backed up independently of the database on a private persistent volume/secret manager; key loss is irreversible without recovery. Do not rotate/replace it without a ciphertext migration. Normal media expires in 24 hours; explicit Documents remain until deletion. Limit storage to 100 artifacts/256 MiB and temporary originals to 64 MiB per user.

Document deletion removes live original/extraction/relationships and its temporary upload copy, suppresses source/derived model context, and records restore suppression outside backups. Encrypted database snapshots include durable ciphertext and expire within 30 days; restored snapshots must apply the existing 31-day deletion journal before exposure. These are logical removal/cryptographic-at-rest guarantees, not immediate secure erasure of underlying disks or independent Telegram/provider copies. Account deletion cascades Documents; deleting chats does not delete them. Expired ordinary-image ciphertext is cleared and is unavailable after restore.

Retrieval search decrypts only the authenticated user's bounded set in application memory. No raw document text, metadata, image, holder name/address/ID goes into analytics/tracing. Avoid public-search tool queries containing artifact fields. Re-examination uses only the existing private vision request, store:false and disabled sensitive SDK tracing. Credentials/OTP vault storage, sharing, government integrations, other durable media, OCR services and semantic/vector infrastructure remain unsupported.

### Reminder lifecycle audit amendment

Migration 0011 adds content-free last lifecycle source/time. Chat, Web Inbox, related-state deletion, backup recovery, due processing and repair are distinguished; historical rows are explicitly legacy/unknown, never retroactively attributed to human input. Opening/listing/reminder delivery does not close a reminder. Inbox cancel/dismiss requires a separate explicit confirmation in UI and service/API; optimistic version and same-owner checks still apply. Chat cancellation remains a current-intent policy-validated mutation with an idempotent receipt. Unknown Telegram delivery is not retried or treated as completion. Source provenance identifies the application path, not proof of a physical human click. UI fetch generations prevent stale loading responses overwriting mutations, and initial timezone loading preserves user edits.

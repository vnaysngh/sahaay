# Sahaay MVP — Simple Implementation Overview

**Updated:** 2026-10-05. M1–M5 are implemented locally. Web Chat remains supported; Telegram is now the primary messaging test interface. Tester deployment is pending.

- **Product:** Ask · Understand · Research · Remember · Organize.
- **Screen:** A polished conversation window, compact history, text composer, `+`, microphone and send controls. No dashboard.
- **Telegram:** Link a signed-in Web account once, then send text, screenshots, voice or URLs to the same assistant. One progress message becomes the final answer; sources are included. BotFather configuration/live delivery is pending.
- **Core:** Web adapter → unified request → one Sahaay agent → tools/memory → response. Intelligence stays independent of the UI.
- **M0:** Finalize request/schema, OpenAI, PostgreSQL, authentication and media/privacy choices. Reuse voice evaluation; no more Meta debugging.
- **M1:** Sign in, send text, receive streamed intelligent responses, ask follow-ups and reopen conversations.
- **M2:** Upload images/screenshots and record/upload voice through the same pipeline. Complete realistic voice/language checks here.
- **M3:** Research current information, understand public URLs and compare inputs with sources.
- **M4:** Explicitly remember/recall/edit/delete facts; save and organize simple items through chat.
- **M5:** Essential privacy controls, error handling, minimized product events, hardening and initial tester validation.
- **Launch inputs:** Text, images/screenshots, voice and URLs. PDFs/documents/location stay P1.
- **Paused:** Meta WhatsApp work. No incorporation/Business Verification gate for Web Chat; Twilio remains deferred.
- **Still excluded:** Extra infrastructure, productivity APIs, Autopilots, background tracking, invoices/reminders, payments/bookings and extra agents.

[Detailed plan](IMPLEMENTATION_PLAN.md) lists objectives, affected files, dependencies, steps, tests, acceptance and verification commands. Next: verify real email delivery, provision HTTPS hosting/verified-TLS PostgreSQL and durable private storage, validate deployed backups/recovery and processor disclosure, then invite a small tester group. Genuine Hinglish voice evaluation remains deferred.

## M6.5 amendment — Documents / Personal Artifacts

Images may now be explicitly kept as user-owned Documents, separate from memory, saved items, personal state and conversation context. Normal conversational images remain temporary. The shared Web/Telegram agent supports natural keep/list/field-answer/original-return/delete requests; Web adds a minimal Documents surface. Exact received originals and extracted understanding are privately encrypted in PostgreSQL. Optional owned state references remain lightweight. Ambiguous sensitive retrieval requires narrowing. Only image Artifacts are included; PDFs/audio/video artifact storage, sharing, folders, OCR services and new datastores remain deferred. Independent processor/Telegram copies and bounded encrypted backup retention are disclosed. See M6.5 in IMPLEMENTATION_PLAN.md and ARCHITECTURE.md for implementation and key-recovery requirements.

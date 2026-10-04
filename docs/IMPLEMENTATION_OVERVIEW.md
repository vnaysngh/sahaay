# Sahaay MVP — Simple Implementation Overview

**Updated:** 2026-10-04. Web Chat is the immediate MVP interface. M1 has not started.

- **Product:** Ask · Understand · Research · Remember · Organize.
- **Screen:** A polished conversation window, compact history, text composer, `+`, microphone and send controls. No dashboard.
- **Core:** Web adapter → unified request → one Sahaay agent → tools/memory → response. Intelligence stays independent of the UI.
- **M0:** Finalize request/schema, OpenAI, PostgreSQL, authentication and media/privacy choices. Reuse voice evaluation; no more Meta debugging.
- **M1:** Sign in, send text, receive streamed intelligent responses, ask follow-ups and reopen conversations.
- **M2:** Upload images/screenshots and record/upload voice through the same pipeline. Complete realistic voice/language checks here.
- **M3:** Research current information, understand public URLs and compare inputs with sources.
- **M4:** Explicitly remember/recall/edit/delete facts; save and organize simple items through chat.
- **M5:** Essential privacy controls, error handling, minimized product events, hardening and initial tester validation.
- **Launch inputs:** Text, images/screenshots, voice and URLs. PDFs/documents/location stay P1.
- **Paused:** Meta WhatsApp work. No incorporation/Business Verification gate for Web Chat; no Twilio/Telegram adapters now.
- **Still excluded:** Extra infrastructure, productivity APIs, Autopilots, background tracking, invoices/reminders, payments/bookings and extra agents.

[Detailed plan](IMPLEMENTATION_PLAN.md) lists objectives, affected files, dependencies, steps, tests, acceptance and verification commands. Review the plan and resolve M0 prerequisites before starting M1.

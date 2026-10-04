# Sahaay MVP — Simple Implementation Overview

**Status:** Approved with the user's amendments, 2026-10-03. Planning only; implementation has not started.

## What users can do

- Check their Calendar, set a one-time reminder, find an email, and send an email after approval.
- Use Hindi, English or Hinglish through text or incoming WhatsApp voice notes.
- Complete exactly one small cross-service workflow:
  > “I'm meeting Rahul tomorrow. Find the last relevant email from him and remind me 30 minutes before the meeting.”

That workflow resolves Rahul, finds the existing meeting, retrieves useful email context and creates a durable reminder. Ask when the person/meeting/time is unclear; never invent an email or silently create a meeting.

## Build order

1. **Set up the basics.** TypeScript, PostgreSQL, secure login and a small web shell. Initial requests do not depend on Temporal.
2. **Connect Google reads.** Calendar, Gmail and Contacts, with scoped permissions and private credentials.
3. **Prove the synchronous slice.** Message → one agent → authorized read-only tool → response. It must work with Temporal stopped.
4. **Add voice notes to that same pipeline.** Use an existing transcription service; keep useful language/code-switching metadata where available. No separate language or voice agents.
5. **Add durable execution when needed.** Introduce Temporal for approval waits, reminders, delayed work and restart-safe execution. Bind approvals to exact actions and prevent duplicate/uncertain sends.
6. **Connect WhatsApp and finish the basic actions.** Verified text/voice requests, shared approvals, permitted notifications, approved email sending and durable reminders.
7. **Add the one composed workflow.** Person resolution + Calendar + Gmail + reasoning + the existing reminder. No Autopilot platform or new infrastructure.
8. **Show simple controls/history.** Connections, approvals, pending work/cancel, results and a few editable preferences.
9. **Test and launch small.** Check all languages, real voice-note samples, the composed workflow, provider failures/restarts and Google/WhatsApp readiness.

## Language behavior

- English input → English response.
- Hindi input → Hindi response.
- Hinglish/code-switched input → natural Hinglish response.
- An explicit response-language request overrides a configured preference; a configured preference overrides the default of following the current input.
- Preserve names, dates and useful transcription metadata. Clarify uncertainty before actions. Text replies suffice; generated voice replies/live calls are not required.

## Calendar stretch goal

- `calendar.create_event` is optional and outside the launch gate.
- Add it through the same typed tool, policy, approval and execution boundary when attempted; no architectural redesign.
- Do not build the write adapter or request unused scopes just for future readiness. Update/cancel/general scheduling remain deferred.

## Keep this release small

- One agent and OpenAI initially; ordinary modules isolate model/transcription calls.
- PostgreSQL for product records; Temporal for durable work; Redis only for temporary state.
- Reuse existing reminder and audit/tool/workflow records. No added infrastructure.
- No invoice features, generalized Autopilots, sophisticated Graph/memory/learning/prediction/model routing, skills platform or future India integrations.

**Launch gate:** The four actions and exactly one composed meeting/email/reminder workflow work safely through multilingual text/voice, with approval, history and pending-work cancellation. Temporal outage must not break informational reads. Calendar creation and invoice follow-up are not launch gates.

Details, tests and planned commands: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

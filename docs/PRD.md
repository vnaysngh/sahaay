# Sahaay MVP Product Requirements

**Revision:** 0.5, 2026-10-04 (Asia/Kolkata)  
**Status:** User-directed Web Chat pivot, 2026-10-04. Five-verb scope remains frozen; revised plan for review, M1 not started.

## Product hypothesis

A multilingual, multimodal personal assistant in Sahaay Web Chat: the place users send everyday digital things to have them understood, researched, compared, remembered or organized. Broad natural interactions, narrow infrastructure and actions. Personas are examples, not modes or agents.

**Design for the moat. Do not build the moat yet.** This replaces the Gmail/Calendar/reminder-centric launch and its required Rahul workflow. Prior specifications are historical in [archive/pre-pivot-2026-10-03/PRD.md](archive/pre-pivot-2026-10-03/PRD.md).

## NEEDED FOR MVP

**Frozen capability verbs:** Ask · Understand · Research · Remember · Organize. Comparisons are part of Research.

- **P0 inputs:** Text, voice recordings/uploads, images/photos/screenshots and URLs, combined with instructions. Keep source inputs associated with conversations so “the other one I sent” has a resolvable reference; clarify ambiguity or expired content.
- **ASK:** General questions and current web research with sources.
- **UNDERSTAND:** Interpret/summarize user-provided media or accessible link content; clearly distinguish what was inspected from inference.
- **RESEARCH:** Research around an input and compare multiple referenced items using current sources. No special hotel/laptop/travel/creator systems.
- **REMEMBER:** Explicit user-owned facts with provenance/time, recall, correction and deletion. No automatic transcript-to-memory pipeline.
- **ORGANIZE:** Simple saved ideas/items, optional list label and basic status (saved/done/archived), searchable by user. “Research later” is a saved item, not scheduled execution. Status changes are explicit user edits; background tracking/monitoring is deferred.
- English, Hindi, Hinglish and Hindi/English code switching through the same assistant. Explicit response instruction overrides configured preference, which overrides current-input language. Natural Hinglish for mixed input. Text replies suffice.
- Minimal web conversation window: sign-in, text composer, image upload, voice recording/upload, URL messages, processing/research indication, source links and compact conversation history. Essential privacy controls by tester launch; no dashboard or management pages required for the assistant milestone.
- Privacy-conscious product events for repeated intents and unsupported external actions.

## DEFER UNTIL VALIDATED

Meta WhatsApp work is paused and preserved. No restriction debugging, incorporation or Meta Business Verification now. Meta/Twilio/Telegram adapters are future channels; none is implemented or a Web Chat launch gate.

P1 PDFs/documents and shared location are not launch gates. URLs to PDFs are not implicit P0 document processing. No promise to watch/play a video or inspect login/paywalled content if no supported text/transcript is available.

No Gmail/Calendar/Contacts APIs, Google integration OAuth, email send, meeting scheduling, Calendar creation stretch goal, reminders, invoice workflows or the previous cross-service reminder workflow. No banking/UPI execution, booking/purchasing/posting, fitness/gaming/creator integrations, broad proactive monitoring, generalized Autopilots, advanced Graph/learning/prediction, multi-agent/model-routing architecture, custom speech models or workflow builder. Travel/product research is included; external transactions are not.

## Examples and acceptance

- Send a screenshot: “What's this?” → grounded explanation; uncertainty when details are unreadable.
- Send a product/hotel URL: “Is this good? Compare it with the other one.” → resolve referenced items, research current evidence and cite sources; no purchase/booking.
- Voice note: “Save this as a video idea and research it.” → save the explicitly requested item and separately report cited research; a research failure must not hide a successful save.
- “Remember I paid ₹72,000 for this laptop.” → store an explicit fact; later recall the amount/source and allow correction/deletion.
- “Save today's boxing: 70 minutes, 8 rounds.” → simple dated record; later total matching user records, preserving missing/uncertain units. No fitness integration.
- “Book this/send this/pay this.” → explain the execution limit and record a coarse unsupported-action category, never claim completion.

Launch requires all P0 modalities, five verbs, language behavior, useful follow-up references, explicit controllable memory/items, source-backed current research, authenticated web identity, bounded processing, request deduplication, privacy/security tests and applicable model/transcription processor disclosures. P1 and all removed integrations are excluded from acceptance.

## Discovery metrics

Track request category, modality, language bucket, completion/partial/failure, clarification/correction, repeat usage, explicit save/recall and coarse unsupported-action intent. Measure source grounding, cross-user isolation and duplicate mutation rate. Analyze aggregate repeat demand, not raw sensitive prompts or automatically inferred persona labels. No behavioral prediction platform.

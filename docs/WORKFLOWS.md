# Sahaay MVP Reference Interactions

**Revision:** 0.5, 2026-10-04 (Asia/Kolkata)  
**Status:** Web Chat pivot accepted; revised M0–M5 sequence, M1 not started.

## Shared flow — NEEDED FOR MVP

Authenticated Web Chat text/voice/image/URL → normalized request and conversation references → relevant scoped context → one agent → bounded research or explicit memory/item operation → persisted result/sources → channel-independent response → web stream/rendering. No Temporal/Google integration dependency. Reply language: explicit instruction, then configured preference, then natural current-input language.

## ASK / UNDERSTAND

A question or unfamiliar screenshot gets an explanation grounded in what is visible. Use current sources when the answer depends on changing facts. Clarify unreadable content, missing context or risk-sensitive uncertainty. For link summaries, report exactly what was accessible; inaccessible pages or unavailable video transcripts are partial/unsupported outcomes, not fabricated summaries.

## RESEARCH

Resolve “this” and “the other one” to owned conversation inputs/saved references. Clarify multiple candidates. Inspect available evidence, research relevant current facts, compare using the user's stated criteria and cite supporting sources with access dates where useful. Distinguish opinions/inference from observed facts. No purchase/booking or specialized vertical engine.

## REMEMBER / RECALL

“Remember I paid ₹72,000 for this laptop” creates an explicit fact with source, date, value/unit and useful label. Confirm what was saved; a retry returns the prior result rather than another fact. “What did I pay?” retrieves only this user's matching facts. Clarify conflicting/ambiguous facts rather than guessing. Explicit corrections version/update the fact; deletion removes searchable facts and caches without later resurrecting them from transcripts. No passive persistence rule at launch beyond preferences/onboarding and directly requested saves.

## ORGANIZE

“Save this video idea” or “put this on my travel list” creates one item with optional list label and status. List/retrieve/update/delete owned items. “Not worked on yet” means items not marked done; it does not infer activity in creator services. Explicit saved dated entries may be totaled using validated values/units. No scheduled research, reminders, background monitoring/tracking or persona product.

## Combined interaction

“Save this as an idea and research it” reuses item save + research in the same bounded request. Report each outcome separately. Retry/restart cannot duplicate the save. This is ordinary composition, not the old mandatory cross-service reminder workflow or an Autopilot.

## Failure and correctness tests

All P0 modalities and verbs in English/Hindi/Hinglish/code switching; noisy voice/unreadable image; ambiguous/expired prior references; current versus stale sources; inaccessible URLs/video; invalid/oversized media; malicious page/image instructions; private-data exfiltration; cross-user CRUD; correction/deletion; duplicate web submission/process interruption/local mutation; disconnected or interrupted stream; quota/provider failure and partial save/research outcomes. Unsupported external actions explain limits and emit only a coarse intent event.

## DEFER UNTIL VALIDATED

P1 documents/location, Google/calendar/mail/Contacts/reminder/invoice flows, Calendar creation stretch, recurring objectives and all long-running business workflows. There is no required special Autopilot or Rahul meeting workflow at launch.

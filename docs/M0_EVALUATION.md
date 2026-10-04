# M0 — Small Practical Provider Evaluations

> **Current authority — 2026-10-04 Web Chat pivot:** ARCHITECTURE.md and IMPLEMENTATION_PLAN.md supersede the channel, milestone numbers and launch gates below. Meta work is paused and preserved; no account-restriction debugging, incorporation or Business Verification. No Meta/Twilio/Telegram adapter implementation. M1 has not started. Historical findings below are retained as evidence, not active WhatsApp requirements.

**Updated:** 2026-10-04. **Classification:** NEEDED FOR MVP. **Status:** Initial two-file voice and ten-case research screening plus three focused follow-ups executed; research gate and other readiness checks remain open. This checklist describes broader coverage, not a claim that all cases passed. Results are summarized in M0_REPORT.md.

## Prerequisites

Locally configured OpenAI/Sarvam keys, consented WhatsApp audio clips and reference transcripts; permitted Meta/Twilio test setup for transport. Keep secrets and raw fixtures out of docs/Git. Identify exact endpoint/model/output mode and processor terms before uploading private clips. Do not use live users' conversations as an implicit evaluation dataset.

## Speech: one paired benchmark

Start with 12 short original WhatsApp-compressed clips, roughly 15–45 seconds each: three English, three Hindi, six Hinglish/code-switched. Cover Indian names/cities, numbers, rupee amounts, dates/times, fast speech and noisy environments across that small set. Use original observed audio format; apply the same necessary lossless decoding/conversion to both providers and record its overhead.

For each clip, record ID, consent/expiry, duration/codec, reference transcript and critical names/amounts/dates; send to OpenAI gpt-4o-transcribe and Sarvam saaras:v4. Use transcription rather than English translation; record output mode and inspect natural code-mixing. Do not tune per clip or cherry-pick. No automatic routing in product.

Measure end-to-end latency, failures, billed/estimated cost, retained language/code-switch metadata and manual semantic/critical-field correctness. Report normalized word error rate only with a stated script/transliteration normalization; cross-script WER alone is not a fair quality score. For ambiguous audio, correct uncertainty counts; confident invented critical values fail.

Acceptance for this small screening set: at least 11/12 preserve intended meaning, every clear critical amount/date/number is correct, each language style has no systematic failure, and no invented confidence/language metadata. Compare names/place preservation, latency and costs; choose one acceptable default. If neither passes, keep M0 open and report the specific failure without adding a speech platform. Repeat integrated regression tests in M3. These are engineering screening thresholds, not statistical quality guarantees.

## Research: ten public cases

Two current factual questions, two Indian product questions, two hotel/place questions, two comparisons, two public-page understanding questions. Use public non-sensitive prompts. Include one accessible page and one inaccessible/paywalled/video-content case in page understanding. Date all queries and retain actual sources/annotations/consulted URLs in private test output.

Use the proposed OpenAI model and hosted web search directly, not the desktop browsing tool. Manually open the cited evidence and check each material current claim, freshness, comparison criteria and whether the supplied page was actually inspected. Record latency, search calls, tokens, costs, partial outcomes and exact API options.

Acceptance: at least 9/10 useful grounded answers or correct honest limitations; zero invented citations, inspected-content claims or unsupported critical facts. Inaccessible content must produce an honest partial result. Record concrete extraction/search gaps before considering any additional provider; no speculative crawler.

## Messaging: small transport check

Meta Cloud API is selected by the user (ADR-026); Twilio remains a documentation comparison only. For the authorized Meta test setup, verify inbound text/URL, one image/screenshot and one compressed voice note; authorized media retrieval, reply and delivery callback. Validate actual provider signatures using the maintained helper, duplicate delivery handling and status/error mapping to the same UnifiedRequest/inbox contract. Measure setup effort and observed latency/errors, and record current India/business/use-case eligibility and actual applicable rates. Do not infer production approval from sandbox success.

Use only a consenting test sender. Verify replay/signature negatives with fixtures; do not deliberately abuse provider endpoints. Record actual Meta setup effort and applicable rates; do not provision Twilio. Twilio is not a bypass for WhatsApp eligibility restrictions.

## Remaining choices and final report

Confirm Better Auth recovery/verified linking approach, managed PostgreSQL vendor/region/local prerequisite, current media/conversation defaults and provider processor settings. Final M0_REPORT.md must name selected providers, alternatives actually tested, reasons, approximate costs, known limitations/privacy and launch blockers. Distinguish measured results, published capabilities and untested assumptions.

Record exact redacted commands/API options only after actual evaluation tooling exists; no npm scripts are currently implemented. Keep evaluation artifacts disposable, no M1 app scaffolding. Get user approval of the completed revised M0 report before M1.

## User amendment — 2026-10-04

Genuine Hinglish testing is deferred to M3 by explicit user instruction. Do not wait for another clip during M0 or mark code-switch coverage passed. Keep it in M3/M6 launch regression criteria. Meta test number claim is confirmed by the user screenshot; token generation and live transport checks remain pending. OpenAI screenshot contains usage totals, not RPM/TPM limits.

Meta follow-up: read-only phone/account/association checks passed on 2026-10-04. Local credential access is verified; live message/media/webhook tests and production eligibility remain unverified. No outbound send performed.

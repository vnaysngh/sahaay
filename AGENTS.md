# Repository Documentation and Engineering Standards

Before implementing M8, inspect the existing repository
and read the following documents:

- AGENTS.md
- docs/ARCHITECTURE.md
- docs/DECISIONS.md
- docs/SECURITY.md
- docs/TECHNOLOGY_STACK.md
- docs/ROADMAP.md
- docs/IMPLEMENTATION_PLAN.md

These documents already exist.

Do not create duplicate architecture documents,
decision directories, or parallel documentation systems.

## 1. Engineering Standards

Review the existing AGENTS.md.

Extend it with the professional engineering standards
provided in the M8 specification.

Preserve existing instructions unless they directly
conflict with the new requirements.

Avoid duplicating rules already present.

Ensure AGENTS.md establishes mandatory expectations for:

- Industry-standard algorithms and implementations
- Established architectural patterns
- Appropriate algorithmic complexity
- Secure authentication and authorization
- Efficient database access
- Correct concurrency handling
- Reliable error handling and retries
- Dependency selection
- Strict TypeScript
- Testing and verification
- Performance
- Maintainability
- Avoidance of unnecessary complexity

These standards apply to the entire Sahaay repository,
not just the mobile application.

## 2. Architecture Documentation

Update docs/ARCHITECTURE.md to describe the mobile client.

Document:

- Mobile application boundaries
- Existing backend integration
- Authentication and identity mapping
- API communication
- Media handling
- Native sharing
- Push notifications
- Mobile-specific security boundaries

Preserve the existing architecture.

Do not redesign functioning backend systems.

## 3. Architecture Decisions

Use the existing docs/DECISIONS.md.

Record significant decisions concerning:

- React Native and Expo
- Mobile navigation
- Authentication
- Shared API contracts
- Native share extensions
- Push notification delivery
- Mobile artifact handling

Include rationale and relevant trade-offs.

Do not create a new ADR directory.

Do not duplicate existing decisions.

## 4. Security Documentation

Extend docs/SECURITY.md with mobile-specific
security requirements.

Preserve existing policies.

## 5. Technology Stack

Update docs/TECHNOLOGY_STACK.md with selected
mobile technologies and dependencies.

Explain non-obvious technology choices.

## 6. Roadmap

Update docs/ROADMAP.md to include:

M8: Sahaay Mobile

Mark M6.5 and M7 as implemented if repository
evidence confirms their completion.

Do not change unrelated milestones.

## 7. Implementation Plan

Extend docs/IMPLEMENTATION_PLAN.md with the
M8 implementation phases.

Track actual implementation status.

Do not mark features complete until verified.

## 8. Documentation Consistency

Existing documentation is the source of truth.

If documents disagree with actual implementation:

1. Inspect the code.
2. Identify the discrepancy.
3. Determine the intended architecture.
4. Reconcile the documentation carefully.
5. Report significant inconsistencies.

Do not blindly overwrite existing architectural decisions.

Do not create documentation merely to satisfy a checklist.

Documentation must reflect the actual implementation.

## Mandatory implementation standards

- Prefer maintained platform APIs and established algorithms; bound work and document non-obvious complexity. Avoid sleeps, exhaustive scans without limits, speculative frameworks and duplicated business logic.
- Keep domain behavior in the shared Sahaay core/services. Clients and channel adapters transport authenticated requests and render results. Memory, saved items, life state, artifacts and conversation context remain distinct.
- Derive ownership from authenticated sessions. Enforce ownership in repositories and relationships; never accept a model/client claim as authorization. Keep secrets/private content out of logs and analytics.
- Use parameterized, bounded SQL with appropriate indexes. Serialize conflicting mutations, use optimistic versions and durable idempotency evidence; do not replay uncertain external sends.
- Use strict TypeScript, validate network/native boundaries and handle timeouts, cancellation and failure states. Retry only safe operations with bounded backoff.
- Pin compatible maintained dependencies, inspect native/platform constraints and avoid packages without a demonstrated need.
- Verify meaningful behavior through type checks, lint, ownership/concurrency tests and end-to-end flows. Native lifecycle, signing and live push checks must be reported separately from mocks. Never mark unverified work complete.
- Keep modules small, accessible UI responsive, payloads/storage bounded, caches account-scoped and documentation aligned with actual code. Preserve working Web/Telegram behavior.

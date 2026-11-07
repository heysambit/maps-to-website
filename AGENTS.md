# Instructions for Codex

Open [BACKLOG.md](BACKLOG.md) and implement only the milestone requested. Read [PRD.md](PRD.md) for expected behavior, [ARCHITECTURE.md](ARCHITECTURE.md) for contracts and security boundaries, [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for UI, and [DECISIONS.md](DECISIONS.md) before changing a core choice. If a change conflicts with a documented invariant, surface the conflict and record any approved decision.

## Working rules

- Inspect the current files and Git state first. Preserve unrelated edits. Keep changes scoped and update documentation when contracts or operating steps change. Use the pinned toolchain and lockfile.
- Follow the [skill index](.agents/skills/README.md) for task-specific procedures. Review imported skills as executable guidance. Keep external tool access within the user's authorization.
- Use strict TypeScript and runtime validation at external boundaries. Use parameterized database queries and enforce authorization before every protected resource or state change. Prefer existing domain functions and the shared Astro renderer.
- Treat Google results as transient display data. Durable lookup metadata may contain the selected Place ID. Never copy result fields into evidence, drafts, prompts, fixtures, logs, or public output. Use synthetic sentinel fixtures for leakage tests.
- Require verified independent facts and media rights. Keep reviewer grants and release artifacts tied to exact revisions. Fail closed on stale or revoked approvals, unverified payment, unsafe paths, and uncertain deploys. Keep review assets private and verify bypass paths.
- Keep real credentials, tokens, personal records, and customer assets out of the repo. Default to fixture services and local bindings. Authorization to implement is separate from authorization to contact an owner, use a paid API, provision resources, deploy, migrate live data, or publish a release.
- Preserve public page rendering and reduced-motion support. Use React/shadcn where dashboard interaction calls for it. Prefer Astro HTML for public output.
- Preserve license notices and record third-party rights. Never represent synthetic fixtures, AI proposals, or missing business evidence as authentic proof.

## Verification and handoff

Run the milestone's checks using the package scripts introduced at M0. If a check is unavailable, describe the precise gap. For security and state transitions, include negative tests covering tampering, replay, unauthorized identities, conflict, retries, and privacy where relevant. Keep live-provider checks distinct from unit, integration, browser, and build checks. Report changed files, matched acceptance IDs, run results, operational blockers, and the next prerequisite. Leave production changes and outbound communication to separately authorized operations.

# Implementation backlog

Work from M0 upward. Paste a single prompt into Codex from the extracted repository root. Review the resulting diff and evidence before moving on. The root scripts named below are deliverables of M0. Live smoke tests require authorization and a configured staging environment. Do not expose the builder over the network before the M4 authentication gate. Each milestone should leave a fixture-mode workflow that can be verified without paid keys.

| Milestone | Depends on | Deliverable | PRD |
| --- | --- | --- | --- |
| M0 | Foundation | Runnable workspace, fixture mode, test commands | AC-12 |
| M1 | M0 | Independent intake, revision contracts, Astro page renderer | AC-03, AC-04 |
| M2 | M1 | Optional Places identification with manual fallback | AC-01, AC-02 |
| M3 | M1 | Dashboard editor and live preview, optional copy adapter | AC-05, AC-11 |
| M4 | M2, M3 | Named reviewer access and exact revision decisions | AC-06, AC-07 |
| M5 | M4 | Payment and authority gates, static release and rollback | AC-08, AC-09 |
| M6 | M5 | EmDash handoff and staging readiness | AC-10, AC-12 |

## M0 · Local workspace

- [x] Confirm compatible Node, pnpm, Astro, React and Wrangler versions from primary docs. Record exact tested versions and supported runner configuration.
- [x] Scaffold the apps and packages in the architecture. Create local D1/R2 bindings and fixture identity handling that refuses to run in deployment configurations.
- [x] Add strict checks, local build, integration tests, browser smoke test, secret scanning and a fixture-only CI workflow. Document setup and test commands.

```text
Implement M0 only. Read AGENTS.md, ARCHITECTURE.md and DECISIONS.md. Scaffold apps/builder and apps/site with Astro and pnpm. The builder uses the Cloudflare adapter and React. Add packages/contracts and packages/landing as workspace packages with a minimal shared render smoke fixture. Set up local D1/R2 bindings and a synthetic demo with no external keys. Refuse fixture identities in deployable environments. Pin Node, pnpm and dependencies, include the lockfile in the working changes, and create a secret-free env example. Expose pnpm dev, pnpm check, pnpm test, pnpm test:integration, pnpm test:e2e and pnpm build at the root. Add a fixture-only CI workflow and record tested versions and setup in README.md. Run pnpm install --frozen-lockfile and all checks above except the long-running dev command, then smoke-test the local app through Playwright. Report command results and prerequisites. Leave external provisioning and deployment alone.
```

## M1 · Manual draft and shared renderer

- [x] Define source-aware facts, asset rights, draft versions and immutable revision hashing. Implement project-scoped persistence and independent intake.
- [x] Implement the storefront and service-area layouts, typed CTA handling, metadata, and optional sections. Introduce synthetic fixtures in `tests/fixtures/`.
- [x] Cover incomplete save, share validation, blocked source types, invalid URLs, and missing optional content.

```text
Implement M1 only. Read AGENTS.md, PRD.md AC-03 and AC-04, ARCHITECTURE.md and DESIGN_SYSTEM.md. In packages/contracts define Draft, Revision, RenderModel, validateDraft, sealRevision and toRenderModel. Distinguish an incomplete savable draft from a shareable revision. Require independent provenance for published facts and validate rights and allowed CTA destinations. In apps/builder add project-scoped manual intake and compare-and-set saves using local D1 migrations. In packages/landing implement shared Astro sections and the Coast and Grove themes. Build storefront and service-area fixtures through apps/site. Assert a service-area page never exposes a private street address, missing optional sections disappear, unknown source types cannot seal, and unsafe URLs cannot render. Run pnpm check, pnpm test, pnpm test:integration and pnpm build. Keep publication disabled and report the tested paths.
```

## M2 · Places identification

- [x] Add a fake and a server-side Places client behind a default-off flag. Set bounded usage and explicitly allowed field masks.
- [x] Build attributed search, result confirmation, and manual fallback. Reject unsupported URLs without a fetch. Persist selected Place ID only.
- [x] Test privacy with synthetic provider sentinels. Record the policy review required for live enablement.

```text
Implement M2 only. Read AGENTS.md, AC-01 and AC-02, ARCHITECTURE.md and the places-identification skill. Add a PlacesLookup interface and fake/real adapters under apps/builder/src/lib/places. Implement authenticated lookup and selection endpoints, short-lived signed selection assertions, the approved narrow field masks and no-store headers. Parse supported Maps URL inputs locally and route short or unsupported URLs to name/locality search. Build the separated, attributed results card and manual fallback for ambiguity, quota, stale ID and timeout. Persist only the explicitly selected Place ID and application audit metadata. Test hostile URL input, tampered selection, cross-project assertions, and a synthetic Google sentinel across DB, logs, fixtures/exports, render input and AI input contracts. Run pnpm check, pnpm test, pnpm test:integration and pnpm test:e2e. Document the applicable-terms, privacy, attribution, credential and billing review in DECISIONS.md. Leave real lookup disabled unless a separate authorized staging check proves it.
```

## M3 · Editor and live preview

- [x] Implement editor panes, validation, save/recovery states, and protected shared-render previews. Add no-media operation plus validated uploads with an off switch.
- [x] Provide deterministic copy templates and a fixture adapter for opt-in suggestions. Gate a real model adapter separately if later requested.
- [x] Check preview/static parity, accessibility and image rejection. Keep the re-encoder off until Worker staging proof passes.

```text
Implement M3 only. Read AGENTS.md, AC-05 and AC-11, ARCHITECTURE.md, DESIGN_SYSTEM.md and the astro-landing-design skill. Add the project editor to apps/builder with shadcn/ui, Tailwind, restrained Motion and a 300 ms debounced protected Astro preview. Use toRenderModel and packages/landing. Preserve form state on save failure and conflict, and reject stale preview responses. Add bounded JPEG/PNG/WebP processing behind a default-off upload flag until the Worker image pipeline is proven. Use private R2 with authorization and fail closed on MIME, actual size, dimensions and rights. Implement deterministic copy and a fixture-only opt-in suggestion adapter that accepts eligible source IDs and has no network access. Test two-tab writes, failed saves, parity with apps/site, malicious and oversized uploads, keyboard, reduced motion, axe and 320/390/768/1440 px. Run pnpm check, pnpm test, pnpm test:integration, pnpm test:e2e and pnpm build. Report browser evidence and the remaining provider checks.
```

## M4 · Private owner review

- [x] Implement operator and reviewer Access JWT checks plus app-level permissions on all protected routes. Add immutable review rounds and named grants.
- [x] Add reviewer decision UX, revoke/supersede operations and asset authorization. Publish a reviewer enrollment and expiry runbook.
- [x] Exercise bypasses in fixture mode and provide an authorized staging checklist.

```text
Implement M4 only. Read AGENTS.md, AC-06 and AC-07, ARCHITECTURE.md and the private-preview-review skill. Implement operator and reviewer Access verification in apps/builder and project/revision checks for HTML, assets and decision mutations. Freeze a revision and create named viewer or approver grants with seven-day expiry. Add approve/request-changes actions, superseding rounds and explicit revocation. The review URL carries no grant authority. Keep sales CTAs inert, return no-store/noindex headers and deny cross-origin mutations. Test signed-out, wrong email, wrong audience, wrong project, viewer approval, tampered revision, expired and revoked links, protected assets, and superseding an approved review. Run pnpm check, pnpm test, pnpm test:integration and pnpm test:e2e. Document raw-origin, alternate hostname and asset bypass checks for Cloudflare staging. Use only local fixtures unless live staging access was separately authorized.
```

## M5 · Paid static release

- [x] Record payment, authority, hostname, and licensed asset checks. Queue exactly one active release per site with an immutable content bundle.
- [x] Build a protected manual CI entry point and commands for build, scan, deploy, verification, reconciliation, rollback, and first-release takedown.
- [x] Prove recovery with a fake provider. Keep live deployment off until separately authorized Cloudflare staging verifies account and domain configuration.

```text
Implement M5 only. Read AGENTS.md, AC-08 and AC-09, ARCHITECTURE.md and the cloudflare-release-handoff skill. In packages/contracts model release transitions and gate checks, then add D1 state, an atomic project/target lock and explicit request UI to apps/builder. A protected CI dispatch must consume only a scoped sealed bundle by release ID. In scripts/release expose build, scan, deploy, verify, reconcile and rollback operations. Bind the bundle to one renderer version, asset digests, approved revision and allowed target. Refuse missing or reversed payment, expired or superseded review, unverified rights, unexpected hostname and tampered bundle. Use a fake deployment provider to test parallel requests, unknown outcomes, retries, version verification, rollback and first-release takedown. A network timeout after deploy must require reconciliation. Run pnpm check, pnpm test, pnpm test:integration, pnpm test:e2e and pnpm build. Generate a clean portable source export with licensed assets and notices. Document staging verification and leave live deploy off unless separately authorized.
```

## M6 · Post-purchase CMS and pilot readiness

- [x] Add the pinned official EmDash Cloudflare starter, documented seed adapter, and per-site D1/R2 configuration. Owner invitation, provider migration, and restoration remain staging checks.
- [x] Add seed/cutover gates, idempotency and partial-failure stub tests, no-overwrite retries, disabled-by-default CMS, static fallback, and a tested read-only retention planner.
- [x] Document staging checklist, identity bootstrap, backup/restore, migration, owner export, and launch gates. Live provider checks remain unrun and the CMS stays disabled.

```text
Implement M6 only. Read AGENTS.md, AC-10 and AC-12, ARCHITECTURE.md and the cloudflare-release-handoff skill. Create templates/emdash-site with the pinned official Cloudflare starter, per-site bindings and shared Astro renderer. Use a documented seed interface for the chosen version. Seed only a paid and approved release, store its seed marker without overwriting owner edits, and fail before cutover if draft visibility, owner isolation or render parity checks fail. Gate admin bootstrap, document final-host identity setup, scoped owner access and static fallback. Add local or stubbed tests for repeat seed, partially failed seed, duplicate dispatch and permission failures. Write a retention schedule and tested dry-run cleanup for expired grants, old drafts and orphan assets that preserves live and eligible rollback references. Document backup, migration, restore, owner export, staging smoke tests and launch gates. Run pnpm check, pnpm test, pnpm test:integration, pnpm test:e2e and pnpm build. Record which live provider checks ran under separate authorization. If a supported EmDash seed or permissions path cannot be verified, keep the static release serving and the CMS option disabled.
```

# Astro Site Builder

A pnpm workspace foundation for building local business websites. The workspace provides a private builder shell, static site, shared landing renderer, and local-only synthetic fixtures. No external services, paid API keys, or business records are used.

## Requirements and tested versions

The tested workspace versions are Node.js **22.23.4**, pnpm **10.34.9**, Astro **7.4.7**, `@astrojs/cloudflare` **14.4.6**, `@astrojs/react` **7.1.4**, EmDash **1.4.0**, `@emdash-cms/cloudflare` **1.4.0**, React **19.3.1**, Tailwind CSS **4.3.4**, Motion **14.10.0**, Radix Tabs **1.2.1**, `@axe-core/playwright` **4.14.0**, Wrangler **4.158.0**, TypeScript **6.0.3**, Vitest **5.1.0**, `@cloudflare/vitest-plugin` **1.6.0**, `@cloudflare/workers-types` **5.20261104.1**, and Playwright **1.65.0**. The package manager and direct dependencies are pinned, and `pnpm-lock.yaml` is included. Astro 7 requires Node 22.12.0 or later; the pinned Node release satisfies it. Use Node 22.23.4 for this workspace.

## Local setup

```sh
corepack enable
corepack prepare pnpm@10.34.9 --activate
pnpm install --frozen-lockfile
cp apps/builder/.dev.vars.example apps/builder/.dev.vars
pnpm dev
```

Open <http://127.0.0.1:4321>. The demo identity and business are synthetic. Local Wrangler configuration binds D1 (`DB`) and private R2 (`MEDIA`); the builder applies local D1 migrations at startup. The shared Astro sections in `packages/landing` render the storefront and service-area fixtures under `apps/site`.

The builder refuses fixture identities outside `APP_ENV=development` and rejects non-loopback fixture requests. Production resources in `wrangler.jsonc` are placeholders and are not provisioned. Manual intake and Places endpoints use the local fixture operator only: keep `pnpm dev` loopback-only and do not enter customer records. Places lookup uses a synthetic fake in local mode, and selected Place IDs are saved only after explicit confirmation. Real Google lookup is disabled; there is no key in the repository. See the M2 review in `DECISIONS.md` for terms, privacy, attribution, credential, and billing prerequisites. The React editor sends drafts to the protected preview route after 300 ms and uses the shared Astro landing renderer; media uploads stay disabled until a Worker decode/re-encode pipeline passes verification. Publication and deployment remain disabled.

## Private owner review (M4)

Deployable builder and reviewer requests must carry a Cloudflare Access JWT. Configure `ACCESS_TEAM_DOMAIN`, separate `OPERATOR_ACCESS_AUD` and `REVIEWER_ACCESS_AUD`, `OPERATOR_EMAILS`, `OPERATOR_HOST`, and `REVIEWER_HOST` in the authorized Cloudflare environment. The Worker verifies the RS256 signature against the team's Access cert endpoint, issuer, exact audience, expiry, normalized email, operator allowlist, and role-specific HTTPS hostname. Keep operator and reviewer Access applications on separate hostnames/audiences. The opaque `/r/<revision-id>` URL identifies a revision only; the current named grant is checked for every HTML, decision, and asset request.

Starting a review freezes the current saved revision and issues named viewer or approver grants that expire after seven days. Approvers can approve or request changes. Starting a later round supersedes earlier grants and decisions for release purposes; an operator can revoke a whole round or an individual grant. Enrollment runbook: enroll the named reviewer in the Cloudflare Access reviewer application using the configured one-time PIN or approved identity provider, then create a viewer/approver grant for that same normalized email in the builder and share the opaque review URL. At expiry, the Worker denies HTML, decision, and asset requests; revoke earlier through the review panel if needed. Local development uses only loopback fixture identities (`LOCAL_OPERATOR_TOKEN` for operator APIs and `x-fixture-reviewer-email` or `fixture_reviewer_email` for reviewer fixtures); fixture identities are rejected outside loopback development. The local browser accepts opaque `Origin: null` only for loopback fixtures; deployable mutations require an exact same-origin value. No real Access team, domain, or staging account was configured or contacted for this milestone.

### Cloudflare staging bypass checklist (not run)

Run only after staging access and hostnames are separately authorized and provisioned. Capture raw responses and headers without retaining JWTs or reviewer content.

1. **Raw Worker origin:** request the Worker origin directly for `/r/<revision-id>`, `/r/<revision-id>/media/<digest>`, `/api/reviews/<revision-id>/decision`, and operator APIs with no Access assertion. Expect denial and `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, and `Referrer-Policy: no-referrer`. Repeat with an assertion from the wrong application and confirm denial.
2. **Alternate hostnames:** try the default `workers.dev` hostname, deployment preview URL, and any legacy/custom alias using both an anonymous request and a valid assertion issued for the intended host. Confirm the Worker rejects the hostname and that Cloudflare has disabled provider preview URLs and unneeded alternate routes.
3. **Asset bypass:** request each frozen asset through the approved review hostname, then try its R2 key, guessed object URL, raw Worker origin, project media route, alternate hostname, and a digest omitted from the frozen revision. Only the approved review hostname plus a live grant for that exact revision should return bytes. Verify no public R2 route or static asset route bypasses the Worker.
4. **Mutation origin:** submit approve, request-changes, revoke, and review-creation forms with a foreign `Origin`, missing Access identity, wrong audience, wrong email, viewer role, stale/superseded review, expired grant, and revoked grant. Each must fail without writing a decision or changing the active round.

These are provider-level staging checks. The local test suite does not prove Cloudflare Access enrollment, custom-domain routing, Worker origin isolation, or R2 public-access configuration.

## M6 EmDash handoff template

`templates/emdash-site` is based on the official Cloudflare starter generated from EmDash 1.4.0. Its Astro Worker has site-specific `DB` and private `MEDIA` bindings, exact package pins, schema-only seed content, an Access JWT gate for admin paths, and the shared `packages/landing` renderer. `pnpm deploy` is deliberately blocked. The default CMS, bootstrap, post-setup owner admin, owner access and cutover flags are false; the paid static release stays the serving option.

The documented EmDash `validateSeed` / `applySeed` API is used only after the seed handoff validates verified payment, exact approved revision, rights, and project scope. A D1 seed marker provides an atomic dispatch claim and allows partial failure retry with `onConflict: "skip"`. Draft privacy, owner isolation and render parity must pass before the injected cutover callback can run. Stub tests cover duplicate dispatch, owner edit preservation, failed seed recovery, denied bootstrap/owner identities, unsafe CMS output, and required checks. The seed API is documented and typechecked; live D1, EmDash permissions, Access final-host identity, backup/restore, and cutover behavior remain unverified, so the CMS is disabled.

Retention is specified in the template runbook. `pnpm retention:dry-run --dry-run <sanitized-snapshot.json>` prints a non-mutating plan for expired grants, inactive drafts and unreferenced assets while preserving live and rollback-eligible release references. No cleanup delete operation is implemented.

See [`templates/emdash-site/README.md`](templates/emdash-site/README.md) for the owner bootstrap, final-host Access, scoped resources, static fallback, backup, migration, restore, export, staging smoke tests and launch gates. No live provider checks ran under separate authorization.

## Commands

```sh
pnpm dev                 # Local builder, loopback only
pnpm check               # Astro and TypeScript checks plus source secret scan
pnpm test                # Unit tests
pnpm test:integration    # Local D1/R2 and fixture integration tests
pnpm test:e2e             # Playwright local browser smoke test
pnpm build                # Builder Worker and static site builds
```

For Playwright, install its pinned browser binary if needed:

```sh
pnpm exec playwright install chromium
```

CI runs only fixture-mode checks and uses no repository secrets or Cloudflare credentials. Live provider, deployment, and staging checks remain outside this milestone and require separately authorized setup.

## M5 release handoff

Release requests are explicit operator actions against the latest approved frozen revision. The builder records payment evidence status/reference, publication authority reference, and hostname authorization evidence; only verified payment, an allowed hostname, exact unexpired approval, cleared media rights, supported `astro-renderer-m1`, and an intact bundle pass the server gates. Approved hostname allowlists are configured with `ALLOWED_RELEASE_HOSTS`; local fixture mode allows only `fixture.example`. Production is blank until separately authorized staging setup.

Each accepted request stores a sealed render-only bundle in private R2 and creates a D1 project/hostname lock in the same write sequence. The bundle binds the release and project IDs, one hostname, exact revision/hash, renderer/template versions, content-addressed media digests, and its own SHA-256 digest. CI takes only a release ID and retrieves its bundle and manifest-listed assets through a bearer-token-protected internal endpoint. `.github/workflows/release-dispatch.yml` runs only from `main` in the `release-fixture` environment; configure that GitHub environment with required reviewers and a scoped `RELEASE_SERVICE_TOKEN` before use. The workflow currently uses only the fake provider and sets `LIVE_DEPLOY_ENABLED=false`.

Use `pnpm release build|scan|deploy|verify|reconcile|rollback` with `RELEASE_ID`, `BUILDER_URL`, and the scoped service token to operate on a sealed ID. A timeout after provider apply is recorded as `unknown`; the target lock stays held. Reconcile by release ID and confirm the canonical target marker and provider version before another deploy attempt. Rollback uses the previous verified provider version. When there is no eligible previous release, rollback deploys and verifies a deny/maintenance marker for first-release takedown. The fake provider and local CI path are fixtures, not evidence of Cloudflare account, raw-origin, alternate-hostname, DNS, TLS, or asset-bypass security.

Generate a portable synthetic smoke export with `pnpm release:export -- --fixture exports/fixture-site`, or pass a downloaded sealed bundle JSON and an asset directory. It includes only the Astro site source, shared renderer/contracts, sanitized render model, cleared manifest assets, MIT license, and third-party notices. Inspect the target, media licenses, and release content before any separately authorized deployment. The generated `exports/fixture-site` tree is marked synthetic and is never a real customer release.

Staging verification remains outstanding: configure a protected GitHub environment and a scoped release-service identity; configure a dedicated private bundle bucket and D1; verify the canonical hostname, certificate, raw Worker origin, alternate hostnames, and direct asset routes; perform a fake deploy/reconcile/rollback/takedown rehearsal first; then separately authorize a real staging deploy and prove marker/version checks and rollback. No Cloudflare resources, secrets, domains, or live deployments were provisioned or contacted for M5.

## Repository map

- `apps/builder`: Astro on-demand Worker with Cloudflare adapter, React integration, project-scoped manual intake, and local D1/R2 bindings.
- `apps/site`: static Astro output using the same landing fixture.
- `packages/contracts`: runtime draft validation, immutable SHA-256 revisions, and a provenance-free render model.
- `packages/landing`: shared Astro sections and Coast/Grove themes.

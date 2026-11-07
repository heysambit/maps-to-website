# Purchased-site EmDash template

This is a post-purchase, per-site CMS template based on the official EmDash 1.4.0 Cloudflare starter. It runs Astro on Workers with one D1 binding (`DB`) and one private R2 binding (`MEDIA`). The homepage renders the shared `@studio/landing` component and rejects malformed render models, unsafe CTA destinations, invalid media paths, and service-area addresses.

The default Wrangler configuration is local-only: placeholder D1 ID and bucket name, no deployed resources, no provider credentials, no Cron trigger, and `CMS_ENABLED`, `ADMIN_BOOTSTRAP_ENABLED`, `OWNER_ADMIN_ACTIVE`, `OWNER_ACCESS_ENABLED`, and `CUTOVER_ENABLED` all false. The seed coordinator also defaults both CMS and cutover flags closed. `pnpm deploy` intentionally fails. Keep the paid static release serving until the staging and launch gates below pass under separate authorization.

## Seed contract and ownership

`seed/seed.json` contains schema only and no demo or published content. During the EmDash 1.4.0 first setup, choose not to include sample content. The release handoff calls `seedApprovedRelease` with a release that has verified payment, exact approved revision, publication rights and project-bound render model. It atomically claims the D1 `cms_seed_markers` row before calling the official `validateSeed` / `applySeed` API. The seed marker keys release ID, project, revision ID/hash, status and lease; a successful row is immutable for that release. A failed partial apply becomes retryable. `onConflict: "skip"` prevents an owner-edited entry from being overwritten on retry. A duplicate in-flight dispatch is refused.

The handoff fails closed on missing/reversed payment, non-approved or mismatched revision, unverified rights, seed errors, or any missing draft-privacy, owner-isolation or render-parity check. Static fallback remains available. A successful seed alone never changes traffic. `cutover` is injected and must point to a separately authorized, verifiable traffic switch. This repo does not implement or call a live provider switch.

EmDash 1.4.0 exposes `validateSeed` and `applySeed` from `emdash/seed`; see `src/lib/emdash-seed.ts` and `UPSTREAM.md`. The official API was checked against the pinned version's documentation and is typechecked locally. D1 runtime migrations, real draft permission behavior, and final-host authentication still require staging verification; therefore this template's CMS flags remain off.

## Admin identity and bootstrap

Before enabling the CMS in an authorized staging site:

1. Create an exact final hostname and a Cloudflare Access self-hosted application for `https://<final-host>/_emdash/*`. Do not expose `workers.dev`, preview URLs, or alternate hostnames to the admin.
2. Configure `ACCESS_TEAM_DOMAIN` (for example `https://<team>.cloudflareaccess.com`), the exact Access application `ACCESS_AUDIENCE`, `FINAL_HOST`, and one normalized `OWNER_EMAIL`. The middleware verifies `Cf-Access-Jwt-Assertion` signature, issuer, audience and email against Access JWKS; it does not trust an email header.
3. Bind a separate D1 database and private R2 bucket for this site only. No builder D1, other owner's resource, public R2 domain, or shared admin identity may be bound.
4. For first-admin setup only, set `CMS_ENABLED=true`, `OWNER_ACCESS_ENABLED=true`, and `ADMIN_BOOTSTRAP_ENABLED=true`, with `OWNER_ADMIN_ACTIVE=false`. The pinned EmDash release opens its setup wizard on the first visit to `/_emdash/admin/`; the middleware allows that first visit only in this temporary bootstrap mode and still requires the Access owner identity on the final host. Complete setup there. Then set `ADMIN_BOOTSTRAP_ENABLED=false` and `OWNER_ADMIN_ACTIVE=true`. Revisit `/_emdash/admin/` and confirm it shows normal login/admin rather than first-user setup. If setup still appears, turn off both admin modes and keep the CMS disabled until the database/setup state is repaired.
5. Keep `CUTOVER_ENABLED=false` until paid-release gates, private draft checks, cross-site isolation, output parity, safe asset routing, and static fallback have all passed on staging. Use a documented explicit switch and verify the canonical URL before retiring static serving.

No bootstrap/admin route is enabled by default. If the pinned EmDash setup endpoint differs from the tested exact path or Access claims cannot be verified, do not enable the CMS. Operator access must be just-in-time, site-scoped, audited, and revoked at handoff. Do not give the owner Cloudflare account or unrelated sites.

## Backups, migration, restore, export

- Before each core or content-schema migration, record the site, environment, EmDash version and D1 target. Build the exact artifact, run `pnpm emdash migrate --status --wrangler-config wrangler.jsonc`, confirm the target, then apply the interactive migration with the same config and verify using `pnpm emdash migrate --check --wrangler-config wrangler.jsonc`. Core migrations are forward-only; do not treat Worker rollback as data rollback.
- Apply this template's own seed-marker migration separately with `pnpm exec wrangler d1 migrations apply DB --local` for local D1. A remote command is permitted only from an authorized, target-confirmed staging/release operation and must include Wrangler's `--remote` selector.
- Before a migration or destructive change, record a D1 Time Travel bookmark and an off-account SQL dump when recovery rehearsal or longer retention requires it. Back up R2 objects separately with read-only credentials. Preserve the matching Worker artifact and backup timestamps together.
- Restore D1 to an isolated recovery database and R2 to an empty recovery bucket. Run migration status, verify known content and media, test an upload/read/delete of a disposable object, and compare the shared renderer output. Never restore over a serving production bucket as the first recovery action.
- The owner export is a site-scoped content export plus the licensed media objects and their existing notices. Before delivery, remove platform secrets, Access identities, audit data for other sites, and any provider-only data. Verify the export by importing it to an isolated local site and rendering with the pinned shared renderer.
- Keep the verified static release and all assets needed by it as the immediate serving fallback. CMS database recovery and static rollback are separate operations.

## Retention schedule

`node scripts/retention/dry-run.mjs --dry-run <sanitized-snapshot.json>` produces a read-only JSON plan. It does not delete or mutate data. Policy windows:

| Record | Earliest cleanup | Preserve |
| --- | --- | --- |
| Expired/revoked review grants | 30 days after expiry/revocation | Active grants and audit retention obligations |
| Abandoned, inactive drafts | 180 days after last update | Active projects, frozen/current reviews, customer export obligations |
| Unreferenced uploaded assets | 30 days after upload | Any draft, revision, live release, or eligible rollback reference |

The cleanup planner's tests cover each window and verify live and rollback-eligible release assets remain referenced. A production deletion job, legal hold handling, and audit retention window have not been authorized or implemented.

## Staging smoke tests and launch gates (not run)

After staging setup is separately authorized, test an exact paid/approved fixture release end-to-end: first bootstrap behind Access on the final host, publish a draft, confirm it is not public, publish the approved revision, compare normalized HTML with the static fixture using the shared renderer, then test owner save/publish and the visible static fallback. Try the raw Worker origin, `workers.dev`, deployment preview, alternate host, and guessed R2 object path with no token, wrong audience, wrong email and a valid owner token. Try a second site's identity and resource bindings. Confirm draft APIs and media stay private; confirm public CTA schemes and service-area output remain safe after CMS edits. Exercise failure/retry after a partial seed, repeat seed after an owner edit, parallel duplicate release dispatch, database migration, D1 and R2 restore, owner export/import, and rollback to static.

Enable a CMS option only after: official seed behavior is proven on pinned EmDash 1.4.0; Access identity/bootstrap scope is proven; draft privacy and owner isolation pass; D1/R2 restore and owner export pass; parity passes; release entitlements and rights pass; and rollback/cutover are rehearsed. No live Cloudflare provisioning, deployment, Access identity, D1/R2, migration, backup/restore, or cutover checks ran for this implementation. CMS remains disabled.

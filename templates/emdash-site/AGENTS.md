# Purchased-site template instructions

- Keep every site on its own Worker, D1 database, private R2 bucket, final hostname, Cloudflare Access audience and owner identity. Never reuse builder resources or another site's credentials.
- Treat `CMS_ENABLED`, `ADMIN_BOOTSTRAP_ENABLED`, `OWNER_ADMIN_ACTIVE`, `OWNER_ACCESS_ENABLED`, and `CUTOVER_ENABLED` as closed unless an authorized staging runbook explicitly enables them. Never remove the deploy refusal as part of ordinary template work.
- First-admin setup opens at `/_emdash/admin/` on a new database. Keep the exact final-host Cloudflare Access gate active during setup; immediately move from bootstrap mode to owner-admin mode afterward.
- The initial seed is schema-only. Apply release content only through `seedApprovedRelease` after payment, exact revision approval, rights, project scope and seed marker checks. Use the documented EmDash 1.4.0 `validateSeed` / `applySeed` interface and `onConflict: "skip"`; do not overwrite owner edits.
- Render the published home through `@studio/landing`. Reject unsafe destinations, invalid local asset paths, and service-area addresses before rendering. Keep draft content private and prove owner isolation and render parity on staging before cutover.
- Back up D1 and R2 before migrations or destructive changes. Keep the static release and assets available for fallback; Worker rollback does not roll back content data.
- Keep optional plugins, MCP integrations, outbound providers, secrets, owner records and deployment resources out of local fixtures. Preserve the upstream MIT notice when redistributing the template.

See [README.md](README.md) for local commands, migration and recovery steps, the retention dry-run and staging launch gates. See [UPSTREAM.md](UPSTREAM.md) for the pinned upstream source and supported seed contract.

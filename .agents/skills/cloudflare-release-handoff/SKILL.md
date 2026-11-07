---
name: cloudflare-release-handoff
description: Implement or review paid static publishing, Cloudflare deploy verification and rollback, or post-purchase EmDash seeding, cutover and ownership handoff.
---

# Release or hand off a purchased site

Read the release and EmDash sections of [ARCHITECTURE.md](../../../ARCHITECTURE.md) and AC-08–10 in [PRD.md](../../../PRD.md).

1. Validate the approved revision, publication rights, payment, host, bundle hash and asset digests. Keep live credentials scoped to authorized deployment jobs.
2. Acquire the site/target lock and build from the pinned renderer. Confirm the provider version and expected marker on the canonical URL. Reconcile an unknown deploy result before retrying.
3. For CMS work, verify the supported seed interface and admin bootstrap steps for the pinned EmDash release. Use site-specific bindings. Test draft privacy, repeat seed, final-host identity, database/media recovery, and static fallback.
4. Report the release gate, provider/fixture evidence, rollback or recovery target, and any operation still requiring authorization. Keep provisioning, publication and live migration outside local implementation runs.

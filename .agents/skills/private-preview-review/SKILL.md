---
name: private-preview-review
description: Implement or test private preview links, Cloudflare Access identity, reviewer grants, frozen approvals, protected assets, and preview cache behavior.
---

# Secure owner review

Read AC-06/07 in [PRD.md](../../../PRD.md) and the authentication section in [ARCHITECTURE.md](../../../ARCHITECTURE.md).

1. Resolve the validated operator or reviewer identity before loading protected data. Validate issuer, audience and expiration. Require a live app-level grant for the exact revision on HTML, asset, and mutation routes.
2. Keep approvals immutable and bound to the reviewed revision. Reject mutations from viewers and stale or superseded rounds.
3. Check no-store, noindex, CSP and referrer headers. Disable alternate preview hostnames and prevent static asset routing from bypassing the Worker.
4. Test anonymous, wrong identity or audience, wrong revision, expired and revoked grants, direct assets and cross-origin mutations. In authorized staging, repeat from alternate hostnames and direct asset paths. Report staging evidence separately.

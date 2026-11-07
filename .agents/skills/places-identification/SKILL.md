---
name: places-identification
description: Implement or review Google Places lookup, listing selection, attribution, and isolation from publishable Astro content. Use manual intake when lookup is unavailable or unauthorized.
---

# Identify a listing

Read the Places boundary in [ARCHITECTURE.md](../../../ARCHITECTURE.md) and AC-01/02 in [PRD.md](../../../PRD.md).

1. Verify the documented applicable terms, field mask and API budget for live work. Default to the fake provider for implementation.
2. Parse user URLs without network access. Route unsupported inputs to name/locality search. Call only fixed Google API endpoints with timeouts, scoped credentials and minimal fields.
3. Keep results in the attributed, transient UI. Bind a short-lived selection assertion to the operator and project. Save only the confirmed Place ID as provider metadata.
4. Exercise manual intake separately. Do not map Google result types into draft, AI or export inputs.
5. Use a synthetic provider sentinel and assert it never reaches persistence, logs, analytics, prompts or rendered output. Verify disambiguation, stale ID, timeout, quota, and tampered assertions. Report fixture and live checks separately.

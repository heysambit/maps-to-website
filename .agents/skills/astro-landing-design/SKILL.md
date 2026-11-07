---
name: astro-landing-design
description: Build or refine the Astro landing renderer, themes, dashboard editor, or live preview with React, shadcn/ui, Tailwind and Motion.
---

# Build the editor and page renderer

Read [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md), AC-03–05 and AC-11 in [PRD.md](../../../PRD.md), and the renderer contract in [ARCHITECTURE.md](../../../ARCHITECTURE.md).

1. Implement page changes in shared Astro sections. Use one sanitized render model across preview, static and CMS. Keep proposed copy separate until an operator accepts it.
2. Use shadcn primitives for dashboard state. Check input labels, save conflicts, keyboard focus and reduced motion. Scope business theme tokens to the landing root.
3. Exercise storefront, service-area, no-media, and missing-optional fixtures. Use known safe contact destinations and keep review CTAs inert.
4. Compare normalized preview and static output. Run keyboard, axe, contrast, reduced motion and viewport checks. Include a 200% zoom check and report which screens and widths were actually exercised.

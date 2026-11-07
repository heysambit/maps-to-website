# Design system

## Dashboard

The dashboard is a workbench for an operator handling several client projects. Show the business, current revision, and next available action in the same place on every screen. Use plain labels such as “Waiting for owner approval,” “Payment recorded,” and “Live.” Present review, payment, and deployment as separate statuses.

Use Astro for route shells and React for stateful islands. Use shadcn/ui source components for forms, dialogs, sheets, tabs, and notifications. Keep the underlying accessible behavior when styling. Tailwind consumes CSS custom properties for semantic tokens. Put business theme variables under the landing root so they cannot change dashboard or reviewer chrome. Use Motion only for interactions that need animation. [shadcn/ui for Astro](https://ui.shadcn.com/docs/installation/astro) · [Motion accessibility](https://motion.dev/docs/react-accessibility)

| Token | Dashboard light | Dashboard dark |
| --- | --- | --- |
| Canvas | `#F5F7FB` | `#0F172A` |
| Surface | `#FFFFFF` | `#172033` |
| Text | `#172033` | `#F8FAFC` |
| Muted text | `#475569` | `#CBD5E1` |
| Decorative border | `#CBD5E1` | `#475569` |
| Control border | `#64748B` | `#94A3B8` |
| Primary / on-primary | `#1D4ED8` / `#FFFFFF` | `#93C5FD` / `#0F172A` |
| Focus ring | `#1D4ED8` | `#93C5FD` |
| Success / warning / danger text | `#166534` / `#92400E` / `#B91C1C` | `#86EFAC` / `#FCD34D` / `#FCA5A5` |

Use system sans for UI with tabular numerals for timestamps and versions. Body text 16 px, secondary text 14 px, panel titles 20 px, page titles 28 px. Use a 4 px spacing base and 8/12 px component/card radii. Keep text measure near 65 characters. Group section labels and validation text with their controls. Focus rings are 2 px with an offset. Action targets should be at least 44 by 44 CSS px where layout allows.

| Surface | Layout and behavior |
| --- | --- |
| Project list | Desktop rows, mobile cards. Show project name, stage, last saved time, and next action. Empty state offers “New project.” |
| Lookup and intake | Keep the Google result card visually separate with source and attribution. Use an explicit “Select this listing” action and a visible “Enter business details manually” path. Present origin and verification alongside each publishing field. |
| Editor | At 1024 px and above, use a form column of about 360–440 px and a flexible preview. At smaller widths, use labeled Edit and Preview tabs with preserved form state. Offer 390 px and full-width preview controls. |
| Save and validation | Put a persistent save indicator near the project title. Use inline errors plus a linked summary at submit. On conflict, preserve input and offer reload plus a copy/reapply path. Preserve keyboard focus on background saves. |
| Owner review | Show preview status and revision date above the page. Keep Approve and Request changes outside the simulated page. Distinguish expired, superseded, and signed-out states without disclosing project data to an unauthorized viewer. |
| Release | Show each gate, exact revision and hostname, and a separate confirmation action. Make progress and the next recovery action readable without relying on a toast. |

Use subtle 120–180 ms opacity or short translate transitions for popovers and panel changes. Honor reduced motion globally, keep route and focus transitions immediate, and avoid animated page entrances in the public renderer. Announce save, generation, and deployment state through a polite live region. Reserve assertive alerts for actionable failures. Use icons with text for state.

## Landing pages

Keep one responsive Astro section system with two configurations.

| Section | Storefront | Service area |
| --- | --- | --- |
| Hero | Business name, service and locality, verified primary CTA | Business name, service promise backed by facts, area served and verified primary CTA |
| Services | Three to six sourced service items when available | Same, with area or eligibility details when useful |
| About and proof | Short factual introduction, optional cleared proof | Same. Omit empty sections |
| Contact | Business-approved address, optional hours, directions and primary contact | Service area, optional hours, and approved contact. Exclude private street address and storefront directions |
| Footer | Approved name and contact/legal links when required | Same |

Use semantic HTML with one H1, ordered headings and clear anchor names. A single primary contact method appears in the hero and contact section. Preview explains that real contact actions are disabled. Public pages use a call link, independently verified HTTPS contact destination, or a verified Maps directions URL as appropriate. Avoid forms in MVP.

Use two accessible theme presets. **Coast** uses cream `#FFFBF4`, ink `#172033`, action `#1D4ED8` and white action text. **Grove** uses `#F4FAF5`, ink `#142B20`, action `#166534` and white action text. Verify pairings before adding tokens or variants. Use a system body stack, a distinct system display stack if useful, and one optional locally hosted licensed family per site. Keep horizontal padding at 16 px mobile and 32 px desktop, content width at 72 rem, and section spacing responsive between 40 and 80 px. Use a text-first hero when licensed imagery is unavailable. Media uses explicit dimensions, responsive sources, descriptive alt text for informative images, and empty alt text for decorative imagery.

Public output has no default client hydration, third-party trackers, placeholder endorsements, invented metrics, or borrowed Places media. Generate descriptive metadata and canonical URL only from approved content and host. Generate structured data only when fields and business type are appropriate and verified. Prefer static landmarks and a small payload. Pilot performance budget for the fixture page is 350 KiB initial transfer with optimized imagery and no third-party requests. Target WCAG 2.2 AA, including visible focus, text contrast of at least 4.5:1 for normal text, and a keyboard path through editing, approval, and contact. Check all four PRD widths, 200% zoom, keyboard, reduced motion, contrast, and both optional-content states. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

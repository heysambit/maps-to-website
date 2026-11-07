# Product requirements

## Outcome

A small web studio can prepare and sell a credible one-page website for a local service or location-based business. The operator owns the process from discovery to handoff. The business owner reviews a private draft and approves the exact version to be published. Visitors can call, request directions, or use another verified contact option.

## People and boundaries

| Person | Responsibilities and access |
| --- | --- |
| Operator | Signs into a private workspace, finds the listing, records independently sourced content and rights, edits the page, grants review access, records payment, and requests release |
| Business owner or authorized reviewer | Signs in through a named invitation and reviews a frozen draft. An explicitly designated approver can approve or request changes |
| Site visitor | Views only the released page and uses verified contact links |
| CMS owner | After purchase and handoff, edits the published site through a site-specific EmDash account if the CMS option was purchased |

Start with one studio per installation, multiple operator accounts, and several business projects. Roles are enforced server-side. Multi-studio SaaS, bulk prospecting, scraping, automated outreach, payment processing, drag-and-drop design, multi-page sales sites, bookings, and marketplace integrations are outside MVP. Quote and collect payments externally. Add CMS only to purchased sites where it is part of the sale.

## Journeys

1. **Discover.** The operator searches by business name and locality or enters a Place ID. The results display their source, and the operator confirms the correct business or starts manually. A pasted Maps share URL leads to search instructions unless the URL includes a supported explicit Place ID. Search ambiguity never selects a match automatically.
2. **Prepare.** The operator records facts from a business-controlled source or directly from the owner, with field-level provenance. The operator chooses storefront or service area, enters one useful contact method, and adds only cleared media. The builder creates a page draft. Optional AI can propose copy for review using eligible confirmed inputs.
3. **Edit.** The operator edits copy and section settings and checks the live preview on mobile and desktop. Missing optional sections stay hidden. Unsaved changes, failed saves, and concurrent edits are visible.
4. **Review.** The operator freezes a revision and manually shares the link with a named reviewer. The recipient signs in and can view only granted revisions. The approver can approve that exact revision or request changes. Review links expire and can be revoked. A new review round supersedes the prior round.
5. **Release.** The operator records external payment and validates publication authority, media rights, and the destination domain. The operator submits an explicit release for the approved revision. Once the live URL passes verification, the workspace shows the release and its rollback target.
6. **Hand off.** The operator gives the owner the production URL, source/export, asset-rights inventory, and ownership instructions. If purchased, the owner receives a site-specific EmDash account and verifies editing and recovery on the final hostname.

## Acceptance criteria

| ID | Requirement and observable acceptance |
| --- | --- |
| AC-01 | Given similar listings in one city, the operator sees distinguishing information where available and must select one explicitly. With a stale ID, empty result, denied request, or quota failure, manual intake remains usable. |
| AC-02 | Google lookup data appears in a distinct attributed result card. Only the selected Place ID may cross into durable lookup metadata. A Google response containing sentinel values leaves none of those values in storage, prompts, rendered sites, downloadable source, analytics, or request logs. |
| AC-03 | The operator can save an incomplete draft. Sharing and publishing require a business name, service summary, location or service area, and at least one valid contact action. Every published business fact has an independently sourced record. Rights and source errors identify the affected field. |
| AC-04 | One storefront fixture shows an authorized street address and directions action. One service-area fixture shows the approved area and omits a private address and storefront directions. Both work with missing media, hours, and testimonials. |
| AC-05 | The page updates from valid local edits after a short debounce. Save errors preserve form input. A conflicting write cannot overwrite the newer saved revision. The preview and static build render the same sections and contact actions for the same snapshot. |
| AC-06 | Anonymous, wrong-email, expired, and revoked access fail for the review page and protected assets. Approval and comment endpoints enforce the same scope. Review pages never expose an active sales CTA or get indexed. |
| AC-07 | A designated approver can approve a single frozen revision. Viewers cannot approve. Editing creates a new draft and never moves an approval to it. A review marked superseded, revoked before release, or awaiting changes cannot authorize release. |
| AC-08 | A release fails closed with missing or reversed payment, missing publication authority, an invalid domain, or mismatched approval. Payment and review approval independently leave deployment idle. Duplicate publish requests cannot create duplicate active releases. |
| AC-09 | A successful release records the revision, build and content hashes, verified hostname, provider version, and actor. A failed or indeterminate deploy gives the operator a recoverable state. Rollback restores an eligible prior release after verification. |
| AC-10 | A purchased CMS site seeds exactly once from the approved data. The owner can save a draft and publish an edit through EmDash on the final hostname. Draft changes stay private. Another site's owner cannot access this CMS. |
| AC-11 | Keyboard and assistive technology can complete the happy path. At 320, 390, 768, and 1440 CSS px, core tasks remain usable. Reduced motion and dark dashboard modes preserve focus, contrast, and status readability. |
| AC-12 | A clean checkout runs local fixture mode with no paid keys. Staging checks demonstrate policy disclosures, secure hosting, asset authorization, release, rollback, and CMS recovery before the corresponding feature is enabled for customers. |

## Pilot signals and service defaults

Measure draft-to-review time, reviews opened and approved, and approved-to-live time through project events without recording Places query text or raw content. Proposed pilot targets are median 15 minutes from ready intake to shared demo across five representative projects, and a successful publish and rollback on staging for each layout. Track conversion as observed pilot data. Seven days is the default review expiry. Reconfirm that the owner can lawfully authorize release and has accepted the final content and domain before going live.

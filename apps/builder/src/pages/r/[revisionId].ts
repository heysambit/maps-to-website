import { env } from 'cloudflare:workers';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error The Astro Vite integration resolves this workspace component at build time.
import LandingPage from '@studio/landing/LandingPage.astro';
import { requireReviewer } from '../../lib/guards';
import { getReviewForRevision } from '../../lib/reviews';
import { toPrivateReviewModel } from '../../lib/review-render';

export const prerender = false;
const denied = () => new Response('<!doctype html><html lang="en"><head><meta name="robots" content="noindex,nofollow,noarchive"><title>Review unavailable</title></head><body><main><h1>Review unavailable</h1><p>This review is not available for this signed-in identity.</p></main></body></html>', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer' } });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
function routeValue(value: string): string { try { return decodeURIComponent(value); } catch { return value; } }

export async function GET({ request, params }: { request: Request; params: { revisionId: string } }): Promise<Response> {
  const identity = await requireReviewer(request, env);
  if (!identity) return denied();
  const revisionId = routeValue(params.revisionId);
  const snapshot = await getReviewForRevision(env.DB, revisionId, identity.email);
  if (!snapshot) return denied();
  const model = await toPrivateReviewModel(env.DB, snapshot.revision);
  if (!model) return denied();
  try {
    const container = await AstroContainer.create();
    const content = await container.renderToString(LandingPage, { props: { model, inert: true }, request });
    const reviewerName = escapeHtml(snapshot.grant.name);
    const revisionId = escapeHtml(snapshot.revision.id);
    const decisionUrl = `/api/reviews/${encodeURIComponent(snapshot.revision.id)}/decision`;
    const actions = snapshot.grant.role === 'approver' && snapshot.review.status === 'pending'
      ? `<section class="review-actions" aria-label="Review actions"><form method="POST" action="${decisionUrl}"><input type="hidden" name="action" value="approved"><button class="approve" type="submit">Approve this revision</button></form><form method="POST" action="${decisionUrl}"><label for="review-message">Request changes and leave a note</label><textarea id="review-message" name="message" maxlength="2000" rows="3"></textarea><button class="changes" type="submit" name="action" value="changes_requested">Request changes</button></form></section>`
      : `<section class="review-actions"><p>${snapshot.grant.role === 'viewer' ? 'You have view access. An approver must record a decision.' : 'This review no longer accepts decisions.'}</p></section>`;
    const decision = snapshot.decision ? `<section class="decision-note" aria-live="polite"><h2>Decision recorded: ${escapeHtml(snapshot.decision.action.replaceAll('_', ' '))}</h2><p>${escapeHtml(snapshot.decision.message || 'No comment added.')}</p></section>` : '';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>Private owner review</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172033;font:16px/1.5 system-ui,sans-serif}.review-shell{margin:auto;max-width:84rem;padding:24px 16px 48px}.review-heading,.review-actions,.decision-note{margin:0 auto 16px;max-width:72rem;border:1px solid #cbd5e1;border-radius:12px;background:white;padding:20px}h1{margin:4px 0;font-size:28px;line-height:1.2}h2{margin:0 0 8px;font-size:18px}p{margin:6px 0;color:#334155;overflow-wrap:anywhere}.eyebrow{color:#475569;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}.review-actions{display:flex;flex-wrap:wrap;align-items:start;gap:12px}.review-actions form{display:grid;gap:10px;min-width:min(100%,19rem)}textarea{width:100%;resize:vertical;border:1px solid #64748b;border-radius:8px;padding:10px;font:inherit}button{min-height:44px;border:0;border-radius:8px;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer}button:focus-visible,textarea:focus-visible{outline:2px solid #1d4ed8;outline-offset:2px}.approve{background:#1d4ed8;color:white}.changes{border:1px solid #64748b;background:white;color:#172033}.rendered-page{overflow:hidden;border:1px solid #cbd5e1;border-radius:12px;background:white}@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}</style></head><body><main class="review-shell"><header class="review-heading"><p class="eyebrow">Private owner review · Round ${snapshot.review.roundNo}</p><h1>Review this frozen page</h1><p>Revision ${revisionId} · Access granted to ${reviewerName} · ${snapshot.grant.role}</p><p>Status: ${escapeHtml(snapshot.review.status.replaceAll('_', ' '))} · Expires ${escapeHtml(snapshot.grant.expiresAt)}</p></header>${decision}${actions}<section class="rendered-page" aria-label="Frozen page preview">${content}</section></main></body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" } });
  } catch { return denied(); }
}

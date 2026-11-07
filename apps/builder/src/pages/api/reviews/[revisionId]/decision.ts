import { env } from 'cloudflare:workers';
import { requireReviewer } from '../../../../lib/guards';
import { getReviewForRevision, recordDecision } from '../../../../lib/reviews';
import { privateJson, readBoundedRequestBytes } from '../../../../lib/places/http';

export const prerender = false;
function routeValue(value: string): string { try { return decodeURIComponent(value); } catch { return value; } }
export async function POST({ request, params }: { request: Request; params: { revisionId: string } }): Promise<Response> {
  const identity = await requireReviewer(request, env);
  if (!identity) return privateJson({ error: 'Unauthorized.' }, 401);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) return privateJson({ error: 'Expected review form data.' }, 400);
  let form: URLSearchParams;
  try { form = new URLSearchParams(new TextDecoder().decode(await readBoundedRequestBytes(request, 8192))); } catch (error) { return privateJson({ error: error instanceof Error && error.message === 'size' ? 'Review note is too long.' : 'Expected review form data.' }, error instanceof Error && error.message === 'size' ? 413 : 400); }
  const action = form.get('action');
  const message = form.get('message');
  if (action !== 'approved' && action !== 'changes_requested') return privateJson({ error: 'Unknown review decision.' }, 400);
  if (message !== null && (typeof message !== 'string' || message.length > 2000)) return privateJson({ error: 'Review note is too long.' }, 400);
  const revisionId = routeValue(params.revisionId);
  const snapshot = await getReviewForRevision(env.DB, revisionId, identity.email);
  if (!snapshot || snapshot.grant.role !== 'approver' || snapshot.review.status !== 'pending') return privateJson({ error: 'This identity cannot decide the current review.' }, 403);
  const success = await recordDecision(env.DB, snapshot, identity.email, action, typeof message === 'string' ? message : '');
  if (!success) return privateJson({ error: 'The review changed or expired before the decision was recorded.' }, 409);
  if (request.headers.get('accept')?.includes('text/html')) return new Response(null, { status: 303, headers: { Location: `/r/${encodeURIComponent(params.revisionId)}?decision=${action}`, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer' } });
  return privateJson({ status: action, revisionId: snapshot.revision.id, round: snapshot.review.roundNo });
}

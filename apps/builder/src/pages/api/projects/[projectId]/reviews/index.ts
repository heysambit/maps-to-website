import { env } from 'cloudflare:workers';
import { requireOperator } from '../../../../../lib/guards';
import { createReviewRound, validateGrantInputs } from '../../../../../lib/reviews';
import { privateJson, readBoundedRequestBytes } from '../../../../../lib/places/http';

export const prerender = false;
function reviewUrl(revisionId: string): string | null {
  const path = `/r/${encodeURIComponent(revisionId)}`;
  if (env.APP_ENV === 'development') return path;
  try {
    const host = env.REVIEWER_HOST.trim().toLowerCase();
    const url = new URL(`https://${host}`);
    return url.hostname === host && !url.port && !url.username && !url.password ? `${url.origin}${path}` : null;
  } catch { return null; }
}
export async function POST({ request, params }: { request: Request; params: { projectId: string } }): Promise<Response> {
  const identity = await requireOperator(request, env);
  if (!identity) return privateJson({ error: 'Unauthorized.' }, 401);
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(await readBoundedRequestBytes(request, 16_384))) as unknown; } catch (error) { return privateJson({ error: error instanceof Error && error.message === 'size' ? 'Review request is too large.' : 'Expected valid JSON.' }, error instanceof Error && error.message === 'size' ? 413 : 400); }
  if (!body || typeof body !== 'object' || !Number.isSafeInteger((body as { baseVersion?: unknown }).baseVersion) || Number((body as { baseVersion: number }).baseVersion) < 0 || !validateGrantInputs((body as { grants?: unknown }).grants)) return privateJson({ error: 'Provide the current saved version and one to twenty named reviewer grants.' }, 400);
  const url = reviewUrl('pending');
  if (!url) return privateJson({ error: 'The approved reviewer hostname is not configured.' }, 503);
  const result = await createReviewRound(env.DB, params.projectId, Number((body as { baseVersion: number }).baseVersion), (body as { grants: Parameters<typeof createReviewRound>[3] }).grants, identity.email);
  if (result.status === 'not-found') return privateJson({ error: 'Project not found.' }, 404);
  if (result.status === 'conflict') return privateJson({ error: 'The saved draft changed. Reload it before starting review.', currentVersion: result.currentVersion }, 409);
  return privateJson({ ...result, url: reviewUrl(result.revision.id) }, 201);
}

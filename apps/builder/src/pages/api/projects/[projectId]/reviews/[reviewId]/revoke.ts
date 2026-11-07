import { env } from 'cloudflare:workers';
import { requireOperator } from '../../../../../../lib/guards';
import { revokeReview } from '../../../../../../lib/reviews';
import { privateJson } from '../../../../../../lib/places/http';

export const prerender = false;
export async function POST({ request, params }: { request: Request; params: { projectId: string; reviewId: string } }): Promise<Response> {
  const identity = await requireOperator(request, env);
  if (!identity) return privateJson({ error: 'Unauthorized.' }, 401);
  const revoked = await revokeReview(env.DB, params.projectId, params.reviewId, identity.email);
  return revoked ? privateJson({ status: 'revoked' }) : privateJson({ error: 'Review not found or no longer revocable.' }, 404);
}

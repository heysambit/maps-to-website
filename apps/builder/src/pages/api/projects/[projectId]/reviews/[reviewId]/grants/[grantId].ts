import { env } from 'cloudflare:workers';
import { requireOperator } from '../../../../../../../lib/guards';
import { revokeGrant } from '../../../../../../../lib/reviews';
import { privateJson } from '../../../../../../../lib/places/http';

export const prerender = false;
export async function DELETE({ request, params }: { request: Request; params: { projectId: string; reviewId: string; grantId: string } }): Promise<Response> {
  const identity = await requireOperator(request, env);
  if (!identity) return privateJson({ error: 'Unauthorized.' }, 401);
  const revoked = await revokeGrant(env.DB, params.projectId, params.reviewId, params.grantId, identity.email);
  return revoked ? privateJson({ status: 'revoked' }) : privateJson({ error: 'Grant not found or already revoked.' }, 404);
}

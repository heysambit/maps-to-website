import { env } from 'cloudflare:workers';
import { requireOperator } from '../../../../../lib/guards';
import { verifySelectionAssertion } from '../../../../../lib/places/assertion';
import { privateJson } from '../../../../../lib/places/http';
import { placesLookup } from '../../../../../lib/places/service';
import { projectExists, saveSelectedPlace, recordPlacesEvent } from '../../../../../lib/places/store';
import { PlacesError } from '../../../../../lib/places/types';

export const prerender = false;
type Context = { request: Request; params: { projectId: string } };
export async function POST({ request, params }: Context): Promise<Response> {
  const identity = await requireOperator(request, env);
  if (!identity) return privateJson({ error: 'Unauthorized.' }, 401);
  if (!await projectExists(env.DB, params.projectId)) return privateJson({ error: 'Project not found.' }, 404);
  let body: unknown;
  try { body = await request.json(); } catch { return privateJson({ error: 'Expected JSON.' }, 400); }
  if (!body || typeof body !== 'object') return privateJson({ error: 'Expected selection.' }, 400);
  const { placeId, assertion } = body as Record<string, unknown>;
  if (typeof placeId !== 'string' || !/^[A-Za-z0-9_-]{5,256}$/.test(placeId) || !await verifySelectionAssertion(env.PLACES_ASSERTION_SECRET, assertion, params.projectId, identity.id, placeId)) {
    await recordPlacesEvent(env.DB, params.projectId, identity.id, 'selected', 'rejected');
    return privateJson({ error: 'Selection expired or is not valid for this project.' }, 403);
  }
  try {
    const current = await placesLookup().getById(placeId, AbortSignal.timeout(4000));
    if (!current) {
      await recordPlacesEvent(env.DB, params.projectId, identity.id, 'manual_fallback', 'stale');
      return privateJson({ status: 'manual', reason: 'stale', message: 'That listing is no longer available. Continue with manual intake.' }, 409);
    }
  } catch (error) {
    const reason = error instanceof PlacesError ? error.kind : 'timeout';
    await recordPlacesEvent(env.DB, params.projectId, identity.id, 'manual_fallback', reason === 'quota' ? 'quota' : 'timeout');
    return privateJson({ status: 'manual', reason: reason === 'quota' ? 'quota' : 'timeout', message: 'Could not confirm the listing. Continue with manual intake.' }, 503);
  }
  if (!await saveSelectedPlace(env.DB, params.projectId, identity.id, placeId)) return privateJson({ error: 'Project not found.' }, 404);
  return privateJson({ status: 'selected', placeId });
}

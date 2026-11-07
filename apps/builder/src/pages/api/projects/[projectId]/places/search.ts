import { env } from 'cloudflare:workers';
import { requireOperator } from '../../../../../lib/guards';
import { issueSelectionAssertion } from '../../../../../lib/places/assertion';
import { privateJson } from '../../../../../lib/places/http';
import { parsePlacesInput } from '../../../../../lib/places/input';
import { placesLookup } from '../../../../../lib/places/service';
import { projectExists, recordPlacesEvent, lookupWithinLocalBudget } from '../../../../../lib/places/store';
import { PlacesError, type PlaceCard } from '../../../../../lib/places/types';

export const prerender = false;
type Context = { request: Request; params: { projectId: string } };
export async function POST({ request, params }: Context): Promise<Response> {
  const identity = await requireOperator(request, env);
  if (!identity) return privateJson({ error: 'Unauthorized.' }, 401);
  if (!await projectExists(env.DB, params.projectId)) return privateJson({ error: 'Project not found.' }, 404);
  if (!await lookupWithinLocalBudget(env.DB, identity.id)) {
    await recordPlacesEvent(env.DB, params.projectId, identity.id, 'manual_fallback', 'quota');
    return privateJson({ status: 'manual', reason: 'quota', message: 'Lookup limit reached. Continue with manual intake.' }, 429);
  }
  let input;
  try { input = parsePlacesInput(await request.json()); } catch { return privateJson({ error: 'Enter a supported business name and locality, or a supported Place ID.' }, 400); }
  if (input.kind === 'manual') {
    await recordPlacesEvent(env.DB, params.projectId, identity.id, 'manual_fallback', 'unsupported');
    return privateJson({ status: 'manual', reason: input.reason, message: 'This link cannot be resolved safely. Enter the business name and locality to search, or continue with manual intake.' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const provider = placesLookup();
    let results: PlaceCard[];
    if (input.kind === 'place-id') {
      const found = await provider.getById(input.placeId, controller.signal);
      results = found ? [found] : [];
    } else results = await provider.search(input, controller.signal);
    await recordPlacesEvent(env.DB, params.projectId, identity.id, 'lookup', results.length ? 'results' : 'empty');
    if (!results.length) return privateJson({ status: 'manual', reason: input.kind === 'place-id' ? 'stale' : 'ambiguous', message: 'No current result. Continue with manual intake or search again.' });
    const assertion = await issueSelectionAssertion(env.PLACES_ASSERTION_SECRET, params.projectId, identity.id, results.map((r) => r.placeId));
    return privateJson({ status: 'results', results, assertion });
  } catch (error) {
    const kind = error instanceof PlacesError ? error.kind : controller.signal.aborted ? 'timeout' : 'unavailable';
    const outcome = kind === 'quota' ? 'quota' : kind === 'timeout' ? 'timeout' : 'unavailable';
    await recordPlacesEvent(env.DB, params.projectId, identity.id, 'manual_fallback', outcome);
    return privateJson({ status: 'manual', reason: outcome, message: 'Lookup is unavailable. Continue with manual intake.' }, kind === 'quota' ? 429 : 503);
  } finally { clearTimeout(timer); }
}

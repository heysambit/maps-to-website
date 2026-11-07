import { PlacesError, type PlaceCard, type PlacesLookup, type PlacesSearchInput } from './types';

const SEARCH_MASK = 'places.id,places.displayName,places.formattedAddress,places.attributions';
const DETAILS_MASK = 'id,displayName,formattedAddress,attributions';
const API = 'https://places.googleapis.com/v1';

function normalizePlace(row: unknown): PlaceCard | null {
  if (!row || typeof row !== 'object') return null;
  const p = row as Record<string, unknown>;
  const name = p.displayName && typeof p.displayName === 'object' ? (p.displayName as { text?: unknown }).text : undefined;
  if (typeof p.id !== 'string' || typeof name !== 'string') return null;
  const attributions = Array.isArray(p.attributions) ? p.attributions.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const provider = (item as { provider?: unknown }).provider;
    return typeof provider === 'string' && provider.length <= 160 ? [provider] : [];
  }) : [];
  return { placeId: p.id, displayName: name, ...(typeof p.formattedAddress === 'string' ? { formattedAddress: p.formattedAddress } : {}), attributions };
}

async function request(url: string, init: RequestInit, key: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, headers: { ...init.headers, 'X-Goog-Api-Key': key } });
    if (response.status === 429 || response.status === 403) throw new PlacesError('quota');
    if (!response.ok) throw new PlacesError('unavailable');
    return await response.json();
  } catch (error) {
    if (error instanceof PlacesError) throw error;
    if (controller.signal.aborted) throw new PlacesError('timeout');
    throw new PlacesError('unavailable');
  } finally { clearTimeout(timeout); }
}

export function googlePlaces(apiKey: string): PlacesLookup {
  return {
    async search(input: PlacesSearchInput) {
      const result = await request(`${API}/places:searchText`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-FieldMask': SEARCH_MASK }, body: JSON.stringify({ textQuery: [input.query, input.locality].filter(Boolean).join(', '), pageSize: 5 }) }, apiKey) as { places?: unknown[] };
      return (result.places || []).map(normalizePlace).filter((p): p is PlaceCard => p !== null);
    },
    async getById(placeId: string) {
      if (!/^[A-Za-z0-9_-]{5,256}$/.test(placeId)) return null;
      try {
        return normalizePlace(await request(`${API}/places/${encodeURIComponent(placeId)}`, { headers: { 'X-Goog-FieldMask': DETAILS_MASK } }, apiKey));
      } catch (error) { if (error instanceof PlacesError && error.kind === 'unavailable') return null; throw error; }
    },
  };
}

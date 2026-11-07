const PLACE_ID = /^[A-Za-z0-9_-]{5,256}$/;
const ALLOWED_HOSTS = new Set(['google.com', 'www.google.com', 'maps.google.com']);

export type ParsedPlacesInput =
  | { kind: 'place-id'; placeId: string }
  | { kind: 'search'; query: string; locality?: string }
  | { kind: 'manual'; reason: 'unsupported-url' };

export function parsePlacesInput(raw: unknown): ParsedPlacesInput {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid lookup input.');
  const body = raw as Record<string, unknown>;
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 200) : '';
  const locality = typeof body.locality === 'string' ? body.locality.trim().slice(0, 120) : '';
  if (query.length < 2) throw new Error('Enter a business name and locality.');
  if (/^[a-z][a-z\d+.-]*:/i.test(query) || query.startsWith('//')) {
    let url: URL;
    try { url = new URL(query); } catch { return { kind: 'manual', reason: 'unsupported-url' }; }
    const host = url.hostname.toLowerCase().replace(/^maps\./, '');
    if (url.protocol === 'https:' && ALLOWED_HOSTS.has(host) && /^\/maps(?:\/|$)/.test(url.pathname)) {
      const id = url.searchParams.get('query_place_id') || url.searchParams.get('place_id');
      if (id && PLACE_ID.test(id)) return { kind: 'place-id', placeId: id };
    }
    return { kind: 'manual', reason: 'unsupported-url' };
  }
  if (query.startsWith('ChI') && PLACE_ID.test(query)) return { kind: 'place-id', placeId: query };
  return { kind: 'search', query, locality: locality || undefined };
}

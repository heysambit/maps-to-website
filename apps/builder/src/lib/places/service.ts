import { env } from 'cloudflare:workers';
import { fakePlaces } from './fake';
import { googlePlaces } from './google';
import type { PlacesLookup } from './types';

export function placesLookup(): PlacesLookup {
  if (env.PLACES_LOOKUP_ENABLED !== 'true') return fakePlaces;
  if (env.APP_ENV !== 'staging' || !env.GOOGLE_PLACES_API_KEY) return fakePlaces;
  return googlePlaces(env.GOOGLE_PLACES_API_KEY);
}

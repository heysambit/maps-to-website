export type PlaceCard = {
  placeId: string;
  displayName: string;
  formattedAddress?: string;
  attributions: string[];
};

export type PlacesSearchInput = { query: string; locality?: string };
export type PlacesLookup = {
  search(input: PlacesSearchInput, signal: AbortSignal): Promise<PlaceCard[]>;
  getById(placeId: string, signal: AbortSignal): Promise<PlaceCard | null>;
};

export type PlacesFailure = 'quota' | 'timeout' | 'unavailable' | 'stale';
export class PlacesError extends Error {
  constructor(readonly kind: PlacesFailure) { super(kind); }
}

import { PlacesError, type PlacesLookup, type PlacesSearchInput } from './types';

// Synthetic provider data exists only in the transient result card.
export const GOOGLE_SENTINEL = 'GOOGLE_SENTINEL_EPHEMERAL_7f31';
export const fakePlaces: PlacesLookup = {
  async search(input: PlacesSearchInput, signal: AbortSignal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (/quota/i.test(input.query)) throw new PlacesError('quota');
    if (/timeout/i.test(input.query)) throw new PlacesError('timeout');
    return [
      { placeId: 'ChIJfixtureNorthstar001', displayName: `Northstar Repair (${GOOGLE_SENTINEL})`, formattedAddress: `42 Synthetic Avenue, ${input.locality || 'Sampletown'} (${GOOGLE_SENTINEL})`, attributions: ['Google Maps'] },
      { placeId: 'ChIJfixtureNorthstar002', displayName: 'Northstar Repair South', formattedAddress: `${input.locality || 'Sampletown'} South`, attributions: ['Google Maps'] },
    ];
  },
  async getById(placeId, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!placeId.startsWith('ChIJfixture')) return null;
    return { placeId, displayName: `Synthetic listing (${GOOGLE_SENTINEL})`, formattedAddress: `12 Demo Road (${GOOGLE_SENTINEL})`, attributions: ['Google Maps'] };
  },
};

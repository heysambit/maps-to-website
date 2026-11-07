import { describe, expect, it } from 'vitest';
import { issueSelectionAssertion, verifySelectionAssertion } from '../../apps/builder/src/lib/places/assertion';
import { parsePlacesInput } from '../../apps/builder/src/lib/places/input';
import { fakePlaces, GOOGLE_SENTINEL } from '../../apps/builder/src/lib/places/fake';
import { sealRevision, toRenderModel } from '../../packages/contracts/src/index';
import { storefrontDraft } from '../fixtures/drafts';
import { authorizePlacesRequest } from '../../apps/builder/src/lib/places/auth';

describe('Places lookup boundary', () => {
  it('requires the local operator bearer and refuses fixture auth in production', () => {
    expect(authorizePlacesRequest(new Request('http://127.0.0.1'), 'development', 'a-local-operator-token-that-is-long-enough')).toBeNull();
    expect(authorizePlacesRequest(new Request('http://127.0.0.1', { headers: { Authorization: 'Bearer wrong-token' } }), 'development', 'a-local-operator-token-that-is-long-enough')).toBeNull();
    expect(authorizePlacesRequest(new Request('http://127.0.0.1', { headers: { Authorization: 'Bearer a-local-operator-token-that-is-long-enough' } }), 'development', 'a-local-operator-token-that-is-long-enough')?.id).toBe('demo-operator');
    expect(authorizePlacesRequest(new Request('https://builder.example.com', { headers: { Authorization: 'Bearer a-local-operator-token-that-is-long-enough' } }), 'development', 'a-local-operator-token-that-is-long-enough')).toBeNull();
    expect(authorizePlacesRequest(new Request('http://127.0.0.1', { headers: { Authorization: 'Bearer a-local-operator-token-that-is-long-enough' } }), 'production', 'a-local-operator-token-that-is-long-enough')).toBeNull();
  });

  it('parses only supported HTTPS Maps IDs locally and routes short/hostile URLs to search', () => {
    expect(parsePlacesInput({ query: 'https://www.google.com/maps/place/x?query_place_id=ChIJfixtureNorthstar001' })).toEqual({ kind: 'place-id', placeId: 'ChIJfixtureNorthstar001' });
    expect(parsePlacesInput({ query: 'https://maps.app.goo.gl/abc', locality: 'Portland' }).kind).toBe('manual');
    expect(parsePlacesInput({ query: 'https://evil.example/maps?place_id=ChIJfixtureNorthstar001' }).kind).toBe('manual');
    expect(parsePlacesInput({ query: 'http://www.google.com/maps?place_id=ChIJfixtureNorthstar001' }).kind).toBe('manual');
    expect(parsePlacesInput({ query: 'javascript:alert(1)' }).kind).toBe('manual');
    expect(parsePlacesInput({ query: 'ChIJfixtureNorthstar001' })).toEqual({ kind: 'place-id', placeId: 'ChIJfixtureNorthstar001' });
    expect(() => parsePlacesInput({ query: 'x' })).toThrow();
  });

  it('binds signed assertions to the project, operator, returned IDs, and short expiry', async () => {
    const now = 1_800_000_000_000;
    const token = await issueSelectionAssertion('test-secret', 'project-a', 'operator-a', ['ChIJfixtureNorthstar001'], now);
    expect(await verifySelectionAssertion('test-secret', token, 'project-a', 'operator-a', 'ChIJfixtureNorthstar001', now + 100)).toBe(true);
    expect(await verifySelectionAssertion('test-secret', `${token}x`, 'project-a', 'operator-a', 'ChIJfixtureNorthstar001', now + 100)).toBe(false);
    expect(await verifySelectionAssertion('test-secret', token, 'project-b', 'operator-a', 'ChIJfixtureNorthstar001', now + 100)).toBe(false);
    expect(await verifySelectionAssertion('test-secret', token, 'project-a', 'operator-b', 'ChIJfixtureNorthstar001', now + 100)).toBe(false);
    expect(await verifySelectionAssertion('test-secret', token, 'project-a', 'operator-a', 'other-place-id', now + 100)).toBe(false);
    expect(await verifySelectionAssertion('test-secret', token, 'project-a', 'operator-a', 'ChIJfixtureNorthstar001', now + 300_001)).toBe(false);
  });

  it('keeps synthetic provider fields outside draft and render contracts', async () => {
    const card = (await fakePlaces.search({ query: 'fixture' }, new AbortController().signal))[0];
    expect(JSON.stringify(card)).toContain(GOOGLE_SENTINEL);
    const revision = await sealRevision(storefrontDraft);
    const renderInput = await toRenderModel(revision);
    const aiInput = { eligibleFacts: Object.entries(storefrontDraft).filter(([key]) => key !== 'place' && key !== 'placeId') };
    const portableExport = { source: storefrontDraft, renderInput };
    expect(JSON.stringify({ fixture: storefrontDraft, promptInput: aiInput, renderInput, portableExport })).not.toContain(GOOGLE_SENTINEL);
    expect(card.attributions).toEqual(['Google Maps']);
  });
});

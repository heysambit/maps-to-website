import { describe, expect, it, vi } from 'vitest';
import { deterministicCopy, eligibleCopySourceIds, fixtureSuggestionAdapter } from '../../apps/builder/src/lib/copy';
import { incompleteDraft, storefrontDraft } from '../fixtures/drafts';

describe('fixture-only copy assistance', () => {
  it('builds deterministic copy from independently sourced fields only', () => {
    expect(deterministicCopy(incompleteDraft)).toBeNull();
    expect(deterministicCopy(storefrontDraft)).toMatchObject({ text: storefrontDraft.serviceSummary?.value, sourceIds: ['serviceSummary'], generatedBy: 'fixture-only' });
    expect(eligibleCopySourceIds(storefrontDraft)).toContain('businessName');
  });

  it('requires eligible source IDs and never accesses the network', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const proposal = fixtureSuggestionAdapter.suggest({ sourceIds: ['serviceSummary'], eligibleFacts: { serviceSummary: storefrontDraft.serviceSummary } });
    expect(proposal).toMatchObject({ text: storefrontDraft.serviceSummary?.value, sourceIds: ['serviceSummary'], generatedBy: 'fixture-only' });
    expect(() => fixtureSuggestionAdapter.suggest({ sourceIds: ['about'], eligibleFacts: {} })).toThrow('independently sourced');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

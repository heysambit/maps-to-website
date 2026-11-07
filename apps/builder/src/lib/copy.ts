import type { Draft, Fact } from '@studio/contracts';

export type CopySourceId = 'businessName' | 'serviceSummary' | 'locality' | 'about';
export type CopyProposal = { text: string; sourceIds: CopySourceId[]; generatedBy: 'fixture-only' };
export interface CopySuggestionAdapter {
  suggest(input: { sourceIds: CopySourceId[]; eligibleFacts: Partial<Record<CopySourceId, Fact>> }): CopyProposal;
}

export function eligibleCopySourceIds(draft: Draft): CopySourceId[] {
  const ids: CopySourceId[] = ['businessName', 'serviceSummary', 'locality', 'about'];
  return ids.filter((id) => {
    const fact = draft[id];
    return Boolean(fact?.value.trim() && fact.provenance?.sourceKind === 'independent' && fact.provenance.sourceRef?.trim() && fact.provenance.checkedAt && fact.provenance.checkedBy?.trim());
  });
}

export function deterministicCopy(draft: Draft): CopyProposal | null {
  const sourceIds = eligibleCopySourceIds(draft);
  const fact = draft.serviceSummary;
  if (!fact || !sourceIds.includes('serviceSummary')) return null;
  return { text: fact.value.trim().replace(/\s+/g, ' '), sourceIds: ['serviceSummary'], generatedBy: 'fixture-only' };
}

export const fixtureSuggestionAdapter: CopySuggestionAdapter = {
  suggest({ sourceIds, eligibleFacts }) {
    if (!sourceIds.length || sourceIds.length > 4 || sourceIds.some((id) => !eligibleFacts[id])) throw new Error('Select only independently sourced facts.');
    // This deliberately does not call a model or fetch. It returns only supplied, eligible source text.
    const text = sourceIds.map((id) => eligibleFacts[id]!.value.trim().replace(/\s+/g, ' ')).join(' · ');
    if (!text || text.length > 1000) throw new Error('Suggestion is empty or too long.');
    return { text, sourceIds: [...sourceIds], generatedBy: 'fixture-only' };
  },
};

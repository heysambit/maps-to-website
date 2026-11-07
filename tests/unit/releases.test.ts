import { describe, expect, it } from 'vitest';
import { canTransitionRelease, createReleaseBundle, sealRevision, validateReleaseGates, verifyReleaseBundle } from '../../packages/contracts/src/index';
import { storefrontDraft } from '../fixtures/drafts';
import { FakeDeploymentProvider, verifyProviderVersion } from '../../scripts/release/provider.mjs';

const validGates = (extra: Record<string, unknown> = {}) => ({
  paymentStatus: 'verified', paymentReference: 'receipt-fixture', authorityVerified: true, authorityReference: 'owner-fixture', hostnameVerified: true, hostnameEvidence: 'fixture.example verified', targetHostname: 'fixture.example', allowedHostnames: ['fixture.example'],
  reviewStatus: 'approved', reviewRevisionId: 'p:v1', revisionId: 'p:v1', reviewExpiresAt: '2027-01-01T00:00:00.000Z', reviewRevoked: false,
  rightsVerified: true, bundleIntegrityVerified: true, rendererVersion: 'astro-renderer-m1', supportedRendererVersions: ['astro-renderer-m1'], now: Date.parse('2026-11-07T00:00:00Z'), ...extra,
});

describe('release gates and transitions', () => {
  it('rejects missing/reversed payment, expired/superseded review, missing rights, target mismatch and unsupported renderer', () => {
    expect(validateReleaseGates(validGates({ paymentStatus: 'missing' })).map((issue) => issue.code)).toContain('payment_missing');
    expect(validateReleaseGates(validGates({ paymentStatus: 'reversed' })).map((issue) => issue.code)).toContain('payment_reversed');
    expect(validateReleaseGates(validGates({ reviewStatus: 'superseded' })).map((issue) => issue.code)).toContain('review_superseded');
    expect(validateReleaseGates(validGates({ reviewExpiresAt: '2026-11-06T00:00:00Z' })).map((issue) => issue.code)).toContain('review_expired');
    expect(validateReleaseGates(validGates({ rightsVerified: false })).map((issue) => issue.code)).toContain('rights_unverified');
    expect(validateReleaseGates(validGates({ targetHostname: 'attacker.example' })).map((issue) => issue.code)).toContain('hostname_not_allowed');
    expect(validateReleaseGates(validGates({ rendererVersion: 'other' })).map((issue) => issue.code)).toContain('renderer_unsupported');
  });

  it('only advances unknown outcomes through reconciliation and rejects a tampered sealed bundle', async () => {
    expect(canTransitionRelease('deploying', 'ready')).toBe(false);
    expect(canTransitionRelease('unknown', 'deploying')).toBe(false);
    expect(canTransitionRelease('unknown', 'ready')).toBe(false);
    expect(canTransitionRelease('unknown', 'needs_reconciliation')).toBe(true);
    expect(canTransitionRelease('needs_reconciliation', 'ready')).toBe(true);
    expect(canTransitionRelease('needs_reconciliation', 'deploying')).toBe(false);
    const revision = await sealRevision(storefrontDraft);
    const content = await import('../../packages/contracts/src/index').then(({ toRenderModel }) => toRenderModel(revision));
    const bundle = await createReleaseBundle({ releaseId: 'fixture-release', revision, content, targetHostname: 'fixture.example', rendererVersion: 'astro-renderer-m1', assets: [] });
    expect(await verifyReleaseBundle(bundle)).toBe(true);
    expect(await verifyReleaseBundle({ ...bundle, targetHostname: 'attacker.example' })).toBe(false);
  });

  it('reconciles a timeout after provider apply, verifies version and supports prior rollback or first release takedown', async () => {
    const revision = await sealRevision(storefrontDraft);
    const { toRenderModel } = await import('../../packages/contracts/src/index');
    const bundle = await createReleaseBundle({ releaseId: 'fixture-release', revision, content: await toRenderModel(revision), targetHostname: 'fixture.example', rendererVersion: 'astro-renderer-m1', assets: [] });
    const provider = new FakeDeploymentProvider({ timeoutAfterApply: true });
    await expect(provider.deploy(bundle, { buildHash: 'a'.repeat(64) })).rejects.toThrow('network-timeout-after-apply');
    const recovered = await provider.inspect(bundle.targetHostname);
    expect(verifyProviderVersion(recovered, bundle)).toBe(true);
    expect(verifyProviderVersion({ ...recovered, version: '' }, bundle)).toBe(false);
    expect(verifyProviderVersion({ ...recovered, version: 'other-version' }, bundle, recovered!.version)).toBe(false);
    const prior = { releaseId: 'previous', targetHostname: bundle.targetHostname, version: 'v1', marker: 'previous-bundle' };
    expect(await provider.rollback(bundle.targetHostname, prior)).toEqual(prior);
    expect((await provider.rollback(bundle.targetHostname, null)).marker).toBe('maintenance-deny');
  });
});

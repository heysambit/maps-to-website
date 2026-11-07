import { describe, expect, it } from 'vitest';
import { accessPolicy, type AccessConfiguration } from '../../templates/emdash-site/src/lib/access-policy';
import { seedApprovedRelease, type ApprovedCmsRelease, type OfficialSeedApplier, type SeedMarkerStore } from '../../templates/emdash-site/src/lib/handoff';
import { publicRenderModel } from '../../templates/emdash-site/src/lib/public-model';
import { toEmDashSeed, validateEmDashSeed } from '../../templates/emdash-site/src/lib/emdash-seed';

const model = {
	projectId: 'project-a', siteType: 'storefront' as const, theme: 'coast' as const,
	businessName: 'Synthetic Demo', serviceSummary: 'Fixture service', locality: 'Sampletown', address: '1 Example Road',
	contact: { type: 'phone', label: 'Call', href: 'tel:+14155550123' }, services: [], testimonials: [], assets: [],
};
const release: ApprovedCmsRelease = {
	releaseId: 'release-a', projectId: 'project-a', revisionId: 'project-a:v1', revisionHash: 'a'.repeat(64),
	paymentStatus: 'verified', reviewStatus: 'approved', approvedRevisionId: 'project-a:v1', rightsVerified: true, model,
};
const checks = { draftPrivacyVerified: true, ownerIsolationVerified: true, renderParityVerified: true };

class MemoryMarkers implements SeedMarkerStore {
	status = new Map<string, string>();
	async claim(value: ApprovedCmsRelease): Promise<'claimed' | 'already_seeded' | 'busy'> {
		const status = this.status.get(value.releaseId);
		if (status === 'seeded') return 'already_seeded';
		if (status === 'seeding') return 'busy';
		this.status.set(value.releaseId, 'seeding'); return 'claimed';
	}
	async complete(id: string) { this.status.set(id, 'seeded'); }
	async fail(id: string) { this.status.set(id, 'failed'); }
}
class FakeApplier implements OfficialSeedApplier {
	applyCount = 0;
	content: unknown;
	partialFailure = false;
	async apply(value: ApprovedCmsRelease) {
		this.applyCount++;
		this.content ??= value.model; // Emulates onConflict:"skip": owner edits remain untouched.
		if (this.partialFailure) { this.partialFailure = false; throw new Error('interrupted'); }
	}
}

describe('EmDash post-purchase handoff', () => {
	it('seeds only verified paid releases with exact approved revision', async () => {
		for (const invalid of [
			{ ...release, paymentStatus: 'missing' as const },
			{ ...release, paymentStatus: 'reversed' as const },
			{ ...release, reviewStatus: 'superseded' as const },
			{ ...release, approvedRevisionId: 'project-a:v2' },
			{ ...release, rightsVerified: false },
		]) {
			const markers = new MemoryMarkers(); const applier = new FakeApplier();
			const result = await seedApprovedRelease({ release: invalid, checks, cmsEnabled: true, cutoverEnabled: true, store: markers, applier, cutover: async () => {} });
			expect(result.seeded).toBe(false); expect(applier.applyCount).toBe(0);
		}
	});

	it('is idempotent and repeat dispatch does not overwrite owner edits', async () => {
		const store = new MemoryMarkers(); const applier = new FakeApplier();
		const first = await seedApprovedRelease({ release, checks, cmsEnabled: true, cutoverEnabled: true, store, applier, cutover: async () => {} });
		expect(first.cutoverAllowed).toBe(true);
		applier.content = { ownerEdit: true };
		const second = await seedApprovedRelease({ release, checks, cmsEnabled: true, cutoverEnabled: true, store, applier, cutover: async () => {} });
		expect(second.reason).toBe('release_already_seeded'); expect(applier.applyCount).toBe(1); expect(applier.content).toEqual({ ownerEdit: true });
	});

	it('recovers a partial seed without replacing an existing value', async () => {
		const store = new MemoryMarkers(); const applier = new FakeApplier(); applier.partialFailure = true;
		const failed = await seedApprovedRelease({ release, checks, cmsEnabled: true, cutoverEnabled: true, store, applier, cutover: async () => {} });
		expect(failed.cutoverAllowed).toBe(false); expect(failed.reason).toContain('static_fallback');
		applier.content = { ownerEditDuringRecovery: true };
		const recovered = await seedApprovedRelease({ release, checks, cmsEnabled: true, cutoverEnabled: true, store, applier, cutover: async () => {} });
		expect(recovered.cutoverAllowed).toBe(true); expect(applier.content).toEqual({ ownerEditDuringRecovery: true });
	});

	it('rejects duplicate concurrent dispatch and fails closed before cutover when checks fail', async () => {
		const store = new MemoryMarkers(); const applier = new FakeApplier(); let releaseApplier!: () => void;
		const slow = new Promise<void>((resolve) => { releaseApplier = resolve; });
		applier.apply = async () => { await slow; };
		const first = seedApprovedRelease({ release, checks, cmsEnabled: true, cutoverEnabled: true, store, applier, cutover: async () => {} });
		const second = await seedApprovedRelease({ release, checks, cmsEnabled: true, cutoverEnabled: true, store, applier, cutover: async () => {} });
		expect(second.reason).toBe('duplicate_dispatch'); releaseApplier(); await first;
		const blocked = await seedApprovedRelease({ release: { ...release, releaseId: 'release-b' }, checks: { ...checks, draftPrivacyVerified: false }, cmsEnabled: true, cutoverEnabled: true, store: new MemoryMarkers(), applier: new FakeApplier(), cutover: async () => { throw new Error('must not cut over'); } });
		expect(blocked.cutoverAllowed).toBe(false);
		const closed = await seedApprovedRelease({ release, checks, store: new MemoryMarkers(), applier: new FakeApplier(), cutover: async () => { throw new Error('default config must not seed'); } });
		expect(closed.reason).toBe('cms_disabled_static_fallback');
	});

	it('requires the final host, owner Access identity, and explicit bootstrap gate', () => {
		const configuration: AccessConfiguration = { cmsEnabled: true, bootstrapEnabled: false, ownerAdminActive: true, ownerAccessEnabled: true, finalHost: 'site.example', teamDomain: 'https://team.cloudflareaccess.com', audience: 'aud', ownerEmail: 'owner@example.com' };
		expect(accessPolicy({ path: '/_emdash/admin/setup', host: 'site.example', configuration, verifiedEmail: 'owner@example.com' })).toBe('not_found');
		expect(accessPolicy({ path: '/_emdash/admin', host: 'preview.example', configuration, verifiedEmail: 'owner@example.com' })).toBe('not_found');
		expect(accessPolicy({ path: '/_emdash/admin', host: 'site.example', configuration, verifiedEmail: 'intruder@example.com' })).toBe('forbidden');
		expect(accessPolicy({ path: '/_emdash/admin', host: 'site.example', configuration, verifiedEmail: 'owner@example.com' })).toBe('allow');
		expect(accessPolicy({ path: '/_emdash/admin', host: 'site.example', configuration: { ...configuration, ownerAdminActive: false }, verifiedEmail: 'owner@example.com' })).toBe('not_found');
		expect(accessPolicy({ path: '/_emdash/admin', host: 'site.example', configuration: { ...configuration, bootstrapEnabled: true, ownerAdminActive: true }, verifiedEmail: 'owner@example.com' })).toBe('not_found');
	});

	it('fails closed on unsafe CMS URLs and service-area addresses', () => {
		expect(publicRenderModel({ ...model, contact: { ...model.contact, href: 'javascript:alert(1)' } })).toBeUndefined();
		expect(publicRenderModel({ ...model, siteType: 'service-area', serviceArea: 'Sampletown', address: 'Private street' })).toBeUndefined();
		expect(publicRenderModel({ ...model, assets: [{ src: '/assets/%2e%2e/secret', alt: 'x', width: 1, height: 1 }] })).toBeUndefined();
		expect(publicRenderModel({ ...model, siteType: 'service-area', serviceArea: 'Sampletown', contact: { type: 'directions', label: 'Directions', href: 'https://www.google.com/maps/dir/?api=1' }, address: undefined })).toBeUndefined();
	});

	it('generates a valid official seed only for the approved release payload', () => {
		const seed = toEmDashSeed(release);
		expect(validateEmDashSeed(seed).valid).toBe(true);
		expect(seed.content?.landing_pages).toHaveLength(1);
	});
});

import { describe, expect, it } from 'vitest';
import { planRetentionCleanup } from '../../scripts/retention/plan.mjs';

describe('retention dry-run plan', () => {
	it('selects expired grants, stale drafts, and orphan assets while retaining live and rollback assets', () => {
		const now = Date.parse('2026-11-07T00:00:00.000Z');
		const snapshot = {
			liveReleaseIds: ['live'], rollbackEligibleReleaseIds: ['rollback'],
			grants: [{ id: 'old', status: 'expired', expiresAt: '2026-09-01T00:00:00Z' }, { id: 'fresh', status: 'expired', expiresAt: '2026-11-01T00:00:00Z' }, { id: 'active', status: 'active', expiresAt: '2026-01-01T00:00:00Z' }],
			drafts: [{ id: 'old-draft', active: false, updatedAt: '2026-01-01T00:00:00Z' }, { id: 'active-draft', active: true, updatedAt: '2020-01-01T00:00:00Z' }],
			assetReferences: ['used'], assets: [
				{ id: 'orphan', createdAt: '2026-09-01T00:00:00Z' }, { id: 'used', createdAt: '2026-01-01T00:00:00Z' },
				{ id: 'live-image', releaseId: 'live', createdAt: '2020-01-01T00:00:00Z' }, { id: 'rollback-image', releaseId: 'rollback', createdAt: '2020-01-01T00:00:00Z' },
			],
		};
		const plan = planRetentionCleanup(snapshot, now);
		expect(plan.mode).toBe('dry-run'); expect(plan.deleteGrants).toEqual(['old']);
		expect(plan.deleteDrafts).toEqual(['old-draft']); expect(plan.deleteAssets).toEqual(['orphan']);
		expect(snapshot.assets).toHaveLength(4);
	});
});

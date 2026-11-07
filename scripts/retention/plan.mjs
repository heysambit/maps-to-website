const DAY = 24 * 60 * 60 * 1000;

export const retentionPolicy = Object.freeze({ expiredGrantDays: 30, abandonedDraftDays: 180, orphanAssetDays: 30 });

function oldEnough(value, days, now) {
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) && timestamp + days * DAY <= now;
}

/** Creates a read-only deletion plan. This module never mutates the supplied snapshot. */
export function planRetentionCleanup(snapshot, now = Date.now(), policy = retentionPolicy) {
	const preserveReleaseIds = new Set([
		...(snapshot.liveReleaseIds ?? []),
		...(snapshot.rollbackEligibleReleaseIds ?? []),
	]);
	const referencedAssets = new Set(snapshot.assetReferences ?? []);
	const deleteGrants = (snapshot.grants ?? [])
		.filter((grant) => (grant.status === "expired" || grant.status === "revoked") && oldEnough(grant.expiresAt ?? grant.revokedAt, policy.expiredGrantDays, now))
		.map((grant) => grant.id);
	const deleteDrafts = (snapshot.drafts ?? [])
		.filter((draft) => !draft.active && oldEnough(draft.updatedAt, policy.abandonedDraftDays, now))
		.map((draft) => draft.id);
	const deleteAssets = (snapshot.assets ?? [])
		.filter((asset) => !referencedAssets.has(asset.id) && oldEnough(asset.createdAt, policy.orphanAssetDays, now))
		.filter((asset) => !preserveReleaseIds.has(asset.releaseId))
		.map((asset) => asset.id);
	return Object.freeze({
		mode: "dry-run",
		createdAt: new Date(now).toISOString(),
		deleteGrants: Object.freeze(deleteGrants),
		deleteDrafts: Object.freeze(deleteDrafts),
		deleteAssets: Object.freeze(deleteAssets),
		preservedReleaseIds: Object.freeze([...preserveReleaseIds].sort()),
	});
}

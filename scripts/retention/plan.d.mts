export interface RetentionSnapshot {
	liveReleaseIds?: string[];
	rollbackEligibleReleaseIds?: string[];
	assetReferences?: string[];
	grants?: Array<{ id: string; status: string; expiresAt?: string; revokedAt?: string }>;
	drafts?: Array<{ id: string; active: boolean; updatedAt: string }>;
	assets?: Array<{ id: string; releaseId?: string; createdAt: string }>;
}
export interface RetentionPlan {
	readonly mode: "dry-run";
	readonly createdAt: string;
	readonly deleteGrants: readonly string[];
	readonly deleteDrafts: readonly string[];
	readonly deleteAssets: readonly string[];
	readonly preservedReleaseIds: readonly string[];
}
export declare const retentionPolicy: Readonly<{ expiredGrantDays: 30; abandonedDraftDays: 180; orphanAssetDays: 30 }>;
export declare function planRetentionCleanup(snapshot: RetentionSnapshot, now?: number, policy?: typeof retentionPolicy): RetentionPlan;

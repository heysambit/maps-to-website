import type { RenderModel } from "@studio/contracts";

export interface ApprovedCmsRelease {
	releaseId: string;
	projectId: string;
	revisionId: string;
	revisionHash: string;
	paymentStatus: "verified" | "missing" | "reversed";
	reviewStatus: "approved" | "pending" | "superseded" | "revoked";
	approvedRevisionId: string;
	rightsVerified: boolean;
	model: RenderModel;
}

export interface HandoffChecks {
	draftPrivacyVerified: boolean;
	ownerIsolationVerified: boolean;
	renderParityVerified: boolean;
}

export type Claim = "claimed" | "already_seeded" | "busy";
export interface SeedMarkerStore {
	claim(release: ApprovedCmsRelease, token: string, now: string): Promise<Claim>;
	complete(releaseId: string, token: string, at: string): Promise<void>;
	fail(releaseId: string, token: string, code: string): Promise<void>;
}

export interface OfficialSeedApplier {
	apply(release: ApprovedCmsRelease): Promise<void>;
}

export interface HandoffResult {
	seeded: boolean;
	cutoverAllowed: boolean;
	reason?: string;
}

export function validateApprovedRelease(release: ApprovedCmsRelease): string | undefined {
	if (release.paymentStatus !== "verified") return "payment_not_verified";
	if (release.reviewStatus !== "approved" || release.approvedRevisionId !== release.revisionId) return "revision_not_approved";
	if (!release.releaseId || !release.projectId || !release.revisionId || !/^[a-f0-9]{64}$/.test(release.revisionHash)) return "release_identity_invalid";
	if (release.model.projectId !== release.projectId) return "project_scope_mismatch";
	if (!release.rightsVerified) return "rights_unverified";
	return undefined;
}

export async function seedApprovedRelease(input: {
	release: ApprovedCmsRelease;
	checks: HandoffChecks;
	/** Both feature switches default closed. */
	cmsEnabled?: boolean;
	cutoverEnabled?: boolean;
	store: SeedMarkerStore;
	applier: OfficialSeedApplier;
	cutover: () => Promise<void>;
	makeToken?: () => string;
	now?: () => Date;
}): Promise<HandoffResult> {
	if (!input.cmsEnabled) return { seeded: false, cutoverAllowed: false, reason: "cms_disabled_static_fallback" };
	const invalid = validateApprovedRelease(input.release);
	if (invalid) return { seeded: false, cutoverAllowed: false, reason: invalid };
	const token = (input.makeToken ?? (() => crypto.randomUUID()))();
	const now = input.now ?? (() => new Date());
	const claim = await input.store.claim(input.release, token, now().toISOString());
	if (claim === "busy") return { seeded: false, cutoverAllowed: false, reason: "duplicate_dispatch" };
	if (claim === "claimed") {
		try {
			await input.applier.apply(input.release);
			await input.store.complete(input.release.releaseId, token, now().toISOString());
		} catch {
			await input.store.fail(input.release.releaseId, token, "seed_apply_failed");
			return { seeded: false, cutoverAllowed: false, reason: "seed_apply_failed_static_fallback" };
		}
	}
	if (!input.checks.draftPrivacyVerified || !input.checks.ownerIsolationVerified || !input.checks.renderParityVerified) {
		return { seeded: true, cutoverAllowed: false, reason: "staging_checks_incomplete_static_fallback" };
	}
	if (!input.cutoverEnabled) return { seeded: true, cutoverAllowed: false, reason: "cutover_disabled_static_fallback" };
	await input.cutover();
	return { seeded: true, cutoverAllowed: true, ...(claim === "already_seeded" ? { reason: "release_already_seeded" } : {}) };
}

export async function seedFromConfiguredRuntime(input: {
	env: { CMS_ENABLED?: string; CUTOVER_ENABLED?: string };
	release: ApprovedCmsRelease;
	checks: HandoffChecks;
	store: SeedMarkerStore;
	applier: OfficialSeedApplier;
	cutover: () => Promise<void>;
	makeToken?: () => string;
	now?: () => Date;
}): Promise<HandoffResult> {
	return seedApprovedRelease({
		...input,
		cmsEnabled: input.env.CMS_ENABLED === "true",
		cutoverEnabled: input.env.CUTOVER_ENABLED === "true",
	});
}

export interface D1Result { meta?: { changes?: number }; results?: Record<string, unknown>[] }
export interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	run<T = Record<string, unknown>>(): Promise<D1Result & { results?: T[] }>;
}
export interface D1Database { prepare(sql: string): D1PreparedStatement }

export class D1SeedMarkerStore implements SeedMarkerStore {
	constructor(private readonly db: D1Database, private readonly leaseMs = 120_000) {}
	async claim(release: ApprovedCmsRelease, token: string, now: string): Promise<Claim> {
		const leaseUntil = new Date(Date.parse(now) + this.leaseMs).toISOString();
		const result = await this.db.prepare(`INSERT INTO cms_seed_markers (release_id, project_id, revision_id, revision_hash, status, lease_token, lease_until, started_at) VALUES (?, ?, ?, ?, 'seeding', ?, ?, ?) ON CONFLICT(release_id) DO UPDATE SET status='seeding', lease_token=excluded.lease_token, lease_until=excluded.lease_until, started_at=excluded.started_at, error_code=NULL WHERE cms_seed_markers.project_id=excluded.project_id AND cms_seed_markers.revision_id=excluded.revision_id AND cms_seed_markers.revision_hash=excluded.revision_hash AND (cms_seed_markers.status='failed' OR (cms_seed_markers.status='seeding' AND cms_seed_markers.lease_until < ?))`)
			.bind(release.releaseId, release.projectId, release.revisionId, release.revisionHash, token, leaseUntil, now, now).run();
		if ((result.meta?.changes ?? 0) > 0) return "claimed";
		const existing = await this.db.prepare("SELECT status FROM cms_seed_markers WHERE release_id = ?").bind(release.releaseId).run<{ status: string }>();
		return existing.results?.[0]?.status === "seeded" ? "already_seeded" : "busy";
	}
	async complete(releaseId: string, token: string, at: string): Promise<void> {
		const result = await this.db.prepare("UPDATE cms_seed_markers SET status='seeded', completed_at=?, lease_token=NULL, lease_until=NULL WHERE release_id=? AND lease_token=? AND status='seeding'").bind(at, releaseId, token).run();
		if ((result.meta?.changes ?? 0) !== 1) throw new Error("Seed marker claim was lost.");
	}
	async fail(releaseId: string, token: string, code: string): Promise<void> {
		await this.db.prepare("UPDATE cms_seed_markers SET status='failed', error_code=?, lease_token=NULL, lease_until=NULL WHERE release_id=? AND lease_token=? AND status='seeding'").bind(code, releaseId, token).run();
	}
}

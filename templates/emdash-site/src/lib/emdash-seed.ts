import { applySeed, validateSeed } from "emdash/seed";
import type { ApprovedCmsRelease, OfficialSeedApplier } from "./handoff";

export function validateEmDashSeed(seed: Parameters<typeof applySeed>[1]): ReturnType<typeof validateSeed> {
	return validateSeed(seed);
}

export function toEmDashSeed(release: ApprovedCmsRelease): Parameters<typeof applySeed>[1] {
	return {
		version: "1",
		meta: { name: "Purchased site", description: "Content from approved release", author: "Maps to Website" },
		settings: { title: release.model.businessName, tagline: release.model.serviceSummary },
		collections: [{
			slug: "landing_pages", label: "Landing pages", labelSingular: "Landing page", urlPattern: "/",
			supports: ["drafts", "revisions", "preview", "seo"],
			fields: [{ slug: "render_model", label: "Approved site content", type: "json", required: true }],
		}],
		content: { landing_pages: [{ id: "home", slug: "home", status: "published", data: { render_model: release.model } }] },
	};
}

// EmDash 1.4.0 documented interface: validateSeed(seed), then
// applySeed(db, seed, { includeContent, onConflict, storage }).
export class EmDash14SeedApplier implements OfficialSeedApplier {
	constructor(private readonly db: Parameters<typeof applySeed>[0]) {}
	async apply(release: ApprovedCmsRelease): Promise<void> {
		const seed = toEmDashSeed(release);
		const validation = validateEmDashSeed(seed);
		if (!validation.valid) throw new Error(`EmDash seed schema validation failed: ${validation.errors.join("; ")}`);
		await applySeed(this.db, seed, {
			includeContent: true,
			onConflict: "skip",
			skipMediaDownload: true,
		});
	}
}

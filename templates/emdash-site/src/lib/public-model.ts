import type { RenderModel } from "@studio/contracts";

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeContact(value: unknown): value is RenderModel["contact"] {
	if (!record(value) || typeof value.type !== "string" || typeof value.label !== "string" || !value.label.trim() || typeof value.href !== "string") return false;
	if (value.type === "phone") return /^tel:\+[1-9]\d{7,14}$/.test(value.href);
	try {
		const url = new URL(value.href);
		if (url.protocol !== "https:" || url.username || url.password) return false;
		if (value.type === "website") return true;
		return value.type === "directions" && ["www.google.com", "maps.google.com"].includes(url.hostname) && url.pathname.startsWith("/maps/");
	} catch { return false; }
}

export function publicRenderModel(value: unknown): RenderModel | undefined {
	if (!record(value) || !["storefront", "service-area"].includes(String(value.siteType)) || !["coast", "grove"].includes(String(value.theme))) return;
	if (typeof value.projectId !== "string" || !value.projectId || typeof value.businessName !== "string" || !value.businessName.trim() || typeof value.serviceSummary !== "string" || !value.serviceSummary.trim() || typeof value.locality !== "string" || !value.locality.trim()) return;
	if (!safeContact(value.contact) || !Array.isArray(value.services) || !value.services.every((item) => typeof item === "string") || !Array.isArray(value.testimonials) || !value.testimonials.every((item) => typeof item === "string") || !Array.isArray(value.assets)) return;
	if (value.about !== undefined && typeof value.about !== "string") return;
	if (value.hours !== undefined && typeof value.hours !== "string") return;
	if (value.siteType === "service-area" && (value.contact.type === "directions")) return;
	if (value.siteType === "storefront" && typeof value.address !== "string") return;
	if (value.siteType === "service-area" && (typeof value.serviceArea !== "string" || value.address !== undefined)) return;
	if (!value.assets.every((asset) => {
		if (!record(asset) || typeof asset.src !== "string" || typeof asset.alt !== "string" || !Number.isSafeInteger(asset.width) || !Number.isSafeInteger(asset.height)) return false;
		let decoded: string;
		try { decoded = decodeURIComponent(asset.src); } catch { return false; }
		return decoded.startsWith("/assets/") && !decoded.startsWith("//") && !decoded.includes("\\") && !decoded.split("/").includes("..") && Number(asset.width) > 0 && Number(asset.height) > 0 && Number(asset.width) * Number(asset.height) <= 20_000_000;
	})) return;
	return value as unknown as RenderModel;
}

export interface AccessConfiguration {
	cmsEnabled: boolean;
	bootstrapEnabled: boolean;
	ownerAdminActive: boolean;
	ownerAccessEnabled: boolean;
	finalHost: string;
	teamDomain: string;
	audience: string;
	ownerEmail: string;
}

export function accessPolicy(input: {
	path: string;
	host: string;
	configuration: AccessConfiguration;
	verifiedEmail?: string;
}): "allow" | "not_found" | "forbidden" {
	if (!input.path.startsWith("/_emdash")) return "allow";
	const c = input.configuration;
	if (!c.cmsEnabled || !c.ownerAccessEnabled || !c.finalHost || input.host.toLowerCase() !== c.finalHost.toLowerCase()) return "not_found";
	if (c.bootstrapEnabled === c.ownerAdminActive) return "not_found";
	if (input.path.includes("/setup") && !c.bootstrapEnabled) return "not_found";
	if (!c.teamDomain || !c.audience || !c.ownerEmail || !input.verifiedEmail) return "forbidden";
	return input.verifiedEmail.toLowerCase() === c.ownerEmail.toLowerCase() ? "allow" : "forbidden";
}

import { defineMiddleware } from "astro:middleware";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { accessPolicy, type AccessConfiguration } from "./lib/access-policy";

interface RuntimeEnv extends Record<string, unknown> {
	CMS_ENABLED?: string;
	ADMIN_BOOTSTRAP_ENABLED?: string;
	OWNER_ADMIN_ACTIVE?: string;
	OWNER_ACCESS_ENABLED?: string;
	FINAL_HOST?: string;
	ACCESS_TEAM_DOMAIN?: string;
	ACCESS_AUDIENCE?: string;
	OWNER_EMAIL?: string;
}

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function jwksFor(issuer: string) {
	let jwks = jwksByIssuer.get(issuer);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(`${issuer.replace(/\/$/, "")}/cdn-cgi/access/certs`));
		jwksByIssuer.set(issuer, jwks);
	}
	return jwks;
}

export const onRequest = defineMiddleware(async ({ request, locals }, next) => {
	const url = new URL(request.url);
	if (!url.pathname.startsWith("/_emdash")) return next();
	const env = ((locals as typeof locals & { runtime?: { env?: RuntimeEnv } }).runtime?.env ?? {}) as RuntimeEnv;
	const configuration: AccessConfiguration = {
		cmsEnabled: env.CMS_ENABLED === "true",
		bootstrapEnabled: env.ADMIN_BOOTSTRAP_ENABLED === "true",
		ownerAdminActive: env.OWNER_ADMIN_ACTIVE === "true",
		ownerAccessEnabled: env.OWNER_ACCESS_ENABLED === "true",
		finalHost: env.FINAL_HOST ?? "",
		teamDomain: env.ACCESS_TEAM_DOMAIN ?? "",
		audience: env.ACCESS_AUDIENCE ?? "",
		ownerEmail: env.OWNER_EMAIL ?? "",
	};
	const preliminary = accessPolicy({ path: url.pathname, host: url.host, configuration });
	if (preliminary === "not_found") return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
	let verifiedEmail: string | undefined;
	const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
	if (assertion && configuration.teamDomain && configuration.audience) {
		try {
			const { payload } = await jwtVerify(assertion, jwksFor(configuration.teamDomain), {
				issuer: configuration.teamDomain.replace(/\/$/, ""),
				audience: configuration.audience,
			});
			verifiedEmail = typeof payload.email === "string" ? payload.email : undefined;
		} catch {
			verifiedEmail = undefined;
		}
	}
	const result = accessPolicy({ path: url.pathname, host: url.host, configuration, verifiedEmail });
	if (result !== "allow") return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
	return next();
});

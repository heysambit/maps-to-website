import { isLoopbackUrl } from './identity';

export type AccessRole = 'operator' | 'reviewer';
export interface AccessIdentity { email: string; audience: string; role: AccessRole; fixture: boolean }
export interface AccessConfig {
  environment?: string;
  teamDomain?: string;
  operatorAudience?: string;
  reviewerAudience?: string;
  operatorEmails?: string;
  localOperatorToken?: string;
  operatorHost?: string;
  reviewerHost?: string;
}
export interface RuntimeAuthEnv {
  APP_ENV?: string;
  ACCESS_TEAM_DOMAIN?: string;
  OPERATOR_ACCESS_AUD?: string;
  REVIEWER_ACCESS_AUD?: string;
  OPERATOR_EMAILS?: string;
  LOCAL_OPERATOR_TOKEN?: string;
  OPERATOR_HOST?: string;
  REVIEWER_HOST?: string;
}

interface AccessClaims { iss?: unknown; aud?: unknown; exp?: unknown; iat?: unknown; nbf?: unknown; email?: unknown }
interface AccessJwk { kid?: string; kty?: string; use?: string; alg?: string; n?: string; e?: string }
interface AccessJwks { keys?: AccessJwk[] }

const keyCache = new Map<string, { expiresAt: number; keys: AccessJwk[] }>();
const b64url = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

function exactAudience(value: unknown, expected: string): boolean {
  return typeof value === 'string' ? value === expected : Array.isArray(value) && value.length === 1 && value[0] === expected;
}

function validTeamDomain(value: string): string | null {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !/^[a-z0-9.-]+\.cloudflareaccess\.com$/i.test(url.hostname)) return null;
    return url.hostname.toLowerCase();
  } catch { return null; }
}

async function loadKeys(domain: string, fetcher: typeof fetch, now: number): Promise<AccessJwk[]> {
  const cached = keyCache.get(domain);
  if (cached && cached.expiresAt > now) return cached.keys;
  const response = await fetcher(`https://${domain}/cdn-cgi/access/certs`, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error('Access public keys unavailable');
  const data = await response.json() as AccessJwks;
  if (!Array.isArray(data.keys) || !data.keys.length || data.keys.length > 20) throw new Error('Invalid Access key set');
  const keys = data.keys.filter((key) => key.kty === 'RSA' && typeof key.kid === 'string' && typeof key.n === 'string' && typeof key.e === 'string' && (!key.alg || key.alg === 'RS256'));
  if (!keys.length) throw new Error('No usable Access keys');
  keyCache.set(domain, { expiresAt: now + 5 * 60_000, keys });
  return keys;
}

export async function verifyAccessJwt(token: string, role: AccessRole, config: AccessConfig, fetcher: typeof fetch = fetch, nowMs = Date.now()): Promise<AccessIdentity | null> {
  try {
    if (token.length > 16_384) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) return null;
    const header = JSON.parse(new TextDecoder().decode(b64url(parts[0]))) as { alg?: unknown; kid?: unknown };
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    const domain = config.teamDomain ? validTeamDomain(config.teamDomain) : null;
    const audience = role === 'operator' ? config.operatorAudience : config.reviewerAudience;
    if (!domain || !audience) return null;
    const keys = await loadKeys(domain, fetcher, nowMs);
    const jwk = keys.find((key) => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk as JsonWebKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signatureBytes = b64url(parts[2]);
    const signature = signatureBytes.buffer.slice(signatureBytes.byteOffset, signatureBytes.byteOffset + signatureBytes.byteLength) as ArrayBuffer;
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signingInput)) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64url(parts[1]))) as AccessClaims;
    const now = Math.floor(nowMs / 1000);
    const issuer = `https://${domain}`;
    if (claims.iss !== issuer || !exactAudience(claims.aud, audience) || !Number.isSafeInteger(claims.exp) || Number(claims.exp) <= now || Number(claims.exp) > now + 24 * 60 * 60) return null;
    if (claims.iat !== undefined && (!Number.isSafeInteger(claims.iat) || Number(claims.iat) > now + 60)) return null;
    if (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || Number(claims.nbf) > now + 60)) return null;
    if (typeof claims.email !== 'string' || claims.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) return null;
    const email = claims.email.trim().toLowerCase();
    if (role === 'operator') {
      const members = (config.operatorEmails || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
      if (!members.includes(email)) return null;
    }
    return { email, audience, role, fixture: false };
  } catch { return null; }
}

export async function authorizeAccessRequest(request: Request, role: AccessRole, config: AccessConfig, fetcher: typeof fetch = fetch): Promise<AccessIdentity | null> {
  if (config.environment === 'development' && isLoopbackUrl(request.url)) {
    const authorization = request.headers.get('authorization') || '';
    if (role === 'operator' && config.localOperatorToken && config.localOperatorToken.length >= 24 && authorization === `Bearer ${config.localOperatorToken}`) {
      return { email: 'demo-operator@fixture.invalid', audience: 'fixture-operator', role, fixture: true };
    }
    const cookies = new Map((request.headers.get('cookie') || '').split(';').map((part) => part.trim().split(/=(.*)/s).slice(0, 2) as [string, string]).filter(([name]) => Boolean(name)));
    const email = (request.headers.get('x-fixture-reviewer-email') || cookies.get('fixture_reviewer_email'))?.trim().toLowerCase();
    if (role === 'reviewer' && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const audience = request.headers.get('x-fixture-reviewer-audience') || cookies.get('fixture_reviewer_audience') || 'fixture-reviewer';
      if (audience === 'fixture-reviewer') return { email, audience, role, fixture: true };
    }
    return null;
  }
  const expectedHost = role === 'operator' ? config.operatorHost : config.reviewerHost;
  try {
    const url = new URL(request.url);
    if (!expectedHost || url.protocol !== 'https:' || url.hostname.toLowerCase() !== expectedHost.trim().toLowerCase()) return null;
  } catch { return null; }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  return verifyAccessJwt(token, role, config, fetcher);
}

export function sameOriginMutation(request: Request, environment?: string): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) return true;
  const origin = request.headers.get('Origin');
  if (!origin) return environment === 'development' && isLoopbackUrl(request.url);
  if (origin === 'null') return environment === 'development' && isLoopbackUrl(request.url);
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    if (originUrl.origin === requestUrl.origin) return true;
    if (environment === 'development' && isLoopbackUrl(originUrl.href) && isLoopbackUrl(requestUrl.href)) return originUrl.protocol === requestUrl.protocol && originUrl.port === requestUrl.port;
    return false;
  } catch { return false; }
}

export function accessConfig(env: RuntimeAuthEnv): AccessConfig {
  return {
    environment: env.APP_ENV,
    teamDomain: env.ACCESS_TEAM_DOMAIN,
    operatorAudience: env.OPERATOR_ACCESS_AUD,
    reviewerAudience: env.REVIEWER_ACCESS_AUD,
    operatorEmails: env.OPERATOR_EMAILS,
    localOperatorToken: env.LOCAL_OPERATOR_TOKEN,
    operatorHost: env.OPERATOR_HOST,
    reviewerHost: env.REVIEWER_HOST,
  };
}

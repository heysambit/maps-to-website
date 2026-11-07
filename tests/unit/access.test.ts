import { describe, expect, it } from 'vitest';
import { authorizeAccessRequest, sameOriginMutation, verifyAccessJwt, type AccessConfig } from '../../apps/builder/src/lib/access';

const encode = (value: Uint8Array | string) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

describe('Cloudflare Access identity verification', () => {
  it('validates the signed issuer, exact audience, expiry, and operator email allowlist', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const now = Math.floor(Date.now() / 1000);
    const config: AccessConfig = { teamDomain: 'unit-check.cloudflareaccess.com', operatorAudience: 'operator-app-aud', reviewerAudience: 'reviewer-app-aud', operatorEmails: ' Admin@Example.com ' };
    const token = async (email: string, aud: unknown = 'operator-app-aud', exp = now + 60) => {
      const h = encode(JSON.stringify({ alg: 'RS256', kid: 'unit-key' }));
      const p = encode(JSON.stringify({ iss: 'https://unit-check.cloudflareaccess.com', aud, email, iat: now, exp }));
      const input = new TextEncoder().encode(`${h}.${p}`);
      const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, input));
      return `${h}.${p}.${encode(signature)}`;
    };
    const fetcher = (async () => Response.json({ keys: [{ ...jwk, kid: 'unit-key', alg: 'RS256', use: 'sig' }] })) as typeof fetch;
    await expect(verifyAccessJwt(await token('ADMIN@example.com'), 'operator', config, fetcher)).resolves.toMatchObject({ email: 'admin@example.com', role: 'operator', fixture: false });
    await expect(verifyAccessJwt(await token('owner@example.com', 'reviewer-app-aud'), 'reviewer', config, fetcher)).resolves.toMatchObject({ email: 'owner@example.com', role: 'reviewer', fixture: false });
    await expect(verifyAccessJwt(await token('owner@example.com', 'operator-app-aud'), 'reviewer', config, fetcher)).resolves.toBeNull();
    const reviewerJwt = await token('owner@example.com', 'reviewer-app-aud');
    const hostedConfig = { ...config, reviewerHost: 'review.example.test' };
    const hostedRequest = new Request('https://review.example.test/r/project%3Av1', { headers: { 'Cf-Access-Jwt-Assertion': reviewerJwt } });
    await expect(authorizeAccessRequest(hostedRequest, 'reviewer', hostedConfig, fetcher)).resolves.toMatchObject({ email: 'owner@example.com', role: 'reviewer' });
    const alternateHost = new Request('https://maps-to-website.workers.dev/r/project%3Av1', { headers: { 'Cf-Access-Jwt-Assertion': reviewerJwt } });
    await expect(authorizeAccessRequest(alternateHost, 'reviewer', hostedConfig, fetcher)).resolves.toBeNull();
    await expect(verifyAccessJwt(await token('admin@example.com', ['operator-app-aud', 'other']), 'operator', config, fetcher)).resolves.toBeNull();
    await expect(verifyAccessJwt(await token('admin@example.com', 'reviewer-app-aud'), 'operator', config, fetcher)).resolves.toBeNull();
    await expect(verifyAccessJwt(await token('admin@example.com', 'operator-app-aud', now - 1), 'operator', config, fetcher)).resolves.toBeNull();
    await expect(verifyAccessJwt(await token('not-approved@example.com'), 'operator', config, fetcher)).resolves.toBeNull();
    const valid = await token('admin@example.com');
    const [header, payload, signature] = valid.split('.');
    await expect(verifyAccessJwt(`${header}.${encode(JSON.stringify({ iss: 'https://attacker.example', aud: 'operator-app-aud', email: 'admin@example.com', exp: now + 60 })).slice(0, -1)}.${signature}`, 'operator', config, fetcher)).resolves.toBeNull();
    await expect(verifyAccessJwt(`${header}.${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`, 'operator', config, fetcher)).resolves.toBeNull();
  });

  it('keeps fixture identities loopback-only and rejects cross-origin mutations', async () => {
    const fixtureBearer = `fixture-${'x'.repeat(32)}`;
    const config: AccessConfig = { environment: 'development', localOperatorToken: fixtureBearer };
    const request = new Request('http://127.0.0.1/api/projects', { method: 'POST', headers: { Authorization: `Bearer ${config.localOperatorToken}` } });
    await expect(authorizeAccessRequest(request, 'operator', config)).resolves.toMatchObject({ email: 'demo-operator@fixture.invalid', fixture: true });
    const remote = new Request('https://builder.example/api/projects', { method: 'POST', headers: { Authorization: `Bearer ${config.localOperatorToken}` } });
    await expect(authorizeAccessRequest(remote, 'operator', config)).resolves.toBeNull();
    expect(sameOriginMutation(new Request('https://builder.example/api/reviews/x/decision', { method: 'POST', headers: { Origin: 'https://evil.example' } }), 'staging')).toBe(false);
    expect(sameOriginMutation(new Request('https://builder.example/api/reviews/x/decision', { method: 'POST', headers: { Origin: 'https://builder.example' } }), 'staging')).toBe(true);
  });
});

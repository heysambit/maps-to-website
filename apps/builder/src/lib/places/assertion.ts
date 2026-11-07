type Assertion = { v: 1; projectId: string; operatorId: string; placeIds: string[]; exp: number };
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function key(secret: string) { return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
export async function issueSelectionAssertion(secret: string, projectId: string, operatorId: string, placeIds: string[], now = Date.now()): Promise<string> {
  const payload = encode(new TextEncoder().encode(JSON.stringify({ v: 1, projectId, operatorId, placeIds, exp: now + 5 * 60_000 } satisfies Assertion)));
  const signature = encode(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), new TextEncoder().encode(payload))));
  return `${payload}.${signature}`;
}
export async function verifySelectionAssertion(secret: string, token: unknown, projectId: string, operatorId: string, placeId: string, now = Date.now()): Promise<boolean> {
  if (typeof token !== 'string' || token.length > 4096) return false;
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra) return false;
  try {
    if (!await crypto.subtle.verify('HMAC', await key(secret), decode(sig), new TextEncoder().encode(payload))) return false;
    const value = JSON.parse(new TextDecoder().decode(decode(payload))) as Assertion;
    return value.v === 1 && value.projectId === projectId && value.operatorId === operatorId && value.exp > now && value.exp <= now + 5 * 60_000 && value.placeIds.includes(placeId);
  } catch { return false; }
}

import { env } from 'cloudflare:workers';
import { verifyReleaseBundle } from '@studio/contracts';
import { privateJson } from '../../../../../../lib/places/http';

export const prerender = false;
export async function GET({ request, params }: { request: Request; params: { releaseId: string; digest: string } }): Promise<Response> {
  if (!env.RELEASE_SERVICE_TOKEN || env.RELEASE_SERVICE_TOKEN.length < 32 || request.headers.get('authorization') !== `Bearer ${env.RELEASE_SERVICE_TOKEN}`) return privateJson({ error: 'Release service identity required.' }, 401);
  if (!/^[a-f0-9]{64}$/.test(params.digest)) return privateJson({ error: 'Invalid asset digest.' }, 400);
  const row = await env.DB.prepare('SELECT bundle_key FROM release_records WHERE id = ?').bind(params.releaseId).first<{ bundle_key: string }>();
  if (!row) return privateJson({ error: 'Release not found.' }, 404);
  const sealed = await env.RELEASES.get(row.bundle_key); if (!sealed) return privateJson({ error: 'Release bundle not found.' }, 404);
  let bundle: unknown; try { bundle = JSON.parse(await sealed.text()) as unknown; } catch { return privateJson({ error: 'Invalid bundle.' }, 409); }
  if (!await verifyReleaseBundle(bundle) || !(bundle as { assets: Array<{ digest: string }> }).assets.some((asset) => asset.digest === params.digest)) return privateJson({ error: 'Asset is outside the sealed release manifest.' }, 403);
  const asset = await env.DB.prepare('SELECT object_key, mime_type, sha256 FROM media_assets WHERE project_id = ? AND sha256 = ?').bind((bundle as { projectId: string }).projectId, params.digest).first<{ object_key: string; mime_type: string; sha256: string }>();
  if (!asset || asset.sha256 !== params.digest) return privateJson({ error: 'Release asset is unavailable.' }, 404);
  const object = await env.MEDIA.get(asset.object_key); if (!object) return privateJson({ error: 'Release asset is unavailable.' }, 404);
  const bytes = new Uint8Array(await object.arrayBuffer());
  const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== params.digest) return privateJson({ error: 'Release asset integrity failed.' }, 409);
  return new Response(bytes, { headers: { 'Content-Type': asset.mime_type, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' } });
}

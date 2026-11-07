import { env } from 'cloudflare:workers';
import { requireReviewer } from '../../../../lib/guards';
import { getReviewForRevision } from '../../../../lib/reviews';

export const prerender = false;
const notFound = () => new Response('Not found.', { status: 404, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer' } });
function routeValue(value: string): string { try { return decodeURIComponent(value); } catch { return value; } }

export async function GET({ request, params }: { request: Request; params: { revisionId: string; digest: string } }): Promise<Response> {
  const identity = await requireReviewer(request, env);
  if (!identity || !/^[a-f0-9]{64}$/.test(params.digest)) return notFound();
  const revisionId = routeValue(params.revisionId);
  const snapshot = await getReviewForRevision(env.DB, revisionId, identity.email);
  if (!snapshot || !snapshot.revision.content.assets?.some((asset) => asset.src === `/assets/${params.digest}` && asset.rights?.status === 'cleared')) return notFound();
  const row = await env.DB.prepare(`SELECT object_key, mime_type, size_bytes FROM media_assets WHERE project_id = ? AND sha256 = ? AND rights_basis <> ''`)
    .bind(snapshot.revision.projectId, params.digest).first<{ object_key: string; mime_type: string; size_bytes: number }>();
  if (!row || !['image/jpeg', 'image/png', 'image/webp'].includes(row.mime_type) || row.size_bytes < 1 || row.size_bytes > 5 * 1024 * 1024) return notFound();
  const object = await env.MEDIA.get(row.object_key);
  if (!object || object.size !== row.size_bytes) return notFound();
  const bytes = await object.arrayBuffer();
  const actualDigest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actualDigest !== params.digest) return notFound();
  return new Response(bytes, { headers: { 'Content-Type': row.mime_type, 'Content-Length': String(row.size_bytes), 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
}

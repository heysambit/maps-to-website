import { env } from 'cloudflare:workers';
import { requireOperator } from '../../../../../lib/guards';
import { privateJson } from '../../../../../lib/places/http';

export const prerender = false;
export async function GET({ request, params }: { request: Request; params: { projectId: string; assetId: string } }): Promise<Response> {
  if (!await requireOperator(request, env)) return privateJson({ error: 'Unauthorized.' }, 401);
  const row = await env.DB.prepare('SELECT object_key, mime_type FROM media_assets WHERE id = ? AND project_id = ?').bind(params.assetId, params.projectId).first<{ object_key: string; mime_type: string }>();
  if (!row) return privateJson({ error: 'Not found.' }, 404);
  const object = await env.MEDIA.get(row.object_key);
  if (!object) return privateJson({ error: 'Not found.' }, 404);
  return new Response(object.body, { headers: { 'Content-Type': row.mime_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Length': String(object.size) } });
}

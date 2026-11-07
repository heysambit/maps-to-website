import { env } from 'cloudflare:workers';
import { privateJson } from '../../../../../lib/places/http';

export const prerender = false;
export async function GET({ request, params }: { request: Request; params: { releaseId: string } }): Promise<Response> {
  if (!env.RELEASE_SERVICE_TOKEN || env.RELEASE_SERVICE_TOKEN.length < 32 || request.headers.get('authorization') !== `Bearer ${env.RELEASE_SERVICE_TOKEN}`) return privateJson({ error: 'Release service identity required.' }, 401);
  const row = await env.DB.prepare(`SELECT r.target_hostname targetHostname, r.previous_release_id previousReleaseId, p.provider_version providerVersion, p.provider_marker providerMarker
    FROM release_records r LEFT JOIN release_records p ON p.id = r.previous_release_id WHERE r.id = ?`).bind(params.releaseId).first<Record<string, unknown>>();
  if (!row) return privateJson({ error: 'Release not found.' }, 404);
  if (!row.previousReleaseId) return privateJson({ targetHostname: row.targetHostname, previous: null });
  if (typeof row.providerVersion !== 'string' || typeof row.providerMarker !== 'string' || !row.providerVersion || !row.providerMarker) return privateJson({ error: 'Prior verified provider release is unavailable for rollback.' }, 409);
  return privateJson({ targetHostname: row.targetHostname, previous: { releaseId: row.previousReleaseId, version: row.providerVersion, marker: row.providerMarker } });
}

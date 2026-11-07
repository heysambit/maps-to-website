import { env } from 'cloudflare:workers';
import { verifyReleaseBundle } from '@studio/contracts';
import { privateJson } from '../../../../../lib/places/http';

export const prerender = false;
export async function GET({ request, params }: { request: Request; params: { releaseId: string } }): Promise<Response> {
  if (!env.RELEASE_SERVICE_TOKEN || env.RELEASE_SERVICE_TOKEN.length < 32 || request.headers.get('authorization') !== `Bearer ${env.RELEASE_SERVICE_TOKEN}`) return privateJson({ error: 'Release service identity required.' }, 401);
  const row = await env.DB.prepare('SELECT bundle_key, bundle_hash, project_id, target_hostname, revision_id, status FROM release_records WHERE id = ?').bind(params.releaseId).first<{ bundle_key: string; bundle_hash: string; project_id: string; target_hostname: string; revision_id: string; status: string }>();
  if (!row || !['queued','building','scanning','ready','deploying','unknown','needs_reconciliation','verifying','live','rolling_back','rolled_back','takedown_pending'].includes(row.status)) return privateJson({ error: 'Sealed release not found or unavailable.' }, 404);
  const object = await env.RELEASES.get(row.bundle_key);
  if (!object) return privateJson({ error: 'Sealed release bundle is unavailable.' }, 404);
  let bundle: unknown;
  try { bundle = JSON.parse(await object.text()) as unknown; } catch { return privateJson({ error: 'Sealed release bundle is invalid.' }, 409); }
  if (!await verifyReleaseBundle(bundle) || (bundle as { releaseId: string; projectId: string; targetHostname: string; revisionId: string; bundleHash: string }).releaseId !== params.releaseId || (bundle as { projectId: string }).projectId !== row.project_id || (bundle as { targetHostname: string }).targetHostname !== row.target_hostname || (bundle as { revisionId: string }).revisionId !== row.revision_id || (bundle as { bundleHash: string }).bundleHash !== row.bundle_hash) return privateJson({ error: 'Sealed bundle scope or integrity check failed.' }, 409);
  return privateJson(bundle);
}

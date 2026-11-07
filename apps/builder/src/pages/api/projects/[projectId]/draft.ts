import { env } from 'cloudflare:workers';
import { getProjectDraft, saveProjectDraft } from '../../../../lib/drafts';
import { requireOperator } from '../../../../lib/guards';
import { privateJson } from '../../../../lib/places/http';
import type { Draft } from '@studio/contracts';

export const prerender = false;

export async function GET({ request, params }: { request: Request; params: { projectId: string } }): Promise<Response> {
  if (!await requireOperator(request, env)) return privateJson({ error: 'Unauthorized.' }, 401);
  const result = await getProjectDraft(env.DB, params.projectId);
  return result ? privateJson(result) : privateJson({ error: 'Project not found.' }, 404);
}

export async function PUT({ request, params }: { request: Request; params: { projectId: string } }): Promise<Response> {
  if (!await requireOperator(request, env)) return privateJson({ error: 'Unauthorized.' }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return privateJson({ error: 'Expected JSON.' }, 400); }
  if (typeof body !== 'object' || body === null || !('baseVersion' in body) || !Number.isSafeInteger(body.baseVersion) || Number(body.baseVersion) < 0 || !('draft' in body) || typeof body.draft !== 'object' || body.draft === null) {
    return privateJson({ error: 'Expected baseVersion and draft.' }, 400);
  }
  const result = await saveProjectDraft(env.DB, params.projectId, Number(body.baseVersion), body.draft as Draft);
  if (result.status === 'saved') return privateJson(result);
  if (result.status === 'conflict') return privateJson({ error: 'Draft changed since it was loaded.', currentVersion: result.currentVersion }, 409);
  if (result.status === 'not-found') return privateJson({ error: 'Project not found.' }, 404);
  return privateJson({ error: 'Draft is invalid.', issues: result.issues }, 400);
}

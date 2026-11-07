import { env } from 'cloudflare:workers';
import { createProject } from '../../../lib/drafts';
import { requireOperator } from '../../../lib/guards';
import { privateJson } from '../../../lib/places/http';

export const prerender = false;

export async function POST({ request }: { request: Request }): Promise<Response> {
  if (!await requireOperator(request, env)) return privateJson({ error: 'Unauthorized.' }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return privateJson({ error: 'Expected JSON.' }, 400); }
  if (typeof body !== 'object' || body === null || !('label' in body) || typeof body.label !== 'string' || body.label.trim().length < 1 || body.label.trim().length > 120) {
    return privateJson({ error: 'Project name must be between 1 and 120 characters.' }, 400);
  }
  const project = await createProject(env.DB, body.label);
  return privateJson(project, 201);
}

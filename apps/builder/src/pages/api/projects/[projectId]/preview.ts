import { env } from 'cloudflare:workers';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { sealRevision, toRenderModel, validateDraft, type Draft } from '@studio/contracts';
import LandingPage from '@studio/landing/LandingPage.astro';
import { privateJson } from '../../../../lib/places/http';
import { requireOperator } from '../../../../lib/guards';
import { projectExists } from '../../../../lib/places/store';

export const prerender = false;
type Context = { request: Request; params: { projectId: string } };

export async function POST({ request, params }: Context): Promise<Response> {
  if (!await requireOperator(request, env)) return privateJson({ error: 'Unauthorized.' }, 401);
  if (!await projectExists(env.DB, params.projectId)) return privateJson({ error: 'Project not found.' }, 404);
  let value: unknown;
  try { value = await request.json(); } catch { return privateJson({ error: 'Expected a draft.' }, 400); }
  if (!value || typeof value !== 'object' || (value as { projectId?: unknown }).projectId !== params.projectId) return privateJson({ error: 'Draft project does not match the preview route.' }, 400);
  const validation = validateDraft(value);
  if (!validation.savable || !validation.shareable) return privateJson({ error: 'Complete required independently sourced fields before preview.', issues: validation.issues }, 422);
  try {
    const revision = await sealRevision(value as Draft);
    const model = await toRenderModel(revision);
    const container = await AstroContainer.create();
    const content = await container.renderToString(LandingPage, { props: { model, inert: true }, request });
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private page preview</title></head><body>${content}</body></html>`;
    return privateJson({ html, version: revision.version, hash: revision.hash });
  } catch {
    return privateJson({ error: 'Preview could not be rendered.' }, 422);
  }
}

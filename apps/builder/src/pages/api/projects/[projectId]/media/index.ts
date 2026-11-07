import { env } from 'cloudflare:workers';
import { privateJson } from '../../../../../lib/places/http';
import { requireOperator } from '../../../../../lib/guards';
import { projectExists } from '../../../../../lib/places/store';
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_PROJECT_IMAGES, processImageSafely, readBoundedBody, validateImage, type WorkerImageProcessor } from '../../../../../lib/images';

export const prerender = false;
type Context = { request: Request; params: { projectId: string } };

export async function POST({ request, params }: Context): Promise<Response> {
  if (!await requireOperator(request, env)) return privateJson({ error: 'Unauthorized.' }, 401);
  if (!await projectExists(env.DB, params.projectId)) return privateJson({ error: 'Project not found.' }, 404);
  const alt = request.headers.get('x-image-alt')?.trim() || '';
  if (!alt || alt.length > 250) return privateJson({ error: 'Write descriptive alt text before uploading.' }, 400);
  let bytes: Uint8Array;
  try { bytes = await readBoundedBody(request); }
  catch (error) { return privateJson({ error: error instanceof Error && error.message === 'size' ? 'Image must be 5 MiB or smaller.' : 'Image body is missing or invalid.' }, 413); }
  let info;
  try { info = validateImage(bytes, request.headers.get('content-type'), request.headers.get('x-rights-status'), request.headers.get('x-rights-basis')); }
  catch (error) {
    const reason = error instanceof Error ? error.message : '';
    return privateJson({ error: reason === 'dimensions' ? `Image dimensions must be valid and no larger than ${MAX_IMAGE_PIXELS.toLocaleString()} pixels.` : reason === 'rights' ? 'Confirm cleared rights and provide the rights basis.' : 'Only valid JPEG, PNG, or WebP files are accepted.' }, 400);
  }
  const count = await env.DB.prepare('SELECT count(*) AS total FROM media_assets WHERE project_id = ?').bind(params.projectId).first<{ total: number }>();
  if ((count?.total ?? 0) >= MAX_PROJECT_IMAGES) return privateJson({ error: `A project can have at most ${MAX_PROJECT_IMAGES} images.` }, 413);
  if (env.UPLOADS_ENABLED !== 'true') return privateJson({ error: 'Uploads are disabled until the Worker image pipeline passes staging verification.' }, 503);
  // The real Worker decoder/re-encoder is intentionally not wired until it passes the required staging proof.
  const processor: WorkerImageProcessor | null = null;
  let output;
  try { output = await processImageSafely(processor, bytes, info); }
  catch { return privateJson({ error: 'Image processing is unavailable; the private file was not stored.' }, 503); }
  const id = crypto.randomUUID();
  const objectKey = `projects/${params.projectId}/media/${id}`;
  const now = new Date().toISOString();
  await env.MEDIA.put(objectKey, output.bytes, { httpMetadata: { contentType: output.mime, cacheControl: 'private, no-store' } });
  try {
    await env.DB.prepare('INSERT INTO media_assets (id, project_id, object_key, mime_type, size_bytes, width, height, alt_text, rights_basis, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, params.projectId, objectKey, output.mime, output.bytes.byteLength, output.width, output.height, alt, request.headers.get('x-rights-basis')!.trim(), now).run();
  } catch (error) { await env.MEDIA.delete(objectKey); throw error; }
  return privateJson({ id, src: `/api/projects/${params.projectId}/media/${id}`, mime: output.mime, size: output.bytes.byteLength, width: output.width, height: output.height, alt });
}

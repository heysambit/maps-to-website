import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createEmptyDraft, createProject, getProjectDraft, saveProjectDraft } from '../../apps/builder/src/lib/drafts';
import { GOOGLE_SENTINEL } from '../../apps/builder/src/lib/places/fake';
import { lookupWithinLocalBudget, recordPlacesEvent, saveSelectedPlace } from '../../apps/builder/src/lib/places/store';
import { GET as getMedia } from '../../apps/builder/src/pages/api/projects/[projectId]/media/[assetId]';
import { POST as uploadMedia } from '../../apps/builder/src/pages/api/projects/[projectId]/media/index';

describe('project-scoped D1 drafts', () => {
  it('saves incomplete intake with compare-and-set and leaves newer content on conflict', async () => {
    const project = await createProject(env.DB, 'CAS fixture');
    const emptyDraft = createEmptyDraft(project.id);
    const wrongProject = await saveProjectDraft(env.DB, `${project.id}-other`, 0, emptyDraft);
    expect(wrongProject.status).toBe('invalid');

    const incomplete = { ...emptyDraft, businessName: { value: 'Northstar Repairs' } };
    const saved = await saveProjectDraft(env.DB, project.id, 0, incomplete);
    expect(saved).toMatchObject({ status: 'saved', version: 1 });

    const stale = await saveProjectDraft(env.DB, project.id, 0, emptyDraft);
    expect(stale).toEqual({ status: 'conflict', currentVersion: 1 });
    await expect(getProjectDraft(env.DB, project.id)).resolves.toMatchObject({
      version: 1,
      draft: { businessName: { value: 'Northstar Repairs' } },
    });
  });

  it('uses the local R2 binding for object storage', async () => {
    const key = `integration/${crypto.randomUUID()}`;
    await env.MEDIA.put(key, 'fixture-only');
    const object = await env.MEDIA.get(key);
    expect(object && await object.text()).toBe('fixture-only');
  });

  it('persists only the explicitly selected Place ID and metadata, never result sentinels', async () => {
    const project = await createProject(env.DB, 'Places privacy fixture');
    await recordPlacesEvent(env.DB, project.id, 'demo-operator', 'lookup', 'results');
    await saveSelectedPlace(env.DB, project.id, 'demo-operator', 'ChIJfixtureNorthstar001');
    const saved = await env.DB.prepare('SELECT selected_place_id, place_selected_by FROM projects WHERE id = ?').bind(project.id).first<Record<string, unknown>>();
    const audit = await env.DB.prepare('SELECT action, outcome, actor_id FROM places_audit WHERE project_id = ?').bind(project.id).all();
    const persisted = JSON.stringify({ saved, audit });
    expect(saved).toMatchObject({ selected_place_id: 'ChIJfixtureNorthstar001', place_selected_by: 'demo-operator' });
    expect(persisted).not.toContain(GOOGLE_SENTINEL);
    expect(persisted).not.toContain('Synthetic Avenue');
    const allProjects = await env.DB.prepare('SELECT label, selected_place_id FROM projects').all();
    const allDrafts = await env.DB.prepare('SELECT content_json FROM drafts').all();
    const allAudit = await env.DB.prepare('SELECT action, outcome, actor_id FROM places_audit').all();
    expect(JSON.stringify({ allProjects, allDrafts, allAudit })).not.toContain(GOOGLE_SENTINEL);
  });

  it('bounds provider search volume per operator and installation', async () => {
    const project = await createProject(env.DB, 'Places budget fixture');
    for (let i = 0; i < 8; i++) await recordPlacesEvent(env.DB, project.id, 'budget-operator', 'lookup', 'empty');
    expect(await lookupWithinLocalBudget(env.DB, 'budget-operator')).toBe(false);
  });

  it('serves media through a project-scoped authorization check and private R2 only', async () => {
    const project = await createProject(env.DB, 'Private media fixture');
    const assetId = crypto.randomUUID();
    const objectKey = `projects/${project.id}/media/${assetId}`;
    await env.MEDIA.put(objectKey, 'private-fixture-bytes', { httpMetadata: { contentType: 'image/png' } });
    await env.DB.prepare('INSERT INTO media_assets (id, project_id, object_key, mime_type, size_bytes, width, height, alt_text, rights_basis, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(assetId, project.id, objectKey, 'image/png', 21, 1, 1, 'Synthetic image', 'fixture rights', new Date().toISOString()).run();
    const anonymous = await getMedia({ request: new Request(`http://127.0.0.1/api/projects/${project.id}/media/${assetId}`), params: { projectId: project.id, assetId } });
    expect(anonymous.status).toBe(401);
    const wrongProject = await getMedia({ request: new Request(`http://127.0.0.1/api/projects/other/media/${assetId}`, { headers: { Authorization: `Bearer ${env.LOCAL_OPERATOR_TOKEN}` } }), params: { projectId: 'other', assetId } });
    expect(wrongProject.status).toBe(404);
    const response = await getMedia({ request: new Request(`http://127.0.0.1/api/projects/${project.id}/media/${assetId}`, { headers: { Authorization: `Bearer ${env.LOCAL_OPERATOR_TOKEN}` } }), params: { projectId: project.id, assetId } });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    await expect(response.text()).resolves.toBe('private-fixture-bytes');
  });

  it('keeps a rights-cleared valid upload out of private R2 while the pipeline flag is off', async () => {
    const project = await createProject(env.DB, 'Disabled media pipeline fixture');
    const bytes = new Uint8Array(24); bytes.set([137,80,78,71,13,10,26,10]); bytes.set([73,72,68,82], 12); new DataView(bytes.buffer).setUint32(16, 1); new DataView(bytes.buffer).setUint32(20, 1);
    const response = await uploadMedia({
      request: new Request(`http://127.0.0.1/api/projects/${project.id}/media`, { method: 'POST', headers: { Authorization: `Bearer ${env.LOCAL_OPERATOR_TOKEN}`, 'Content-Type': 'image/png', 'X-Image-Alt': 'Synthetic one pixel fixture', 'X-Rights-Status': 'cleared', 'X-Rights-Basis': 'fixture-only rights' }, body: bytes.buffer as ArrayBuffer }),
      params: { projectId: project.id },
    });
    expect(response.status).toBe(503);
    const count = await env.DB.prepare('SELECT count(*) AS total FROM media_assets WHERE project_id = ?').bind(project.id).first<{ total: number }>();
    expect(count?.total).toBe(0);
  });
});

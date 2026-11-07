import { validateDraft, type Draft } from '@studio/contracts';

export function createEmptyDraft(projectId: string): Draft {
  return { schemaVersion: 1, projectId, version: 0, siteType: 'storefront', theme: 'coast' };
}

export async function createProject(db: D1Database, label: string) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const draft = createEmptyDraft(id);
  await db.batch([
    db.prepare('INSERT INTO projects (id, label, created_at) VALUES (?, ?, ?)').bind(id, label.trim(), now),
    db.prepare('INSERT INTO drafts (project_id, version, content_json, updated_at) VALUES (?, ?, ?, ?)').bind(id, 0, JSON.stringify(draft), now),
  ]);
  return { id, label: label.trim(), version: 0, draft };
}

export async function getProjectDraft(db: D1Database, projectId: string) {
  const row = await db.prepare(`
    SELECT p.id, p.label, d.version, d.content_json, d.updated_at
    FROM projects p JOIN drafts d ON d.project_id = p.id WHERE p.id = ?
  `).bind(projectId).first<{ id: string; label: string; version: number; content_json: string; updated_at: string }>();
  if (!row) return null;
  return { id: row.id, label: row.label, version: row.version, draft: JSON.parse(row.content_json) as Draft, updatedAt: row.updated_at };
}

export type SaveDraftResult =
  | { status: 'saved'; version: number; draft: Draft }
  | { status: 'conflict'; currentVersion: number }
  | { status: 'not-found' }
  | { status: 'invalid'; issues: ReturnType<typeof validateDraft>['issues'] };

export async function saveProjectDraft(
  db: D1Database,
  projectId: string,
  baseVersion: number,
  draft: Draft,
): Promise<SaveDraftResult> {
  if (draft.projectId !== projectId || draft.version !== baseVersion) {
    return { status: 'invalid', issues: [{ field: 'projectId', code: 'project_scope_mismatch', message: 'Draft project and version must match the requested project and base version.', severity: 'save' }] };
  }
  const nextDraft = { ...draft, version: baseVersion + 1 };
  const validation = validateDraft(nextDraft);
  if (!validation.savable) return { status: 'invalid', issues: validation.issues };

  const result = await db.prepare(`
    UPDATE drafts SET version = ?, content_json = ?, updated_at = ?
    WHERE project_id = ? AND version = ?
  `).bind(baseVersion + 1, JSON.stringify(nextDraft), new Date().toISOString(), projectId, baseVersion).run();
  if (result.meta.changes === 1) return { status: 'saved', version: baseVersion + 1, draft: nextDraft };

  const current = await db.prepare('SELECT version FROM drafts WHERE project_id = ?').bind(projectId).first<{ version: number }>();
  return current ? { status: 'conflict', currentVersion: current.version } : { status: 'not-found' };
}

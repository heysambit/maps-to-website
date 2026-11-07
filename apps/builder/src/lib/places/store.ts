export async function projectExists(db: D1Database, projectId: string): Promise<boolean> {
  return Boolean(await db.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first());
}

export async function lookupWithinLocalBudget(db: D1Database, actorId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const [operator, installation] = await Promise.all([
    db.prepare("SELECT count(*) AS total FROM places_audit WHERE actor_id = ? AND action IN ('lookup', 'manual_fallback') AND created_at >= ?").bind(actorId, cutoff).first<{ total: number }>(),
    db.prepare("SELECT count(*) AS total FROM places_audit WHERE action IN ('lookup', 'manual_fallback') AND created_at >= ?").bind(cutoff).first<{ total: number }>(),
  ]);
  return (operator?.total ?? 0) < 8 && (installation?.total ?? 0) < 60;
}

export async function recordPlacesEvent(db: D1Database, projectId: string, actorId: string, action: 'lookup' | 'selected' | 'manual_fallback', outcome: string): Promise<void> {
  await db.prepare('INSERT INTO places_audit (id, project_id, actor_id, action, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), projectId, actorId, action, outcome.slice(0, 32), new Date().toISOString()).run();
}

export async function saveSelectedPlace(db: D1Database, projectId: string, actorId: string, placeId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const results = await db.batch([
    db.prepare('UPDATE projects SET selected_place_id = ?, place_selected_at = ?, place_selected_by = ? WHERE id = ?').bind(placeId, now, actorId, projectId),
    db.prepare('INSERT INTO places_audit (id, project_id, actor_id, action, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), projectId, actorId, 'selected', 'confirmed', now),
  ]);
  return results[0]?.meta.changes === 1;
}

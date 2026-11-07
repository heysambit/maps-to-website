import type { RenderModel, Revision } from '@studio/contracts';
import { toRenderModel } from '@studio/contracts';

export async function toPrivateReviewModel(db: D1Database, revision: Revision): Promise<RenderModel | null> {
  const model = await toRenderModel(revision);
  if (!model.assets.length) return model;
  const assets: RenderModel['assets'] = [];
  for (const asset of model.assets) {
    const match = /^\/assets\/([a-f0-9]{64})$/.exec(asset.src);
    if (!match) return null;
    const row = await db.prepare('SELECT id FROM media_assets WHERE project_id = ? AND sha256 = ? AND rights_basis <> ?')
      .bind(revision.projectId, match[1], '').first<{ id: string }>();
    if (!row) return null;
    assets.push({ ...asset, src: `/r/${encodeURIComponent(revision.id)}/media/${match[1]}` });
  }
  return { ...model, assets };
}

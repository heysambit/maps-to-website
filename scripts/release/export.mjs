#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const input = args[0];
const destination = resolve(args[1] || 'exports/fixture-site');
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value) ?? 'null';
const sha = (value) => createHash('sha256').update(canonical(value)).digest('hex');
const escapeMarkdown = (value) => String(value).replace(/[\r\n\t]+/g, ' ').replace(/[\\`*_~|<>\[\]()]/g, '\\$&');

let bundle;
if (input === '--fixture') {
  const unsigned = {
    schemaVersion: 1, releaseId: 'fixture-export-2026-11', projectId: 'fixture-export', targetHostname: 'fixture.example',
    revisionId: 'fixture-export:v1', revisionHash: 'synthetic-fixture-revision', rendererVersion: 'astro-renderer-m1', templateVersion: 'm1',
    content: { projectId: 'fixture-export', siteType: 'service-area', theme: 'grove', businessName: 'Northstar Home Care', serviceSummary: 'Reliable home repairs across the peninsula.', locality: 'Portland, Maine', serviceArea: 'Portland and nearby coastal communities', contact: { type: 'phone', label: 'Call Northstar', href: 'tel:+12075550192' }, services: [], about: 'Synthetic export smoke fixture.', testimonials: [], assets: [] },
    assets: [], createdAt: '2026-11-07T00:00:00.000Z',
  };
  bundle = { ...unsigned, bundleHash: sha(unsigned) };
} else {
  if (!input) throw new Error('Pass a sealed bundle JSON file or --fixture.');
  bundle = JSON.parse(await readFile(resolve(input), 'utf8'));
  const { bundleHash, ...unsigned } = bundle;
  if (sha(unsigned) !== bundleHash || bundle.rendererVersion !== 'astro-renderer-m1' || !bundle.releaseId || !bundle.content || !Array.isArray(bundle.assets)) throw new Error('Bundle integrity or renderer check failed.');
}
if (await (async () => { try { await readFile(resolve(destination, 'README.md')); return true; } catch { return false; } })()) await rm(destination, { recursive: true, force: true });
await mkdir(resolve(destination, 'apps/site/src/pages'), { recursive: true });
await mkdir(resolve(destination, 'packages/contracts/src'), { recursive: true });
await mkdir(resolve(destination, 'packages/landing/src/components'), { recursive: true });
await mkdir(resolve(destination, 'apps/site/public/assets'), { recursive: true });
await cp('packages/contracts/package.json', resolve(destination, 'packages/contracts/package.json'));
await cp('packages/contracts/tsconfig.json', resolve(destination, 'packages/contracts/tsconfig.json'));
await cp('packages/contracts/src/index.ts', resolve(destination, 'packages/contracts/src/index.ts'));
await cp('packages/landing/package.json', resolve(destination, 'packages/landing/package.json'));
await cp('packages/landing/src/index.ts', resolve(destination, 'packages/landing/src/index.ts'));
await cp('packages/landing/src/components/LandingPage.astro', resolve(destination, 'packages/landing/src/components/LandingPage.astro'));
for (const asset of bundle.assets) {
  if (!/^[a-f0-9]{64}$/.test(asset.digest) || typeof asset.rightsNotice !== 'string' || !asset.rightsNotice.trim() || asset.rightsNotice.length > 500) throw new Error('Invalid asset digest or rights notice in release manifest.');
  const path = resolve(args[2] || 'dist/release/assets', asset.digest);
  const bytes = await readFile(path);
  if (createHash('sha256').update(bytes).digest('hex') !== asset.digest) throw new Error(`Asset integrity failed: ${asset.digest}`);
  await writeFile(resolve(destination, 'apps/site/public/assets', asset.digest), bytes);
}
await writeFile(resolve(destination, 'apps/site/src/release-model.json'), JSON.stringify(bundle.content, null, 2));
await writeFile(resolve(destination, 'apps/site/src/pages/index.astro'), `---\nimport model from '../release-model.json';\nimport LandingPage from '@studio/landing/LandingPage.astro';\n---\n<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{model.businessName} | {model.locality}</title><meta name="description" content={model.serviceSummary}></head><body><LandingPage model={model} /></body></html>\n`);
await writeFile(resolve(destination, 'apps/site/astro.config.mjs'), `import { defineConfig } from 'astro/config';\nexport default defineConfig({ output: 'static' });\n`);
await writeFile(resolve(destination, 'apps/site/package.json'), JSON.stringify({ name: '@studio/site', private: true, type: 'module', scripts: { build: 'astro build' }, dependencies: { '@studio/contracts': 'workspace:*', '@studio/landing': 'workspace:*', astro: '7.4.7' } }, null, 2));
await writeFile(resolve(destination, 'package.json'), JSON.stringify({ name: 'portable-site-source', private: true, packageManager: 'pnpm@10.34.9', engines: { node: '22.23.4', pnpm: '10.34.9' }, scripts: { build: 'pnpm --filter @studio/site build' } }, null, 2));
await writeFile(resolve(destination, 'pnpm-workspace.yaml'), 'packages:\n  - apps/site\n  - packages/*\n');
await writeFile(resolve(destination, '.gitignore'), 'node_modules/\napps/site/dist/\napps/site/.astro/\n');
await writeFile(resolve(destination, 'README.md'), `# ${bundle.content.businessName} · Portable source export\n\nThis static Astro source export was generated from sealed release \`${bundle.releaseId}\` for the synthetic fixture target \`${bundle.targetHostname}\`. It contains only the sanitized render model and licensed assets present in that release bundle. Review the content and destination before any independent deployment.\n\n## Build\n\nUse Node.js 22.23.4 and pnpm 10.34.9. Run \`pnpm install --frozen-lockfile\` and \`pnpm build\`. The export has no builder, D1, R2, Places, reviewer grants, credentials, or private intake data.\n`);
await cp('LICENSE', resolve(destination, 'LICENSE'));
await writeFile(resolve(destination, 'THIRD_PARTY_NOTICES.md'), `# Third-party notices\n\nThe portable export includes the repository's MIT-licensed renderer source. It does not include the Google Maps attribution logo or Google Places data. Any media assets are enumerated with their clearance/license notes in \`ASSET_RIGHTS.md\`. Review each listed license before changing how the export is distributed.\n`);
await writeFile(resolve(destination, 'ASSET_RIGHTS.md'), bundle.assets.length ? `# Asset rights notices\n\n${bundle.assets.map((asset) => `- SHA-256 \`${asset.digest}\` (${escapeMarkdown(asset.mime)}): ${escapeMarkdown(asset.rightsNotice)}`).join('\n')}\n` : '# Asset rights notices\n\nThis sealed fixture contains no media assets.\n');
console.log(`Portable source export created at ${destination} for ${bundle.releaseId}.`);

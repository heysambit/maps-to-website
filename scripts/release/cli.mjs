#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const command = process.argv[2];
const releaseId = process.env.RELEASE_ID || '';
const baseUrl = (process.env.BUILDER_URL || '').replace(/\/$/, '');
const token = process.env.RELEASE_SERVICE_TOKEN || '';
const liveEnabled = process.env.LIVE_DEPLOY_ENABLED === 'true';
const rendererVersion = 'astro-renderer-m1';
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value) ?? 'null';
const hash = (value) => createHash('sha256').update(canonical(value)).digest('hex');

function requireReleaseIdentity() {
  if (!/^[a-f0-9-]{36}$/.test(releaseId) || !/^https:\/\//.test(baseUrl) || token.length < 32) throw new Error('Set RELEASE_ID, HTTPS BUILDER_URL, and scoped RELEASE_SERVICE_TOKEN. Dispatch accepts no bundle or target input.');
}
async function bundleForId() {
  requireReleaseIdentity();
  const response = await fetch(`${baseUrl}/api/internal/releases/${encodeURIComponent(releaseId)}/bundle`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Sealed release fetch failed (${response.status}).`);
  const bundle = await response.json();
  const { bundleHash, ...unsigned } = bundle;
  if (bundle.releaseId !== releaseId || bundle.rendererVersion !== rendererVersion || hash(unsigned) !== bundleHash) throw new Error('Release ID, renderer, or sealed bundle hash check failed.');
  return bundle;
}
async function report(state, fields = {}) {
  const response = await fetch(`${baseUrl}/api/internal/releases/${encodeURIComponent(releaseId)}/state`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ state, ...fields }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Release state update failed (${response.status}); reconcile by release ID.`);
}
async function currentState() {
  requireReleaseIdentity();
  const response = await fetch(`${baseUrl}/api/internal/releases/${encodeURIComponent(releaseId)}/state`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Release state fetch failed (${response.status}).`);
  return response.json();
}
async function build(bundle) {
  const output = resolve('dist/release', bundle.releaseId);
  await mkdir(output, { recursive: true });
  const page = resolve('apps/site/src/pages/release.astro');
  const modelFile = resolve('apps/site/src/release-model.json');
  const copiedAssets = [];
  try {
    await writeFile(modelFile, JSON.stringify(bundle.content));
    await writeFile(page, `---\nimport model from '../release-model.json';\nimport LandingPage from '@studio/landing/LandingPage.astro';\n---\n<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{model.businessName} | {model.locality}</title><meta name="description" content={model.serviceSummary}></head><body><LandingPage model={model} /></body></html>\n`);
    for (const asset of bundle.assets) {
      const response = await fetch(`${baseUrl}/api/internal/releases/${encodeURIComponent(bundle.releaseId)}/assets/${asset.digest}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`Sealed asset fetch failed (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== asset.size || createHash('sha256').update(bytes).digest('hex') !== asset.digest) throw new Error('Sealed asset bytes do not match the digest manifest.');
      const assetPath = resolve('apps/site/public/assets', asset.digest);
      await mkdir(resolve('apps/site/public/assets'), { recursive: true });
      await writeFile(assetPath, bytes, { flag: 'wx' });
      copiedAssets.push(assetPath);
    }
    execFileSync('pnpm', ['--filter', '@studio/site', 'build'], { stdio: 'inherit' });
    const generated = resolve('apps/site/dist/release/index.html');
    await copyFile(generated, resolve(output, 'index.html'));
    if (bundle.assets.length) {
      await mkdir(resolve(output, 'assets'), { recursive: true });
      for (const asset of bundle.assets) await copyFile(resolve('apps/site/dist/assets', asset.digest), resolve(output, 'assets', asset.digest));
    }
    await writeFile(resolve(output, 'render-model.json'), JSON.stringify(bundle.content));
    const outputBytes = await readFile(resolve(output, 'index.html'));
    return { output, buildHash: createHash('sha256').update(outputBytes).digest('hex') };
  } finally {
    await rm(page, { force: true }); await rm(modelFile, { force: true });
    for (const path of copiedAssets) await rm(path, { force: true });
  }
}
async function scan(bundle, artifact) {
  const raw = await readFile(resolve(artifact.output, 'render-model.json'), 'utf8');
  const html = await readFile(resolve(artifact.output, 'index.html'), 'utf8');
  if (raw.includes('privateAddress') || raw.includes('PRIVATE ADDRESS') || html.includes('privateAddress') || /(?:sk-|AIza[0-9A-Za-z_-]{20,})/.test(`${raw}\n${html}`) || /href=["']javascript:/i.test(html)) throw new Error('Release output contains a restricted field, credential, or unsafe link.');
  if (!bundle.targetHostname || !bundle.assets.every((asset) => /^[a-f0-9]{64}$/.test(asset.digest))) throw new Error('Unsafe target or asset digest.');
  return { ...artifact, scan: 'passed' };
}
async function deploy(bundle, artifact) {
  if (liveEnabled) throw new Error('Live deployment is not implemented or enabled in this fixture workflow.');
  if (process.env.RELEASE_PROVIDER !== 'fake') throw new Error('Deployment requires the explicit fake provider in local fixture mode.');
  const { FakeDeploymentProvider } = await import('./provider.mjs');
  const provider = new FakeDeploymentProvider({ timeoutAfterApply: process.env.FAKE_TIMEOUT_AFTER_APPLY === 'true', versionOverride: process.env.FAKE_VERSION_OVERRIDE || null });
  await report('deploying', { buildHash: artifact.buildHash });
  try {
    const expected = await provider.deploy(bundle, artifact);
    const result = await provider.inspect(bundle.targetHostname);
    const { verifyProviderVersion } = await import('./provider.mjs');
    if (!verifyProviderVersion(result, bundle, expected.version)) throw new Error('Provider version or canonical release marker did not verify.');
    await writeFile(resolve(artifact.output, 'provider-result.json'), JSON.stringify(result));
    await report('verifying', { buildHash: artifact.buildHash, providerVersion: result.version, providerMarker: result.marker });
    return result;
  } catch (error) {
    if (provider.current) await writeFile(resolve(artifact.output, 'provider-result.json'), JSON.stringify(provider.current));
    await report('unknown', { buildHash: artifact.buildHash, ...(provider.current ? { providerVersion: provider.current.version, providerMarker: provider.current.marker } : {}), detail: 'Provider may have applied the release; reconciliation is required before retry.' });
    throw error;
  }
}
async function verify(bundle, provider) {
  const { verifyProviderVersion } = await import('./provider.mjs');
  if (!verifyProviderVersion(provider, bundle, process.env.EXPECTED_PROVIDER_VERSION || undefined)) throw new Error('Canonical target marker or provider version verification failed.');
  await report('live', { providerVersion: provider.version, buildHash: process.env.BUILD_HASH || '' });
}
async function reconcile(bundle) {
  const state = await currentState();
  if (state.status === 'unknown' || state.status === 'deploying') await report('needs_reconciliation', { detail: 'Operator requested reconciliation after an indeterminate deployment outcome.' });
  const stateFile = resolve('dist/release', bundle.releaseId, 'provider-result.json');
  let current = null; try { current = JSON.parse(await readFile(stateFile, 'utf8')); } catch { /* no local outcome */ }
  const recovered = current?.releaseId === bundle.releaseId && current?.targetHostname === bundle.targetHostname ? current : state.providerVersion && state.providerMarker ? { releaseId: bundle.releaseId, targetHostname: bundle.targetHostname, version: state.providerVersion, marker: state.providerMarker } : null;
  if (recovered?.releaseId === bundle.releaseId && recovered?.targetHostname === bundle.targetHostname && recovered?.marker === bundle.bundleHash) {
    if (state.status !== 'verifying') await report('verifying', { providerVersion: recovered.version, providerMarker: recovered.marker });
    return verify(bundle, recovered);
  }
  await report('needs_reconciliation', { detail: 'Provider state is not conclusively verified; target lock remains held.' });
  throw new Error('Provider outcome remains unknown. Do not retry or release the target lock.');
}
async function rollback(bundle) {
  if (liveEnabled) throw new Error('Live rollback is not enabled in this fixture workflow.');
  const { FakeDeploymentProvider } = await import('./provider.mjs');
  const provider = new FakeDeploymentProvider();
  const state = await currentState();
  const targetResponse = await fetch(`${baseUrl}/api/internal/releases/${encodeURIComponent(releaseId)}/rollback-target`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!targetResponse.ok) throw new Error(`Eligible rollback target lookup failed (${targetResponse.status}).`);
  const targetData = await targetResponse.json();
  if (targetData.targetHostname !== bundle.targetHostname) throw new Error('Rollback target hostname does not match the sealed release.');
  const priorInfo = targetData.previous;
  const prior = priorInfo ? { releaseId: priorInfo.releaseId, targetHostname: targetData.targetHostname, version: priorInfo.version, marker: priorInfo.marker } : null;
  if (prior && prior.releaseId) {
    if (state.status !== 'live' && state.status !== 'rolled_back') throw new Error('Rollback requires a verified live release or a prior rolled-back release.');
    await report('rolling_back');
    await provider.rollback(bundle.targetHostname, prior);
  } else {
    if (state.status !== 'live' && state.status !== 'rolled_back') throw new Error('First-release takedown requires a verified live release.');
    await report('takedown_pending');
    await provider.rollback(bundle.targetHostname, null); // First release uses a verified deny/maintenance deployment.
  }
  const result = await provider.inspect(bundle.targetHostname);
  if (!result || result.targetHostname !== bundle.targetHostname || (prior && (result.marker !== prior.marker || result.version !== prior.version)) || (!prior && result.marker !== 'maintenance-deny')) throw new Error('Rollback/takedown target verification failed.');
  await writeFile(resolve('dist/release', bundle.releaseId, 'provider-result.json'), JSON.stringify(result));
  await report(prior ? 'rolled_back' : 'taken_down', { providerVersion: result.version, providerMarker: result.marker });
}

try {
  if (!['build','scan','deploy','verify','reconcile','rollback','dispatch'].includes(command)) throw new Error('Use build, scan, deploy, verify, reconcile, rollback, or dispatch.');
  if (command === 'export') throw new Error('Export is handled by scripts/release/export.mjs and requires a verified bundle file.');
  if (command === 'dispatch') {
    const bundle = await bundleForId();
    const operation = process.env.RELEASE_OPERATION || 'deploy';
    if (operation === 'reconcile') await reconcile(bundle);
    else if (operation === 'rollback') await rollback(bundle);
    else if (operation === 'deploy') {
      await report('building');
      const artifact = await build(bundle);
      await report('scanning');
      const scanned = await scan(bundle, artifact);
      await report('ready', { buildHash: scanned.buildHash });
      const deployed = await deploy(bundle, scanned);
      process.env.BUILD_HASH = scanned.buildHash;
      await verify(bundle, deployed);
    } else throw new Error('Unknown protected release operation.');
  } else {
    const bundle = await bundleForId();
    if (command === 'build') { const artifact = await build(bundle); console.log(JSON.stringify(artifact)); }
    else if (command === 'scan') { const artifact = await build(bundle); console.log(JSON.stringify(await scan(bundle, artifact))); }
    else if (command === 'deploy') { const artifact = await build(bundle); await deploy(bundle, await scan(bundle, artifact)); }
    else if (command === 'verify') await reconcile(bundle);
    else if (command === 'reconcile') await reconcile(bundle);
    else if (command === 'rollback') await rollback(bundle);
  }
} catch (error) { console.error(error instanceof Error ? error.message : 'Release operation failed.'); process.exitCode = 1; }

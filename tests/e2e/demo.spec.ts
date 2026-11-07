import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const provenanceRef = 'fixture://independent-records/verified-by-operator';

async function createProject(page: Page, label = 'Playwright fixture project') {
  await page.goto('/');
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible();
  await page.getByLabel('Project name').fill(label);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('#project-id')).not.toBeEmpty();
  return (await page.locator('#project-id').textContent())!.trim();
}

async function fillIndependent(page: Page, label: string, value: string, ref = provenanceRef) {
  await page.locator(`#field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`).fill(value);
  await page.getByLabel(`Source type for ${label}`).selectOption('independent');
  await page.getByLabel(`${label} source reference`, { exact: true }).fill(ref);
}

async function fillStorefront(page: Page, options: { services?: string[]; about?: string } = {}) {
  await fillIndependent(page, 'Business name', 'Harbor & Pine');
  await fillIndependent(page, 'Service summary', 'Thoughtful garden care for homes around the bay.');
  await fillIndependent(page, 'City or locality', 'Portland, Maine');
  await fillIndependent(page, 'Public storefront address', '123 Example Street, Portland, ME');
  if (options.about) await fillIndependent(page, 'About', options.about);
  if (options.services?.length) {
    await page.getByLabel('Services (one per line)', { exact: true }).fill(options.services.join('\n'));
    await page.getByLabel('Source type for services (one per line)').selectOption('independent');
    await page.getByLabel('Services (one per line) source reference', { exact: true }).fill(provenanceRef);
  }
  await page.locator('#contact-type').selectOption('directions');
  await page.getByLabel('Button label', { exact: true }).fill('Get directions');
  await page.getByLabel('Phone or HTTPS destination', { exact: true }).fill('https://www.google.com/maps/dir/?api=1&destination=123%20Example%20Street%2C%20Portland%2C%20ME');
  await page.locator('#contact-source-kind').selectOption('independent');
  await page.getByLabel('Contact source reference', { exact: true }).fill(provenanceRef);
}

test('editor previews through shared Astro renderer, preserves parity, and meets responsive accessibility checks', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await createProject(page, 'Harbor fixture');
  await fillStorefront(page, { services: ['Seasonal garden care', 'Native planting'], about: 'A synthetic local garden studio fixture.' });
  await expect(page.getByText(/Preview updated from draft version 0/)).toBeVisible({ timeout: 15_000 });
  const frame = page.frameLocator('iframe[title="Rendered page preview"]');
  await expect(frame.locator('.landing h1')).toHaveText('Harbor & Pine');
  await expect(frame.locator('.landing [aria-labelledby="services-title"] li')).toHaveText(['Seasonal garden care', 'Native planting']);
  await expect(frame.locator('.landing .primary-action')).toHaveAttribute('aria-disabled', 'true');
  await expect(frame.locator('.landing .primary-action')).not.toHaveAttribute('href', /.+/);

  const staticHtml = await readFile(resolve(process.cwd(), 'apps/site/dist/storefront/index.html'), 'utf8');
  const staticSummary = await page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const root = doc.querySelector('.landing')!;
    return { theme: root.getAttribute('data-theme'), type: root.getAttribute('data-site-type'), text: root.querySelector('main')!.textContent!.replace(/\s+/g, ' ').trim(), href: root.querySelector('.primary-action')?.getAttribute('href') };
  }, staticHtml);
  const previewSummary = await frame.locator('.landing').evaluate((node) => ({ theme: node.getAttribute('data-theme'), type: node.getAttribute('data-site-type'), text: node.querySelector('main')!.textContent!.replace(/\s+/g, ' ').trim(), href: node.querySelector('.primary-action')?.getAttribute('href') }));
  expect(previewSummary).toMatchObject({ theme: staticSummary.theme, type: staticSummary.type, text: staticSummary.text });
  expect(staticSummary.href).toMatch(/^https:\/\/www\.google\.com\/maps\//);
  expect(previewSummary.href).toBeNull();

  await page.getByRole('button', { name: 'Use dark mode' }).click();
  await expect(page.getByRole('button', { name: 'Use light mode' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflows, `horizontal overflow at ${width}px`).toBe(false);
    if (width === 320 || width === 1440) {
      const axe = await new AxeBuilder({ page }).exclude('iframe').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(axe.violations.map((violation) => `${violation.id}: ${violation.help}`), `axe violations at ${width}px`).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
});

test('two-tab compare-and-set conflicts preserve the editor value and offer recovery', async ({ context, page }) => {
  const id = await createProject(page, 'Concurrent editing fixture');
  await page.locator('#field-business-name').fill('First tab draft');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').first()).toContainText('Draft saved as version 1');

  const secondTab = await context.newPage();
  await secondTab.goto('/');
  await expect(secondTab.locator('[data-editor-ready="true"]')).toBeVisible();
  await secondTab.getByLabel('Project ID').fill(id);
  await secondTab.getByRole('button', { name: 'Load saved draft' }).click();
  await expect(secondTab.locator('#field-business-name')).toHaveValue('First tab draft');
  await page.locator('#field-business-name').fill('First tab newest value');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').first()).toContainText('Draft saved as version 2');

  await secondTab.locator('#field-business-name').fill('Second tab unsaved value');
  await secondTab.getByRole('button', { name: 'Save draft' }).click();
  await expect(secondTab.getByRole('status').first()).toContainText('changed in another tab');
  await expect(secondTab.locator('#field-business-name')).toHaveValue('Second tab unsaved value');
  await expect(secondTab.getByRole('button', { name: 'Copy unsaved draft' })).toBeVisible();
});

test('server save failures keep typed values in the form', async ({ page }) => {
  await createProject(page, 'Save recovery fixture');
  await page.route('**/api/projects/*/draft', async (route) => {
    if (route.request().method() === 'PUT') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Injected fixture save failure.' }) });
    return route.continue();
  });
  await page.locator('#field-business-name').fill('Keep this unsaved business name');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').first()).toContainText('Injected fixture save failure');
  await expect(page.locator('#field-business-name')).toHaveValue('Keep this unsaved business name');
});

test('media route rejects hostile and oversized files and keeps the disabled pipeline closed', async ({ page }) => {
  const id = await createProject(page, 'Upload validation fixture');
  const outcomes = await page.evaluate(async (projectId) => {
    const token = document.querySelector<HTMLMetaElement>('meta[name="local-operator-token"]')!.content;
    const send = async (bytes: Uint8Array, type: string, extra: Record<string, string> = {}) => {
      const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const response = await fetch(`/api/projects/${projectId}/media`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': type, 'x-image-alt': 'A synthetic test image', ...extra }, body });
      return { status: response.status, body: await response.json() };
    };
    const tooLarge = await send(new Uint8Array(5 * 1024 * 1024 + 1), 'image/png', { 'x-rights-status': 'cleared', 'x-rights-basis': 'fixture authorization' });
    const svg = await send(new TextEncoder().encode('<svg onload="alert(1)"></svg>'), 'image/svg+xml', { 'x-rights-status': 'cleared', 'x-rights-basis': 'fixture authorization' });
    const badPng = new Uint8Array(24); badPng.set([137,80,78,71,13,10,26,10], 0); badPng.set([73,72,68,82], 12); new DataView(badPng.buffer).setUint32(16, 5000); new DataView(badPng.buffer).setUint32(20, 5000);
    const tooManyPixels = await send(badPng, 'image/png', { 'x-rights-status': 'cleared', 'x-rights-basis': 'fixture authorization' });
    const validPng = new Uint8Array(24); validPng.set([137,80,78,71,13,10,26,10], 0); validPng.set([73,72,68,82], 12); new DataView(validPng.buffer).setUint32(16, 1); new DataView(validPng.buffer).setUint32(20, 1);
    const noRights = await send(validPng, 'image/png');
    const pipelineOff = await send(validPng, 'image/png', { 'x-rights-status': 'cleared', 'x-rights-basis': 'fixture authorization' });
    return { tooLarge, svg, tooManyPixels, noRights, pipelineOff };
  }, id);
  expect(outcomes.tooLarge.status).toBe(413);
  expect(outcomes.svg.status).toBe(400);
  expect(outcomes.tooManyPixels.status).toBe(400);
  expect(outcomes.noRights.status).toBe(400);
  expect(outcomes.pipelineOff.status).toBe(503);
});

test('fixture suggestion remains opt-in, source limited, and network free', async ({ page }) => {
  await createProject(page, 'Copy fixture');
  await fillIndependent(page, 'Service summary', 'Reliable repair across the peninsula.');
  await page.getByLabel('Opt in to fixture-only suggestions').check();
  await page.getByRole('button', { name: 'Suggest from eligible source IDs' }).click();
  await expect(page.getByLabel('Copy suggestion')).toContainText('Reliable repair across the peninsula.');
  await expect(page.getByLabel('Copy suggestion')).toContainText('Source: serviceSummary');
});

test('later preview responses replace older drafts and older responses cannot move the preview back', async ({ page }) => {
  let startOld!: () => void;
  const oldStarted = new Promise<void>((resolve) => { startOld = resolve; });
  await page.route('**/api/projects/*/preview', async (route) => {
    const requestDraft = route.request().postDataJSON() as { businessName?: { value?: string }; version?: number };
    if (requestDraft.businessName?.value === 'Harbor & Pine') {
      startOld();
      await new Promise((resolve) => setTimeout(resolve, 900));
      try { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ html: '<!doctype html><html><body><div class="landing"><h1>OLD PREVIEW</h1></div></body></html>', version: requestDraft.version }) }); } catch { /* The in-flight request can be aborted after a newer draft arrives. */ }
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ html: '<!doctype html><html><body><div class="landing"><h1>FRESH PREVIEW</h1></div></body></html>', version: requestDraft.version }) });
  });
  await createProject(page, 'Preview ordering fixture');
  await fillStorefront(page);
  await oldStarted;
  await page.locator('#field-business-name').fill('Fresh Harbor & Pine');
  const frame = page.frameLocator('iframe[title="Rendered page preview"]');
  await expect(frame.locator('.landing h1')).toHaveText('FRESH PREVIEW');
  await page.waitForTimeout(1000);
  await expect(frame.locator('.landing h1')).toHaveText('FRESH PREVIEW');
});

test('keyboard can create and save a draft without pointer input', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible();
  await page.getByLabel('Project name').focus();
  await expect(page.getByLabel('Project name')).toBeFocused();
  await page.keyboard.type('Keyboard workflow fixture');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Create project' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#project-id')).not.toBeEmpty();
  await page.locator('#field-business-name').focus();
  await page.keyboard.type('Keyboard entered business');
  await page.getByRole('button', { name: 'Save draft' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').first()).toContainText('Draft saved as version 1');
});

test('named approver reviews the frozen page and the URL grants no access by itself', async ({ page, context }) => {
  const projectId = await createProject(page, 'Private review browser fixture');
  await fillStorefront(page, { services: ['Review only service'] });
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status').first()).toContainText('Draft saved as version 1');
  await page.getByLabel('Reviewer name 1').fill('Morgan Owner');
  await page.getByLabel('Reviewer email 1').fill('morgan@example.test');
  await page.getByRole('button', { name: 'Start review' }).click();
  await expect(page.getByText(/Review round 1 created/)).toBeVisible();
  const href = await page.getByRole('link', { name: 'Open review URL' }).getAttribute('href');
  expect(href).toMatch(/^\/r\//);
  expect(href).not.toContain('grant');
  expect(href).not.toContain('token');

  const anonymous = await context.newPage();
  const denied = await anonymous.goto(href!);
  expect(denied?.status()).toBe(401);
  await expect(anonymous.getByText('Authentication required.')).toBeVisible();
  await anonymous.close();

  await context.addCookies([{ name: 'fixture_reviewer_email', value: 'morgan@example.test', url: 'http://127.0.0.1:4321' }]);
  const reviewResponse = await page.goto(href!);
  expect(reviewResponse?.status()).toBe(200);
  expect(reviewResponse?.headers()['cache-control']).toContain('no-store');
  expect(reviewResponse?.headers()['x-robots-tag']).toContain('noindex');
  expect(reviewResponse?.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page.getByRole('heading', { name: 'Review this frozen page' })).toBeVisible();
  await expect(page.locator('.landing h1')).toHaveText('Harbor & Pine');
  await expect(page.locator('.landing .primary-action')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.landing .primary-action')).not.toHaveAttribute('href', /.+/);
  await page.getByRole('button', { name: 'Approve this revision' }).click();
  await expect(page.getByRole('heading', { name: 'Decision recorded: approved' })).toBeVisible();
  expect(page.url().includes('decision=approved')).toBe(true);

  await page.goto('/');
  await page.getByLabel('Project ID').fill(projectId);
  await page.getByRole('button', { name: 'Load saved draft' }).click();
  await expect(page.getByRole('button', { name: 'Start review' })).toBeEnabled();
  await page.getByLabel('Reviewer name 1').fill('Casey Reviewer');
  await page.getByLabel('Reviewer email 1').fill('casey@example.test');
  await page.locator('#reviewer-role-0').selectOption('viewer');
  await page.getByRole('button', { name: 'Start review' }).click();
  await expect(page.getByText(/Review round 2 created/)).toBeVisible();
  const secondHref = await page.getByRole('link', { name: 'Open review URL' }).getAttribute('href');
  await context.addCookies([{ name: 'fixture_reviewer_email', value: 'casey@example.test', url: 'http://127.0.0.1:4321' }]);
  const viewerResponse = await page.goto(secondHref!);
  expect(viewerResponse?.status()).toBe(200);
  await expect(page.getByText('You have view access. An approver must record a decision.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve this revision' })).toHaveCount(0);
  await context.addCookies([{ name: 'fixture_reviewer_email', value: 'morgan@example.test', url: 'http://127.0.0.1:4321' }]);
  await page.goto(href!);
  await expect(page.getByText('This review is not available for this signed-in identity.')).toBeVisible();
});

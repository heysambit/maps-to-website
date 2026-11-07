export type SiteType = 'storefront' | 'service-area';
export type ThemeName = 'coast' | 'grove';

export interface Provenance {
  sourceKind: string;
  sourceRef?: string;
  checkedAt?: string;
  checkedBy?: string;
}

export interface Fact<T = string> {
  value: T;
  provenance?: Provenance;
}

export interface ContactAction {
  type: string;
  label: string;
  href: string;
  provenance?: Provenance;
}

export interface MediaAsset {
  src: string;
  alt: string;
  width: number;
  height: number;
  rights?: { status: string; basis?: string; creator?: string };
}

export interface Draft {
  schemaVersion: number;
  projectId: string;
  version: number;
  siteType: SiteType;
  theme: ThemeName;
  businessName?: Fact;
  serviceSummary?: Fact;
  locality?: Fact;
  address?: Fact;
  privateAddress?: Fact;
  serviceArea?: Fact;
  contact?: ContactAction;
  services?: Fact[];
  about?: Fact;
  hours?: Fact;
  testimonials?: Fact[];
  assets?: MediaAsset[];
}

export type DeepReadonly<T> = T extends readonly unknown[]
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export interface Revision {
  readonly id: string;
  readonly projectId: string;
  readonly version: number;
  readonly schemaVersion: 1;
  readonly templateVersion: 'm1';
  readonly hash: string;
  readonly content: DeepReadonly<Draft>;
}

export interface RenderModel {
  projectId: string;
  siteType: SiteType;
  theme: ThemeName;
  businessName: string;
  serviceSummary: string;
  locality: string;
  address?: string;
  serviceArea?: string;
  contact: Pick<ContactAction, 'type' | 'label' | 'href'>;
  services: string[];
  about?: string;
  hours?: string;
  testimonials: string[];
  assets: Array<Pick<MediaAsset, 'src' | 'alt' | 'width' | 'height'>>;
}

export type ReleaseStatus = 'queued' | 'building' | 'scanning' | 'ready' | 'deploying' | 'unknown' | 'needs_reconciliation' | 'verifying' | 'live' | 'failed' | 'rolling_back' | 'rolled_back' | 'takedown_pending' | 'taken_down';
export type PaymentStatus = 'missing' | 'verified' | 'reversed';
export interface ReleaseAssetDigest {
  digest: string;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  size: number;
  width: number;
  height: number;
  rightsNotice: string;
}
export interface ReleaseBundle {
  schemaVersion: 1;
  releaseId: string;
  projectId: string;
  targetHostname: string;
  revisionId: string;
  revisionHash: string;
  rendererVersion: string;
  templateVersion: string;
  content: RenderModel;
  assets: ReleaseAssetDigest[];
  createdAt: string;
  bundleHash: string;
}
export interface ReleaseGateInput {
  paymentStatus: PaymentStatus | string;
  paymentReference?: string;
  authorityVerified: boolean;
  authorityReference?: string;
  hostnameVerified: boolean;
  hostnameEvidence?: string;
  targetHostname: string;
  allowedHostnames: readonly string[];
  expectedTargetHostname?: string;
  reviewStatus: string;
  reviewRevisionId: string;
  revisionId: string;
  reviewExpiresAt: string;
  reviewRevoked: boolean;
  rightsVerified: boolean;
  bundleIntegrityVerified: boolean;
  rendererVersion: string;
  supportedRendererVersions: readonly string[];
  now?: number;
}
export interface ReleaseGateIssue { code: string; field: string; message: string }

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
  severity: 'save' | 'share';
}

export interface DraftValidation {
  savable: boolean;
  shareable: boolean;
  issues: ValidationIssue[];
}

export class DraftValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super('Draft cannot be sealed as a shareable revision.');
    this.name = 'DraftValidationError';
  }
}

const recognizedSources = new Set(['owner', 'independent']);
const factFields = [
  'businessName', 'serviceSummary', 'locality', 'address',
  'serviceArea', 'about', 'hours',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function validContact(action: ContactAction): boolean {
  if (action.type === 'phone') return /^tel:\+[1-9]\d{7,14}$/.test(action.href);
  if (action.type === 'website') return isHttpUrl(action.href) !== null;
  if (action.type === 'directions') {
    const url = isHttpUrl(action.href);
    return url !== null && ['www.google.com', 'maps.google.com'].includes(url.hostname) && url.pathname.startsWith('/maps/');
  }
  return false;
}

function validateProvenance(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
  requireIndependent = true,
): void {
  if (value === undefined) {
    if (requireIndependent) issues.push({ field, code: 'independent_source_required', message: 'Add an independently checked source reference, date, and actor before sharing.', severity: 'share' });
    return;
  }
  if (!isRecord(value) || typeof value.sourceKind !== 'string') {
    issues.push({ field, code: 'invalid_source', message: 'Source information is malformed.', severity: 'save' });
    return;
  }
  if (!recognizedSources.has(value.sourceKind)) {
    issues.push({ field, code: 'unknown_source', message: 'This source type is not supported.', severity: 'save' });
  } else if (requireIndependent && (value.sourceKind !== 'independent' || !nonEmpty(value.sourceRef) || !validTimestamp(value.checkedAt) || !nonEmpty(value.checkedBy))) {
    issues.push({ field, code: 'independent_source_required', message: 'Add an independently checked source reference, date, and actor before sharing.', severity: 'share' });
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validTimestamp(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validateFact(value: unknown, field: string, issues: ValidationIssue[], requireIndependent = true): void {
  if (value === undefined) return;
  if (!isRecord(value) || typeof value.value !== 'string') {
    issues.push({ field, code: 'invalid_fact', message: 'Fact must contain text.', severity: 'save' });
    return;
  }
  if (value.value.trim()) validateProvenance(value.provenance, field, issues, requireIndependent);
  else if (value.provenance !== undefined) validateProvenance(value.provenance, field, issues, false);
}

function validateAsset(value: unknown, index: number, issues: ValidationIssue[]): void {
  const field = `assets.${index}`;
  if (!isRecord(value) || typeof value.src !== 'string' || typeof value.alt !== 'string' || !Number.isSafeInteger(value.width) || Number(value.width) < 1 || !Number.isSafeInteger(value.height) || Number(value.height) < 1) {
    issues.push({ field, code: 'invalid_asset', message: 'Asset details are malformed.', severity: 'save' });
    return;
  }
  let path: string;
  try {
    path = decodeURIComponent(value.src);
  } catch {
    issues.push({ field, code: 'unsafe_asset_path', message: 'Asset path is invalid.', severity: 'save' });
    return;
  }
  if (!path.startsWith('/assets/') || path.startsWith('//') || path.split('/').includes('..')) {
    issues.push({ field, code: 'unsafe_asset_path', message: 'Only local asset paths can render.', severity: 'save' });
  }
  if (!isRecord(value.rights) || !['cleared', 'pending', 'restricted'].includes(String(value.rights.status))) {
    issues.push({ field, code: 'invalid_rights', message: 'Asset rights status is required.', severity: 'save' });
  } else if (value.rights.status !== 'cleared' || !nonEmpty(value.rights.basis)) {
    issues.push({ field, code: 'rights_not_cleared', message: 'Clear asset rights before sharing.', severity: 'share' });
  }
}

export function validateDraft(input: unknown): DraftValidation {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return { savable: false, shareable: false, issues: [{ field: 'draft', code: 'invalid_draft', message: 'Draft must be an object.', severity: 'save' }] };
  }
  if (input.schemaVersion !== 1) issues.push({ field: 'schemaVersion', code: 'unsupported_schema', message: 'Draft schema version is not supported.', severity: 'save' });
  if (!nonEmpty(input.projectId) || input.projectId.length > 128) issues.push({ field: 'projectId', code: 'invalid_project', message: 'Project ID is required.', severity: 'save' });
  if (!Number.isSafeInteger(input.version) || Number(input.version) < 0) issues.push({ field: 'version', code: 'invalid_version', message: 'Draft version must be a non-negative integer.', severity: 'save' });
  if (input.siteType !== 'storefront' && input.siteType !== 'service-area') issues.push({ field: 'siteType', code: 'invalid_site_type', message: 'Choose a supported site type.', severity: 'save' });
  if (input.theme !== 'coast' && input.theme !== 'grove') issues.push({ field: 'theme', code: 'invalid_theme', message: 'Choose a supported theme.', severity: 'save' });

  for (const field of factFields) validateFact(input[field], field, issues);
  validateFact(input.privateAddress, 'privateAddress', issues, false);
  for (const field of ['services', 'testimonials'] as const) {
    if (input[field] !== undefined) {
      if (!Array.isArray(input[field])) issues.push({ field, code: 'invalid_list', message: 'This section must be a list.', severity: 'save' });
      else input[field].forEach((fact, index) => validateFact(fact, `${field}.${index}`, issues));
    }
  }
  if (input.contact !== undefined) {
    const contact = input.contact;
    if (!isRecord(contact) || typeof contact.type !== 'string' || !nonEmpty(contact.label) || typeof contact.href !== 'string') {
      issues.push({ field: 'contact', code: 'invalid_contact', message: 'Contact action is malformed.', severity: 'save' });
    } else {
      if (!validContact(contact as unknown as ContactAction)) issues.push({ field: 'contact.href', code: 'unsafe_destination', message: 'Use a valid phone, HTTPS, or approved Maps destination.', severity: 'save' });
      if (contact.type === 'directions' && input.siteType !== 'storefront') issues.push({ field: 'contact', code: 'directions_not_allowed', message: 'Service-area pages cannot show storefront directions.', severity: 'save' });
      validateProvenance(contact.provenance, 'contact', issues);
    }
  }
  if (input.assets !== undefined) {
    if (!Array.isArray(input.assets)) issues.push({ field: 'assets', code: 'invalid_assets', message: 'Assets must be a list.', severity: 'save' });
    else input.assets.forEach((asset, index) => validateAsset(asset, index, issues));
  }

  const shareIssues = (field: string, message: string) => issues.push({ field, code: 'required_for_sharing', message, severity: 'share' });
  for (const field of ['businessName', 'serviceSummary', 'locality'] as const) {
    const value = input[field];
    if (!isRecord(value) || !nonEmpty(value.value)) shareIssues(field, `${field} is required before sharing.`);
  }
  if (input.siteType === 'storefront' && (!isRecord(input.address) || !nonEmpty(input.address.value))) shareIssues('address', 'A storefront address is required before sharing.');
  if (input.siteType === 'service-area' && (!isRecord(input.serviceArea) || !nonEmpty(input.serviceArea.value))) shareIssues('serviceArea', 'A service area is required before sharing.');
  if (!isRecord(input.contact)) shareIssues('contact', 'At least one contact action is required before sharing.');
  if (isRecord(input.privateAddress) && nonEmpty(input.privateAddress.value) && input.siteType !== 'service-area') {
    // Private addresses are only permitted as hidden intake data for service-area projects.
    issues.push({ field: 'privateAddress', code: 'private_address_scope', message: 'Private address is only valid for a service-area draft.', severity: 'save' });
  }

  const shareable = issues.length === 0;
  return { savable: !issues.some((issue) => issue.severity === 'save'), shareable, issues };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export async function sha256Canonical(value: unknown): Promise<string> {
  return digest(value);
}

export function isValidTargetHostname(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 253 || value !== value.trim() || value !== value.toLowerCase()) return false;
  if (!value || value.endsWith('.') || value.includes('://') || value.includes('/') || value.includes(':')) return false;
  if (/^\d+(?:\.\d+){3}$/.test(value) || value === 'localhost') return false;
  return value.split('.').every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}

export function validateReleaseGates(input: ReleaseGateInput): ReleaseGateIssue[] {
  const issues: ReleaseGateIssue[] = [];
  const add = (code: string, field: string, message: string) => issues.push({ code, field, message });
  if (input.paymentStatus === 'missing') add('payment_missing', 'paymentStatus', 'Verified payment evidence is required before release.');
  else if (input.paymentStatus === 'reversed') add('payment_reversed', 'paymentStatus', 'A reversed payment cannot authorize release.');
  else if (input.paymentStatus !== 'verified' || !nonEmpty(input.paymentReference)) add('payment_unverified', 'paymentReference', 'Provide a payment reference recorded as verified.');
  if (!input.authorityVerified || !nonEmpty(input.authorityReference)) add('authority_missing', 'authorityReference', 'Documented publication authority is required.');
  if (!input.hostnameVerified || !nonEmpty(input.hostnameEvidence)) add('hostname_unverified', 'hostnameEvidence', 'Record verified authorization for the target hostname.');
  if (!isValidTargetHostname(input.targetHostname) || !input.allowedHostnames.includes(input.targetHostname)) add('hostname_not_allowed', 'targetHostname', 'The target hostname is invalid or outside the allowed host list.');
  if (input.expectedTargetHostname && input.targetHostname !== input.expectedTargetHostname) add('hostname_mismatch', 'targetHostname', 'The release target differs from the authorized project hostname.');
  if (input.reviewStatus === 'superseded') add('review_superseded', 'reviewId', 'A superseded review cannot authorize release.');
  else if (input.reviewStatus === 'revoked' || input.reviewRevoked) add('review_revoked', 'reviewId', 'A revoked review cannot authorize release.');
  else if (input.reviewStatus === 'expired' || !Number.isFinite(Date.parse(input.reviewExpiresAt)) || Date.parse(input.reviewExpiresAt) <= (input.now ?? Date.now())) add('review_expired', 'reviewId', 'The review approval has expired.');
  else if (input.reviewStatus !== 'approved') add('review_not_approved', 'reviewId', 'An exact-revision approval is required.');
  if (input.reviewRevisionId !== input.revisionId) add('approval_revision_mismatch', 'revisionId', 'The approval does not match the requested revision.');
  if (!input.rightsVerified) add('rights_unverified', 'assets', 'Every asset must have verified publication rights and a matching digest.');
  if (!input.bundleIntegrityVerified) add('bundle_tampered', 'bundleHash', 'The sealed bundle integrity check failed.');
  if (!input.supportedRendererVersions.includes(input.rendererVersion)) add('renderer_unsupported', 'rendererVersion', 'The bundle renderer version is not allowed.');
  return issues;
}

const releaseTransitions: Record<ReleaseStatus, readonly ReleaseStatus[]> = {
  queued: ['building', 'failed'],
  building: ['scanning', 'failed'],
  scanning: ['ready', 'failed'],
  ready: ['deploying', 'failed'],
  deploying: ['verifying', 'unknown', 'failed', 'needs_reconciliation'],
  unknown: ['needs_reconciliation'],
  needs_reconciliation: ['verifying', 'ready', 'failed'],
  verifying: ['live', 'failed', 'needs_reconciliation'],
  live: ['rolling_back', 'takedown_pending'],
  failed: [],
  rolling_back: ['rolled_back', 'needs_reconciliation', 'failed'],
  rolled_back: ['rolling_back', 'takedown_pending'],
  takedown_pending: ['taken_down', 'needs_reconciliation', 'failed'],
  taken_down: [],
};

export function canTransitionRelease(from: string, to: string): boolean {
  return Object.hasOwn(releaseTransitions, from) && releaseTransitions[from as ReleaseStatus].includes(to as ReleaseStatus);
}

export function assertReleaseTransition(from: string, to: string): asserts to is ReleaseStatus {
  if (!canTransitionRelease(from, to)) throw new Error(`Invalid release transition: ${from} -> ${to}`);
}

export async function createReleaseBundle(input: {
  releaseId: string;
  revision: Revision;
  content: RenderModel;
  targetHostname: string;
  rendererVersion: string;
  assets: ReleaseAssetDigest[];
  createdAt?: string;
}): Promise<ReleaseBundle> {
  if (!isValidTargetHostname(input.targetHostname)) throw new Error('Invalid release hostname.');
  if (input.content.projectId !== input.revision.projectId || !validContact(input.content.contact as ContactAction)) throw new Error('Release render model is invalid or unsafe.');
  const expectedAssets = input.content.assets.map((asset) => {
    const match = /^\/assets\/([a-f0-9]{64})$/.exec(asset.src);
    if (!match) throw new Error('Release assets must use content-addressed SHA-256 paths.');
    return match[1];
  }).sort();
  for (const asset of input.assets) {
    if (!/^[a-f0-9]{64}$/.test(asset.digest) || !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mime) || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 5 * 1024 * 1024 || !Number.isSafeInteger(asset.width) || asset.width < 1 || !Number.isSafeInteger(asset.height) || asset.height < 1 || asset.width * asset.height > 20_000_000 || !nonEmpty(asset.rightsNotice) || asset.rightsNotice.length > 500) throw new Error('Release asset manifest contains invalid metadata.');
  }
  const suppliedAssets = input.assets.map((asset) => asset.digest).sort();
  if (new Set(suppliedAssets).size !== suppliedAssets.length || JSON.stringify(expectedAssets) !== JSON.stringify(suppliedAssets)) throw new Error('Release asset manifest does not match the revision.');
  if (input.revision.id !== `${input.revision.projectId}:v${input.revision.version}` || input.content.projectId !== input.revision.projectId) throw new Error('Release content scope does not match the frozen revision.');
  const content: RenderModel = {
    projectId: input.content.projectId,
    siteType: input.content.siteType,
    theme: input.content.theme,
    businessName: input.content.businessName,
    serviceSummary: input.content.serviceSummary,
    locality: input.content.locality,
    ...(input.content.siteType === 'storefront' && input.content.address ? { address: input.content.address } : {}),
    ...(input.content.siteType === 'service-area' && input.content.serviceArea ? { serviceArea: input.content.serviceArea } : {}),
    contact: { type: input.content.contact.type, label: input.content.contact.label, href: input.content.contact.href },
    services: input.content.services.slice(),
    ...(input.content.about ? { about: input.content.about } : {}),
    ...(input.content.hours ? { hours: input.content.hours } : {}),
    testimonials: input.content.testimonials.slice(),
    assets: input.content.assets.map(({ src, alt, width, height }) => ({ src, alt, width, height })),
  };
  const bundleWithoutHash = {
    schemaVersion: 1 as const,
    releaseId: input.releaseId,
    projectId: input.revision.projectId,
    targetHostname: input.targetHostname,
    revisionId: input.revision.id,
    revisionHash: input.revision.hash,
    rendererVersion: input.rendererVersion,
    templateVersion: input.revision.templateVersion,
    content,
    assets: input.assets.slice().sort((a, b) => a.digest.localeCompare(b.digest)),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  return { ...bundleWithoutHash, bundleHash: await sha256Canonical(bundleWithoutHash) };
}

export async function verifyReleaseBundle(value: unknown): Promise<boolean> {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.releaseId !== 'string' || typeof value.projectId !== 'string' || typeof value.revisionId !== 'string' || typeof value.revisionHash !== 'string' || typeof value.bundleHash !== 'string' || !isValidTargetHostname(value.targetHostname) || !isRecord(value.content) || !Array.isArray(value.assets)) return false;
  const { bundleHash, ...unsealed } = value;
  if ((unsealed.content as Record<string, unknown>).projectId !== value.projectId || value.revisionId.split(':v')[0] !== value.projectId) return false;
  try {
    const content = value.content as Record<string, unknown>;
    const allowedContentKeys = new Set(['projectId','siteType','theme','businessName','serviceSummary','locality','address','serviceArea','contact','services','about','hours','testimonials','assets']);
    if (Object.keys(content).some((key) => !allowedContentKeys.has(key)) || (content.siteType !== 'storefront' && content.siteType !== 'service-area') || (content.theme !== 'coast' && content.theme !== 'grove') || !Array.isArray(content.assets) || !Array.isArray(content.services) || !Array.isArray(content.testimonials)) return false;
    const model = content as unknown as RenderModel;
    if (!validContact(model.contact as ContactAction) || (model.siteType === 'storefront' && model.serviceArea !== undefined) || (model.siteType === 'service-area' && model.address !== undefined)) return false;
    const expectedAssets = model.assets.map((asset) => /^\/assets\/([a-f0-9]{64})$/.exec(asset.src)?.[1]).sort();
    const descriptors = value.assets as ReleaseAssetDigest[];
    if (descriptors.some((asset) => !asset || !/^[a-f0-9]{64}$/.test(asset.digest) || !['image/jpeg','image/png','image/webp'].includes(asset.mime) || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 5 * 1024 * 1024 || !Number.isSafeInteger(asset.width) || asset.width < 1 || !Number.isSafeInteger(asset.height) || asset.height < 1 || asset.width * asset.height > 20_000_000 || !nonEmpty(asset.rightsNotice) || asset.rightsNotice.length > 500)) return false;
    const actualAssets = descriptors.map((asset) => asset.digest).sort();
    if (expectedAssets.some((digest) => !digest) || JSON.stringify(expectedAssets) !== JSON.stringify(actualAssets)) return false;
    return await sha256Canonical(unsealed) === bundleHash;
  } catch { return false; }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sealRevision(draft: Draft): Promise<Revision> {
  const validation = validateDraft(draft);
  if (!validation.shareable) throw new DraftValidationError(validation.issues);
  const content = JSON.parse(canonicalJson(draft)) as Draft;
  return deepFreeze({
    id: `${draft.projectId}:v${draft.version}`,
    projectId: draft.projectId,
    version: draft.version,
    schemaVersion: 1,
    templateVersion: 'm1',
    hash: await digest(content),
    content: deepFreeze(content),
  });
}

export async function toRenderModel(revision: Revision): Promise<RenderModel> {
  const validation = validateDraft(revision.content);
  if (!validation.shareable || revision.projectId !== revision.content.projectId || revision.version !== revision.content.version || revision.hash !== await digest(revision.content)) {
    throw new DraftValidationError(validation.issues.length ? validation.issues : [{ field: 'revision', code: 'invalid_revision', message: 'Revision integrity check failed.', severity: 'save' }]);
  }
  const draft = revision.content;
  const factValue = (fact?: Fact): string | undefined => fact?.value.trim() || undefined;
  return {
    projectId: draft.projectId,
    siteType: draft.siteType,
    theme: draft.theme,
    businessName: factValue(draft.businessName)!,
    serviceSummary: factValue(draft.serviceSummary)!,
    locality: factValue(draft.locality)!,
    ...(draft.siteType === 'storefront' ? { address: factValue(draft.address) } : { serviceArea: factValue(draft.serviceArea) }),
    contact: { type: draft.contact!.type, label: draft.contact!.label, href: draft.contact!.href },
    services: (draft.services ?? []).map((fact) => fact.value.trim()).filter(Boolean),
    about: factValue(draft.about),
    hours: factValue(draft.hours),
    testimonials: (draft.testimonials ?? []).map((fact) => fact.value.trim()).filter(Boolean),
    assets: (draft.assets ?? []).map(({ src, alt, width, height }) => ({ src, alt, width, height })),
  };
}

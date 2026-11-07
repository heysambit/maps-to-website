import { describe, expect, it } from 'vitest';
import {
  DraftValidationError,
  sealRevision,
  toRenderModel,
  validateDraft,
  type Draft,
  type Revision,
} from '../../packages/contracts/src/index';
import { incompleteDraft, serviceAreaDraft, storefrontDraft } from '../fixtures/drafts';

describe('manual draft contracts', () => {
  it('allows an incomplete draft to be saved while keeping it unshareable', () => {
    const result = validateDraft(incompleteDraft);
    expect(result.savable).toBe(true);
    expect(result.shareable).toBe(false);
    expect(result.issues.map((issue) => issue.field)).toContain('businessName');
  });

  it('seals only complete drafts whose populated facts have independent provenance', async () => {
    const revision = await sealRevision(storefrontDraft);
    expect(revision).toMatchObject({ projectId: storefrontDraft.projectId, version: storefrontDraft.version, templateVersion: 'm1' });
    expect(Object.isFrozen(revision)).toBe(true);
    expect(Object.isFrozen(revision.content.businessName)).toBe(true);
    const ownerSourced = structuredClone(storefrontDraft) as Draft;
    ownerSourced.businessName!.provenance!.sourceKind = 'owner';
    await expect(sealRevision(ownerSourced)).rejects.toBeInstanceOf(DraftValidationError);
  });

  it('refuses an unknown source type at the boundary', async () => {
    const unknownSource = structuredClone(storefrontDraft) as Draft;
    unknownSource.businessName!.provenance!.sourceKind = 'google-result';
    expect(validateDraft(unknownSource).savable).toBe(false);
    await expect(sealRevision(unknownSource)).rejects.toBeInstanceOf(DraftValidationError);
    const emptyUnknownSource = structuredClone(storefrontDraft) as Draft;
    emptyUnknownSource.about = { value: '', provenance: { sourceKind: 'legacy' } };
    await expect(sealRevision(emptyUnknownSource)).rejects.toBeInstanceOf(DraftValidationError);
  });

  it('refuses media without cleared rights', async () => {
    const draft = { ...storefrontDraft, assets: [{ src: '/assets/fixture.jpg', alt: 'Garden', width: 800, height: 600, rights: { status: 'pending' } }] } as Draft;
    await expect(sealRevision(draft)).rejects.toBeInstanceOf(DraftValidationError);
  });

  it('rejects unsafe contact destinations before they can render', async () => {
    const unsafe = structuredClone(storefrontDraft) as Draft;
    unsafe.contact!.href = 'javascript:alert(1)';
    expect(validateDraft(unsafe).savable).toBe(false);
    await expect(sealRevision(unsafe)).rejects.toBeInstanceOf(DraftValidationError);
    const tamperedRevision = structuredClone(await sealRevision(storefrontDraft)) as unknown as Revision & { content: Draft };
    tamperedRevision.content.contact!.href = 'javascript:alert(1)';
    await expect(toRenderModel(tamperedRevision)).rejects.toBeInstanceOf(DraftValidationError);
  });

  it('maps storefront address and directions without exposing provenance', async () => {
    const model = await toRenderModel(await sealRevision(storefrontDraft));
    expect(model).toMatchObject({
      siteType: 'storefront',
      address: '123 Example Street, Portland, ME',
      contact: { type: 'directions' },
    });
    expect(JSON.stringify(model)).not.toContain('fixture://');
  });

  it('omits a service-area business private address from the render model', async () => {
    const model = await toRenderModel(await sealRevision(serviceAreaDraft));
    expect(model.siteType).toBe('service-area');
    expect(model.serviceArea).toBe('Portland and nearby coastal communities');
    expect(model.address).toBeUndefined();
    expect(JSON.stringify(model)).not.toContain('PRIVATE ADDRESS SENTINEL');
  });
});

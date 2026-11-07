import type { Draft, Fact } from '../../packages/contracts/src/index';

const provenance = {
  sourceKind: 'independent',
  sourceRef: 'fixture://independent-records/verified-by-operator',
  checkedAt: '2026-11-06T10:00:00.000Z',
  checkedBy: 'fixture-operator',
};

const fact = (value: string): Fact => ({ value, provenance });

export const storefrontDraft: Draft = {
  schemaVersion: 1,
  projectId: 'fixture-storefront',
  version: 1,
  siteType: 'storefront',
  theme: 'coast',
  businessName: fact('Harbor & Pine'),
  serviceSummary: fact('Thoughtful garden care for homes around the bay.'),
  locality: fact('Portland, Maine'),
  address: fact('123 Example Street, Portland, ME'),
  contact: {
    type: 'directions',
    label: 'Get directions',
    href: 'https://www.google.com/maps/dir/?api=1&destination=123%20Example%20Street%2C%20Portland%2C%20ME',
    provenance,
  },
  services: [fact('Seasonal garden care'), fact('Native planting')],
  about: fact('A synthetic local garden studio fixture.'),
};

export const serviceAreaDraft: Draft = {
  schemaVersion: 1,
  projectId: 'fixture-service-area',
  version: 1,
  siteType: 'service-area',
  theme: 'grove',
  businessName: fact('Northstar Home Care'),
  serviceSummary: fact('Reliable home repairs across the peninsula.'),
  locality: fact('Portland, Maine'),
  serviceArea: fact('Portland and nearby coastal communities'),
  privateAddress: fact('PRIVATE ADDRESS SENTINEL: 99 Secret Lane'),
  contact: { type: 'phone', label: 'Call Northstar', href: 'tel:+12075550192', provenance },
};

export const incompleteDraft: Draft = {
  schemaVersion: 1,
  projectId: 'project-incomplete',
  version: 0,
  siteType: 'storefront',
  theme: 'coast',
};

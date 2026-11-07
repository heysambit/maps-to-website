import { describe, expect, it } from 'vitest';
import { FIXTURE_IDENTITY, resolveIdentity } from '../../apps/builder/src/lib/identity';

describe('fixture identity deployment guard', () => {
  it('provides only the synthetic local identity and refuses deployable environments', () => {
    expect(resolveIdentity('development')).toEqual({ id: FIXTURE_IDENTITY, kind: 'fixture' });
    expect(resolveIdentity('production')).toBeNull();
    expect(resolveIdentity('staging')).toBeNull();
    expect(resolveIdentity(undefined)).toBeNull();
  });
});

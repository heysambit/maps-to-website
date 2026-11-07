export class FakeDeploymentProvider {
  constructor(options?: { timeoutAfterApply?: boolean; versionOverride?: string | null });
  current: null | { releaseId: string | null; targetHostname: string; version: string; marker: string };
  versions: Array<{ releaseId: string | null; targetHostname: string; version: string; marker: string }>;
  deploy(bundle: { releaseId: string; targetHostname: string; bundleHash: string }, artifact: { buildHash: string }): Promise<{ releaseId: string; targetHostname: string; version: string; marker: string }>;
  inspect(hostname: string): Promise<{ releaseId: string | null; targetHostname: string; version: string; marker: string } | null>;
  rollback(hostname: string, prior: { releaseId: string; targetHostname: string; version: string; marker: string } | null): Promise<{ releaseId: string | null; targetHostname: string; version: string; marker: string }>;
}
export function verifyProviderVersion(result: unknown, bundle: { releaseId: string; targetHostname: string; bundleHash: string }, expectedVersion?: string): boolean;

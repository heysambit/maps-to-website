export class FakeDeploymentProvider {
  constructor({ timeoutAfterApply = false, versionOverride = null } = {}) {
    this.current = null;
    this.versions = [];
    this.timeoutAfterApply = timeoutAfterApply;
    this.versionOverride = versionOverride;
  }
  async deploy(bundle, artifact) {
    const version = this.versionOverride || `fake-${bundle.releaseId}-${artifact.buildHash.slice(0, 12)}`;
    this.current = { releaseId: bundle.releaseId, targetHostname: bundle.targetHostname, version, marker: bundle.bundleHash };
    this.versions.push(this.current);
    if (this.timeoutAfterApply) { this.timeoutAfterApply = false; throw new Error('network-timeout-after-apply'); }
    return this.current;
  }
  async inspect(hostname) { return this.current?.targetHostname === hostname ? this.current : null; }
  async rollback(hostname, prior) {
    this.current = prior ? { ...prior, targetHostname: hostname } : { releaseId: null, targetHostname: hostname, version: 'fake-taken-down', marker: 'maintenance-deny' };
    return this.current;
  }
}

export function verifyProviderVersion(result, bundle, expectedVersion = undefined) {
  return Boolean(result && result.releaseId === bundle.releaseId && result.targetHostname === bundle.targetHostname && result.marker === bundle.bundleHash && typeof result.version === 'string' && result.version.length > 0 && (expectedVersion === undefined || result.version === expectedVersion));
}

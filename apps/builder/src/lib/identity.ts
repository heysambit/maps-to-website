export const FIXTURE_IDENTITY = "demo-operator";

export function isLoopbackUrl(value: string): boolean {
  try { return new Set(['127.0.0.1', 'localhost', '[::1]']).has(new URL(value).hostname); }
  catch { return false; }
}

export function resolveIdentity(environment: string | undefined): { id: string; kind: "fixture" } | null {
  if (environment !== "development") return null;
  return { id: FIXTURE_IDENTITY, kind: "fixture" };
}

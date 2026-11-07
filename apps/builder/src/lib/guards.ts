import { accessConfig, authorizeAccessRequest, sameOriginMutation, type AccessIdentity, type RuntimeAuthEnv } from './access';

export async function requireOperator(request: Request, env: RuntimeAuthEnv): Promise<AccessIdentity | null> {
  if (!sameOriginMutation(request, String(env.APP_ENV || ''))) return null;
  return authorizeAccessRequest(request, 'operator', accessConfig(env));
}

export async function requireReviewer(request: Request, env: RuntimeAuthEnv): Promise<AccessIdentity | null> {
  if (!sameOriginMutation(request, String(env.APP_ENV || ''))) return null;
  return authorizeAccessRequest(request, 'reviewer', accessConfig(env));
}

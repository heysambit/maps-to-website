import { isLoopbackUrl, resolveIdentity } from '../identity';

export function authorizePlacesRequest(request: Request, environment: string | undefined, token: string | undefined) {
  const identity = resolveIdentity(environment);
  if (!identity || !isLoopbackUrl(request.url) || !token || token.length < 24) return null;
  const supplied = request.headers.get('Authorization') || '';
  if (supplied !== `Bearer ${token}`) return null;
  return identity;
}

import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';
import { accessConfig, authorizeAccessRequest, type AccessRole } from './lib/access';
import { isLoopbackUrl } from './lib/identity';

function securityHeaders(response: Response, production: boolean): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (production) headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const path = new URL(context.request.url).pathname;
  if (/^\/api\/internal\/releases\/[a-f0-9-]{36}\/(bundle|state|rollback-target|assets\/[a-f0-9]{64})$/.test(path)) return securityHeaders(await next(), env.APP_ENV !== 'development');
  if (env.APP_ENV === 'development' && isLoopbackUrl(context.request.url) && !path.startsWith('/r/')) {
    return securityHeaders(await next(), false);
  }
  const reviewerRequest = /^\/r\//.test(path) || /^\/api\/reviews\/[^/]+\/decision$/.test(path);
  const role: AccessRole = reviewerRequest ? 'reviewer' : 'operator';
  const identity = await authorizeAccessRequest(context.request, role, accessConfig(env));
  if (!identity) {
    return securityHeaders(new Response('Authentication required.', { status: 401 }), env.APP_ENV !== 'development');
  }
  const response = await next();
  return securityHeaders(response, env.APP_ENV !== 'development');
});

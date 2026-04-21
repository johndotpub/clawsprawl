import { defineMiddleware } from 'astro:middleware';
import { createPrivateAuthRequiredResponse, isPrivateRouteAllowed } from './lib/auth/access';
import { randomUUID } from 'node:crypto';

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.url.pathname.startsWith('/api/private/')) {
    if (!isPrivateRouteAllowed(context.cookies)) {
      return createPrivateAuthRequiredResponse();
    }
  }

  const response = await next();

  const corsOrigin = import.meta.env.CORS_ALLOW_ORIGIN ?? '';
  if (corsOrigin) {
    response.headers.set('Access-Control-Allow-Origin', corsOrigin);
  }

  response.headers.set('X-Request-ID', randomUUID());
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()');

  if (context.url.pathname.startsWith('/api/')) {
    response.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  }

  return response;
});
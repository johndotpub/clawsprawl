import { defineMiddleware } from 'astro:middleware';
import { createPrivateAuthRequiredResponse, isPrivateRouteAllowed } from './lib/auth/access';

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.url.pathname.startsWith('/api/private/')) {
    if (!isPrivateRouteAllowed(context.cookies)) {
      return createPrivateAuthRequiredResponse();
    }
  }
  return next();
});
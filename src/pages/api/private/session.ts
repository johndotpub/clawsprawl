import type { APIRoute } from 'astro';
import {
  checkAuthRateLimit,
  clearPrivateViewSession,
  getAccessConfig,
  getAccessState,
  isPrivateViewConfigured,
  isValidPrivateToken,
  readBearerToken,
  recordAuthFailure,
  setPrivateViewSession,
} from '../../../lib/auth/access';

function getClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';
}

/** Create a private-view session from a validated ClawSprawl bearer token. */
export const POST: APIRoute = async ({ request, cookies }) => {
  const clientIp = getClientIp(request);
  if (!checkAuthRateLimit(clientIp)) {
    return new Response(JSON.stringify({ ok: false, error: 'rate-limited' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const accessState = getAccessState(cookies);
  if (accessState.insecureModeEnabled) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isPrivateViewConfigured()) {
    return new Response(JSON.stringify({ ok: false, error: 'private-view-disabled' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeaderToken = readBearerToken(request);

  let resolvedToken: string | undefined;
  if (authHeaderToken) {
    resolvedToken = authHeaderToken;
  } else {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid-content-type' }), {
        status: 415,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    resolvedToken = await request.json()
      .catch(() => ({}))
      .then((r: { token?: unknown }) => typeof r.token === 'string' ? r.token : undefined);
  }

  if (!isValidPrivateToken(resolvedToken)) {
    recordAuthFailure(clientIp);
    return new Response(JSON.stringify({ ok: false, error: 'invalid-token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  setPrivateViewSession(cookies);
  const expiresInSeconds = getAccessConfig().sessionMaxAgeHours * 3600;
  return new Response(JSON.stringify({ ok: true, expiresInSeconds }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

/** Clear the authenticated private-view session cookie. */
export const DELETE: APIRoute = async ({ cookies }) => {
  clearPrivateViewSession(cookies);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

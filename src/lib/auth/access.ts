/**
 * Access-mode and private-session auth helpers for dashboard API routes.
 *
 * Security model:
 * - `public` mode exposes only `/api/public/*`
 * - `token` mode requires bearer bootstrap then server-backed private session
 * - `insecure` mode auto-allows private routes for private-network deployments
 */
import type { AstroCookies } from 'astro';
import { randomUUID, timingSafeEqual, createHash } from 'node:crypto';

export const PRIVATE_SESSION_COOKIE = 'clawsprawl_private_session';
export const DEFAULT_SESSION_MAX_AGE_HOURS = 24;
export const MAX_SESSION_MAX_AGE_HOURS = 24;

export type ClawSprawlMode = 'public' | 'token' | 'insecure';

export interface AccessConfig {
  mode: ClawSprawlMode;
  privateToken: string | null;
  sessionMaxAgeHours: number;
}

export interface PrivateSessionRecord {
  id: string;
  expiresAt: number;
  createdAt: number;
}

export interface AccessState {
  mode: ClawSprawlMode;
  privateConfigured: boolean;
  privateViewEnabled: boolean;
  tokenModeEnabled: boolean;
  insecureModeEnabled: boolean;
  sessionMaxAgeHours: number;
}

const privateSessions = new Map<string, PrivateSessionRecord>();
const MAX_SESSIONS = 10_000;
const SESSION_PRUNE_INTERVAL_MS = 5 * 60 * 1000;

const pruneInterval = setInterval(() => pruneExpiredPrivateSessions(), SESSION_PRUNE_INTERVAL_MS);
pruneInterval.unref?.();

function safeTokenEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

const AUTH_RATE_LIMIT_MAX_ATTEMPTS = 10;
const AUTH_RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000;
const authFailures = new Map<string, { count: number; lockedUntil: number }>();

export function checkAuthRateLimit(ip: string): boolean {
  const record = authFailures.get(ip);
  if (!record) return true;
  if (record.lockedUntil && Date.now() < record.lockedUntil) return false;
  return true;
}

export function recordAuthFailure(ip: string): void {
  const record = authFailures.get(ip) ?? { count: 0, lockedUntil: 0 };
  record.count++;
  if (record.count >= AUTH_RATE_LIMIT_MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + AUTH_RATE_LIMIT_LOCKOUT_MS;
  }
  authFailures.set(ip, record);
}

function normalizeMode(value: string | undefined): ClawSprawlMode {
  switch (value?.trim().toLowerCase()) {
    case 'token':
      return 'token';
    case 'insecure':
      return 'insecure';
    default:
      return 'public';
  }
}

function parseSessionMaxAgeHours(value: string | undefined): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_SESSION_MAX_AGE_HOURS;
  }
  return Math.min(MAX_SESSION_MAX_AGE_HOURS, Math.floor(numeric));
}

export function getAccessConfig(): AccessConfig {
  return {
    mode: normalizeMode(process.env.CLAWSPRAWL_MODE),
    privateToken: process.env.CLAWSPRAWL_PRIVATE_TOKEN?.trim() || null,
    sessionMaxAgeHours: parseSessionMaxAgeHours(process.env.CLAWSPRAWL_SESSION_MAX_AGE_HOURS),
  };
}

export function getAccessState(cookies: AstroCookies): AccessState {
  const config = getAccessConfig();
  const privateConfigured = config.mode === 'token' && Boolean(config.privateToken);
  const insecureModeEnabled = config.mode === 'insecure';
  const privateViewEnabled = insecureModeEnabled || hasPrivateViewSession(cookies);

  return {
    mode: config.mode,
    privateConfigured,
    privateViewEnabled,
    tokenModeEnabled: config.mode === 'token',
    insecureModeEnabled,
    sessionMaxAgeHours: config.sessionMaxAgeHours,
  };
}

export function getPrivateSessionCookieOptions() {
  return {
    httpOnly: true,
    // Keep secure cookies on in production; allow local HTTP dev ergonomics.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}

export function isPrivateViewConfigured(): boolean {
  const config = getAccessConfig();
  return config.mode === 'token' && Boolean(config.privateToken);
}

export function isInsecurePrivateModeEnabled(): boolean {
  return getAccessConfig().mode === 'insecure';
}

export function isPrivateRouteAllowed(cookies: AstroCookies): boolean {
  if (isInsecurePrivateModeEnabled()) return true;
  return hasPrivateViewSession(cookies);
}

export function isValidPrivateToken(token: string | undefined): boolean {
  const { mode, privateToken } = getAccessConfig();
  return mode === 'token' && Boolean(privateToken) && safeTokenEqual(token?.trim() ?? '', privateToken);
}

export function readBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get('authorization');
  if (!authorization) return undefined;
  const [scheme, value] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' ? value : undefined;
}

function pruneExpiredPrivateSessions(now = Date.now()): void {
  for (const [id, session] of privateSessions) {
    if (session.expiresAt <= now) privateSessions.delete(id);
  }
}

export function hasPrivateViewSession(cookies: AstroCookies): boolean {
  if (isInsecurePrivateModeEnabled()) return true;
  pruneExpiredPrivateSessions();
  const id = cookies.get(PRIVATE_SESSION_COOKIE)?.value;
  return Boolean(id && privateSessions.has(id));
}

export function setPrivateViewSession(cookies: AstroCookies): PrivateSessionRecord {
  pruneExpiredPrivateSessions();
  if (privateSessions.size >= MAX_SESSIONS) {
    throw new Error('Session store full');
  }
  const { sessionMaxAgeHours } = getAccessConfig();
  const now = Date.now();
  const session: PrivateSessionRecord = {
    id: randomUUID(),
    createdAt: now,
    expiresAt: now + sessionMaxAgeHours * 60 * 60 * 1000,
  };
  privateSessions.set(session.id, session);
  cookies.set(PRIVATE_SESSION_COOKIE, session.id, getPrivateSessionCookieOptions());
  return session;
}

export function clearPrivateViewSession(cookies: AstroCookies): void {
  const id = cookies.get(PRIVATE_SESSION_COOKIE)?.value;
  if (id) privateSessions.delete(id);
  cookies.delete(PRIVATE_SESSION_COOKIE, { path: '/' });
}

export function clearPrivateSessionsForTest(): void {
  privateSessions.clear();
}

export function createPrivateAuthRequiredResponse(): Response {
  return new Response(JSON.stringify({ ok: false, error: 'private-auth-required' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

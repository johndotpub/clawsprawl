import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkAuthRateLimit,
  clearPrivateSessionsForTest,
  clearPrivateViewSession,
  getAccessConfig,
  getAccessState,
  hasPrivateViewSession,
  isPrivateRouteAllowed,
  isValidPrivateToken,
  PRIVATE_SESSION_COOKIE,
  readBearerToken,
  recordAuthFailure,
  setPrivateViewSession,
} from './access';

function createCookies(initial = new Map<string, string>()) {
  const jar = new Map(initial);
  const optionsByName = new Map<string, unknown>();
  return {
    get: (name: string) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name: string, value: string, options?: unknown) => {
      jar.set(name, value);
      optionsByName.set(name, options);
    },
    delete: (name: string) => {
      jar.delete(name);
      optionsByName.delete(name);
    },
    jar,
    optionsByName,
  };
}

describe('access helpers', () => {
  beforeEach(() => {
    clearPrivateSessionsForTest();
    process.env.CLAWSPRAWL_MODE = 'token';
    process.env.CLAWSPRAWL_PRIVATE_TOKEN = 'private-token';
    delete process.env.CLAWSPRAWL_SESSION_MAX_AGE_HOURS;
  });

  it('parses access config with sane defaults', () => {
    expect(getAccessConfig()).toMatchObject({
      mode: 'token',
      privateToken: 'private-token',
      sessionMaxAgeHours: 24,
    });
  });

  it('validates bearer token input in token mode', () => {
    expect(isValidPrivateToken('private-token')).toBe(true);
    expect(isValidPrivateToken('wrong')).toBe(false);
    expect(readBearerToken(new Request('http://localhost', { headers: { authorization: 'Bearer abc' } }))).toBe('abc');
  });

  it('uses constant-time token comparison', () => {
    expect(isValidPrivateToken('private-token')).toBe(true);
    expect(isValidPrivateToken('PRIVATE-TOKEN')).toBe(false);
    expect(isValidPrivateToken('')).toBe(false);
    expect(isValidPrivateToken(undefined as unknown as string)).toBe(false);
  });

  it('creates and clears a server-backed private session', () => {
    const cookies = createCookies();
    expect(hasPrivateViewSession(cookies as any)).toBe(false);

    const session = setPrivateViewSession(cookies as any);
    expect(session.id).toBeTruthy();
    expect(cookies.jar.get(PRIVATE_SESSION_COOKIE)).toBe(session.id);
    expect(cookies.optionsByName.get(PRIVATE_SESSION_COOKIE)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: expect.any(Number),
    });
    expect(hasPrivateViewSession(cookies as any)).toBe(true);
    expect(isPrivateRouteAllowed(cookies as any)).toBe(true);

    clearPrivateViewSession(cookies as any);
    expect(hasPrivateViewSession(cookies as any)).toBe(false);
  });

  it('clamps session max age to 24 hours', () => {
    process.env.CLAWSPRAWL_SESSION_MAX_AGE_HOURS = '72';
    expect(getAccessConfig().sessionMaxAgeHours).toBe(24);
  });

  it('falls back to default session max age when invalid', () => {
    process.env.CLAWSPRAWL_SESSION_MAX_AGE_HOURS = 'not-a-number';
    expect(getAccessConfig().sessionMaxAgeHours).toBe(24);
  });

  it('treats insecure mode as auto-authorized private access', () => {
    process.env.CLAWSPRAWL_MODE = 'insecure';
    delete process.env.CLAWSPRAWL_PRIVATE_TOKEN;
    const cookies = createCookies();

    expect(getAccessState(cookies as any)).toMatchObject({
      mode: 'insecure',
      privateViewEnabled: true,
      insecureModeEnabled: true,
    });
    expect(isPrivateRouteAllowed(cookies as any)).toBe(true);
  });

  it('rate limits after 10 failed auth attempts', () => {
    expect(checkAuthRateLimit('1.2.3.4')).toBe(true);
    for (let i = 0; i < 10; i++) {
      recordAuthFailure('1.2.3.4');
    }
    expect(checkAuthRateLimit('1.2.3.4')).toBe(false);
    expect(checkAuthRateLimit('5.6.7.8')).toBe(true);
  });

  it('enforces session store cap', () => {
    clearPrivateSessionsForTest();
    for (let i = 0; i < 10_000; i++) {
      const cookies = createCookies();
      setPrivateViewSession(cookies as any);
    }
    const overflowCookies = createCookies();
    expect(() => setPrivateViewSession(overflowCookies as any)).toThrow('Session store full');
    clearPrivateSessionsForTest();
  });
});

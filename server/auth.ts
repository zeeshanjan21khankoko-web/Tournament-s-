import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

export interface AuthUser {
  id: number;
  player_id: string;
  username: string;
  email: string;
  phone: string;
  avatar_url: string;
  role: 'player' | 'admin';
  is_blocked: number;
  wallet_balance: number;
  matches_played: number;
  wins: number;
  kills: number;
  points: number;
  created_at: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

interface TokenPayload {
  uid: number;
  role: 'player' | 'admin';
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

export function verifyAdminPasscode(candidate: string): boolean {
  const configured = (process.env.ADMIN_PASSCODE || '').trim();
  if (!configured || !candidate) return false;
  const a = crypto.createHash('sha256').update(configured).digest();
  const b = crypto.createHash('sha256').update(candidate).digest();
  return crypto.timingSafeEqual(a, b);
}

export function isAdminPasscodeConfigured(): boolean {
  return Boolean((process.env.ADMIN_PASSCODE || '').trim());
}

export const SESSION_COOKIE_NAME = 'ff09_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createPersistentSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(tokenHash, userId, expiresAt);
  return token;
}

export function revokePersistentSession(token: string): void {
  if (!token) return;
  try {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionToken(token));
  } catch {
    // Ignore cleanup errors
  }
}

function getCookieValue(req: Request, cookieName: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const pairs = raw.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    if (name === cookieName) {
      const val = pair.slice(idx + 1).trim();
      try {
        return decodeURIComponent(val);
      } catch {
        return val;
      }
    }
  }
  return null;
}

function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim().toLowerCase() === 'https';
  }
  return false;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
  ];
  if (isHttpsRequest(req)) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
  ];
  if (isHttpsRequest(req)) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.append('Set-Cookie', parts.join('; '));
}

export function signToken(userId: number, role: 'player' | 'admin'): string {
  const payload: TokenPayload = {
    uid: userId,
    role,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TokenPayload;
    if (!payload || typeof payload.uid !== 'number' || typeof payload.exp !== 'number') {
      return null;
    }
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

const USER_PUBLIC_COLUMNS = `
  id, player_id, username, email, phone, avatar_url, role, is_blocked,
  wallet_balance, matches_played, wins, kills, points, created_at
`;

export function getUserById(userId: number): AuthUser | undefined {
  return db
    .prepare(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = ?`)
    .get(userId) as AuthUser | undefined;
}

export function resolveAuthToken(
  req: Request
): { token: string; source: 'bearer' | 'cookie' } | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return { token: bearer, source: 'bearer' };
  }
  const cookieToken = getCookieValue(req, SESSION_COOKIE_NAME);
  if (cookieToken) return { token: cookieToken, source: 'cookie' };
  return null;
}

function getSessionUserId(token: string): number | null {
  const tokenHash = hashSessionToken(token);
  const row = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .get(tokenHash) as { user_id: number; expires_at: number } | undefined;
  if (row) {
    if (row.expires_at > Date.now()) {
      return row.user_id;
    }
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  const payload = verifyToken(token);
  return payload ? payload.uid : null;
}

function hasValidCookieCsrf(req: Request): boolean {
  const xrw = req.headers['x-requested-with'];
  if (typeof xrw === 'string' && xrw.toLowerCase() === 'xmlhttprequest') {
    return true;
  }
  const origin = req.headers.origin;
  const host =
    (typeof req.headers['x-forwarded-host'] === 'string' && req.headers['x-forwarded-host'].split(',')[0].trim()) ||
    req.headers.host;
  if (typeof origin === 'string' && host) {
    try {
      const parsed = new URL(origin);
      return parsed.host === host;
    } catch {
      return false;
    }
  }
  return false;
}

export function extractBearerUser(req: Request): AuthUser | null {
  const resolved = resolveAuthToken(req);
  if (!resolved) return null;
  const uid = getSessionUserId(resolved.token);
  if (!uid) return null;
  const user = getUserById(uid);
  if (!user || user.is_blocked === 1) return null;
  return user;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const resolved = resolveAuthToken(req);
  if (!resolved) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  if (
    resolved.source === 'cookie' &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase()) &&
    !hasValidCookieCsrf(req)
  ) {
    res.status(403).json({ error: 'Cross-origin request blocked.' });
    return;
  }
  const uid = getSessionUserId(resolved.token);
  if (!uid) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }
  const user = getUserById(uid);
  if (!user) {
    res.status(401).json({ error: 'Account no longer exists.' });
    return;
  }
  if (user.is_blocked === 1) {
    res.status(403).json({ error: 'This account has been suspended by an administrator.' });
    return;
  }
  req.user = user;
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges required.' });
    return;
  }
  const adminRecord = db.prepare('SELECT id FROM admins WHERE user_id = ?').get(req.user.id);
  if (!adminRecord) {
    res.status(403).json({ error: 'Admin verification failed.' });
    return;
  }
  next();
}

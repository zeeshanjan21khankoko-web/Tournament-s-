import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

let cachedSessionSecret: string | null = null;
function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (cachedSessionSecret) return cachedSessionSecret;
  try {
    const row = db
      .prepare("SELECT value FROM app_meta WHERE key = 'jwt_session_secret'")
      .get() as { value?: string } | undefined;
    if (row?.value && row.value.length >= 32) {
      cachedSessionSecret = row.value;
      return cachedSessionSecret;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('jwt_session_secret', ?)").run(
      generated
    );
    const saved = db
      .prepare("SELECT value FROM app_meta WHERE key = 'jwt_session_secret'")
      .get() as { value?: string } | undefined;
    cachedSessionSecret = saved?.value || generated;
    return cachedSessionSecret;
  } catch {
    cachedSessionSecret = crypto.randomBytes(32).toString('hex');
    return cachedSessionSecret;
  }
}

export interface AuthUser {
  id: number;
  firebase_uid: string;
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

export function revokeCookieSessionIfPresent(req: Request): void {
  const cookieToken = getCookieValue(req, SESSION_COOKIE_NAME);
  if (cookieToken) {
    revokePersistentSession(cookieToken);
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
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
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
    .createHmac('sha256', getSessionSecret())
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
  id, firebase_uid, player_id, username, email, phone, avatar_url, role, is_blocked,
  wallet_balance, matches_played, wins, kills, points, created_at
`;

export function getUserById(userId: number): AuthUser | undefined {
  return db
    .prepare(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = ?`)
    .get(userId) as AuthUser | undefined;
}

export function extractFirebaseIdToken(req: Request): string {
  const raw = req.headers['x-firebase-id-token'];
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0].trim();
  return '';
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

function resolveValidAuthSession(
  req: Request
): { uid: number; source: 'bearer' | 'cookie'; hasAnyToken: boolean } {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) {
      const uid = getSessionUserId(bearer);
      return { uid: uid || 0, source: 'bearer', hasAnyToken: true };
    }
  }
  const cookieToken = getCookieValue(req, SESSION_COOKIE_NAME);
  if (cookieToken) {
    const uid = getSessionUserId(cookieToken);
    return { uid: uid || 0, source: 'cookie', hasAnyToken: true };
  }
  return { uid: 0, source: 'bearer', hasAnyToken: false };
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
  const session = resolveValidAuthSession(req);
  if (!session.uid) return null;
  const user = getUserById(session.uid);
  if (!user || user.is_blocked === 1) return null;
  return user;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const session = resolveValidAuthSession(req);
  if (!session.hasAnyToken) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  if (!session.uid) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }
  if (
    session.source === 'cookie' &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase()) &&
    !hasValidCookieCsrf(req)
  ) {
    res.status(403).json({ error: 'Cross-origin request blocked.' });
    return;
  }
  const user = getUserById(session.uid);
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

export const BOOTSTRAPPED_ADMIN_EMAIL = 'zeeshanjan21khankoko@gmail.com';

let cachedFirebaseProjectId: string | null = null;
function getFirebaseProjectId(): string {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PROJECT_ID.trim()) {
    return process.env.FIREBASE_PROJECT_ID.trim();
  }
  if (cachedFirebaseProjectId) return cachedFirebaseProjectId;
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { projectId?: string };
    if (raw?.projectId) {
      cachedFirebaseProjectId = raw.projectId;
      return cachedFirebaseProjectId;
    }
  } catch {
    // Fallback below
  }
  cachedFirebaseProjectId = 'inspiring-primer-zct7q';
  return cachedFirebaseProjectId;
}

let cachedCerts: Record<string, string> = {};
let certsExpiresAt = 0;

async function fetchGoogleSecureTokenCerts(forceRefresh = false): Promise<Record<string, string>> {
  if (!forceRefresh && Object.keys(cachedCerts).length > 0 && Date.now() < certsExpiresAt) {
    return cachedCerts;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error(`Unable to fetch Google signing certificates (${resp.status}).`);
  }
  const certs = (await resp.json()) as Record<string, string>;
  const cc = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cc.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) : 3600;
  cachedCerts = certs;
  certsExpiresAt = Date.now() + maxAgeSec * 1000;
  return certs;
}

export interface VerifiedFirebaseIdentity {
  uid: string;
  email: string;
  name: string;
  picture: string;
}

export async function verifyFirebaseGoogleIdToken(
  idToken: string
): Promise<VerifiedFirebaseIdentity> {
  if (typeof idToken !== 'string' || !idToken.trim()) {
    throw new Error('Missing Firebase ID token.');
  }
  const parts = idToken.trim().split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: {
    aud?: string;
    iss?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    exp?: number;
    iat?: number;
  };
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid Firebase ID token encoding.');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Firebase token algorithm.');
  }

  let certs = await fetchGoogleSecureTokenCerts(false);
  let certPem = certs[header.kid];
  if (!certPem) {
    certs = await fetchGoogleSecureTokenCerts(true);
    certPem = certs[header.kid];
  }
  if (!certPem) {
    throw new Error('Unknown Firebase signing key.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const signatureOk = verifier.verify(certPem, Buffer.from(sigB64, 'base64url'));
  if (!signatureOk) {
    throw new Error('Invalid Firebase ID token signature.');
  }

  const projectId = getFirebaseProjectId();
  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) {
    throw new Error('Firebase token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Firebase token issuer mismatch.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Firebase ID token has expired. Please sign in again.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Firebase ID token issued-at timestamp is invalid.');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Firebase token subject is missing.');
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new Error('A verified Google email address is required.');
  }

  return {
    uid: payload.sub,
    email: payload.email.trim().toLowerCase(),
    name: typeof payload.name === 'string' ? payload.name.trim() : '',
    picture: typeof payload.picture === 'string' ? payload.picture.trim() : '',
  };
}

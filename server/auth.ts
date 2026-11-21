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
  avatar_url: string;
  role: 'player' | 'admin';
  is_blocked: number;
  wallet_balance: number;
  matches_played: number;
  wins: number;
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
  id, player_id, username, email, avatar_url, role, is_blocked,
  wallet_balance, matches_played, wins, created_at
`;

export function getUserById(userId: number): AuthUser | undefined {
  return db
    .prepare(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = ?`)
    .get(userId) as AuthUser | undefined;
}

export function extractBearerUser(req: Request): AuthUser | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = getUserById(payload.uid);
  if (!user || user.is_blocked === 1) return null;
  return user;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }
  const user = getUserById(payload.uid);
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

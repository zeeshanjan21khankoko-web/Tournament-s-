import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, generateFirestoreRecordKey, generateTxCode, generateUniquePlayerId, recalculateAllUserPoints } from './db.ts';
import { BOOTSTRAPPED_ADMIN_EMAIL, hashPassword } from './auth.ts';
import { computeTournamentStatus, type TournamentStatus } from '../shared/pktTime.ts';

interface FirebaseConfig {
  projectId: string;
  firestoreDatabaseId: string;
}

let cachedConfig: FirebaseConfig | null = null;

function getFirebaseConfig(): FirebaseConfig | null {
  if (cachedConfig) return cachedConfig;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) return null;
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<FirebaseConfig>;
    if (!raw.projectId || !raw.firestoreDatabaseId || raw.projectId === 'remixed-project-id') {
      return null;
    }
    cachedConfig = {
      projectId: raw.projectId,
      firestoreDatabaseId: raw.firestoreDatabaseId,
    };
    return cachedConfig;
  } catch {
    return null;
  }
}

function getFirestoreRestBase(): string | null {
  const cfg = getFirebaseConfig();
  if (!cfg) return null;
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    cfg.projectId
  )}/databases/${encodeURIComponent(cfg.firestoreDatabaseId)}/documents`;
}

function getFirestoreDocPrefix(): string | null {
  const cfg = getFirebaseConfig();
  if (!cfg) return null;
  return `projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents`;
}

type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

interface FirestoreDoc {
  name?: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

interface FirestoreWrite {
  update?: {
    name: string;
    fields: Record<string, FirestoreValue>;
  };
  delete?: string;
  updateMask?: { fieldPaths: string[] };
  updateTransforms?: Array<{ fieldPath: string; setToServerValue: 'REQUEST_TIME' }>;
  currentDocument?: { exists?: boolean; updateTime?: string };
}

function fsString(val: unknown, maxLen = 4000): FirestoreValue {
  const s = typeof val === 'string' ? val : String(val ?? '');
  return { stringValue: s.slice(0, maxLen) };
}

function fsInt(val: unknown): FirestoreValue {
  const n = Math.trunc(Number(val) || 0);
  return { integerValue: String(n) };
}

function fsBool(val: unknown): FirestoreValue {
  return { booleanValue: Boolean(val) };
}

function fsTimestamp(isoOrSql?: string | null): FirestoreValue {
  if (isoOrSql && typeof isoOrSql === 'string' && isoOrSql.trim()) {
    const normalized = isoOrSql.includes('T')
      ? isoOrSql
      : `${isoOrSql.trim().replace(' ', 'T')}Z`;
    const ms = Date.parse(normalized);
    if (Number.isFinite(ms)) {
      return { timestampValue: new Date(ms).toISOString() };
    }
  }
  return { timestampValue: new Date().toISOString() };
}

function readString(fields: Record<string, FirestoreValue>, key: string, fallback = ''): string {
  const v = fields[key];
  if (!v) return fallback;
  if (typeof v.stringValue === 'string') return v.stringValue;
  if (typeof v.timestampValue === 'string') return v.timestampValue;
  return fallback;
}

function readInt(fields: Record<string, FirestoreValue>, key: string, fallback = 0): number {
  const v = fields[key];
  if (!v) return fallback;
  if (v.integerValue !== undefined) {
    const n = Number(v.integerValue);
    return Number.isFinite(n) ? Math.floor(n) : fallback;
  }
  if (v.doubleValue !== undefined && Number.isFinite(v.doubleValue)) {
    return Math.floor(v.doubleValue);
  }
  if (typeof v.stringValue === 'string' && v.stringValue.trim()) {
    const n = Number(v.stringValue);
    return Number.isFinite(n) ? Math.floor(n) : fallback;
  }
  return fallback;
}

function readBool(fields: Record<string, FirestoreValue>, key: string, fallback = false): boolean {
  const v = fields[key];
  if (!v) return fallback;
  if (typeof v.booleanValue === 'boolean') return v.booleanValue;
  return fallback;
}

function parseDocIdNumber(name: string | undefined): number {
  if (!name) return 0;
  const docId = name.split('/').pop() || '';
  const cleaned = docId.replace(/^tour_/, '');
  const n = Number(cleaned);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function docIdFromName(name: string | undefined): string {
  if (!name) return '';
  return name.split('/').pop() || '';
}

function tournamentIdFromRegDocName(name: string | undefined): number {
  if (!name) return 0;
  const match = name.match(/\/tournaments\/([^/]+)\/registrations\//);
  if (!match) return 0;
  const cleaned = match[1].replace(/^tour_/, '');
  const n = Number(cleaned);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function isoToSqliteDateTime(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return new Date().toISOString().slice(0, 19).replace('T', ' ');
  const normalized = iso.includes('T') ? iso : `${iso.trim().replace(' ', 'T')}Z`;
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

const ALLOWED_MODES = new Set(['Battle Royale', 'Clash Squad', 'Lone Wolf']);
const DEFAULT_BANNER = '/src/assets/images/kelly_tournament_banner_1795312123415.jpg';
const DEFAULT_AVATAR = '/src/assets/images/avatar_esports_pro_1795298801657.jpg';

export interface ParsedFirestoreTournament {
  id: number;
  title: string;
  game_name: string;
  mode: string;
  entry_fee: number;
  prize_pool: number;
  prize_1st: number;
  prize_2nd: number;
  prize_3rd: number;
  prize_4th: number;
  prize_5th: number;
  max_slots: number;
  filled_slots: number;
  match_time: string;
  end_time: string;
  status: TournamentStatus;
  banner_url: string;
  rules: string;
  created_at: string;
}

function parseFirestoreTournamentDoc(doc: FirestoreDoc): ParsedFirestoreTournament | null {
  const fields = doc.fields;
  if (!fields) return null;

  const idFromField = readInt(fields, 'id', 0);
  const id = idFromField > 0 ? idFromField : parseDocIdNumber(doc.name);
  const title = readString(fields, 'title', '').trim();
  if (id <= 0 || !title) return null;

  const gameName = readString(fields, 'game_name', 'Free Fire').trim() || 'Free Fire';
  const rawMode = readString(fields, 'mode', 'Battle Royale');
  const mode = ALLOWED_MODES.has(rawMode) ? rawMode : 'Battle Royale';
  const entryFee = Math.max(0, readInt(fields, 'entry_fee', 0));
  const prize1st = Math.max(0, readInt(fields, 'prize_1st', 0));
  const prize2nd = Math.max(0, readInt(fields, 'prize_2nd', 0));
  const prize3rd = Math.max(0, readInt(fields, 'prize_3rd', 0));
  const prize4th = Math.max(0, readInt(fields, 'prize_4th', 0));
  const prize5th = Math.max(0, readInt(fields, 'prize_5th', 0));
  const rawPool = Math.max(0, readInt(fields, 'prize_pool', 0));
  const prizePool = Math.max(rawPool, prize1st + prize2nd + prize3rd + prize4th + prize5th);
  const maxSlots = Math.max(2, Math.min(500, readInt(fields, 'max_slots', 48)));
  const filledSlots = Math.max(0, Math.min(maxSlots, readInt(fields, 'filled_slots', 0)));
  const matchTime = readString(fields, 'match_time', '') || new Date().toISOString();
  const endTime = readString(fields, 'end_time', '');
  const rawStatus = readString(fields, 'status', 'upcoming');
  const baseStatus: TournamentStatus =
    rawStatus === 'cancelled' || rawStatus === 'completed' || rawStatus === 'live'
      ? rawStatus
      : 'upcoming';
  const status = computeTournamentStatus({
    match_time: matchTime,
    end_time: endTime,
    status: baseStatus,
  });
  const bannerUrl = readString(fields, 'banner_url', '') || DEFAULT_BANNER;
  const rules = readString(fields, 'rules', '');
  const createdAt = readString(fields, 'created_at', '') || doc.createTime || new Date().toISOString();

  return {
    id,
    title,
    game_name: gameName,
    mode,
    entry_fee: entryFee,
    prize_pool: prizePool,
    prize_1st: prize1st,
    prize_2nd: prize2nd,
    prize_3rd: prize3rd,
    prize_4th: prize4th,
    prize_5th: prize5th,
    max_slots: maxSlots,
    filled_slots: filledSlots,
    match_time: matchTime,
    end_time: endTime,
    status,
    banner_url: bannerUrl,
    rules,
    created_at: createdAt,
  };
}

async function fetchJsonWithTimeout(url: string, init?: RequestInit, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function authHeaders(idToken?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken && idToken.trim()) {
    headers['Authorization'] = `Bearer ${idToken.trim()}`;
  }
  return headers;
}

async function fsGetDoc(relPath: string, idToken?: string): Promise<FirestoreDoc | null> {
  const base = getFirestoreRestBase();
  if (!base) return null;
  try {
    const res = await fetchJsonWithTimeout(`${base}/${relPath}`, {
      method: 'GET',
      headers: idToken ? { Authorization: `Bearer ${idToken.trim()}` } : undefined,
    });
    if (!res.ok) return null;
    const doc = (await res.json()) as FirestoreDoc;
    return doc?.fields ? doc : null;
  } catch {
    return null;
  }
}

async function fsRunQuery(
  structuredQuery: Record<string, unknown>,
  idToken?: string
): Promise<FirestoreDoc[]> {
  const base = getFirestoreRestBase();
  if (!base) return [];
  try {
    const res = await fetchJsonWithTimeout(`${base}:runQuery`, {
      method: 'POST',
      headers: authHeaders(idToken),
      body: JSON.stringify({ structuredQuery }),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ document?: FirestoreDoc }>;
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => r.document).filter((d): d is FirestoreDoc => Boolean(d?.fields));
  } catch {
    return [];
  }
}

async function fsCommit(writes: FirestoreWrite[], idToken: string, label: string): Promise<boolean> {
  const base = getFirestoreRestBase();
  if (!base || !idToken.trim() || writes.length === 0) return false;
  try {
    const commitUrl = base.replace(/\/documents$/, '/documents:commit');
    const res = await fetchJsonWithTimeout(
      commitUrl,
      {
        method: 'POST',
        headers: authHeaders(idToken),
        body: JSON.stringify({ writes }),
      },
      7500
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`Firestore commit (${label}) returned ${res.status}: ${txt.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`Firestore commit (${label}) error:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export async function fetchFirestoreDeletedTournamentIds(): Promise<number[]> {
  const base = getFirestoreRestBase();
  if (!base) return [];
  try {
    const res = await fetchJsonWithTimeout(`${base}/app_settings/tournament_policy`);
    if (!res.ok) return [];
    const data = (await res.json()) as FirestoreDoc;
    const arr = data.fields?.deleted_tournament_ids?.arrayValue?.values;
    if (!Array.isArray(arr)) return [];
    const ids: number[] = [];
    for (const item of arr) {
      const n =
        item.integerValue !== undefined
          ? Math.floor(Number(item.integerValue))
          : item.doubleValue !== undefined
            ? Math.floor(item.doubleValue)
            : 0;
      if (Number.isInteger(n) && n > 0) ids.push(n);
    }
    return ids;
  } catch {
    return [];
  }
}

export async function fetchFirestoreDeletedUserIds(): Promise<number[]> {
  const base = getFirestoreRestBase();
  if (!base) return [];
  try {
    const res = await fetchJsonWithTimeout(`${base}/app_settings/user_policy`);
    if (!res.ok) return [];
    const data = (await res.json()) as FirestoreDoc;
    const arr = data.fields?.deleted_user_ids?.arrayValue?.values;
    if (!Array.isArray(arr)) return [];
    const ids: number[] = [];
    for (const item of arr) {
      const n =
        item.integerValue !== undefined
          ? Math.floor(Number(item.integerValue))
          : item.doubleValue !== undefined
            ? Math.floor(item.doubleValue)
            : 0;
      if (Number.isInteger(n) && n > 0) ids.push(n);
    }
    return ids;
  } catch {
    return [];
  }
}

export async function fetchFirestoreTournaments(): Promise<ParsedFirestoreTournament[]> {
  const docs = await fsRunQuery({
    from: [{ collectionId: 'tournaments' }],
    limit: 200,
  });
  const list: ParsedFirestoreTournament[] = [];
  for (const doc of docs) {
    const parsed = parseFirestoreTournamentDoc(doc);
    if (parsed) list.push(parsed);
  }
  return list;
}

export async function fetchFirestoreTournamentById(
  tournamentId: number
): Promise<ParsedFirestoreTournament | null> {
  const base = getFirestoreRestBase();
  if (!base || !Number.isInteger(tournamentId) || tournamentId <= 0) return null;

  for (const docId of [`tour_${tournamentId}`, String(tournamentId)]) {
    const doc = await fsGetDoc(`tournaments/${encodeURIComponent(docId)}`);
    if (doc) {
      const parsed = parseFirestoreTournamentDoc(doc);
      if (parsed) return parsed;
    }
  }

  const all = await fetchFirestoreTournaments();
  return all.find((t) => t.id === tournamentId) || null;
}

function insertFirestoreTournamentIfMissing(t: ParsedFirestoreTournament): void {
  const deleted = db
    .prepare('SELECT 1 FROM deleted_tournaments WHERE tournament_id = ?')
    .get(t.id);
  if (deleted) return;

  const existing = db.prepare('SELECT id FROM tournaments WHERE id = ?').get(t.id);
  if (existing) return;

  db.prepare(
    `INSERT OR IGNORE INTO tournaments (
       id, title, game_name, mode, entry_fee, prize_pool,
       prize_1st, prize_2nd, prize_3rd, prize_4th, prize_5th,
       max_slots, filled_slots, match_time, end_time, status,
       banner_url, rules, room_id, room_pass, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?)`
  ).run(
    t.id,
    t.title,
    t.game_name,
    t.mode,
    t.entry_fee,
    t.prize_pool,
    t.prize_1st,
    t.prize_2nd,
    t.prize_3rd,
    t.prize_4th,
    t.prize_5th,
    t.max_slots,
    t.filled_slots,
    t.match_time,
    t.end_time,
    t.status,
    t.banner_url,
    t.rules,
    t.created_at
  );

  try {
    const seqRow = db
      .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'tournaments'")
      .get() as { seq?: number } | undefined;
    const maxTourRow = db
      .prepare('SELECT COALESCE(MAX(id), 0) as maxId FROM tournaments')
      .get() as { maxId: number };
    const nextSeq = Math.max(Number(seqRow?.seq || 0), Number(maxTourRow?.maxId || 0), t.id);
    if (seqRow) {
      db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'tournaments'").run(nextSeq);
    } else {
      db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('tournaments', ?)").run(nextSeq);
    }
  } catch {
    // Ignore if sqlite_sequence is unavailable
  }
}

let lastSyncMs = 0;
let inFlightSync: Promise<void> | null = null;
const SYNC_TTL_MS = 8000;

export async function syncMissingTournamentsFromFirestore(force = false): Promise<void> {
  if (!force && Date.now() - lastSyncMs < SYNC_TTL_MS) {
    return;
  }
  if (inFlightSync) {
    return inFlightSync;
  }

  inFlightSync = (async () => {
    try {
      const [cloudDeletedIds, cloudTournaments] = await Promise.all([
        fetchFirestoreDeletedTournamentIds(),
        fetchFirestoreTournaments(),
      ]);

      const cloudDeletedSet = new Set(cloudDeletedIds);

      db.transaction(() => {
        for (const delId of cloudDeletedIds) {
          const inCloud = cloudTournaments.some((ct) => ct.id === delId);
          if (!inCloud) {
            db.prepare('INSERT OR IGNORE INTO deleted_tournaments (tournament_id) VALUES (?)').run(delId);
          }
        }

        for (const ct of cloudTournaments) {
          if (!cloudDeletedSet.has(ct.id)) {
            insertFirestoreTournamentIfMissing(ct);
          }
        }
      }).immediate();

      lastSyncMs = Date.now();
    } catch (err) {
      console.warn('Firestore tournament hydration notice:', err instanceof Error ? err.message : err);
    } finally {
      inFlightSync = null;
    }
  })();

  return inFlightSync;
}

export async function ensureTournamentInSqlite(
  tournamentId: number
): Promise<Record<string, unknown> | undefined> {
  if (!Number.isInteger(tournamentId) || tournamentId <= 0) return undefined;

  const isDeletedLocal = db
    .prepare('SELECT 1 FROM deleted_tournaments WHERE tournament_id = ?')
    .get(tournamentId);
  const existing = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as
    | Record<string, unknown>
    | undefined;

  if (existing && !isDeletedLocal) {
    return existing;
  }

  const [cloudDoc, cloudDeleted] = await Promise.all([
    fetchFirestoreTournamentById(tournamentId),
    fetchFirestoreDeletedTournamentIds(),
  ]);

  if (cloudDoc && !cloudDeleted.includes(tournamentId)) {
    db.transaction(() => {
      db.prepare('DELETE FROM deleted_tournaments WHERE tournament_id = ?').run(tournamentId);
      insertFirestoreTournamentIfMissing(cloudDoc);
    }).immediate();

    return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as
      | Record<string, unknown>
      | undefined;
  }

  if (existing && !isDeletedLocal) {
    return existing;
  }
  return undefined;
}

export async function getNextSafeTournamentId(): Promise<number> {
  const [cloudTours, cloudDeleted] = await Promise.all([
    fetchFirestoreTournaments(),
    fetchFirestoreDeletedTournamentIds(),
  ]);

  const sqliteMaxTour = (
    db.prepare('SELECT COALESCE(MAX(id), 0) as maxId FROM tournaments').get() as { maxId: number }
  ).maxId;
  const sqliteMaxDel = (
    db.prepare('SELECT COALESCE(MAX(tournament_id), 0) as maxId FROM deleted_tournaments').get() as {
      maxId: number;
    }
  ).maxId;

  let seqMax = 0;
  try {
    const seqRow = db
      .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'tournaments'")
      .get() as { seq?: number } | undefined;
    seqMax = Number(seqRow?.seq || 0);
  } catch {
    seqMax = 0;
  }

  const cloudMaxTour = cloudTours.reduce((max, t) => Math.max(max, t.id), 0);
  const cloudMaxDel = cloudDeleted.reduce((max, id) => Math.max(max, id), 0);

  return Math.max(sqliteMaxTour, sqliteMaxDel, seqMax, cloudMaxTour, cloudMaxDel) + 1;
}

// ============================================================================
// PERSISTENT USER, WALLET, LEDGER & TOURNAMENT REGISTRATION HYDRATION & SYNC
// ============================================================================

export interface SqliteUserFullRow {
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

export interface SqliteWalletFullRow {
  user_id: number;
  available_balance: number;
  pending_withdrawal: number;
  total_deposited: number;
  total_withdrawn: number;
  total_won: number;
}

export function getCanonicalUserDocId(user: { id: number; firebase_uid?: string | null }): string {
  const uid = (user.firebase_uid || '').trim();
  if (uid && /^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
    return uid;
  }
  return `sql_${Math.max(1, Math.floor(Number(user.id) || 1))}`;
}

function buildSafeUniqueUsername(raw: string, email: string): string {
  const baseCandidate = (raw || email.split('@')[0] || 'player')
    .replace(/[^a-zA-Z0-9_.-]+/g, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '')
    .slice(0, 18);
  const base = baseCandidate.length >= 3 ? baseCandidate : `Player_${crypto.randomInt(100, 999)}`;
  let candidate = base.slice(0, 24);
  for (let i = 0; i < 12; i++) {
    const exists = db
      .prepare('SELECT 1 FROM users WHERE lower(username) = ?')
      .get(candidate.toLowerCase());
    if (!exists) return candidate;
    const suffix = `_${crypto.randomInt(100, 9999)}`;
    candidate = `${base.slice(0, 24 - suffix.length)}${suffix}`;
  }
  return `Player_${Date.now().toString().slice(-6)}`;
}

interface ParsedCloudUser {
  docId: string;
  uid: string;
  firebaseUid: string;
  sqliteId: number;
  email: string;
  username: string;
  playerId: string;
  phone: string;
  avatarUrl: string;
  role: 'player' | 'admin';
  isBlocked: number;
  walletBalance: number;
  pendingWithdrawal: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalWon: number;
  matchesPlayed: number;
  wins: number;
  kills: number;
  points: number;
  lastLuckyDrawPkt: string;
}

function parseCloudUserDoc(doc: FirestoreDoc): ParsedCloudUser | null {
  const f = doc.fields;
  if (!f) return null;
  const docId = docIdFromName(doc.name);
  const email = readString(f, 'email', '').trim().toLowerCase();
  if (!docId || !email) return null;
  const uid = readString(f, 'uid', docId);
  const explicitFbUid = readString(f, 'firebase_uid', '');
  const firebaseUid =
    explicitFbUid && !explicitFbUid.startsWith('sql_')
      ? explicitFbUid
      : !docId.startsWith('sql_')
        ? docId
        : !uid.startsWith('sql_')
          ? uid
          : '';
  const walletBalance = Math.max(0, readInt(f, 'wallet_balance', 0));
  return {
    docId,
    uid,
    firebaseUid,
    sqliteId: readInt(f, 'sqlite_id', 0),
    email,
    username: readString(f, 'username', '').trim() || email.split('@')[0] || 'Player',
    playerId: readString(f, 'player_id', '').trim(),
    phone: readString(f, 'phone', '').trim().slice(0, 32),
    avatarUrl: readString(f, 'avatar_url', '') || DEFAULT_AVATAR,
    role: readString(f, 'role', 'player') === 'admin' ? 'admin' : 'player',
    isBlocked: readInt(f, 'is_blocked', 0) === 1 ? 1 : 0,
    walletBalance,
    pendingWithdrawal: Math.max(0, Math.min(walletBalance, readInt(f, 'pending_withdrawal', 0))),
    totalDeposited: Math.max(0, readInt(f, 'total_deposited', 0)),
    totalWithdrawn: Math.max(0, readInt(f, 'total_withdrawn', 0)),
    totalWon: Math.max(0, readInt(f, 'total_won', 0)),
    matchesPlayed: Math.max(0, readInt(f, 'matches_played', 0)),
    wins: Math.max(0, readInt(f, 'wins', 0)),
    kills: Math.max(0, readInt(f, 'kills', 0)),
    points: Math.max(0, readInt(f, 'points', 0)),
    lastLuckyDrawPkt: readString(f, 'last_lucky_draw_pkt', ''),
  };
}

function pickAuthoritativeCloudUser(docs: ParsedCloudUser[]): ParsedCloudUser | null {
  if (docs.length === 0) return null;
  const sorted = [...docs].sort((a, b) => {
    const aHasUid = a.firebaseUid ? 1 : 0;
    const bHasUid = b.firebaseUid ? 1 : 0;
    if (bHasUid !== aHasUid) return bHasUid - aHasUid;
    if (b.walletBalance !== a.walletBalance) return b.walletBalance - a.walletBalance;
    return b.totalDeposited + b.totalWon - (a.totalDeposited + a.totalWon);
  });
  return sorted[0];
}

function insertOrMergeCloudUserIntoSqlite(
  cloud: ParsedCloudUser,
  overrideFirebaseUid?: string
): number {
  const effectiveFbUid = (overrideFirebaseUid || cloud.firebaseUid || '').trim();
  const isBootstrapped = cloud.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
  const role: 'player' | 'admin' = isBootstrapped ? 'admin' : cloud.role;

  // Never restore an account that Admin manually deleted
  const localDeleted = db
    .prepare('SELECT 1 FROM deleted_users_log WHERE lower(email) = ? OR (user_id = ? AND ? > 0)')
    .get(cloud.email.toLowerCase(), cloud.sqliteId, cloud.sqliteId);
  if (localDeleted) return 0;

  let existing = (
    effectiveFbUid
      ? db.prepare('SELECT id, firebase_uid, wallet_balance FROM users WHERE firebase_uid = ?').get(effectiveFbUid)
      : undefined
  ) as { id: number; firebase_uid: string; wallet_balance: number } | undefined;

  if (!existing) {
    existing = db
      .prepare('SELECT id, firebase_uid, wallet_balance FROM users WHERE lower(email) = ?')
      .get(cloud.email.toLowerCase()) as
      | { id: number; firebase_uid: string; wallet_balance: number }
      | undefined;
  }

  if (existing) {
    if (effectiveFbUid && !existing.firebase_uid) {
      const uidTaken = db
        .prepare('SELECT id FROM users WHERE firebase_uid = ? AND id != ?')
        .get(effectiveFbUid, existing.id);
      if (!uidTaken) {
        db.prepare('UPDATE users SET firebase_uid = ? WHERE id = ?').run(effectiveFbUid, existing.id);
      }
    }

    // Check if local SQLite row is an empty container-fresh state with 0 activity
    const txCount = (
      db.prepare('SELECT COUNT(*) as c FROM transactions WHERE user_id = ?').get(existing.id) as { c: number }
    ).c;
    const depCount = (
      db.prepare('SELECT COUNT(*) as c FROM deposits WHERE user_id = ?').get(existing.id) as { c: number }
    ).c;
    const wdCount = (
      db.prepare('SELECT COUNT(*) as c FROM withdrawals WHERE user_id = ?').get(existing.id) as { c: number }
    ).c;
    const regCount = (
      db.prepare('SELECT COUNT(*) as c FROM tournament_registrations WHERE user_id = ?').get(existing.id) as {
        c: number;
      }
    ).c;

    const isFreshEmptyLocal =
      txCount === 0 && depCount === 0 && wdCount === 0 && regCount === 0 && existing.wallet_balance === 0;

    if (
      isFreshEmptyLocal &&
      (cloud.walletBalance > 0 ||
        cloud.totalDeposited > 0 ||
        cloud.totalWon > 0 ||
        cloud.matchesPlayed > 0)
    ) {
      db.prepare(
        `UPDATE users
         SET wallet_balance = ?, matches_played = MAX(matches_played, ?),
             wins = MAX(wins, ?), kills = MAX(kills, ?), points = MAX(points, ?)
         WHERE id = ?`
      ).run(
        cloud.walletBalance,
        cloud.matchesPlayed,
        cloud.wins,
        cloud.kills,
        cloud.points,
        existing.id
      );
      db.prepare('INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)').run(
        existing.id,
        cloud.walletBalance
      );
      db.prepare(
        `UPDATE wallet_accounts
         SET available_balance = ?, pending_withdrawal = ?, total_deposited = ?,
             total_withdrawn = ?, total_won = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      ).run(
        cloud.walletBalance,
        cloud.pendingWithdrawal,
        cloud.totalDeposited,
        cloud.totalWithdrawn,
        cloud.totalWon,
        existing.id
      );
    }

    if (role === 'admin') {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
      db.prepare("INSERT OR IGNORE INTO admins (user_id, admin_level) VALUES (?, 'super_admin')").run(existing.id);
    }
    return existing.id;
  }

  // Insert restored user into SQLite
  const playerId =
    cloud.playerId &&
    cloud.playerId.length >= 3 &&
    cloud.playerId.length <= 32 &&
    !db.prepare('SELECT 1 FROM users WHERE player_id = ?').get(cloud.playerId)
      ? cloud.playerId
      : generateUniquePlayerId();
  const username = buildSafeUniqueUsername(cloud.username, cloud.email);
  const tempPasswordHash = hashPassword(crypto.randomBytes(24).toString('hex'));

  const idFree =
    cloud.sqliteId > 0 && !db.prepare('SELECT 1 FROM users WHERE id = ?').get(cloud.sqliteId);

  let newId: number;
  if (idFree) {
    db.prepare(
      `INSERT INTO users (
         id, firebase_uid, player_id, username, email, phone, password_hash, avatar_url,
         role, is_blocked, wallet_balance, matches_played, wins, kills, points
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      cloud.sqliteId,
      effectiveFbUid,
      playerId,
      username,
      cloud.email,
      cloud.phone,
      tempPasswordHash,
      cloud.avatarUrl || DEFAULT_AVATAR,
      role,
      isBootstrapped ? 0 : cloud.isBlocked,
      cloud.walletBalance,
      cloud.matchesPlayed,
      cloud.wins,
      cloud.kills,
      cloud.points
    );
    newId = cloud.sqliteId;
  } else {
    const info = db
      .prepare(
        `INSERT INTO users (
           firebase_uid, player_id, username, email, phone, password_hash, avatar_url,
           role, is_blocked, wallet_balance, matches_played, wins, kills, points
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        effectiveFbUid,
        playerId,
        username,
        cloud.email,
        cloud.phone,
        tempPasswordHash,
        cloud.avatarUrl || DEFAULT_AVATAR,
        role,
        isBootstrapped ? 0 : cloud.isBlocked,
        cloud.walletBalance,
        cloud.matchesPlayed,
        cloud.wins,
        cloud.kills,
        cloud.points
      );
    newId = Number(info.lastInsertRowid);
  }

  db.prepare(
    `INSERT OR REPLACE INTO wallet_accounts (
       user_id, available_balance, pending_withdrawal, total_deposited, total_withdrawn, total_won
     ) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    newId,
    cloud.walletBalance,
    cloud.pendingWithdrawal,
    cloud.totalDeposited,
    cloud.totalWithdrawn,
    cloud.totalWon
  );

  if (role === 'admin') {
    db.prepare("INSERT OR IGNORE INTO admins (user_id, admin_level) VALUES (?, 'super_admin')").run(newId);
  }
  return newId;
}

function restoreCloudDepositDoc(doc: FirestoreDoc, localUserId: number): void {
  const f = doc.fields;
  if (!f) return;
  const depositKey = readString(f, 'deposit_key', docIdFromName(doc.name));
  const transactionRef = readString(f, 'transaction_ref', '').trim().toUpperCase();
  const amount = Math.max(0, readInt(f, 'amount', 0));
  if (!depositKey || !transactionRef || amount <= 0) return;

  const exists = db
    .prepare('SELECT id FROM deposits WHERE firestore_key = ? OR upper(transaction_ref) = ?')
    .get(depositKey, transactionRef);
  if (exists) return;

  const method = readString(f, 'method', 'jazzcash') === 'easypaisa' ? 'easypaisa' : 'jazzcash';
  const senderAccount = readString(f, 'sender_account', '');
  const screenshotPreview = readString(f, 'screenshot_preview', '');
  const rawStatus = readString(f, 'status', 'pending');
  const status = rawStatus === 'approved' || rawStatus === 'rejected' ? rawStatus : 'pending';
  const adminNote = readString(f, 'admin_note', '');
  const reviewedAt = readString(f, 'reviewed_at', '');
  const createdAt = isoToSqliteDateTime(readString(f, 'created_at', doc.createTime));

  db.prepare(
    `INSERT OR IGNORE INTO deposits (
       user_id, firestore_key, amount, method, transaction_ref, sender_account,
       screenshot_data, status, admin_note, reviewed_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    localUserId,
    depositKey,
    amount,
    method,
    transactionRef,
    senderAccount,
    screenshotPreview,
    status,
    adminNote,
    reviewedAt ? isoToSqliteDateTime(reviewedAt) : null,
    createdAt
  );
}

function restoreCloudWithdrawalDoc(doc: FirestoreDoc, localUserId: number): void {
  const f = doc.fields;
  if (!f) return;
  const wdKey = readString(f, 'withdrawal_key', docIdFromName(doc.name));
  const amount = Math.max(0, readInt(f, 'amount', 0));
  const accountTitle = readString(f, 'account_title', '').trim();
  const accountNumber = readString(f, 'account_number', '').trim();
  if (!wdKey || amount <= 0 || !accountTitle || !accountNumber) return;

  const exists = db
    .prepare('SELECT id FROM withdrawals WHERE firestore_key = ?')
    .get(wdKey);
  if (exists) return;

  const rawMethod = readString(f, 'method', 'easypaisa');
  const method =
    rawMethod === 'jazzcash' || rawMethod === 'bank_account' ? rawMethod : 'easypaisa';
  const bankName = readString(f, 'bank_name', '');
  const rawStatus = readString(f, 'status', 'pending');
  const status =
    rawStatus === 'approved' || rawStatus === 'rejected' || rawStatus === 'paid'
      ? rawStatus
      : 'pending';
  const adminNote = readString(f, 'admin_note', '');
  const reviewedAt = readString(f, 'reviewed_at', '');
  const createdAt = isoToSqliteDateTime(readString(f, 'created_at', doc.createTime));

  db.prepare(
    `INSERT OR IGNORE INTO withdrawals (
       user_id, firestore_key, amount, method, bank_name, account_title, account_number,
       status, admin_note, reviewed_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    localUserId,
    wdKey,
    amount,
    method,
    bankName,
    accountTitle,
    accountNumber,
    status,
    adminNote,
    reviewedAt ? isoToSqliteDateTime(reviewedAt) : null,
    createdAt
  );
}

function restoreCloudTransactionDoc(doc: FirestoreDoc, localUserId: number): void {
  const f = doc.fields;
  if (!f) return;
  const txCode = readString(f, 'tx_code', docIdFromName(doc.name)).trim();
  const type = readString(f, 'type', '');
  const direction = readString(f, 'direction', '');
  const amount = Math.max(0, readInt(f, 'amount', 0));
  const balanceAfter = Math.max(0, readInt(f, 'balance_after', 0));
  const status = readString(f, 'status', 'completed');
  const referenceId = readString(f, 'reference_id', '');
  const description = readString(f, 'description', type || 'Transaction');
  const createdAt = isoToSqliteDateTime(readString(f, 'created_at', doc.createTime));
  if (!txCode || !type || (direction !== 'credit' && direction !== 'debit')) return;

  db.prepare(
    `INSERT OR IGNORE INTO transactions (
       tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(txCode, localUserId, type, amount, direction, balanceAfter, status, referenceId, description, createdAt);
}

function restoreCloudLuckyDrawDoc(doc: FirestoreDoc, localUserId: number): void {
  const f = doc.fields;
  if (!f) return;
  const drawDatePkt = readString(f, 'draw_date_pkt', '').trim();
  const prizeAmount = Math.max(0, readInt(f, 'prize_amount', 0));
  const prizeLabel = readString(f, 'prize_label', '').trim() || 'Daily Lucky Draw';
  const createdAt = isoToSqliteDateTime(readString(f, 'created_at', doc.createTime));
  if (!drawDatePkt || drawDatePkt.length !== 10) return;

  db.prepare(
    `INSERT OR IGNORE INTO lucky_draw_entries (user_id, draw_date_pkt, prize_amount, prize_label, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(localUserId, drawDatePkt, prizeAmount, prizeLabel, createdAt);
}

function restoreCloudRegistrationDoc(doc: FirestoreDoc, localUserId: number): number {
  const f = doc.fields;
  if (!f) return 0;
  const tournamentIdFromField = readInt(f, 'tournament_id', 0);
  const tournamentId =
    tournamentIdFromField > 0 ? tournamentIdFromField : tournamentIdFromRegDocName(doc.name);
  if (tournamentId <= 0) return 0;

  const isDeletedTour = db
    .prepare('SELECT 1 FROM deleted_tournaments WHERE tournament_id = ?')
    .get(tournamentId);
  if (isDeletedTour) return 0;

  const tourExists = db.prepare('SELECT id FROM tournaments WHERE id = ?').get(tournamentId);
  if (!tourExists) return 0;

  const inGameName = readString(f, 'in_game_name', 'Player').trim() || 'Player';
  const inGameId = readString(f, 'in_game_id', '000000').trim() || '000000';
  const slotNumber = Math.max(1, readInt(f, 'slot_number', 1));
  const status = readString(f, 'status', 'registered') === 'disqualified' ? 'disqualified' : 'registered';
  const registeredAt = isoToSqliteDateTime(readString(f, 'registered_at', doc.createTime));

  db.prepare(
    `INSERT OR IGNORE INTO tournament_registrations (
       tournament_id, user_id, in_game_name, in_game_id, slot_number, status, registered_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(tournamentId, localUserId, inGameName, inGameId, slotNumber, status, registeredAt);

  return tournamentId;
}

/**
 * Hydrates a signed-in Google user's entire persistent cloud state (profile, wallet balance,
 * deposits, withdrawals, transactions, lucky draw entries, and tournament registrations)
 * from Firestore into SQLite on login / container cold-start.
 */
export async function hydrateUserAllStateFromFirestore(
  identity: { uid: string; email: string; name?: string },
  idToken: string
): Promise<void> {
  if (!idToken || !identity.uid || !identity.email) return;

  try {
    await syncMissingTournamentsFromFirestore(false);

    const cleanEmail = identity.email.trim().toLowerCase();
    const [
      cloudDeletedUsers,
      directUserDoc,
      emailUserDocs,
      depDocs,
      wdDocs,
      txDocs,
      luckyDocs,
      regDocs,
    ] = await Promise.all([
      fetchFirestoreDeletedUserIds(),
      fsGetDoc(`users/${encodeURIComponent(identity.uid)}`, idToken),
      fsRunQuery(
        {
          from: [{ collectionId: 'users' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'email' },
              op: 'EQUAL',
              value: { stringValue: cleanEmail },
            },
          },
          limit: 10,
        },
        idToken
      ),
      fsRunQuery(
        {
          from: [{ collectionId: 'deposits' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'user_uid' },
              op: 'EQUAL',
              value: { stringValue: identity.uid },
            },
          },
          limit: 200,
        },
        idToken
      ),
      fsRunQuery(
        {
          from: [{ collectionId: 'withdrawals' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'user_uid' },
              op: 'EQUAL',
              value: { stringValue: identity.uid },
            },
          },
          limit: 200,
        },
        idToken
      ),
      fsRunQuery(
        {
          from: [{ collectionId: 'transactions' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'user_uid' },
              op: 'EQUAL',
              value: { stringValue: identity.uid },
            },
          },
          limit: 300,
        },
        idToken
      ),
      fsRunQuery(
        {
          from: [{ collectionId: 'lucky_draws' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'user_uid' },
              op: 'EQUAL',
              value: { stringValue: identity.uid },
            },
          },
          limit: 60,
        },
        idToken
      ),
      fsRunQuery(
        {
          from: [{ collectionId: 'registrations', allDescendants: true }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'user_uid' },
              op: 'EQUAL',
              value: { stringValue: identity.uid },
            },
          },
          limit: 200,
        },
        idToken
      ),
    ]);

    const parsedUserDocs: ParsedCloudUser[] = [];
    if (directUserDoc) {
      const p = parseCloudUserDoc(directUserDoc);
      if (p) parsedUserDocs.push(p);
    }
    for (const d of emailUserDocs) {
      const p = parseCloudUserDoc(d);
      if (p && !parsedUserDocs.some((x) => x.docId === p.docId)) {
        parsedUserDocs.push(p);
      }
    }

    const cloudUser = pickAuthoritativeCloudUser(parsedUserDocs);
    if (cloudUser && cloudUser.sqliteId > 0 && cloudDeletedUsers.includes(cloudUser.sqliteId)) {
      return;
    }

    const touchedTournamentIds = new Set<number>();

    db.transaction(() => {
      let localUserId = 0;

      if (cloudUser) {
        localUserId = insertOrMergeCloudUserIntoSqlite(cloudUser, identity.uid);
      } else {
        const existingRow = db
          .prepare('SELECT id FROM users WHERE firebase_uid = ? OR lower(email) = ?')
          .get(identity.uid, cleanEmail) as { id: number } | undefined;
        localUserId = existingRow?.id || 0;
      }

      if (localUserId <= 0) return;

      for (const d of depDocs) restoreCloudDepositDoc(d, localUserId);
      for (const w of wdDocs) restoreCloudWithdrawalDoc(w, localUserId);
      for (const t of txDocs) restoreCloudTransactionDoc(t, localUserId);
      for (const l of luckyDocs) restoreCloudLuckyDrawDoc(l, localUserId);
      for (const r of regDocs) {
        const tid = restoreCloudRegistrationDoc(r, localUserId);
        if (tid > 0) touchedTournamentIds.add(tid);
      }

      for (const tid of touchedTournamentIds) {
        const cntRow = db
          .prepare('SELECT COUNT(*) as cnt FROM tournament_registrations WHERE tournament_id = ?')
          .get(tid) as { cnt: number };
        db.prepare(
          'UPDATE tournaments SET filled_slots = MIN(max_slots, MAX(filled_slots, ?)) WHERE id = ?'
        ).run(cntRow.cnt, tid);
      }
    }).immediate();

    if (touchedTournamentIds.size > 0) {
      recalculateAllUserPoints();
    }
  } catch (err) {
    console.warn('Firestore user state hydration notice:', err instanceof Error ? err.message : err);
  }
}

let lastAdminHydrateMs = 0;
let inFlightAdminHydrate: Promise<void> | null = null;
const ADMIN_HYDRATE_TTL_MS = 10_000;

/**
 * When an authorized Admin connects with a Firebase ID token, restores any missing users,
 * deposits, withdrawals, transactions, and tournament registrations from Firestore into SQLite.
 */
export async function hydrateAllAdminStateFromFirestore(
  adminIdToken: string,
  force = false
): Promise<void> {
  if (!adminIdToken) return;
  if (!force && Date.now() - lastAdminHydrateMs < ADMIN_HYDRATE_TTL_MS) return;
  if (inFlightAdminHydrate) return inFlightAdminHydrate;

  inFlightAdminHydrate = (async () => {
    try {
      await syncMissingTournamentsFromFirestore(force);

      const [
        deletedUserIds,
        userDocs,
        depDocs,
        wdDocs,
        txDocs,
        regDocs,
      ] = await Promise.all([
        fetchFirestoreDeletedUserIds(),
        fsRunQuery({ from: [{ collectionId: 'users' }], limit: 500 }, adminIdToken),
        fsRunQuery({ from: [{ collectionId: 'deposits' }], limit: 500 }, adminIdToken),
        fsRunQuery({ from: [{ collectionId: 'withdrawals' }], limit: 500 }, adminIdToken),
        fsRunQuery({ from: [{ collectionId: 'transactions' }], limit: 500 }, adminIdToken),
        fsRunQuery({ from: [{ collectionId: 'registrations', allDescendants: true }], limit: 500 }, adminIdToken),
      ]);

      const deletedSet = new Set(deletedUserIds);
      const parsedUsers = userDocs
        .map(parseCloudUserDoc)
        .filter((u): u is ParsedCloudUser => Boolean(u && (!u.sqliteId || !deletedSet.has(u.sqliteId))));

      const byEmail = new Map<string, ParsedCloudUser[]>();
      for (const u of parsedUsers) {
        const list = byEmail.get(u.email) || [];
        list.push(u);
        byEmail.set(u.email, list);
      }

      const touchedTournaments = new Set<number>();

      db.transaction(() => {
        const uidToLocalId = new Map<string, number>();

        for (const [, list] of byEmail.entries()) {
          const best = pickAuthoritativeCloudUser(list);
          if (!best) continue;
          const localId = insertOrMergeCloudUserIntoSqlite(best);
          if (localId > 0) {
            if (best.firebaseUid) uidToLocalId.set(best.firebaseUid, localId);
            uidToLocalId.set(best.docId, localId);
            for (const variant of list) {
              uidToLocalId.set(variant.docId, localId);
              if (variant.firebaseUid) uidToLocalId.set(variant.firebaseUid, localId);
            }
          }
        }

        const resolveLocalUser = (f: Record<string, FirestoreValue>): number => {
          const userUid = readString(f, 'user_uid', '').trim();
          if (userUid && uidToLocalId.has(userUid)) return uidToLocalId.get(userUid)!;
          if (userUid && !userUid.startsWith('sql_')) {
            const row = db
              .prepare('SELECT id FROM users WHERE firebase_uid = ?')
              .get(userUid) as { id: number } | undefined;
            if (row) return row.id;
          }
          const sqliteUid = readInt(f, 'sqlite_user_id', 0);
          if (sqliteUid > 0) {
            const row = db.prepare('SELECT id FROM users WHERE id = ?').get(sqliteUid) as
              | { id: number }
              | undefined;
            if (row) return row.id;
          }
          const email = readString(f, 'email', '').trim().toLowerCase();
          if (email) {
            const row = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email) as
              | { id: number }
              | undefined;
            if (row) return row.id;
          }
          return 0;
        };

        for (const d of depDocs) {
          if (!d.fields) continue;
          const uid = resolveLocalUser(d.fields);
          if (uid > 0) restoreCloudDepositDoc(d, uid);
        }
        for (const w of wdDocs) {
          if (!w.fields) continue;
          const uid = resolveLocalUser(w.fields);
          if (uid > 0) restoreCloudWithdrawalDoc(w, uid);
        }
        for (const t of txDocs) {
          if (!t.fields) continue;
          const uid = resolveLocalUser(t.fields);
          if (uid > 0) restoreCloudTransactionDoc(t, uid);
        }
        for (const r of regDocs) {
          if (!r.fields) continue;
          const uid = resolveLocalUser(r.fields);
          if (uid > 0) {
            const tid = restoreCloudRegistrationDoc(r, uid);
            if (tid > 0) touchedTournaments.add(tid);
          }
        }

        for (const tid of touchedTournaments) {
          const cntRow = db
            .prepare('SELECT COUNT(*) as cnt FROM tournament_registrations WHERE tournament_id = ?')
            .get(tid) as { cnt: number };
          db.prepare(
            'UPDATE tournaments SET filled_slots = MIN(max_slots, MAX(filled_slots, ?)) WHERE id = ?'
          ).run(cntRow.cnt, tid);
        }
      }).immediate();

      if (touchedTournaments.size > 0) {
        recalculateAllUserPoints();
      }
      lastAdminHydrateMs = Date.now();
    } catch (err) {
      console.warn('Firestore admin hydration notice:', err instanceof Error ? err.message : err);
    } finally {
      inFlightAdminHydrate = null;
    }
  })();

  return inFlightAdminHydrate;
}

function getFullUserAndWallet(userId: number): {
  user: SqliteUserFullRow;
  wallet: SqliteWalletFullRow;
} | null {
  const user = db
    .prepare(
      `SELECT id, firebase_uid, player_id, username, email, phone, avatar_url, role,
              is_blocked, wallet_balance, matches_played, wins, kills, points, created_at
       FROM users WHERE id = ?`
    )
    .get(userId) as SqliteUserFullRow | undefined;
  if (!user) return null;
  db.prepare('INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)').run(
    userId,
    Math.max(0, user.wallet_balance)
  );
  const wallet = db
    .prepare(
      `SELECT user_id, available_balance, pending_withdrawal, total_deposited, total_withdrawn, total_won
       FROM wallet_accounts WHERE user_id = ?`
    )
    .get(userId) as SqliteWalletFullRow;
  return { user, wallet };
}

function buildFullUserFields(
  user: SqliteUserFullRow,
  wallet: SqliteWalletFullRow,
  docId: string,
  includeCreatedAt: boolean
): Record<string, FirestoreValue> {
  const safeAvatar =
    user.avatar_url && user.avatar_url.length <= 512 ? user.avatar_url : DEFAULT_AVATAR;
  const safeUsername = user.username.trim().slice(0, 32) || 'Player';
  const fields: Record<string, FirestoreValue> = {
    uid: fsString(docId, 128),
    sqlite_id: fsInt(user.id),
    firebase_uid: fsString(user.firebase_uid || (docId.startsWith('sql_') ? '' : docId), 128),
    email: fsString(user.email.trim().toLowerCase(), 160),
    username: fsString(safeUsername.length >= 2 ? safeUsername : 'Player', 32),
    player_id: fsString(user.player_id || `PT-${user.id}`, 32),
    phone: fsString(user.phone || '', 32),
    avatar_url: fsString(safeAvatar, 512),
    role: fsString(user.role === 'admin' ? 'admin' : 'player', 16),
    is_blocked: fsInt(user.is_blocked === 1 ? 1 : 0),
    wallet_balance: fsInt(Math.max(0, user.wallet_balance)),
    pending_withdrawal: fsInt(Math.max(0, wallet.pending_withdrawal)),
    total_deposited: fsInt(Math.max(0, wallet.total_deposited)),
    total_withdrawn: fsInt(Math.max(0, wallet.total_withdrawn)),
    total_won: fsInt(Math.max(0, wallet.total_won)),
    matches_played: fsInt(Math.max(0, user.matches_played)),
    wins: fsInt(Math.max(0, user.wins)),
    kills: fsInt(Math.max(0, user.kills)),
    points: fsInt(Math.max(0, user.points)),
  };
  if (includeCreatedAt) {
    fields.created_at = fsTimestamp(user.created_at);
  }
  return fields;
}

function buildPublicUserFields(user: SqliteUserFullRow, docId: string): Record<string, FirestoreValue> {
  const safeAvatar =
    user.avatar_url && user.avatar_url.length <= 512 ? user.avatar_url : DEFAULT_AVATAR;
  const safeUsername = user.username.trim().slice(0, 32) || 'Player';
  return {
    uid: fsString(docId, 128),
    player_id: fsString(user.player_id || `PT-${user.id}`, 32),
    username: fsString(safeUsername.length >= 2 ? safeUsername : 'Player', 32),
    avatar_url: fsString(safeAvatar, 512),
    points: fsInt(Math.max(0, user.points)),
  };
}

/**
 * Ensures a Google user's `users/{uid}` and `users_public/{uid}` docs exist in Firestore
 * without ever resetting existing wallet balances.
 */
export async function ensureUserDocInFirestore(userId: number, actorIdToken: string): Promise<boolean> {
  const prefix = getFirestoreDocPrefix();
  if (!prefix || !actorIdToken) return false;
  const bundle = getFullUserAndWallet(userId);
  if (!bundle) return false;
  const { user, wallet } = bundle;
  const docId = getCanonicalUserDocId(user);
  const existingDoc = await fsGetDoc(`users/${encodeURIComponent(docId)}`, actorIdToken);
  const existingPub = await fsGetDoc(`users_public/${encodeURIComponent(docId)}`, actorIdToken);

  let createdUserDoc = false;
  const writes: FirestoreWrite[] = [];
  if (!existingDoc) {
    createdUserDoc = true;
    const fields = buildFullUserFields(user, wallet, docId, false);
    writes.push({
      update: { name: `${prefix}/users/${docId}`, fields },
      updateTransforms: [
        { fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' },
      ],
      currentDocument: { exists: false },
    });
  } else {
    const curFields = existingDoc.fields || {};
    const updateFields: Record<string, FirestoreValue> = {
      sqlite_id: fsInt(user.id),
      firebase_uid: fsString(user.firebase_uid || (docId.startsWith('sql_') ? '' : docId), 128),
      username: fsString(user.username.trim().slice(0, 32) || 'Player', 32),
      phone: fsString(user.phone || '', 32),
      avatar_url: fsString(
        user.avatar_url && user.avatar_url.length <= 512 ? user.avatar_url : DEFAULT_AVATAR,
        512
      ),
    };
    const fieldPaths = ['sqlite_id', 'firebase_uid', 'username', 'phone', 'avatar_url'];
    // Only sync if metadata changed or sqlite_id/firebase_uid missing
    if (
      readInt(curFields, 'sqlite_id', 0) !== user.id ||
      readString(curFields, 'firebase_uid', '') !== user.firebase_uid ||
      readString(curFields, 'username', '') !== user.username
    ) {
      writes.push({
        update: { name: `${prefix}/users/${docId}`, fields: updateFields },
        updateMask: { fieldPaths },
        updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: true },
      });
    }
  }

  if (!existingPub) {
    writes.push({
      update: { name: `${prefix}/users_public/${docId}`, fields: buildPublicUserFields(user, docId) },
      updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    });
  }

  if (writes.length > 0) {
    await fsCommit(writes, actorIdToken, 'ensureUserDoc');
  }
  return createdUserDoc;
}

export async function commitProfileUpdateToFirestore(
  userId: number,
  actorIdToken: string
): Promise<void> {
  const prefix = getFirestoreDocPrefix();
  if (!prefix || !actorIdToken) return;
  const bundle = getFullUserAndWallet(userId);
  if (!bundle) return;
  const { user } = bundle;
  const docId = getCanonicalUserDocId(user);
  await ensureUserDocInFirestore(userId, actorIdToken);
  const safeAvatar =
    user.avatar_url && user.avatar_url.length <= 512 ? user.avatar_url : DEFAULT_AVATAR;
  const safeUsername = user.username.trim().slice(0, 32) || 'Player';
  const writes: FirestoreWrite[] = [
    {
      update: {
        name: `${prefix}/users/${docId}`,
        fields: {
          sqlite_id: fsInt(user.id),
          firebase_uid: fsString(user.firebase_uid || '', 128),
          username: fsString(safeUsername, 32),
          phone: fsString(user.phone || '', 32),
          avatar_url: fsString(safeAvatar, 512),
        },
      },
      updateMask: { fieldPaths: ['sqlite_id', 'firebase_uid', 'username', 'phone', 'avatar_url'] },
      updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: true },
    },
    {
      update: {
        name: `${prefix}/users_public/${docId}`,
        fields: {
          username: fsString(safeUsername, 32),
          avatar_url: fsString(safeAvatar, 512),
        },
      },
      updateMask: { fieldPaths: ['username', 'avatar_url'] },
      updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: true },
    },
  ];
  await fsCommit(writes, actorIdToken, 'profileUpdate');
}

export async function commitTournamentJoinToFirestore(params: {
  userId: number;
  tournamentId: number;
  slotNumber: number;
  inGameName: string;
  inGameId: string;
  entryFee: number;
  txCode: string;
  tournamentTitle: string;
  actorIdToken: string;
}): Promise<void> {
  const prefix = getFirestoreDocPrefix();
  if (!prefix || !params.actorIdToken) return;

  const bundle = getFullUserAndWallet(params.userId);
  if (!bundle) return;
  const { user } = bundle;
  const userDocId = getCanonicalUserDocId(user);
  const tourDocId = `tour_${params.tournamentId}`;

  const justCreated = await ensureUserDocInFirestore(params.userId, params.actorIdToken);

  const [tourDoc, userDoc, regDoc] = await Promise.all([
    fsGetDoc(`tournaments/${tourDocId}`, params.actorIdToken),
    fsGetDoc(`users/${encodeURIComponent(userDocId)}`, params.actorIdToken),
    fsGetDoc(`tournaments/${tourDocId}/registrations/${encodeURIComponent(userDocId)}`, params.actorIdToken),
  ]);

  if (!tourDoc?.fields || !userDoc?.fields || regDoc) {
    return;
  }

  const cloudFilled = readInt(tourDoc.fields, 'filled_slots', 0);
  const cloudMax = Math.max(2, readInt(tourDoc.fields, 'max_slots', 48));
  const cloudEntryFee = Math.max(0, readInt(tourDoc.fields, 'entry_fee', params.entryFee));
  const cloudBal = Math.max(0, readInt(userDoc.fields, 'wallet_balance', user.wallet_balance));
  const cloudMatches = Math.max(0, readInt(userDoc.fields, 'matches_played', 0));
  const cloudPoints = Math.max(0, readInt(userDoc.fields, 'points', 0));

  if (cloudFilled >= cloudMax || (!justCreated && cloudBal < cloudEntryFee)) {
    return;
  }

  const nextCloudBal = justCreated ? user.wallet_balance : cloudBal - cloudEntryFee;
  const nextFilled = cloudFilled + 1;

  const writes: FirestoreWrite[] = [
    {
      update: {
        name: `${prefix}/tournaments/${tourDocId}/registrations/${userDocId}`,
        fields: {
          tournament_id: fsInt(params.tournamentId),
          user_uid: fsString(userDocId, 128),
          sqlite_user_id: fsInt(user.id),
          player_id: fsString(user.player_id, 32),
          username: fsString(user.username, 32),
          in_game_name: fsString(params.inGameName, 64),
          in_game_id: fsString(params.inGameId, 64),
          slot_number: fsInt(params.slotNumber),
          status: fsString('registered', 16),
        },
      },
      updateTransforms: [{ fieldPath: 'registered_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    },
    {
      update: {
        name: `${prefix}/tournaments/${tourDocId}`,
        fields: {
          filled_slots: fsInt(nextFilled),
        },
      },
      updateMask: { fieldPaths: ['filled_slots'] },
      updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: tourDoc.updateTime ? { updateTime: tourDoc.updateTime } : { exists: true },
    },
  ];

  if (!justCreated) {
    writes.push({
      update: {
        name: `${prefix}/users/${userDocId}`,
        fields: {
          wallet_balance: fsInt(nextCloudBal),
          matches_played: fsInt(cloudMatches + 1),
          points: fsInt(cloudPoints + 10),
        },
      },
      updateMask: { fieldPaths: ['wallet_balance', 'matches_played', 'points'] },
      updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: userDoc.updateTime ? { updateTime: userDoc.updateTime } : { exists: true },
    });
  }

  if (cloudEntryFee > 0 && params.txCode) {
    writes.push({
      update: {
        name: `${prefix}/transactions/${params.txCode}`,
        fields: {
          tx_code: fsString(params.txCode, 64),
          user_uid: fsString(userDocId, 128),
          sqlite_user_id: fsInt(user.id),
          player_id: fsString(user.player_id, 32),
          username: fsString(user.username, 32),
          type: fsString('entry_fee', 32),
          amount: fsInt(cloudEntryFee),
          direction: fsString('debit', 16),
          balance_after: fsInt(nextCloudBal),
          status: fsString('completed', 16),
          reference_id: fsString(`TOUR-${params.tournamentId}`, 64),
          description: fsString(`Entry fee for ${params.tournamentTitle}`, 300),
        },
      },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    });
  }

  await fsCommit(writes, params.actorIdToken, 'tournamentJoin');
}

export async function commitDepositCreateToFirestore(params: {
  depositId: number;
  userId: number;
  txCode: string;
  actorIdToken: string;
}): Promise<void> {
  const prefix = getFirestoreDocPrefix();
  if (!prefix || !params.actorIdToken) return;
  const bundle = getFullUserAndWallet(params.userId);
  if (!bundle) return;
  const dep = db.prepare('SELECT * FROM deposits WHERE id = ?').get(params.depositId) as
    | {
        id: number;
        firestore_key: string;
        amount: number;
        method: string;
        transaction_ref: string;
        sender_account: string;
        screenshot_data: string;
        status: string;
        admin_note: string;
      }
    | undefined;
  if (!dep) return;

  const { user, wallet } = bundle;
  const userDocId = getCanonicalUserDocId(user);
  const depositKey = dep.firestore_key || generateFirestoreRecordKey('DEP');
  await ensureUserDocInFirestore(params.userId, params.actorIdToken);

  const screenshotPreview =
    dep.screenshot_data && dep.screenshot_data.length <= 420_000 ? dep.screenshot_data : '';

  const depFields: Record<string, FirestoreValue> = {
    id: fsInt(dep.id),
    deposit_key: fsString(depositKey, 128),
    user_uid: fsString(userDocId, 128),
    sqlite_user_id: fsInt(user.id),
    player_id: fsString(user.player_id, 32),
    username: fsString(user.username, 32),
    email: fsString(user.email.toLowerCase(), 160),
    amount: fsInt(dep.amount),
    method: fsString(dep.method, 16),
    transaction_ref: fsString(dep.transaction_ref, 64),
    sender_account: fsString(dep.sender_account, 64),
    has_screenshot: fsBool(Boolean(dep.screenshot_data)),
    status: fsString('pending', 16),
    admin_note: fsString('', 250),
  };
  if (screenshotPreview) {
    depFields.screenshot_preview = fsString(screenshotPreview, 450_000);
  }

  const writes: FirestoreWrite[] = [
    {
      update: { name: `${prefix}/deposits/${depositKey}`, fields: depFields },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    },
    {
      update: {
        name: `${prefix}/transactions/${params.txCode}`,
        fields: {
          tx_code: fsString(params.txCode, 64),
          user_uid: fsString(userDocId, 128),
          sqlite_user_id: fsInt(user.id),
          player_id: fsString(user.player_id, 32),
          username: fsString(user.username, 32),
          type: fsString('deposit', 32),
          amount: fsInt(dep.amount),
          direction: fsString('credit', 16),
          balance_after: fsInt(wallet.available_balance),
          status: fsString('pending', 16),
          reference_id: fsString(`DEP-${dep.id}`, 64),
          description: fsString(
            `Deposit request via ${dep.method.replace('_', ' ')} (TID: ${dep.transaction_ref})`,
            300
          ),
        },
      },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    },
  ];

  await fsCommit(writes, params.actorIdToken, 'depositCreate');
}

export async function commitWithdrawalCreateToFirestore(params: {
  withdrawalId: number;
  userId: number;
  txCode: string;
  actorIdToken: string;
}): Promise<void> {
  const prefix = getFirestoreDocPrefix();
  if (!prefix || !params.actorIdToken) return;
  const bundle = getFullUserAndWallet(params.userId);
  if (!bundle) return;
  const wd = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(params.withdrawalId) as
    | {
        id: number;
        firestore_key: string;
        amount: number;
        method: string;
        bank_name: string;
        account_title: string;
        account_number: string;
        status: string;
      }
    | undefined;
  if (!wd) return;

  const { user, wallet } = bundle;
  const userDocId = getCanonicalUserDocId(user);
  const wdKey = wd.firestore_key || generateFirestoreRecordKey('WD');
  const justCreated = await ensureUserDocInFirestore(params.userId, params.actorIdToken);

  const userDoc = await fsGetDoc(`users/${encodeURIComponent(userDocId)}`, params.actorIdToken);
  const cloudBal = userDoc?.fields ? readInt(userDoc.fields, 'wallet_balance', wallet.available_balance) : wallet.available_balance;
  const cloudPending = userDoc?.fields ? readInt(userDoc.fields, 'pending_withdrawal', 0) : 0;
  const nextCloudPending = justCreated
    ? Math.min(cloudBal, wallet.pending_withdrawal)
    : Math.min(cloudBal, cloudPending + wd.amount);

  const methodLabel =
    wd.method === 'bank_account'
      ? `${wd.bank_name} Bank`
      : wd.method === 'easypaisa'
        ? 'Easypaisa'
        : 'JazzCash';

  const writes: FirestoreWrite[] = [
    {
      update: {
        name: `${prefix}/withdrawals/${wdKey}`,
        fields: {
          id: fsInt(wd.id),
          withdrawal_key: fsString(wdKey, 128),
          user_uid: fsString(userDocId, 128),
          sqlite_user_id: fsInt(user.id),
          player_id: fsString(user.player_id, 32),
          username: fsString(user.username, 32),
          email: fsString(user.email.toLowerCase(), 160),
          amount: fsInt(wd.amount),
          method: fsString(wd.method, 24),
          bank_name: fsString(wd.bank_name || '', 64),
          account_title: fsString(wd.account_title, 64),
          account_number: fsString(wd.account_number, 34),
          status: fsString('pending', 16),
          admin_note: fsString('', 250),
        },
      },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    },
    {
      update: {
        name: `${prefix}/transactions/${params.txCode}`,
        fields: {
          tx_code: fsString(params.txCode, 64),
          user_uid: fsString(userDocId, 128),
          sqlite_user_id: fsInt(user.id),
          player_id: fsString(user.player_id, 32),
          username: fsString(user.username, 32),
          type: fsString('withdrawal', 32),
          amount: fsInt(wd.amount),
          direction: fsString('debit', 16),
          balance_after: fsInt(cloudBal),
          status: fsString('pending', 16),
          reference_id: fsString(`WD-${wd.id}`, 64),
          description: fsString(
            `Withdrawal request via ${methodLabel} (${wd.account_number}) — Pending verification`,
            300
          ),
        },
      },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    },
  ];

  if (userDoc && !justCreated) {
    writes.push({
      update: {
        name: `${prefix}/users/${userDocId}`,
        fields: { pending_withdrawal: fsInt(nextCloudPending) },
      },
      updateMask: { fieldPaths: ['pending_withdrawal'] },
      updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: userDoc.updateTime ? { updateTime: userDoc.updateTime } : { exists: true },
    });
  }

  await fsCommit(writes, params.actorIdToken, 'withdrawalCreate');
}

export async function commitTransferToFirestore(params: {
  senderId: number;
  recipientId: number;
  amount: number;
  txOutCode: string;
  txInCode: string;
  outDescription: string;
  inDescription: string;
  senderIdToken: string;
}): Promise<void> {
  const prefix = getFirestoreDocPrefix();
  if (!prefix || !params.senderIdToken) return;
  const senderBundle = getFullUserAndWallet(params.senderId);
  const recipientBundle = getFullUserAndWallet(params.recipientId);
  if (!senderBundle || !recipientBundle) return;

  const senderDocId = getCanonicalUserDocId(senderBundle.user);
  const recipientDocId = getCanonicalUserDocId(recipientBundle.user);

  await ensureUserDocInFirestore(params.senderId, params.senderIdToken);
  const [senderDoc, recipientDoc] = await Promise.all([
    fsGetDoc(`users/${encodeURIComponent(senderDocId)}`, params.senderIdToken),
    fsGetDoc(`users/${encodeURIComponent(recipientDocId)}`, params.senderIdToken),
  ]);
  if (!senderDoc?.fields) return;

  const sCloudBal = readInt(senderDoc.fields, 'wallet_balance', senderBundle.user.wallet_balance + params.amount);
  if (sCloudBal < params.amount) return;
  const nextSenderBal = sCloudBal - params.amount;

  const writes: FirestoreWrite[] = [
    {
      update: {
        name: `${prefix}/users/${senderDocId}`,
        fields: { wallet_balance: fsInt(nextSenderBal) },
      },
      updateMask: { fieldPaths: ['wallet_balance'] },
      updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: senderDoc.updateTime ? { updateTime: senderDoc.updateTime } : { exists: true },
    },
    {
      update: {
        name: `${prefix}/transactions/${params.txOutCode}`,
        fields: {
          tx_code: fsString(params.txOutCode, 64),
          user_uid: fsString(senderDocId, 128),
          sqlite_user_id: fsInt(senderBundle.user.id),
          player_id: fsString(senderBundle.user.player_id, 32),
          username: fsString(senderBundle.user.username, 32),
          type: fsString('transfer_out', 32),
          amount: fsInt(params.amount),
          direction: fsString('debit', 16),
          balance_after: fsInt(nextSenderBal),
          status: fsString('completed', 16),
          reference_id: fsString(`XFER-${recipientBundle.user.player_id}`, 64),
          description: fsString(params.outDescription, 300),
        },
      },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    },
  ];

  if (recipientDoc?.fields) {
    const rCloudBal = readInt(
      recipientDoc.fields,
      'wallet_balance',
      Math.max(0, recipientBundle.user.wallet_balance - params.amount)
    );
    const nextRecipientBal = rCloudBal + params.amount;
    writes.push(
      {
        update: {
          name: `${prefix}/users/${recipientDocId}`,
          fields: { wallet_balance: fsInt(nextRecipientBal) },
        },
        updateMask: { fieldPaths: ['wallet_balance'] },
        updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: recipientDoc.updateTime
          ? { updateTime: recipientDoc.updateTime }
          : { exists: true },
      },
      {
        update: {
          name: `${prefix}/transactions/${params.txInCode}`,
          fields: {
            tx_code: fsString(params.txInCode, 64),
            user_uid: fsString(recipientDocId, 128),
            sqlite_user_id: fsInt(recipientBundle.user.id),
            player_id: fsString(recipientBundle.user.player_id, 32),
            username: fsString(recipientBundle.user.username, 32),
            type: fsString('transfer_in', 32),
            amount: fsInt(params.amount),
            direction: fsString('credit', 16),
            balance_after: fsInt(nextRecipientBal),
            status: fsString('completed', 16),
            reference_id: fsString(`XFER-${senderBundle.user.player_id}`, 64),
            description: fsString(params.inDescription, 300),
          },
        },
        updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      }
    );
  }

  await fsCommit(writes, params.senderIdToken, 'p2pTransfer');
}

export async function commitLuckyDrawToFirestore(params: {
  userId: number;
  drawDatePkt: string;
  prizeAmount: number;
  prizeLabel: string;
  txCode: string | null;
  actorIdToken: string;
}): Promise<void> {
  const prefix = getFirestoreDocPrefix();
  if (!prefix || !params.actorIdToken) return;
  const bundle = getFullUserAndWallet(params.userId);
  if (!bundle) return;
  const { user } = bundle;
  const userDocId = getCanonicalUserDocId(user);
  const justCreated = await ensureUserDocInFirestore(params.userId, params.actorIdToken);

  const userDoc = await fsGetDoc(`users/${encodeURIComponent(userDocId)}`, params.actorIdToken);
  if (!userDoc?.fields) return;
  const cloudBal = readInt(userDoc.fields, 'wallet_balance', Math.max(0, user.wallet_balance - params.prizeAmount));
  const nextCloudBal = justCreated ? user.wallet_balance : cloudBal + Math.max(0, params.prizeAmount);
  const drawKey = `${userDocId}_${params.drawDatePkt}`;

  const writes: FirestoreWrite[] = [
    {
      update: {
        name: `${prefix}/users/${userDocId}`,
        fields: justCreated
          ? { last_lucky_draw_pkt: fsString(params.drawDatePkt, 16) }
          : {
              wallet_balance: fsInt(nextCloudBal),
              last_lucky_draw_pkt: fsString(params.drawDatePkt, 16),
            },
      },
      updateMask: {
        fieldPaths: justCreated ? ['last_lucky_draw_pkt'] : ['wallet_balance', 'last_lucky_draw_pkt'],
      },
      updateTransforms: [
        { fieldPath: 'last_lucky_draw_at', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' },
      ],
      currentDocument: userDoc.updateTime ? { updateTime: userDoc.updateTime } : { exists: true },
    },
    {
      update: {
        name: `${prefix}/lucky_draws/${drawKey}`,
        fields: {
          user_uid: fsString(userDocId, 128),
          sqlite_user_id: fsInt(user.id),
          draw_date_pkt: fsString(params.drawDatePkt, 10),
          prize_amount: fsInt(params.prizeAmount),
          prize_label: fsString(params.prizeLabel, 64),
        },
      },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    },
  ];

  if (params.prizeAmount > 0 && params.txCode) {
    writes.push({
      update: {
        name: `${prefix}/transactions/${params.txCode}`,
        fields: {
          tx_code: fsString(params.txCode, 64),
          user_uid: fsString(userDocId, 128),
          sqlite_user_id: fsInt(user.id),
          player_id: fsString(user.player_id, 32),
          username: fsString(user.username, 32),
          type: fsString('lucky_draw', 32),
          amount: fsInt(params.prizeAmount),
          direction: fsString('credit', 16),
          balance_after: fsInt(nextCloudBal),
          status: fsString('completed', 16),
          reference_id: fsString(`LUCKY-${params.drawDatePkt}`, 64),
          description: fsString(`Daily Lucky Draw Reward — ${params.prizeLabel}`, 300),
        },
      },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    });
  }

  await fsCommit(writes, params.actorIdToken, 'luckyDraw');
}

function buildAdminUserUpsertWrites(
  prefix: string,
  user: SqliteUserFullRow,
  wallet: SqliteWalletFullRow,
  userExistsInCloud: boolean,
  pubExistsInCloud: boolean
): FirestoreWrite[] {
  const docId = getCanonicalUserDocId(user);
  const writes: FirestoreWrite[] = [];
  if (userExistsInCloud) {
    writes.push({
      update: {
        name: `${prefix}/users/${docId}`,
        fields: {
          sqlite_id: fsInt(user.id),
          firebase_uid: fsString(user.firebase_uid || (docId.startsWith('sql_') ? '' : docId), 128),
          username: fsString(user.username.trim().slice(0, 32) || 'Player', 32),
          phone: fsString(user.phone || '', 32),
          avatar_url: fsString(
            user.avatar_url && user.avatar_url.length <= 512 ? user.avatar_url : DEFAULT_AVATAR,
            512
          ),
          role: fsString(user.role, 16),
          is_blocked: fsInt(user.is_blocked),
          wallet_balance: fsInt(user.wallet_balance),
          pending_withdrawal: fsInt(wallet.pending_withdrawal),
          total_deposited: fsInt(wallet.total_deposited),
          total_withdrawn: fsInt(wallet.total_withdrawn),
          total_won: fsInt(wallet.total_won),
          matches_played: fsInt(user.matches_played),
          wins: fsInt(user.wins),
          kills: fsInt(user.kills),
          points: fsInt(user.points),
        },
      },
      updateMask: {
        fieldPaths: [
          'sqlite_id',
          'firebase_uid',
          'username',
          'phone',
          'avatar_url',
          'role',
          'is_blocked',
          'wallet_balance',
          'pending_withdrawal',
          'total_deposited',
          'total_withdrawn',
          'total_won',
          'matches_played',
          'wins',
          'kills',
          'points',
        ],
      },
      updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: true },
    });
  } else {
    writes.push({
      update: {
        name: `${prefix}/users/${docId}`,
        fields: buildFullUserFields(user, wallet, docId, false),
      },
      updateTransforms: [
        { fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' },
        { fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' },
      ],
      currentDocument: { exists: false },
    });
  }

  writes.push({
    update: {
      name: `${prefix}/users_public/${docId}`,
      fields: buildPublicUserFields(user, docId),
    },
    updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: pubExistsInCloud },
  });
  return writes;
}

export async function commitAdminUserSyncToFirestore(
  userId: number,
  txRow: {
    tx_code: string;
    type: string;
    amount: number;
    direction: string;
    balance_after: number;
    status: string;
    reference_id: string;
    description: string;
  } | null,
  adminIdToken: string
): Promise<void> {
  const prefix = getFirestoreDocPrefix();
  if (!prefix || !adminIdToken) return;
  const bundle = getFullUserAndWallet(userId);
  if (!bundle) return;
  const docId = getCanonicalUserDocId(bundle.user);
  const [userDoc, pubDoc] = await Promise.all([
    fsGetDoc(`users/${encodeURIComponent(docId)}`, adminIdToken),
    fsGetDoc(`users_public/${encodeURIComponent(docId)}`, adminIdToken),
  ]);

  const writes = buildAdminUserUpsertWrites(
    prefix,
    bundle.user,
    bundle.wallet,
    Boolean(userDoc),
    Boolean(pubDoc)
  );

  if (txRow) {
    writes.push({
      update: {
        name: `${prefix}/transactions/${txRow.tx_code}`,
        fields: {
          tx_code: fsString(txRow.tx_code, 64),
          user_uid: fsString(docId, 128),
          sqlite_user_id: fsInt(bundle.user.id),
          player_id: fsString(bundle.user.player_id, 32),
          username: fsString(bundle.user.username, 32),
          type: fsString(txRow.type, 32),
          amount: fsInt(txRow.amount),
          direction: fsString(txRow.direction, 16),
          balance_after: fsInt(txRow.balance_after),
          status: fsString(txRow.status, 16),
          reference_id: fsString(txRow.reference_id, 64),
          description: fsString(txRow.description, 300),
        },
      },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    });
  }

  await fsCommit(writes, adminIdToken, 'adminUserSync');
}

export async function commitAdminDepositReviewToFirestore(
  depositId: number,
  adminIdToken: string
): Promise<void> {
  const prefix = getFirestoreDocPrefix();
  if (!prefix || !adminIdToken) return;
  const dep = db.prepare('SELECT * FROM deposits WHERE id = ?').get(depositId) as
    | {
        id: number;
        user_id: number;
        firestore_key: string;
        amount: number;
        method: string;
        transaction_ref: string;
        sender_account: string;
        screenshot_data: string;
        status: string;
        admin_note: string;
        reviewed_at: string | null;
      }
    | undefined;
  if (!dep) return;

  const bundle = getFullUserAndWallet(dep.user_id);
  if (!bundle) return;
  const docId = getCanonicalUserDocId(bundle.user);
  const depKey = dep.firestore_key || `DEP-SQL-${dep.id}`;
  if (!dep.firestore_key) {
    db.prepare('UPDATE deposits SET firestore_key = ? WHERE id = ?').run(depKey, dep.id);
  }

  const txRow = db
    .prepare("SELECT * FROM transactions WHERE reference_id = ? AND type = 'deposit' AND user_id = ? ORDER BY id DESC LIMIT 1")
    .get(`DEP-${dep.id}`, dep.user_id) as
    | {
        tx_code: string;
        amount: number;
        balance_after: number;
        status: string;
        description: string;
      }
    | undefined;

  const [userDoc, pubDoc, depDoc, txDoc] = await Promise.all([
    fsGetDoc(`users/${encodeURIComponent(docId)}`, adminIdToken),
    fsGetDoc(`users_public/${encodeURIComponent(docId)}`, adminIdToken),
    fsGetDoc(`deposits/${encodeURIComponent(depKey)}`, adminIdToken),
    txRow ? fsGetDoc(`transactions/${encodeURIComponent(txRow.tx_code)}`, adminIdToken) : Promise.resolve(null),
  ]);

  const writes = buildAdminUserUpsertWrites(
    prefix,
    bundle.user,
    bundle.wallet,
    Boolean(userDoc),
    Boolean(pubDoc)
  );

  if (depDoc) {
    writes.push({
      update: {
        name: `${prefix}/deposits/${depKey}`,
        fields: {
          id: fsInt(dep.id),
          status: fsString(dep.status, 16),
          admin_note: fsString(dep.admin_note || '', 250),
          reviewed_at: fsString(dep.reviewed_at || new Date().toISOString(), 64),
          ...(txRow ? { tx_code: fsString(txRow.tx_code, 64) } : {}),
        },
      },
      updateMask: {
        fieldPaths: txRow ? ['id', 'status', 'admin_note', 'reviewed_at', 'tx_code'] : ['id', 'status', 'admin_note', 'reviewed_at'],
      },
      currentDocument: { exists: true },
    });
  } else {
    writes.push({
      update: {
        name: `${prefix}/deposits/${depKey}`,
        fields: {
          id: fsInt(dep.id),
          deposit_key: fsString(depKey, 128),
          user_uid: fsString(docId, 128),
          sqlite_user_id: fsInt(bundle.user.id),
          player_id: fsString(bundle.user.player_id, 32),
          username: fsString(bundle.user.username, 32),
          email: fsString(bundle.user.email.toLowerCase(), 160),
          amount: fsInt(dep.amount),
          method: fsString(dep.method, 16),
          transaction_ref: fsString(dep.transaction_ref, 64),
          sender_account: fsString(dep.sender_account, 64),
          has_screenshot: fsBool(Boolean(dep.screenshot_data)),
          status: fsString(dep.status, 16),
          admin_note: fsString(dep.admin_note || '', 250),
          reviewed_at: fsString(dep.reviewed_at || new Date().toISOString(), 64),
          ...(txRow ? { tx_code: fsString(txRow.tx_code, 64) } : {}),
        },
      },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    });
  }

  if (txRow) {
    if (txDoc) {
      writes.push({
        update: {
          name: `${prefix}/transactions/${txRow.tx_code}`,
          fields: {
            status: fsString(txRow.status, 16),
            balance_after: fsInt(txRow.balance_after),
            description: fsString(txRow.description, 300),
          },
        },
        updateMask: { fieldPaths: ['status', 'balance_after', 'description'] },
        currentDocument: { exists: true },
      });
    } else {
      writes.push({
        update: {
          name: `${prefix}/transactions/${txRow.tx_code}`,
          fields: {
            tx_code: fsString(txRow.tx_code, 64),
            user_uid: fsString(docId, 128),
            sqlite_user_id: fsInt(bundle.user.id),
            player_id: fsString(bundle.user.player_id, 32),
            username: fsString(bundle.user.username, 32),
            type: fsString('deposit', 32),
            amount: fsInt(txRow.amount),
            direction: fsString('credit', 16),
            balance_after: fsInt(txRow.balance_after),
            status: fsString(txRow.status, 16),
            reference_id: fsString(`DEP-${dep.id}`, 64),
            description: fsString(txRow.description, 300),
          },
        },
        updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      });
    }
  }

  await fsCommit(writes, adminIdToken, 'adminDepositReview');
}

export async function commitAdminWithdrawalReviewToFirestore(
  withdrawalId: number,
  adminIdToken: string
): Promise<void> {
  const prefix = getFirestoreDocPrefix();
  if (!prefix || !adminIdToken) return;
  const wd = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId) as
    | {
        id: number;
        user_id: number;
        firestore_key: string;
        amount: number;
        method: string;
        bank_name: string;
        account_title: string;
        account_number: string;
        status: string;
        admin_note: string;
        reviewed_at: string | null;
      }
    | undefined;
  if (!wd) return;

  const bundle = getFullUserAndWallet(wd.user_id);
  if (!bundle) return;
  const docId = getCanonicalUserDocId(bundle.user);
  const wdKey = wd.firestore_key || `WD-SQL-${wd.id}`;
  if (!wd.firestore_key) {
    db.prepare('UPDATE withdrawals SET firestore_key = ? WHERE id = ?').run(wdKey, wd.id);
  }

  const txRow = db
    .prepare("SELECT * FROM transactions WHERE reference_id = ? AND type = 'withdrawal' AND user_id = ? ORDER BY id DESC LIMIT 1")
    .get(`WD-${wd.id}`, wd.user_id) as
    | {
        tx_code: string;
        amount: number;
        balance_after: number;
        status: string;
        description: string;
      }
    | undefined;

  const [userDoc, pubDoc, wdDoc, txDoc] = await Promise.all([
    fsGetDoc(`users/${encodeURIComponent(docId)}`, adminIdToken),
    fsGetDoc(`users_public/${encodeURIComponent(docId)}`, adminIdToken),
    fsGetDoc(`withdrawals/${encodeURIComponent(wdKey)}`, adminIdToken),
    txRow ? fsGetDoc(`transactions/${encodeURIComponent(txRow.tx_code)}`, adminIdToken) : Promise.resolve(null),
  ]);

  const writes = buildAdminUserUpsertWrites(
    prefix,
    bundle.user,
    bundle.wallet,
    Boolean(userDoc),
    Boolean(pubDoc)
  );

  if (wdDoc) {
    writes.push({
      update: {
        name: `${prefix}/withdrawals/${wdKey}`,
        fields: {
          id: fsInt(wd.id),
          status: fsString(wd.status, 16),
          admin_note: fsString(wd.admin_note || '', 250),
          reviewed_at: fsString(wd.reviewed_at || new Date().toISOString(), 64),
          ...(txRow ? { tx_code: fsString(txRow.tx_code, 64) } : {}),
        },
      },
      updateMask: {
        fieldPaths: txRow ? ['id', 'status', 'admin_note', 'reviewed_at', 'tx_code'] : ['id', 'status', 'admin_note', 'reviewed_at'],
      },
      currentDocument: { exists: true },
    });
  } else {
    writes.push({
      update: {
        name: `${prefix}/withdrawals/${wdKey}`,
        fields: {
          id: fsInt(wd.id),
          withdrawal_key: fsString(wdKey, 128),
          user_uid: fsString(docId, 128),
          sqlite_user_id: fsInt(bundle.user.id),
          player_id: fsString(bundle.user.player_id, 32),
          username: fsString(bundle.user.username, 32),
          email: fsString(bundle.user.email.toLowerCase(), 160),
          amount: fsInt(wd.amount),
          method: fsString(wd.method, 24),
          bank_name: fsString(wd.bank_name || '', 64),
          account_title: fsString(wd.account_title, 64),
          account_number: fsString(wd.account_number, 34),
          status: fsString(wd.status, 16),
          admin_note: fsString(wd.admin_note || '', 250),
          reviewed_at: fsString(wd.reviewed_at || new Date().toISOString(), 64),
          ...(txRow ? { tx_code: fsString(txRow.tx_code, 64) } : {}),
        },
      },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    });
  }

  if (txRow) {
    if (txDoc) {
      writes.push({
        update: {
          name: `${prefix}/transactions/${txRow.tx_code}`,
          fields: {
            status: fsString(txRow.status, 16),
            balance_after: fsInt(txRow.balance_after),
            description: fsString(txRow.description, 300),
          },
        },
        updateMask: { fieldPaths: ['status', 'balance_after', 'description'] },
        currentDocument: { exists: true },
      });
    } else {
      writes.push({
        update: {
          name: `${prefix}/transactions/${txRow.tx_code}`,
          fields: {
            tx_code: fsString(txRow.tx_code, 64),
            user_uid: fsString(docId, 128),
            sqlite_user_id: fsInt(bundle.user.id),
            player_id: fsString(bundle.user.player_id, 32),
            username: fsString(bundle.user.username, 32),
            type: fsString('withdrawal', 32),
            amount: fsInt(txRow.amount),
            direction: fsString('debit', 16),
            balance_after: fsInt(txRow.balance_after),
            status: fsString(txRow.status, 16),
            reference_id: fsString(`WD-${wd.id}`, 64),
            description: fsString(txRow.description, 300),
          },
        },
        updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      });
    }
  }

  await fsCommit(writes, adminIdToken, 'adminWithdrawalReview');
}

export async function commitAdminPlayerChangeToFirestore(params: {
  action: 'add' | 'remove';
  tournamentId: number;
  targetUserId: number;
  inGameName?: string;
  inGameId?: string;
  slotNumber?: number;
  txRow: {
    tx_code: string;
    type: string;
    amount: number;
    direction: string;
    balance_after: number;
    status: string;
    reference_id: string;
    description: string;
  } | null;
  adminIdToken: string;
}): Promise<void> {
  const prefix = getFirestoreDocPrefix();
  if (!prefix || !params.adminIdToken) return;

  const bundle = getFullUserAndWallet(params.targetUserId);
  if (!bundle) return;
  const userDocId = getCanonicalUserDocId(bundle.user);
  const tourDocId = `tour_${params.tournamentId}`;
  const tourRow = db.prepare('SELECT filled_slots FROM tournaments WHERE id = ?').get(params.tournamentId) as
    | { filled_slots: number }
    | undefined;

  const [tourDoc, userDoc, pubDoc] = await Promise.all([
    fsGetDoc(`tournaments/${tourDocId}`, params.adminIdToken),
    fsGetDoc(`users/${encodeURIComponent(userDocId)}`, params.adminIdToken),
    fsGetDoc(`users_public/${encodeURIComponent(userDocId)}`, params.adminIdToken),
  ]);

  const writes = buildAdminUserUpsertWrites(
    prefix,
    bundle.user,
    bundle.wallet,
    Boolean(userDoc),
    Boolean(pubDoc)
  );

  if (tourDoc && tourRow) {
    writes.push({
      update: {
        name: `${prefix}/tournaments/${tourDocId}`,
        fields: { filled_slots: fsInt(tourRow.filled_slots) },
      },
      updateMask: { fieldPaths: ['filled_slots'] },
      updateTransforms: [{ fieldPath: 'updated_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: true },
    });
  }

  if (tourDoc) {
    if (params.action === 'add') {
      writes.push({
        update: {
          name: `${prefix}/tournaments/${tourDocId}/registrations/${userDocId}`,
          fields: {
            tournament_id: fsInt(params.tournamentId),
            user_uid: fsString(userDocId, 128),
            sqlite_user_id: fsInt(bundle.user.id),
            player_id: fsString(bundle.user.player_id, 32),
            username: fsString(bundle.user.username, 32),
            in_game_name: fsString(params.inGameName || bundle.user.username, 64),
            in_game_id: fsString(params.inGameId || bundle.user.player_id, 64),
            slot_number: fsInt(params.slotNumber || 1),
            status: fsString('registered', 16),
          },
        },
        updateTransforms: [{ fieldPath: 'registered_at', setToServerValue: 'REQUEST_TIME' }],
        currentDocument: { exists: false },
      });
    } else {
      writes.push({
        delete: `${prefix}/tournaments/${tourDocId}/registrations/${userDocId}`,
      });
    }
  }

  if (params.txRow) {
    writes.push({
      update: {
        name: `${prefix}/transactions/${params.txRow.tx_code}`,
        fields: {
          tx_code: fsString(params.txRow.tx_code, 64),
          user_uid: fsString(userDocId, 128),
          sqlite_user_id: fsInt(bundle.user.id),
          player_id: fsString(bundle.user.player_id, 32),
          username: fsString(bundle.user.username, 32),
          type: fsString(params.txRow.type, 32),
          amount: fsInt(params.txRow.amount),
          direction: fsString(params.txRow.direction, 16),
          balance_after: fsInt(params.txRow.balance_after),
          status: fsString(params.txRow.status, 16),
          reference_id: fsString(params.txRow.reference_id, 64),
          description: fsString(params.txRow.description, 300),
        },
      },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    });
  }

  await fsCommit(writes, params.adminIdToken, 'adminPlayerChange');
}

export async function commitAdminTournamentDeleteRefundsToFirestore(params: {
  tournamentId: number;
  refunded: Array<{
    userId: number;
    tx_code: string;
    amount: number;
    balance_after: number;
    description: string;
  }>;
  adminIdToken: string;
}): Promise<void> {
  if (!params.adminIdToken || params.refunded.length === 0) return;
  for (const r of params.refunded) {
    await commitAdminUserSyncToFirestore(
      r.userId,
      {
        tx_code: r.tx_code,
        type: 'refund',
        amount: r.amount,
        direction: 'credit',
        balance_after: r.balance_after,
        status: 'completed',
        reference_id: `TOUR-${params.tournamentId}`,
        description: r.description,
      },
      params.adminIdToken
    );
  }
}

export async function commitAdminTournamentWinnersToFirestore(params: {
  tournamentId: number;
  txIdsCreated: number[];
  affectedUserIds: number[];
  adminIdToken: string;
}): Promise<void> {
  if (!params.adminIdToken) return;
  const prefix = getFirestoreDocPrefix();
  if (!prefix) return;

  const tourDocId = `tour_${params.tournamentId}`;
  const tourDoc = await fsGetDoc(`tournaments/${tourDocId}`, params.adminIdToken);
  const regRows = db
    .prepare('SELECT user_id, in_game_name, in_game_id, slot_number, status FROM tournament_registrations WHERE tournament_id = ?')
    .all(params.tournamentId) as Array<{
    user_id: number;
    in_game_name: string;
    in_game_id: string;
    slot_number: number;
    status: string;
  }>;

  for (const uid of params.affectedUserIds) {
    await commitAdminUserSyncToFirestore(uid, null, params.adminIdToken);
  }

  const writes: FirestoreWrite[] = [];
  if (tourDoc) {
    for (const r of regRows) {
      const bundle = getFullUserAndWallet(r.user_id);
      if (!bundle) continue;
      const uDocId = getCanonicalUserDocId(bundle.user);
      const regExists = await fsGetDoc(
        `tournaments/${tourDocId}/registrations/${encodeURIComponent(uDocId)}`,
        params.adminIdToken
      );
      if (!regExists) {
        writes.push({
          update: {
            name: `${prefix}/tournaments/${tourDocId}/registrations/${uDocId}`,
            fields: {
              tournament_id: fsInt(params.tournamentId),
              user_uid: fsString(uDocId, 128),
              sqlite_user_id: fsInt(bundle.user.id),
              player_id: fsString(bundle.user.player_id, 32),
              username: fsString(bundle.user.username, 32),
              in_game_name: fsString(r.in_game_name, 64),
              in_game_id: fsString(r.in_game_id, 64),
              slot_number: fsInt(r.slot_number),
              status: fsString(r.status === 'disqualified' ? 'disqualified' : 'registered', 16),
            },
          },
          updateTransforms: [{ fieldPath: 'registered_at', setToServerValue: 'REQUEST_TIME' }],
          currentDocument: { exists: false },
        });
      }
    }
  }

  for (const txId of params.txIdsCreated) {
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId) as
      | {
          tx_code: string;
          user_id: number;
          type: string;
          amount: number;
          direction: string;
          balance_after: number;
          status: string;
          reference_id: string;
          description: string;
        }
      | undefined;
    if (!tx) continue;
    const bundle = getFullUserAndWallet(tx.user_id);
    if (!bundle) continue;
    const uDocId = getCanonicalUserDocId(bundle.user);
    writes.push({
      update: {
        name: `${prefix}/transactions/${tx.tx_code}`,
        fields: {
          tx_code: fsString(tx.tx_code, 64),
          user_uid: fsString(uDocId, 128),
          sqlite_user_id: fsInt(bundle.user.id),
          player_id: fsString(bundle.user.player_id, 32),
          username: fsString(bundle.user.username, 32),
          type: fsString(tx.type, 32),
          amount: fsInt(tx.amount),
          direction: fsString(tx.direction, 16),
          balance_after: fsInt(tx.balance_after),
          status: fsString(tx.status, 16),
          reference_id: fsString(tx.reference_id, 64),
          description: fsString(tx.description, 300),
        },
      },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    });
  }

  if (writes.length > 0) {
    await fsCommit(writes, params.adminIdToken, 'adminWinnersSync');
  }
}

export async function commitTeamRegistrationToFirestore(params: {
  registrationCode: string;
  txCode: string | null;
  actorIdToken: string;
}): Promise<void> {
  const prefix = getFirestoreDocPrefix();
  if (!prefix || !params.actorIdToken) return;
  const reg = db
    .prepare('SELECT * FROM team_registrations WHERE registration_code = ?')
    .get(params.registrationCode) as
    | {
        id: number;
        registration_code: string;
        tournament_id: number;
        user_id: number | null;
        leader_name: string;
        freefire_uid: string;
        whatsapp_number: string;
        team_name: string;
        squad_type: string;
        teammates: string;
        payment_method: string;
        payment_ref: string;
        status: string;
      }
    | undefined;
  if (!reg) return;

  let userUid = '';
  if (reg.user_id) {
    const bundle = getFullUserAndWallet(reg.user_id);
    if (bundle) {
      userUid = getCanonicalUserDocId(bundle.user);
      await ensureUserDocInFirestore(reg.user_id, params.actorIdToken);
    }
  }
  if (!userUid) return;

  const writes: FirestoreWrite[] = [
    {
      update: {
        name: `${prefix}/team_registrations/${reg.registration_code}`,
        fields: {
          id: fsInt(reg.id),
          registration_code: fsString(reg.registration_code, 32),
          tournament_id: fsInt(reg.tournament_id),
          user_uid: fsString(userUid, 128),
          ...(reg.user_id ? { sqlite_user_id: fsInt(reg.user_id) } : {}),
          leader_name: fsString(reg.leader_name, 64),
          freefire_uid: fsString(reg.freefire_uid, 32),
          whatsapp_number: fsString(reg.whatsapp_number, 24),
          team_name: fsString(reg.team_name, 64),
          squad_type: fsString(reg.squad_type, 16),
          teammates: fsString(reg.teammates || '', 500),
          payment_method: fsString(reg.payment_method, 16),
          payment_ref: fsString(reg.payment_ref || '', 64),
          status: fsString(reg.status, 16),
        },
      },
      updateTransforms: [{ fieldPath: 'created_at', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    },
  ];

  await fsCommit(writes, params.actorIdToken, 'teamRegistration');
}

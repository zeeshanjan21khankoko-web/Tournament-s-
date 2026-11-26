import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.ts';
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

function parseDocIdNumber(name: string | undefined): number {
  if (!name) return 0;
  const docId = name.split('/').pop() || '';
  const cleaned = docId.replace(/^tour_/, '');
  const n = Number(cleaned);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

const ALLOWED_MODES = new Set(['Battle Royale', 'Clash Squad', 'Lone Wolf']);
const DEFAULT_BANNER = '/src/assets/images/kelly_tournament_banner_1795312123415.jpg';

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

async function fetchJsonWithTimeout(url: string, init?: RequestInit, timeoutMs = 4500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
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

export async function fetchFirestoreTournaments(): Promise<ParsedFirestoreTournament[]> {
  const base = getFirestoreRestBase();
  if (!base) return [];
  try {
    const res = await fetchJsonWithTimeout(`${base}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'tournaments' }],
          limit: 200,
        },
      }),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ document?: FirestoreDoc }>;
    if (!Array.isArray(rows)) return [];
    const list: ParsedFirestoreTournament[] = [];
    for (const row of rows) {
      if (row.document) {
        const parsed = parseFirestoreTournamentDoc(row.document);
        if (parsed) list.push(parsed);
      }
    }
    return list;
  } catch {
    return [];
  }
}

export async function fetchFirestoreTournamentById(
  tournamentId: number
): Promise<ParsedFirestoreTournament | null> {
  const base = getFirestoreRestBase();
  if (!base || !Number.isInteger(tournamentId) || tournamentId <= 0) return null;

  for (const docId of [`tour_${tournamentId}`, String(tournamentId)]) {
    try {
      const res = await fetchJsonWithTimeout(`${base}/tournaments/${encodeURIComponent(docId)}`);
      if (res.ok) {
        const doc = (await res.json()) as FirestoreDoc;
        const parsed = parseFirestoreTournamentDoc(doc);
        if (parsed) return parsed;
      }
    } catch {
      // Try next candidate
    }
  }

  // Fallback to collection query in case doc used a custom Firestore document ID
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

  // Ensure SQLite AUTOINCREMENT never generates an ID <= hydrated tournament ID
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

/**
 * Safely hydrates missing tournaments and deletion tombstones from Firestore into SQLite.
 * Never overwrites or deletes existing SQLite tournaments, player data, or registrations.
 */
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
          // Record deletion tombstone only if this tournament is NOT actively in cloudTournaments
          // or already absent from SQLite. Never delete existing SQLite rows automatically.
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

/**
 * Ensures a specific tournament ID exists in SQLite if it exists in Firestore (and was not deleted).
 * Returns the SQLite row if found, or undefined if not found in SQLite or Firestore.
 */
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

  // Try fetching directly from Firestore in case it was created on another instance/session
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

  // If it exists locally even if tombstone was stale and no cloud deletion blocked it, return existing only when not deleted
  if (existing && !isDeletedLocal) {
    return existing;
  }
  return undefined;
}

/**
 * Computes a globally unique, monotonically increasing tournament ID across SQLite,
 * deleted_tournaments, and Firestore so newly created tournaments never collide with
 * previously deleted IDs (e.g. 1..5).
 */
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

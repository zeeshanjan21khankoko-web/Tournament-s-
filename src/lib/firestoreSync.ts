import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  ADMIN_FIREBASE_EMAIL,
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
} from './firebase';
import { KELLY_TOURNAMENT_ARTWORK } from './api';
import type { Tournament, TournamentWinner, UserProfile } from '../types';

const TOURNAMENTS_COLLECTION = 'tournaments';
const USERS_COLLECTION = 'users';
const USERS_PUBLIC_COLLECTION = 'users_public';
const DEFAULT_SAFE_AVATAR = '/src/assets/images/avatar_esports_pro_1795298801657.jpg';
const VALID_MODES = new Set<Tournament['mode']>(['Battle Royale', 'Clash Squad', 'Lone Wolf']);
const VALID_STATUSES = new Set<Tournament['status']>([
  'upcoming',
  'live',
  'completed',
  'cancelled',
]);

function parseNumericTournamentId(rawId: unknown, docId?: string): number {
  const n = Math.floor(Number(rawId));
  if (Number.isInteger(n) && n > 0) return n;
  if (docId) {
    const stripped = docId.replace(/^tour_/i, '');
    const parsedDocId = Math.floor(Number(stripped));
    if (Number.isInteger(parsedDocId) && parsedDocId > 0) return parsedDocId;
  }
  return 0;
}

function normalizeTournamentMode(rawMode: unknown): Tournament['mode'] {
  if (typeof rawMode === 'string' && VALID_MODES.has(rawMode as Tournament['mode'])) {
    return rawMode as Tournament['mode'];
  }
  return 'Battle Royale';
}

function normalizeTournamentStatus(rawStatus: unknown): Tournament['status'] {
  if (typeof rawStatus === 'string' && VALID_STATUSES.has(rawStatus as Tournament['status'])) {
    return rawStatus as Tournament['status'];
  }
  return 'upcoming';
}

function mapFirestoreDocToTournament(docId: string, d: Record<string, unknown>): Tournament | null {
  const id = parseNumericTournamentId(d.id, docId);
  const title = String(d.title || '').trim();
  if (id <= 0 || !title) return null;
  const rawBanner = String(d.banner_url || '').trim();
  const maxSlots = Math.max(2, Math.min(500, Math.floor(Number(d.max_slots) || 48)));
  const filledSlots = Math.max(0, Math.min(maxSlots, Math.floor(Number(d.filled_slots) || 0)));
  return {
    id,
    title,
    game_name: String(d.game_name || 'Free Fire').trim() || 'Free Fire',
    mode: normalizeTournamentMode(d.mode),
    entry_fee: Math.max(0, Math.floor(Number(d.entry_fee) || 0)),
    prize_pool: Math.max(0, Math.floor(Number(d.prize_pool) || 0)),
    prize_1st: Math.max(0, Math.floor(Number(d.prize_1st) || 0)),
    prize_2nd: Math.max(0, Math.floor(Number(d.prize_2nd) || 0)),
    prize_3rd: Math.max(0, Math.floor(Number(d.prize_3rd) || 0)),
    prize_4th: Math.max(0, Math.floor(Number(d.prize_4th) || 0)),
    prize_5th: Math.max(0, Math.floor(Number(d.prize_5th) || 0)),
    max_slots: maxSlots,
    filled_slots: filledSlots,
    match_time: String(d.match_time || ''),
    end_time: String(d.end_time || ''),
    status: normalizeTournamentStatus(d.status),
    banner_url: rawBanner || KELLY_TOURNAMENT_ARTWORK,
    rules: String(d.rules || ''),
    room_id: '',
    room_pass: '',
    created_at: toIsoString(d.created_at),
    is_registered: false,
    registered_players: [],
    winners: Array.isArray(d.winners) ? (d.winners as TournamentWinner[]) : [],
  };
}

export function isFirebaseAdminUser(): boolean {
  const u = auth.currentUser;
  if (!u || !u.emailVerified || !u.email) return false;
  return u.email.toLowerCase() === ADMIN_FIREBASE_EMAIL.toLowerCase();
}

export async function signInFirebaseAdmin(): Promise<{ email: string; uid: string }> {
  const cred = await signInWithPopup(auth, googleProvider);
  const user = cred.user;
  if (!user.emailVerified || (user.email || '').toLowerCase() !== ADMIN_FIREBASE_EMAIL.toLowerCase()) {
    await signOut(auth).catch(() => {});
    throw new Error(
      `Only the authorized Admin (${ADMIN_FIREBASE_EMAIL}) can manage Firebase records.`
    );
  }
  const adminRef = doc(db, 'admins', user.uid);
  try {
    const existing = await getDoc(adminRef);
    if (!existing.exists()) {
      await setDoc(adminRef, {
        uid: user.uid,
        email: user.email || ADMIN_FIREBASE_EMAIL,
        admin_level: 'super_admin',
        created_at: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `admins/${user.uid}`);
  }
  return { email: user.email || ADMIN_FIREBASE_EMAIL, uid: user.uid };
}

export async function signOutFirebaseAdmin(): Promise<void> {
  await signOut(auth);
}

function sanitizeWinners(winners: TournamentWinner[] | undefined): Array<Record<string, unknown>> {
  if (!Array.isArray(winners)) return [];
  return winners.slice(0, 5).map((w) => ({
    id: Math.floor(Number(w.id) || 0),
    placement: Math.floor(Number(w.placement) || 1),
    prize_amount: Math.max(0, Math.floor(Number(w.prize_amount) || 0)),
    declared_at: String(w.declared_at || ''),
    user_id: Math.floor(Number(w.user_id) || 0),
    player_id: String(w.player_id || '').slice(0, 32),
    username: String(w.username || 'Player').slice(0, 64),
    avatar_url: String(w.avatar_url || '').slice(0, 512),
  }));
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

export function tournamentDocId(tournamentId: number): string {
  return `tour_${Math.floor(Number(tournamentId))}`;
}

export async function syncTournamentToFirestore(tournament: Tournament): Promise<void> {
  const user = auth.currentUser;
  if (!user || !isFirebaseAdminUser()) {
    return;
  }

  const docId = tournamentDocId(tournament.id);
  const tourPath = `${TOURNAMENTS_COLLECTION}/${docId}`;
  const tourRef = doc(db, TOURNAMENTS_COLLECTION, docId);

  const rawBanner = String(tournament.banner_url || '').trim();
  const sanitizedBanner =
    rawBanner && rawBanner.length <= 512 ? rawBanner : KELLY_TOURNAMENT_ARTWORK;
  const rawTitle = String(tournament.title || '').trim();
  const safeTitle = (rawTitle.length >= 3 ? rawTitle : `${rawTitle || 'Match'} Arena`).slice(0, 120);
  const rawGame = String(tournament.game_name || 'Free Fire').trim();
  const safeGame = (rawGame.length >= 2 ? rawGame : 'Free Fire').slice(0, 64);
  const rawMatchTime = String(tournament.match_time || '').trim();
  const safeMatchTime = (rawMatchTime.length >= 10 ? rawMatchTime : new Date().toISOString()).slice(
    0,
    64
  );

  const safeFields = {
    id: Math.floor(Number(tournament.id)),
    title: safeTitle,
    game_name: safeGame,
    mode: normalizeTournamentMode(tournament.mode),
    entry_fee: Math.max(0, Math.floor(Number(tournament.entry_fee) || 0)),
    prize_pool: Math.max(0, Math.floor(Number(tournament.prize_pool) || 0)),
    prize_1st: Math.max(0, Math.floor(Number(tournament.prize_1st) || 0)),
    prize_2nd: Math.max(0, Math.floor(Number(tournament.prize_2nd) || 0)),
    prize_3rd: Math.max(0, Math.floor(Number(tournament.prize_3rd) || 0)),
    prize_4th: Math.max(0, Math.floor(Number(tournament.prize_4th) || 0)),
    prize_5th: Math.max(0, Math.floor(Number(tournament.prize_5th) || 0)),
    max_slots: Math.max(2, Math.min(500, Math.floor(Number(tournament.max_slots) || 48))),
    filled_slots: Math.max(0, Math.floor(Number(tournament.filled_slots) || 0)),
    match_time: safeMatchTime,
    end_time: String(tournament.end_time || '').slice(0, 64),
    status: normalizeTournamentStatus(tournament.status),
    banner_url: sanitizedBanner,
    rules: String(tournament.rules || '').slice(0, 4000),
    winners: sanitizeWinners(tournament.winners),
  };

  try {
    const existingSnap = await getDoc(tourRef);
    if (existingSnap.exists()) {
      await updateDoc(tourRef, {
        title: safeFields.title,
        game_name: safeFields.game_name,
        mode: safeFields.mode,
        entry_fee: safeFields.entry_fee,
        prize_pool: safeFields.prize_pool,
        prize_1st: safeFields.prize_1st,
        prize_2nd: safeFields.prize_2nd,
        prize_3rd: safeFields.prize_3rd,
        prize_4th: safeFields.prize_4th,
        prize_5th: safeFields.prize_5th,
        max_slots: safeFields.max_slots,
        filled_slots: Math.min(safeFields.filled_slots, safeFields.max_slots),
        match_time: safeFields.match_time,
        end_time: safeFields.end_time,
        status: safeFields.status,
        banner_url: safeFields.banner_url,
        rules: safeFields.rules,
        winners: safeFields.winners,
        updated_at: serverTimestamp(),
      });
    } else {
      await setDoc(tourRef, {
        ...safeFields,
        filled_slots: Math.min(safeFields.filled_slots, safeFields.max_slots),
        created_by_uid: user.uid,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    }

    // Sync room secrets strictly into protected subcollection
    const secretPath = `${tourPath}/secrets/room`;
    const secretRef = doc(db, TOURNAMENTS_COLLECTION, docId, 'secrets', 'room');
    await setDoc(secretRef, {
      room_id: String(tournament.room_id || '').slice(0, 64),
      room_pass: String(tournament.room_pass || '').slice(0, 64),
      updated_at: serverTimestamp(),
    }).catch((err) => handleFirestoreError(err, OperationType.WRITE, secretPath));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, tourPath);
  }
}

export async function deleteTournamentFromFirestore(tournamentId: number): Promise<void> {
  if (!isFirebaseAdminUser()) return;
  const docId = tournamentDocId(tournamentId);
  const secretRef = doc(db, TOURNAMENTS_COLLECTION, docId, 'secrets', 'room');
  const tourRef = doc(db, TOURNAMENTS_COLLECTION, docId);
  try {
    await deleteDoc(secretRef).catch(() => {});
    await deleteDoc(tourRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${TOURNAMENTS_COLLECTION}/${docId}`);
  }
}

export async function getFirestoreTournamentCount(): Promise<number> {
  try {
    const snap = await getDocs(collection(db, TOURNAMENTS_COLLECTION));
    return snap.size;
  } catch {
    return 0;
  }
}

export async function fetchTournamentByIdFromFirestore(
  tournamentId: number
): Promise<Tournament | null> {
  const cleanId = Math.floor(Number(tournamentId));
  if (!Number.isInteger(cleanId) || cleanId <= 0) return null;

  for (const candidateDocId of [tournamentDocId(cleanId), String(cleanId)]) {
    try {
      const snap = await getDoc(doc(db, TOURNAMENTS_COLLECTION, candidateDocId));
      if (snap.exists()) {
        const mapped = mapFirestoreDocToTournament(
          snap.id,
          snap.data() as Record<string, unknown>
        );
        if (mapped) return mapped;
      }
    } catch {
      // Try next candidate doc ID
    }
  }

  try {
    const snap = await getDocs(collection(db, TOURNAMENTS_COLLECTION));
    for (const docSnap of snap.docs) {
      const mapped = mapFirestoreDocToTournament(
        docSnap.id,
        docSnap.data() as Record<string, unknown>
      );
      if (mapped && mapped.id === cleanId) {
        return mapped;
      }
    }
  } catch {
    // Firestore unavailable
  }

  return null;
}

export function subscribeTournamentsFromFirestore(
  onData: (tournaments: Tournament[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, TOURNAMENTS_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list = snapshot.docs
        .map((docSnap) =>
          mapFirestoreDocToTournament(docSnap.id, docSnap.data() as Record<string, unknown>)
        )
        .filter((t): t is Tournament => t !== null)
        .sort((a, b) => b.id - a.id);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, TOURNAMENTS_COLLECTION);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export interface TournamentPolicySnapshot {
  autoCreationDisabled: boolean;
  manualAdminOnly: boolean;
  deletedTournamentIds: number[];
}

export async function saveTournamentPolicyToFirestore(deletedIds: number[]): Promise<void> {
  const user = auth.currentUser;
  if (!user || !isFirebaseAdminUser()) return;
  const cleanIds = Array.from(
    new Set(deletedIds.map((n) => Math.floor(Number(n))).filter((n) => Number.isInteger(n) && n > 0))
  )
    .sort((a, b) => b - a)
    .slice(0, 200);

  const policyPath = 'app_settings/tournament_policy';
  try {
    await setDoc(doc(db, 'app_settings', 'tournament_policy'), {
      auto_creation_disabled: true,
      manual_admin_only: true,
      deleted_tournament_ids: cleanIds,
      updated_by_uid: user.uid,
      updated_at: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, policyPath);
  }
}

export function subscribeTournamentPolicyFromFirestore(
  onPolicy: (policy: TournamentPolicySnapshot) => void
): Unsubscribe {
  const policyRef = doc(db, 'app_settings', 'tournament_policy');
  return onSnapshot(
    policyRef,
    (snap) => {
      if (!snap.exists()) {
        onPolicy({
          autoCreationDisabled: true,
          manualAdminOnly: true,
          deletedTournamentIds: [],
        });
        return;
      }
      const d = snap.data();
      const rawIds = Array.isArray(d.deleted_tournament_ids) ? d.deleted_tournament_ids : [];
      onPolicy({
        autoCreationDisabled: d.auto_creation_disabled !== false,
        manualAdminOnly: d.manual_admin_only !== false,
        deletedTournamentIds: rawIds
          .map((n: unknown) => Math.floor(Number(n)))
          .filter((n: number) => Number.isInteger(n) && n > 0),
      });
    },
    (error) => {
      console.warn('Firestore policy listener notice:', error.message);
    }
  );
}

// --- PERMANENT USER REGISTRATION PRESERVATION & FIREBASE SYNC ---

function sanitizeSafeAvatarUrl(raw: unknown): string {
  const val = typeof raw === 'string' ? raw.trim() : '';
  if (!val || val.length > 512) return DEFAULT_SAFE_AVATAR;
  return val;
}

function sanitizeSafeUsername(raw: unknown, fallback = 'Player'): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const safe = trimmed.slice(0, 32);
  return safe.length >= 2 ? safe : fallback;
}

function sanitizeSafePlayerId(raw: unknown, idFallback: number): string {
  const trimmed = typeof raw === 'string' ? raw.trim().slice(0, 32) : '';
  return trimmed.length >= 3 ? trimmed : `PT-${Math.max(1, idFallback)}`;
}

export function userSqlDocId(userId: number): string {
  return `sql_${Math.floor(Number(userId))}`;
}

export async function syncOwnUserToFirestore(user: UserProfile): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;

  const uid = fbUser.uid;
  const userPath = `${USERS_COLLECTION}/${uid}`;
  const publicPath = `${USERS_PUBLIC_COLLECTION}/${uid}`;
  const userRef = doc(db, USERS_COLLECTION, uid);
  const publicRef = doc(db, USERS_PUBLIC_COLLECTION, uid);

  const safeUsername = sanitizeSafeUsername(user.username);
  const safePlayerId = sanitizeSafePlayerId(user.player_id, user.id);
  const safePhone = String(user.phone || '').trim().slice(0, 32);
  const safeAvatar = sanitizeSafeAvatarUrl(user.avatar_url);
  const safeEmail = String(user.email || fbUser.email || '').trim().toLowerCase().slice(0, 160);
  const adminSignedIn = isFirebaseAdminUser();

  try {
    const existingPrivate = await getDoc(userRef);
    if (existingPrivate.exists()) {
      await updateDoc(userRef, {
        firebase_uid: uid,
        sqlite_id: Math.max(1, Math.floor(Number(user.id) || 1)),
        username: safeUsername,
        phone: safePhone,
        avatar_url: safeAvatar,
        updated_at: serverTimestamp(),
      });
    } else {
      await setDoc(userRef, {
        uid,
        firebase_uid: uid,
        sqlite_id: Math.max(1, Math.floor(Number(user.id) || 1)),
        email: safeEmail,
        username: safeUsername,
        player_id: safePlayerId,
        phone: safePhone,
        avatar_url: safeAvatar,
        role: adminSignedIn && user.role === 'admin' ? 'admin' : 'player',
        is_blocked: 0,
        wallet_balance: adminSignedIn ? Math.max(0, Math.floor(Number(user.wallet_balance) || 0)) : 0,
        pending_withdrawal: 0,
        total_deposited: 0,
        total_withdrawn: 0,
        total_won: 0,
        matches_played: adminSignedIn ? Math.max(0, Math.floor(Number(user.matches_played) || 0)) : 0,
        wins: adminSignedIn ? Math.max(0, Math.floor(Number(user.wins) || 0)) : 0,
        kills: adminSignedIn ? Math.max(0, Math.floor(Number(user.kills) || 0)) : 0,
        points: adminSignedIn ? Math.max(0, Math.floor(Number(user.points) || 0)) : 0,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    }

    const existingPublic = await getDoc(publicRef);
    if (existingPublic.exists()) {
      await updateDoc(publicRef, {
        username: safeUsername,
        avatar_url: safeAvatar,
        updated_at: serverTimestamp(),
      });
    } else {
      await setDoc(publicRef, {
        uid,
        player_id: safePlayerId,
        username: safeUsername,
        avatar_url: safeAvatar,
        points: adminSignedIn ? Math.max(0, Math.floor(Number(user.points) || 0)) : 0,
        updated_at: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
}

export async function saveUserPolicyToFirestore(deletedUserIds: number[]): Promise<void> {
  const user = auth.currentUser;
  if (!user || !isFirebaseAdminUser()) return;
  const cleanIds = Array.from(
    new Set(
      deletedUserIds
        .map((n) => Math.floor(Number(n)))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
  )
    .sort((a, b) => b - a)
    .slice(0, 500);

  const policyPath = 'app_settings/user_policy';
  try {
    await setDoc(doc(db, 'app_settings', 'user_policy'), {
      auto_deletion_disabled: true,
      manual_admin_only_deletion: true,
      preserve_registrations: true,
      deleted_user_ids: cleanIds,
      updated_by_uid: user.uid,
      updated_at: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, policyPath);
  }
}

export async function syncAllUsersToFirestore(
  users: Array<
    UserProfile & {
      pending_withdrawal?: number;
      total_deposited?: number;
      total_withdrawn?: number;
      total_won?: number;
    }
  >,
  deletedUserIds: number[]
): Promise<number> {
  if (!isFirebaseAdminUser()) return 0;

  const deletedSet = new Set(
    deletedUserIds.map((n) => Math.floor(Number(n))).filter((n) => n > 0)
  );
  let synced = 0;

  for (const u of users) {
    if (!u || !Number.isInteger(u.id) || u.id <= 0 || deletedSet.has(u.id)) continue;
    const rawFbUid = typeof u.firebase_uid === 'string' ? u.firebase_uid.trim() : '';
    const validFbUid = /^[a-zA-Z0-9_-]{1,128}$/.test(rawFbUid) ? rawFbUid : '';
    const docId = validFbUid || userSqlDocId(u.id);
    const userPath = `${USERS_COLLECTION}/${docId}`;
    const publicPath = `${USERS_PUBLIC_COLLECTION}/${docId}`;
    const userRef = doc(db, USERS_COLLECTION, docId);
    const publicRef = doc(db, USERS_PUBLIC_COLLECTION, docId);

    const safeUsername = sanitizeSafeUsername(u.username);
    const safePlayerId = sanitizeSafePlayerId(u.player_id, u.id);
    const safeEmail = String(u.email || '').trim().toLowerCase().slice(0, 160);
    if (safeEmail.length < 3) continue;
    const safePhone = String(u.phone || '').trim().slice(0, 32);
    const safeAvatar = sanitizeSafeAvatarUrl(u.avatar_url);
    const safeRole: 'player' | 'admin' = u.role === 'admin' ? 'admin' : 'player';
    const safeBlocked = u.is_blocked === 1 ? 1 : 0;
    const safeBalance = Math.max(0, Math.floor(Number(u.wallet_balance) || 0));
    const safePendingWd = Math.max(0, Math.floor(Number(u.pending_withdrawal) || 0));
    const safeTotalDep = Math.max(0, Math.floor(Number(u.total_deposited) || 0));
    const safeTotalWd = Math.max(0, Math.floor(Number(u.total_withdrawn) || 0));
    const safeTotalWon = Math.max(0, Math.floor(Number(u.total_won) || 0));
    const safeMatches = Math.max(0, Math.floor(Number(u.matches_played) || 0));
    const safeWins = Math.max(0, Math.floor(Number(u.wins) || 0));
    const safeKills = Math.max(0, Math.floor(Number(u.kills) || 0));
    const safePoints = Math.max(0, Math.floor(Number(u.points) || 0));

    try {
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        await updateDoc(userRef, {
          sqlite_id: u.id,
          firebase_uid: validFbUid,
          username: safeUsername,
          phone: safePhone,
          avatar_url: safeAvatar,
          role: safeRole,
          is_blocked: safeBlocked,
          wallet_balance: safeBalance,
          pending_withdrawal: safePendingWd,
          total_deposited: safeTotalDep,
          total_withdrawn: safeTotalWd,
          total_won: safeTotalWon,
          matches_played: safeMatches,
          wins: safeWins,
          kills: safeKills,
          points: safePoints,
          updated_at: serverTimestamp(),
        });
      } else {
        await setDoc(userRef, {
          uid: docId,
          firebase_uid: validFbUid,
          sqlite_id: u.id,
          email: safeEmail,
          username: safeUsername,
          player_id: safePlayerId,
          phone: safePhone,
          avatar_url: safeAvatar,
          role: safeRole,
          is_blocked: safeBlocked,
          wallet_balance: safeBalance,
          pending_withdrawal: safePendingWd,
          total_deposited: safeTotalDep,
          total_withdrawn: safeTotalWd,
          total_won: safeTotalWon,
          matches_played: safeMatches,
          wins: safeWins,
          kills: safeKills,
          points: safePoints,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      }

      const pubSnap = await getDoc(publicRef);
      if (pubSnap.exists()) {
        await updateDoc(publicRef, {
          player_id: safePlayerId,
          username: safeUsername,
          avatar_url: safeAvatar,
          points: safePoints,
          updated_at: serverTimestamp(),
        });
      } else {
        await setDoc(publicRef, {
          uid: docId,
          player_id: safePlayerId,
          username: safeUsername,
          avatar_url: safeAvatar,
          points: safePoints,
          updated_at: serverTimestamp(),
        });
      }
      synced += 1;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${userPath} / ${publicPath}`);
    }
  }

  await saveUserPolicyToFirestore(deletedUserIds);
  return synced;
}

export interface CloudUserRecord {
  sqlite_id?: number;
  firebase_uid?: string;
  player_id: string;
  username: string;
  email: string;
  phone: string;
  avatar_url: string;
  role: 'player' | 'admin';
  is_blocked: number;
  wallet_balance: number;
  pending_withdrawal?: number;
  total_deposited?: number;
  total_withdrawn?: number;
  total_won?: number;
  matches_played: number;
  wins: number;
  kills?: number;
  points: number;
}

export async function fetchCloudUsersFromFirestore(): Promise<{
  cloudUsers: CloudUserRecord[];
  deletedUserIds: number[];
}> {
  if (!isFirebaseAdminUser()) {
    return { cloudUsers: [], deletedUserIds: [] };
  }

  try {
    const [usersSnap, policySnap] = await Promise.all([
      getDocs(collection(db, USERS_COLLECTION)),
      getDoc(doc(db, 'app_settings', 'user_policy')).catch(() => null),
    ]);

    const policyIds: number[] =
      policySnap && policySnap.exists() && Array.isArray(policySnap.data()?.deleted_user_ids)
        ? policySnap
            .data()!
            .deleted_user_ids.map((n: unknown) => Math.floor(Number(n)))
            .filter((n: number) => Number.isInteger(n) && n > 0)
        : [];
    const deletedSet = new Set<number>(policyIds);

    const byEmail = new Map<string, { record: CloudUserRecord; isSqlDoc: boolean }>();
    for (const d of usersSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const sqliteId = Number(data.sqlite_id);
      if (Number.isInteger(sqliteId) && deletedSet.has(sqliteId)) continue;
      const email = String(data.email || '').trim().toLowerCase();
      const username = String(data.username || '').trim();
      if (!email || !username) continue;

      const isSqlDoc = d.id.startsWith('sql_');
      const rawUid =
        typeof data.firebase_uid === 'string' && data.firebase_uid.trim()
          ? data.firebase_uid.trim()
          : !isSqlDoc
            ? d.id
            : undefined;
      const candidate: CloudUserRecord = {
        sqlite_id: Number.isInteger(sqliteId) && sqliteId > 0 ? sqliteId : undefined,
        firebase_uid: rawUid,
        player_id: String(data.player_id || ''),
        username,
        email,
        phone: String(data.phone || ''),
        avatar_url: sanitizeSafeAvatarUrl(data.avatar_url),
        role: data.role === 'admin' ? 'admin' : 'player',
        is_blocked: data.is_blocked === 1 ? 1 : 0,
        wallet_balance: Math.max(0, Math.floor(Number(data.wallet_balance) || 0)),
        pending_withdrawal: Math.max(0, Math.floor(Number(data.pending_withdrawal) || 0)),
        total_deposited: Math.max(0, Math.floor(Number(data.total_deposited) || 0)),
        total_withdrawn: Math.max(0, Math.floor(Number(data.total_withdrawn) || 0)),
        total_won: Math.max(0, Math.floor(Number(data.total_won) || 0)),
        matches_played: Math.max(0, Math.floor(Number(data.matches_played) || 0)),
        wins: Math.max(0, Math.floor(Number(data.wins) || 0)),
        kills: Math.max(0, Math.floor(Number(data.kills) || 0)),
        points: Math.max(0, Math.floor(Number(data.points) || 0)),
      };

      const existing = byEmail.get(email);
      if (!existing) {
        byEmail.set(email, { record: candidate, isSqlDoc });
      } else if (!isSqlDoc && existing.isSqlDoc) {
        // Canonical Firebase UID doc takes precedence over legacy sql_ doc
        byEmail.set(email, { record: candidate, isSqlDoc: false });
      } else if (isSqlDoc === existing.isSqlDoc) {
        const pickCandidate =
          (!existing.record.sqlite_id && candidate.sqlite_id) ||
          candidate.wallet_balance > existing.record.wallet_balance;
        if (pickCandidate) {
          byEmail.set(email, { record: candidate, isSqlDoc });
        }
      }
    }

    const cloudUsers: CloudUserRecord[] = Array.from(byEmail.values()).map((v) => v.record);

    return { cloudUsers, deletedUserIds: policyIds };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, USERS_COLLECTION);
  }
}

export async function deleteUserFromFirestore(userId: number, firebaseUid?: string): Promise<void> {
  if (!isFirebaseAdminUser()) return;
  const cleanId = Math.floor(Number(userId));
  if (!Number.isInteger(cleanId) || cleanId <= 1) return;

  const docIds = [userSqlDocId(cleanId)];
  const trimmedUid = typeof firebaseUid === 'string' ? firebaseUid.trim() : '';
  if (trimmedUid && /^[a-zA-Z0-9_-]{1,128}$/.test(trimmedUid)) {
    docIds.push(trimmedUid);
  }

  for (const docId of docIds) {
    const userRef = doc(db, USERS_COLLECTION, docId);
    const publicRef = doc(db, USERS_PUBLIC_COLLECTION, docId);
    try {
      await deleteDoc(publicRef).catch(() => {});
      await deleteDoc(userRef).catch(() => {});
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${USERS_COLLECTION}/${docId}`);
    }
  }
}


import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
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
import type { Tournament, TournamentWinner } from '../types';

const TOURNAMENTS_COLLECTION = 'tournaments';

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
      `Only the authorized Admin (${ADMIN_FIREBASE_EMAIL}) can manage Firebase tournament records.`
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

  const sanitizedBanner = String(tournament.banner_url || '').slice(0, 512);
  const safeFields = {
    id: Math.floor(Number(tournament.id)),
    title: String(tournament.title || '').trim().slice(0, 120),
    game_name: String(tournament.game_name || 'Free Fire').trim().slice(0, 64),
    mode: tournament.mode || 'Battle Royale',
    entry_fee: Math.max(0, Math.floor(Number(tournament.entry_fee) || 0)),
    prize_pool: Math.max(0, Math.floor(Number(tournament.prize_pool) || 0)),
    prize_1st: Math.max(0, Math.floor(Number(tournament.prize_1st) || 0)),
    prize_2nd: Math.max(0, Math.floor(Number(tournament.prize_2nd) || 0)),
    prize_3rd: Math.max(0, Math.floor(Number(tournament.prize_3rd) || 0)),
    prize_4th: Math.max(0, Math.floor(Number(tournament.prize_4th) || 0)),
    prize_5th: Math.max(0, Math.floor(Number(tournament.prize_5th) || 0)),
    max_slots: Math.max(2, Math.min(500, Math.floor(Number(tournament.max_slots) || 48))),
    filled_slots: Math.max(0, Math.floor(Number(tournament.filled_slots) || 0)),
    match_time: String(tournament.match_time || ''),
    end_time: String(tournament.end_time || ''),
    status: tournament.status || 'upcoming',
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

export function subscribeTournamentsFromFirestore(
  onData: (tournaments: Tournament[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, TOURNAMENTS_COLLECTION), orderBy('id', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Tournament[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: Number(d.id || 0),
          title: String(d.title || ''),
          game_name: String(d.game_name || 'Free Fire'),
          mode: (d.mode as Tournament['mode']) || 'Battle Royale',
          entry_fee: Number(d.entry_fee || 0),
          prize_pool: Number(d.prize_pool || 0),
          prize_1st: Number(d.prize_1st || 0),
          prize_2nd: Number(d.prize_2nd || 0),
          prize_3rd: Number(d.prize_3rd || 0),
          prize_4th: Number(d.prize_4th || 0),
          prize_5th: Number(d.prize_5th || 0),
          max_slots: Number(d.max_slots || 48),
          filled_slots: Number(d.filled_slots || 0),
          match_time: String(d.match_time || ''),
          end_time: String(d.end_time || ''),
          status: (d.status as Tournament['status']) || 'upcoming',
          banner_url: String(d.banner_url || ''),
          rules: String(d.rules || ''),
          room_id: '',
          room_pass: '',
          created_at: toIsoString(d.created_at),
          is_registered: false,
          registered_players: [],
          winners: Array.isArray(d.winners) ? (d.winners as TournamentWinner[]) : [],
        };
      });
      onData(list.filter((t) => t.id > 0 && t.title.length > 0));
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

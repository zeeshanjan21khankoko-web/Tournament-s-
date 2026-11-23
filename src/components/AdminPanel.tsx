import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  Cloud,
  CloudOff,
  Edit3,
  ExternalLink,
  Eye,
  Megaphone,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
  Youtube,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { ADMIN_FIREBASE_EMAIL, auth } from '../lib/firebase';
import {
  deleteTournamentFromFirestore,
  getFirestoreTournamentCount,
  isFirebaseAdminUser,
  saveTournamentPolicyToFirestore,
  signInFirebaseAdmin,
  signOutFirebaseAdmin,
  syncTournamentToFirestore,
} from '../lib/firestoreSync';
import {
  TOURNAMENT_MODES,
  addHoursToPktParts,
  apiRequest,
  computeTournamentStatus,
  extractYouTubeVideoId,
  formatPKR,
  formatPktScheduleRange,
  formatShortDate,
  getDefaultPktSchedule,
  getTournamentStatusLabel,
  getYouTubeThumbnailUrl,
  isoToPktParts,
  pktDateTimeToIso,
  splitPrizePoolDefaults,
} from '../lib/api';
import { DEFAULT_WINNER_AVATAR, PrizeBreakdownStrip, WinnersPodium } from './WinnersPodium';
import type {
  AdminOverview,
  AnnouncementRecord,
  ContactMessageRecord,
  DepositRecord,
  TeamRegistrationRecord,
  Tournament,
  TournamentMode,
  TransactionRecord,
  UserProfile,
  WithdrawalRecord,
  YouTubeVideoRecord,
} from '../types';

interface AdminPanelProps {
  token: string;
  currentUser: UserProfile;
  tournaments: Tournament[];
  onRefreshPublic: () => Promise<void>;
}

type AdminUserRow = UserProfile & {
  pending_withdrawal?: number;
  total_deposited?: number;
  total_withdrawn?: number;
  total_won?: number;
};

export const AdminPanel: React.FC<AdminPanelProps> = ({
  token,
  currentUser,
  tournaments,
  onRefreshPublic,
}) => {
  const [tab, setTab] = useState<
    | 'overview'
    | 'tournaments'
    | 'videos'
    | 'registrations'
    | 'deposits'
    | 'withdrawals'
    | 'users'
    | 'notices'
    | 'transactions'
  >('overview');

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [teamRegistrations, setTeamRegistrations] = useState<TeamRegistrationRecord[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [contacts, setContacts] = useState<ContactMessageRecord[]>([]);
  const [videos, setVideos] = useState<YouTubeVideoRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingTournament, setSavingTournament] = useState(false);
  const [firebaseAdminEmail, setFirebaseAdminEmail] = useState<string | null>(() =>
    isFirebaseAdminUser() ? auth.currentUser?.email || ADMIN_FIREBASE_EMAIL : null
  );
  const [firebaseTourCount, setFirebaseTourCount] = useState<number>(0);
  const [deletedTournamentIds, setDeletedTournamentIds] = useState<number[]>([]);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [connectingFirebase, setConnectingFirebase] = useState(false);

  // YouTube Video composer / editor
  const [editingVideoId, setEditingVideoId] = useState<number | null>(null);
  const [vTitle, setVTitle] = useState('');
  const [vUrl, setVUrl] = useState('');
  const [vFeatured, setVFeatured] = useState(true);
  const [vSaving, setVSaving] = useState(false);

  // Announcement composer
  const [annTitle, setAnnTitle] = useState('');
  const [annCategory, setAnnCategory] = useState<AnnouncementRecord['category']>('Announcement');
  const [annContent, setAnnContent] = useState('');
  const [annPinned, setAnnPinned] = useState(false);

  // Screenshot lightbox
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(null);

  // Create / Edit Tournament modal
  const [tourModal, setTourModal] = useState<Tournament | 'new' | null>(null);
  const [tTitle, setTTitle] = useState('');
  const [tGame, setTGame] = useState('Free Fire');
  const [tMode, setTMode] = useState<TournamentMode>('Battle Royale');
  const [tEntry, setTEntry] = useState('500');
  const [tPrize, setTPrize] = useState('25000');
  const [tPrize1st, setTPrize1st] = useState('10000');
  const [tPrize2nd, setTPrize2nd] = useState('6250');
  const [tPrize3rd, setTPrize3rd] = useState('3750');
  const [tPrize4th, setTPrize4th] = useState('3000');
  const [tPrize5th, setTPrize5th] = useState('2000');
  const [tSlots, setTSlots] = useState('48');
  const [tDate, setTDate] = useState('');
  const [tStartTime, setTStartTime] = useState('');
  const [hasEndTime, setHasEndTime] = useState(false);
  const [tEndDate, setTEndDate] = useState('');
  const [tEndTime, setTEndTime] = useState('');
  const [tStatus, setTStatus] = useState<'auto' | 'completed' | 'cancelled'>('auto');
  const [tRules, setTRules] = useState('');
  const [tRoomId, setTRoomId] = useState('');
  const [tRoomPass, setTRoomPass] = useState('');

  // Manage Players modal
  const [rosterModal, setRosterModal] = useState<Tournament | null>(null);
  const [addPlayerId, setAddPlayerId] = useState('');
  const [addPlayerIgn, setAddPlayerIgn] = useState('');
  const [chargeFee, setChargeFee] = useState(false);

  // Declare Winners & View Winners modals (Top 5)
  const [winnerModal, setWinnerModal] = useState<Tournament | null>(null);
  const [viewWinnersModal, setViewWinnersModal] = useState<Tournament | null>(null);
  const [w1User, setW1User] = useState('');
  const [w1Prize, setW1Prize] = useState('');
  const [w2User, setW2User] = useState('');
  const [w2Prize, setW2Prize] = useState('');
  const [w3User, setW3User] = useState('');
  const [w3Prize, setW3Prize] = useState('');
  const [w4User, setW4User] = useState('');
  const [w4Prize, setW4Prize] = useState('');
  const [w5User, setW5User] = useState('');
  const [w5Prize, setW5Prize] = useState('');

  // Create User modal
  const [newUserModal, setNewUserModal] = useState(false);
  const [nuUsername, setNuUsername] = useState('');
  const [nuEmail, setNuEmail] = useState('');
  const [nuPassword, setNuPassword] = useState('');
  const [nuRole, setNuRole] = useState<'player' | 'admin'>('player');
  const [nuBalance, setNuBalance] = useState('0');

  // Balance Adjust modal
  const [adjustUser, setAdjustUser] = useState<AdminUserRow | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustNote, setAdjustNote] = useState('');

  // Award Prize Money modal
  const [prizeUser, setPrizeUser] = useState<AdminUserRow | null>(null);
  const [prizeAmount, setPrizeAmount] = useState('');
  const [prizeTournamentId, setPrizeTournamentId] = useState('');
  const [prizeNote, setPrizeNote] = useState('');

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ov, us, deps, wds, txs, regs, anns, cts, vids, pol] = await Promise.all([
        apiRequest<{ overview: AdminOverview }>('/api/admin/overview', { token }),
        apiRequest<{ users: AdminUserRow[] }>('/api/admin/users', { token }),
        apiRequest<{ deposits: DepositRecord[] }>('/api/admin/deposits', { token }),
        apiRequest<{ withdrawals: WithdrawalRecord[] }>('/api/admin/withdrawals', { token }),
        apiRequest<{ transactions: TransactionRecord[] }>('/api/admin/transactions', { token }),
        apiRequest<{ registrations: TeamRegistrationRecord[] }>('/api/admin/team-registrations', {
          token,
        }),
        apiRequest<{ announcements: AnnouncementRecord[] }>('/api/announcements'),
        apiRequest<{ contacts: ContactMessageRecord[] }>('/api/admin/contacts', { token }),
        apiRequest<{ videos: YouTubeVideoRecord[] }>('/api/videos').catch(() => ({ videos: [] })),
        apiRequest<{ deletedTournamentIds?: number[] }>('/api/admin/tournament-policy', {
          token,
        }).catch(() => ({ deletedTournamentIds: [] })),
      ]);
      setOverview(ov.overview);
      setUsers(us.users);
      setDeposits(deps.deposits);
      setWithdrawals(wds.withdrawals);
      setTransactions(txs.transactions);
      setTeamRegistrations(regs.registrations || []);
      setAnnouncements(anns.announcements || []);
      setContacts(cts.contacts || []);
      setVideos(vids.videos || []);
      setDeletedTournamentIds(pol.deletedTournamentIds || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // Read-only Firebase Admin Auth listener + Firestore count check (never auto-writes)
  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!active) return;
      if (
        fbUser &&
        fbUser.emailVerified &&
        (fbUser.email || '').toLowerCase() === ADMIN_FIREBASE_EMAIL.toLowerCase()
      ) {
        setFirebaseAdminEmail(fbUser.email || ADMIN_FIREBASE_EMAIL);
      } else {
        setFirebaseAdminEmail(null);
      }
    });
    getFirestoreTournamentCount()
      .then((count) => {
        if (active) setFirebaseTourCount(count);
      })
      .catch(() => {});
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const handleConnectFirebaseAdmin = async () => {
    if (connectingFirebase) return;
    setError('');
    setNotice('');
    setConnectingFirebase(true);
    try {
      const res = await signInFirebaseAdmin();
      setFirebaseAdminEmail(res.email);
      const count = await getFirestoreTournamentCount();
      setFirebaseTourCount(count);
      setNotice(`Firebase Admin verified (${res.email}). All manual tournament changes now persist to Firebase.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify Firebase Admin.');
    } finally {
      setConnectingFirebase(false);
    }
  };

  const handleDisconnectFirebaseAdmin = async () => {
    await signOutFirebaseAdmin().catch(() => {});
    setFirebaseAdminEmail(null);
    setNotice('Signed out from Firebase Admin cloud session.');
  };

  const handleManualSyncToFirebase = async () => {
    if (syncingCloud) return;
    setError('');
    setNotice('');
    if (!isFirebaseAdminUser()) {
      setError(`Connect Firebase Admin (${ADMIN_FIREBASE_EMAIL}) first to sync tournaments to Firebase.`);
      return;
    }
    setSyncingCloud(true);
    try {
      for (const delId of deletedTournamentIds) {
        await deleteTournamentFromFirestore(delId).catch(() => {});
      }
      for (const t of tournaments) {
        await syncTournamentToFirestore(t);
      }
      await saveTournamentPolicyToFirestore(deletedTournamentIds);
      const count = await getFirestoreTournamentCount();
      setFirebaseTourCount(count);
      setNotice(
        `Saved ${tournaments.length} tournament(s) and locked manual-only tournament policy in Firebase Database.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync tournaments to Firebase.');
    } finally {
      setSyncingCloud(false);
    }
  };

  const resetVideoForm = () => {
    setEditingVideoId(null);
    setVTitle('');
    setVUrl('');
    setVFeatured(true);
  };

  const handleSaveVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    const parsedId = extractYouTubeVideoId(vUrl);
    if (!parsedId) {
      setError('Enter a valid YouTube video URL (youtube.com/watch?v=..., youtu.be/..., or Shorts/Live link).');
      return;
    }
    setVSaving(true);
    try {
      const payload = {
        title: vTitle.trim(),
        youtubeUrl: vUrl.trim(),
        isFeatured: vFeatured,
      };
      if (editingVideoId !== null) {
        await apiRequest(`/api/admin/videos/${editingVideoId}`, {
          method: 'PATCH',
          token,
          body: payload,
        });
        setNotice('YouTube video updated.');
      } else {
        await apiRequest('/api/admin/videos', {
          method: 'POST',
          token,
          body: payload,
        });
        setNotice('YouTube video added to homepage.');
      }
      resetVideoForm();
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save YouTube video.');
    } finally {
      setVSaving(false);
    }
  };

  const handleEditVideo = (v: YouTubeVideoRecord) => {
    setError('');
    setNotice('');
    setEditingVideoId(v.id);
    setVTitle(v.title);
    setVUrl(v.youtube_url);
    setVFeatured(v.is_featured === 1);
  };

  const handleFeatureVideo = async (id: number) => {
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/admin/videos/${id}`, {
        method: 'PATCH',
        token,
        body: { isFeatured: true },
      });
      setNotice('Homepage featured video updated.');
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update featured video.');
    }
  };

  const handleDeleteVideo = async (id: number) => {
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/admin/videos/${id}`, { method: 'DELETE', token });
      if (editingVideoId === id) {
        resetVideoForm();
      }
      setNotice('YouTube video deleted.');
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete YouTube video.');
    }
  };

  const openTournamentEditor = (t: Tournament | 'new') => {
    setError('');
    setTourModal(t);
    if (t === 'new') {
      const defStart = getDefaultPktSchedule(2);
      const defEnd = addHoursToPktParts(defStart.date, defStart.time, 2) || defStart;
      setTTitle('');
      setTGame('Free Fire');
      setTMode('Battle Royale');
      setTEntry('500');
      setTPrize('25000');
      setTPrize1st('10000');
      setTPrize2nd('6250');
      setTPrize3rd('3750');
      setTPrize4th('3000');
      setTPrize5th('2000');
      setTSlots('48');
      setTDate(defStart.date);
      setTStartTime(defStart.time);
      setHasEndTime(false);
      setTEndDate(defEnd.date);
      setTEndTime(defEnd.time);
      setTStatus('auto');
      setTRules('');
      setTRoomId('');
      setTRoomPass('');
    } else {
      const startParts = isoToPktParts(t.match_time);
      const fallbackEnd = addHoursToPktParts(startParts.date, startParts.time, 2) || startParts;
      const endParts = t.end_time ? isoToPktParts(t.end_time) : fallbackEnd;
      const hasExplicitPrizes =
        (t.prize_1st || 0) > 0 ||
        (t.prize_2nd || 0) > 0 ||
        (t.prize_3rd || 0) > 0 ||
        (t.prize_4th || 0) > 0 ||
        (t.prize_5th || 0) > 0;
      const splitFallback = splitPrizePoolDefaults(t.prize_pool);
      setTTitle(t.title);
      setTGame(t.game_name);
      setTMode(t.mode || 'Battle Royale');
      setTEntry(String(t.entry_fee));
      setTPrize(String(t.prize_pool));
      setTPrize1st(String(hasExplicitPrizes ? t.prize_1st : splitFallback.prize1st));
      setTPrize2nd(String(hasExplicitPrizes ? t.prize_2nd : splitFallback.prize2nd));
      setTPrize3rd(String(hasExplicitPrizes ? t.prize_3rd : splitFallback.prize3rd));
      setTPrize4th(String(hasExplicitPrizes ? t.prize_4th : splitFallback.prize4th));
      setTPrize5th(String(hasExplicitPrizes ? t.prize_5th : splitFallback.prize5th));
      setTSlots(String(t.max_slots));
      setTDate(startParts.date);
      setTStartTime(startParts.time);
      setHasEndTime(Boolean(t.end_time));
      setTEndDate(endParts.date);
      setTEndTime(endParts.time);
      setTStatus(
        t.status === 'cancelled'
          ? 'cancelled'
          : t.status === 'completed' && t.winners.length > 0
            ? 'completed'
            : 'auto'
      );
      setTRules(t.rules || '');
      setTRoomId(t.room_id || '');
      setTRoomPass(t.room_pass || '');
    }
  };

  const updateWinnerTierPrize = (tier: 1 | 2 | 3 | 4 | 5, value: string) => {
    const cleanNum = Math.max(0, Math.floor(Number(value) || 0));
    const next1 = tier === 1 ? cleanNum : Math.max(0, Math.floor(Number(tPrize1st) || 0));
    const next2 = tier === 2 ? cleanNum : Math.max(0, Math.floor(Number(tPrize2nd) || 0));
    const next3 = tier === 3 ? cleanNum : Math.max(0, Math.floor(Number(tPrize3rd) || 0));
    const next4 = tier === 4 ? cleanNum : Math.max(0, Math.floor(Number(tPrize4th) || 0));
    const next5 = tier === 5 ? cleanNum : Math.max(0, Math.floor(Number(tPrize5th) || 0));
    if (tier === 1) setTPrize1st(value);
    if (tier === 2) setTPrize2nd(value);
    if (tier === 3) setTPrize3rd(value);
    if (tier === 4) setTPrize4th(value);
    if (tier === 5) setTPrize5th(value);
    setTPrize(String(next1 + next2 + next3 + next4 + next5));
  };

  const applySplitToTotalPrize = (ratios: [number, number, number, number]) => {
    const pool = Math.max(0, Math.floor(Number(tPrize) || 0));
    const split = splitPrizePoolDefaults(pool, ratios);
    setTPrize1st(String(split.prize1st));
    setTPrize2nd(String(split.prize2nd));
    setTPrize3rd(String(split.prize3rd));
    setTPrize4th(String(split.prize4th));
    setTPrize5th(String(split.prize5th));
  };

  const applyQuickStartTime = (time24: string) => {
    setTStartTime(time24);
    if (hasEndTime) {
      const nextEnd = addHoursToPktParts(tDate, time24, 2);
      if (nextEnd) {
        setTEndDate(nextEnd.date);
        setTEndTime(nextEnd.time);
      }
    }
  };

  const applyEndDuration = (hours: number) => {
    const nextEnd = addHoursToPktParts(tDate, tStartTime, hours);
    if (nextEnd) {
      setHasEndTime(true);
      setTEndDate(nextEnd.date);
      setTEndTime(nextEnd.time);
    }
  };

  const handleSaveTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingTournament) return;
    setError('');
    setNotice('');
    setSavingTournament(true);
    try {
      const startIso = pktDateTimeToIso(tDate, tStartTime);
      if (!startIso) {
        setError('Please select a valid Tournament Date and Start Time (PKT).');
        return;
      }

      let endIso = '';
      if (hasEndTime) {
        const parsedEnd = pktDateTimeToIso(tEndDate, tEndTime);
        if (!parsedEnd) {
          setError('Please select a valid End Date and End Time (PKT).');
          return;
        }
        if (Date.parse(parsedEnd) <= Date.parse(startIso)) {
          setError('End Date & Time must be later than Start Date & Time.');
          return;
        }
        endIso = parsedEnd;
      }

      const p1 = Math.max(0, Math.floor(Number(tPrize1st) || 0));
      const p2 = Math.max(0, Math.floor(Number(tPrize2nd) || 0));
      const p3 = Math.max(0, Math.floor(Number(tPrize3rd) || 0));
      const p4 = Math.max(0, Math.floor(Number(tPrize4th) || 0));
      const p5 = Math.max(0, Math.floor(Number(tPrize5th) || 0));
      const sumPrizes = p1 + p2 + p3 + p4 + p5;
      const body = {
        title: tTitle,
        gameName: tGame,
        mode: tMode,
        entryFee: Number(tEntry),
        prizePool: Math.max(Number(tPrize) || 0, sumPrizes),
        prize1st: p1,
        prize2nd: p2,
        prize3rd: p3,
        prize4th: p4,
        prize5th: p5,
        maxSlots: Number(tSlots),
        matchTime: startIso,
        endTime: endIso,
        status: tStatus,
        rules: tRules,
        roomId: tRoomId,
        roomPass: tRoomPass,
      };
      let savedTournament: Tournament | null = null;
      if (tourModal === 'new') {
        const res = await apiRequest<{ tournament: Tournament }>('/api/admin/tournaments', {
          method: 'POST',
          token,
          headers: { 'X-Manual-Admin-Action': 'create-tournament-button' },
          body: { ...body, manualCreateConfirm: true },
        });
        savedTournament = res.tournament;
        setNotice('Tournament created with PKT schedule and Top 5 winner prize tiers.');
      } else if (tourModal) {
        const res = await apiRequest<{ tournament: Tournament }>(
          `/api/admin/tournaments/${tourModal.id}`,
          { method: 'PATCH', token, body }
        );
        savedTournament = res.tournament;
        setNotice('Tournament schedule and Top 5 prizes updated.');
      }
      if (savedTournament && isFirebaseAdminUser()) {
        await syncTournamentToFirestore(savedTournament);
        await saveTournamentPolicyToFirestore(deletedTournamentIds).catch(() => {});
        const count = await getFirestoreTournamentCount();
        setFirebaseTourCount(count);
      }
      setTourModal(null);
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tournament.');
    } finally {
      setSavingTournament(false);
    }
  };

  const handleDeleteTournament = async (id: number) => {
    setError('');
    setNotice('');
    try {
      const res = await apiRequest<{ ok: boolean; deletedTournamentIds?: number[] }>(
        `/api/admin/tournaments/${id}`,
        { method: 'DELETE', token }
      );
      const nextDeleted = Array.isArray(res.deletedTournamentIds)
        ? res.deletedTournamentIds
        : Array.from(new Set([...deletedTournamentIds, id]));
      setDeletedTournamentIds(nextDeleted);
      if (isFirebaseAdminUser()) {
        await deleteTournamentFromFirestore(id);
        await saveTournamentPolicyToFirestore(nextDeleted).catch(() => {});
        const count = await getFirestoreTournamentCount();
        setFirebaseTourCount(count);
      }
      setNotice('Tournament permanently removed and any active entry fees refunded.');
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tournament.');
    }
  };

  const handleAddPlayerToTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rosterModal) return;
    setError('');
    try {
      const res = await apiRequest<{ tournament: Tournament }>(
        `/api/admin/tournaments/${rosterModal.id}/players`,
        {
          method: 'POST',
          token,
          body: {
            playerIdentifier: addPlayerId,
            inGameName: addPlayerIgn,
            chargeFee,
          },
        }
      );
      setRosterModal(res.tournament);
      if (isFirebaseAdminUser()) {
        await syncTournamentToFirestore(res.tournament).catch(() => {});
      }
      setAddPlayerId('');
      setAddPlayerIgn('');
      setNotice('Player added to tournament.');
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add player.');
    }
  };

  const handleRemovePlayerFromTournament = async (tournamentId: number, userId: number) => {
    setError('');
    try {
      const res = await apiRequest<{ tournament: Tournament }>(
        `/api/admin/tournaments/${tournamentId}/players/${userId}?refund=true`,
        { method: 'DELETE', token }
      );
      setRosterModal(res.tournament);
      if (isFirebaseAdminUser()) {
        await syncTournamentToFirestore(res.tournament).catch(() => {});
      }
      setNotice('Player removed and entry fee refunded if applicable.');
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove player.');
    }
  };

  const openWinnerSelector = (t: Tournament) => {
    setError('');
    setNotice('');
    setWinnerModal(t);
    const existingByRank = new Map(t.winners.map((w) => [w.placement, w]));
    const w1 = existingByRank.get(1);
    const w2 = existingByRank.get(2);
    const w3 = existingByRank.get(3);
    const w4 = existingByRank.get(4);
    const w5 = existingByRank.get(5);
    setW1User(w1 ? String(w1.user_id) : '');
    setW2User(w2 ? String(w2.user_id) : '');
    setW3User(w3 ? String(w3.user_id) : '');
    setW4User(w4 ? String(w4.user_id) : '');
    setW5User(w5 ? String(w5.user_id) : '');

    const hasExplicitPrizes =
      (t.prize_1st || 0) > 0 ||
      (t.prize_2nd || 0) > 0 ||
      (t.prize_3rd || 0) > 0 ||
      (t.prize_4th || 0) > 0 ||
      (t.prize_5th || 0) > 0;
    const splitFallback = splitPrizePoolDefaults(t.prize_pool);
    setW1Prize(String(w1 ? w1.prize_amount : hasExplicitPrizes ? t.prize_1st : splitFallback.prize1st));
    setW2Prize(String(w2 ? w2.prize_amount : hasExplicitPrizes ? t.prize_2nd : splitFallback.prize2nd));
    setW3Prize(String(w3 ? w3.prize_amount : hasExplicitPrizes ? t.prize_3rd : splitFallback.prize3rd));
    setW4Prize(String(w4 ? w4.prize_amount : hasExplicitPrizes ? t.prize_4th : splitFallback.prize4th));
    setW5Prize(String(w5 ? w5.prize_amount : hasExplicitPrizes ? t.prize_5th : splitFallback.prize5th));
  };

  const handleDeclareWinners = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!winnerModal) return;
    setError('');
    const list: Array<{ userId: number; placement: number; prizeAmount: number }> = [];
    if (w1User) list.push({ userId: Number(w1User), placement: 1, prizeAmount: Math.max(0, Math.floor(Number(w1Prize) || 0)) });
    if (w2User) list.push({ userId: Number(w2User), placement: 2, prizeAmount: Math.max(0, Math.floor(Number(w2Prize) || 0)) });
    if (w3User) list.push({ userId: Number(w3User), placement: 3, prizeAmount: Math.max(0, Math.floor(Number(w3Prize) || 0)) });
    if (w4User) list.push({ userId: Number(w4User), placement: 4, prizeAmount: Math.max(0, Math.floor(Number(w4Prize) || 0)) });
    if (w5User) list.push({ userId: Number(w5User), placement: 5, prizeAmount: Math.max(0, Math.floor(Number(w5Prize) || 0)) });

    if (list.length === 0) {
      setError('Select the Top 5 tournament winners.');
      return;
    }

    const distinctIds = new Set(list.map((w) => w.userId));
    if (distinctIds.size !== list.length) {
      setError('The same player cannot win more than one position in the same tournament.');
      return;
    }

    const totalSelectableUsers = new Set([
      ...winnerModal.registered_players.map((p) => p.user_id),
      ...users.filter((u) => u.is_blocked === 0).map((u) => u.id),
    ]).size;

    if (totalSelectableUsers >= 5 && list.length < 5) {
      setError('Please select all 5 winners (1st, 2nd, 3rd, 4th, and 5th Winner).');
      return;
    }

    const isEditingExisting = winnerModal.winners.length > 0;
    try {
      const res = await apiRequest<{ tournament: Tournament }>(
        `/api/admin/tournaments/${winnerModal.id}/winners`,
        {
          method: isEditingExisting ? 'PUT' : 'POST',
          token,
          body: { winners: list },
        }
      );
      if (res?.tournament && isFirebaseAdminUser()) {
        await syncTournamentToFirestore(res.tournament).catch(() => {});
      }
      setWinnerModal(null);
      setW1User('');
      setW1Prize('');
      setW2User('');
      setW2Prize('');
      setW3User('');
      setW3Prize('');
      setW4User('');
      setW4Prize('');
      setW5User('');
      setW5Prize('');
      setNotice(
        isEditingExisting
          ? 'Top 5 winners updated and wallet prizes & leaderboard synced.'
          : 'All 5 winners declared, prize money added to wallets, and leaderboard updated.'
      );
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save winners.');
    }
  };

  const handleReviewDeposit = async (id: number, action: 'approve' | 'reject') => {
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/admin/deposits/${id}/review`, {
        method: 'POST',
        token,
        body: { action, adminNote: action === 'approve' ? 'Verified receipt' : 'Invalid TID or receipt' },
      });
      setNotice(`Deposit #${id} ${action}d.`);
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit review failed.');
    }
  };

  const handleReviewWithdrawal = async (id: number, action: 'approve' | 'pay' | 'reject') => {
    setError('');
    setNotice('');
    try {
      const adminNote =
        action === 'approve'
          ? 'Approved for payout'
          : action === 'pay'
            ? 'Payment confirmed & transferred'
            : 'Rejected by admin';
      await apiRequest(`/api/admin/withdrawals/${id}/review`, {
        method: 'POST',
        token,
        body: { action, adminNote },
      });
      setNotice(
        action === 'approve'
          ? `Withdrawal #${id} approved for payment.`
          : action === 'pay'
            ? `Withdrawal #${id} marked Paid and deducted from player wallet.`
            : `Withdrawal #${id} rejected and pending hold released.`
      );
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal review failed.');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/admin/users', {
        method: 'POST',
        token,
        body: {
          username: nuUsername,
          email: nuEmail,
          password: nuPassword,
          role: nuRole,
          initialBalance: Number(nuBalance) || 0,
        },
      });
      setNewUserModal(false);
      setNuUsername('');
      setNuEmail('');
      setNuPassword('');
      setNuBalance('0');
      setNotice('User account created.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user.');
    }
  };

  const handleToggleBlock = async (u: AdminUserRow) => {
    setError('');
    try {
      await apiRequest(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        token,
        body: { isBlocked: u.is_blocked === 0 },
      });
      setNotice(`${u.username} ${u.is_blocked === 0 ? 'blocked' : 'unblocked'}.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user status.');
    }
  };

  const handleToggleRole = async (u: AdminUserRow) => {
    setError('');
    try {
      const nextRole = u.role === 'admin' ? 'player' : 'admin';
      await apiRequest(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        token,
        body: { role: nextRole },
      });
      setNotice(`${u.username} role set to ${nextRole}.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role.');
    }
  };

  const handleDeleteUser = async (u: AdminUserRow) => {
    setError('');
    try {
      await apiRequest(`/api/admin/users/${u.id}`, { method: 'DELETE', token });
      setNotice(`Removed user ${u.username}.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user.');
    }
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustUser) return;
    setError('');
    try {
      await apiRequest(`/api/admin/users/${adjustUser.id}`, {
        method: 'PATCH',
        token,
        body: {
          balanceAdjustment: Number(adjustDelta),
          adjustmentNote: adjustNote,
        },
      });
      setAdjustUser(null);
      setAdjustDelta('');
      setAdjustNote('');
      setNotice('Wallet balance adjusted and logged.');
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adjustment failed.');
    }
  };

  const handleAwardPrize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prizeUser) return;
    setError('');
    setNotice('');
    const parsedAmount = Math.floor(Number(prizeAmount));
    if (!Number.isFinite(parsedAmount) || parsedAmount < 1) {
      setError('Enter a valid prize amount of PKR 1 or more.');
      return;
    }
    try {
      await apiRequest(`/api/admin/users/${prizeUser.id}/award-prize`, {
        method: 'POST',
        token,
        body: {
          amount: parsedAmount,
          tournamentId: prizeTournamentId ? Number(prizeTournamentId) : undefined,
          note: prizeNote.trim() || undefined,
        },
      });
      setNotice(`Credited ${formatPKR(parsedAmount)} prize money to ${prizeUser.username}'s wallet.`);
      setPrizeUser(null);
      setPrizeAmount('');
      setPrizeTournamentId('');
      setPrizeNote('');
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to credit prize money.');
    }
  };

  const handleReviewTeamRegistration = async (id: number, action: 'confirm' | 'reject') => {
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/admin/team-registrations/${id}/review`, {
        method: 'POST',
        token,
        body: { action },
      });
      setNotice(`Team registration #${id} ${action === 'confirm' ? 'confirmed' : 'rejected'}.`);
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review team registration.');
    }
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await apiRequest('/api/admin/announcements', {
        method: 'POST',
        token,
        body: {
          title: annTitle,
          category: annCategory,
          content: annContent,
          isPinned: annPinned,
        },
      });
      setAnnTitle('');
      setAnnContent('');
      setAnnPinned(false);
      setNotice('Announcement published.');
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish announcement.');
    }
  };

  const handleDeleteAnnouncement = async (id: number) => {
    setError('');
    try {
      await apiRequest(`/api/admin/announcements/${id}`, { method: 'DELETE', token });
      setNotice('Announcement deleted.');
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete announcement.');
    }
  };

  const handleUpdateContactStatus = async (id: number, status: 'open' | 'resolved') => {
    setError('');
    try {
      await apiRequest(`/api/admin/contacts/${id}`, {
        method: 'PATCH',
        token,
        body: { status },
      });
      setNotice(`Support ticket marked as ${status}.`);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ticket status.');
    }
  };

  const previewVideoId = extractYouTubeVideoId(vUrl);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Admin Operations Console
          </h1>
          <p className="text-sm text-slate-400">
            Manage tournaments, homepage YouTube videos, squad registrations, announcements, and PKR payouts.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#131A29] border border-white/[0.08] rounded-xl overflow-x-auto">
          {(
            [
              { id: 'overview', label: 'Reports' },
              { id: 'tournaments', label: 'Tournaments' },
              { id: 'videos', label: `YouTube (${videos.length})` },
              {
                id: 'registrations',
                label: `Squads${overview?.pendingTeamRegistrations ? ` (${overview.pendingTeamRegistrations})` : ''}`,
              },
              {
                id: 'deposits',
                label: `Deposits${overview?.pendingDeposits ? ` (${overview.pendingDeposits})` : ''}`,
              },
              {
                id: 'withdrawals',
                label: `Withdrawals${overview?.pendingWithdrawals ? ` (${overview.pendingWithdrawals})` : ''}`,
              },
              {
                id: 'notices',
                label: `Notices${overview?.openContacts ? ` (${overview.openContacts})` : ''}`,
              },
              { id: 'users', label: 'Users' },
              { id: 'transactions', label: 'Ledger' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                tab === item.id
                  ? 'bg-gradient-to-r from-[#F59E0B] to-[#FACC15] text-[#0A0E17]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-xl bg-[#22C55E]/15 border border-white/[0.14] text-[#4ADE80] text-sm">
          {notice}
        </div>
      )}

      {/* OVERVIEW / FINANCIAL REPORTS */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-5">
              <div className="text-xs text-slate-400">Total Users</div>
              <div className="font-mono text-2xl font-bold text-white tabular-nums mt-1">
                {overview?.totalUsers ?? 0}
              </div>
              <div className="text-xs text-rose-400 mt-1">
                {overview?.blockedUsers ?? 0} blocked
              </div>
            </div>
            <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-5">
              <div className="text-xs text-slate-400">Approved Deposits</div>
              <div className="font-mono text-2xl font-bold text-[#4ADE80] tabular-nums mt-1">
                {formatPKR(overview?.totalDeposited)}
              </div>
              <div className="text-xs text-[#FACC15] mt-1">
                {overview?.pendingDeposits ?? 0} pending review
              </div>
            </div>
            <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-5">
              <div className="text-xs text-slate-400">Paid Withdrawals</div>
              <div className="font-mono text-2xl font-bold text-white tabular-nums mt-1">
                {formatPKR(overview?.totalWithdrawn)}
              </div>
              <div className="text-xs text-[#FACC15] mt-1">
                {overview?.pendingWithdrawals ?? 0} pending payout
              </div>
            </div>
            <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-5">
              <div className="text-xs text-slate-400">Prizes Awarded</div>
              <div className="font-mono text-2xl font-bold text-[#FACC15] tabular-nums mt-1">
                {formatPKR(overview?.totalPrizesAwarded)}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Fees: {formatPKR(overview?.totalEntryFees)}
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-5 space-y-2">
              <div className="text-sm font-semibold text-white">Platform Wallet Liability</div>
              <div className="font-mono text-2xl font-bold text-[#4ADE80] tabular-nums">
                {formatPKR(overview?.totalUserBalances)}
              </div>
              <p className="text-xs text-slate-400">
                Total combined PKR held across all active user wallets.
              </p>
            </div>
            <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-5 space-y-2">
              <div className="text-sm font-semibold text-white">Tournament Operations</div>
              <div className="font-mono text-2xl font-bold text-white tabular-nums">
                {overview?.activeTournaments ?? 0} Active / {overview?.totalTournaments ?? 0} Total
              </div>
              <p className="text-xs text-slate-400">
                Create Free Fire brackets, manage players, feature YouTube highlights, and disburse prizes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* YOUTUBE VIDEOS MANAGEMENT */}
      {tab === 'videos' && (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-[#131A29] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Youtube className="w-5 h-5 text-[#FACC15]" />
                <span>{editingVideoId !== null ? 'Edit YouTube Video' : 'Add YouTube Video'}</span>
              </h2>
              {editingVideoId !== null && (
                <button
                  type="button"
                  onClick={resetVideoForm}
                  className="text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel Edit
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Paste any YouTube watch, youtu.be, Shorts, or Live link. The featured video appears automatically on the homepage.
            </p>

            <form onSubmit={handleSaveVideo} className="space-y-4">
              <div>
                <label htmlFor="yt-url-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  YouTube Video Link *
                </label>
                <input
                  id="yt-url-input"
                  type="url"
                  required
                  value={vUrl}
                  onChange={(e) => setVUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full min-h-[44px] px-3.5 py-2 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              <div>
                <label htmlFor="yt-title-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Video Title (Optional)
                </label>
                <input
                  id="yt-title-input"
                  type="text"
                  maxLength={140}
                  value={vTitle}
                  onChange={(e) => setVTitle(e.target.value)}
                  placeholder="e.g. Bermuda Final Highlights · FREE FIRE TOURNAMENT 09"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              {previewVideoId && (
                <div className="bg-[#0D1320] border border-white/[0.1] rounded-xl p-3 space-y-2">
                  <div className="text-[11px] font-semibold text-[#4ADE80]">
                    Valid YouTube Video Detected ({previewVideoId})
                  </div>
                  <img
                    src={getYouTubeThumbnailUrl(previewVideoId)}
                    alt="YouTube video preview"
                    referrerPolicy="no-referrer"
                    className="w-full aspect-video object-cover rounded-lg border border-white/[0.08]"
                  />
                </div>
              )}

              <label className="min-h-[44px] px-3.5 py-2 bg-[#0D1320] border border-white/[0.08] rounded-xl flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={vFeatured}
                  onChange={(e) => setVFeatured(e.target.checked)}
                />
                <span>Set as Featured Video on Homepage</span>
              </label>

              <button
                type="submit"
                disabled={vSaving}
                className="ff-btn-ember w-full min-h-[46px] rounded-xl font-bold text-sm disabled:opacity-60"
              >
                {vSaving
                  ? 'Saving Video...'
                  : editingVideoId !== null
                    ? 'Save Video Changes'
                    : 'Publish YouTube Video'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-[#131A29] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-white">
                Saved Homepage Videos ({videos.length})
              </h2>
              <span className="text-xs text-[#FACC15] font-medium">
                Switch featured video anytime
              </span>
            </div>

            {videos.length === 0 ? (
              <p className="text-sm text-slate-400">
                No YouTube videos added yet. Paste a YouTube link on the left to publish your first homepage video.
              </p>
            ) : (
              <div className="space-y-3">
                {videos.map((v) => (
                  <div
                    key={v.id}
                    className={`bg-[#0D1320] border rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      v.is_featured === 1 ? 'border-[#FACC15]/60' : 'border-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <img
                        src={getYouTubeThumbnailUrl(v.video_id)}
                        alt={v.title}
                        referrerPolicy="no-referrer"
                        className="w-24 h-14 rounded-lg object-cover bg-[#0A0E17] border border-white/[0.08] shrink-0"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {v.is_featured === 1 && (
                            <span className="px-2 py-0.5 rounded-md bg-[#FACC15]/15 border border-[#FACC15]/45 text-[#FACC15] text-[10px] font-bold inline-flex items-center gap-1">
                              <Star className="w-3 h-3 fill-current" />
                              <span>Featured on Homepage</span>
                            </span>
                          )}
                          <span className="font-mono text-[11px] text-slate-400">
                            {formatShortDate(v.updated_at || v.created_at)}
                          </span>
                        </div>
                        <div className="font-display text-sm font-bold text-white truncate">
                          {v.title}
                        </div>
                        <a
                          href={v.youtube_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#4ADE80] hover:text-[#FACC15] inline-flex items-center gap-1 truncate max-w-full"
                        >
                          <span className="truncate">{v.youtube_url}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {v.is_featured !== 1 && (
                        <button
                          type="button"
                          onClick={() => handleFeatureVideo(v.id)}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#FACC15]/15 border border-[#FACC15]/45 hover:bg-[#FACC15]/25 text-[#FACC15] text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Star className="w-3.5 h-3.5" />
                          <span>Set Featured</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleEditVideo(v)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#131A29] border border-white/[0.1] hover:border-[#FACC15]/60 text-xs font-medium text-slate-100 inline-flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteVideo(v.id)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-xs font-medium text-rose-300 inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOURNAMENTS MANAGEMENT */}
      {tab === 'tournaments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-white">
              All Tournaments ({tournaments.length})
            </h2>
            <button
              type="button"
              onClick={() => openTournamentEditor('new')}
              className="ff-btn-ember min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create Tournament</span>
            </button>
          </div>

          {/* Firebase Cloud Security & Manual Sync Bar */}
          <div className="bg-[#0D1320] border border-[#FACC15]/25 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  firebaseAdminEmail
                    ? 'bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#4ADE80]'
                    : 'bg-[#FACC15]/15 border border-[#FACC15]/40 text-[#FACC15]'
                }`}
              >
                {firebaseAdminEmail ? (
                  <ShieldCheck className="w-4 h-4" />
                ) : (
                  <CloudOff className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white flex flex-wrap items-center gap-2">
                  <span>Firebase Database &amp; Admin Protection</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#22C55E]/15 border border-[#22C55E]/35 text-[10px] font-bold text-[#4ADE80]">
                    Auto Creation: Disabled (Manual Only)
                  </span>
                  <span className="font-mono text-[11px] text-[#FACC15]">
                    {firebaseTourCount} Cloud Record{firebaseTourCount === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate">
                  {firebaseAdminEmail
                    ? `Admin connected (${firebaseAdminEmail}) · Auto-creation & auto-restore permanently disabled`
                    : `Auto-creation disabled · Connect Google Admin (${ADMIN_FIREBASE_EMAIL}) to back up & lock tournaments in Firebase`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {firebaseAdminEmail ? (
                <>
                  <button
                    type="button"
                    disabled={syncingCloud || tournaments.length === 0}
                    onClick={handleManualSyncToFirebase}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#FACC15]/15 border border-[#FACC15]/45 hover:bg-[#FACC15]/25 text-xs font-bold text-[#FACC15] inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingCloud ? 'animate-spin' : ''}`} />
                    <span>{syncingCloud ? 'Syncing...' : 'Sync Existing to Firebase'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnectFirebaseAdmin}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#131A29] border border-white/[0.1] hover:border-white/25 text-xs font-medium text-slate-300"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={connectingFirebase}
                  onClick={handleConnectFirebaseAdmin}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] text-[#0A0E17] text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>{connectingFirebase ? 'Connecting...' : 'Connect Firebase Admin'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            {tournaments.map((t) => (
              <div
                key={t.id}
                className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <img
                    src={t.banner_url}
                    alt={t.title}
                    referrerPolicy="no-referrer"
                    className="w-20 h-14 rounded-xl object-cover shrink-0 bg-[#0D1320]"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-400">
                      <span
                        className={`uppercase font-semibold ${
                          t.status === 'live'
                            ? 'text-[#4ADE80]'
                            : t.status === 'completed'
                              ? 'text-slate-200'
                              : t.status === 'cancelled'
                                ? 'text-rose-400'
                                : 'text-[#FACC15]'
                        }`}
                      >
                        {getTournamentStatusLabel(t.status)}
                      </span>
                      <span>·</span>
                      <span className="text-[#FDE047] font-semibold">{t.mode || 'Battle Royale'}</span>
                      <span>·</span>
                      <span>{t.game_name}</span>
                      <span>·</span>
                      <span>{formatPktScheduleRange(t.match_time, t.end_time)}</span>
                    </div>
                    <div className="font-display text-base font-bold text-white truncate">
                      {t.title}
                    </div>
                    <div className="text-xs font-mono text-slate-300 mt-0.5 tabular-nums">
                      Entry: {formatPKR(t.entry_fee)} · Prize: {formatPKR(t.prize_pool)} · Slots:{' '}
                      {t.filled_slots}/{t.max_slots}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-mono tabular-nums">
                      <span className="text-[#FACC15]">🏆 1st: {formatPKR(t.prize_1st)}</span>
                      <span className="text-slate-300">🥈 2nd: {formatPKR(t.prize_2nd)}</span>
                      <span className="text-amber-300">🥉 3rd: {formatPKR(t.prize_3rd)}</span>
                      <span className="text-[#4ADE80]">🎖️ 4th: {formatPKR(t.prize_4th)}</span>
                      <span className="text-sky-300">⭐ 5th: {formatPKR(t.prize_5th)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRosterModal(t)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#0D1320] border border-white/[0.1] hover:border-[#FACC15] text-xs font-medium text-white inline-flex items-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5 text-[#4ADE80]" />
                    <span>Players ({t.filled_slots})</span>
                  </button>
                  {t.winners.length === 0 && t.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => openWinnerSelector(t)}
                      className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 ${
                        t.status === 'completed'
                          ? 'ff-btn-ember font-bold'
                          : 'bg-[#FACC15]/15 border border-[#FACC15]/45 hover:bg-[#FACC15]/25 text-white'
                      }`}
                    >
                      <Trophy className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {t.status === 'completed' ? 'Ended · Select 5 Winners' : 'Select 5 Winners'}
                      </span>
                    </button>
                  )}
                  {t.winners.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setViewWinnersModal(t)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/45 hover:border-[#FACC15] text-xs font-semibold text-[#4ADE80] inline-flex items-center gap-1.5"
                      >
                        <Trophy className="w-3.5 h-3.5 text-[#FACC15]" />
                        <span>Top {t.winners.length} Winners</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openWinnerSelector(t)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#FACC15]/10 border border-[#FACC15]/40 hover:bg-[#FACC15]/20 text-xs font-semibold text-[#FACC15] inline-flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Change Winners</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => openTournamentEditor(t)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#0D1320] border border-white/[0.1] hover:border-[#FACC15] text-xs font-medium text-slate-100 inline-flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTournament(t.id)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-xs font-medium text-rose-300 inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TEAM REGISTRATIONS QUEUE */}
      {tab === 'registrations' && (
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-white">
            Team &amp; Player Registrations ({teamRegistrations.length})
          </h2>
          {teamRegistrations.length === 0 ? (
            <p className="text-sm text-slate-400">No squad registrations submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {teamRegistrations.map((r) => (
                <div
                  key={r.id}
                  className="bg-[#0D1320] border border-white/[0.08] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="font-mono font-bold text-[#FACC15]">
                        {r.registration_code}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-white font-semibold">{r.team_name}</span>
                      <span className="text-[#4ADE80] font-semibold">({r.squad_type})</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatShortDate(r.created_at)}</span>
                    </div>
                    <div className="text-xs text-slate-200">
                      Captain: <span className="font-semibold">{r.leader_name}</span> · UID:{' '}
                      <span className="font-mono text-[#FACC15]">{r.freefire_uid}</span> · WhatsApp:{' '}
                      <span className="font-mono text-[#4ADE80]">{r.whatsapp_number}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {r.tournament_title} · Payment: <span className="uppercase">{r.payment_method}</span>{' '}
                      ({r.payment_ref})
                    </div>
                    {r.teammates && (
                      <div className="text-xs text-slate-400 break-words">
                        Teammates: {r.teammates}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {r.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleReviewTeamRegistration(r.id, 'confirm')}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#22C55E] hover:bg-[#4ADE80] text-[#0A0E17] text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Confirm Slot</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewTeamRegistration(r.id, 'reject')}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </>
                    ) : (
                      <span
                        className={`text-xs font-semibold uppercase ${
                          r.status === 'confirmed' ? 'text-[#4ADE80]' : 'text-rose-400'
                        }`}
                      >
                        {r.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ANNOUNCEMENTS & SUPPORT TICKETS */}
      {tab === 'notices' && (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 bg-[#131A29] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-5">
            <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[#FACC15]" />
              <span>Publish Announcement / Match Result</span>
            </h2>
            <form onSubmit={handlePublishAnnouncement} className="space-y-3">
              <input
                type="text"
                required
                minLength={3}
                maxLength={140}
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="Headline (e.g. Bermuda Squad Winners & Room Schedule)"
                className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <select
                  value={annCategory}
                  onChange={(e) =>
                    setAnnCategory(e.target.value as AnnouncementRecord['category'])
                  }
                  className="min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
                >
                  <option value="Announcement">Announcement</option>
                  <option value="Match Result">Match Result</option>
                  <option value="Room Alert">Room Alert</option>
                  <option value="Rules Update">Rules Update</option>
                </select>
                <label className="min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={annPinned}
                    onChange={(e) => setAnnPinned(e.target.checked)}
                  />
                  <span>Pin to top of announcements</span>
                </label>
              </div>
              <textarea
                rows={3}
                required
                minLength={5}
                maxLength={1500}
                value={annContent}
                onChange={(e) => setAnnContent(e.target.value)}
                placeholder="Write match timing updates, winner details, or custom room instructions..."
                className="w-full p-3 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
              />
              <button
                type="submit"
                className="ff-btn-ember w-full min-h-[44px] rounded-xl text-sm font-bold"
              >
                Publish Notice
              </button>
            </form>

            <div className="space-y-2.5 pt-2 border-t border-white/[0.08]">
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className="bg-[#0D1320] border border-white/[0.08] rounded-xl p-3.5 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-[11px] font-semibold text-[#FACC15]">
                      {a.category} {a.is_pinned ? '· Pinned' : ''}
                    </div>
                    <div className="text-sm font-semibold text-white">{a.title}</div>
                    <p className="text-xs text-slate-400">{a.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAnnouncement(a.id)}
                    aria-label="Delete announcement"
                    className="p-2 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 bg-[#131A29] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#FACC15]" />
              <span>Support Tickets ({contacts.length})</span>
            </h2>
            {contacts.length === 0 ? (
              <p className="text-sm text-slate-400">No support messages submitted yet.</p>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {contacts.map((c) => (
                  <div
                    key={c.id}
                    className="bg-[#0D1320] border border-white/[0.08] rounded-xl p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-bold text-[#FACC15]">{c.ticket_code}</span>
                      <span
                        className={`font-semibold uppercase ${
                          c.status === 'resolved' ? 'text-[#4ADE80]' : 'text-[#FDE047]'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-white">{c.subject}</div>
                    <div className="text-xs text-slate-400">
                      {c.name} · WhatsApp: <span className="font-mono text-[#4ADE80]">{c.whatsapp_number}</span>
                      {c.freefire_uid ? ` · UID: ${c.freefire_uid}` : ''}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{c.message}</p>
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateContactStatus(c.id, c.status === 'open' ? 'resolved' : 'open')
                        }
                        className="min-h-[34px] px-3 rounded-lg bg-[#22C55E]/15 hover:bg-[#22C55E]/25 text-xs font-medium text-white"
                      >
                        {c.status === 'open' ? 'Mark Resolved' : 'Reopen Ticket'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DEPOSITS QUEUE */}
      {tab === 'deposits' && (
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-white">
            Deposit Verification Queue ({deposits.length})
          </h2>
          {deposits.length === 0 ? (
            <p className="text-sm text-slate-400">No deposit requests found.</p>
          ) : (
            <div className="space-y-3">
              {deposits.map((d) => (
                <div
                  key={d.id}
                  className="bg-[#0D1320] border border-white/[0.08] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="text-white font-semibold">{d.username}</span>
                      <span className="font-mono">{d.player_id}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{d.method.replace('_', ' ')}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatShortDate(d.created_at)}</span>
                    </div>
                    <div className="font-mono text-lg font-bold text-[#FACC15] tabular-nums">
                      {formatPKR(d.amount)}
                    </div>
                    <div className="text-xs text-slate-200 font-mono">
                      TID: {d.transaction_ref} · Sender: {d.sender_account}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {d.screenshot_data && (
                      <button
                        type="button"
                        onClick={() => setPreviewScreenshot(d.screenshot_data!)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#22C55E]/15 hover:bg-[#22C55E]/25 text-xs font-medium text-white inline-flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#FACC15]" />
                        <span>View Receipt</span>
                      </button>
                    )}

                    {d.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleReviewDeposit(d.id, 'approve')}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#22C55E] hover:bg-[#4ADE80] text-[#0A0E17] text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewDeposit(d.id, 'reject')}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </>
                    ) : (
                      <span
                        className={`text-xs font-semibold capitalize ${
                          d.status === 'approved' ? 'text-[#4ADE80]' : 'text-rose-400'
                        }`}
                      >
                        {d.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* WITHDRAWALS QUEUE */}
      {tab === 'withdrawals' && (
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              Withdrawal Payout Queue ({withdrawals.length})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Review Easypaisa, JazzCash, and Bank Account requests. Player balance is deducted only when marked Paid.
            </p>
          </div>
          {withdrawals.length === 0 ? (
            <p className="text-sm text-slate-400">No withdrawal requests found.</p>
          ) : (
            <div className="space-y-3">
              {withdrawals.map((w) => {
                const methodLabel =
                  w.method === 'bank_account'
                    ? `Bank Account${w.bank_name ? ` (${w.bank_name})` : ''}`
                    : w.method === 'easypaisa'
                      ? 'Easypaisa'
                      : 'JazzCash';

                const statusBadgeClass =
                  w.status === 'paid'
                    ? 'bg-[#22C55E]/15 text-[#4ADE80] border-white/[0.14]'
                    : w.status === 'approved'
                      ? 'bg-sky-500/15 text-sky-300 border-sky-500/35'
                      : w.status === 'rejected'
                        ? 'bg-rose-500/15 text-rose-400 border-rose-500/35'
                        : 'bg-[#FACC15]/15 text-[#FACC15] border-[#FACC15]/40';

                return (
                  <div
                    key={w.id}
                    className="bg-[#0D1320] border border-white/[0.08] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="text-white font-semibold">{w.username}</span>
                        <span className="font-mono">{w.player_id}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#FACC15] font-medium">{methodLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatShortDate(w.created_at)}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold uppercase ${statusBadgeClass}`}
                        >
                          {w.status}
                        </span>
                      </div>
                      <div className="font-mono text-lg font-bold text-[#4ADE80] tabular-nums">
                        {formatPKR(w.amount)}
                      </div>
                      <div className="text-xs text-slate-200">
                        Holder: <span className="text-white font-medium">{w.account_title}</span> · Account:{' '}
                        <span className="font-mono text-slate-100">{w.account_number}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {w.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReviewWithdrawal(w.id, 'approve')}
                            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-sky-500/15 border border-sky-500/40 hover:bg-sky-500/25 text-sky-300 text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewWithdrawal(w.id, 'pay')}
                            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#22C55E] hover:bg-[#4ADE80] text-[#0A0E17] text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve &amp; Mark Paid</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewWithdrawal(w.id, 'reject')}
                            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {w.status === 'approved' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReviewWithdrawal(w.id, 'pay')}
                            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#22C55E] hover:bg-[#4ADE80] text-[#0A0E17] text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirm Payment (Paid)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewWithdrawal(w.id, 'reject')}
                            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}

                      {(w.status === 'paid' || w.status === 'rejected') && (
                        <span
                          className={`text-xs font-semibold capitalize ${
                            w.status === 'paid' ? 'text-[#4ADE80]' : 'text-rose-400'
                          }`}
                        >
                          {w.status === 'paid' ? 'Paid & Deducted' : 'Rejected'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* USERS & ACCOUNT SECURITY */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-white">
              Registered Accounts ({users.length})
            </h2>
            <button
              type="button"
              onClick={() => setNewUserModal(true)}
              className="ff-btn-ember min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add User</span>
            </button>
          </div>

          <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl divide-y divide-white/[0.07]">
            {users.map((u) => (
              <div
                key={u.id}
                className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={u.avatar_url || '/src/assets/images/kelly_hero_banner_1795312122819.jpg'}
                    alt={u.username}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-xl object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{u.username}</span>
                      <span className="font-mono text-xs text-slate-400">{u.player_id}</span>
                      <span
                        className={`text-xs font-semibold capitalize ${
                          u.role === 'admin' ? 'text-[#FACC15]' : 'text-[#4ADE80]'
                        }`}
                      >
                        {u.role}
                      </span>
                      {u.is_blocked === 1 && (
                        <span className="text-xs font-semibold text-rose-400 inline-flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Blocked
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {u.email} · Balance:{' '}
                      <span className="font-mono text-white">{formatPKR(u.wallet_balance)}</span> ·{' '}
                      {u.matches_played} matches / {u.wins} wins
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPrizeUser(u);
                      setPrizeAmount('');
                      setPrizeTournamentId('');
                      setPrizeNote('');
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#FACC15]/15 border border-[#FACC15]/45 text-xs font-semibold text-[#FACC15] hover:bg-[#FACC15]/25 inline-flex items-center gap-1"
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    <span>Award Prize</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustUser(u);
                      setAdjustDelta('');
                      setAdjustNote('');
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0D1320] border border-white/[0.1] text-xs font-medium text-white hover:border-[#FACC15]"
                  >
                    Adjust Wallet
                  </button>
                  {u.id !== currentUser.id && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleRole(u)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0D1320] border border-white/[0.1] text-xs font-medium text-slate-100 hover:border-[#FACC15]"
                      >
                        {u.role === 'admin' ? 'Set Player' : 'Make Admin'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleBlock(u)}
                        className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 ${
                          u.is_blocked === 1
                            ? 'bg-[#22C55E]/15 border-white/[0.14] text-[#4ADE80]'
                            : 'bg-[#FACC15]/15 border-[#FACC15]/40 text-[#FDE047]'
                        }`}
                      >
                        {u.is_blocked === 1 ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Unblock</span>
                          </>
                        ) : (
                          <>
                            <Ban className="w-3.5 h-3.5" />
                            <span>Block</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(u)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-medium text-rose-300"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FULL LEDGER */}
      {tab === 'transactions' && (
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-white">
              Platform Transaction Audit ({transactions.length})
            </h2>
            {loading && <span className="text-xs text-slate-400">Refreshing...</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-xs text-slate-400">
                  <th className="py-2.5 pr-4 font-medium">TX Code</th>
                  <th className="py-2.5 pr-4 font-medium">Player</th>
                  <th className="py-2.5 pr-4 font-medium">Type</th>
                  <th className="py-2.5 pr-4 font-medium">Description</th>
                  <th className="py-2.5 pr-4 font-medium">Amount</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07] text-xs">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-3 pr-4 font-mono text-slate-200 whitespace-nowrap">
                      {tx.tx_code}
                    </td>
                    <td className="py-3 pr-4 text-white whitespace-nowrap">
                      {tx.username} <span className="text-slate-400 font-mono">({tx.player_id})</span>
                    </td>
                    <td className="py-3 pr-4 capitalize text-slate-300 whitespace-nowrap">
                      {tx.type.replace('_', ' ')}
                    </td>
                    <td className="py-3 pr-4 text-slate-300 max-w-xs truncate">{tx.description}</td>
                    <td
                      className={`py-3 pr-4 font-mono font-semibold tabular-nums whitespace-nowrap ${
                        tx.direction === 'credit' ? 'text-[#4ADE80]' : 'text-white'
                      }`}
                    >
                      {tx.direction === 'credit' ? '+' : '-'}
                      {formatPKR(tx.amount)}
                    </td>
                    <td className="py-3 pr-4 capitalize text-slate-300">{tx.status}</td>
                    <td className="py-3 text-right text-slate-400 whitespace-nowrap">
                      {formatShortDate(tx.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SCREENSHOT PREVIEW MODAL */}
      {previewScreenshot && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewScreenshot(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-lg w-full bg-[#131A29] border border-white/[0.12] rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-display font-semibold text-white">Payment Screenshot</span>
              <button
                type="button"
                onClick={() => setPreviewScreenshot(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={previewScreenshot}
              alt="Deposit receipt screenshot"
              className="w-full max-h-[70vh] object-contain rounded-xl bg-[#0D1320]"
            />
          </div>
        </div>
      )}

      {/* CREATE / EDIT TOURNAMENT MODAL */}
      {tourModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setTourModal(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveTournament}
            className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                {tourModal === 'new' ? 'Create Free Fire Tournament' : 'Edit Tournament'}
              </h3>
              <button
                type="button"
                onClick={() => setTourModal(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-300 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={tTitle}
                  onChange={(e) => setTTitle(e.target.value)}
                  placeholder="e.g. Kelly Bermuda Championship"
                  className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
                />
              </div>
              <div>
                <label htmlFor="tour-mode" className="block text-xs text-slate-300 mb-1">
                  Free Fire Mode
                </label>
                <select
                  id="tour-mode"
                  value={tMode}
                  onChange={(e) => setTMode(e.target.value as TournamentMode)}
                  className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.12] rounded-xl text-sm font-semibold text-white focus:outline-none focus:border-[#FACC15]"
                >
                  {TOURNAMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-slate-300 mb-1">Game</label>
                <input
                  type="text"
                  required
                  value={tGame}
                  onChange={(e) => setTGame(e.target.value)}
                  className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Entry (PKR)</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={tEntry}
                  onChange={(e) => setTEntry(e.target.value)}
                  className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Total Pool (PKR)</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={tPrize}
                  onChange={(e) => setTPrize(e.target.value)}
                  className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl font-mono text-sm text-[#FACC15] font-bold focus:outline-none focus:border-[#FACC15]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Max Slots</label>
                <input
                  type="number"
                  required
                  min={2}
                  max={500}
                  value={tSlots}
                  onChange={(e) => setTSlots(e.target.value)}
                  className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                />
              </div>
            </div>

            {/* 5 Winners Prize Money Tiers */}
            <div className="bg-[#0D1320] border border-[#FACC15]/35 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Trophy className="w-4 h-4 text-[#FACC15]" />
                  <span>Top 5 Winners Prize Money (PKR)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applySplitToTotalPrize([0.4, 0.25, 0.15, 0.12])}
                    className="min-h-[28px] px-2 py-0.5 rounded-lg bg-[#131A29] border border-white/[0.1] hover:border-[#FACC15] text-[10px] font-semibold text-slate-200"
                  >
                    40 / 25 / 15 / 12 / 8%
                  </button>
                  <button
                    type="button"
                    onClick={() => applySplitToTotalPrize([0.5, 0.2, 0.15, 0.1])}
                    className="min-h-[28px] px-2 py-0.5 rounded-lg bg-[#131A29] border border-white/[0.1] hover:border-[#FACC15] text-[10px] font-semibold text-slate-200"
                  >
                    50 / 20 / 15 / 10 / 5%
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div>
                  <label htmlFor="tour-prize-1st" className="block text-[11px] font-bold text-[#FACC15] mb-1">
                    🏆 1st Prize
                  </label>
                  <input
                    id="tour-prize-1st"
                    type="number"
                    required
                    min={0}
                    value={tPrize1st}
                    onChange={(e) => updateWinnerTierPrize(1, e.target.value)}
                    className="w-full min-h-[42px] px-3 bg-[#131A29] border border-[#FACC15]/45 rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
                <div>
                  <label htmlFor="tour-prize-2nd" className="block text-[11px] font-bold text-slate-200 mb-1">
                    🥈 2nd Prize
                  </label>
                  <input
                    id="tour-prize-2nd"
                    type="number"
                    required
                    min={0}
                    value={tPrize2nd}
                    onChange={(e) => updateWinnerTierPrize(2, e.target.value)}
                    className="w-full min-h-[42px] px-3 bg-[#131A29] border border-slate-300/40 rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
                <div>
                  <label htmlFor="tour-prize-3rd" className="block text-[11px] font-bold text-amber-300 mb-1">
                    🥉 3rd Prize
                  </label>
                  <input
                    id="tour-prize-3rd"
                    type="number"
                    required
                    min={0}
                    value={tPrize3rd}
                    onChange={(e) => updateWinnerTierPrize(3, e.target.value)}
                    className="w-full min-h-[42px] px-3 bg-[#131A29] border border-amber-500/40 rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
                <div>
                  <label htmlFor="tour-prize-4th" className="block text-[11px] font-bold text-[#4ADE80] mb-1">
                    🎖️ 4th Prize
                  </label>
                  <input
                    id="tour-prize-4th"
                    type="number"
                    required
                    min={0}
                    value={tPrize4th}
                    onChange={(e) => updateWinnerTierPrize(4, e.target.value)}
                    className="w-full min-h-[42px] px-3 bg-[#131A29] border border-emerald-400/40 rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="tour-prize-5th" className="block text-[11px] font-bold text-sky-300 mb-1">
                    ⭐ 5th Prize
                  </label>
                  <input
                    id="tour-prize-5th"
                    type="number"
                    required
                    min={0}
                    value={tPrize5th}
                    onChange={(e) => updateWinnerTierPrize(5, e.target.value)}
                    className="w-full min-h-[42px] px-3 bg-[#131A29] border border-sky-400/40 rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>Combined 1st–5th payouts:</span>
                <span className="font-mono font-bold text-[#4ADE80]">
                  {formatPKR(
                    Math.max(0, Math.floor(Number(tPrize1st) || 0)) +
                      Math.max(0, Math.floor(Number(tPrize2nd) || 0)) +
                      Math.max(0, Math.floor(Number(tPrize3rd) || 0)) +
                      Math.max(0, Math.floor(Number(tPrize4th) || 0)) +
                      Math.max(0, Math.floor(Number(tPrize5th) || 0))
                  )}
                </span>
              </div>
            </div>

            {/* Tournament Date & Time (PKT - UTC+5) */}
            <div className="bg-[#0D1320] border border-white/[0.1] rounded-2xl p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Calendar className="w-4 h-4 text-[#4ADE80]" />
                  <span>Tournament Date &amp; Time</span>
                </div>
                <span className="text-[11px] font-medium text-[#FACC15]">
                  Pakistan Standard Time (PKT · UTC+5)
                </span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tour-start-date" className="block text-xs text-slate-300 mb-1.5">
                    Tournament Date
                  </label>
                  <div className="relative">
                    <input
                      id="tour-start-date"
                      type="date"
                      required
                      value={tDate}
                      onChange={(e) => {
                        const nextDate = e.target.value;
                        setTDate(nextDate);
                        if (hasEndTime && tEndDate < nextDate) {
                          setTEndDate(nextDate);
                        }
                      }}
                      className="w-full min-h-[46px] px-3.5 bg-[#131A29] border border-white/[0.1] focus:border-[#FACC15] focus:outline-none rounded-xl font-mono text-sm text-white"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="tour-start-time" className="block text-xs text-slate-300 mb-1.5">
                    Start Time (PKT)
                  </label>
                  <div className="relative">
                    <input
                      id="tour-start-time"
                      type="time"
                      required
                      value={tStartTime}
                      onChange={(e) => setTStartTime(e.target.value)}
                      className="w-full min-h-[46px] px-3.5 bg-[#131A29] border border-white/[0.1] focus:border-[#FACC15] focus:outline-none rounded-xl font-mono text-sm text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Mobile-friendly quick PKT start time presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 mr-1 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Quick PKT:
                </span>
                {[
                  { label: '5:00 PM', val: '17:00' },
                  { label: '7:00 PM', val: '19:00' },
                  { label: '8:00 PM', val: '20:00' },
                  { label: '9:00 PM', val: '21:00' },
                  { label: '10:00 PM', val: '22:00' },
                ].map((preset) => (
                  <button
                    key={preset.val}
                    type="button"
                    onClick={() => applyQuickStartTime(preset.val)}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      tStartTime === preset.val
                        ? 'bg-[#FACC15] border-[#FACC15] text-[#0A0E17] font-bold'
                        : 'bg-[#131A29] border-white/[0.08] text-slate-200 hover:border-[#FACC15]/60'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Optional End Date & Time toggle */}
              <div className="pt-3 border-t border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-white">End Date &amp; Time (Optional)</div>
                    <div className="text-[11px] text-slate-400">
                      Auto-completes tournament when end time passes
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hasEndTime}
                    onClick={() => {
                      const next = !hasEndTime;
                      setHasEndTime(next);
                      if (next && (!tEndDate || !tEndTime)) {
                        const def = addHoursToPktParts(tDate, tStartTime, 2);
                        if (def) {
                          setTEndDate(def.date);
                          setTEndTime(def.time);
                        }
                      }
                    }}
                    className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                      hasEndTime
                        ? 'bg-[#FACC15]/20 border-[#FACC15] text-[#FDE047]'
                        : 'bg-[#131A29] border-white/[0.08] text-slate-200 hover:text-white'
                    }`}
                  >
                    {hasEndTime ? 'Enabled' : '+ Add End Time'}
                  </button>
                </div>

                {hasEndTime && (
                  <div className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="tour-end-date" className="block text-xs text-slate-300 mb-1.5">
                          End Date
                        </label>
                        <input
                          id="tour-end-date"
                          type="date"
                          required={hasEndTime}
                          min={tDate || undefined}
                          value={tEndDate}
                          onChange={(e) => setTEndDate(e.target.value)}
                          className="w-full min-h-[46px] px-3.5 bg-[#131A29] border border-white/[0.1] focus:border-[#FACC15] focus:outline-none rounded-xl font-mono text-sm text-white"
                        />
                      </div>
                      <div>
                        <label htmlFor="tour-end-time" className="block text-xs text-slate-300 mb-1.5">
                          End Time (PKT)
                        </label>
                        <input
                          id="tour-end-time"
                          type="time"
                          required={hasEndTime}
                          value={tEndTime}
                          onChange={(e) => setTEndTime(e.target.value)}
                          className="w-full min-h-[46px] px-3.5 bg-[#131A29] border border-white/[0.1] focus:border-[#FACC15] focus:outline-none rounded-xl font-mono text-sm text-white"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-slate-400 mr-1">Duration:</span>
                      {[
                        { label: '+1 hr', hrs: 1 },
                        { label: '+2 hrs', hrs: 2 },
                        { label: '+3 hrs', hrs: 3 },
                        { label: '+1 day', hrs: 24 },
                      ].map((dur) => (
                        <button
                          key={dur.hrs}
                          type="button"
                          onClick={() => applyEndDuration(dur.hrs)}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#131A29] border border-white/[0.08] text-slate-200 hover:border-[#FACC15]/60 hover:text-white transition-colors"
                        >
                          {dur.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Status Override & Live PKT Schedule Preview */}
              {(() => {
                const previewStart = pktDateTimeToIso(tDate, tStartTime);
                const previewEnd = hasEndTime ? pktDateTimeToIso(tEndDate, tEndTime) : '';
                const invalidRange =
                  Boolean(hasEndTime && previewStart && previewEnd) &&
                  Date.parse(previewEnd!) <= Date.parse(previewStart!);
                const previewStatus =
                  tStatus === 'cancelled'
                    ? 'cancelled'
                    : tStatus === 'completed'
                      ? 'completed'
                      : previewStart
                        ? computeTournamentStatus({
                            match_time: previewStart,
                            end_time: previewEnd || '',
                            status: 'upcoming',
                          })
                        : 'upcoming';

                return (
                  <div className="pt-3 border-t border-white/[0.08] space-y-2.5">
                    <div>
                      <label htmlFor="tour-status-mode" className="block text-xs text-slate-300 mb-1.5">
                        Status Mode
                      </label>
                      <select
                        id="tour-status-mode"
                        value={tStatus}
                        onChange={(e) =>
                          setTStatus(e.target.value as 'auto' | 'completed' | 'cancelled')
                        }
                        className="w-full min-h-[44px] px-3 bg-[#131A29] border border-white/[0.1] rounded-xl text-sm text-white"
                      >
                        <option value="auto">Automatic (Upcoming / Ongoing / Completed by PKT)</option>
                        <option value="completed">Completed (Mark Finished Early)</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>

                    {previewStart && (
                      <div
                        className={`rounded-xl px-3.5 py-2.5 text-xs border ${
                          invalidRange
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                            : 'bg-[#131A29] border-white/[0.08] text-slate-200'
                        }`}
                      >
                        {invalidRange ? (
                          <span>End Date &amp; Time must be after Start Date &amp; Time.</span>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>{formatPktScheduleRange(previewStart, previewEnd || undefined)}</span>
                            <span
                              className={`font-semibold ${
                                previewStatus === 'live'
                                  ? 'text-[#4ADE80]'
                                  : previewStatus === 'completed'
                                    ? 'text-slate-200'
                                    : previewStatus === 'cancelled'
                                      ? 'text-rose-400'
                                      : 'text-[#FACC15]'
                              }`}
                            >
                              Status: {getTournamentStatusLabel(previewStatus)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Room ID</label>
                <input
                  type="text"
                  value={tRoomId}
                  onChange={(e) => setTRoomId(e.target.value)}
                  placeholder="Optional custom room ID"
                  className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Room Password</label>
                <input
                  type="text"
                  value={tRoomPass}
                  onChange={(e) => setTRoomPass(e.target.value)}
                  placeholder="Optional room password"
                  className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Rules &amp; Format</label>
              <textarea
                rows={3}
                value={tRules}
                onChange={(e) => setTRules(e.target.value)}
                className="w-full p-3 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            <button
              type="submit"
              disabled={savingTournament}
              className="ff-btn-ember w-full min-h-[46px] rounded-xl font-bold text-sm disabled:opacity-60"
            >
              {savingTournament
                ? tourModal === 'new'
                  ? 'Publishing Tournament...'
                  : 'Saving Changes...'
                : tourModal === 'new'
                  ? 'Publish Tournament'
                  : 'Save Tournament'}
            </button>
          </form>
        </div>
      )}

      {/* MANAGE PLAYERS ROSTER MODAL */}
      {rosterModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setRosterModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-white">Manage Players</h3>
                <p className="text-xs text-slate-400">{rosterModal.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setRosterModal(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddPlayerToTournament} className="space-y-3 bg-[#0D1320] border border-white/[0.08] rounded-xl p-4">
              <div className="text-xs font-semibold text-white">Add Player to Bracket</div>
              <input
                type="text"
                required
                value={addPlayerId}
                onChange={(e) => setAddPlayerId(e.target.value)}
                placeholder="Player ID (e.g. PT-123456), username, or email"
                className="w-full min-h-[42px] px-3 bg-[#131A29] border border-white/[0.08] rounded-xl text-sm text-white"
              />
              <input
                type="text"
                value={addPlayerIgn}
                onChange={(e) => setAddPlayerIgn(e.target.value)}
                placeholder="Free Fire IGN (optional)"
                className="w-full min-h-[42px] px-3 bg-[#131A29] border border-white/[0.08] rounded-xl text-sm text-white"
              />
              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chargeFee}
                  onChange={(e) => setChargeFee(e.target.checked)}
                />
                <span>Deduct entry fee ({formatPKR(rosterModal.entry_fee)}) from player wallet</span>
              </label>
              <button
                type="submit"
                className="ff-btn-ember w-full min-h-[42px] rounded-xl text-xs font-bold"
              >
                Add Player
              </button>
            </form>

            <div className="divide-y divide-white/[0.07]">
              {rosterModal.registered_players.length === 0 ? (
                <p className="text-xs text-slate-400 py-3">No players registered yet.</p>
              ) : (
                rosterModal.registered_players.map((p) => (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">
                        #{p.slot_number} {p.username} ({p.in_game_name})
                      </div>
                      <div className="text-xs font-mono text-slate-400">{p.player_id}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePlayerFromTournament(rosterModal.id, p.user_id)}
                      className="min-h-[36px] px-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* DECLARE / EDIT TOP 5 WINNERS MODAL */}
      {winnerModal && (() => {
        const rosterIds = new Set(winnerModal.registered_players.map((p) => p.user_id));
        const otherUsers = users.filter((u) => u.is_blocked === 0 && !rosterIds.has(u.id));
        const hasAnySelectable = winnerModal.registered_players.length > 0 || otherUsers.length > 0;
        const requireAllFive =
          new Set([
            ...winnerModal.registered_players.map((p) => p.user_id),
            ...users.filter((u) => u.is_blocked === 0).map((u) => u.id),
          ]).size >= 5;

        const findPlayerPreview = (userIdStr: string) => {
          if (!userIdStr) return null;
          const uid = Number(userIdStr);
          const reg = winnerModal.registered_players.find((p) => p.user_id === uid);
          if (reg) {
            return {
              username: reg.username,
              playerId: reg.player_id,
              avatarUrl: reg.avatar_url || DEFAULT_WINNER_AVATAR,
              ign: reg.in_game_name,
            };
          }
          const usr = users.find((u) => u.id === uid);
          if (usr) {
            return {
              username: usr.username,
              playerId: usr.player_id,
              avatarUrl: usr.avatar_url || DEFAULT_WINNER_AVATAR,
              ign: '',
            };
          }
          return null;
        };

        const slots = [
          {
            placement: 1 as const,
            rank: '🏆 1st Winner (First Place)',
            userVal: w1User,
            setUser: setW1User,
            prizeVal: w1Prize,
            setPrize: setW1Prize,
            otherSelected: [w2User, w3User, w4User, w5User].filter(Boolean),
            req: true,
            cardBorder: 'border-[#FACC15]/55 bg-[#FACC15]/[0.06]',
            titleColor: 'text-[#FACC15]',
          },
          {
            placement: 2 as const,
            rank: '🥈 2nd Winner (Second Place)',
            userVal: w2User,
            setUser: setW2User,
            prizeVal: w2Prize,
            setPrize: setW2Prize,
            otherSelected: [w1User, w3User, w4User, w5User].filter(Boolean),
            req: requireAllFive,
            cardBorder: 'border-slate-300/45 bg-slate-300/[0.05]',
            titleColor: 'text-slate-100',
          },
          {
            placement: 3 as const,
            rank: '🥉 3rd Winner (Third Place)',
            userVal: w3User,
            setUser: setW3User,
            prizeVal: w3Prize,
            setPrize: setW3Prize,
            otherSelected: [w1User, w2User, w4User, w5User].filter(Boolean),
            req: requireAllFive,
            cardBorder: 'border-amber-500/45 bg-amber-500/[0.05]',
            titleColor: 'text-amber-300',
          },
          {
            placement: 4 as const,
            rank: '🎖️ 4th Winner (Fourth Place)',
            userVal: w4User,
            setUser: setW4User,
            prizeVal: w4Prize,
            setPrize: setW4Prize,
            otherSelected: [w1User, w2User, w3User, w5User].filter(Boolean),
            req: requireAllFive,
            cardBorder: 'border-emerald-400/45 bg-emerald-500/[0.05]',
            titleColor: 'text-[#4ADE80]',
          },
          {
            placement: 5 as const,
            rank: '⭐ 5th Winner (Fifth Place)',
            userVal: w5User,
            setUser: setW5User,
            prizeVal: w5Prize,
            setPrize: setW5Prize,
            otherSelected: [w1User, w2User, w3User, w4User].filter(Boolean),
            req: requireAllFive,
            cardBorder: 'border-sky-400/45 bg-sky-500/[0.05]',
            titleColor: 'text-sky-300',
          },
        ];

        const isEditingExisting = winnerModal.winners.length > 0;

        return (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setWinnerModal(null)}
          >
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleDeclareWinners}
              className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto bg-[#131A29] border border-white/[0.14] rounded-t-3xl sm:rounded-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-[#FACC15]" />
                    <span>
                      {isEditingExisting
                        ? 'Update Top 5 Winners & Payouts'
                        : 'Select Top 5 Winners & Credit Wallets'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">{winnerModal.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setWinnerModal(null)}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!hasAnySelectable ? (
                <p className="text-sm text-[#FDE047]">
                  No registered player accounts exist yet. Add or register players first.
                </p>
              ) : (
                <>
                  <PrizeBreakdownStrip
                    prizePool={winnerModal.prize_pool}
                    prize1st={winnerModal.prize_1st}
                    prize2nd={winnerModal.prize_2nd}
                    prize3rd={winnerModal.prize_3rd}
                    prize4th={winnerModal.prize_4th}
                    prize5th={winnerModal.prize_5th}
                    compact
                    showAllFive
                  />
                  <p className="text-xs text-slate-400">
                    Select 5 different players for 1st through 5th place. Each player can only be picked once, and every winner&apos;s prize money and leaderboard points update automatically.
                  </p>

                  <div className="space-y-3">
                    {slots.map((slot) => {
                      const preview = findPlayerPreview(slot.userVal);
                      const takenSet = new Set(slot.otherSelected);
                      return (
                        <div
                          key={slot.placement}
                          className={`rounded-2xl border p-3.5 space-y-2.5 ${slot.cardBorder}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-xs font-extrabold ${slot.titleColor}`}>
                              {slot.rank}
                            </span>
                            {preview && (
                              <div className="flex items-center gap-2">
                                <img
                                  src={preview.avatarUrl}
                                  alt={preview.username}
                                  referrerPolicy="no-referrer"
                                  className="w-6 h-6 rounded-full object-cover border border-white/25"
                                />
                                <span className="text-[11px] font-semibold text-white">
                                  {preview.username}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400">
                                  ({preview.playerId})
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="grid sm:grid-cols-12 gap-2.5 items-center">
                            <select
                              required={slot.req}
                              value={slot.userVal}
                              onChange={(e) => slot.setUser(e.target.value)}
                              className="sm:col-span-8 min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.1] rounded-xl text-xs text-white focus:outline-none focus:border-[#FACC15]"
                            >
                              <option value="">Select unique player...</option>
                              {winnerModal.registered_players.length > 0 && (
                                <optgroup label={`Tournament Participants (${winnerModal.registered_players.length})`}>
                                  {winnerModal.registered_players.map((p) => {
                                    const alreadyPicked = takenSet.has(String(p.user_id));
                                    return (
                                      <option
                                        key={`reg-${p.user_id}`}
                                        value={p.user_id}
                                        disabled={alreadyPicked}
                                      >
                                        {p.username} ({p.player_id}){alreadyPicked ? ' — Already Selected' : ''}
                                      </option>
                                    );
                                  })}
                                </optgroup>
                              )}
                              {otherUsers.length > 0 && (
                                <optgroup label="Other Registered Players">
                                  {otherUsers.map((u) => {
                                    const alreadyPicked = takenSet.has(String(u.id));
                                    return (
                                      <option
                                        key={`usr-${u.id}`}
                                        value={u.id}
                                        disabled={alreadyPicked}
                                      >
                                        {u.username} ({u.player_id}){alreadyPicked ? ' — Already Selected' : ''}
                                      </option>
                                    );
                                  })}
                                </optgroup>
                              )}
                            </select>
                            <div className="sm:col-span-4 relative">
                              <input
                                type="number"
                                min={0}
                                required={Boolean(slot.userVal) || slot.req}
                                value={slot.prizeVal}
                                onChange={(e) => slot.setPrize(e.target.value)}
                                placeholder="Prize PKR"
                                className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.1] rounded-xl font-mono text-xs text-white focus:outline-none focus:border-[#FACC15]"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="submit"
                    className="ff-btn-ember w-full min-h-[46px] rounded-xl font-bold text-sm"
                  >
                    {isEditingExisting
                      ? 'Save Updated Top 5 Winners'
                      : 'Confirm Top 5 Winners & Credit Wallets'}
                  </button>
                </>
              )}
            </form>
          </div>
        );
      })()}

      {/* VIEW DECLARED TOP 5 WINNERS RESULTS MODAL */}
      {viewWinnersModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setViewWinnersModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-[#131A29] border border-[#FACC15]/45 rounded-t-3xl sm:rounded-2xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  {viewWinnersModal.title}
                </h3>
                <p className="text-xs text-slate-400">
                  Official Top 5 Winners Results &amp; Wallet Payouts
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewWinnersModal(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <WinnersPodium
              winners={viewWinnersModal.winners}
              variant="full"
              title="Official Top 5 Winners Results"
            />
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      {newUserModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setNewUserModal(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateUser}
            className="w-full sm:max-w-md bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">Create User Account</h3>
              <button
                type="button"
                onClick={() => setNewUserModal(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              required
              minLength={3}
              value={nuUsername}
              onChange={(e) => setNuUsername(e.target.value)}
              placeholder="Username"
              className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white"
            />
            <input
              type="email"
              required
              value={nuEmail}
              onChange={(e) => setNuEmail(e.target.value)}
              placeholder="Email address"
              className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white"
            />
            <input
              type="password"
              required
              minLength={6}
              value={nuPassword}
              onChange={(e) => setNuPassword(e.target.value)}
              placeholder="Password (min 6 chars)"
              className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={nuRole}
                onChange={(e) => setNuRole(e.target.value as 'player' | 'admin')}
                className="min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white"
              >
                <option value="player">Player</option>
                <option value="admin">Admin</option>
              </select>
              <input
                type="number"
                min={0}
                value={nuBalance}
                onChange={(e) => setNuBalance(e.target.value)}
                placeholder="Initial PKR"
                className="min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl font-mono text-sm text-white"
              />
            </div>
            <button
              type="submit"
              className="ff-btn-ember w-full min-h-[44px] rounded-xl font-bold text-sm"
            >
              Create Account
            </button>
          </form>
        </div>
      )}

      {/* WALLET ADJUSTMENT MODAL */}
      {adjustUser && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setAdjustUser(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAdjustBalance}
            className="w-full sm:max-w-md bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-white">Adjust Wallet Balance</h3>
                <p className="text-xs text-slate-400">
                  {adjustUser.username} · Current: {formatPKR(adjustUser.wallet_balance)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustUser(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="number"
              required
              value={adjustDelta}
              onChange={(e) => setAdjustDelta(e.target.value)}
              placeholder="Amount (+500 to credit, -500 to debit)"
              className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl font-mono text-sm text-white"
            />
            <input
              type="text"
              required
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder="Reason / audit note"
              className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white"
            />
            <button
              type="submit"
              className="ff-btn-ember w-full min-h-[44px] rounded-xl font-bold text-sm"
            >
              Apply Adjustment
            </button>
          </form>
        </div>
      )}

      {/* AWARD PRIZE MONEY MODAL */}
      {prizeUser && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setPrizeUser(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAwardPrize}
            className="w-full sm:max-w-md bg-[#131A29] border border-[#FACC15]/40 rounded-t-3xl sm:rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#FACC15]" />
                  <span>Award Prize Money</span>
                </h3>
                <p className="text-xs text-slate-400">
                  {prizeUser.username} ({prizeUser.player_id}) · Balance: {formatPKR(prizeUser.wallet_balance)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrizeUser(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">Tournament (Optional)</label>
              <select
                value={prizeTournamentId}
                onChange={(e) => setPrizeTournamentId(e.target.value)}
                className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white"
              >
                <option value="">General Winner Prize</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.mode})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">Winning Prize Amount (PKR)</label>
              <input
                type="number"
                required
                min={1}
                max={1000000}
                value={prizeAmount}
                onChange={(e) => setPrizeAmount(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl font-mono text-sm text-white"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">Prize Note (Optional)</label>
              <input
                type="text"
                maxLength={120}
                value={prizeNote}
                onChange={(e) => setPrizeNote(e.target.value)}
                placeholder="e.g. 1st Place Booyah Squad Winner"
                className="w-full min-h-[42px] px-3 bg-[#0D1320] border border-white/[0.08] rounded-xl text-sm text-white"
              />
            </div>
            <button
              type="submit"
              className="ff-btn-ember w-full min-h-[44px] rounded-xl font-bold text-sm"
            >
              Credit Prize to Wallet
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

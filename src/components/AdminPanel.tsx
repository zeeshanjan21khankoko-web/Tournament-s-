import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Edit3,
  Eye,
  Plus,
  ShieldAlert,
  Trash2,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { BANNER_PRESETS, apiRequest, formatMatchTime, formatPKR, formatShortDate } from '../lib/api';
import type {
  AdminOverview,
  DepositRecord,
  Tournament,
  TransactionRecord,
  UserProfile,
  WithdrawalRecord,
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
    'overview' | 'tournaments' | 'deposits' | 'withdrawals' | 'users' | 'transactions'
  >('overview');

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Screenshot lightbox
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(null);

  // Create / Edit Tournament modal
  const [tourModal, setTourModal] = useState<Tournament | 'new' | null>(null);
  const [tTitle, setTTitle] = useState('');
  const [tGame, setTGame] = useState('PUBG Mobile');
  const [tEntry, setTEntry] = useState('500');
  const [tPrize, setTPrize] = useState('25000');
  const [tSlots, setTSlots] = useState('32');
  const [tTime, setTTime] = useState('');
  const [tStatus, setTStatus] = useState<'upcoming' | 'live' | 'completed' | 'cancelled'>('upcoming');
  const [tBanner, setTBanner] = useState(BANNER_PRESETS[0].url);
  const [tRules, setTRules] = useState('');
  const [tRoomId, setTRoomId] = useState('');
  const [tRoomPass, setTRoomPass] = useState('');

  // Manage Players modal
  const [rosterModal, setRosterModal] = useState<Tournament | null>(null);
  const [addPlayerId, setAddPlayerId] = useState('');
  const [addPlayerIgn, setAddPlayerIgn] = useState('');
  const [chargeFee, setChargeFee] = useState(false);

  // Declare Winners modal
  const [winnerModal, setWinnerModal] = useState<Tournament | null>(null);
  const [w1User, setW1User] = useState('');
  const [w1Prize, setW1Prize] = useState('');
  const [w2User, setW2User] = useState('');
  const [w2Prize, setW2Prize] = useState('');
  const [w3User, setW3User] = useState('');
  const [w3Prize, setW3Prize] = useState('');

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

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ov, us, deps, wds, txs] = await Promise.all([
        apiRequest<{ overview: AdminOverview }>('/api/admin/overview', { token }),
        apiRequest<{ users: AdminUserRow[] }>('/api/admin/users', { token }),
        apiRequest<{ deposits: DepositRecord[] }>('/api/admin/deposits', { token }),
        apiRequest<{ withdrawals: WithdrawalRecord[] }>('/api/admin/withdrawals', { token }),
        apiRequest<{ transactions: TransactionRecord[] }>('/api/admin/transactions', { token }),
      ]);
      setOverview(ov.overview);
      setUsers(us.users);
      setDeposits(deps.deposits);
      setWithdrawals(wds.withdrawals);
      setTransactions(txs.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const openTournamentEditor = (t: Tournament | 'new') => {
    setTourModal(t);
    if (t === 'new') {
      const defaultDate = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 16);
      setTTitle('');
      setTGame('PUBG Mobile');
      setTEntry('500');
      setTPrize('25000');
      setTSlots('32');
      setTTime(defaultDate);
      setTStatus('upcoming');
      setTBanner(BANNER_PRESETS[0].url);
      setTRules('');
      setTRoomId('');
      setTRoomPass('');
    } else {
      setTTitle(t.title);
      setTGame(t.game_name);
      setTEntry(String(t.entry_fee));
      setTPrize(String(t.prize_pool));
      setTSlots(String(t.max_slots));
      setTTime(new Date(t.match_time).toISOString().slice(0, 16));
      setTStatus(t.status);
      setTBanner(t.banner_url || BANNER_PRESETS[0].url);
      setTRules(t.rules || '');
      setTRoomId(t.room_id || '');
      setTRoomPass(t.room_pass || '');
    }
  };

  const handleSaveTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const isoTime = new Date(tTime).toISOString();
      const body = {
        title: tTitle,
        gameName: tGame,
        entryFee: Number(tEntry),
        prizePool: Number(tPrize),
        maxSlots: Number(tSlots),
        matchTime: isoTime,
        status: tStatus,
        bannerUrl: tBanner,
        rules: tRules,
        roomId: tRoomId,
        roomPass: tRoomPass,
      };
      if (tourModal === 'new') {
        await apiRequest('/api/admin/tournaments', { method: 'POST', token, body });
        setNotice('Tournament created.');
      } else if (tourModal) {
        await apiRequest(`/api/admin/tournaments/${tourModal.id}`, { method: 'PATCH', token, body });
        setNotice('Tournament updated.');
      }
      setTourModal(null);
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tournament.');
    }
  };

  const handleDeleteTournament = async (id: number) => {
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/admin/tournaments/${id}`, { method: 'DELETE', token });
      setNotice('Tournament removed and any active entry fees refunded.');
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
      setNotice('Player removed and entry fee refunded if applicable.');
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove player.');
    }
  };

  const handleDeclareWinners = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!winnerModal) return;
    setError('');
    const list: Array<{ userId: number; placement: number; prizeAmount: number }> = [];
    if (w1User) list.push({ userId: Number(w1User), placement: 1, prizeAmount: Number(w1Prize) || 0 });
    if (w2User) list.push({ userId: Number(w2User), placement: 2, prizeAmount: Number(w2Prize) || 0 });
    if (w3User) list.push({ userId: Number(w3User), placement: 3, prizeAmount: Number(w3Prize) || 0 });

    if (list.length === 0) {
      setError('Select at least 1 winner.');
      return;
    }

    try {
      await apiRequest(`/api/admin/tournaments/${winnerModal.id}/winners`, {
        method: 'POST',
        token,
        body: { winners: list },
      });
      setWinnerModal(null);
      setW1User('');
      setW1Prize('');
      setW2User('');
      setW2Prize('');
      setW3User('');
      setW3Prize('');
      setNotice('Winners declared and prize payouts credited to player wallets.');
      await Promise.all([onRefreshPublic(), loadAdminData()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to declare winners.');
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

  const handleReviewWithdrawal = async (id: number, action: 'approve' | 'reject') => {
    setError('');
    setNotice('');
    try {
      await apiRequest(`/api/admin/withdrawals/${id}/review`, {
        method: 'POST',
        token,
        body: { action, adminNote: action === 'approve' ? 'Payout transferred' : 'Rejected by admin' },
      });
      setNotice(`Withdrawal #${id} ${action}d.`);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Admin Operations Console
          </h1>
          <p className="text-sm text-slate-400">
            Manage tournaments, verify Pakistani payment proofs, moderate users, and declare winners.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#11131E] border border-white/[0.08] rounded-xl overflow-x-auto">
          {(
            [
              { id: 'overview', label: 'Reports' },
              { id: 'tournaments', label: 'Tournaments' },
              {
                id: 'deposits',
                label: `Deposits${overview?.pendingDeposits ? ` (${overview.pendingDeposits})` : ''}`,
              },
              {
                id: 'withdrawals',
                label: `Withdrawals${overview?.pendingWithdrawals ? ` (${overview.pendingWithdrawals})` : ''}`,
              },
              { id: 'users', label: 'Users' },
              { id: 'transactions', label: 'Ledger' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === item.id
                  ? 'bg-[#8B5CF6] text-white'
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
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
          {notice}
        </div>
      )}

      {/* OVERVIEW / FINANCIAL REPORTS */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-5">
              <div className="text-xs text-slate-400">Total Users</div>
              <div className="font-mono text-2xl font-bold text-white tabular-nums mt-1">
                {overview?.totalUsers ?? 0}
              </div>
              <div className="text-xs text-rose-400 mt-1">
                {overview?.blockedUsers ?? 0} blocked
              </div>
            </div>
            <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-5">
              <div className="text-xs text-slate-400">Approved Deposits</div>
              <div className="font-mono text-2xl font-bold text-emerald-400 tabular-nums mt-1">
                {formatPKR(overview?.totalDeposited)}
              </div>
              <div className="text-xs text-amber-400 mt-1">
                {overview?.pendingDeposits ?? 0} pending review
              </div>
            </div>
            <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-5">
              <div className="text-xs text-slate-400">Approved Withdrawals</div>
              <div className="font-mono text-2xl font-bold text-white tabular-nums mt-1">
                {formatPKR(overview?.totalWithdrawn)}
              </div>
              <div className="text-xs text-amber-400 mt-1">
                {overview?.pendingWithdrawals ?? 0} pending payout
              </div>
            </div>
            <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-5">
              <div className="text-xs text-slate-400">Prizes Awarded</div>
              <div className="font-mono text-2xl font-bold text-[#8B5CF6] tabular-nums mt-1">
                {formatPKR(overview?.totalPrizesAwarded)}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Fees: {formatPKR(overview?.totalEntryFees)}
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-5 space-y-2">
              <div className="text-sm font-semibold text-white">Platform Wallet Liability</div>
              <div className="font-mono text-2xl font-bold text-[#00D4FF] tabular-nums">
                {formatPKR(overview?.totalUserBalances)}
              </div>
              <p className="text-xs text-slate-400">
                Total combined PKR held across all active user wallets.
              </p>
            </div>
            <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-5 space-y-2">
              <div className="text-sm font-semibold text-white">Tournament Operations</div>
              <div className="font-mono text-2xl font-bold text-white tabular-nums">
                {overview?.activeTournaments ?? 0} Active / {overview?.totalTournaments ?? 0} Total
              </div>
              <p className="text-xs text-slate-400">
                Create brackets, manage players, and disburse prizes directly from the Tournaments tab.
              </p>
            </div>
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
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#00D4FF] hover:bg-[#33DDFF] text-[#07080D] text-sm font-semibold inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create Tournament</span>
            </button>
          </div>

          <div className="grid gap-4">
            {tournaments.map((t) => (
              <div
                key={t.id}
                className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <img
                    src={t.banner_url}
                    alt={t.title}
                    referrerPolicy="no-referrer"
                    className="w-20 h-14 rounded-xl object-cover shrink-0 bg-[#07080D]"
                  />
                  <div className="min-w-0">
                    <div className="text-xs text-slate-400">
                      <span className="uppercase font-semibold text-[#00D4FF]">{t.status}</span>
                      <span className="mx-1.5">·</span>
                      <span>{t.game_name}</span>
                      <span className="mx-1.5">·</span>
                      <span>{formatMatchTime(t.match_time)}</span>
                    </div>
                    <div className="font-display text-base font-bold text-white truncate">
                      {t.title}
                    </div>
                    <div className="text-xs font-mono text-slate-300 mt-0.5 tabular-nums">
                      Entry: {formatPKR(t.entry_fee)} · Prize: {formatPKR(t.prize_pool)} · Slots:{' '}
                      {t.filled_slots}/{t.max_slots}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRosterModal(t)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#07080D] border border-white/[0.12] hover:border-[#00D4FF]/60 text-xs font-medium text-white inline-flex items-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5 text-[#00D4FF]" />
                    <span>Players ({t.filled_slots})</span>
                  </button>
                  {t.winners.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setWinnerModal(t);
                        setW1Prize(String(Math.round(t.prize_pool * 0.6)));
                        setW2Prize(String(Math.round(t.prize_pool * 0.25)));
                        setW3Prize(String(Math.round(t.prize_pool * 0.15)));
                      }}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/50 hover:bg-[#8B5CF6]/30 text-xs font-medium text-white inline-flex items-center gap-1.5"
                    >
                      <Trophy className="w-3.5 h-3.5 text-[#8B5CF6]" />
                      <span>Declare Winners</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openTournamentEditor(t)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#07080D] border border-white/[0.12] hover:border-white/30 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5"
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

      {/* DEPOSITS QUEUE */}
      {tab === 'deposits' && (
        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
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
                  className="bg-[#07080D] border border-white/[0.08] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
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
                    <div className="font-mono text-lg font-bold text-[#00D4FF] tabular-nums">
                      {formatPKR(d.amount)}
                    </div>
                    <div className="text-xs text-slate-300 font-mono">
                      TID: {d.transaction_ref} · Sender: {d.sender_account}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {d.screenshot_data && (
                      <button
                        type="button"
                        onClick={() => setPreviewScreenshot(d.screenshot_data!)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white inline-flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#00D4FF]" />
                        <span>View Receipt</span>
                      </button>
                    )}

                    {d.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleReviewDeposit(d.id, 'approve')}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#07080D] text-xs font-semibold inline-flex items-center gap-1.5"
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
                          d.status === 'approved' ? 'text-emerald-400' : 'text-rose-400'
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
        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-white">
            Withdrawal Payout Queue ({withdrawals.length})
          </h2>
          {withdrawals.length === 0 ? (
            <p className="text-sm text-slate-400">No withdrawal requests found.</p>
          ) : (
            <div className="space-y-3">
              {withdrawals.map((w) => (
                <div
                  key={w.id}
                  className="bg-[#07080D] border border-white/[0.08] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="text-white font-semibold">{w.username}</span>
                      <span className="font-mono">{w.player_id}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{w.method.replace('_', ' ')}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatShortDate(w.created_at)}</span>
                    </div>
                    <div className="font-mono text-lg font-bold text-[#8B5CF6] tabular-nums">
                      {formatPKR(w.amount)}
                    </div>
                    <div className="text-xs text-slate-300">
                      {w.account_title} · <span className="font-mono">{w.account_number}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {w.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleReviewWithdrawal(w.id, 'approve')}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#07080D] text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Paid</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewWithdrawal(w.id, 'reject')}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject &amp; Refund</span>
                        </button>
                      </>
                    ) : (
                      <span
                        className={`text-xs font-semibold capitalize ${
                          w.status === 'approved' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {w.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
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
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#00D4FF] hover:bg-[#33DDFF] text-[#07080D] text-sm font-semibold inline-flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add User</span>
            </button>
          </div>

          <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl divide-y divide-white/[0.06]">
            {users.map((u) => (
              <div
                key={u.id}
                className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={u.avatar_url || '/src/assets/images/avatar_esports_pro_1795298801657.jpg'}
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
                          u.role === 'admin' ? 'text-[#8B5CF6]' : 'text-[#00D4FF]'
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
                      setAdjustUser(u);
                      setAdjustDelta('');
                      setAdjustNote('');
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#07080D] border border-white/[0.12] text-xs font-medium text-white hover:border-[#00D4FF]/60"
                  >
                    Adjust Wallet
                  </button>
                  {u.id !== currentUser.id && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleRole(u)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#07080D] border border-white/[0.12] text-xs font-medium text-slate-200 hover:border-[#8B5CF6]/60"
                      >
                        {u.role === 'admin' ? 'Set Player' : 'Make Admin'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleBlock(u)}
                        className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 ${
                          u.is_blocked === 1
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                            : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
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
        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
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
              <tbody className="divide-y divide-white/[0.06] text-xs">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-3 pr-4 font-mono text-slate-300 whitespace-nowrap">
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
                        tx.direction === 'credit' ? 'text-emerald-400' : 'text-white'
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
            className="max-w-lg w-full bg-[#11131E] border border-white/[0.12] rounded-2xl p-4 space-y-3"
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
              className="w-full max-h-[70vh] object-contain rounded-xl bg-[#07080D]"
            />
          </div>
        </div>
      )}

      {/* CREATE / EDIT TOURNAMENT MODAL */}
      {tourModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setTourModal(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveTournament}
            className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto bg-[#11131E] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                {tourModal === 'new' ? 'Create Tournament' : 'Edit Tournament'}
              </h3>
              <button
                type="button"
                onClick={() => setTourModal(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={tTitle}
                  onChange={(e) => setTTitle(e.target.value)}
                  className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Game Name</label>
                <input
                  type="text"
                  required
                  value={tGame}
                  onChange={(e) => setTGame(e.target.value)}
                  className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl text-sm text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Entry (PKR)</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={tEntry}
                  onChange={(e) => setTEntry(e.target.value)}
                  className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl font-mono text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Prize (PKR)</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={tPrize}
                  onChange={(e) => setTPrize(e.target.value)}
                  className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl font-mono text-sm text-white"
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
                  className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl font-mono text-sm text-white"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Match Time</label>
                <input
                  type="datetime-local"
                  required
                  value={tTime}
                  onChange={(e) => setTTime(e.target.value)}
                  className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Status</label>
                <select
                  value={tStatus}
                  onChange={(e) =>
                    setTStatus(e.target.value as 'upcoming' | 'live' | 'completed' | 'cancelled')
                  }
                  className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl text-sm text-white"
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="live">Live</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Room ID</label>
                <input
                  type="text"
                  value={tRoomId}
                  onChange={(e) => setTRoomId(e.target.value)}
                  placeholder="Optional custom room ID"
                  className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl font-mono text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Room Password</label>
                <input
                  type="text"
                  value={tRoomPass}
                  onChange={(e) => setTRoomPass(e.target.value)}
                  placeholder="Optional room password"
                  className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl font-mono text-sm text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Banner Artwork</label>
              <div className="grid grid-cols-3 gap-2">
                {BANNER_PRESETS.map((b) => (
                  <button
                    key={b.url}
                    type="button"
                    onClick={() => setTBanner(b.url)}
                    className={`rounded-xl overflow-hidden border h-16 ${
                      tBanner === b.url ? 'border-[#00D4FF] ring-2 ring-[#00D4FF]/30' : 'border-white/10 opacity-75'
                    }`}
                  >
                    <img src={b.url} alt={b.label} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Rules &amp; Format</label>
              <textarea
                rows={3}
                value={tRules}
                onChange={(e) => setTRules(e.target.value)}
                className="w-full p-3 bg-[#07080D] border border-white/[0.12] rounded-xl text-sm text-white"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[46px] rounded-xl bg-[#00D4FF] hover:bg-[#33DDFF] text-[#07080D] font-semibold text-sm"
            >
              {tourModal === 'new' ? 'Publish Tournament' : 'Save Tournament'}
            </button>
          </form>
        </div>
      )}

      {/* MANAGE PLAYERS ROSTER MODAL */}
      {rosterModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setRosterModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-[#11131E] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-6 space-y-5"
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

            <form onSubmit={handleAddPlayerToTournament} className="space-y-3 bg-[#07080D] border border-white/[0.08] rounded-xl p-4">
              <div className="text-xs font-semibold text-white">Add Player to Bracket</div>
              <input
                type="text"
                required
                value={addPlayerId}
                onChange={(e) => setAddPlayerId(e.target.value)}
                placeholder="Player ID (e.g. PT-123456), username, or email"
                className="w-full min-h-[42px] px-3 bg-[#11131E] border border-white/[0.12] rounded-xl text-sm text-white"
              />
              <input
                type="text"
                value={addPlayerIgn}
                onChange={(e) => setAddPlayerIgn(e.target.value)}
                placeholder="In-Game Name (optional)"
                className="w-full min-h-[42px] px-3 bg-[#11131E] border border-white/[0.12] rounded-xl text-sm text-white"
              />
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chargeFee}
                  onChange={(e) => setChargeFee(e.target.checked)}
                />
                <span>Deduct entry fee ({formatPKR(rosterModal.entry_fee)}) from player wallet</span>
              </label>
              <button
                type="submit"
                className="w-full min-h-[42px] rounded-xl bg-[#00D4FF] text-[#07080D] text-xs font-semibold"
              >
                Add Player
              </button>
            </form>

            <div className="divide-y divide-white/[0.06]">
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

      {/* DECLARE WINNERS MODAL */}
      {winnerModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setWinnerModal(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleDeclareWinners}
            className="w-full sm:max-w-lg bg-[#11131E] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-white">Declare Winners &amp; Pay</h3>
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

            {winnerModal.registered_players.length === 0 ? (
              <p className="text-sm text-amber-300">
                No players are registered in this tournament yet. Add or register players first.
              </p>
            ) : (
              <>
                {[
                  { rank: '1st Place', userVal: w1User, setUser: setW1User, prizeVal: w1Prize, setPrize: setW1Prize, req: true },
                  { rank: '2nd Place', userVal: w2User, setUser: setW2User, prizeVal: w2Prize, setPrize: setW2Prize, req: false },
                  { rank: '3rd Place', userVal: w3User, setUser: setW3User, prizeVal: w3Prize, setPrize: setW3Prize, req: false },
                ].map((slot) => (
                  <div key={slot.rank} className="grid grid-cols-12 gap-2 items-center">
                    <span className="col-span-3 text-xs font-semibold text-slate-300">{slot.rank}</span>
                    <select
                      required={slot.req}
                      value={slot.userVal}
                      onChange={(e) => slot.setUser(e.target.value)}
                      className="col-span-5 min-h-[42px] px-2.5 bg-[#07080D] border border-white/[0.12] rounded-xl text-xs text-white"
                    >
                      <option value="">Select player</option>
                      {winnerModal.registered_players.map((p) => (
                        <option key={p.user_id} value={p.user_id}>
                          {p.username} ({p.player_id})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={slot.prizeVal}
                      onChange={(e) => slot.setPrize(e.target.value)}
                      placeholder="Prize PKR"
                      className="col-span-4 min-h-[42px] px-2.5 bg-[#07080D] border border-white/[0.12] rounded-xl font-mono text-xs text-white"
                    />
                  </div>
                ))}

                <button
                  type="submit"
                  className="w-full min-h-[46px] rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-semibold text-sm"
                >
                  Confirm Winners &amp; Credit Wallets
                </button>
              </>
            )}
          </form>
        </div>
      )}

      {/* ADD USER MODAL */}
      {newUserModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setNewUserModal(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateUser}
            className="w-full sm:max-w-md bg-[#11131E] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-6 space-y-4"
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
              className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl text-sm text-white"
            />
            <input
              type="email"
              required
              value={nuEmail}
              onChange={(e) => setNuEmail(e.target.value)}
              placeholder="Email address"
              className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl text-sm text-white"
            />
            <input
              type="password"
              required
              minLength={6}
              value={nuPassword}
              onChange={(e) => setNuPassword(e.target.value)}
              placeholder="Password (min 6 chars)"
              className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl text-sm text-white"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={nuRole}
                onChange={(e) => setNuRole(e.target.value as 'player' | 'admin')}
                className="min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl text-sm text-white"
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
                className="min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl font-mono text-sm text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-[#00D4FF] text-[#07080D] font-semibold text-sm"
            >
              Create Account
            </button>
          </form>
        </div>
      )}

      {/* WALLET ADJUSTMENT MODAL */}
      {adjustUser && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setAdjustUser(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAdjustBalance}
            className="w-full sm:max-w-md bg-[#11131E] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-6 space-y-4"
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
              className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl font-mono text-sm text-white"
            />
            <input
              type="text"
              required
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder="Reason / audit note"
              className="w-full min-h-[42px] px-3 bg-[#07080D] border border-white/[0.12] rounded-xl text-sm text-white"
            />
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-[#00D4FF] text-[#07080D] font-semibold text-sm"
            >
              Apply Adjustment
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

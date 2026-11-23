import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  KeyRound,
  Megaphone,
  Pin,
  Search,
  Swords,
  Users,
  X,
} from 'lucide-react';
import {
  TOURNAMENT_MODES,
  formatPKR,
  formatPktCompact,
  formatPktDateTime,
  formatPktScheduleRange,
  formatShortDate,
  getTournamentStatusLabel,
} from '../lib/api';
import { getPreferredArenaFilter, setPreferredArenaFilter } from '../lib/offlineCache';
import { PrizeBreakdownStrip, WinnersPodium } from './WinnersPodium';
import type { AnnouncementRecord, Tournament, TournamentMode, UserProfile } from '../types';

interface TournamentsViewProps {
  tournaments: Tournament[];
  announcements: AnnouncementRecord[];
  user: UserProfile | null;
  selectedTournament: Tournament | null;
  selectedMode: 'all' | TournamentMode;
  onChangeMode: (mode: 'all' | TournamentMode) => void;
  onSelectTournament: (t: Tournament | null) => void;
  onJoinTournament: (tournamentId: number, inGameName: string, inGameId: string) => Promise<void>;
  onOpenAuth: () => void;
}

export const TournamentsView: React.FC<TournamentsViewProps> = ({
  tournaments,
  announcements,
  user,
  selectedTournament,
  selectedMode,
  onChangeMode,
  onSelectTournament,
  onJoinTournament,
  onOpenAuth,
}) => {
  const [filter, setFilter] = useState<'all' | 'live' | 'upcoming' | 'completed'>(() =>
    getPreferredArenaFilter()
  );
  const [query, setQuery] = useState('');
  const [inGameName, setInGameName] = useState('');
  const [inGameId, setInGameId] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');

  const filtered = useMemo(() => {
    return tournaments.filter((t) => {
      const matchesFilter = filter === 'all' ? true : t.status === filter;
      const matchesMode = selectedMode === 'all' ? true : t.mode === selectedMode;
      const q = query.trim().toLowerCase();
      const matchesSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.game_name.toLowerCase().includes(q) ||
        t.mode.toLowerCase().includes(q);
      return matchesFilter && matchesMode && matchesSearch;
    });
  }, [tournaments, filter, selectedMode, query]);

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournament) return;
    setJoinError('');
    setJoinSuccess('');
    setJoining(true);
    try {
      await onJoinTournament(selectedTournament.id, inGameName, inGameId);
      setJoinSuccess('Slot confirmed! Lobby Room ID & Password are now unlocked.');
      setInGameName('');
      setInGameId('');
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Unable to join tournament.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            FREE FIRE TOURNAMENT 09 · Brackets
          </h1>
          <p className="text-sm text-emerald-200/75">
            Filter by Battle Royale, Clash Squad, or Lone Wolf and claim your slot.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-emerald-300/75 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tournament or mode..."
              className="w-full sm:w-60 min-h-[44px] pl-10 pr-3.5 py-2 bg-[#091D12] border border-[#22C55E]/30 rounded-xl text-sm text-white placeholder:text-emerald-200/45 focus:outline-none focus:border-[#FACC15]"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#091D12] border border-[#22C55E]/25 rounded-xl overflow-x-auto">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'live', label: 'Ongoing' },
                { id: 'upcoming', label: 'Upcoming' },
                { id: 'completed', label: 'Completed' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFilter(tab.id);
                  setPreferredArenaFilter(tab.id);
                }}
                className={`min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  filter === tab.id
                    ? 'ff-btn-ember font-bold'
                    : 'text-emerald-100/80 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Free Fire Game Mode Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(['all', ...TOURNAMENT_MODES] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChangeMode(m)}
            className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold border whitespace-nowrap shrink-0 transition-all ${
              selectedMode === m
                ? 'bg-[#15803D]/35 border-[#FACC15] text-[#FDE047] shadow-[0_0_16px_rgba(250,204,21,0.22)]'
                : 'bg-[#091D12] border-[#22C55E]/25 text-emerald-100/80 hover:border-[#FACC15]/60 hover:text-white'
            }`}
          >
            {m === 'all' ? 'All Modes' : m}
          </button>
        ))}
      </div>

      {/* Tournament Grid */}
      {filtered.length === 0 ? (
        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-10 text-center space-y-2">
          <p className="text-base font-medium text-white">No matching tournaments found</p>
          <p className="text-sm text-emerald-200/75">
            Try clearing your search, switching mode, or changing the status filter.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((t) => {
            const slotsLeft = Math.max(0, t.max_slots - t.filled_slots);
            const fillPct = Math.min(100, Math.round((t.filled_slots / t.max_slots) * 100));
            return (
              <motion.article
                key={t.id}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => {
                  setJoinError('');
                  setJoinSuccess('');
                  onSelectTournament(t);
                }}
                className="group cursor-pointer bg-[#091D12] border rounded-2xl overflow-hidden flex flex-col ff-card-glow"
              >
                <div className="relative aspect-video bg-[#05130B] overflow-hidden">
                  <img
                    src={t.banner_url}
                    alt={t.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#091D12] via-black/25 to-transparent" />
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-emerald-200/75">
                      <span
                        className={
                          t.status === 'live'
                            ? 'text-[#4ADE80] font-semibold'
                            : t.status === 'completed'
                              ? 'text-[#FACC15] font-semibold'
                              : t.status === 'cancelled'
                                ? 'text-rose-400 font-semibold'
                                : 'text-[#FDE047] font-semibold'
                        }
                      >
                        {getTournamentStatusLabel(t.status)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-50 font-medium">{t.mode}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {t.end_time
                          ? formatPktScheduleRange(t.match_time, t.end_time)
                          : formatPktCompact(t.match_time)}
                      </span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-white">{t.title}</h3>
                  </div>

                  <div className="space-y-3">
                    <PrizeBreakdownStrip
                      prizePool={t.prize_pool}
                      prize1st={t.prize_1st}
                      prize2nd={t.prize_2nd}
                      prize3rd={t.prize_3rd}
                      compact
                    />

                    {t.winners.length > 0 && (
                      <WinnersPodium winners={t.winners} variant="compact" />
                    )}

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-emerald-200/75">
                        <span>{slotsLeft === 0 ? 'Bracket Full' : `${slotsLeft} slots left`}</span>
                        <span className="font-mono tabular-nums text-emerald-100">
                          {t.filled_slots}/{t.max_slots}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#05130B] overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#16A34A] via-[#22C55E] to-[#FACC15]"
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#22C55E]/20 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] text-emerald-200/75">Prize Pool</div>
                        <div className="font-mono text-sm font-bold text-[#FACC15] tabular-nums">
                          {formatPKR(t.prize_pool)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[11px] text-emerald-200/75">Entry</div>
                        <div className="font-mono text-sm font-semibold text-white tabular-nums">
                          {t.entry_fee === 0 ? 'Free' : formatPKR(t.entry_fee)}
                        </div>
                      </div>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setJoinError('');
                          setJoinSuccess('');
                          onSelectTournament(t);
                        }}
                        className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                          t.is_registered
                            ? 'bg-[#22C55E]/15 border border-[#22C55E]/50 text-[#4ADE80]'
                            : t.status === 'upcoming' || t.status === 'live'
                              ? 'ff-btn-ember'
                              : 'bg-[#15803D]/25 border border-[#22C55E]/35 text-emerald-50 hover:bg-[#15803D]/40'
                        }`}
                      >
                        {t.is_registered
                          ? 'Joined'
                          : t.status === 'upcoming' || t.status === 'live'
                            ? 'Join Tournament'
                            : 'View Results'}
                      </motion.button>
                    </div>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      {/* Official Announcements & Match Results */}
      {announcements.length > 0 && (
        <section className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-[#FACC15]" />
              <span>Announcements &amp; Match Results</span>
            </h2>
            <span className="text-xs text-emerald-200/75">Official Updates</span>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {announcements.slice(0, 4).map((a) => (
              <div
                key={a.id}
                className="bg-[#05130B] border border-[#22C55E]/20 rounded-xl p-4 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className={`font-semibold ${
                      a.category === 'Match Result'
                        ? 'text-[#FACC15]'
                        : a.category === 'Room Alert'
                          ? 'text-[#FDE047]'
                          : 'text-[#4ADE80]'
                    }`}
                  >
                    {a.is_pinned === 1 && <Pin className="w-3 h-3 inline mr-1" />}
                    {a.category}
                  </span>
                  <span className="text-emerald-200/60 font-mono text-[11px]">
                    {formatShortDate(a.created_at)}
                  </span>
                </div>
                <div className="font-display text-sm font-bold text-white">{a.title}</div>
                <p className="text-xs text-emerald-50/85 leading-relaxed">{a.content}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tournament Details & Player Registration Modal / Bottom Sheet */}
      <AnimatePresence>
        {selectedTournament && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => onSelectTournament(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-[#091D12] border border-[#22C55E]/45 rounded-t-3xl sm:rounded-2xl shadow-[0_0_48px_rgba(34,197,94,0.22)]"
            >
              <div className="relative h-44 sm:h-52 bg-[#05130B]">
                <img
                  src={selectedTournament.banner_url}
                  alt={selectedTournament.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#091D12] via-[#091D12]/40 to-transparent" />
                <button
                  type="button"
                  onClick={() => onSelectTournament(null)}
                  aria-label="Close tournament modal"
                  className="absolute top-3 right-3 min-h-[44px] min-w-[44px] rounded-xl bg-black/65 backdrop-blur text-white flex items-center justify-center hover:bg-black/85"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-200/75 mb-1.5">
                    <span
                      className={`font-semibold uppercase tracking-wide ${
                        selectedTournament.status === 'live'
                          ? 'text-[#4ADE80]'
                          : selectedTournament.status === 'completed'
                            ? 'text-[#FACC15]'
                            : selectedTournament.status === 'cancelled'
                              ? 'text-rose-400'
                              : 'text-[#FDE047]'
                      }`}
                    >
                      {getTournamentStatusLabel(selectedTournament.status)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#FACC15] font-medium">{selectedTournament.mode}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedTournament.game_name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#4ADE80]" />
                      {formatPktDateTime(selectedTournament.match_time)}
                    </span>
                  </div>
                  <h2 className="font-display text-2xl font-bold text-white">
                    {selectedTournament.title}
                  </h2>
                  {selectedTournament.rules && (
                    <p className="text-sm text-emerald-50/85 mt-2 leading-relaxed">
                      {selectedTournament.rules}
                    </p>
                  )}
                </div>

                {/* Tournament Schedule (PKT - UTC+5) */}
                <div className="bg-[#05130B] border border-[#22C55E]/25 rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-emerald-100">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-[#FACC15]" />
                      <span>Tournament Schedule</span>
                    </span>
                    <span className="text-emerald-200/70 font-normal">Pakistan Standard Time (PKT · UTC+5)</span>
                  </div>
                  <div className={`grid gap-3 ${selectedTournament.end_time ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                    <div>
                      <div className="text-[11px] text-emerald-200/70">Start Date &amp; Time</div>
                      <div className="text-sm font-medium text-white mt-0.5">
                        {formatPktDateTime(selectedTournament.match_time)}
                      </div>
                    </div>
                    {selectedTournament.end_time && (
                      <div>
                        <div className="text-[11px] text-emerald-200/70">End Date &amp; Time</div>
                        <div className="text-sm font-medium text-white mt-0.5">
                          {formatPktDateTime(selectedTournament.end_time)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Key Stats */}
                <div className="grid grid-cols-3 gap-3 bg-[#05130B] border border-[#22C55E]/25 rounded-xl p-4">
                  <div>
                    <div className="text-xs text-emerald-200/75">Prize Pool</div>
                    <div className="font-mono text-base sm:text-lg font-bold text-[#FACC15] tabular-nums">
                      {formatPKR(selectedTournament.prize_pool)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-emerald-200/75">Entry Fee</div>
                    <div className="font-mono text-base sm:text-lg font-bold text-white tabular-nums">
                      {selectedTournament.entry_fee === 0
                        ? 'Free'
                        : formatPKR(selectedTournament.entry_fee)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-emerald-200/75">Available Slots</div>
                    <div className="font-mono text-base sm:text-lg font-bold text-[#4ADE80] tabular-nums">
                      {Math.max(0, selectedTournament.max_slots - selectedTournament.filled_slots)}{' '}
                      <span className="text-xs font-normal text-emerald-200/70">
                        ({selectedTournament.filled_slots}/{selectedTournament.max_slots})
                      </span>
                    </div>
                  </div>
                </div>

                {/* 1st / 2nd / 3rd Prize Breakdown */}
                <PrizeBreakdownStrip
                  prizePool={selectedTournament.prize_pool}
                  prize1st={selectedTournament.prize_1st}
                  prize2nd={selectedTournament.prize_2nd}
                  prize3rd={selectedTournament.prize_3rd}
                />

                {/* Room Credentials (Unlocked for Registered Players / Admins) */}
                {(selectedTournament.is_registered || user?.role === 'admin') &&
                  (selectedTournament.room_id || selectedTournament.room_pass) && (
                    <div className="bg-[#15803D]/20 border border-[#FACC15]/45 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-sm font-medium text-white">
                        <KeyRound className="w-4 h-4 text-[#FACC15] shrink-0" />
                        <span>Custom Room Credentials Unlocked</span>
                      </div>
                      <div className="flex items-center gap-4 font-mono text-sm">
                        <div>
                          <span className="text-emerald-200/75 mr-1.5">ID:</span>
                          <span className="text-white font-semibold">
                            {selectedTournament.room_id || 'TBA'}
                          </span>
                        </div>
                        <div>
                          <span className="text-emerald-200/75 mr-1.5">Pass:</span>
                          <span className="text-white font-semibold">
                            {selectedTournament.room_pass || 'TBA'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                {/* 3 Winners Podium */}
                {selectedTournament.winners.length > 0 && (
                  <WinnersPodium
                    winners={selectedTournament.winners}
                    variant="full"
                    title="Official Booyah 3 Winners"
                  />
                )}

                {/* Player Registration Form / Status */}
                {selectedTournament.status === 'upcoming' || selectedTournament.status === 'live' ? (
                  selectedTournament.is_registered ? (
                    <div className="p-4 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/40 flex items-center gap-3 text-[#4ADE80] text-sm">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <span>You are registered for this tournament. Good luck on the battleground!</span>
                    </div>
                  ) : selectedTournament.filled_slots >= selectedTournament.max_slots ? (
                    <div className="p-4 rounded-xl bg-[#FACC15]/10 border border-[#FACC15]/35 text-[#FDE047] text-sm">
                      All tournament slots are filled.
                    </div>
                  ) : !user ? (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={onOpenAuth}
                      className="w-full min-h-[48px] px-5 py-3 rounded-xl ff-btn-ember font-bold text-sm flex items-center justify-center gap-2"
                    >
                      <Swords className="w-4 h-4" />
                      <span>Sign In to Join Tournament</span>
                    </motion.button>
                  ) : (
                    <form
                      onSubmit={handleJoinSubmit}
                      className="space-y-3 bg-[#05130B] border border-[#22C55E]/30 rounded-xl p-4"
                    >
                      <div className="flex items-center justify-between text-xs text-emerald-200/75">
                        <span className="font-semibold text-white">Player Registration</span>
                        <span className="font-mono">
                          Wallet: <span className="text-[#FACC15]">{formatPKR(user.wallet_balance)}</span>
                        </span>
                      </div>

                      {joinError && (
                        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                          {joinError}
                        </div>
                      )}
                      {joinSuccess && (
                        <div className="p-3 rounded-lg bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#4ADE80] text-xs">
                          {joinSuccess}
                        </div>
                      )}

                      <div className="grid sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          required
                          minLength={2}
                          maxLength={32}
                          value={inGameName}
                          onChange={(e) => setInGameName(e.target.value)}
                          placeholder="Free Fire In-Game Name (IGN)"
                          className="w-full min-h-[44px] px-3.5 py-2 bg-[#091D12] border border-[#22C55E]/25 rounded-xl text-sm text-white placeholder:text-emerald-200/40 focus:outline-none focus:border-[#FACC15]"
                        />
                        <input
                          type="text"
                          required
                          minLength={2}
                          maxLength={32}
                          value={inGameId}
                          onChange={(e) => setInGameId(e.target.value)}
                          placeholder="Free Fire UID"
                          className="w-full min-h-[44px] px-3.5 py-2 bg-[#091D12] border border-[#22C55E]/25 rounded-xl text-sm text-white placeholder:text-emerald-200/40 focus:outline-none focus:border-[#FACC15]"
                        />
                      </div>

                      <motion.button
                        type="submit"
                        whileTap={{ scale: 0.98 }}
                        disabled={joining || user.wallet_balance < selectedTournament.entry_fee}
                        className="w-full min-h-[48px] px-5 py-2.5 rounded-xl ff-btn-ember font-bold text-sm disabled:opacity-50 transition-all"
                      >
                        {joining
                          ? 'Confirming Slot...'
                          : user.wallet_balance < selectedTournament.entry_fee
                            ? `Insufficient Balance (Need ${formatPKR(selectedTournament.entry_fee)})`
                            : selectedTournament.entry_fee === 0
                              ? 'Confirm Free Entry'
                              : `Pay ${formatPKR(selectedTournament.entry_fee)} & Join Tournament`}
                      </motion.button>
                    </form>
                  )
                ) : null}

                {/* Registered Players Roster */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-sm font-semibold text-white">
                    <span className="inline-flex items-center gap-2">
                      <Users className="w-4 h-4 text-[#4ADE80]" />
                      Registered Players ({selectedTournament.registered_players.length})
                    </span>
                  </div>
                  {selectedTournament.registered_players.length === 0 ? (
                    <p className="text-xs text-emerald-200/75 py-2">
                      No players registered yet. Claim Slot #1 now.
                    </p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y divide-[#22C55E]/15 bg-[#05130B] border border-[#22C55E]/25 rounded-xl px-4">
                      {selectedTournament.registered_players.map((p) => (
                        <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-xs text-[#FACC15] w-7 shrink-0">
                              #{p.slot_number}
                            </span>
                            <img
                              src={p.avatar_url || '/src/assets/images/avatar_esports_pro_1795298801657.jpg'}
                              alt={p.username}
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded-lg object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-white truncate">
                                {p.in_game_name} ({p.username})
                              </div>
                              <div className="text-[11px] font-mono text-emerald-200/70">
                                {p.player_id} · UID: {p.in_game_id}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

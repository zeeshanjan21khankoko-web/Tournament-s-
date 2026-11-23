import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  Gamepad2,
  KeyRound,
  LayoutGrid,
  Search,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  TOURNAMENT_MODES,
  formatPKR,
  formatPktCompact,
  formatPktDateTime,
  formatPktScheduleRange,
  getTournamentStatusLabel,
} from '../lib/api';
import { getPreferredArenaFilter, setPreferredArenaFilter } from '../lib/offlineCache';
import { DEFAULT_WINNER_AVATAR, PrizeBreakdownStrip, WinnersPodium } from './WinnersPodium';
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
  const [gameFilter, setGameFilter] = useState<'all' | 'Free Fire'>('all');
  const [query, setQuery] = useState('');
  const [inGameName, setInGameName] = useState('');
  const [inGameId, setInGameId] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');

  const counters = useMemo(() => {
    return {
      total: tournaments.length,
      upcoming: tournaments.filter((t) => t.status === 'upcoming').length,
      live: tournaments.filter((t) => t.status === 'live').length,
      joined: tournaments.filter((t) => t.is_registered).length,
    };
  }, [tournaments]);

  const filtered = useMemo(() => {
    return tournaments.filter((t) => {
      const matchesFilter = filter === 'all' ? true : t.status === filter;
      const matchesMode = selectedMode === 'all' ? true : t.mode === selectedMode;
      const matchesGame =
        gameFilter === 'all'
          ? true
          : (t.game_name || 'Free Fire').toLowerCase().includes('free fire');
      const q = query.trim().toLowerCase();
      const matchesSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.game_name.toLowerCase().includes(q) ||
        t.mode.toLowerCase().includes(q);
      return matchesFilter && matchesMode && matchesGame && matchesSearch;
    });
  }, [tournaments, filter, selectedMode, gameFilter, query]);

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
    <div className="space-y-5 sm:space-y-6">
      {/* 1. Centered Arena Battles Hero (Matches Screenshot 2) */}
      <div className="pt-2 pb-1 text-center space-y-2.5">
        <div className="w-16 h-11 mx-auto rounded-2xl bg-[#FACC15] text-[#0A0E17] shadow-[0_0_32px_rgba(250,204,21,0.5)] flex items-center justify-center">
          <Gamepad2 className="w-7 h-7" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#FACC15] tracking-tight">
            Arena Battles
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Compete · Win · Earn
          </p>
        </div>
      </div>

      {/* 2. 4-Column Counters (TOTAL / UPCOMING / LIVE / JOINED) (Matches Screenshot 2) */}
      <div className="grid grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl py-3 px-2 sm:p-4 text-center">
          <div className="font-display text-lg sm:text-2xl font-extrabold text-[#FACC15] tabular-nums">
            {counters.total}
          </div>
          <div className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
            TOTAL
          </div>
        </div>
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl py-3 px-2 sm:p-4 text-center">
          <div className="font-display text-lg sm:text-2xl font-extrabold text-[#F59E0B] tabular-nums">
            {counters.upcoming}
          </div>
          <div className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
            UPCOMING
          </div>
        </div>
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl py-3 px-2 sm:p-4 text-center">
          <div className="font-display text-lg sm:text-2xl font-extrabold text-[#22C55E] tabular-nums">
            {counters.live}
          </div>
          <div className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
            LIVE
          </div>
        </div>
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl py-3 px-2 sm:p-4 text-center">
          <div className="font-display text-lg sm:text-2xl font-extrabold text-[#FACC15] tabular-nums">
            {counters.joined}
          </div>
          <div className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
            JOINED
          </div>
        </div>
      </div>

      {/* 3. Game & Status Filter Rows (Matches Screenshot 2) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setGameFilter('all')}
              className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 border transition-all ${
                gameFilter === 'all'
                  ? 'bg-[#131A29] border-[#FACC15] text-[#FACC15] shadow-[0_0_16px_rgba(250,204,21,0.16)]'
                  : 'bg-[#131A29] border-white/[0.08] text-slate-300 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>All Games</span>
            </button>
            <button
              type="button"
              onClick={() => setGameFilter('Free Fire')}
              className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 border transition-all ${
                gameFilter === 'Free Fire'
                  ? 'bg-[#131A29] border-[#FACC15] text-[#FACC15] shadow-[0_0_16px_rgba(250,204,21,0.16)]'
                  : 'bg-[#131A29] border-white/[0.08] text-slate-300 hover:text-white'
              }`}
            >
              Free Fire
            </button>
            {TOURNAMENT_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChangeMode(selectedMode === m ? 'all' : m)}
                className={`hidden sm:inline-flex min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 border transition-all ${
                  selectedMode === m
                    ? 'bg-[#FACC15]/15 border-[#FACC15] text-[#FACC15]'
                    : 'bg-[#131A29] border-white/[0.08] text-slate-400 hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-56 shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search battles..."
              className="w-full min-h-[40px] pl-10 pr-3.5 py-1.5 bg-[#131A29] border border-white/[0.08] rounded-xl text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
            />
          </div>
        </div>

        {/* Status Pills Row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(
            [
              { id: 'all', label: 'All Status', icon: null, dot: '' },
              { id: 'upcoming', label: 'Upcoming', icon: Clock, dot: '' },
              { id: 'live', label: 'Live', icon: null, dot: 'bg-[#22C55E]' },
              { id: 'completed', label: 'Completed', icon: Flag, dot: '' },
            ] as const
          ).map((tab) => {
            const active = filter === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFilter(tab.id);
                  setPreferredArenaFilter(tab.id);
                }}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 border transition-all ${
                  active
                    ? 'bg-[#131A29] border-[#FACC15] text-[#FACC15] shadow-[0_0_14px_rgba(250,204,21,0.16)]'
                    : 'bg-[#131A29] border-white/[0.08] text-slate-300 hover:border-white/[0.2] hover:text-white'
                }`}
              >
                {Icon && (
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      tab.id === 'upcoming' ? 'text-[#F59E0B]' : 'text-slate-400'
                    }`}
                  />
                )}
                {tab.dot && <span className={`w-2 h-2 rounded-full ${tab.dot}`} />}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Mobile Mode Filter Chips */}
        <div className="flex sm:hidden items-center gap-1.5 overflow-x-auto pb-1">
          {(['all', ...TOURNAMENT_MODES] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChangeMode(m)}
              className={`min-h-[32px] px-3 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap shrink-0 ${
                selectedMode === m
                  ? 'bg-[#FACC15]/15 border-[#FACC15] text-[#FACC15]'
                  : 'bg-[#131A29] border-white/[0.08] text-slate-400'
              }`}
            >
              {m === 'all' ? 'All Modes' : m}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Empty State OR Tournament Grid (Matches Screenshot 2) */}
      {filtered.length === 0 ? (
        <div className="bg-[#131A29]/80 border border-dashed border-white/[0.1] rounded-3xl py-16 px-6 text-center space-y-2.5">
          <Trophy className="w-14 h-14 text-[#FACC15]/35 mx-auto" />
          <p className="font-display text-lg font-bold text-white">No Tournaments Found</p>
          <p className="text-xs sm:text-sm text-slate-400">
            Check back later for new tournaments
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
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
                className="group cursor-pointer bg-[#131A29] border border-white/[0.08] rounded-2xl overflow-hidden flex flex-col ff-card-glow"
              >
                <div className="relative aspect-video bg-[#0D1320] overflow-hidden">
                  <img
                    src={t.banner_url}
                    alt={t.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#131A29] via-black/30 to-transparent" />
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase backdrop-blur-md ${
                        t.status === 'live'
                          ? 'bg-emerald-500/25 text-[#4ADE80] border border-emerald-400/40'
                          : t.status === 'completed'
                            ? 'bg-sky-500/25 text-sky-200 border border-sky-400/40'
                            : t.status === 'cancelled'
                              ? 'bg-rose-500/25 text-rose-200 border border-rose-400/40'
                              : 'bg-[#FACC15]/25 text-[#FACC15] border border-[#FACC15]/40'
                      }`}
                    >
                      {getTournamentStatusLabel(t.status)}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-bold text-white border border-white/10">
                      {t.mode}
                    </span>
                  </div>
                </div>

                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="font-display text-base sm:text-lg font-extrabold text-white leading-snug">
                      {t.title}
                    </h3>
                    <div className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
                      <span>
                        {t.end_time
                          ? formatPktScheduleRange(t.match_time, t.end_time)
                          : formatPktCompact(t.match_time)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <PrizeBreakdownStrip
                      prizePool={t.prize_pool}
                      prize1st={t.prize_1st}
                      prize2nd={t.prize_2nd}
                      prize3rd={t.prize_3rd}
                      prize4th={t.prize_4th}
                      prize5th={t.prize_5th}
                      compact
                    />

                    {t.winners.length > 0 && (
                      <WinnersPodium winners={t.winners} variant="compact" />
                    )}

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>{slotsLeft === 0 ? 'Bracket Full' : `${slotsLeft} slots available`}</span>
                        <span className="font-mono tabular-nums text-slate-200">
                          {t.filled_slots}/{t.max_slots}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#0D1320] overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#F59E0B] via-[#FACC15] to-[#FDE047]"
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          Total Prize
                        </div>
                        <div className="font-mono text-sm font-extrabold text-[#FACC15] tabular-nums">
                          {formatPKR(t.prize_pool)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400">
                          Entry Fee
                        </div>
                        <div className="font-mono text-sm font-bold text-white tabular-nums">
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
                        className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                          t.is_registered
                            ? 'bg-[#22C55E]/15 border border-[#22C55E]/45 text-[#4ADE80]'
                            : t.status === 'upcoming' || t.status === 'live'
                              ? 'ff-btn-ember'
                              : 'bg-white/[0.06] border border-white/[0.12] text-slate-200 hover:border-[#FACC15]/50'
                        }`}
                      >
                        {t.is_registered
                          ? 'Joined · Room'
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

      {/* Tournament Details & Registration Modal */}
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
              className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl shadow-2xl"
            >
              <div className="relative h-44 sm:h-52 bg-[#0D1320]">
                <img
                  src={selectedTournament.banner_url}
                  alt={selectedTournament.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#131A29] via-[#131A29]/45 to-transparent" />
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
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-1.5">
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
                      <Clock className="w-3.5 h-3.5 text-[#FACC15]" />
                      {formatPktDateTime(selectedTournament.match_time)}
                    </span>
                  </div>
                  <h2 className="font-display text-2xl font-bold text-white">
                    {selectedTournament.title}
                  </h2>
                  {selectedTournament.rules && (
                    <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                      {selectedTournament.rules}
                    </p>
                  )}
                </div>

                {/* Tournament Schedule (PKT) */}
                <div className="bg-[#0D1320] border border-white/[0.08] rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-200">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-[#FACC15]" />
                      <span>Tournament Schedule</span>
                    </span>
                    <span className="text-slate-400 font-normal">PKT (UTC+5)</span>
                  </div>
                  <div className={`grid gap-3 ${selectedTournament.end_time ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                    <div>
                      <div className="text-[11px] text-slate-400">Start Date &amp; Time</div>
                      <div className="text-sm font-medium text-white mt-0.5">
                        {formatPktDateTime(selectedTournament.match_time)}
                      </div>
                    </div>
                    {selectedTournament.end_time && (
                      <div>
                        <div className="text-[11px] text-slate-400">End Date &amp; Time</div>
                        <div className="text-sm font-medium text-white mt-0.5">
                          {formatPktDateTime(selectedTournament.end_time)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Key Stats */}
                <div className="grid grid-cols-3 gap-3 bg-[#0D1320] border border-white/[0.08] rounded-xl p-4">
                  <div>
                    <div className="text-xs text-slate-400">Prize Pool</div>
                    <div className="font-mono text-base sm:text-lg font-bold text-[#FACC15] tabular-nums">
                      {formatPKR(selectedTournament.prize_pool)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Entry Fee</div>
                    <div className="font-mono text-base sm:text-lg font-bold text-white tabular-nums">
                      {selectedTournament.entry_fee === 0
                        ? 'Free'
                        : formatPKR(selectedTournament.entry_fee)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Available Slots</div>
                    <div className="font-mono text-base sm:text-lg font-bold text-[#4ADE80] tabular-nums">
                      {Math.max(0, selectedTournament.max_slots - selectedTournament.filled_slots)}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        ({selectedTournament.filled_slots}/{selectedTournament.max_slots})
                      </span>
                    </div>
                  </div>
                </div>

                {/* 1st–5th Prize Breakdown */}
                <PrizeBreakdownStrip
                  prizePool={selectedTournament.prize_pool}
                  prize1st={selectedTournament.prize_1st}
                  prize2nd={selectedTournament.prize_2nd}
                  prize3rd={selectedTournament.prize_3rd}
                  prize4th={selectedTournament.prize_4th}
                  prize5th={selectedTournament.prize_5th}
                />

                {/* Room Credentials */}
                {(selectedTournament.is_registered || user?.role === 'admin') &&
                  (selectedTournament.room_id || selectedTournament.room_pass) && (
                    <div className="bg-[#FACC15]/10 border border-[#FACC15]/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-sm font-medium text-white">
                        <KeyRound className="w-4 h-4 text-[#FACC15] shrink-0" />
                        <span>Custom Room Credentials Unlocked</span>
                      </div>
                      <div className="flex items-center gap-4 font-mono text-sm">
                        <div>
                          <span className="text-slate-400 mr-1.5">ID:</span>
                          <span className="text-white font-semibold">
                            {selectedTournament.room_id || 'TBA'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 mr-1.5">Pass:</span>
                          <span className="text-white font-semibold">
                            {selectedTournament.room_pass || 'TBA'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Top 5 Winners Results */}
                {selectedTournament.winners.length > 0 && (
                  <WinnersPodium
                    winners={selectedTournament.winners}
                    variant="full"
                    title="Official Top 5 Winners Results"
                  />
                )}

                {/* Registration Form */}
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
                      className="space-y-3 bg-[#0D1320] border border-white/[0.1] rounded-xl p-4"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-400">
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
                          className="w-full min-h-[44px] px-3.5 py-2 bg-[#131A29] border border-white/[0.1] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
                        />
                        <input
                          type="text"
                          required
                          minLength={2}
                          maxLength={32}
                          value={inGameId}
                          onChange={(e) => setInGameId(e.target.value)}
                          placeholder="Free Fire UID"
                          className="w-full min-h-[44px] px-3.5 py-2 bg-[#131A29] border border-white/[0.1] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
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
                      <Users className="w-4 h-4 text-[#FACC15]" />
                      Registered Players ({selectedTournament.registered_players.length})
                    </span>
                  </div>
                  {selectedTournament.registered_players.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">
                      No players registered yet. Claim Slot #1 now.
                    </p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y divide-white/[0.06] bg-[#0D1320] border border-white/[0.08] rounded-xl px-4">
                      {selectedTournament.registered_players.map((p) => (
                        <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-xs text-[#FACC15] w-7 shrink-0">
                              #{p.slot_number}
                            </span>
                            <img
                              src={p.avatar_url || DEFAULT_WINNER_AVATAR}
                              alt={p.username}
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded-full object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-white truncate">
                                {p.in_game_name} ({p.username})
                              </div>
                              <div className="text-[11px] font-mono text-slate-400">
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

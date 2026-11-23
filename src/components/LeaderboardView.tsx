import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Award,
  Crown,
  Flame,
  Medal,
  Search,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import { TOURNAMENT_MODES, apiRequest, formatPKR } from '../lib/api';
import { DEFAULT_WINNER_AVATAR } from './WinnersPodium';
import type {
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardSummary,
  TournamentMode,
  UserProfile,
} from '../types';

interface LeaderboardViewProps {
  token: string | null;
  user: UserProfile | null;
  refreshSignal: number;
  onNavigateTournaments: () => void;
}

const PERIOD_TABS: Array<{ id: LeaderboardPeriod; label: string; hint: string }> = [
  { id: 'daily', label: 'Daily', hint: 'Today (PKT)' },
  { id: 'weekly', label: 'Weekly', hint: 'Last 7 Days (PKT)' },
  { id: 'monthly', label: 'Monthly', hint: 'Last 30 Days (PKT)' },
  { id: 'all', label: 'All-Time', hint: 'Career Standings' },
];

function getTopThreeStyle(rank: number) {
  if (rank === 1) {
    return {
      emoji: '🥇',
      label: '1st · Gold Champion',
      shortBadge: '🥇 #1',
      cardClass:
        'bg-gradient-to-b from-[#FACC15]/22 via-[#0C2716] to-[#05130B] border-[#FACC15]/85 shadow-[0_0_32px_rgba(250,204,21,0.24)]',
      ringClass: 'border-2 border-[#FACC15] ring-2 ring-[#FACC15]/50',
      badgeClass: 'bg-[#FACC15] text-[#04110A]',
      pointsClass: 'text-[#FACC15]',
      orderClass: 'sm:order-2 sm:-translate-y-3',
      Icon: Crown,
    };
  }
  if (rank === 2) {
    return {
      emoji: '🥈',
      label: '2nd · Silver Contender',
      shortBadge: '🥈 #2',
      cardClass:
        'bg-gradient-to-b from-slate-300/18 via-[#091D12] to-[#05130B] border-slate-300/60 shadow-[0_0_22px_rgba(203,213,225,0.14)]',
      ringClass: 'border-2 border-slate-300 ring-2 ring-slate-300/40',
      badgeClass: 'bg-slate-200 text-slate-950',
      pointsClass: 'text-slate-100',
      orderClass: 'sm:order-1',
      Icon: Medal,
    };
  }
  return {
    emoji: '🥉',
    label: '3rd · Bronze Challenger',
    shortBadge: '🥉 #3',
    cardClass:
      'bg-gradient-to-b from-amber-500/18 via-[#091D12] to-[#05130B] border-amber-500/60 shadow-[0_0_22px_rgba(245,158,11,0.14)]',
    ringClass: 'border-2 border-amber-400 ring-2 ring-amber-400/40',
    badgeClass: 'bg-amber-400 text-[#04110A]',
    pointsClass: 'text-amber-300',
    orderClass: 'sm:order-3',
    Icon: Award,
  };
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  token,
  user,
  refreshSignal,
  onNavigateTournaments,
}) => {
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const [mode, setMode] = useState<'all' | TournamentMode>('all');
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [summary, setSummary] = useState<LeaderboardSummary>({
    totalPlayers: 0,
    totalMatches: 0,
    totalWins: 0,
    totalPrizesDistributed: 0,
    topScore: 0,
  });
  const [viewerEntry, setViewerEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadedFilterKeyRef = useRef<string>('');

  const fetchLeaderboard = useCallback(async () => {
    const filterKey = `${period}:${mode}`;
    const isInitialForFilter = loadedFilterKeyRef.current !== filterKey;
    if (isInitialForFilter) {
      setLoading(true);
    }
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('period', period);
      if (mode !== 'all') params.set('mode', mode);
      const res = await apiRequest<{
        leaderboard: LeaderboardEntry[];
        summary: LeaderboardSummary;
        viewerEntry: LeaderboardEntry | null;
      }>(`/api/leaderboard?${params.toString()}`, { token });
      const nextEntries = res.leaderboard || [];
      setEntries((prev) =>
        JSON.stringify(prev) === JSON.stringify(nextEntries) ? prev : nextEntries
      );
      const nextSummary = res.summary || {
        totalPlayers: 0,
        totalMatches: 0,
        totalWins: 0,
        totalPrizesDistributed: 0,
        topScore: 0,
      };
      setSummary((prev) =>
        JSON.stringify(prev) === JSON.stringify(nextSummary) ? prev : nextSummary
      );
      const nextViewer = res.viewerEntry || null;
      setViewerEntry((prev) =>
        JSON.stringify(prev) === JSON.stringify(nextViewer) ? prev : nextViewer
      );
      loadedFilterKeyRef.current = filterKey;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load leaderboard.');
    } finally {
      setLoading(false);
    }
  }, [period, mode, token]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard, refreshSignal]);

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (item) =>
        item.username.toLowerCase().includes(q) ||
        item.player_id.toLowerCase().includes(q)
    );
  }, [entries, query]);

  const topThree = useMemo(() => {
    if (query.trim()) return [];
    return entries.slice(0, 3);
  }, [entries, query]);

  const activePeriodMeta = PERIOD_TABS.find((p) => p.id === period) || PERIOD_TABS[3];

  return (
    <div className="space-y-6">
      {/* Header & Scoring Guide */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-[#4ADE80] uppercase tracking-wider">
            FREE FIRE TOURNAMENT 09 · Rankings
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Tournament Leaderboard
          </h1>
          <p className="text-sm text-emerald-100/80 max-w-2xl">
            Live player standings updated automatically from tournament results. Points: 1st +100 pts · 2nd +60 pts · 3rd +40 pts · Match +10 pts.
          </p>
        </div>

        {/* Timeframe Filter Tabs (Daily / Weekly / Monthly / All-Time) */}
        <div
          role="tablist"
          aria-label="Leaderboard timeframe"
          className="flex items-center gap-1 p-1 bg-[#091D12] border border-[#22C55E]/30 rounded-xl overflow-x-auto shrink-0"
        >
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={period === tab.id}
              onClick={() => setPeriod(tab.id)}
              className={`min-h-[44px] sm:min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all ${
                period === tab.id
                  ? 'ff-btn-ember'
                  : 'text-emerald-100/80 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode Filter & Search Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {(['all', ...TOURNAMENT_MODES] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold border whitespace-nowrap shrink-0 transition-all ${
                mode === m
                  ? 'bg-[#15803D]/35 border-[#FACC15] text-[#FDE047] shadow-[0_0_16px_rgba(250,204,21,0.2)]'
                  : 'bg-[#091D12] border-[#22C55E]/25 text-emerald-100/80 hover:border-[#FACC15]/60 hover:text-white'
              }`}
            >
              {m === 'all' ? 'All Modes' : m}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="w-4 h-4 text-emerald-300/75 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player or ID..."
            aria-label="Search leaderboard player"
            className="w-full min-h-[44px] pl-10 pr-3.5 py-2 bg-[#091D12] border border-[#22C55E]/30 rounded-xl text-sm text-white placeholder:text-emerald-200/45 focus:outline-none focus:border-[#FACC15]"
          />
        </div>
      </div>

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-emerald-200/75">
            <span>Ranked Players</span>
            <Users className="w-4 h-4 text-[#4ADE80]" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums mt-1">
            {summary.totalPlayers}
          </div>
          <div className="text-[11px] text-emerald-200/65 mt-0.5">{activePeriodMeta.hint}</div>
        </div>

        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-emerald-200/75">
            <span>Top Score</span>
            <Flame className="w-4 h-4 text-[#FACC15]" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-[#FACC15] tabular-nums mt-1">
            {summary.topScore.toLocaleString('en-PK')} pts
          </div>
          <div className="text-[11px] text-emerald-200/65 mt-0.5">
            {entries[0] ? `Leader: ${entries[0].username}` : 'Awaiting matches'}
          </div>
        </div>

        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-emerald-200/75">
            <span>Matches Logged</span>
            <Swords className="w-4 h-4 text-[#4ADE80]" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums mt-1">
            {summary.totalMatches}
          </div>
          <div className="text-[11px] text-emerald-200/65 mt-0.5">
            {summary.totalWins} Booyah wins
          </div>
        </div>

        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-emerald-200/75">
            <span>Prizes Won</span>
            <Trophy className="w-4 h-4 text-[#FACC15]" />
          </div>
          <div className="font-mono text-lg sm:text-xl font-bold text-[#4ADE80] tabular-nums mt-1 truncate">
            {formatPKR(summary.totalPrizesDistributed)}
          </div>
          <div className="text-[11px] text-emerald-200/65 mt-0.5">Verified payouts</div>
        </div>
      </div>

      {/* Signed-in Player Personal Standing */}
      {user && viewerEntry && (
        <div className="bg-[#0C2416] border border-[#FACC15]/45 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#FACC15] text-[#04110A] font-mono font-extrabold text-sm flex items-center justify-center shrink-0 tabular-nums">
              #{viewerEntry.rank}
            </div>
            <img
              src={viewerEntry.avatar_url || DEFAULT_WINNER_AVATAR}
              alt={viewerEntry.username}
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-xl object-cover border border-[#FACC15]/60 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#FACC15]">Your Current Standing</div>
              <div className="font-display text-base font-bold text-white truncate">
                {viewerEntry.username}{' '}
                <span className="font-mono text-xs font-normal text-emerald-200/75">
                  · {viewerEntry.player_id}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 sm:gap-5 text-center sm:text-right border-t sm:border-t-0 border-[#22C55E]/20 pt-3 sm:pt-0">
            <div>
              <div className="text-[11px] text-emerald-200/70">Points</div>
              <div className="font-mono text-sm font-bold text-[#FACC15] tabular-nums">
                {viewerEntry.points}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-emerald-200/70">Matches</div>
              <div className="font-mono text-sm font-bold text-white tabular-nums">
                {viewerEntry.matches}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-emerald-200/70">Wins / Losses</div>
              <div className="font-mono text-sm font-bold text-white tabular-nums">
                <span className="text-[#4ADE80]">{viewerEntry.wins}</span>
                <span className="text-emerald-200/60"> / </span>
                <span className="text-rose-300">{viewerEntry.losses}</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-emerald-200/70">Win %</div>
              <div className="font-mono text-sm font-bold text-[#4ADE80] tabular-nums">
                {viewerEntry.win_rate.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-56 rounded-2xl bg-[#091D12] border border-[#22C55E]/20 animate-pulse"
              />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-[#091D12] border border-[#22C55E]/20 animate-pulse" />
        </div>
      ) : entries.length === 0 ? (
        /* Empty State */
        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-8 sm:p-10 text-center space-y-3">
          <Trophy className="w-10 h-10 text-[#FACC15] mx-auto opacity-90" />
          <h2 className="font-display text-lg font-bold text-white">
            No {activePeriodMeta.label} Rankings Yet
          </h2>
          <p className="text-xs sm:text-sm text-emerald-200/75 max-w-md mx-auto">
            {period === 'all'
              ? 'Join an active Free Fire tournament or wait for match results to be announced to claim #1 on the Leaderboard.'
              : `No matches or tournament results recorded in the ${activePeriodMeta.label.toLowerCase()} PKT window (${activePeriodMeta.hint}).`}
          </p>
          <div className="pt-1 flex flex-wrap items-center justify-center gap-3">
            {period !== 'all' && (
              <button
                type="button"
                onClick={() => setPeriod('all')}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[#FACC15]/50 text-xs font-bold text-[#FACC15] hover:bg-[#FACC15]/10"
              >
                View All-Time Leaderboard
              </button>
            )}
            <button
              type="button"
              onClick={onNavigateTournaments}
              className="ff-btn-ember min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold"
            >
              Browse Tournaments
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* TOP 3 PODIUM (GOLD 🥇 / SILVER 🥈 / BRONZE 🥉) */}
          {topThree.length > 0 && (
            <section aria-label="Top 3 Champions" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <Crown className="w-5 h-5 text-[#FACC15]" />
                  <span>Top 3 Ranked Players</span>
                </h2>
                <span className="text-xs text-emerald-200/75">
                  {activePeriodMeta.label} · {mode === 'all' ? 'All Modes' : mode}
                </span>
              </div>

              <div
                className={`grid gap-4 pt-1 sm:pt-4 ${
                  topThree.length === 1
                    ? 'grid-cols-1 max-w-md'
                    : topThree.length === 2
                      ? 'sm:grid-cols-2'
                      : 'sm:grid-cols-3'
                }`}
              >
                {topThree.map((player) => {
                  const style = getTopThreeStyle(player.rank);
                  const RankIcon = style.Icon;
                  const isMe = user?.id === player.user_id;
                  return (
                    <motion.article
                      key={player.user_id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      whileHover={{ y: -3 }}
                      className={`rounded-2xl border p-5 flex flex-col items-center text-center gap-3.5 transition-all ${
                        style.cardClass
                      } ${topThree.length === 3 ? style.orderClass : ''}`}
                    >
                      <div className="w-full flex items-center justify-between gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-extrabold inline-flex items-center gap-1 ${style.badgeClass}`}
                        >
                          <span aria-hidden="true">{style.emoji}</span>
                          <span>#{player.rank}</span>
                        </span>
                        <span className="text-xs font-semibold text-emerald-100/80 inline-flex items-center gap-1">
                          <RankIcon className={`w-4 h-4 ${style.pointsClass}`} />
                          <span>{player.rank === 1 ? 'Gold' : player.rank === 2 ? 'Silver' : 'Bronze'}</span>
                        </span>
                      </div>

                      <img
                        src={player.avatar_url || DEFAULT_WINNER_AVATAR}
                        alt={player.username}
                        referrerPolicy="no-referrer"
                        className={`w-20 h-20 rounded-2xl object-cover bg-[#05130B] ${style.ringClass}`}
                      />

                      <div className="min-w-0 w-full space-y-0.5">
                        <div className="font-display text-lg font-extrabold text-white truncate">
                          {player.username}
                          {isMe && (
                            <span className="text-xs font-sans font-semibold text-[#4ADE80] ml-1.5">
                              (You)
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-emerald-200/75">
                          {player.player_id} · {formatPKR(player.total_prize_won)} won
                        </div>
                      </div>

                      <div className="w-full py-2.5 border-y border-white/10">
                        <div className="text-[11px] uppercase tracking-wider text-emerald-200/70">
                          Total Points
                        </div>
                        <div
                          className={`font-mono text-2xl font-extrabold tabular-nums mt-0.5 ${style.pointsClass}`}
                        >
                          {player.points.toLocaleString('en-PK')}
                        </div>
                      </div>

                      <div className="w-full grid grid-cols-4 gap-2 text-center">
                        <div>
                          <div className="text-[10px] text-emerald-200/70">Matches</div>
                          <div className="font-mono text-xs sm:text-sm font-bold text-white tabular-nums">
                            {player.matches}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-emerald-200/70">Wins</div>
                          <div className="font-mono text-xs sm:text-sm font-bold text-[#4ADE80] tabular-nums">
                            {player.wins}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-emerald-200/70">Losses</div>
                          <div className="font-mono text-xs sm:text-sm font-bold text-rose-300 tabular-nums">
                            {player.losses}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-emerald-200/70">Win %</div>
                          <div className="font-mono text-xs sm:text-sm font-bold text-[#FACC15] tabular-nums">
                            {player.win_rate.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </section>
          )}

          {/* FULL PLAYER STANDINGS */}
          <section className="bg-[#091D12] border border-[#22C55E]/30 rounded-2xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[#22C55E]/20 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base sm:text-lg font-bold text-white">
                  All Player Rankings ({filteredEntries.length})
                </h2>
                <p className="text-xs text-emerald-200/75">
                  Sorted by Total Points, Wins, Podium Finishes, and Win Rate
                </p>
              </div>
              {query.trim() && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-xs font-semibold text-[#FACC15] hover:text-white"
                >
                  Clear Search
                </button>
              )}
            </div>

            {filteredEntries.length === 0 ? (
              <div className="p-8 text-center text-sm text-emerald-200/75">
                No players match &ldquo;{query.trim()}&rdquo;.
              </div>
            ) : (
              <>
                {/* Desktop & Tablet Data Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#22C55E]/20 text-xs text-emerald-200/75 bg-[#05130B]/70">
                        <th className="py-3 pl-5 pr-3 font-semibold">Rank</th>
                        <th className="py-3 px-3 font-semibold">Player</th>
                        <th className="py-3 px-3 font-semibold text-right">Matches</th>
                        <th className="py-3 px-3 font-semibold text-right">Wins</th>
                        <th className="py-3 px-3 font-semibold text-right">Losses</th>
                        <th className="py-3 px-3 font-semibold text-right">Win %</th>
                        <th className="py-3 pl-3 pr-5 font-semibold text-right">Total Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#22C55E]/15 text-sm">
                      {filteredEntries.map((p) => {
                        const isMe = user?.id === p.user_id;
                        const medal =
                          p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : null;
                        return (
                          <tr
                            key={p.user_id}
                            className={`transition-colors ${
                              isMe
                                ? 'bg-[#15803D]/25'
                                : 'hover:bg-[#0C2416]'
                            }`}
                          >
                            <td className="py-3.5 pl-5 pr-3 font-mono font-bold tabular-nums whitespace-nowrap">
                              {medal ? (
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-extrabold ${
                                    p.rank === 1
                                      ? 'bg-[#FACC15] text-[#04110A]'
                                      : p.rank === 2
                                        ? 'bg-slate-200 text-slate-950'
                                        : 'bg-amber-400 text-[#04110A]'
                                  }`}
                                >
                                  <span aria-hidden="true">{medal}</span>
                                  <span>#{p.rank}</span>
                                </span>
                              ) : (
                                <span className="text-emerald-100/85">#{p.rank}</span>
                              )}
                            </td>

                            <td className="py-3.5 px-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <img
                                  src={p.avatar_url || DEFAULT_WINNER_AVATAR}
                                  alt={p.username}
                                  referrerPolicy="no-referrer"
                                  className={`w-10 h-10 rounded-xl object-cover shrink-0 bg-[#05130B] ${
                                    p.rank === 1
                                      ? 'border-2 border-[#FACC15]'
                                      : p.rank === 2
                                        ? 'border-2 border-slate-300'
                                        : p.rank === 3
                                          ? 'border-2 border-amber-400'
                                          : 'border border-[#22C55E]/30'
                                  }`}
                                />
                                <div className="min-w-0">
                                  <div className="font-display font-bold text-white truncate">
                                    {p.username}
                                    {isMe && (
                                      <span className="ml-1.5 text-xs font-sans font-semibold text-[#4ADE80]">
                                        (You)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs font-mono text-emerald-200/70 truncate">
                                    {p.player_id}
                                    {p.podiums > 0 && (
                                      <span> · {p.podiums} podiums</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3.5 px-3 text-right font-mono font-semibold text-white tabular-nums">
                              {p.matches}
                            </td>
                            <td className="py-3.5 px-3 text-right font-mono font-bold text-[#4ADE80] tabular-nums">
                              {p.wins}
                            </td>
                            <td className="py-3.5 px-3 text-right font-mono font-semibold text-rose-300 tabular-nums">
                              {p.losses}
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              <div className="inline-flex flex-col items-end gap-1 min-w-[74px]">
                                <span className="font-mono text-xs font-bold text-white tabular-nums">
                                  {p.win_rate.toFixed(1)}%
                                </span>
                                <div className="w-16 h-1.5 rounded-full bg-[#05130B] overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-[#22C55E] to-[#FACC15]"
                                    style={{ width: `${Math.min(100, p.win_rate)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 pl-3 pr-5 text-right font-mono text-base font-extrabold text-[#FACC15] tabular-nums">
                              {p.points.toLocaleString('en-PK')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Android Mobile Responsive Cards */}
                <div className="md:hidden divide-y divide-[#22C55E]/15">
                  {filteredEntries.map((p) => {
                    const isMe = user?.id === p.user_id;
                    const medal =
                      p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : null;
                    return (
                      <div
                        key={p.user_id}
                        className={`p-4 space-y-3 ${isMe ? 'bg-[#15803D]/20' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {medal ? (
                              <span
                                className={`w-9 h-9 rounded-xl font-mono text-xs font-extrabold flex items-center justify-center shrink-0 ${
                                  p.rank === 1
                                    ? 'bg-[#FACC15] text-[#04110A]'
                                    : p.rank === 2
                                      ? 'bg-slate-200 text-slate-950'
                                      : 'bg-amber-400 text-[#04110A]'
                                }`}
                              >
                                {medal}
                              </span>
                            ) : (
                              <span className="w-9 h-9 rounded-xl bg-[#05130B] border border-[#22C55E]/25 font-mono text-xs font-bold text-emerald-100 flex items-center justify-center shrink-0 tabular-nums">
                                #{p.rank}
                              </span>
                            )}
                            <img
                              src={p.avatar_url || DEFAULT_WINNER_AVATAR}
                              alt={p.username}
                              referrerPolicy="no-referrer"
                              className={`w-10 h-10 rounded-xl object-cover shrink-0 bg-[#05130B] ${
                                p.rank === 1
                                  ? 'border-2 border-[#FACC15]'
                                  : p.rank === 2
                                    ? 'border-2 border-slate-300'
                                    : p.rank === 3
                                      ? 'border-2 border-amber-400'
                                      : 'border border-[#22C55E]/30'
                              }`}
                            />
                            <div className="min-w-0">
                              <div className="font-display text-sm font-bold text-white truncate">
                                {p.username}
                                {isMe && (
                                  <span className="ml-1 text-[11px] font-sans font-semibold text-[#4ADE80]">
                                    (You)
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-emerald-200/70 truncate">
                                {p.player_id}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="font-mono text-base font-extrabold text-[#FACC15] tabular-nums">
                              {p.points.toLocaleString('en-PK')}
                            </div>
                            <div className="text-[10px] text-emerald-200/70">Points</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-[#22C55E]/15 text-center">
                          <div>
                            <div className="text-[10px] text-emerald-200/70">Matches</div>
                            <div className="font-mono text-xs font-bold text-white tabular-nums">
                              {p.matches}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-emerald-200/70">Wins</div>
                            <div className="font-mono text-xs font-bold text-[#4ADE80] tabular-nums">
                              {p.wins}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-emerald-200/70">Losses</div>
                            <div className="font-mono text-xs font-bold text-rose-300 tabular-nums">
                              {p.losses}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-emerald-200/70">Win %</div>
                            <div className="font-mono text-xs font-bold text-[#FACC15] tabular-nums">
                              {p.win_rate.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
};

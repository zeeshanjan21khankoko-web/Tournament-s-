import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Award, Crosshair, Crown, Medal, Search, Trophy } from 'lucide-react';
import { TOURNAMENT_MODES, apiRequest } from '../lib/api';
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

const PERIOD_TABS: Array<{ id: LeaderboardPeriod; label: string }> = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'all', label: 'All-Time' },
];

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
  const [, setSummary] = useState<LeaderboardSummary>({
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
      if (res.summary) {
        setSummary((prev) =>
          JSON.stringify(prev) === JSON.stringify(res.summary) ? prev : res.summary
        );
      }
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

  const topOne = entries[0] || null;
  const topTwo = entries[1] || null;
  const topThree = entries[2] || null;

  const myPoints = viewerEntry?.points ?? user?.points ?? 0;
  const myWins = viewerEntry?.wins ?? user?.wins ?? 0;
  const myKills = viewerEntry?.kills ?? user?.kills ?? 0;
  const myRank = viewerEntry?.rank ?? (entries.length > 0 ? entries.length + 1 : 0);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 1. SEASON RANKINGS Hero & Visual Top 3 Podium (Matches Screenshot 5) */}
      <section className="ff-season-gradient-card border border-[#FACC15]/20 rounded-3xl p-4 sm:p-6 overflow-hidden shadow-2xl space-y-5">
        <div className="text-center space-y-2">
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.26em] text-[#FACC15]/85">
            SEASON RANKINGS
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#FACC15] inline-flex items-center justify-center gap-2">
            <Trophy className="w-6 h-6" />
            <span>Top Players</span>
          </h1>
          <div>
            <span className="inline-flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 max-w-full px-3 sm:px-4 py-1.5 rounded-full bg-[#0D1320]/85 border border-[#FACC15]/30 text-xs font-semibold text-slate-200">
              <span className="w-2 h-2 rounded-full bg-[#FACC15] shrink-0" />
              <span>Your Rank</span>
              <span className="font-display font-extrabold text-[#FACC15] tabular-nums">
                {myRank > 0 ? `#${myRank}` : '--'}
              </span>
              <span className="text-slate-400">·</span>
              <span className="tabular-nums text-slate-300">{myPoints} pts</span>
              <span className="w-2 h-2 rounded-full bg-[#FACC15] shrink-0" />
            </span>
          </div>
        </div>

        {/* Timeframe & Mode Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <div
            role="tablist"
            aria-label="Leaderboard timeframe"
            className="flex items-center gap-1 p-1 bg-[#0D1320]/80 border border-white/[0.08] rounded-xl overflow-x-auto max-w-full"
          >
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={period === tab.id}
                onClick={() => setPeriod(tab.id)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  period === tab.id
                    ? 'bg-[#FACC15] text-[#0A0E17]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-0.5 sm:pb-0">
            {(['all', ...TOURNAMENT_MODES] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap shrink-0 transition-colors ${
                  mode === m
                    ? 'bg-[#FACC15]/15 border-[#FACC15] text-[#FACC15]'
                    : 'bg-[#0D1320]/70 border-white/[0.08] text-slate-400 hover:text-white'
                }`}
              >
                {m === 'all' ? 'All Modes' : m}
              </button>
            ))}
          </div>
        </div>

        {/* Visual Top 3 Podium (#2 left, #1 center tallest, #3 right) */}
        {!loading && entries.length > 0 && (
          <div className="grid grid-cols-3 items-end gap-2 sm:gap-4 max-w-xl mx-auto pt-3 -mb-4 sm:-mb-6">
            {/* #2 Silver Left */}
            <div className="flex flex-col items-center text-center space-y-2">
              {topTwo ? (
                <>
                  <img
                    src={topTwo.avatar_url || DEFAULT_WINNER_AVATAR}
                    alt={topTwo.username}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-slate-300 bg-[#0D1320]"
                  />
                  <div className="w-full px-1">
                    <div className="font-display text-xs sm:text-sm font-extrabold text-white truncate">
                      {topTwo.username}
                    </div>
                    <div className="text-[11px] text-slate-400 tabular-nums">
                      {topTwo.points} pts
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500 pb-6">#2 Open</div>
              )}
              <div className="w-full h-24 sm:h-28 rounded-t-2xl bg-gradient-to-b from-slate-200 to-slate-400 text-[#0A0E17] font-display text-2xl font-extrabold flex items-center justify-center shadow-inner">
                2
              </div>
            </div>

            {/* #1 Gold Center Tallest */}
            <div className="flex flex-col items-center text-center space-y-2">
              {topOne ? (
                <>
                  <img
                    src={topOne.avatar_url || DEFAULT_WINNER_AVATAR}
                    alt={topOne.username}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-[3px] border-[#FACC15] shadow-[0_0_26px_rgba(250,204,21,0.45)] bg-[#0D1320]"
                  />
                  <div className="w-full px-1">
                    <div className="font-display text-xs sm:text-base font-extrabold text-[#FACC15] truncate">
                      {topOne.username}
                    </div>
                    <div className="text-[11px] text-[#FDE047] font-semibold tabular-nums">
                      {topOne.points} pts
                    </div>
                  </div>
                </>
              ) : null}
              <div className="w-full h-32 sm:h-36 rounded-t-2xl bg-gradient-to-b from-[#FDE047] via-[#FACC15] to-[#D97706] text-[#0A0E17] font-display text-3xl font-extrabold flex items-center justify-center shadow-[0_0_28px_rgba(250,204,21,0.3)]">
                1
              </div>
            </div>

            {/* #3 Bronze Right */}
            <div className="flex flex-col items-center text-center space-y-2">
              {topThree ? (
                <>
                  <img
                    src={topThree.avatar_url || DEFAULT_WINNER_AVATAR}
                    alt={topThree.username}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-amber-500 bg-[#0D1320]"
                  />
                  <div className="w-full px-1">
                    <div className="font-display text-xs sm:text-sm font-extrabold text-white truncate">
                      {topThree.username}
                    </div>
                    <div className="text-[11px] text-slate-400 tabular-nums">
                      {topThree.points} pts
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500 pb-6">#3 Open</div>
              )}
              <div className="w-full h-20 sm:h-24 rounded-t-2xl bg-gradient-to-b from-amber-500 to-amber-700 text-white font-display text-2xl font-extrabold flex items-center justify-center shadow-inner">
                3
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2. 3-Column Personal Quick Stats (MY POINTS / WINS / KILLS) (Matches Screenshot 5) */}
      <section className="grid grid-cols-3 gap-3">
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl py-3.5 px-2 text-center">
          <div className="font-display text-xl sm:text-2xl font-extrabold text-[#FACC15] tabular-nums">
            {myPoints}
          </div>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 mt-0.5">
            MY POINTS
          </div>
        </div>
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl py-3.5 px-2 text-center">
          <div className="font-display text-xl sm:text-2xl font-extrabold text-[#FACC15] tabular-nums">
            {myWins}
          </div>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 mt-0.5">
            WINS
          </div>
        </div>
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl py-3.5 px-2 text-center">
          <div className="font-display text-xl sm:text-2xl font-extrabold text-[#FACC15] tabular-nums">
            {myKills}
          </div>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 mt-0.5">
            KILLS
          </div>
        </div>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* 3. | All Rankings List (Matches Screenshot 5) */}
      <section className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          <h2 className="font-display text-lg font-extrabold text-white flex items-center gap-2.5">
            <span className="w-1 h-5 rounded-full bg-[#FACC15] inline-block" />
            <span>All Rankings</span>
          </h2>

          <div className="flex items-center gap-3 w-full sm:w-auto sm:ml-auto">
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search player..."
                aria-label="Search leaderboard player"
                className="w-full min-h-[38px] pl-8 pr-3 py-1 bg-[#131A29] border border-white/[0.08] rounded-xl text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
              />
            </div>
            <span className="text-xs text-slate-400 hidden sm:inline whitespace-nowrap">
              Top {Math.min(100, filteredEntries.length)} players
            </span>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-16 rounded-2xl bg-[#131A29] border border-white/[0.06] animate-pulse"
              />
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-8 text-center space-y-3">
            <Trophy className="w-10 h-10 text-[#FACC15]/70 mx-auto" />
            <p className="text-sm font-bold text-white">No players found for this filter</p>
            <button
              type="button"
              onClick={onNavigateTournaments}
              className="ff-btn-ember min-h-[42px] px-5 py-2 rounded-xl text-xs font-extrabold"
            >
              Browse Arena Battles
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredEntries.slice(0, 100).map((p) => {
              const isMe = user?.id === p.user_id;
              const kills = p.kills ?? 0;
              return (
                <div
                  key={p.user_id}
                  className={`min-w-0 overflow-hidden rounded-2xl border px-3 sm:px-4 py-3 flex items-center justify-between gap-2.5 sm:gap-3 transition-colors ${
                    isMe
                      ? 'bg-[#1A2438] border-[#FACC15]/55'
                      : 'bg-[#131A29] border-white/[0.08] hover:border-white/[0.16]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    {/* Rank Square Badge */}
                    {p.rank === 1 ? (
                      <div className="w-10 h-10 rounded-xl bg-[#FACC15] text-[#0A0E17] flex items-center justify-center shrink-0">
                        <Crown className="w-5 h-5" />
                      </div>
                    ) : p.rank === 2 ? (
                      <div className="w-10 h-10 rounded-xl bg-slate-200 text-[#0A0E17] flex items-center justify-center shrink-0">
                        <Medal className="w-5 h-5" />
                      </div>
                    ) : p.rank === 3 ? (
                      <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
                        <Award className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-[#1A2234] border border-white/[0.08] text-slate-400 font-display text-sm font-bold flex items-center justify-center shrink-0 tabular-nums">
                        {p.rank}
                      </div>
                    )}

                    {/* Circular Player Avatar */}
                    <img
                      src={p.avatar_url || DEFAULT_WINNER_AVATAR}
                      alt={p.username}
                      referrerPolicy="no-referrer"
                      className={`w-11 h-11 rounded-full object-cover shrink-0 bg-[#0D1320] ${
                        p.rank === 1
                          ? 'border-2 border-[#FACC15]'
                          : p.rank === 2
                            ? 'border-2 border-slate-300'
                            : p.rank === 3
                              ? 'border-2 border-amber-500'
                              : 'border border-white/[0.12]'
                      }`}
                    />

                    {/* Name & Stats */}
                    <div className="min-w-0">
                      <div className="font-display text-sm sm:text-base font-bold text-white truncate">
                        {p.username}
                        {isMe && (
                          <span className="ml-1.5 text-[11px] font-sans font-bold text-[#FACC15]">
                            (You)
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-0.5 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Trophy className="w-3.5 h-3.5 text-[#FACC15]" />
                          <span>{p.wins}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Crosshair className="w-3.5 h-3.5 text-rose-400" />
                          <span>{kills}</span>
                        </span>
                        <span className="hidden sm:inline text-slate-500">
                          {p.matches}M · {p.win_rate.toFixed(0)}% WR
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Points Column */}
                  <div className="text-right shrink-0">
                    <div className="font-display text-base sm:text-lg font-extrabold text-[#FACC15] tabular-nums">
                      {p.points}
                    </div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      POINTS
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

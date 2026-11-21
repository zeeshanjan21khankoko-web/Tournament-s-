import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  KeyRound,
  Search,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { formatMatchTime, formatPKR } from '../lib/api';
import { getPreferredArenaFilter, setPreferredArenaFilter } from '../lib/offlineCache';
import type { Tournament, UserProfile } from '../types';

interface TournamentsViewProps {
  tournaments: Tournament[];
  user: UserProfile | null;
  selectedTournament: Tournament | null;
  onSelectTournament: (t: Tournament | null) => void;
  onJoinTournament: (tournamentId: number, inGameName: string, inGameId: string) => Promise<void>;
  onOpenAuth: () => void;
}

export const TournamentsView: React.FC<TournamentsViewProps> = ({
  tournaments,
  user,
  selectedTournament,
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
      const q = query.trim().toLowerCase();
      const matchesSearch =
        !q || t.title.toLowerCase().includes(q) || t.game_name.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [tournaments, filter, query]);

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTournament) return;
    setJoinError('');
    setJoinSuccess('');
    setJoining(true);
    try {
      await onJoinTournament(selectedTournament.id, inGameName, inGameId);
      setJoinSuccess('Slot confirmed! Room credentials are now unlocked.');
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Tournament Arena
          </h1>
          <p className="text-sm text-slate-400">
            Select an active bracket, verify slot availability, and lock in your entry.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search game or event..."
              className="w-full sm:w-60 min-h-[44px] pl-10 pr-3.5 py-2 bg-[#11131E] border border-white/[0.1] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00D4FF]"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#11131E] border border-white/[0.08] rounded-xl overflow-x-auto">
            {(['all', 'live', 'upcoming', 'completed'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setFilter(tab);
                  setPreferredArenaFilter(tab);
                }}
                className={`min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition-colors ${
                  filter === tab
                    ? 'bg-[#00D4FF] text-[#07080D]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tournament Grid */}
      {filtered.length === 0 ? (
        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-10 text-center space-y-2">
          <p className="text-base font-medium text-white">No matching tournaments found</p>
          <p className="text-sm text-slate-400">Try clearing your search or switching status filters.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((t) => {
            const slotsLeft = Math.max(0, t.max_slots - t.filled_slots);
            const fillPct = Math.min(100, Math.round((t.filled_slots / t.max_slots) * 100));
            return (
              <article
                key={t.id}
                onClick={() => {
                  setJoinError('');
                  setJoinSuccess('');
                  onSelectTournament(t);
                }}
                className="cursor-pointer bg-[#11131E] border border-white/[0.08] hover:border-[#00D4FF]/50 rounded-2xl overflow-hidden flex flex-col transition-colors"
              >
                <div className="relative aspect-video bg-[#07080D]">
                  <img
                    src={t.banner_url}
                    alt={t.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#11131E] via-black/20 to-transparent" />
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span
                        className={
                          t.status === 'live'
                            ? 'text-[#00D4FF] font-semibold'
                            : t.status === 'completed'
                              ? 'text-[#8B5CF6] font-semibold'
                              : 'text-slate-300'
                        }
                      >
                        {t.status === 'live'
                          ? 'Live Now'
                          : t.status === 'completed'
                            ? 'Completed'
                            : 'Upcoming'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{t.game_name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatMatchTime(t.match_time)}</span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-white">{t.title}</h3>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>{slotsLeft === 0 ? 'Full' : `${slotsLeft} open slots`}</span>
                        <span className="font-mono tabular-nums text-slate-300">
                          {t.filled_slots}/{t.max_slots}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#07080D] overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#00D4FF] to-[#8B5CF6]"
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] text-slate-400">Prize Pool</div>
                        <div className="font-mono text-sm font-bold text-[#8B5CF6] tabular-nums">
                          {formatPKR(t.prize_pool)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-slate-400">Entry</div>
                        <div className="font-mono text-sm font-semibold text-white tabular-nums">
                          {t.entry_fee === 0 ? 'Free' : formatPKR(t.entry_fee)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Tournament Details & Registration Modal / Bottom Sheet */}
      {selectedTournament && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => onSelectTournament(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-[#11131E] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl shadow-2xl"
          >
            <div className="relative h-44 sm:h-52 bg-[#07080D]">
              <img
                src={selectedTournament.banner_url}
                alt={selectedTournament.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#11131E] via-[#11131E]/40 to-transparent" />
              <button
                type="button"
                onClick={() => onSelectTournament(null)}
                aria-label="Close tournament modal"
                className="absolute top-3 right-3 min-h-[44px] min-w-[44px] rounded-xl bg-black/60 backdrop-blur text-white flex items-center justify-center hover:bg-black/80"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-6">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-1.5">
                  <span className="text-[#00D4FF] font-semibold uppercase tracking-wide">
                    {selectedTournament.status}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedTournament.game_name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {formatMatchTime(selectedTournament.match_time)}
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

              {/* Key Stats */}
              <div className="grid grid-cols-3 gap-3 bg-[#07080D] border border-white/[0.08] rounded-xl p-4">
                <div>
                  <div className="text-xs text-slate-400">Prize Pool</div>
                  <div className="font-mono text-base sm:text-lg font-bold text-[#8B5CF6] tabular-nums">
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
                  <div className="text-xs text-slate-400">Slots Filled</div>
                  <div className="font-mono text-base sm:text-lg font-bold text-[#00D4FF] tabular-nums">
                    {selectedTournament.filled_slots}/{selectedTournament.max_slots}
                  </div>
                </div>
              </div>

              {/* Room Credentials (Unlocked for Registered Players / Admins) */}
              {(selectedTournament.is_registered || user?.role === 'admin') &&
                (selectedTournament.room_id || selectedTournament.room_pass) && (
                  <div className="bg-[#00D4FF]/10 border border-[#00D4FF]/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-sm font-medium text-white">
                      <KeyRound className="w-4 h-4 text-[#00D4FF] shrink-0" />
                      <span>Lobby Room Credentials Unlocked</span>
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

              {/* Winners Podium */}
              {selectedTournament.winners.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Trophy className="w-4 h-4 text-[#8B5CF6]" />
                    <span>Official Winners</span>
                  </div>
                  <div className="divide-y divide-white/[0.06] bg-[#07080D] border border-white/[0.08] rounded-xl px-4">
                    {selectedTournament.winners.map((w) => (
                      <div key={w.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-bold text-[#8B5CF6] w-6">
                            #{w.placement}
                          </span>
                          <img
                            src={w.avatar_url || '/src/assets/images/avatar_esports_pro_1795298801657.jpg'}
                            alt={w.username}
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 rounded-lg object-cover"
                          />
                          <div>
                            <div className="text-sm font-semibold text-white">{w.username}</div>
                            <div className="text-xs font-mono text-slate-400">{w.player_id}</div>
                          </div>
                        </div>
                        <div className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                          {formatPKR(w.prize_amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Join Form / Status */}
              {selectedTournament.status === 'upcoming' || selectedTournament.status === 'live' ? (
                selectedTournament.is_registered ? (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-300 text-sm">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>You are registered for this tournament. Good luck in the arena!</span>
                  </div>
                ) : selectedTournament.filled_slots >= selectedTournament.max_slots ? (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
                    All tournament slots are filled.
                  </div>
                ) : !user ? (
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#00D4FF] hover:bg-[#33DDFF] text-[#07080D] font-semibold text-sm flex items-center justify-center gap-2"
                  >
                    <Swords className="w-4 h-4" />
                    <span>Sign In to Join Tournament</span>
                  </button>
                ) : (
                  <form onSubmit={handleJoinSubmit} className="space-y-3 bg-[#07080D] border border-white/[0.08] rounded-xl p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-white">Register Your Slot</span>
                      <span className="font-mono">
                        Available: {formatPKR(user.wallet_balance)}
                      </span>
                    </div>

                    {joinError && (
                      <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                        {joinError}
                      </div>
                    )}
                    {joinSuccess && (
                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
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
                        placeholder="In-Game Name (IGN)"
                        className="w-full min-h-[44px] px-3.5 py-2 bg-[#11131E] border border-white/[0.12] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00D4FF]"
                      />
                      <input
                        type="text"
                        required
                        minLength={2}
                        maxLength={32}
                        value={inGameId}
                        onChange={(e) => setInGameId(e.target.value)}
                        placeholder="In-Game UID / Tag"
                        className="w-full min-h-[44px] px-3.5 py-2 bg-[#11131E] border border-white/[0.12] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00D4FF]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={joining || user.wallet_balance < selectedTournament.entry_fee}
                      className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[#00D4FF] hover:bg-[#33DDFF] text-[#07080D] font-semibold text-sm disabled:opacity-50 transition-colors"
                    >
                      {joining
                        ? 'Confirming Slot...'
                        : user.wallet_balance < selectedTournament.entry_fee
                          ? `Insufficient Balance (Need ${formatPKR(selectedTournament.entry_fee)})`
                          : selectedTournament.entry_fee === 0
                            ? 'Confirm Free Entry'
                            : `Pay ${formatPKR(selectedTournament.entry_fee)} & Join`}
                    </button>
                  </form>
                )
              ) : null}

              {/* Registered Players Roster */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-sm font-semibold text-white">
                  <span className="inline-flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#00D4FF]" />
                    Registered Players ({selectedTournament.registered_players.length})
                  </span>
                </div>
                {selectedTournament.registered_players.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">
                    No players registered yet. Claim Slot #1 now.
                  </p>
                ) : (
                  <div className="max-h-56 overflow-y-auto divide-y divide-white/[0.06] bg-[#07080D] border border-white/[0.08] rounded-xl px-4">
                    {selectedTournament.registered_players.map((p) => (
                      <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-xs text-slate-400 w-7 shrink-0">
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
          </div>
        </div>
      )}
    </div>
  );
};

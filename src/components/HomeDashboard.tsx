import React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Gamepad2,
  Swords,
  Trophy,
  Wallet,
} from 'lucide-react';
import { formatMatchTime, formatPKR, formatShortDate } from '../lib/api';
import { PWAInstallButton } from './PWAInstallBanner';
import type { Tournament, TransactionRecord, UserProfile } from '../types';

interface HomeDashboardProps {
  user: UserProfile | null;
  tournaments: Tournament[];
  transactions: TransactionRecord[];
  onSelectTournament: (tournament: Tournament) => void;
  onNavigate: (tab: 'home' | 'tournaments' | 'wallet' | 'profile' | 'admin') => void;
  onOpenAuth: () => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  user,
  tournaments,
  transactions,
  onSelectTournament,
  onNavigate,
  onOpenAuth,
}) => {
  const liveTournaments = tournaments.filter((t) => t.status === 'live');
  const upcomingTournaments = tournaments.filter((t) => t.status === 'upcoming');
  const featured = liveTournaments[0] || upcomingTournaments[0] || tournaments[0];
  const showcaseList = tournaments.filter((t) => t.status === 'live' || t.status === 'upcoming').slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Hero Focal Anchor */}
      {featured ? (
        <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#11131E]">
          <div className="grid lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#00D4FF]">
                  <span>{featured.status === 'live' ? 'Live Match Lobby' : 'Featured Championship'}</span>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                  <span className="text-slate-300">{featured.game_name}</span>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                  <span className="text-slate-400 font-mono tabular-nums">
                    {featured.filled_slots}/{featured.max_slots} Players
                  </span>
                </div>

                <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-[1.1]">
                  {featured.title}
                </h1>

                <p className="text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
                  {featured.rules ||
                    'Compete in verified mobile esports brackets with instant server-side wallet payouts across Pakistan.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-white/[0.08]">
                <div>
                  <div className="text-xs text-slate-400">Prize Pool</div>
                  <div className="font-mono text-xl sm:text-2xl font-bold text-[#8B5CF6] tabular-nums">
                    {formatPKR(featured.prize_pool)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Entry Fee</div>
                  <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
                    {featured.entry_fee === 0 ? 'Free' : formatPKR(featured.entry_fee)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Schedule</div>
                  <div className="text-sm font-medium text-slate-200 mt-1">
                    {formatMatchTime(featured.match_time)}
                  </div>
                </div>
                <div className="sm:ml-auto flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => onSelectTournament(featured)}
                    className="flex-1 sm:flex-initial min-h-[46px] px-6 py-2.5 rounded-xl bg-[#00D4FF] hover:bg-[#33DDFF] text-[#07080D] font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                  >
                    <Swords className="w-4 h-4" />
                    <span>{featured.is_registered ? 'View Room Details' : 'Enter Tournament'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 relative min-h-[220px] lg:min-h-full bg-[#07080D]">
              <img
                src={featured.banner_url}
                alt={featured.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-[#11131E] via-[#11131E]/25 to-transparent" />
            </div>
          </div>
        </section>
      ) : null}

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Wallet Balance</span>
            <Wallet className="w-4 h-4 text-[#00D4FF]" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
            {user ? formatPKR(user.wallet_balance) : 'PKR 0'}
          </div>
          <button
            type="button"
            onClick={() => (user ? onNavigate('wallet') : onOpenAuth())}
            className="text-left text-xs font-medium text-[#00D4FF] hover:underline min-h-[28px] inline-flex items-center gap-1"
          >
            <span>{user ? 'Deposit or withdraw' : 'Sign in to fund'}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Matches Played</span>
            <Gamepad2 className="w-4 h-4 text-slate-300" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
            {user ? user.matches_played : 0}
          </div>
          <span className="text-xs text-slate-400">
            {user ? `ID: ${user.player_id}` : 'Track tournament entries'}
          </span>
        </div>

        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Championship Wins</span>
            <Trophy className="w-4 h-4 text-[#8B5CF6]" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
            {user ? user.wins : 0}
          </div>
          <span className="text-xs text-slate-400">
            {user && user.matches_played > 0
              ? `${Math.round((user.wins / user.matches_played) * 100)}% win rate`
              : 'Top-place finishes'}
          </span>
        </div>

        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Open Arenas</span>
            <Swords className="w-4 h-4 text-[#00D4FF]" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
            {liveTournaments.length + upcomingTournaments.length}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('tournaments')}
            className="text-left text-xs font-medium text-[#00D4FF] hover:underline min-h-[28px] inline-flex items-center gap-1"
          >
            <span>Browse full schedule</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* Active & Upcoming Tournaments */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Live &amp; Upcoming Tournaments
            </h2>
            <p className="text-sm text-slate-400">
              Instant slot confirmation with verified prize pools
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => onNavigate('tournaments')}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-white/[0.1] hover:border-[#00D4FF]/50 text-xs sm:text-sm font-medium text-slate-200 whitespace-nowrap shrink-0 transition-colors"
            >
              View All ({tournaments.length})
            </button>
          </div>
        </div>

        {showcaseList.length === 0 ? (
          <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-8 text-center text-slate-400 text-sm">
            No live or upcoming tournaments right now. Check back soon or explore completed results.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {showcaseList.map((t) => {
              const slotsLeft = Math.max(0, t.max_slots - t.filled_slots);
              const pct = Math.min(100, Math.round((t.filled_slots / t.max_slots) * 100));
              return (
                <article
                  key={t.id}
                  onClick={() => onSelectTournament(t)}
                  className="group cursor-pointer bg-[#11131E] border border-white/[0.08] hover:border-[#00D4FF]/45 rounded-2xl overflow-hidden flex flex-col transition-colors"
                >
                  <div className="relative aspect-video bg-[#07080D] overflow-hidden">
                    <img
                      src={t.banner_url}
                      alt={t.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#11131E] via-black/25 to-transparent" />
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className={t.status === 'live' ? 'text-[#00D4FF] font-semibold' : 'text-slate-300'}>
                          {t.status === 'live' ? 'Live Now' : 'Upcoming'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{t.game_name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatMatchTime(t.match_time)}</span>
                      </div>
                      <h3 className="font-display text-lg font-bold text-white leading-snug">
                        {t.title}
                      </h3>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">
                            {slotsLeft === 0 ? 'Bracket Full' : `${slotsLeft} slots left`}
                          </span>
                          <span className="font-mono text-slate-300 tabular-nums">
                            {t.filled_slots}/{t.max_slots}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#07080D] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#00D4FF] to-[#8B5CF6]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] text-slate-400">Prize Pool</div>
                          <div className="font-mono text-sm font-bold text-[#8B5CF6] tabular-nums">
                            {formatPKR(t.prize_pool)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTournament(t);
                          }}
                          className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                            t.is_registered
                              ? 'bg-[#8B5CF6]/20 border border-[#8B5CF6]/50 text-white'
                              : 'bg-[#00D4FF] hover:bg-[#33DDFF] text-[#07080D]'
                          }`}
                        >
                          {t.is_registered
                            ? 'Joined'
                            : t.entry_fee === 0
                              ? 'Join Free'
                              : `Join · ${formatPKR(t.entry_fee)}`}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Transactions */}
      <section className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-white">
              Recent Wallet Activity
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              JazzCash, EasyPaisa, Bank Transfer, and match entry records
            </p>
          </div>
          <button
            type="button"
            onClick={() => (user ? onNavigate('wallet') : onOpenAuth())}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-white/[0.1] hover:border-[#00D4FF]/50 text-xs sm:text-sm font-medium text-slate-200 whitespace-nowrap shrink-0"
          >
            {user ? 'Open Wallet' : 'Sign In'}
          </button>
        </div>

        {!user ? (
          <div className="py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-white/[0.06]">
            <p className="text-sm text-slate-400">
              Sign in or register to view your PKR wallet balance, deposit via JazzCash/EasyPaisa, and track payouts.
            </p>
            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#00D4FF] text-[#07080D] text-sm font-semibold whitespace-nowrap shrink-0"
            >
              Sign In / Sign Up
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-6 border-t border-white/[0.06] text-sm text-slate-400">
            No transactions yet. Fund your wallet via JazzCash, EasyPaisa, or Bank Transfer to join paid tournaments.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {transactions.slice(0, 5).map((tx) => (
              <div key={tx.id} className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      tx.direction === 'credit'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-[#8B5CF6]/15 text-[#A78BFA]'
                    }`}
                  >
                    {tx.direction === 'credit' ? (
                      <ArrowDownLeft className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{tx.description}</div>
                    <div className="text-xs text-slate-400 font-mono">
                      {tx.tx_code} · {tx.status} · {formatShortDate(tx.created_at)}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={`font-mono text-sm font-semibold tabular-nums ${
                      tx.direction === 'credit' ? 'text-emerald-400' : 'text-slate-100'
                    }`}
                  >
                    {tx.direction === 'credit' ? '+' : '-'}
                    {formatPKR(tx.amount)}
                  </div>
                  <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                    Bal: {formatPKR(tx.balance_after)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

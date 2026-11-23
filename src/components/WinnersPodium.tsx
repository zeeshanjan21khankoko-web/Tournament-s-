import React from 'react';
import { Award, Crown, Medal, Star, Trophy } from 'lucide-react';
import { formatPKR, splitPrizePoolDefaults } from '../lib/api';
import type { TournamentWinner } from '../types';

export const DEFAULT_WINNER_AVATAR =
  '/src/assets/images/avatar_esports_pro_1795298801657.jpg';

export interface RankTheme {
  placement: 1 | 2 | 3 | 4 | 5;
  emoji: string;
  shortLabel: string;
  titleLabel: string;
  badgeText: string;
  cardClass: string;
  compactClass: string;
  ringClass: string;
  badgeClass: string;
  prizeClass: string;
  iconBgClass: string;
  orderClass: string;
}

export function getRankTheme(placement: number): RankTheme {
  if (placement === 1) {
    return {
      placement: 1,
      emoji: '🏆',
      shortLabel: '1st',
      titleLabel: '1st Winner · Champion',
      badgeText: '1st Place',
      cardClass:
        'bg-gradient-to-b from-[#FACC15]/20 via-[#1B1912] to-[#0D1320] border-[#FACC15]/80 shadow-[0_0_26px_rgba(250,204,21,0.22)]',
      compactClass: 'bg-[#FACC15]/10 border-[#FACC15]/45',
      ringClass: 'ring-2 ring-[#FACC15] border-[#FACC15]',
      badgeClass: 'bg-[#FACC15] text-[#0A0E17]',
      prizeClass: 'text-[#FACC15]',
      iconBgClass: 'bg-[#FACC15]/20 text-[#FACC15] border-[#FACC15]/50',
      orderClass: 'sm:order-2 sm:-translate-y-2',
    };
  }
  if (placement === 2) {
    return {
      placement: 2,
      emoji: '🥈',
      shortLabel: '2nd',
      titleLabel: '2nd Winner · Runner-Up',
      badgeText: '2nd Place',
      cardClass:
        'bg-gradient-to-b from-slate-300/15 via-[#131A29] to-[#0D1320] border-slate-300/55 shadow-[0_0_18px_rgba(203,213,225,0.12)]',
      compactClass: 'bg-slate-300/10 border-slate-300/35',
      ringClass: 'ring-2 ring-slate-300 border-slate-300',
      badgeClass: 'bg-slate-200 text-slate-950',
      prizeClass: 'text-slate-100',
      iconBgClass: 'bg-slate-300/15 text-slate-200 border-slate-300/45',
      orderClass: 'sm:order-1',
    };
  }
  if (placement === 3) {
    return {
      placement: 3,
      emoji: '🥉',
      shortLabel: '3rd',
      titleLabel: '3rd Winner · Top 3',
      badgeText: '3rd Place',
      cardClass:
        'bg-gradient-to-b from-amber-500/15 via-[#131A29] to-[#0D1320] border-amber-500/55 shadow-[0_0_18px_rgba(245,158,11,0.12)]',
      compactClass: 'bg-amber-500/10 border-amber-500/35',
      ringClass: 'ring-2 ring-amber-400 border-amber-400',
      badgeClass: 'bg-amber-400 text-[#0A0E17]',
      prizeClass: 'text-amber-300',
      iconBgClass: 'bg-amber-500/15 text-amber-300 border-amber-500/45',
      orderClass: 'sm:order-3',
    };
  }
  if (placement === 4) {
    return {
      placement: 4,
      emoji: '🎖️',
      shortLabel: '4th',
      titleLabel: '4th Winner · Top 5',
      badgeText: '4th Place',
      cardClass:
        'bg-gradient-to-b from-emerald-500/15 via-[#131A29] to-[#0D1320] border-emerald-400/50 shadow-[0_0_16px_rgba(52,211,153,0.1)]',
      compactClass: 'bg-emerald-500/10 border-emerald-400/35',
      ringClass: 'ring-2 ring-emerald-400 border-emerald-400',
      badgeClass: 'bg-emerald-400 text-[#0A0E17]',
      prizeClass: 'text-[#4ADE80]',
      iconBgClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/45',
      orderClass: '',
    };
  }
  return {
    placement: 5,
    emoji: '⭐',
    shortLabel: '5th',
    titleLabel: '5th Winner · Top 5',
    badgeText: '5th Place',
    cardClass:
      'bg-gradient-to-b from-sky-500/15 via-[#131A29] to-[#0D1320] border-sky-400/50 shadow-[0_0_16px_rgba(56,189,248,0.1)]',
    compactClass: 'bg-sky-500/10 border-sky-400/35',
    ringClass: 'ring-2 ring-sky-400 border-sky-400',
    badgeClass: 'bg-sky-400 text-[#0A0E17]',
    prizeClass: 'text-sky-300',
    iconBgClass: 'bg-sky-500/15 text-sky-300 border-sky-400/45',
    orderClass: '',
  };
}

interface PrizeBreakdownStripProps {
  prizePool: number;
  prize1st?: number;
  prize2nd?: number;
  prize3rd?: number;
  prize4th?: number;
  prize5th?: number;
  compact?: boolean;
  showAllFive?: boolean;
}

export const PrizeBreakdownStrip: React.FC<PrizeBreakdownStripProps> = ({
  prizePool,
  prize1st,
  prize2nd,
  prize3rd,
  prize4th,
  prize5th,
  compact = false,
  showAllFive = false,
}) => {
  const fallback = splitPrizePoolDefaults(prizePool);
  const hasExplicit =
    (prize1st || 0) > 0 ||
    (prize2nd || 0) > 0 ||
    (prize3rd || 0) > 0 ||
    (prize4th || 0) > 0 ||
    (prize5th || 0) > 0;
  const p1 = hasExplicit ? Number(prize1st) || 0 : fallback.prize1st;
  const p2 = hasExplicit ? Number(prize2nd) || 0 : fallback.prize2nd;
  const p3 = hasExplicit ? Number(prize3rd) || 0 : fallback.prize3rd;
  const p4 = hasExplicit ? Number(prize4th) || 0 : fallback.prize4th;
  const p5 = hasExplicit ? Number(prize5th) || 0 : fallback.prize5th;

  const includeTopFive = showAllFive || !hasExplicit || p4 > 0 || p5 > 0;

  const tiers = [
    {
      key: 1,
      emoji: '🏆',
      label: '1st',
      fullLabel: '1st Prize',
      amount: p1,
      boxClass: 'bg-[#FACC15]/10 border-[#FACC15]/35',
      labelClass: 'text-[#FACC15]',
      spanClass: includeTopFive ? 'col-span-2 sm:col-span-1' : '',
    },
    {
      key: 2,
      emoji: '🥈',
      label: '2nd',
      fullLabel: '2nd Prize',
      amount: p2,
      boxClass: 'bg-slate-300/[0.08] border-slate-300/30',
      labelClass: 'text-slate-200',
      spanClass: includeTopFive ? 'col-span-2 sm:col-span-1' : '',
    },
    {
      key: 3,
      emoji: '🥉',
      label: '3rd',
      fullLabel: '3rd Prize',
      amount: p3,
      boxClass: 'bg-amber-500/10 border-amber-500/30',
      labelClass: 'text-amber-300',
      spanClass: includeTopFive ? 'col-span-2 sm:col-span-1' : '',
    },
    ...(includeTopFive
      ? [
          {
            key: 4,
            emoji: '🎖️',
            label: '4th',
            fullLabel: '4th Prize',
            amount: p4,
            boxClass: 'bg-emerald-500/10 border-emerald-400/30',
            labelClass: 'text-[#4ADE80]',
            spanClass: 'col-span-3 sm:col-span-1',
          },
          {
            key: 5,
            emoji: '⭐',
            label: '5th',
            fullLabel: '5th Prize',
            amount: p5,
            boxClass: 'bg-sky-500/10 border-sky-400/30',
            labelClass: 'text-sky-300',
            spanClass: 'col-span-3 sm:col-span-1',
          },
        ]
      : []),
  ];

  return (
    <div
      className={
        includeTopFive ? 'grid grid-cols-6 sm:grid-cols-5 gap-2' : 'grid grid-cols-3 gap-2'
      }
    >
      {tiers.map((tier) => (
        <div
          key={tier.key}
          className={`rounded-xl border ${tier.boxClass} ${tier.spanClass} ${
            compact ? 'px-2 py-1.5' : 'px-3 py-2.5'
          } min-w-0`}
        >
          <div className={`text-[10px] font-bold flex items-center gap-1 truncate ${tier.labelClass}`}>
            <span aria-hidden="true">{tier.emoji}</span>
            <span className="truncate">{compact ? tier.label : tier.fullLabel}</span>
          </div>
          <div
            className={`font-mono font-bold text-white tabular-nums truncate ${
              compact ? 'text-[11px] mt-0.5' : 'text-xs sm:text-sm mt-1'
            }`}
          >
            {formatPKR(tier.amount)}
          </div>
        </div>
      ))}
    </div>
  );
};

interface WinnersPodiumProps {
  winners: TournamentWinner[];
  variant?: 'full' | 'compact';
  title?: string;
}

export const WinnersPodium: React.FC<WinnersPodiumProps> = ({
  winners,
  variant = 'full',
  title = 'Official Top 5 Winners',
}) => {
  if (!winners || winners.length === 0) return null;

  const sorted = [...winners].sort((a, b) => a.placement - b.placement).slice(0, 5);

  if (variant === 'compact') {
    return (
      <div className="space-y-1.5">
        {sorted.map((w) => {
          const theme = getRankTheme(w.placement);
          return (
            <div
              key={w.id}
              className={`rounded-xl border px-2.5 py-2 flex items-center justify-between gap-2.5 ${theme.compactClass}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold shrink-0 ${theme.badgeClass}`}
                >
                  {theme.emoji} {theme.shortLabel}
                </span>
                <img
                  src={w.avatar_url || DEFAULT_WINNER_AVATAR}
                  alt={w.username}
                  referrerPolicy="no-referrer"
                  className={`w-7 h-7 rounded-full object-cover shrink-0 border ${theme.ringClass}`}
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">{w.username}</div>
                  <div className="text-[10px] font-mono text-slate-400 truncate">
                    {w.player_id}
                  </div>
                </div>
              </div>
              <div className={`font-mono text-xs font-extrabold tabular-nums shrink-0 ${theme.prizeClass}`}>
                {formatPKR(w.prize_amount)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const topThree = sorted.filter((w) => w.placement <= 3);
  const runnersTopFive = sorted.filter((w) => w.placement >= 4);

  const renderFullWinnerCard = (w: TournamentWinner, isTopThreeRow: boolean) => {
    const theme = getRankTheme(w.placement);
    const RankIcon =
      w.placement === 1
        ? Crown
        : w.placement === 2
          ? Medal
          : w.placement === 3
            ? Award
            : w.placement === 4
              ? Trophy
              : Star;

    return (
      <div
        key={w.id}
        className={`relative rounded-2xl border p-4 flex flex-col items-center text-center gap-3 transition-all ${
          theme.cardClass
        } ${isTopThreeRow && topThree.length === 3 ? theme.orderClass : ''}`}
      >
        <div className="w-full flex items-center justify-between gap-2">
          <span
            className={`px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold inline-flex items-center gap-1 ${theme.badgeClass}`}
          >
            <span aria-hidden="true">{theme.emoji}</span>
            <span>{theme.badgeText}</span>
          </span>
          <span
            className={`w-7 h-7 rounded-lg border flex items-center justify-center ${theme.iconBgClass}`}
          >
            <RankIcon className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="relative">
          <img
            src={w.avatar_url || DEFAULT_WINNER_AVATAR}
            alt={w.username}
            referrerPolicy="no-referrer"
            className={`w-16 h-16 rounded-full object-cover bg-[#0D1320] border-2 ${theme.ringClass}`}
          />
        </div>

        <div className="min-w-0 w-full space-y-0.5">
          <div className="font-display text-sm sm:text-base font-extrabold text-white truncate">
            {w.username}
          </div>
          <div className="text-[11px] font-mono text-slate-400 truncate">
            {w.player_id}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {theme.titleLabel}
          </div>
        </div>

        <div className="w-full pt-2.5 border-t border-white/10">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            Prize Won
          </div>
          <div className={`font-mono text-base font-extrabold tabular-nums ${theme.prizeClass}`}>
            {formatPKR(w.prize_amount)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Trophy className="w-4 h-4 text-[#FACC15]" />
          <span>{title}</span>
        </div>
        <span className="text-[11px] font-medium text-[#4ADE80]">
          Credited to Winners&apos; Wallets
        </span>
      </div>

      {topThree.length > 0 && (
        <div
          className={`grid gap-3 pt-1 sm:pt-3 ${
            topThree.length === 1
              ? 'grid-cols-1'
              : topThree.length === 2
                ? 'sm:grid-cols-2'
                : 'sm:grid-cols-3'
          }`}
        >
          {topThree.map((w) => renderFullWinnerCard(w, true))}
        </div>
      )}

      {runnersTopFive.length > 0 && (
        <div
          className={`grid gap-3 ${
            runnersTopFive.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          {runnersTopFive.map((w) => renderFullWinnerCard(w, false))}
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Crown,
  ExternalLink,
  Flag,
  Flame,
  Gift,
  HandCoins,
  LayoutGrid,
  Medal,
  Megaphone,
  Play,
  Sparkles,
  Swords,
  Trophy,
  Wallet,
  X,
  Youtube,
} from 'lucide-react';
import {
  KELLY_HERO_ARTWORK,
  formatPKR,
  formatPktCompact,
  formatRs,
  getTournamentStatusLabel,
  getYouTubeEmbedUrl,
  getYouTubeThumbnailUrl,
} from '../lib/api';
import { PrizeBreakdownStrip, WinnersPodium } from './WinnersPodium';
import { DownloadTournamentAppButton, usePWAInstall } from './PWAInstallBanner';
import type {
  AnnouncementRecord,
  LeaderboardEntry,
  Tournament,
  TournamentMode,
  TransactionRecord,
  UserProfile,
  WalletAccount,
  YouTubeVideoRecord,
} from '../types';
import type { WalletSubTab } from './WalletView';

const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb65xZMCXC3OiHIqik2a';

interface HomeDashboardProps {
  user: UserProfile | null;
  wallet: WalletAccount | null;
  tournaments: Tournament[];
  announcements: AnnouncementRecord[];
  transactions: TransactionRecord[];
  videos: YouTubeVideoRecord[];
  topLeaderboard?: LeaderboardEntry[];
  onSelectTournament: (tournament: Tournament) => void;
  onSelectMode: (mode: TournamentMode) => void;
  onNavigate: (
    tab: 'home' | 'tournaments' | 'leaderboard' | 'wallet' | 'profile' | 'admin'
  ) => void;
  onOpenWallet: (subTab?: WalletSubTab) => void;
  onOpenAuth: () => void;
  onOpenLuckyDraw: () => void;
}

type MatchFilter = 'all' | 'upcoming' | 'live' | 'completed';

function formatMatchDateOnly(iso: string): string {
  if (!iso) return 'TBA';
  const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    timeZone: 'Asia/Karachi',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMatchTimeOnly(iso: string): string {
  if (!iso) return 'TBA';
  const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  user,
  wallet,
  tournaments,
  announcements,
  videos,
  onSelectTournament,
  onNavigate,
  onOpenWallet,
  onOpenAuth,
  onOpenLuckyDraw,
}) => {
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [slideIdx, setSlideIdx] = useState(0);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);
  const { isInstalled } = usePWAInstall();

  const upcomingMatches = useMemo(
    () => tournaments.filter((t) => t.status === 'upcoming' || t.status === 'live'),
    [tournaments]
  );

  const myJoinedTournaments = useMemo(
    () => tournaments.filter((t) => t.is_registered),
    [tournaments]
  );

  // Show user's joined matches if they have any; otherwise show arena matches so the user always sees their match feed
  const myMatchesSource = useMemo(
    () => (myJoinedTournaments.length > 0 ? myJoinedTournaments : tournaments),
    [myJoinedTournaments, tournaments]
  );

  const filteredMyMatches = useMemo(() => {
    if (matchFilter === 'all') return myMatchesSource;
    return myMatchesSource.filter((t) => t.status === matchFilter);
  }, [myMatchesSource, matchFilter]);

  const featuredVideo = videos.find((v) => v.is_featured === 1) || videos[0] || null;
  const activeVideo =
    (selectedVideoId !== null ? videos.find((v) => v.id === selectedVideoId) : null) ||
    featuredVideo;

  const slides = useMemo(() => {
    const list: Array<{
      id: string;
      badge: string;
      title: string;
      subtitle: string;
      ctaLabel?: string;
      imageUrl?: string;
      onClick?: () => void;
    }> = [];

    if (announcements.length > 0) {
      announcements.slice(0, 2).forEach((ann) => {
        list.push({
          id: `ann-${ann.id}`,
          badge: ann.category.toUpperCase(),
          title: ann.title,
          subtitle: ann.content,
          onClick: () => onNavigate('tournaments'),
        });
      });
    }

    const featuredTour = upcomingMatches[0] || tournaments[0];
    if (featuredTour) {
      list.push({
        id: `tour-${featuredTour.id}`,
        badge: featuredTour.status === 'live' ? 'LIVE TOURNAMENT' : 'FEATURED MATCH',
        title: featuredTour.title,
        subtitle: `${featuredTour.mode} · Prize Pool ${formatPKR(featuredTour.prize_pool)} · Entry ${
          featuredTour.entry_fee === 0 ? 'Free' : formatPKR(featuredTour.entry_fee)
        }`,
        ctaLabel: featuredTour.is_registered ? 'Open Match Room' : 'Join Match',
        imageUrl: featuredTour.banner_url || KELLY_HERO_ARTWORK,
        onClick: () => onSelectTournament(featuredTour),
      });
    }

    if (activeVideo) {
      list.push({
        id: `vid-${activeVideo.id}`,
        badge: 'YOUTUBE HIGHLIGHT',
        title: activeVideo.title,
        subtitle: 'Watch official Free Fire match highlights and room tutorials.',
        ctaLabel: 'Watch Video',
        imageUrl: getYouTubeThumbnailUrl(activeVideo.video_id),
        onClick: () => setVideoModalOpen(true),
      });
    }

    if (list.length === 0) {
      list.push({
        id: 'default-promo',
        badge: 'FREE FIRE TOURNAMENT 09',
        title: 'Compete in Daily Free Fire Arena Battles',
        subtitle: 'Instant slot confirmation, verified Top 5 PKR prize pools & fast JazzCash / Easypaisa payouts.',
        ctaLabel: 'Explore Matches',
        imageUrl: KELLY_HERO_ARTWORK,
        onClick: () => onNavigate('tournaments'),
      });
    }

    return list;
  }, [announcements, upcomingMatches, tournaments, activeVideo, onNavigate, onSelectTournament]);

  useEffect(() => {
    if (slideIdx >= slides.length) {
      setSlideIdx(0);
    }
  }, [slides.length, slideIdx]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setSlideIdx((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const currentSlide = slides[slideIdx] || slides[0];
  const balanceCoins = user?.wallet_balance ?? 0;
  const totalEarned = wallet?.total_won ?? 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 1. Promotional Banner Slider (Matches Screenshot 1) */}
      <section aria-label="Featured promotions">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#192836] via-[#131C2B] to-[#0D1320] min-h-[152px] sm:min-h-[184px] flex flex-col justify-between p-4 sm:p-6 ff-card-glow">
          {currentSlide.imageUrl && (
            <>
              <img
                src={currentSlide.imageUrl}
                alt={currentSlide.title}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  if (!e.currentTarget.src.endsWith(KELLY_HERO_ARTWORK)) {
                    e.currentTarget.src = KELLY_HERO_ARTWORK;
                  }
                }}
                className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0D1320]/95 via-[#0D1320]/80 to-[#0D1320]/50 pointer-events-none" />
            </>
          )}

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#FACC15]/15 border border-[#FACC15]/35 text-[10px] font-bold uppercase tracking-wider text-[#FACC15]">
                {currentSlide.badge.includes('YOUTUBE') ? (
                  <Youtube className="w-3 h-3" />
                ) : (
                  <Megaphone className="w-3 h-3" />
                )}
                <span>{currentSlide.badge}</span>
              </div>
              <h2 className="font-display text-lg sm:text-2xl font-extrabold text-white leading-snug line-clamp-2">
                {currentSlide.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-2">
                {currentSlide.subtitle}
              </p>
            </div>

            {slides.length > 1 && (
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSlideIdx((prev) => (prev - 1 + slides.length) % slides.length)}
                  aria-label="Previous slide"
                  className="w-8 h-8 rounded-lg bg-[#0D1320]/80 border border-white/[0.1] text-slate-300 hover:text-white flex items-center justify-center"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSlideIdx((prev) => (prev + 1) % slides.length)}
                  aria-label="Next slide"
                  className="w-8 h-8 rounded-lg bg-[#0D1320]/80 border border-white/[0.1] text-slate-300 hover:text-white flex items-center justify-center"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="relative z-10 flex items-center justify-between gap-3 mt-4">
            <div className="flex items-center gap-1.5 mx-auto sm:mx-0">
              {slides.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Slide ${idx + 1}`}
                  onClick={() => setSlideIdx(idx)}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === slideIdx
                      ? 'w-6 bg-[#FACC15]'
                      : 'w-1.5 bg-white/25 hover:bg-white/45'
                  }`}
                />
              ))}
            </div>

            {currentSlide.ctaLabel && currentSlide.onClick && (
              <button
                type="button"
                onClick={currentSlide.onClick}
                className="min-h-[34px] px-3.5 py-1.5 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] text-[#0A0E17] text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0"
              >
                {currentSlide.badge.includes('YOUTUBE') && <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{currentSlide.ctaLabel}</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. Wallet Balance & Total Earnings Cards (Matches Screenshot 1) */}
      <section className="grid grid-cols-2 gap-2.5 sm:gap-4">
        <button
          type="button"
          onClick={() => (user ? onOpenWallet('deposit') : onOpenAuth())}
          className="min-w-0 overflow-hidden text-left bg-[#131A29] border border-white/[0.08] hover:border-[#FACC15]/45 rounded-2xl p-3 sm:p-5 flex items-center gap-2.5 sm:gap-3 transition-all ff-card-glow"
        >
          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-[#FACC15]/15 border border-[#FACC15]/25 flex items-center justify-center text-[#FACC15] shrink-0">
            <Wallet className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] sm:text-xs text-slate-400 font-medium truncate">
              Wallet Balance
            </div>
            <div className="font-display text-sm sm:text-xl font-extrabold text-white tabular-nums mt-0.5 truncate">
              {balanceCoins.toLocaleString('en-PK')}{' '}
              <span className="text-[11px] sm:text-sm font-medium text-slate-400">Coins</span>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => (user ? onOpenWallet('winnings') : onOpenAuth())}
          className="min-w-0 overflow-hidden text-left bg-[#131A29] border border-white/[0.08] hover:border-[#FACC15]/45 rounded-2xl p-3 sm:p-5 flex items-center gap-2.5 sm:gap-3 transition-all ff-card-glow"
        >
          <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-[#FACC15]/15 border border-[#FACC15]/25 flex items-center justify-center text-[#FACC15] shrink-0">
            <HandCoins className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] sm:text-xs text-slate-400 font-medium truncate">
              Total Earnings
            </div>
            <div className="font-display text-xs sm:text-xl font-extrabold text-white tabular-nums mt-0.5 leading-tight truncate">
              Earned: {totalEarned.toLocaleString('en-PK')} Rs
            </div>
          </div>
        </button>
      </section>

      {/* 3. Large Gradient Lucky Draw Button (Matches Screenshot 1) */}
      <section>
        <motion.button
          type="button"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.985 }}
          onClick={() => (user ? onOpenLuckyDraw() : onOpenAuth())}
          className="ff-btn-lucky w-full min-h-[52px] sm:min-h-[56px] rounded-2xl px-6 py-3.5 font-display text-base sm:text-lg font-extrabold flex items-center justify-center gap-2.5 transition-all"
        >
          <Gift className="w-5 h-5" />
          <span>Lucky Draw</span>
        </motion.button>
      </section>

      {/* 3b. Smart Download Tournament App Section (automatically hidden when installed) */}
      {!isInstalled && (
        <section aria-label="Download Tournament App">
          <DownloadTournamentAppButton variant="card" />
        </section>
      )}

      {/* 4. Upcoming Matches Section (Matches Screenshot 1) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#FACC15]" />
            <span>Upcoming Matches</span>
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('tournaments')}
            className="text-xs font-semibold text-slate-400 hover:text-[#FACC15] inline-flex items-center gap-0.5 transition-colors"
          >
            <span>See all</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {upcomingMatches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.1] bg-[#131A29]/60 py-8 px-4 text-center text-xs sm:text-sm text-slate-400">
            No upcoming matches yet. Check back soon.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingMatches.slice(0, 3).map((t) => {
              const slotsLeft = Math.max(0, t.max_slots - t.filled_slots);
              return (
                <motion.article
                  key={t.id}
                  whileHover={{ y: -2 }}
                  onClick={() => onSelectTournament(t)}
                  className="min-w-0 overflow-hidden cursor-pointer bg-[#131A29] border border-white/[0.08] rounded-2xl p-3.5 sm:p-4 space-y-3 ff-card-glow"
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-sm sm:text-base font-extrabold text-white truncate">
                        {t.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="px-2 py-0.5 rounded-full bg-[#FACC15]/15 border border-[#FACC15]/30 text-[10px] font-bold text-[#FACC15] inline-flex items-center gap-1">
                          <Crown className="w-3 h-3" />
                          <span>{t.mode.toUpperCase()}</span>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            t.status === 'live'
                              ? 'bg-emerald-500/15 text-[#4ADE80]'
                              : 'bg-white/[0.06] text-slate-300'
                          }`}
                        >
                          {getTournamentStatusLabel(t.status)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-[11px] shrink-0">
                      <div className="text-slate-400">
                        Time: <span className="text-white font-semibold">{formatMatchTimeOnly(t.match_time)}</span>
                      </div>
                      <div className="text-slate-400">
                        Date: <span className="text-white font-semibold">{formatMatchDateOnly(t.match_time)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">ENTRY</div>
                      <div className="font-mono text-xs sm:text-sm font-extrabold text-white tabular-nums">
                        {t.entry_fee === 0 ? '0 PKR' : formatPKR(t.entry_fee)}
                      </div>
                    </div>
                    <div className="text-center min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">SLOTS</div>
                      <div className="font-mono text-[11px] sm:text-xs font-bold text-slate-200 tabular-nums">
                        {slotsLeft} left ({t.filled_slots}/{t.max_slots})
                      </div>
                    </div>
                    <div className="text-right min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">TOTAL PRIZE</div>
                      <div className="font-mono text-xs sm:text-sm font-extrabold text-[#FACC15] tabular-nums">
                        {t.prize_pool} PKR
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTournament(t);
                    }}
                    className={`w-full min-h-[40px] rounded-xl text-xs font-extrabold transition-all ${
                      t.is_registered
                        ? 'bg-[#22C55E]/15 border border-[#22C55E]/45 text-[#4ADE80]'
                        : 'ff-btn-ember'
                    }`}
                  >
                    {t.is_registered ? 'Joined · Match Room' : 'Join Tournament'}
                  </button>
                </motion.article>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. My Matches Section with All / Upcoming / Live / Completed Filters (Matches Screenshot 1) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base sm:text-lg font-bold text-white">
            {myJoinedTournaments.length > 0 ? 'My Matches' : 'Matches'}
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('tournaments')}
            className="text-xs font-semibold text-slate-400 hover:text-[#FACC15] inline-flex items-center gap-0.5 transition-colors"
          >
            <span>Browse</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(
            [
              { id: 'all', label: 'All', icon: LayoutGrid, dot: '' },
              { id: 'upcoming', label: 'Upcoming', icon: Clock, dot: '' },
              { id: 'live', label: 'Live', icon: null, dot: 'bg-[#22C55E]' },
              { id: 'completed', label: 'Completed', icon: Flag, dot: '' },
            ] as const
          ).map((f) => {
            const active = matchFilter === f.id;
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setMatchFilter(f.id)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all border ${
                  active
                    ? 'bg-[#FACC15] border-[#FACC15] text-[#0A0E17] shadow-[0_4px_16px_rgba(250,204,21,0.3)]'
                    : 'bg-[#131A29] border-white/[0.08] text-slate-300 hover:border-white/[0.2] hover:text-white'
                }`}
              >
                {Icon && (
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      active ? 'text-[#0A0E17]' : f.id === 'upcoming' ? 'text-[#F59E0B]' : 'text-slate-400'
                    }`}
                  />
                )}
                {f.dot && <span className={`w-2 h-2 rounded-full ${active ? 'bg-[#0A0E17]' : f.dot}`} />}
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>

        {/* Match Cards List */}
        {filteredMyMatches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.1] bg-[#131A29]/60 py-8 px-4 text-center space-y-2">
            <p className="text-xs sm:text-sm text-slate-400">
              No {matchFilter === 'all' ? '' : matchFilter} matches found right now.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('tournaments')}
              className="ff-btn-ember min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Swords className="w-3.5 h-3.5" />
              <span>Browse Arena Battles</span>
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMyMatches.slice(0, 6).map((t) => (
              <motion.article
                key={t.id}
                whileHover={{ y: -2 }}
                onClick={() => onSelectTournament(t)}
                className="min-w-0 overflow-hidden cursor-pointer bg-[#131A29] border border-white/[0.08] rounded-2xl p-3.5 sm:p-4 space-y-3 ff-card-glow"
              >
                <div className="flex items-start justify-between gap-2 sm:gap-3 min-w-0">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <h3 className="font-display text-sm sm:text-base font-extrabold text-white uppercase leading-snug truncate">
                      {t.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#FACC15]/15 border border-[#FACC15]/30 text-[10px] font-bold text-[#FACC15] inline-flex items-center gap-1">
                        <Crown className="w-3 h-3" />
                        <span>{t.mode.toUpperCase()}</span>
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          t.status === 'live'
                            ? 'bg-emerald-500/15 text-[#4ADE80] border border-emerald-500/30'
                            : t.status === 'completed'
                              ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                              : t.status === 'cancelled'
                                ? 'bg-white/[0.06] text-slate-300 border border-white/[0.1]'
                                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {getTournamentStatusLabel(t.status)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right text-[11px] shrink-0 space-y-0.5">
                    <div className="text-slate-400">
                      Time:{' '}
                      <span className="text-white font-semibold tabular-nums">
                        {formatMatchTimeOnly(t.match_time)}
                      </span>
                    </div>
                    <div className="text-slate-400">
                      Date:{' '}
                      <span className="text-white font-semibold tabular-nums">
                        {formatMatchDateOnly(t.match_time)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      ENTRY
                    </div>
                    <div className="font-mono text-sm font-extrabold text-white tabular-nums mt-0.5">
                      {t.entry_fee} PKR
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      TOTAL PRIZE
                    </div>
                    <div className="font-mono text-sm font-extrabold text-[#FACC15] tabular-nums mt-0.5">
                      {t.prize_pool} PKR
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <Medal className="w-3.5 h-3.5 text-[#4ADE80]" />
                    <span>PRIZE DISTRIBUTION</span>
                  </div>
                  <PrizeBreakdownStrip
                    prizePool={t.prize_pool}
                    prize1st={t.prize_1st}
                    prize2nd={t.prize_2nd}
                    prize3rd={t.prize_3rd}
                    prize4th={t.prize_4th}
                    prize5th={t.prize_5th}
                    compact
                  />
                </div>

                {t.winners.length > 0 && (
                  <div className="pt-1">
                    <WinnersPodium winners={t.winners} variant="compact" />
                  </div>
                )}
              </motion.article>
            ))}
          </div>
        )}
      </section>

      {/* Subtle Official Community & Highlights Strip (Preserves Video & WhatsApp Channel Access) */}
      <section className="grid md:grid-cols-2 gap-3.5 pt-1">
        <a
          href={WHATSAPP_CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 overflow-hidden bg-[#131A29] border border-white/[0.08] hover:border-[#FACC15]/45 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-[#FACC15]/15 text-[#FACC15] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white truncate">
                Official WhatsApp Channel
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                Instant Room IDs, schedules &amp; Booyah winner alerts
              </div>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-lg bg-[#FACC15] text-[#0A0E17] text-xs font-extrabold inline-flex items-center gap-1 shrink-0">
            <span>Join</span>
            <ExternalLink className="w-3 h-3" />
          </span>
        </a>

        {activeVideo ? (
          <button
            type="button"
            onClick={() => setVideoModalOpen(true)}
            className="min-w-0 overflow-hidden text-left bg-[#131A29] border border-white/[0.08] hover:border-[#FACC15]/45 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative w-14 h-10 rounded-lg overflow-hidden bg-[#0D1320] shrink-0">
                <img
                  src={getYouTubeThumbnailUrl(activeVideo.video_id)}
                  alt={activeVideo.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Play className="w-4 h-4 text-[#FACC15] fill-current" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate">{activeVideo.title}</div>
                <div className="text-[11px] text-slate-400 truncate">
                  Watch Free Fire tournament highlights ({videos.length} video{videos.length > 1 ? 's' : ''})
                </div>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-lg bg-white/[0.08] text-[#FACC15] text-xs font-bold shrink-0">
              Watch
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('leaderboard')}
            className="min-w-0 overflow-hidden text-left bg-[#131A29] border border-white/[0.08] hover:border-[#FACC15]/45 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-[#FACC15]/15 text-[#FACC15] flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate">Season Leaderboard</div>
                <div className="text-[11px] text-slate-400 truncate">
                  Track Top 3 champions, wins, kills &amp; points
                </div>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-lg bg-white/[0.08] text-[#FACC15] text-xs font-bold shrink-0">
              View
            </span>
          </button>
        )}
      </section>

      {/* YouTube Player Modal (Preserves Admin Video Showcase cleanly) */}
      {videoModalOpen && activeVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setVideoModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl bg-[#131A29] border border-white/[0.12] rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-[#FACC15] uppercase tracking-wider flex items-center gap-1.5">
                  <Youtube className="w-3.5 h-3.5" />
                  <span>FREE FIRE TOURNAMENT 09 · Highlights</span>
                </div>
                <h3 className="font-display text-base sm:text-lg font-bold text-white truncate">
                  {activeVideo.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setVideoModalOpen(false)}
                aria-label="Close video modal"
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] text-slate-300 hover:text-white flex items-center justify-center shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative aspect-video bg-[#0A0E17]">
              <iframe
                key={`${activeVideo.id}-${activeVideo.video_id}`}
                src={getYouTubeEmbedUrl(activeVideo.video_id)}
                title={activeVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
            </div>
            {videos.length > 1 && (
              <div className="p-3 bg-[#0D1320] border-t border-white/[0.08] flex gap-2 overflow-x-auto">
                {videos.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVideoId(v.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 border ${
                      v.id === activeVideo.id
                        ? 'bg-[#FACC15] border-[#FACC15] text-[#0A0E17] font-bold'
                        : 'bg-[#131A29] border-white/[0.08] text-slate-300 hover:text-white'
                    }`}
                  >
                    {v.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Flame,
  Gamepad2,
  Megaphone,
  Pin,
  Play,
  Shield,
  Star,
  Swords,
  Trophy,
  Wallet,
  Youtube,
} from 'lucide-react';
import {
  KELLY_HERO_ARTWORK,
  KELLY_TOURNAMENT_ARTWORK,
  formatPKR,
  formatPktCompact,
  formatPktScheduleRange,
  formatShortDate,
  getTournamentStatusLabel,
  getYouTubeEmbedUrl,
  getYouTubeThumbnailUrl,
} from '../lib/api';
import { PWAInstallButton } from './PWAInstallBanner';
import { DEFAULT_WINNER_AVATAR, PrizeBreakdownStrip, WinnersPodium } from './WinnersPodium';
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

const WhatsAppLogo: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M12.031 2c-5.516 0-9.969 4.453-9.969 9.969 0 1.766.469 3.484 1.344 5l-1.406 5.156 5.281-1.375c1.469.797 3.109 1.219 4.75 1.219 5.516 0 9.969-4.453 9.969-9.969S17.547 2 12.031 2zm5.813 14.125c-.25.703-1.438 1.344-2 1.422-.516.078-1.172.109-1.891-.125-.438-.141-1-.328-1.719-.641-3.016-1.297-4.984-4.344-5.141-4.547-.156-.203-1.234-1.641-1.234-3.125s.781-2.219 1.063-2.516c.281-.297.609-.375.813-.375s.406 0 .578.016c.188.016.438-.078.688.516.25.609.859 2.094.938 2.25.078.156.125.344.016.547-.109.203-.156.344-.313.516-.156.172-.328.391-.469.516-.156.156-.313.328-.141.641.172.313.781 1.297 1.688 2.094 1.156 1.031 2.141 1.359 2.453 1.516.313.156.484.125.672-.078.188-.203.781-.906.984-1.219.203-.313.422-.266.703-.156.281.109 1.797.844 2.109 1s.516.234.594.359c.078.125.078.734-.172 1.438z" />
  </svg>
);

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
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  user,
  wallet,
  tournaments,
  announcements,
  transactions,
  videos,
  topLeaderboard = [],
  onSelectTournament,
  onSelectMode,
  onNavigate,
  onOpenWallet,
  onOpenAuth,
}) => {
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);

  const liveTournaments = tournaments.filter((t) => t.status === 'live');
  const upcomingTournaments = tournaments.filter((t) => t.status === 'upcoming');
  const completedWithWinners = tournaments.filter(
    (t) => t.status === 'completed' && t.winners.length > 0
  );
  const featured = liveTournaments[0] || upcomingTournaments[0] || tournaments[0];
  const showcaseList = tournaments.filter((t) => t.status === 'live' || t.status === 'upcoming').slice(0, 6);

  const featuredVideo = videos.find((v) => v.is_featured === 1) || videos[0] || null;
  const featuredVideoId = featuredVideo?.id ?? null;

  useEffect(() => {
    setSelectedVideoId(null);
  }, [featuredVideoId, featuredVideo?.video_id]);

  const activeVideo =
    (selectedVideoId !== null ? videos.find((v) => v.id === selectedVideoId) : null) ||
    featuredVideo;

  const modeStats = [
    {
      mode: 'Battle Royale' as const,
      subtitle: '48-Player Bermuda & Purgatory Survival',
      icon: Flame,
      accent: 'text-[#FACC15]',
      count: tournaments.filter((t) => t.mode === 'Battle Royale' && (t.status === 'live' || t.status === 'upcoming')).length,
    },
    {
      mode: 'Clash Squad' as const,
      subtitle: 'Tactical 4v4 Knockout Arena Matches',
      icon: Shield,
      accent: 'text-[#4ADE80]',
      count: tournaments.filter((t) => t.mode === 'Clash Squad' && (t.status === 'live' || t.status === 'upcoming')).length,
    },
    {
      mode: 'Lone Wolf' as const,
      subtitle: 'High-Speed 1v1 & 2v2 Iron Cage Duels',
      icon: Crosshair,
      accent: 'text-[#FDE047]',
      count: tournaments.filter((t) => t.mode === 'Lone Wolf' && (t.status === 'live' || t.status === 'upcoming')).length,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Top Hero YouTube Video Showcase (First Main Section) */}
      <section aria-labelledby="youtube-video-heading" className="space-y-4">
        {!activeVideo ? (
          <div className="relative overflow-hidden rounded-2xl border bg-[#091D12] ff-card-glow p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#FACC15]">
                  <Youtube className="w-4 h-4" />
                  <span>FREE FIRE TOURNAMENT 09 · Featured Video</span>
                </div>
                <h2
                  id="youtube-video-heading"
                  className="font-display text-2xl sm:text-3xl font-extrabold text-white"
                >
                  Tournament Highlights &amp; Live Streams
                </h2>
                <p className="text-xs sm:text-sm text-emerald-100/80 leading-relaxed">
                  Featured Free Fire match highlights, custom room tutorials, and tournament live streams published from the Admin Dashboard appear right here at the top of the homepage.
                </p>
              </div>
              {user?.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => onNavigate('admin')}
                  className="ff-btn-ember min-h-[46px] px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                >
                  <Youtube className="w-4 h-4" />
                  <span>Add YouTube Video</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border bg-[#091D12] ff-card-glow">
            <div className="p-4 sm:p-5 lg:px-6 border-b border-[#22C55E]/25 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#091D12] via-[#0D2719] to-[#091D12]">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-[#4ADE80]">
                    <Youtube className="w-4 h-4 text-[#FACC15]" />
                    <span>FREE FIRE TOURNAMENT 09</span>
                  </span>
                  {activeVideo.is_featured === 1 && (
                    <span className="px-2 py-0.5 rounded-md bg-[#FACC15]/15 border border-[#FACC15]/45 text-[#FACC15] text-[11px] font-bold inline-flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current" />
                      <span>Featured Video</span>
                    </span>
                  )}
                  <span className="text-xs font-mono text-emerald-300/75 hidden sm:inline">
                    · Updated {formatShortDate(activeVideo.updated_at || activeVideo.created_at)}
                  </span>
                </div>
                <h2
                  id="youtube-video-heading"
                  className="font-display text-lg sm:text-2xl font-extrabold text-white truncate"
                >
                  {activeVideo.title}
                </h2>
              </div>

              <a
                href={`https://www.youtube.com/watch?v=${encodeURIComponent(activeVideo.video_id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[#FACC15]/50 bg-[#05130B] hover:border-[#FACC15] hover:bg-[#FACC15] hover:text-[#04110A] text-xs font-bold text-[#FACC15] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Watch on YouTube</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="relative aspect-video w-full bg-[#05130B]">
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
              <div className="p-4 sm:px-6 bg-[#05130B] border-t border-[#22C55E]/20 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-200/80">
                  <span>More Tournament Videos ({videos.length})</span>
                  <span className="text-[#FACC15]">Tap to switch player</span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {videos.map((v) => {
                    const isCurrent = v.id === activeVideo.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVideoId(v.id)}
                        className={`text-left p-2.5 rounded-xl border flex items-center gap-3 transition-all ${
                          isCurrent
                            ? 'bg-[#15803D]/30 border-[#FACC15] shadow-[0_0_14px_rgba(250,204,21,0.18)]'
                            : 'bg-[#091D12] border-[#22C55E]/20 hover:border-[#4ADE80]/60'
                        }`}
                      >
                        <div className="relative w-20 h-12 rounded-lg overflow-hidden bg-[#04110A] shrink-0">
                          <img
                            src={getYouTubeThumbnailUrl(v.video_id)}
                            alt={v.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                            <Play className="w-4 h-4 text-[#FACC15] fill-current" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-white line-clamp-2 leading-snug">
                            {v.title}
                          </div>
                          {v.is_featured === 1 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#FACC15] mt-0.5">
                              <Star className="w-3 h-3 fill-current" /> Featured
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Kelly Hero Focal Anchor */}
      <section className="relative overflow-hidden rounded-2xl border bg-[#091D12] ff-card-glow">
        <div className="grid lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between gap-6 relative z-10">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                <span className="text-[#4ADE80] font-bold uppercase tracking-wider">
                  FREE FIRE TOURNAMENT 09
                </span>
                {featured && (
                  <>
                    <span aria-hidden="true" className="text-emerald-500/60">·</span>
                    <span className="text-[#FACC15] font-semibold">
                      {featured.status === 'live'
                        ? 'Ongoing Championship'
                        : featured.status === 'completed'
                          ? 'Completed Championship'
                          : featured.mode}
                    </span>
                    <span aria-hidden="true" className="text-emerald-500/60">·</span>
                    <span className="text-emerald-100/80 font-mono tabular-nums">
                      {featured.filled_slots}/{featured.max_slots} Players
                    </span>
                  </>
                )}
              </div>

              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-[1.08]">
                {featured ? featured.title : 'FREE FIRE TOURNAMENT 09'}
              </h1>

              <p className="text-sm sm:text-base text-emerald-50/85 max-w-xl leading-relaxed">
                {featured?.rules ||
                  'Join Free Fire Tournaments across Battle Royale, Clash Squad & Lone Wolf and win verified PKR prize pools.'}
              </p>
            </div>

            {featured ? (
              <div className="flex flex-wrap items-center gap-5 pt-3 border-t border-[#22C55E]/20">
                <div>
                  <div className="text-xs text-emerald-200/70">Prize Pool</div>
                  <div className="font-mono text-xl sm:text-2xl font-bold text-[#FACC15] tabular-nums">
                    {formatPKR(featured.prize_pool)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-emerald-200/70">Entry Fee</div>
                  <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
                    {featured.entry_fee === 0 ? 'Free' : formatPKR(featured.entry_fee)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-emerald-200/70">Schedule (PKT)</div>
                  <div className="text-sm font-medium text-emerald-50 mt-1">
                    {formatPktScheduleRange(featured.match_time, featured.end_time)}
                  </div>
                </div>
                <div className="sm:ml-auto flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onSelectTournament(featured)}
                    className="flex-1 sm:flex-initial min-h-[48px] px-6 py-2.5 rounded-xl ff-btn-ember font-bold text-sm inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap"
                  >
                    <Swords className="w-4 h-4" />
                    <span>{featured.is_registered ? 'Joined · Match Room' : 'Join Tournament'}</span>
                  </motion.button>
                </div>
              </div>
            ) : (
              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('tournaments')}
                  className="min-h-[48px] px-6 py-2.5 rounded-xl ff-btn-ember text-sm font-bold inline-flex items-center justify-center gap-2"
                >
                  <Swords className="w-4 h-4" />
                  <span>Browse Tournaments</span>
                </button>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 relative min-h-[240px] lg:min-h-full bg-[#05130B]">
            <img
              src={KELLY_HERO_ARTWORK}
              alt="Kelly Esports Sprinter Heroine - FREE FIRE TOURNAMENT 09"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-[#091D12] via-[#091D12]/35 to-transparent" />
          </div>
        </div>
      </section>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs text-emerald-200/75">
            <span>Wallet Balance</span>
            <Wallet className="w-4 h-4 text-[#FACC15]" />
          </div>
          <div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
              {user ? formatPKR(user.wallet_balance) : 'PKR 0'}
            </div>
            {user && wallet && (
              <div className="text-[11px] text-[#4ADE80] font-mono mt-0.5 tabular-nums">
                Won: {formatPKR(wallet.total_won)}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => (user ? onOpenWallet('withdraw') : onOpenAuth())}
              className="text-left text-xs font-semibold text-[#FACC15] hover:text-white min-h-[28px] inline-flex items-center gap-1 transition-colors"
            >
              <span>{user ? 'Withdraw Money' : 'Sign in for wallet'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            {user && (
              <button
                type="button"
                onClick={() => onOpenWallet('winnings')}
                className="text-xs font-medium text-emerald-200/70 hover:text-white min-h-[28px]"
              >
                · Wallet
              </button>
            )}
          </div>
        </div>

        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs text-emerald-200/75">
            <span>Matches Played</span>
            <Gamepad2 className="w-4 h-4 text-[#4ADE80]" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
            {user ? user.matches_played : 0}
          </div>
          <span className="text-xs text-emerald-200/70">
            {user ? `ID: ${user.player_id}` : 'Track tournament entries'}
          </span>
        </div>

        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs text-emerald-200/75">
            <span>Booyah Wins</span>
            <Trophy className="w-4 h-4 text-[#FACC15]" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
            {user ? user.wins : 0}
          </div>
          <span className="text-xs text-emerald-200/70">
            {user && user.matches_played > 0
              ? `${Math.round((user.wins / user.matches_played) * 100)}% win rate`
              : 'Top-place finishes'}
          </span>
        </div>

        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between text-xs text-emerald-200/75">
            <span>Active Brackets</span>
            <Flame className="w-4 h-4 text-[#22C55E]" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
            {liveTournaments.length + upcomingTournaments.length}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('tournaments')}
            className="text-left text-xs font-medium text-[#4ADE80] hover:text-[#FACC15] min-h-[28px] inline-flex items-center gap-1 transition-colors"
          >
            <span>Browse full schedule</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* Kelly Tournament Banner & Free Fire Modes */}
      <section className="space-y-4">
        <div className="relative overflow-hidden rounded-2xl border border-[#22C55E]/35 bg-[#091D12]">
          <div className="grid lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-5 relative min-h-[190px] bg-[#05130B]">
              <img
                src={KELLY_TOURNAMENT_ARTWORK}
                alt="Kelly Bermuda Tournament Banner"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-l from-[#091D12] via-[#091D12]/35 to-transparent" />
            </div>

            <div className="lg:col-span-7 p-5 sm:p-6 lg:p-7 flex flex-col justify-between gap-5">
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#FACC15]">
                  Free Fire Tournament Modes · Daily PKT Lobbies
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                  Choose Your Combat Format
                </h2>
                <p className="text-xs sm:text-sm text-emerald-100/80">
                  Select a tournament mode to view open brackets, entry fees, and verified prize pools.
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                {modeStats.map((item) => {
                  const Icon = item.icon;
                  return (
                    <motion.button
                      key={item.mode}
                      type="button"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onSelectMode(item.mode)}
                      className="text-left p-3.5 rounded-xl bg-[#05130B]/95 border border-[#22C55E]/25 hover:border-[#FACC15]/75 transition-all flex flex-col justify-between gap-2 min-h-[96px]"
                    >
                      <div className="flex items-center justify-between">
                        <Icon className={`w-4 h-4 ${item.accent}`} />
                        <span className="font-mono text-xs text-emerald-200/75 tabular-nums">
                          {item.count} open
                        </span>
                      </div>
                      <div>
                        <div className="font-display text-sm font-bold text-white">{item.mode}</div>
                        <div className="text-[11px] text-emerald-200/70 leading-snug mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Official WhatsApp Channel Section */}
      <section
        aria-labelledby="whatsapp-channel-heading"
        className="relative overflow-hidden rounded-2xl border border-[#25D366]/35 bg-gradient-to-br from-[#25D366]/[0.14] via-[#091D12] to-[#091D12] p-5 sm:p-6"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#25D366]/15 border border-[#25D366]/40 flex items-center justify-center text-[#25D366] shrink-0">
              <WhatsAppLogo className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#4ADE80] font-medium">
                <span>Official Community Updates</span>
                <span aria-hidden="true" className="text-emerald-500/60">·</span>
                <span className="text-emerald-200/75">Room IDs &amp; Winner Announcements</span>
              </div>
              <h2
                id="whatsapp-channel-heading"
                className="font-display text-lg sm:text-xl font-bold text-white leading-snug"
              >
                Follow FREE FIRE TOURNAMENT 09 on WhatsApp
              </h2>
              <p className="text-xs sm:text-sm text-emerald-50/85 max-w-2xl leading-relaxed">
                Get instant tournament schedules, custom room alerts, bracket updates, and verified prize payout notices directly in WhatsApp.
              </p>
            </div>
          </div>

          <a
            href={WHATSAPP_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full md:w-auto min-h-[48px] px-6 py-3 rounded-xl bg-[#15803D] hover:bg-[#169B49] active:scale-[0.99] border border-[#25D366]/50 text-white font-semibold text-sm inline-flex items-center justify-center gap-2.5 shadow-lg shadow-[#25D366]/20 transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]"
          >
            <WhatsAppLogo className="w-5 h-5 shrink-0" />
            <span>Join Our WhatsApp Channel</span>
            <ExternalLink className="w-4 h-4 opacity-90 shrink-0" />
          </a>
        </div>
      </section>

      {/* Active & Upcoming Tournaments */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Live &amp; Upcoming Tournaments
            </h2>
            <p className="text-sm text-emerald-200/75">
              Instant slot confirmation with verified PKR prize pools
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={() => onNavigate('tournaments')}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#22C55E]/40 hover:border-[#FACC15] text-xs sm:text-sm font-medium text-emerald-50 whitespace-nowrap shrink-0 transition-colors"
            >
              View All ({tournaments.length})
            </button>
          </div>
        </div>

        {showcaseList.length === 0 ? (
          <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-8 text-center text-emerald-200/75 text-sm">
            No ongoing or upcoming tournaments right now. Check back soon or explore completed results.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {showcaseList.map((t) => {
              const slotsLeft = Math.max(0, t.max_slots - t.filled_slots);
              const pct = Math.min(100, Math.round((t.filled_slots / t.max_slots) * 100));
              return (
                <motion.article
                  key={t.id}
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => onSelectTournament(t)}
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
                              : 'text-[#FACC15] font-semibold'
                          }
                        >
                          {getTournamentStatusLabel(t.status)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#FDE047] font-medium">{t.mode}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {t.end_time
                            ? formatPktScheduleRange(t.match_time, t.end_time)
                            : formatPktCompact(t.match_time)}
                        </span>
                      </div>
                      <h3 className="font-display text-lg font-bold text-white leading-snug">
                        {t.title}
                      </h3>
                    </div>

                    <div className="space-y-3">
                      <PrizeBreakdownStrip
                        prizePool={t.prize_pool}
                        prize1st={t.prize_1st}
                        prize2nd={t.prize_2nd}
                        prize3rd={t.prize_3rd}
                        compact
                      />

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-emerald-200/75">
                            {slotsLeft === 0 ? 'Bracket Full' : `${slotsLeft} slots left`}
                          </span>
                          <span className="font-mono text-emerald-100 tabular-nums">
                            {t.filled_slots}/{t.max_slots}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#05130B] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#16A34A] via-[#22C55E] to-[#FACC15]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#22C55E]/20 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] text-emerald-200/75">Prize Pool</div>
                          <div className="font-mono text-sm font-bold text-[#FACC15] tabular-nums">
                            {formatPKR(t.prize_pool)}
                          </div>
                        </div>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTournament(t);
                          }}
                          className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                            t.is_registered
                              ? 'bg-[#15803D]/35 border border-[#22C55E]/65 text-white'
                              : 'ff-btn-ember'
                          }`}
                        >
                          {t.is_registered
                            ? 'Joined · Room'
                            : t.entry_fee === 0
                              ? 'Join Free'
                              : `Join · ${formatPKR(t.entry_fee)}`}
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </section>

      {/* Tournament Announcements & Match Results */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-[#FACC15]" />
              <span>Tournament Announcements &amp; Results</span>
            </h2>
            <p className="text-sm text-emerald-200/75">
              Latest bracket updates, custom room alerts, and verified Booyah winners
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-5">
          {/* Announcements Feed */}
          <div className="lg:col-span-7 space-y-3">
            {announcements.length === 0 ? (
              <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-6 text-sm text-emerald-200/75">
                Official announcements and match results will be posted here.
              </div>
            ) : (
              announcements.slice(0, 4).map((item) => (
                <article
                  key={item.id}
                  className="bg-[#091D12] border border-[#22C55E]/25 hover:border-[#FACC15]/55 rounded-2xl p-4 sm:p-5 space-y-2 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-md font-semibold ${
                          item.category === 'Match Result'
                            ? 'bg-[#FACC15]/15 text-[#FACC15]'
                            : item.category === 'Room Alert'
                              ? 'bg-[#FDE047]/15 text-[#FDE047]'
                              : 'bg-[#22C55E]/15 text-[#4ADE80]'
                        }`}
                      >
                        {item.category}
                      </span>
                      {item.is_pinned === 1 && (
                        <span className="inline-flex items-center gap-1 text-[#FACC15] font-medium">
                          <Pin className="w-3 h-3" /> Pinned
                        </span>
                      )}
                    </div>
                    <span className="text-emerald-200/70 font-mono text-[11px]">
                      {formatShortDate(item.created_at)}
                    </span>
                  </div>
                  <h3 className="font-display text-base font-bold text-white">{item.title}</h3>
                  <p className="text-xs sm:text-sm text-emerald-50/85 leading-relaxed">
                    {item.content}
                  </p>
                </article>
              ))
            )}
          </div>

          {/* Official Completed Results Podium */}
          <div className="lg:col-span-5 bg-[#091D12] border border-[#22C55E]/30 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#FACC15]" />
                <span>Recent Match Results</span>
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('tournaments')}
                className="text-xs font-medium text-[#4ADE80] hover:text-[#FACC15]"
              >
                All Results
              </button>
            </div>

            {completedWithWinners.length === 0 ? (
              <p className="text-xs sm:text-sm text-emerald-200/75 leading-relaxed">
                Completed tournament podiums and prize payouts appear here automatically as soon as winners are declared.
              </p>
            ) : (
              <div className="space-y-3">
                {completedWithWinners.slice(0, 3).map((t) => (
                  <div
                    key={t.id}
                    onClick={() => onSelectTournament(t)}
                    className="cursor-pointer bg-[#05130B] border border-[#22C55E]/20 hover:border-[#FACC15]/55 rounded-xl p-3.5 space-y-2 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-sm font-bold text-white truncate">
                        {t.title}
                      </span>
                      <span className="text-[11px] text-[#FACC15] font-mono shrink-0">
                        {formatPKR(t.prize_pool)}
                      </span>
                    </div>
                    <WinnersPodium winners={t.winners} variant="compact" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Top Ranked Players Leaderboard Preview */}
      <section aria-labelledby="home-leaderboard-heading" className="bg-[#091D12] border border-[#22C55E]/30 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="home-leaderboard-heading"
              className="font-display text-lg sm:text-xl font-bold text-white flex items-center gap-2"
            >
              <Trophy className="w-5 h-5 text-[#FACC15]" />
              <span>Top Ranked Players</span>
            </h2>
            <p className="text-xs sm:text-sm text-emerald-200/75">
              Live Free Fire standings with Daily, Weekly, Monthly &amp; All-Time rankings
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('leaderboard')}
            className="min-h-[44px] px-4 py-2 rounded-xl ff-btn-ember text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>Full Leaderboard</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {topLeaderboard.length === 0 ? (
          <div className="py-4 border-t border-[#22C55E]/15 text-xs sm:text-sm text-emerald-200/75">
            Player rankings update automatically as soon as matches and tournament winners are announced.
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3.5">
            {topLeaderboard.slice(0, 3).map((player) => {
              const medal = player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : '🥉';
              const borderHighlight =
                player.rank === 1
                  ? 'border-[#FACC15]/70 bg-gradient-to-b from-[#FACC15]/12 to-[#05130B]'
                  : player.rank === 2
                    ? 'border-slate-300/45 bg-[#05130B]'
                    : 'border-amber-400/45 bg-[#05130B]';
              return (
                <div
                  key={player.user_id}
                  onClick={() => onNavigate('leaderboard')}
                  className={`cursor-pointer rounded-xl border p-4 flex items-center justify-between gap-3 transition-transform hover:-translate-y-0.5 ${borderHighlight}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0" aria-hidden="true">
                      {medal}
                    </span>
                    <img
                      src={player.avatar_url || DEFAULT_WINNER_AVATAR}
                      alt={player.username}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-xl object-cover border border-[#22C55E]/40 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-display text-sm font-bold text-white truncate">
                        {player.username}
                      </div>
                      <div className="text-[11px] font-mono text-emerald-200/75 truncate">
                        {player.wins} wins · {player.win_rate.toFixed(0)}% WR
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-extrabold text-[#FACC15] tabular-nums">
                      {player.points}
                    </div>
                    <div className="text-[10px] text-emerald-200/65">pts</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Transactions */}
      <section className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-white">
              Player Wallet &amp; Recent Activity
            </h2>
            <p className="text-xs sm:text-sm text-emerald-200/75">
              Prize winnings, Easypaisa/JazzCash/Bank withdrawals, and match entry records
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {user && (
              <button
                type="button"
                onClick={() => onOpenWallet('withdraw')}
                className="min-h-[44px] px-4 py-2 rounded-xl ff-btn-ember text-xs sm:text-sm font-bold whitespace-nowrap inline-flex items-center gap-1.5"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Withdraw Money</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => (user ? onOpenWallet('winnings') : onOpenAuth())}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#22C55E]/40 hover:border-[#FACC15] text-xs sm:text-sm font-medium text-emerald-50 whitespace-nowrap transition-colors"
            >
              {user ? 'Open Wallet' : 'Sign In'}
            </button>
          </div>
        </div>

        {!user ? (
          <div className="py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-[#22C55E]/15">
            <p className="text-sm text-emerald-200/75">
              Sign in or register to view your PKR wallet balance, deposit via JazzCash/Easypaisa, and track payouts.
            </p>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={onOpenAuth}
              className="min-h-[44px] px-5 py-2.5 rounded-xl ff-btn-ember text-sm font-bold whitespace-nowrap shrink-0"
            >
              Sign In / Sign Up
            </motion.button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-6 border-t border-[#22C55E]/15 text-sm text-emerald-200/75">
            No transactions yet. Fund your wallet via JazzCash or Easypaisa to join paid tournaments.
          </div>
        ) : (
          <div className="divide-y divide-[#22C55E]/15">
            {transactions.slice(0, 5).map((tx) => (
              <div key={tx.id} className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      tx.direction === 'credit'
                        ? 'bg-[#22C55E]/15 text-[#4ADE80]'
                        : 'bg-[#FACC15]/15 text-[#FACC15]'
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
                    <div className="text-xs text-emerald-200/70 font-mono">
                      {tx.tx_code} · {tx.status} · {formatShortDate(tx.created_at)}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={`font-mono text-sm font-semibold tabular-nums ${
                      tx.direction === 'credit' ? 'text-[#4ADE80]' : 'text-white'
                    }`}
                  >
                    {tx.direction === 'credit' ? '+' : '-'}
                    {formatPKR(tx.amount)}
                  </div>
                  <div className="font-mono text-[11px] text-emerald-200/60 tabular-nums">
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

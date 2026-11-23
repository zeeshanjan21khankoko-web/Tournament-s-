import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  CircleUserRound,
  Flame,
  Gift,
  Home,
  Medal,
  Megaphone,
  Pin,
  Shield,
  Sparkles,
  Trophy,
  User,
  Wallet,
  X,
} from 'lucide-react';
import {
  ApiError,
  AVATAR_PRESETS,
  apiRequest,
  computeTournamentStatus,
  formatPKR,
  formatRs,
  formatShortDate,
} from './lib/api';
import { loadCachedTournaments, saveCachedTournaments } from './lib/offlineCache';
import { OfflineIndicator } from './components/PWAInstallBanner';
import { AuthView } from './components/AuthView';
import { HomeDashboard } from './components/HomeDashboard';
import { TournamentsView } from './components/TournamentsView';
import { LeaderboardView } from './components/LeaderboardView';
import { WalletView, type WalletSubTab } from './components/WalletView';
import { ProfileView } from './components/ProfileView';
import { AdminPanel } from './components/AdminPanel';
import { FloatingWhatsAppButton } from './components/FloatingWhatsAppButton';
import type {
  AnnouncementRecord,
  DepositRecord,
  LeaderboardEntry,
  PaymentChannel,
  Tournament,
  TransactionRecord,
  UserProfile,
  WalletAccount,
  WinningRecord,
  WithdrawalRecord,
  YouTubeVideoRecord,
} from './types';

function sameJson<T>(a: T, b: T): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

type ActiveTab =
  | 'home'
  | 'wallet'
  | 'tournaments'
  | 'leaderboard'
  | 'profile'
  | 'admin';

const TAB_TO_PATH: Record<ActiveTab, string> = {
  home: '/',
  wallet: '/wallet',
  tournaments: '/tournaments',
  leaderboard: '/leaderboard',
  profile: '/profile',
  admin: '/admin',
};

function pathToTab(pathname: string): ActiveTab {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/tournaments') return 'tournaments';
  if (clean === '/leaderboard') return 'leaderboard';
  if (clean === '/wallet') return 'wallet';
  if (clean === '/profile') return 'profile';
  if (clean === '/admin') return 'admin';
  return 'home';
}

interface LuckyDrawEntry {
  id: number;
  draw_date_pkt: string;
  prize_amount: number;
  prize_label: string;
  created_at: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window !== 'undefined') {
      return pathToTab(window.location.pathname);
    }
    return 'home';
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [unreadAckCount, setUnreadAckCount] = useState<number>(0);

  // Lucky Draw state
  const [showLuckyDrawModal, setShowLuckyDrawModal] = useState(false);
  const [luckyLoading, setLuckyLoading] = useState(false);
  const [luckySpinning, setLuckySpinning] = useState(false);
  const [luckyCanSpin, setLuckyCanSpin] = useState(true);
  const [luckyTodayEntry, setLuckyTodayEntry] = useState<LuckyDrawEntry | null>(null);
  const [luckyRecent, setLuckyRecent] = useState<LuckyDrawEntry[]>([]);
  const [luckyError, setLuckyError] = useState('');

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [videos, setVideos] = useState<YouTubeVideoRecord[]>([]);
  const [topLeaderboard, setTopLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [selectedMode, setSelectedMode] = useState<
    'all' | 'Battle Royale' | 'Clash Squad' | 'Lone Wolf'
  >('all');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [wallet, setWallet] = useState<WalletAccount | null>(null);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [winnings, setWinnings] = useState<WinningRecord[]>([]);
  const [walletSubTab, setWalletSubTab] = useState<WalletSubTab>('history');
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>([]);

  const lastPublicSyncRef = useRef<number>(0);

  // Restore persistent server session (HttpOnly cookie) once on app launch
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiRequest<{
          token: string;
          user: UserProfile;
          wallet: WalletAccount;
        }>('/api/auth/me');
        if (!active) return;
        setToken(res.token);
        setUser(res.user);
        setWallet(res.wallet || null);
        setActiveTab((prev) => (prev === 'admin' && res.user.role !== 'admin' ? 'home' : prev));
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setToken(null);
          setUser(null);
          setActiveTab((prev) =>
            prev === 'wallet' || prev === 'profile' || prev === 'admin' ? 'home' : prev
          );
        }
      } finally {
        if (active) setAuthChecked(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Sync URL + SEO canonical/og:url dynamically after auth restore completes
  useEffect(() => {
    if (typeof window === 'undefined' || !authChecked) return;
    const targetPath = TAB_TO_PATH[activeTab];
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ tab: activeTab }, '', targetPath);
    }
    const canonicalHref = `${window.location.origin}${targetPath}`;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalHref;

    let ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.content = canonicalHref;
  }, [activeTab, authChecked]);

  useEffect(() => {
    const handlePopState = () => {
      const next = pathToTab(window.location.pathname);
      if ((next === 'wallet' || next === 'profile' || next === 'admin') && !user) {
        setActiveTab('home');
      } else if (next === 'admin' && user?.role !== 'admin') {
        setActiveTab('home');
      } else {
        setActiveTab(next);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user]);

  const liveTournaments = useMemo(() => {
    return tournaments.map((t) => {
      const computed = computeTournamentStatus(t, nowMs);
      return computed === t.status ? t : { ...t, status: computed };
    });
  }, [tournaments, nowMs]);

  const liveSelectedTournament = useMemo(() => {
    if (!selectedTournament) return null;
    const match = liveTournaments.find((t) => t.id === selectedTournament.id);
    if (match) return match;
    const computed = computeTournamentStatus(selectedTournament, nowMs);
    return computed === selectedTournament.status
      ? selectedTournament
      : { ...selectedTournament, status: computed };
  }, [selectedTournament, liveTournaments, nowMs]);

  const loadTournamentsAndPublic = useCallback(async (authToken: string | null) => {
    lastPublicSyncRef.current = Date.now();
    try {
      const [tourRes, annRes, channelRes, videoRes, lbRes] = await Promise.all([
        apiRequest<{ tournaments: Tournament[] }>('/api/tournaments', { token: authToken }),
        apiRequest<{ announcements: AnnouncementRecord[] }>('/api/announcements').catch(() => null),
        apiRequest<{ paymentChannels: PaymentChannel[] }>('/api/payment-channels').catch(() => null),
        apiRequest<{ videos: YouTubeVideoRecord[] }>('/api/videos').catch(() => null),
        apiRequest<{ leaderboard: LeaderboardEntry[] }>('/api/leaderboard?period=all').catch(
          () => null
        ),
      ]);

      let leaderboardDataChanged = false;

      setTournaments((prev) => {
        if (sameJson(prev, tourRes.tournaments)) return prev;
        leaderboardDataChanged = true;
        saveCachedTournaments(tourRes.tournaments);
        return tourRes.tournaments;
      });

      if (annRes) {
        const nextAnn = annRes.announcements || [];
        setAnnouncements((prev) => (sameJson(prev, nextAnn) ? prev : nextAnn));
      }

      if (videoRes) {
        const nextVideos = videoRes.videos || [];
        setVideos((prev) => (sameJson(prev, nextVideos) ? prev : nextVideos));
      }

      if (lbRes) {
        const nextTop = (lbRes.leaderboard || []).slice(0, 3);
        setTopLeaderboard((prev) => {
          if (sameJson(prev, nextTop)) return prev;
          leaderboardDataChanged = true;
          return nextTop;
        });
      }

      if (leaderboardDataChanged) {
        setLeaderboardRefreshKey((k) => k + 1);
      }

      if (channelRes?.paymentChannels && channelRes.paymentChannels.length > 0) {
        setPaymentChannels((prev) =>
          sameJson(prev, channelRes.paymentChannels) ? prev : channelRes.paymentChannels
        );
      }

      setSelectedTournament((prev) => {
        if (!prev) return null;
        const found = tourRes.tournaments.find((t) => t.id === prev.id);
        if (!found) return prev;
        return sameJson(prev, found) ? prev : found;
      });
    } catch (err) {
      const cached = loadCachedTournaments();
      if (cached.tournaments.length > 0) {
        setTournaments((prev) => (prev.length === 0 ? cached.tournaments : prev));
      }
      console.error('Failed to load tournaments:', err);
    }
  }, []);

  const loadUserAndWallet = useCallback(async (authToken: string | null) => {
    if (!authToken) {
      setWallet(null);
      setDeposits([]);
      setWithdrawals([]);
      setTransactions([]);
      setWinnings([]);
      return;
    }
    try {
      const [meRes, walletRes] = await Promise.all([
        apiRequest<{ user: UserProfile; wallet: WalletAccount }>('/api/auth/me', {
          token: authToken,
        }),
        apiRequest<{
          wallet: WalletAccount;
          deposits: DepositRecord[];
          withdrawals: WithdrawalRecord[];
          transactions: TransactionRecord[];
          winnings: WinningRecord[];
          paymentChannels: PaymentChannel[];
        }>('/api/wallet', { token: authToken }),
      ]);
      setUser((prev) => (sameJson(prev, meRes.user) ? prev : meRes.user));
      setWallet((prev) => (sameJson(prev, walletRes.wallet) ? prev : walletRes.wallet));
      setDeposits((prev) => (sameJson(prev, walletRes.deposits) ? prev : walletRes.deposits));
      setWithdrawals((prev) =>
        sameJson(prev, walletRes.withdrawals) ? prev : walletRes.withdrawals
      );
      setTransactions((prev) =>
        sameJson(prev, walletRes.transactions) ? prev : walletRes.transactions
      );
      const nextWinnings = walletRes.winnings || [];
      setWinnings((prev) => (sameJson(prev, nextWinnings) ? prev : nextWinnings));
      setPaymentChannels((prev) =>
        sameJson(prev, walletRes.paymentChannels) ? prev : walletRes.paymentChannels
      );
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setToken(null);
        setUser(null);
      }
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadTournamentsAndPublic(token), loadUserAndWallet(token)]);
    setLeaderboardRefreshKey((k) => k + 1);
  }, [loadTournamentsAndPublic, loadUserAndWallet, token]);

  useEffect(() => {
    if (!authChecked) return;
    loadTournamentsAndPublic(token);
  }, [authChecked, loadTournamentsAndPublic, token]);

  useEffect(() => {
    if (!authChecked) return;
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        Date.now() - lastPublicSyncRef.current >= 60_000
      ) {
        loadTournamentsAndPublic(token);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        loadTournamentsAndPublic(token);
      }
    }, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(poll);
    };
  }, [authChecked, loadTournamentsAndPublic, token]);

  useEffect(() => {
    if (!authChecked) return;
    loadUserAndWallet(token);
  }, [authChecked, loadUserAndWallet, token]);

  const handleAuthSuccess = (newToken: string, newUser: UserProfile) => {
    setToken(newToken);
    setUser(newUser);
    setShowAuthModal(false);
  };

  const handleLogout = async () => {
    apiRequest('/api/auth/logout', { method: 'POST', token }).catch(() => {});
    setToken(null);
    setUser(null);
    setWallet(null);
    setDeposits([]);
    setWithdrawals([]);
    setTransactions([]);
    setWinnings([]);
    setActiveTab('home');
  };

  const handleNavigate = (tab: ActiveTab) => {
    if ((tab === 'wallet' || tab === 'profile' || tab === 'admin') && !user) {
      setShowAuthModal(true);
      return;
    }
    if (tab === 'admin' && user?.role !== 'admin') {
      return;
    }
    if (tab === 'wallet') {
      setWalletSubTab('history');
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenWallet = (subTab: WalletSubTab = 'history') => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    setWalletSubTab(subTab);
    setActiveTab('wallet');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectTournament = (t: Tournament | null) => {
    setSelectedTournament(t);
    if (t && activeTab === 'home') {
      setActiveTab('tournaments');
    }
  };

  const handleOpenMode = (mode: 'Battle Royale' | 'Clash Squad' | 'Lone Wolf') => {
    setSelectedMode(mode);
    setSelectedTournament(null);
    setActiveTab('tournaments');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleJoinTournament = async (
    tournamentId: number,
    inGameName: string,
    inGameId: string
  ) => {
    if (!token) {
      setShowAuthModal(true);
      return;
    }
    const res = await apiRequest<{ user: UserProfile; tournament: Tournament }>(
      `/api/tournaments/${tournamentId}/join`,
      {
        method: 'POST',
        token,
        body: { inGameName, inGameId },
      }
    );
    setUser(res.user);
    setSelectedTournament(res.tournament);
    await refreshAll();
  };

  const openLuckyDraw = async () => {
    if (!token) {
      setShowAuthModal(true);
      return;
    }
    setLuckyError('');
    setShowLuckyDrawModal(true);
    setLuckyLoading(true);
    try {
      const res = await apiRequest<{
        canSpin: boolean;
        todayEntry: LuckyDrawEntry | null;
        recentEntries: LuckyDrawEntry[];
      }>('/api/lucky-draw', { token });
      setLuckyCanSpin(res.canSpin);
      setLuckyTodayEntry(res.todayEntry);
      setLuckyRecent(res.recentEntries || []);
    } catch (err) {
      setLuckyError(err instanceof Error ? err.message : 'Unable to load Lucky Draw.');
    } finally {
      setLuckyLoading(false);
    }
  };

  const handleSpinLuckyDraw = async () => {
    if (!token || !luckyCanSpin || luckySpinning) return;
    setLuckyError('');
    setLuckySpinning(true);
    try {
      const [res] = await Promise.all([
        apiRequest<{ entry: LuckyDrawEntry; user: UserProfile }>('/api/lucky-draw/spin', {
          method: 'POST',
          token,
        }),
        new Promise((r) => setTimeout(r, 900)),
      ]);
      setLuckyCanSpin(false);
      setLuckyTodayEntry(res.entry);
      setLuckyRecent((prev) => [res.entry, ...prev].slice(0, 10));
      setUser(res.user);
      await refreshAll();
    } catch (err) {
      setLuckyError(err instanceof Error ? err.message : 'Unable to spin Lucky Draw.');
    } finally {
      setLuckySpinning(false);
    }
  };

  const unreadCount = Math.max(0, announcements.length - unreadAckCount);

  // Desktop nav order & Mobile 5-Tab Bottom Bar (Exact match to reference screenshots: Home, Wallet, Tournaments, Leaderboard, Profile)
  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'tournaments', label: 'Tournaments', icon: Trophy },
    { id: 'leaderboard', label: 'Leaderboard', icon: Medal },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const renderMobileHeaderLeft = () => {
    if (activeTab === 'home') {
      return (
        <button
          type="button"
          onClick={() => (user ? handleNavigate('profile') : setShowAuthModal(true))}
          className="flex items-center gap-2.5 min-w-0"
        >
          <img
            src={user?.avatar_url || AVATAR_PRESETS[0].url}
            alt={user?.username || 'Player'}
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-full object-cover border-2 border-[#FACC15] bg-[#131A29] shrink-0"
          />
          <span className="font-display text-sm sm:text-base font-extrabold text-[#FACC15] truncate">
            {user ? `Welcome, ${user.username}` : 'FREE FIRE TOURNAMENT 09'}
          </span>
        </button>
      );
    }
    if (activeTab === 'tournaments') {
      return (
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="w-5 h-5 text-[#FACC15] shrink-0" />
          <span className="font-display text-base sm:text-lg font-extrabold text-[#FACC15] truncate">
            Tournaments
          </span>
        </div>
      );
    }
    if (activeTab === 'wallet') {
      return (
        <div className="flex items-center gap-2 min-w-0">
          <Wallet className="w-5 h-5 text-[#FACC15] shrink-0" />
          <span className="font-display text-base sm:text-lg font-extrabold text-[#FACC15] truncate">
            My Wallet
          </span>
        </div>
      );
    }
    if (activeTab === 'leaderboard') {
      return (
        <div className="flex items-center gap-2 min-w-0">
          <Medal className="w-5 h-5 text-[#FACC15] shrink-0" />
          <span className="font-display text-base sm:text-lg font-extrabold text-[#FACC15] truncate">
            Leaderboard
          </span>
        </div>
      );
    }
    if (activeTab === 'admin') {
      return (
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-5 h-5 text-[#FACC15] shrink-0" />
          <span className="font-display text-base sm:text-lg font-extrabold text-[#FACC15] truncate">
            Admin Console
          </span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 min-w-0">
        <CircleUserRound className="w-5 h-5 text-[#FACC15] shrink-0" />
        <span className="font-display text-base sm:text-lg font-extrabold text-[#FACC15] truncate">
          My Profile
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 h-14 lg:h-16 bg-[#0A0E17]/95 backdrop-blur-md border-b border-white/[0.07]">
        <div className="max-w-7xl mx-auto h-full px-3.5 sm:px-6 flex items-center justify-between gap-3">
          {/* Mobile Screen-Specific Header Left / Desktop Brand */}
          <div className="lg:hidden min-w-0 flex-1">{renderMobileHeaderLeft()}</div>

          <button
            type="button"
            onClick={() => handleNavigate('home')}
            className="hidden lg:inline-flex font-display text-lg xl:text-xl font-extrabold tracking-tight text-white items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Flame className="w-5 h-5 text-[#FACC15] shrink-0" />
            <span>FREE FIRE TOURNAMENT 09</span>
          </button>

          {/* Desktop Navigation */}
          <nav
            className="hidden lg:flex items-center gap-6 text-sm font-semibold"
            aria-label="Main navigation"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-[#FACC15] text-[#FACC15]'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => handleNavigate('admin')}
                className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'admin'
                    ? 'border-[#FACC15] text-[#FACC15]'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                Admin
              </button>
            )}
          </nav>

          {/* Right Actions (Bell on Home + Admin chip if admin + Rs. Balance Pill) */}
          <div className="flex items-center gap-2 shrink-0">
            {activeTab === 'home' && (
              <button
                type="button"
                onClick={() => {
                  setShowNotificationsModal(true);
                  setUnreadAckCount(announcements.length);
                }}
                aria-label="Notifications"
                className="relative w-9 h-9 rounded-full bg-[#131A29] border border-white/[0.1] hover:border-[#FACC15]/50 flex items-center justify-center text-[#FACC15] transition-colors"
              >
                <Bell className="w-4 h-4 fill-current" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white font-mono text-[10px] font-extrabold flex items-center justify-center leading-none">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}

            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => handleNavigate('admin')}
                className="lg:hidden min-h-[34px] px-2.5 rounded-full bg-[#FACC15]/15 border border-[#FACC15]/50 text-[#FACC15] text-[11px] font-bold inline-flex items-center gap-1"
                aria-label="Open Admin Panel"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
            )}

            {user ? (
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => handleNavigate('wallet')}
                className="min-h-[34px] px-3 py-1 rounded-full bg-[#1B1910] border border-[#FACC15]/55 hover:border-[#FACC15] text-xs font-display font-extrabold text-[#FACC15] inline-flex items-center whitespace-nowrap shrink-0 tabular-nums transition-colors"
              >
                {formatRs(user.wallet_balance)}
              </motion.button>
            ) : (
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowAuthModal(true)}
                className="min-h-[34px] px-3.5 py-1 rounded-full ff-btn-ember text-xs font-extrabold whitespace-nowrap shrink-0 transition-all"
              >
                Sign In
              </motion.button>
            )}
          </div>
        </div>
      </header>

      <OfflineIndicator />

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3.5 sm:px-6 pt-4 sm:pt-6 pb-24 lg:pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === 'home' && (
              <HomeDashboard
                user={user}
                wallet={wallet}
                tournaments={liveTournaments}
                announcements={announcements}
                transactions={transactions}
                videos={videos}
                topLeaderboard={topLeaderboard}
                onSelectTournament={handleSelectTournament}
                onSelectMode={handleOpenMode}
                onNavigate={handleNavigate}
                onOpenWallet={handleOpenWallet}
                onOpenAuth={() => setShowAuthModal(true)}
                onOpenLuckyDraw={openLuckyDraw}
              />
            )}

            {activeTab === 'tournaments' && (
              <TournamentsView
                tournaments={liveTournaments}
                announcements={announcements}
                user={user}
                selectedTournament={liveSelectedTournament}
                selectedMode={selectedMode}
                onChangeMode={setSelectedMode}
                onSelectTournament={setSelectedTournament}
                onJoinTournament={handleJoinTournament}
                onOpenAuth={() => setShowAuthModal(true)}
              />
            )}

            {activeTab === 'leaderboard' && (
              <LeaderboardView
                token={token}
                user={user}
                refreshSignal={leaderboardRefreshKey}
                onNavigateTournaments={() => handleNavigate('tournaments')}
              />
            )}

            {activeTab === 'wallet' && user && token && (
              <WalletView
                token={token}
                wallet={wallet}
                deposits={deposits}
                withdrawals={withdrawals}
                transactions={transactions}
                winnings={winnings}
                paymentChannels={paymentChannels}
                initialTab={walletSubTab}
                onRefresh={refreshAll}
              />
            )}

            {activeTab === 'profile' && user && token && (
              <ProfileView
                user={user}
                token={token}
                onUserUpdated={(updated) => setUser(updated)}
                onLogout={handleLogout}
                onOpenAdmin={user.role === 'admin' ? () => setActiveTab('admin') : undefined}
              />
            )}

            {activeTab === 'admin' && user?.role === 'admin' && token && (
              <AdminPanel
                token={token}
                currentUser={user}
                tournaments={liveTournaments}
                onRefreshPublic={refreshAll}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Desktop Footer */}
      <footer className="hidden lg:block border-t border-white/[0.06] py-6 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <span>FREE FIRE TOURNAMENT 09 · Competitive Free Fire Esports Arena</span>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => handleNavigate('tournaments')}
              className="hover:text-[#FACC15] transition-colors"
            >
              Tournaments
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('leaderboard')}
              className="hover:text-[#FACC15] transition-colors"
            >
              Leaderboard
            </button>
            <span className="text-slate-500">JazzCash · Easypaisa · PKT</span>
          </div>
        </div>
      </footer>

      {/* Mobile Fixed 5-Tab Bottom Navigation (Matches Screenshots 1–5) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0D121E]/95 backdrop-blur-lg border-t border-white/[0.08] pb-safe rounded-t-2xl"
      >
        <div className="grid grid-cols-5 h-16 items-center px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className="relative h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors"
              >
                {isActive && (
                  <span className="absolute top-0.5 w-6 h-[2.5px] rounded-full bg-[#FACC15]" />
                )}
                <div
                  className={`w-9 h-7 rounded-xl flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-[#FACC15]/15 text-[#FACC15] shadow-[0_0_20px_rgba(250,204,21,0.35)]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" />
                </div>
                <span
                  className={`text-[10px] font-semibold tracking-tight ${
                    isActive ? 'text-[#FACC15] font-bold' : 'text-slate-400'
                  }`}
                >
                  {item.label}
                </span>
                {isActive && (
                  <span className="w-1 h-1 rounded-full bg-[#FACC15]" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Floating Golden WhatsApp Button */}
      <FloatingWhatsAppButton />

      {/* MODAL: NOTIFICATIONS / ANNOUNCEMENTS */}
      {showNotificationsModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowNotificationsModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-[#FACC15]" />
                <span>Notifications &amp; Announcements</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNotificationsModal(false)}
                aria-label="Close notifications"
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] text-slate-300 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {announcements.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Megaphone className="w-9 h-9 text-slate-500 mx-auto" />
                <p className="text-sm text-slate-400">
                  No new announcements yet. Tournament alerts and results appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {announcements.map((a) => (
                  <div
                    key={a.id}
                    className="bg-[#0D1320] border border-white/[0.08] rounded-xl p-3.5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-[#FACC15]/15 text-[#FACC15] font-bold">
                          {a.category}
                        </span>
                        {a.is_pinned === 1 && (
                          <span className="inline-flex items-center gap-1 text-[#FACC15] font-semibold">
                            <Pin className="w-3 h-3" /> Pinned
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-slate-400">
                        {formatShortDate(a.created_at)}
                      </span>
                    </div>
                    <div className="font-display text-sm font-bold text-white">{a.title}</div>
                    <p className="text-xs text-slate-300 leading-relaxed">{a.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: DAILY LUCKY DRAW */}
      {showLuckyDrawModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowLuckyDrawModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-[#131A29] border border-fuchsia-400/35 rounded-t-3xl sm:rounded-2xl p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
                <Gift className="w-5 h-5 text-fuchsia-300" />
                <span>Daily Lucky Draw</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowLuckyDrawModal(false)}
                aria-label="Close Lucky Draw"
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] text-slate-300 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {luckyError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {luckyError}
              </div>
            )}

            <div className="rounded-2xl bg-gradient-to-br from-fuchsia-500/15 via-[#0D1320] to-[#FACC15]/10 border border-white/[0.1] p-5 text-center space-y-3">
              <div
                className={`w-20 h-20 mx-auto rounded-full bg-gradient-to-tr from-fuchsia-400 to-[#FACC15] text-[#0A0E17] flex items-center justify-center shadow-[0_0_30px_rgba(232,121,249,0.4)] ${
                  luckySpinning ? 'animate-spin' : ''
                }`}
              >
                <Sparkles className="w-9 h-9" />
              </div>

              {luckyLoading ? (
                <p className="text-xs text-slate-400">Checking daily spin status...</p>
              ) : luckyTodayEntry ? (
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">
                    Today&apos;s Result ({luckyTodayEntry.draw_date_pkt} PKT)
                  </div>
                  <div className="font-display text-2xl font-extrabold text-[#FACC15]">
                    {luckyTodayEntry.prize_label}
                  </div>
                  <p className="text-xs text-slate-400">
                    {luckyTodayEntry.prize_amount > 0
                      ? `${formatPKR(luckyTodayEntry.prize_amount)} was credited directly to your wallet.`
                      : 'Come back after 12:00 AM PKT for your next free spin!'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="font-display text-xl font-extrabold text-white">
                    Win up to PKR 50 Daily!
                  </div>
                  <p className="text-xs text-slate-400">
                    One free spin every day (resets at 12:00 AM PKT). Rewards go straight to your wallet.
                  </p>
                </div>
              )}

              <button
                type="button"
                disabled={luckyLoading || !luckyCanSpin || luckySpinning}
                onClick={handleSpinLuckyDraw}
                className="ff-btn-lucky w-full min-h-[48px] rounded-xl font-display font-extrabold text-sm disabled:opacity-50"
              >
                {luckySpinning
                  ? 'Spinning...'
                  : luckyCanSpin
                    ? 'Spin Free Lucky Draw'
                    : 'Already Claimed Today'}
              </button>
            </div>

            {luckyRecent.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Recent Spins
                </div>
                <div className="divide-y divide-white/[0.06] bg-[#0D1320] border border-white/[0.08] rounded-xl px-3.5">
                  {luckyRecent.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="py-2.5 flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-300">{item.prize_label}</span>
                      <span className="font-mono font-bold text-[#FACC15]">
                        {item.draw_date_pkt}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sign In / Sign Up / Admin Modal */}
      {showAuthModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowAuthModal(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md my-auto">
            <AuthView
              onSuccess={handleAuthSuccess}
              onClose={() => setShowAuthModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

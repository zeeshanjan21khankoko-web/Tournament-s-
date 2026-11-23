import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Flame,
  Home,
  Shield,
  Swords,
  Trophy,
  User,
  Wallet,
} from 'lucide-react';
import { ApiError, apiRequest, computeTournamentStatus, formatPKR } from './lib/api';
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
  | 'tournaments'
  | 'leaderboard'
  | 'wallet'
  | 'profile'
  | 'admin';

const TAB_TO_PATH: Record<ActiveTab, string> = {
  home: '/',
  tournaments: '/tournaments',
  leaderboard: '/leaderboard',
  wallet: '/wallet',
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

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [videos, setVideos] = useState<YouTubeVideoRecord[]>([]);
  const [topLeaderboard, setTopLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [selectedMode, setSelectedMode] = useState<'all' | 'Battle Royale' | 'Clash Squad' | 'Lone Wolf'>('all');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [wallet, setWallet] = useState<WalletAccount | null>(null);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [winnings, setWinnings] = useState<WinningRecord[]>([]);
  const [walletSubTab, setWalletSubTab] = useState<WalletSubTab>('withdraw');
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
        apiRequest<{ leaderboard: LeaderboardEntry[] }>('/api/leaderboard?period=all').catch(() => null),
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
      // Only clear the active session if the server explicitly rejects credentials (401/403).
      // Transient network errors, offline states, or restarts keep the user signed in.
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
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenWallet = (subTab: WalletSubTab = 'withdraw') => {
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

  const desktopNavItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'tournaments', label: 'Tournaments', icon: Swords },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'profile', label: 'Profile', icon: User },
  ];
  if (user?.role === 'admin') {
    desktopNavItems.push({ id: 'admin', label: 'Admin', icon: Shield });
  }

  const mobileNavItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'tournaments', label: 'Tournaments', icon: Swords },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
  ];

  return (
    <div className="min-h-screen bg-transparent text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 h-14 lg:h-16 bg-[#04110A]/94 backdrop-blur-md border-b border-[#22C55E]/30">
        <div className="max-w-7xl mx-auto h-full px-3.5 sm:px-6 flex items-center justify-between gap-4">
          {/* Zone 1: Prominent Website Name */}
          <button
            type="button"
            onClick={() => handleNavigate('home')}
            className="font-display text-sm sm:text-lg lg:text-xl font-extrabold tracking-tight text-white inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Flame className="w-5 h-5 text-[#FACC15] shrink-0" />
            <span>FREE FIRE TOURNAMENT 09</span>
          </button>

          {/* Zone 2: Clean Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium" aria-label="Main navigation">
            {desktopNavItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-[#FACC15] text-[#FDE047]'
                      : 'border-transparent text-emerald-100/75 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Right Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => handleNavigate('admin')}
                className="lg:hidden min-h-[38px] px-2.5 rounded-xl bg-[#15803D]/35 border border-[#FACC15]/50 text-[#FDE047] text-xs font-bold inline-flex items-center gap-1"
                aria-label="Open Admin Panel"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
            )}
            {user ? (
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => handleNavigate('profile')}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#091D12] border border-[#22C55E]/40 hover:border-[#FACC15] text-xs sm:text-sm font-mono font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 tabular-nums transition-colors"
              >
                <Wallet className="w-3.5 h-3.5 text-[#FACC15]" />
                <span>{formatPKR(user.wallet_balance)}</span>
              </motion.button>
            ) : (
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowAuthModal(true)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl ff-btn-ember text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-all"
              >
                Sign In
              </motion.button>
            )}
          </div>
        </div>
      </header>

      <OfflineIndicator />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6 pb-24 lg:pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
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
      <footer className="hidden lg:block border-t border-[#22C55E]/20 py-6 text-xs text-emerald-100/70">
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
            <span className="text-emerald-300/60">JazzCash · Easypaisa · PKT</span>
          </div>
        </div>
      </footer>

      {/* Mobile Fixed Bottom Thumb Navigation */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#05150C]/95 backdrop-blur-md border-t border-[#22C55E]/30 pb-safe"
      >
        <div className="grid grid-cols-4 h-14 items-center">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  isActive ? 'text-[#FACC15]' : 'text-emerald-100/70 hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#4ADE80]' : ''}`} />
                <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Floating WhatsApp Channel Icon (All Pages, Desktop & Mobile) */}
      <FloatingWhatsAppButton />

      {/* Sign In / Sign Up / First-Run Admin Claim Modal */}
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

import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Home, Shield, Swords, User, Wallet } from 'lucide-react';
import { apiRequest, formatPKR } from './lib/api';
import { loadCachedTournaments, saveCachedTournaments } from './lib/offlineCache';
import { OfflineIndicator } from './components/PWAInstallBanner';
import { AuthView } from './components/AuthView';
import { HomeDashboard } from './components/HomeDashboard';
import { TournamentsView } from './components/TournamentsView';
import { WalletView } from './components/WalletView';
import { ProfileView } from './components/ProfileView';
import { AdminPanel } from './components/AdminPanel';
import type {
  DepositRecord,
  PaymentChannel,
  Tournament,
  TransactionRecord,
  UserProfile,
  WalletAccount,
  WithdrawalRecord,
} from './types';

type ActiveTab = 'home' | 'tournaments' | 'wallet' | 'profile' | 'admin';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);

  const [wallet, setWallet] = useState<WalletAccount | null>(null);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>([]);

  const loadTournaments = useCallback(
    async (authToken: string | null) => {
      try {
        const res = await apiRequest<{ tournaments: Tournament[] }>('/api/tournaments', {
          token: authToken,
        });
        setTournaments(res.tournaments);
        saveCachedTournaments(res.tournaments);
        setSelectedTournament((prev) =>
          prev ? res.tournaments.find((t) => t.id === prev.id) || null : null
        );
      } catch (err) {
        const cached = loadCachedTournaments();
        if (cached.tournaments.length > 0) {
          setTournaments(cached.tournaments);
        }
        console.error('Failed to load tournaments:', err);
      }
    },
    []
  );

  const loadUserAndWallet = useCallback(async (authToken: string | null) => {
    if (!authToken) {
      setWallet(null);
      setDeposits([]);
      setWithdrawals([]);
      setTransactions([]);
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
          paymentChannels: PaymentChannel[];
        }>('/api/wallet', { token: authToken }),
      ]);
      setUser(meRes.user);
      setWallet(walletRes.wallet);
      setDeposits(walletRes.deposits);
      setWithdrawals(walletRes.withdrawals);
      setTransactions(walletRes.transactions);
      setPaymentChannels(walletRes.paymentChannels);
    } catch {
      setToken(null);
      setUser(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadTournaments(token), loadUserAndWallet(token)]);
  }, [loadTournaments, loadUserAndWallet, token]);

  useEffect(() => {
    loadTournaments(token);
  }, [loadTournaments, token]);

  useEffect(() => {
    loadUserAndWallet(token);
  }, [loadUserAndWallet, token]);

  const handleAuthSuccess = (newToken: string, newUser: UserProfile) => {
    setToken(newToken);
    setUser(newUser);
    setShowAuthModal(false);
  };

  const handleLogout = async () => {
    if (token) {
      apiRequest('/api/auth/logout', { method: 'POST', token }).catch(() => {});
    }
    setToken(null);
    setUser(null);
    setWallet(null);
    setDeposits([]);
    setWithdrawals([]);
    setTransactions([]);
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
  };

  const handleSelectTournament = (t: Tournament | null) => {
    setSelectedTournament(t);
    if (t && activeTab === 'home') {
      setActiveTab('tournaments');
    }
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

  const navItems: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'tournaments', label: 'Arena', icon: Swords },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'profile', label: 'Profile', icon: User },
  ];
  if (user?.role === 'admin') {
    navItems.push({ id: 'admin', label: 'Admin', icon: Shield });
  }

  return (
    <div className="min-h-screen bg-[#07080D] text-slate-100 flex flex-col">
      {/* Top Bar (3-zone contract on desktop, compact 54px bar on mobile) */}
      <header className="sticky top-0 z-40 h-14 lg:h-16 bg-[#07080D]/90 backdrop-blur-md border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Title */}
          <button
            type="button"
            onClick={() => handleNavigate('home')}
            className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Pro Tournament
          </button>

          {/* Zone 2: Concise single-line desktop nav */}
          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-[#00D4FF] text-white'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => handleNavigate('wallet')}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#11131E] border border-white/[0.12] hover:border-[#00D4FF]/60 text-xs sm:text-sm font-mono font-semibold text-white inline-flex items-center gap-2 whitespace-nowrap shrink-0 tabular-nums transition-colors"
              >
                <Wallet className="w-4 h-4 text-[#00D4FF]" />
                <span>{formatPKR(user.wallet_balance)}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAuthModal(true)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#00D4FF] hover:bg-[#33DDFF] text-[#07080D] text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors"
              >
                Sign In
              </button>
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
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === 'home' && (
              <HomeDashboard
                user={user}
                tournaments={tournaments}
                transactions={transactions}
                onSelectTournament={handleSelectTournament}
                onNavigate={handleNavigate}
                onOpenAuth={() => setShowAuthModal(true)}
              />
            )}

            {activeTab === 'tournaments' && (
              <TournamentsView
                tournaments={tournaments}
                user={user}
                selectedTournament={selectedTournament}
                onSelectTournament={setSelectedTournament}
                onJoinTournament={handleJoinTournament}
                onOpenAuth={() => setShowAuthModal(true)}
              />
            )}

            {activeTab === 'wallet' && user && token && (
              <WalletView
                token={token}
                wallet={wallet}
                deposits={deposits}
                withdrawals={withdrawals}
                transactions={transactions}
                paymentChannels={paymentChannels}
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
                tournaments={tournaments}
                onRefreshPublic={refreshAll}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Desktop Footer */}
      <footer className="hidden lg:block border-t border-white/[0.06] py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <span>Pro Tournament Esports Platform</span>
          <span>Verified PKR Payments · JazzCash · Easypaisa</span>
        </div>
      </footer>

      {/* Mobile Fixed Bottom Thumb Navigation (< 15% viewport height combined with header) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0A0B12]/95 backdrop-blur-md border-t border-white/[0.08] pb-safe"
      >
        <div
          className={`grid h-14 items-center ${
            navItems.length === 5 ? 'grid-cols-5' : 'grid-cols-4'
          }`}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  isActive ? 'text-[#00D4FF]' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

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

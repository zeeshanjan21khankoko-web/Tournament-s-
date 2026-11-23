import React, { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ShieldCheck,
  Smartphone,
  Trophy,
  Upload,
  Wallet,
  XCircle,
} from 'lucide-react';
import { apiRequest, formatPKR, formatShortDate, readImageFileAsDataUrl } from '../lib/api';
import { getPreferredPayMethod, setPreferredPayMethod } from '../lib/offlineCache';
import type {
  DepositRecord,
  PaymentChannel,
  TransactionRecord,
  WalletAccount,
  WinningRecord,
  WithdrawalRecord,
} from '../types';

export type WalletSubTab = 'withdraw' | 'winnings' | 'deposit' | 'history';

interface WalletViewProps {
  token: string;
  wallet: WalletAccount | null;
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  transactions: TransactionRecord[];
  winnings: WinningRecord[];
  paymentChannels: PaymentChannel[];
  initialTab?: WalletSubTab;
  onRefresh: () => Promise<void>;
}

export const WalletView: React.FC<WalletViewProps> = ({
  token,
  wallet,
  deposits,
  withdrawals,
  transactions,
  winnings,
  paymentChannels,
  initialTab = 'withdraw',
  onRefresh,
}) => {
  const [subTab, setSubTab] = useState<WalletSubTab>(initialTab);

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  // Deposit state (JazzCash / Easypaisa only)
  const [depMethod, setDepMethod] = useState<'jazzcash' | 'easypaisa'>(() =>
    getPreferredPayMethod()
  );
  const [depAmount, setDepAmount] = useState('');
  const [senderAccount, setSenderAccount] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [screenshotData, setScreenshotData] = useState('');
  const [depLoading, setDepLoading] = useState(false);
  const [depError, setDepError] = useState('');
  const [depSuccess, setDepSuccess] = useState('');

  // Withdraw state (Easypaisa / JazzCash / Bank Account)
  const [wdMethod, setWdMethod] = useState<'easypaisa' | 'jazzcash' | 'bank_account'>('easypaisa');
  const [bankName, setBankName] = useState('');
  const [wdAmount, setWdAmount] = useState('');
  const [accountTitle, setAccountTitle] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [wdLoading, setWdLoading] = useState(false);
  const [wdError, setWdError] = useState('');
  const [wdSuccess, setWdSuccess] = useState('');

  const [copiedId, setCopiedId] = useState('');

  const activeChannel =
    paymentChannels.find((c) => c.id === depMethod) || paymentChannels[0];

  const totalBalance = wallet?.available_balance ?? 0;
  const pendingWithdrawal = wallet?.pending_withdrawal ?? 0;
  const spendableBalance = Math.max(0, totalBalance - pendingWithdrawal);
  const parsedWdAmount = Number(wdAmount) || 0;
  const exceedsBalance = parsedWdAmount > spendableBalance;

  const handleCopy = (value: string, key: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedId(key);
    setTimeout(() => setCopiedId(''), 1500);
  };

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setDepError('');
      const dataUrl = await readImageFileAsDataUrl(file, 1.8 * 1024 * 1024);
      setScreenshotData(dataUrl);
    } catch (err) {
      setDepError(err instanceof Error ? err.message : 'Invalid screenshot file.');
    }
  };

  const submitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDepError('');
    setDepSuccess('');
    setDepLoading(true);
    try {
      await apiRequest('/api/wallet/deposit', {
        method: 'POST',
        token,
        body: {
          amount: Math.floor(Number(depAmount)),
          method: depMethod,
          transactionRef,
          senderAccount,
          screenshotData,
        },
      });
      setDepSuccess('Deposit request submitted. An admin will verify your TID and credit your wallet.');
      setDepAmount('');
      setTransactionRef('');
      setSenderAccount('');
      setScreenshotData('');
      await onRefresh();
    } catch (err) {
      setDepError(err instanceof Error ? err.message : 'Deposit submission failed.');
    } finally {
      setDepLoading(false);
    }
  };

  const submitWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setWdError('');
    setWdSuccess('');
    if (parsedWdAmount > spendableBalance) {
      setWdError('Withdrawal amount exceeds your unreserved available balance.');
      return;
    }
    setWdLoading(true);
    try {
      const res = await apiRequest<{ message?: string }>('/api/wallet/withdraw', {
        method: 'POST',
        token,
        body: {
          amount: Math.floor(Number(wdAmount)),
          method: wdMethod,
          bankName: wdMethod === 'bank_account' ? bankName.trim() : '',
          accountTitle: accountTitle.trim(),
          accountNumber: accountNumber.trim(),
        },
      });
      setWdSuccess(
        res.message ||
          'Withdrawal request sent to admin. Your wallet will be deducted once payment is confirmed as Paid.'
      );
      setWdAmount('');
      setBankName('');
      setAccountTitle('');
      setAccountNumber('');
      await onRefresh();
    } catch (err) {
      setWdError(err instanceof Error ? err.message : 'Withdrawal failed.');
    } finally {
      setWdLoading(false);
    }
  };

  const renderStatus = (
    status: 'pending' | 'approved' | 'paid' | 'rejected' | 'completed'
  ) => {
    if (status === 'paid' || status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#22C55E]/15 text-xs font-semibold text-[#4ADE80]">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="capitalize">{status === 'paid' ? 'Paid' : 'Completed'}</span>
        </span>
      );
    }
    if (status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 text-xs font-semibold text-sky-300">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Approved (Processing Payout)</span>
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 text-xs font-semibold text-rose-400">
          <XCircle className="w-3.5 h-3.5" />
          <span>Rejected</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FACC15]/15 text-xs font-semibold text-[#FACC15]">
        <Clock className="w-3.5 h-3.5" />
        <span>Pending</span>
      </span>
    );
  };

  const formatMethodLabel = (method: WithdrawalRecord['method'], bName?: string) => {
    if (method === 'bank_account') return bName ? `${bName} (Bank)` : 'Bank Account';
    if (method === 'easypaisa') return 'Easypaisa';
    return 'JazzCash';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Winner Wallet &amp; Prize Withdrawals
          </h1>
          <p className="text-sm text-emerald-200/75">
            Track tournament prize winnings, request payouts via Easypaisa, JazzCash, or Bank Account, and inspect every transaction.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#091D12] border border-[#22C55E]/25 rounded-xl overflow-x-auto">
          {(
            [
              { id: 'withdraw', label: 'Withdraw Money' },
              { id: 'winnings', label: `Winnings (${winnings.length})` },
              { id: 'deposit', label: 'Deposit' },
              { id: 'history', label: 'Transactions' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`min-h-[42px] px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                subTab === t.id
                  ? 'bg-gradient-to-r from-[#22C55E] to-[#FACC15] text-[#04110A]'
                  : 'text-emerald-100/80 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Balance Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#091D12] border border-[#FACC15]/40 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-emerald-200/75 mb-1.5">
            <span>Total Wallet Balance</span>
            <Wallet className="w-4 h-4 text-[#FACC15]" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
            {formatPKR(totalBalance)}
          </div>
          {pendingWithdrawal > 0 && (
            <div className="text-[11px] text-emerald-200/75 mt-1 font-mono">
              Withdrawable: {formatPKR(spendableBalance)}
            </div>
          )}
        </div>

        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-emerald-200/75 mb-1.5">
            <span>Total Prize Winnings</span>
            <Trophy className="w-4 h-4 text-[#FACC15]" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-[#FACC15] tabular-nums">
            {formatPKR(wallet?.total_won)}
          </div>
        </div>

        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-emerald-200/75 mb-1.5">Pending Payouts</div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-[#FDE047] tabular-nums">
            {formatPKR(pendingWithdrawal)}
          </div>
        </div>

        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-emerald-200/75 mb-1.5">Total Paid Withdrawals</div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-[#4ADE80] tabular-nums">
            {formatPKR(wallet?.total_withdrawn)}
          </div>
        </div>
      </div>

      {/* WITHDRAW MONEY TAB */}
      {subTab === 'withdraw' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h2 className="font-display text-lg font-bold text-white">
                Withdraw Prize Money
              </h2>
              <span className="text-xs font-mono text-[#FACC15]">
                Available: {formatPKR(spendableBalance)}
              </span>
            </div>
            <p className="text-xs text-emerald-200/75 mb-5">
              Minimum PKR 200. Requests stay Pending/Approved until an admin confirms payment and deducts the amount as Paid.
            </p>

            {wdError && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                {wdError}
              </div>
            )}
            {wdSuccess && (
              <div className="mb-4 p-3.5 rounded-xl bg-[#FACC15]/10 border border-[#FACC15]/35 text-[#FDE047] text-sm">
                {wdSuccess}
              </div>
            )}

            <form onSubmit={submitWithdrawal} className="space-y-4">
              <div>
                <span className="block text-xs font-medium text-emerald-100/85 mb-1.5">
                  Select Withdrawal Method
                </span>
                <div className="grid grid-cols-3 gap-2.5">
                  {(
                    [
                      { id: 'easypaisa', label: 'Easypaisa', icon: Smartphone },
                      { id: 'jazzcash', label: 'JazzCash', icon: Smartphone },
                      { id: 'bank_account', label: 'Bank Account', icon: Building2 },
                    ] as const
                  ).map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setWdMethod(m.id)}
                        className={`min-h-[46px] px-2.5 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          wdMethod === m.id
                            ? 'bg-[#15803D]/35 border-[#FACC15] text-white'
                            : 'bg-[#05130B] border-[#22C55E]/25 text-emerald-100/80 hover:border-[#4ADE80]/60'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
                        <span className="truncate">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {wdMethod === 'bank_account' && (
                <div>
                  <label className="block text-xs font-medium text-emerald-100/85 mb-1.5">
                    Bank Name *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={64}
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. HBL, Meezan Bank, UBL, Allied Bank"
                    className="w-full min-h-[44px] px-3.5 py-2 bg-[#05130B] border border-[#22C55E]/25 rounded-xl text-sm text-white placeholder:text-emerald-200/40 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-emerald-100/85 mb-1.5">
                    Account Holder Name *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={64}
                    value={accountTitle}
                    onChange={(e) => setAccountTitle(e.target.value)}
                    placeholder="Full name on account"
                    className="w-full min-h-[44px] px-3.5 py-2 bg-[#05130B] border border-[#22C55E]/25 rounded-xl text-sm text-white placeholder:text-emerald-200/40 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-emerald-100/85 mb-1.5">
                    {wdMethod === 'bank_account'
                      ? 'Bank Account Number / IBAN *'
                      : `${wdMethod === 'easypaisa' ? 'Easypaisa' : 'JazzCash'} Number *`}
                  </label>
                  <input
                    type="text"
                    required
                    minLength={wdMethod === 'bank_account' ? 8 : 6}
                    maxLength={wdMethod === 'bank_account' ? 34 : 20}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder={
                      wdMethod === 'bank_account'
                        ? 'PKXX XXXX XXXX XXXX'
                        : '03XX-XXXXXXX'
                    }
                    className="w-full min-h-[44px] px-3.5 py-2 bg-[#05130B] border border-[#22C55E]/25 rounded-xl font-mono text-sm text-white placeholder:text-emerald-200/40 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <label className="font-medium text-emerald-100/85">Withdrawal Amount (PKR) *</label>
                  <span className="font-mono text-emerald-200/75">
                    Max: {formatPKR(spendableBalance)}
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min={200}
                  max={Math.max(200, spendableBalance)}
                  value={wdAmount}
                  onChange={(e) => setWdAmount(e.target.value)}
                  placeholder="Minimum 200"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-[#05130B] border border-[#22C55E]/25 rounded-xl font-mono text-sm text-white placeholder:text-emerald-200/40 focus:outline-none focus:border-[#FACC15]"
                />
                {exceedsBalance && (
                  <p className="text-xs text-rose-400 mt-1">
                    Amount exceeds your available unreserved balance ({formatPKR(spendableBalance)}).
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={wdLoading || exceedsBalance || spendableBalance < 200}
                className="ff-btn-ember w-full min-h-[48px] px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50"
              >
                {wdLoading ? 'Submitting Withdrawal...' : 'Withdraw Money'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-5 sm:p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-white">
              Withdrawal Requests ({withdrawals.length})
            </h3>
            {withdrawals.length === 0 ? (
              <p className="text-sm text-emerald-200/75">No withdrawal requests submitted yet.</p>
            ) : (
              <div className="divide-y divide-[#22C55E]/15 max-h-[460px] overflow-y-auto">
                {withdrawals.map((w) => (
                  <div key={w.id} className="py-3.5 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-bold text-white font-mono">
                        {formatPKR(w.amount)}
                        <span className="font-sans font-medium text-xs text-[#FACC15] ml-2">
                          {formatMethodLabel(w.method, w.bank_name)}
                        </span>
                      </div>
                      {renderStatus(w.status)}
                    </div>
                    <div className="text-xs text-emerald-100/85">
                      {w.account_title} · <span className="font-mono">{w.account_number}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-emerald-200/70">
                      <span>{formatShortDate(w.created_at)}</span>
                      {w.admin_note && <span className="truncate max-w-[60%]">{w.admin_note}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* WINNING HISTORY TAB */}
      {subTab === 'winnings' && (
        <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[#FACC15]" />
                <span>Tournament Winning History ({winnings.length})</span>
              </h2>
              <p className="text-xs text-emerald-200/75 mt-0.5">
                Verified Booyah placements and prize payouts credited to your personal wallet
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSubTab('withdraw')}
              className="min-h-[42px] px-4 py-2 rounded-xl ff-btn-ember text-xs font-bold whitespace-nowrap"
            >
              Withdraw Money
            </button>
          </div>

          {winnings.length === 0 ? (
            <div className="py-8 text-center space-y-2 border-t border-[#22C55E]/15">
              <Trophy className="w-8 h-8 text-[#FACC15] mx-auto opacity-85" />
              <p className="text-sm text-white font-medium">No tournament winnings recorded yet</p>
              <p className="text-xs text-emerald-200/75">
                When an admin declares you a tournament winner, your prize money is automatically added to your wallet and listed here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#22C55E]/15">
              {winnings.map((win) => {
                const rankBadge =
                  win.placement === 1
                    ? {
                        emoji: '🏆',
                        label: '1st Winner',
                        boxClass: 'bg-[#FACC15]/15 border-[#FACC15]/55 text-[#FACC15]',
                      }
                    : win.placement === 2
                      ? {
                          emoji: '🥈',
                          label: '2nd Winner',
                          boxClass: 'bg-slate-300/15 border-slate-300/45 text-slate-100',
                        }
                      : win.placement === 3
                        ? {
                            emoji: '🥉',
                            label: '3rd Winner',
                            boxClass: 'bg-amber-500/15 border-amber-500/45 text-amber-300',
                          }
                        : {
                            emoji: '🏅',
                            label: `#${win.placement} Place`,
                            boxClass: 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#4ADE80]',
                          };
                return (
                  <div
                    key={win.id}
                    className="py-3.5 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-xl border font-mono font-bold text-xs flex flex-col items-center justify-center shrink-0 ${rankBadge.boxClass}`}
                      >
                        <span className="text-sm leading-none" aria-hidden="true">
                          {rankBadge.emoji}
                        </span>
                        <span className="text-[10px] mt-0.5 leading-none">
                          #{win.placement}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-white truncate">
                            {win.tournament_title}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${rankBadge.boxClass}`}
                          >
                            {rankBadge.label}
                          </span>
                        </div>
                        <div className="text-xs text-emerald-200/75 mt-0.5">
                          {win.tournament_mode} · Awarded {formatShortDate(win.declared_at)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-sm sm:text-base font-bold text-[#4ADE80] tabular-nums">
                        +{formatPKR(win.prize_amount)}
                      </div>
                      <div className="text-[11px] text-[#FACC15]">Credited to Wallet</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* DEPOSIT TAB */}
      {subTab === 'deposit' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                1. Choose Payment Method
              </h2>
              <p className="text-xs text-emerald-200/75 mt-0.5">
                Send your deposit to our verified Pakistani account below.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { id: 'jazzcash', label: 'JazzCash', icon: Smartphone },
                  { id: 'easypaisa', label: 'Easypaisa', icon: Smartphone },
                ] as const
              ).map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setDepMethod(m.id);
                      setPreferredPayMethod(m.id);
                    }}
                    className={`min-h-[48px] px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                      depMethod === m.id
                        ? 'bg-[#15803D]/35 border-[#FACC15] text-white'
                        : 'bg-[#05130B] border-[#22C55E]/25 text-emerald-100/80 hover:border-[#4ADE80]/60'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-[#FACC15]" />
                    <span className="whitespace-nowrap">{m.label}</span>
                  </button>
                );
              })}
            </div>

            {activeChannel && (
              <div className="bg-[#05130B] border border-[#22C55E]/25 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs text-emerald-200/75">{activeChannel.providerLabel}</div>
                    <div className="text-sm font-semibold text-white">
                      {activeChannel.accountTitle}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-[#091D12] border border-[#22C55E]/25">
                  <span className="font-mono text-sm font-semibold text-[#FACC15] truncate">
                    {activeChannel.accountNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(activeChannel.accountNumber, activeChannel.id)}
                    className="min-h-[44px] px-3 rounded-lg bg-[#22C55E]/15 hover:bg-[#22C55E]/25 text-xs font-medium text-white inline-flex items-center gap-1 shrink-0"
                  >
                    {copiedId === activeChannel.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#4ADE80]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <ol className="space-y-1.5 text-xs text-emerald-100/85 list-decimal list-inside leading-relaxed">
                  {activeChannel.instructions.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <div className="lg:col-span-7 bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-white mb-1">
              2. Submit Payment Proof
            </h2>
            <p className="text-xs text-emerald-200/75 mb-5">
              Duplicate Transaction IDs are automatically blocked. Admin verifies receipts before adding funds.
            </p>

            {depError && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                {depError}
              </div>
            )}
            {depSuccess && (
              <div className="mb-4 p-3.5 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#4ADE80] text-sm">
                {depSuccess}
              </div>
            )}

            <form onSubmit={submitDeposit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-emerald-100/85 mb-1.5">
                    Amount Sent (PKR)
                  </label>
                  <input
                    type="number"
                    required
                    min={100}
                    max={500000}
                    value={depAmount}
                    onChange={(e) => setDepAmount(e.target.value)}
                    placeholder="Minimum 100"
                    className="w-full min-h-[44px] px-3.5 py-2 bg-[#05130B] border border-[#22C55E]/25 rounded-xl font-mono text-sm text-white placeholder:text-emerald-200/40 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-emerald-100/85 mb-1.5">
                    Sender Mobile / Account No.
                  </label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={senderAccount}
                    onChange={(e) => setSenderAccount(e.target.value)}
                    placeholder="e.g. 0301-1234567"
                    className="w-full min-h-[44px] px-3.5 py-2 bg-[#05130B] border border-[#22C55E]/25 rounded-xl text-sm text-white placeholder:text-emerald-200/40 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-emerald-100/85 mb-1.5">
                  Transaction ID (TID / Reference Code)
                </label>
                <input
                  type="text"
                  required
                  minLength={4}
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value.toUpperCase())}
                  placeholder="e.g. TID-98432104"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-[#05130B] border border-[#22C55E]/25 rounded-xl font-mono text-sm text-white placeholder:text-emerald-200/40 focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-emerald-100/85 mb-1.5">
                  Payment Receipt Screenshot
                </label>
                <label className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border border-dashed border-[#22C55E]/35 hover:border-[#FACC15] bg-[#05130B] cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <Upload className="w-5 h-5 text-[#FACC15] shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-white">
                        {screenshotData ? 'Screenshot attached' : 'Tap to upload screenshot'}
                      </div>
                      <div className="text-xs text-emerald-200/70">PNG, JPG, or WEBP up to 1.8 MB</div>
                    </div>
                  </div>
                  {screenshotData && (
                    <img
                      src={screenshotData}
                      alt="Receipt preview"
                      className="w-16 h-16 rounded-lg object-cover border border-[#22C55E]/30"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleScreenshotUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={depLoading}
                className="ff-btn-ember w-full min-h-[46px] px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60"
              >
                {depLoading ? 'Submitting Request...' : 'Submit Deposit Request'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TRANSACTIONS & REQUEST HISTORY TAB */}
      {subTab === 'history' && (
        <div className="space-y-6">
          <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-5 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-white">
              Deposit Requests ({deposits.length})
            </h2>
            {deposits.length === 0 ? (
              <p className="text-sm text-emerald-200/75">No deposit requests yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#22C55E]/20 text-xs text-emerald-200/75">
                      <th className="py-2.5 pr-4 font-medium">Method</th>
                      <th className="py-2.5 pr-4 font-medium">TID</th>
                      <th className="py-2.5 pr-4 font-medium">Amount</th>
                      <th className="py-2.5 pr-4 font-medium">Status</th>
                      <th className="py-2.5 font-medium text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#22C55E]/15 text-sm">
                    {deposits.map((d) => (
                      <tr key={d.id}>
                        <td className="py-3 pr-4 capitalize text-emerald-100">
                          {d.method.replace('_', ' ')}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-emerald-100/85">
                          {d.transaction_ref}
                        </td>
                        <td className="py-3 pr-4 font-mono font-semibold text-white tabular-nums">
                          {formatPKR(d.amount)}
                        </td>
                        <td className="py-3 pr-4">{renderStatus(d.status)}</td>
                        <td className="py-3 text-right text-xs text-emerald-200/70 whitespace-nowrap">
                          {formatShortDate(d.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-[#091D12] border border-[#22C55E]/25 rounded-2xl p-5 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-white">
              Complete Transaction History ({transactions.length})
            </h2>
            {transactions.length === 0 ? (
              <p className="text-sm text-emerald-200/75">No transactions recorded yet.</p>
            ) : (
              <div className="divide-y divide-[#22C55E]/15">
                {transactions.map((tx) => (
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
                        <div className="text-sm font-medium text-white truncate">
                          {tx.description}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-200/75 mt-0.5">
                          <span className="font-mono">{tx.tx_code}</span>
                          <span aria-hidden="true">·</span>
                          {renderStatus(tx.status)}
                          <span aria-hidden="true">·</span>
                          <span>{formatShortDate(tx.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`font-mono text-sm font-bold tabular-nums ${
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
          </div>
        </div>
      )}
    </div>
  );
};

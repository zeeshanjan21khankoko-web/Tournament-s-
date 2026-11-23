import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Award,
  Building2,
  Check,
  Copy,
  Gift,
  List,
  Send,
  Smartphone,
  Swords,
  Trophy,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import {
  apiRequest,
  formatPKR,
  formatRelativeAgo,
  formatRs,
  formatShortDate,
  readImageFileAsDataUrl,
} from '../lib/api';
import { getPreferredPayMethod, setPreferredPayMethod } from '../lib/offlineCache';
import type {
  DepositRecord,
  PaymentChannel,
  TransactionRecord,
  WalletAccount,
  WinningRecord,
  WithdrawalRecord,
} from '../types';

export type WalletSubTab = 'withdraw' | 'winnings' | 'deposit' | 'history' | 'transfer';

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

type HistoryFilter = 'all' | 'deposit' | 'withdraw';

export const WalletView: React.FC<WalletViewProps> = ({
  token,
  wallet,
  deposits,
  withdrawals,
  transactions,
  winnings,
  paymentChannels,
  initialTab = 'history',
  onRefresh,
}) => {
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [activeModal, setActiveModal] = useState<'deposit' | 'withdraw' | 'transfer' | 'winnings' | null>(
    initialTab === 'deposit' || initialTab === 'withdraw' || initialTab === 'winnings' || initialTab === 'transfer'
      ? null
      : null
  );

  // Sync if caller explicitly opens a wallet sub-action from Home cards
  useEffect(() => {
    if (initialTab === 'deposit' || initialTab === 'withdraw' || initialTab === 'winnings' || initialTab === 'transfer') {
      setActiveModal(initialTab);
    } else {
      setActiveModal(null);
    }
  }, [initialTab]);

  // Deposit state
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

  // Withdraw state
  const [wdMethod, setWdMethod] = useState<'easypaisa' | 'jazzcash' | 'bank_account'>('easypaisa');
  const [bankName, setBankName] = useState('');
  const [wdAmount, setWdAmount] = useState('');
  const [accountTitle, setAccountTitle] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [wdLoading, setWdLoading] = useState(false);
  const [wdError, setWdError] = useState('');
  const [wdSuccess, setWdSuccess] = useState('');

  // Send to Friend state
  const [xferRecipient, setXferRecipient] = useState('');
  const [xferAmount, setXferAmount] = useState('');
  const [xferNote, setXferNote] = useState('');
  const [xferLoading, setXferLoading] = useState(false);
  const [xferError, setXferError] = useState('');
  const [xferSuccess, setXferSuccess] = useState('');

  const [copiedId, setCopiedId] = useState('');

  const activeChannel =
    paymentChannels.find((c) => c.id === depMethod) || paymentChannels[0];

  const totalBalance = wallet?.available_balance ?? 0;
  const pendingWithdrawal = wallet?.pending_withdrawal ?? 0;
  const spendableBalance = Math.max(0, totalBalance - pendingWithdrawal);
  const parsedWdAmount = Number(wdAmount) || 0;
  const exceedsBalance = parsedWdAmount > spendableBalance;

  const approvedCount = useMemo(() => {
    const depApp = deposits.filter((d) => d.status === 'approved').length;
    const wdPaid = withdrawals.filter((w) => w.status === 'paid' || w.status === 'approved').length;
    return depApp + wdPaid;
  }, [deposits, withdrawals]);

  // Unified transaction history feed merging deposit/withdrawal requests & ledger entries
  const historyRows = useMemo(() => {
    type UnifiedRow = {
      id: string;
      kind: 'deposit' | 'withdraw' | 'other';
      title: string;
      amount: number;
      isCredit: boolean;
      status: string;
      createdAt: string;
      subtitle: string;
      method: string;
    };

    const items: UnifiedRow[] = [];

    transactions.forEach((tx) => {
      const lowerDesc = (tx.description || '').toLowerCase();
      let kind: 'deposit' | 'withdraw' | 'other' = 'other';
      if (tx.type === 'deposit') kind = 'deposit';
      else if (tx.type === 'withdrawal') kind = 'withdraw';

      let title = tx.description || tx.type.replace('_', ' ');
      let method: string = tx.type;
      if (tx.type === 'deposit') {
        if (lowerDesc.includes('easypaisa')) {
          title = 'EASYPAISA';
          method = 'easypaisa';
        } else if (lowerDesc.includes('jazzcash')) {
          title = 'JAZZCASH';
          method = 'jazzcash';
        } else {
          title = 'DEPOSIT';
        }
      } else if (tx.type === 'withdrawal') {
        if (lowerDesc.includes('easypaisa')) {
          title = 'EASYPAISA';
          method = 'easypaisa';
        } else if (lowerDesc.includes('jazzcash')) {
          title = 'JAZZCASH';
          method = 'jazzcash';
        } else {
          title = 'WITHDRAWAL';
        }
      } else if (tx.type === 'prize_win') {
        title = 'PRIZE CREDIT';
      } else if (tx.type === 'transfer_out') {
        title = 'SENT TO FRIEND';
      } else if (tx.type === 'transfer_in') {
        title = 'RECEIVED FROM FRIEND';
      } else if (tx.type === 'lucky_draw') {
        title = 'LUCKY DRAW';
      } else if (tx.type === 'entry_fee') {
        title = 'MATCH ENTRY';
      } else {
        title = title.toUpperCase();
      }

      const displayStatus =
        tx.status === 'completed' && tx.type === 'deposit'
          ? 'APPROVED'
          : tx.status.toUpperCase();

      items.push({
        id: `tx-${tx.id}`,
        kind,
        title,
        amount: tx.amount,
        isCredit: tx.direction === 'credit',
        status: displayStatus,
        createdAt: tx.created_at,
        subtitle: formatRelativeAgo(tx.created_at),
        method,
      });
    });

    // Also include pending or rejected deposit/withdrawal requests so users see request status immediately
    deposits
      .filter((d) => d.status !== 'approved')
      .forEach((d) => {
        items.push({
          id: `dep-${d.id}`,
          kind: 'deposit',
          title: d.method.toUpperCase(),
          amount: d.amount,
          isCredit: true,
          status: d.status.toUpperCase(),
          createdAt: d.created_at,
          subtitle: `${formatRelativeAgo(d.created_at)} · TID ${d.transaction_ref}`,
          method: d.method,
        });
      });

    withdrawals
      .filter((w) => w.status !== 'paid')
      .forEach((w) => {
        items.push({
          id: `wd-${w.id}`,
          kind: 'withdraw',
          title: w.method === 'bank_account' ? (w.bank_name || 'BANK').toUpperCase() : w.method.toUpperCase(),
          amount: w.amount,
          isCredit: false,
          status: w.status.toUpperCase(),
          createdAt: w.created_at,
          subtitle: `${formatRelativeAgo(w.created_at)} · ${w.account_number}`,
          method: w.method,
        });
      });

    items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    if (historyFilter === 'all') return items;
    return items.filter((item) => item.kind === historyFilter);
  }, [transactions, deposits, withdrawals, historyFilter]);

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
      setDepSuccess('Deposit request submitted. Admin will verify your TID and credit your wallet.');
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
      setWdError('Withdrawal amount exceeds your available balance.');
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
      setWdSuccess(res.message || 'Withdrawal request submitted.');
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

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setXferError('');
    setXferSuccess('');
    setXferLoading(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/wallet/transfer', {
        method: 'POST',
        token,
        body: {
          recipientIdentifier: xferRecipient.trim(),
          amount: Math.floor(Number(xferAmount)),
          note: xferNote.trim(),
        },
      });
      setXferSuccess(res.message || 'Funds sent to friend successfully.');
      setXferRecipient('');
      setXferAmount('');
      setXferNote('');
      await onRefresh();
    } catch (err) {
      setXferError(err instanceof Error ? err.message : 'Transfer failed.');
    } finally {
      setXferLoading(false);
    }
  };

  const getStatusChipClass = (status: string) => {
    if (['APPROVED', 'PAID', 'COMPLETED'].includes(status)) {
      return 'border-[#22C55E]/50 text-[#4ADE80] bg-[#22C55E]/10';
    }
    if (status === 'REJECTED') {
      return 'border-rose-500/50 text-rose-400 bg-rose-500/10';
    }
    return 'border-[#FACC15]/50 text-[#FACC15] bg-[#FACC15]/10';
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 1. Hero Golden Gradient Available Balance Card (Matches Screenshot 3) */}
      <section className="ff-gold-gradient-card border border-[#FACC15]/25 rounded-3xl p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] text-[#FACC15]/80">
              <span className="w-4 h-px bg-[#FACC15]/40 inline-block" />
              <span>AVAILABLE BALANCE</span>
              <span className="w-4 h-px bg-[#FACC15]/40 inline-block" />
            </div>
            <div className="font-display text-3xl sm:text-4xl font-extrabold text-[#FACC15] tabular-nums tracking-tight">
              {formatRs(totalBalance)}
            </div>
            <div className="text-xs text-slate-400">
              {pendingWithdrawal > 0
                ? `Withdrawable: ${formatRs(spendableBalance)} · Pending: ${formatRs(pendingWithdrawal)}`
                : 'Updated just now'}
            </div>
          </div>

          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#FACC15]/15 border border-[#FACC15]/25 flex items-center justify-center text-[#FACC15] shrink-0">
            <Wallet className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <button
            type="button"
            onClick={() => {
              setDepError('');
              setDepSuccess('');
              setActiveModal('deposit');
            }}
            className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] text-[#0A0E17] font-display text-sm font-extrabold inline-flex items-center justify-center gap-2 shadow-[0_8px_22px_rgba(250,204,21,0.3)] transition-all active:scale-[0.98]"
          >
            <span className="w-5 h-5 rounded-full bg-[#0A0E17] text-[#FACC15] flex items-center justify-center">
              <ArrowDown className="w-3 h-3" />
            </span>
            <span>Deposit</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setWdError('');
              setWdSuccess('');
              setActiveModal('withdraw');
            }}
            className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#131A29]/90 hover:bg-[#192235] border border-white/[0.14] text-[#FACC15] font-display text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <span className="w-5 h-5 rounded-full bg-[#FACC15] text-[#0A0E17] flex items-center justify-center">
              <ArrowUp className="w-3 h-3" />
            </span>
            <span>Withdraw</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setXferError('');
            setXferSuccess('');
            setActiveModal('transfer');
          }}
          className="mt-3 w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#131A29]/80 hover:bg-[#192235] border border-white/[0.12] text-[#FACC15] font-display text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        >
          <Send className="w-4 h-4" />
          <span>Send to Friend</span>
        </button>
      </section>

      {/* 2. 3-Column Wallet Stats Row (DEPOSITS / WITHDRAWALS / APPROVED) (Matches Screenshot 3) */}
      <section className="grid grid-cols-3 gap-3">
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-3.5 text-center">
          <div className="font-display text-xl sm:text-2xl font-extrabold text-[#FACC15] tabular-nums">
            {deposits.length}
          </div>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 mt-0.5">
            DEPOSITS
          </div>
        </div>
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-3.5 text-center">
          <div className="font-display text-xl sm:text-2xl font-extrabold text-[#FACC15] tabular-nums">
            {withdrawals.length}
          </div>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 mt-0.5">
            WITHDRAWALS
          </div>
        </div>
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-3.5 text-center">
          <div className="font-display text-xl sm:text-2xl font-extrabold text-[#22C55E] tabular-nums">
            {approvedCount}
          </div>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 mt-0.5">
            APPROVED
          </div>
        </div>
      </section>

      {/* Quick Winnings Banner */}
      <button
        type="button"
        onClick={() => setActiveModal('winnings')}
        className="w-full bg-[#131A29] border border-white/[0.08] hover:border-[#FACC15]/45 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FACC15]/15 text-[#FACC15] flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-xs sm:text-sm font-bold text-white">
              Tournament Winnings ({winnings.length})
            </div>
            <div className="text-[11px] text-slate-400">
              Total Won: {formatRs(wallet?.total_won ?? 0)} · Tap to inspect prize payouts
            </div>
          </div>
        </div>
        <span className="text-xs font-bold text-[#FACC15]">View</span>
      </button>

      {/* 3. Transaction History Section (Matches Screenshot 3) */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold text-white flex items-center gap-2.5">
            <span className="w-1 h-5 rounded-full bg-[#FACC15] inline-block" />
            <span>Transaction History</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono">{historyRows.length} entries</span>
        </div>

        {/* Segmented Filter Bar (All / Deposit / Withdraw) */}
        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-1 grid grid-cols-3 gap-1">
          {(
            [
              { id: 'all', label: 'All', icon: List },
              { id: 'deposit', label: 'Deposit', icon: ArrowDown },
              { id: 'withdraw', label: 'Withdraw', icon: ArrowUp },
            ] as const
          ).map((f) => {
            const Icon = f.icon;
            const active = historyFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setHistoryFilter(f.id)}
                className={`min-h-[40px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all border ${
                  active
                    ? 'bg-[#0D1320] border-[#FACC15]/75 text-[#FACC15]'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>

        {/* Transaction Cards List */}
        {historyRows.length === 0 ? (
          <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-8 text-center text-xs sm:text-sm text-slate-400">
            No {historyFilter === 'all' ? '' : historyFilter} transactions recorded yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {historyRows.map((row) => (
              <div
                key={row.id}
                className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
                      row.method === 'easypaisa'
                        ? 'bg-[#22C55E]/15 border-[#22C55E]/30 text-[#4ADE80]'
                        : row.method === 'jazzcash'
                          ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                          : row.method === 'prize_win'
                            ? 'bg-[#FACC15]/15 border-[#FACC15]/30 text-[#FACC15]'
                            : row.method === 'lucky_draw'
                              ? 'bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-300'
                              : row.method === 'transfer_in' || row.method === 'transfer_out'
                                ? 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                                : 'bg-white/[0.06] border-white/[0.1] text-slate-200'
                    }`}
                  >
                    {row.method === 'prize_win' ? (
                      <Trophy className="w-5 h-5" />
                    ) : row.method === 'lucky_draw' ? (
                      <Gift className="w-5 h-5" />
                    ) : row.method === 'transfer_in' || row.method === 'transfer_out' ? (
                      <Send className="w-4 h-4" />
                    ) : row.method === 'entry_fee' ? (
                      <Swords className="w-5 h-5" />
                    ) : (
                      <Smartphone className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-display text-sm font-extrabold text-white truncate">
                      {row.title}
                    </div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">{row.subtitle}</div>
                  </div>
                </div>

                <div className="text-right shrink-0 space-y-1">
                  <div
                    className={`font-display text-sm font-extrabold tabular-nums ${
                      row.isCredit ? 'text-[#4ADE80]' : 'text-rose-400'
                    }`}
                  >
                    {row.isCredit ? '+' : '-'}
                    {row.amount.toLocaleString('en-PK')} Rs
                  </div>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-md border text-[9px] font-extrabold tracking-wider ${getStatusChipClass(
                      row.status
                    )}`}
                  >
                    {row.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MODAL: DEPOSIT */}
      {activeModal === 'deposit' && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setActiveModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-extrabold text-white">Deposit Funds</h3>
                <p className="text-xs text-slate-400">
                  Send via JazzCash or Easypaisa and upload your TID &amp; receipt screenshot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label="Close deposit modal"
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] text-slate-300 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { id: 'jazzcash', label: 'JazzCash' },
                  { id: 'easypaisa', label: 'Easypaisa' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setDepMethod(m.id);
                    setPreferredPayMethod(m.id);
                  }}
                  className={`min-h-[46px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                    depMethod === m.id
                      ? 'bg-[#FACC15]/15 border-[#FACC15] text-[#FACC15]'
                      : 'bg-[#0D1320] border-white/[0.1] text-slate-300 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            {activeChannel && (
              <div className="bg-[#0D1320] border border-white/[0.08] rounded-xl p-4 space-y-3">
                <div>
                  <div className="text-[11px] text-slate-400">{activeChannel.providerLabel}</div>
                  <div className="text-sm font-bold text-white">{activeChannel.accountTitle}</div>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#131A29] border border-white/[0.08]">
                  <span className="font-mono text-sm font-bold text-[#FACC15] truncate">
                    {activeChannel.accountNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(activeChannel.accountNumber, activeChannel.id)}
                    className="min-h-[36px] px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white inline-flex items-center gap-1 shrink-0"
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
                <ol className="space-y-1 text-xs text-slate-400 list-decimal list-inside">
                  {activeChannel.instructions.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>
            )}

            {depError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {depError}
              </div>
            )}
            {depSuccess && (
              <div className="p-3 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#4ADE80] text-xs">
                {depSuccess}
              </div>
            )}

            <form onSubmit={submitDeposit} className="space-y-3.5">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
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
                    className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Sender Mobile / Account
                  </label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={senderAccount}
                    onChange={(e) => setSenderAccount(e.target.value)}
                    placeholder="03XX-XXXXXXX"
                    className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Transaction ID (TID)
                </label>
                <input
                  type="text"
                  required
                  minLength={4}
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value.toUpperCase())}
                  placeholder="e.g. TID-98432104"
                  className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Payment Receipt Screenshot
                </label>
                <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-dashed border-white/[0.18] hover:border-[#FACC15] bg-[#0D1320] cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Upload className="w-5 h-5 text-[#FACC15] shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {screenshotData ? 'Screenshot attached' : 'Tap to upload screenshot'}
                      </div>
                      <div className="text-[11px] text-slate-400">PNG, JPG, or WEBP up to 1.8 MB</div>
                    </div>
                  </div>
                  {screenshotData && (
                    <img
                      src={screenshotData}
                      alt="Receipt preview"
                      className="w-12 h-12 rounded-lg object-cover border border-white/[0.15]"
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
                className="ff-btn-ember w-full min-h-[46px] rounded-xl font-extrabold text-sm disabled:opacity-60"
              >
                {depLoading ? 'Submitting Request...' : 'Submit Deposit Request'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: WITHDRAW */}
      {activeModal === 'withdraw' && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setActiveModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-extrabold text-white">Withdraw Money</h3>
                <p className="text-xs text-slate-400">
                  Minimum PKR 200 · Spendable: <span className="text-[#FACC15] font-mono">{formatRs(spendableBalance)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label="Close withdraw modal"
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] text-slate-300 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {wdError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {wdError}
              </div>
            )}
            {wdSuccess && (
              <div className="p-3 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#4ADE80] text-xs">
                {wdSuccess}
              </div>
            )}

            <form onSubmit={submitWithdrawal} className="space-y-4">
              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    { id: 'easypaisa', label: 'Easypaisa', icon: Smartphone },
                    { id: 'jazzcash', label: 'JazzCash', icon: Smartphone },
                    { id: 'bank_account', label: 'Bank', icon: Building2 },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setWdMethod(m.id)}
                      className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 ${
                        wdMethod === m.id
                          ? 'bg-[#FACC15]/15 border-[#FACC15] text-[#FACC15]'
                          : 'bg-[#0D1320] border-white/[0.1] text-slate-300'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {wdMethod === 'bank_account' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Bank Name *</label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={64}
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. HBL, Meezan Bank, UBL"
                    className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Account Holder Name *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={64}
                    value={accountTitle}
                    onChange={(e) => setAccountTitle(e.target.value)}
                    placeholder="Full name"
                    className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {wdMethod === 'bank_account'
                      ? 'Account / IBAN *'
                      : `${wdMethod === 'easypaisa' ? 'Easypaisa' : 'JazzCash'} Number *`}
                  </label>
                  <input
                    type="text"
                    required
                    minLength={wdMethod === 'bank_account' ? 8 : 6}
                    maxLength={wdMethod === 'bank_account' ? 34 : 20}
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder={wdMethod === 'bank_account' ? 'PKXX XXXX...' : '03XX-XXXXXXX'}
                    className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label className="font-medium text-slate-300">Withdrawal Amount (PKR) *</label>
                  <span className="font-mono text-slate-400">Max: {formatPKR(spendableBalance)}</span>
                </div>
                <input
                  type="number"
                  required
                  min={200}
                  max={Math.max(200, spendableBalance)}
                  value={wdAmount}
                  onChange={(e) => setWdAmount(e.target.value)}
                  placeholder="Minimum 200"
                  className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                />
                {exceedsBalance && (
                  <p className="text-xs text-rose-400 mt-1">
                    Amount exceeds your available balance ({formatPKR(spendableBalance)}).
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={wdLoading || exceedsBalance || spendableBalance < 200}
                className="ff-btn-ember w-full min-h-[46px] rounded-xl font-extrabold text-sm disabled:opacity-50"
              >
                {wdLoading ? 'Submitting Withdrawal...' : 'Confirm Withdraw Request'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SEND TO FRIEND */}
      {activeModal === 'transfer' && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setActiveModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-[#FACC15]" />
                  <span>Send to Friend</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Instant transfer · Available: <span className="text-[#FACC15] font-mono">{formatRs(spendableBalance)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label="Close transfer modal"
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] text-slate-300 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {xferError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {xferError}
              </div>
            )}
            {xferSuccess && (
              <div className="p-3 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#4ADE80] text-xs">
                {xferSuccess}
              </div>
            )}

            <form onSubmit={submitTransfer} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Friend&apos;s Player ID, Username, or Email *
                </label>
                <input
                  type="text"
                  required
                  value={xferRecipient}
                  onChange={(e) => setXferRecipient(e.target.value)}
                  placeholder="e.g. PT-123456 or friend_username"
                  className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Amount (PKR 10 – PKR 100,000) *
                </label>
                <input
                  type="number"
                  required
                  min={10}
                  max={Math.max(10, spendableBalance)}
                  value={xferAmount}
                  onChange={(e) => setXferAmount(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Note (Optional)
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={xferNote}
                  onChange={(e) => setXferNote(e.target.value)}
                  placeholder="Good luck in the match!"
                  className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
                />
              </div>

              <button
                type="submit"
                disabled={xferLoading || spendableBalance < 10}
                className="ff-btn-ember w-full min-h-[46px] rounded-xl font-extrabold text-sm disabled:opacity-50"
              >
                {xferLoading ? 'Sending...' : 'Send Funds Now'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TOURNAMENT WINNINGS */}
      {activeModal === 'winnings' && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setActiveModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[#FACC15]" />
                <span>Tournament Winnings ({winnings.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label="Close winnings modal"
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] text-slate-300 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {winnings.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Award className="w-10 h-10 text-[#FACC15]/70 mx-auto" />
                <p className="text-sm font-bold text-white">No tournament winnings yet</p>
                <p className="text-xs text-slate-400">
                  Place in the Top 3 of any Free Fire tournament and your prize money is automatically credited here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {winnings.map((win) => (
                  <div key={win.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-10 h-10 rounded-xl bg-[#FACC15]/15 border border-[#FACC15]/35 flex items-center justify-center text-base shrink-0">
                        {win.placement === 1 ? '🏆' : win.placement === 2 ? '🥈' : '🥉'}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          {win.tournament_title}
                        </div>
                        <div className="text-xs text-slate-400">
                          #{win.placement} Place · {win.tournament_mode} · {formatShortDate(win.declared_at)}
                        </div>
                      </div>
                    </div>
                    <div className="font-mono text-sm font-extrabold text-[#4ADE80] shrink-0">
                      +{formatPKR(win.prize_amount)}
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

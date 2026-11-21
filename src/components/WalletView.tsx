import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Smartphone,
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
  WithdrawalRecord,
} from '../types';

interface WalletViewProps {
  token: string;
  wallet: WalletAccount | null;
  deposits: DepositRecord[];
  withdrawals: WithdrawalRecord[];
  transactions: TransactionRecord[];
  paymentChannels: PaymentChannel[];
  onRefresh: () => Promise<void>;
}

export const WalletView: React.FC<WalletViewProps> = ({
  token,
  wallet,
  deposits,
  withdrawals,
  transactions,
  paymentChannels,
  onRefresh,
}) => {
  const [subTab, setSubTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');

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
  const [wdMethod, setWdMethod] = useState<'jazzcash' | 'easypaisa'>('jazzcash');
  const [wdAmount, setWdAmount] = useState('');
  const [accountTitle, setAccountTitle] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [wdLoading, setWdLoading] = useState(false);
  const [wdError, setWdError] = useState('');
  const [wdSuccess, setWdSuccess] = useState('');

  const [copiedId, setCopiedId] = useState('');

  const activeChannel =
    paymentChannels.find((c) => c.id === depMethod) || paymentChannels[0];

  const availableBalance = wallet?.available_balance ?? 0;
  const parsedWdAmount = Number(wdAmount) || 0;
  const exceedsBalance = parsedWdAmount > availableBalance;

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
    if (parsedWdAmount > availableBalance) {
      setWdError('Withdrawal amount exceeds your available balance.');
      return;
    }
    setWdLoading(true);
    try {
      await apiRequest('/api/wallet/withdraw', {
        method: 'POST',
        token,
        body: {
          amount: Math.floor(Number(wdAmount)),
          method: wdMethod,
          accountTitle,
          accountNumber,
        },
      });
      setWdSuccess('Withdrawal request submitted. Funds are reserved pending admin payout.');
      setWdAmount('');
      setAccountTitle('');
      setAccountNumber('');
      await onRefresh();
    } catch (err) {
      setWdError(err instanceof Error ? err.message : 'Withdrawal failed.');
    } finally {
      setWdLoading(false);
    }
  };

  const renderStatus = (status: 'pending' | 'approved' | 'rejected' | 'completed') => {
    if (status === 'approved' || status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="capitalize">{status}</span>
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-400">
          <XCircle className="w-3.5 h-3.5" />
          <span>Rejected</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400">
        <Clock className="w-3.5 h-3.5" />
        <span>Pending</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Wallet &amp; PKR Payments
          </h1>
          <p className="text-sm text-slate-400">
            Deposit via JazzCash or Easypaisa and withdraw winnings securely.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#11131E] border border-white/[0.08] rounded-xl">
          {(
            [
              { id: 'deposit', label: 'Deposit' },
              { id: 'withdraw', label: 'Withdraw' },
              { id: 'history', label: 'Ledger' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`min-h-[44px] px-4 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                subTab === t.id
                  ? 'bg-[#00D4FF] text-[#07080D]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Balance Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#11131E] border border-[#00D4FF]/30 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span>Available Balance</span>
            <Wallet className="w-4 h-4 text-[#00D4FF]" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-white tabular-nums">
            {formatPKR(availableBalance)}
          </div>
        </div>
        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-slate-400 mb-1.5">Pending Withdrawal</div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-amber-400 tabular-nums">
            {formatPKR(wallet?.pending_withdrawal)}
          </div>
        </div>
        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-slate-400 mb-1.5">Total Deposited</div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-emerald-400 tabular-nums">
            {formatPKR(wallet?.total_deposited)}
          </div>
        </div>
        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
          <div className="text-xs text-slate-400 mb-1.5">Total Prize Winnings</div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-[#8B5CF6] tabular-nums">
            {formatPKR(wallet?.total_won)}
          </div>
        </div>
      </div>

      {subTab === 'deposit' && (
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Instructions & Channel Selection */}
          <div className="lg:col-span-5 bg-[#11131E] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                1. Choose Payment Method
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
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
                        ? 'bg-[#00D4FF]/15 border-[#00D4FF] text-white'
                        : 'bg-[#07080D] border-white/[0.08] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-[#00D4FF]" />
                    <span className="whitespace-nowrap">{m.label}</span>
                  </button>
                );
              })}
            </div>

            {activeChannel && (
              <div className="bg-[#07080D] border border-white/[0.08] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs text-slate-400">{activeChannel.providerLabel}</div>
                    <div className="text-sm font-semibold text-white">
                      {activeChannel.accountTitle}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-[#11131E] border border-white/[0.08]">
                  <span className="font-mono text-sm font-semibold text-[#00D4FF] truncate">
                    {activeChannel.accountNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(activeChannel.accountNumber, activeChannel.id)}
                    className="min-h-[44px] px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white inline-flex items-center gap-1 shrink-0"
                  >
                    {copiedId === activeChannel.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
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

                <ol className="space-y-1.5 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
                  {activeChannel.instructions.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Deposit Proof Form */}
          <div className="lg:col-span-7 bg-[#11131E] border border-white/[0.08] rounded-2xl p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-white mb-1">
              2. Submit Payment Proof
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Duplicate Transaction IDs are automatically blocked. Admin verifies receipts before adding funds.
            </p>

            {depError && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                {depError}
              </div>
            )}
            {depSuccess && (
              <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
                {depSuccess}
              </div>
            )}

            <form onSubmit={submitDeposit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
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
                    className="w-full min-h-[44px] px-3.5 py-2 bg-[#07080D] border border-white/[0.12] rounded-xl font-mono text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00D4FF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Sender Mobile / Account No.
                  </label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    value={senderAccount}
                    onChange={(e) => setSenderAccount(e.target.value)}
                    placeholder="e.g. 0301-1234567"
                    className="w-full min-h-[44px] px-3.5 py-2 bg-[#07080D] border border-white/[0.12] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00D4FF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Transaction ID (TID / Reference Code)
                </label>
                <input
                  type="text"
                  required
                  minLength={4}
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value.toUpperCase())}
                  placeholder="e.g. TID-98432104"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-[#07080D] border border-white/[0.12] rounded-xl font-mono text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00D4FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Payment Receipt Screenshot
                </label>
                <label className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border border-dashed border-white/[0.2] hover:border-[#00D4FF]/60 bg-[#07080D] cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <Upload className="w-5 h-5 text-[#00D4FF] shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-white">
                        {screenshotData ? 'Screenshot attached' : 'Tap to upload screenshot'}
                      </div>
                      <div className="text-xs text-slate-400">PNG, JPG, or WEBP up to 1.8 MB</div>
                    </div>
                  </div>
                  {screenshotData && (
                    <img
                      src={screenshotData}
                      alt="Receipt preview"
                      className="w-16 h-16 rounded-lg object-cover border border-white/15"
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
                className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[#00D4FF] hover:bg-[#33DDFF] text-[#07080D] font-semibold text-sm disabled:opacity-60 transition-colors"
              >
                {depLoading ? 'Submitting Request...' : 'Submit Deposit Request'}
              </button>
            </form>
          </div>
        </div>
      )}

      {subTab === 'withdraw' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#11131E] border border-white/[0.08] rounded-2xl p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-white mb-1">
              Request Withdrawal
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Minimum PKR 200. Requested funds are safely reserved until admin transfer completes.
            </p>

            {wdError && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
                {wdError}
              </div>
            )}
            {wdSuccess && (
              <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
                {wdSuccess}
              </div>
            )}

            <form onSubmit={submitWithdrawal} className="space-y-4">
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
                    onClick={() => setWdMethod(m.id)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                      wdMethod === m.id
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                        : 'bg-[#07080D] border-white/[0.08] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <label className="font-medium text-slate-300">Withdrawal Amount (PKR)</label>
                  <span className="font-mono text-slate-400">
                    Max: {formatPKR(availableBalance)}
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min={200}
                  max={Math.max(200, availableBalance)}
                  value={wdAmount}
                  onChange={(e) => setWdAmount(e.target.value)}
                  placeholder="Minimum 200"
                  className="w-full min-h-[44px] px-3.5 py-2 bg-[#07080D] border border-white/[0.12] rounded-xl font-mono text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#8B5CF6]"
                />
                {exceedsBalance && (
                  <p className="text-xs text-rose-400 mt-1">
                    Amount exceeds your available balance ({formatPKR(availableBalance)}).
                  </p>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Account Holder Title
                  </label>
                  <input
                    type="text"
                    required
                    value={accountTitle}
                    onChange={(e) => setAccountTitle(e.target.value)}
                    placeholder="Full name on account"
                    className="w-full min-h-[44px] px-3.5 py-2 bg-[#07080D] border border-white/[0.12] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Mobile Wallet Number
                  </label>
                  <input
                    type="text"
                    required
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="03XX-XXXXXXX"
                    className="w-full min-h-[44px] px-3.5 py-2 bg-[#07080D] border border-white/[0.12] rounded-xl font-mono text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#8B5CF6]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={wdLoading || exceedsBalance || availableBalance < 200}
                className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-semibold text-sm disabled:opacity-50 transition-colors"
              >
                {wdLoading ? 'Submitting...' : 'Submit Withdrawal Request'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 bg-[#11131E] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-white">Recent Payout Requests</h3>
            {withdrawals.length === 0 ? (
              <p className="text-sm text-slate-400">No withdrawal requests submitted yet.</p>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {withdrawals.slice(0, 6).map((w) => (
                  <div key={w.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {formatPKR(w.amount)} · {w.method.replace('_', ' ')}
                      </div>
                      <div className="text-xs text-slate-400">
                        {w.account_title} ({w.account_number})
                      </div>
                      {w.admin_note && (
                        <div className="text-xs text-slate-400 mt-0.5">Note: {w.admin_note}</div>
                      )}
                    </div>
                    {renderStatus(w.status)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'history' && (
        <div className="space-y-6">
          {/* Deposit Requests Status */}
          <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-white">
              Deposit Requests ({deposits.length})
            </h2>
            {deposits.length === 0 ? (
              <p className="text-sm text-slate-400">No deposit requests yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-xs text-slate-400">
                      <th className="py-2.5 pr-4 font-medium">Method</th>
                      <th className="py-2.5 pr-4 font-medium">TID</th>
                      <th className="py-2.5 pr-4 font-medium">Amount</th>
                      <th className="py-2.5 pr-4 font-medium">Status</th>
                      <th className="py-2.5 font-medium text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-sm">
                    {deposits.map((d) => (
                      <tr key={d.id}>
                        <td className="py-3 pr-4 capitalize text-slate-200">
                          {d.method.replace('_', ' ')}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-300">
                          {d.transaction_ref}
                        </td>
                        <td className="py-3 pr-4 font-mono font-semibold text-white tabular-nums">
                          {formatPKR(d.amount)}
                        </td>
                        <td className="py-3 pr-4">{renderStatus(d.status)}</td>
                        <td className="py-3 text-right text-xs text-slate-400 whitespace-nowrap">
                          {formatShortDate(d.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Complete Transaction Ledger */}
          <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-5 sm:p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-white">
              Complete Transaction Ledger ({transactions.length})
            </h2>
            {transactions.length === 0 ? (
              <p className="text-sm text-slate-400">No transactions recorded yet.</p>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {transactions.map((tx) => (
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
                        <div className="text-sm font-medium text-white truncate">
                          {tx.description}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
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
                          tx.direction === 'credit' ? 'text-emerald-400' : 'text-white'
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
          </div>
        </div>
      )}
    </div>
  );
};

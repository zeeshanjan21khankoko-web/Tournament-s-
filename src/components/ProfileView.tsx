import React, { useState } from 'react';
import { Check, Copy, LogOut, Shield, Trophy, Upload, Gamepad2 } from 'lucide-react';
import { AVATAR_PRESETS, apiRequest, formatPKR, readImageFileAsDataUrl } from '../lib/api';
import { PWAInstallButton } from './PWAInstallBanner';
import type { UserProfile } from '../types';

interface ProfileViewProps {
  user: UserProfile;
  token: string;
  onUserUpdated: (user: UserProfile) => void;
  onLogout: () => void;
  onOpenAdmin?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  token,
  onUserUpdated,
  onLogout,
  onOpenAdmin,
}) => {
  const [username, setUsername] = useState(user.username);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  const winRate =
    user.matches_played > 0 ? Math.round((user.wins / user.matches_played) * 100) : 0;

  const handleCopyPlayerId = () => {
    navigator.clipboard?.writeText(user.player_id).catch(() => {});
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setError('');
      const dataUrl = await readImageFileAsDataUrl(file, 900 * 1024);
      setAvatarUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid image file.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        token,
        body: { username, avatarUrl },
      });
      onUserUpdated(res.user);
      setMessage('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <img
            src={avatarUrl || AVATAR_PRESETS[0].url}
            alt={user.username}
            referrerPolicy="no-referrer"
            className="w-20 h-20 rounded-2xl object-cover border border-[#00D4FF]/40 bg-[#07080D] shrink-0"
          />
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="capitalize text-[#00D4FF] font-semibold">{user.role}</span>
              <span aria-hidden="true">·</span>
              <span>{user.email}</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-white mt-0.5">{user.username}</h1>
            <div className="mt-2 inline-flex items-center gap-2">
              <span className="font-mono text-xs text-slate-300 bg-[#07080D] border border-white/[0.1] px-2.5 py-1 rounded-lg">
                Player ID: {user.player_id}
              </span>
              <button
                type="button"
                onClick={handleCopyPlayerId}
                className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs text-slate-200 inline-flex items-center gap-1"
              >
                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedId ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <PWAInstallButton />
          {user.role === 'admin' && onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <Shield className="w-4 h-4" />
              <span>Admin Panel</span>
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-sm font-semibold inline-flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Career Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Wallet</span>
          </div>
          <div className="font-mono text-lg sm:text-2xl font-bold text-white tabular-nums">
            {formatPKR(user.wallet_balance)}
          </div>
        </div>
        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Matches</span>
            <Gamepad2 className="w-4 h-4 text-[#00D4FF]" />
          </div>
          <div className="font-mono text-lg sm:text-2xl font-bold text-white tabular-nums">
            {user.matches_played}
          </div>
        </div>
        <div className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Wins</span>
            <Trophy className="w-4 h-4 text-[#8B5CF6]" />
          </div>
          <div className="font-mono text-lg sm:text-2xl font-bold text-white tabular-nums">
            {user.wins} <span className="text-xs text-slate-400 font-normal">({winRate}%)</span>
          </div>
        </div>
      </div>

      {/* Edit Profile */}
      <form
        onSubmit={handleSave}
        className="bg-[#11131E] border border-white/[0.08] rounded-2xl p-6 space-y-5"
      >
        <h2 className="font-display text-lg font-bold text-white">Update Player Profile</h2>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
            {message}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-2">
            Avatar Selection
          </label>
          <div className="flex flex-wrap items-center gap-3">
            {AVATAR_PRESETS.map((preset) => (
              <button
                key={preset.url}
                type="button"
                onClick={() => setAvatarUrl(preset.url)}
                className={`w-12 h-12 rounded-xl overflow-hidden border transition-all ${
                  avatarUrl === preset.url
                    ? 'border-[#00D4FF] ring-2 ring-[#00D4FF]/30'
                    : 'border-white/15 opacity-75 hover:opacity-100'
                }`}
              >
                <img
                  src={preset.url}
                  alt={preset.label}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
            <label className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#07080D] border border-white/[0.12] hover:border-[#00D4FF]/60 text-xs font-medium text-slate-200 cursor-pointer inline-flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#00D4FF]" />
              <span>Upload Custom Photo</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Display Username
          </label>
          <input
            type="text"
            required
            minLength={3}
            maxLength={24}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full sm:max-w-sm min-h-[44px] px-3.5 py-2 bg-[#07080D] border border-white/[0.12] rounded-xl text-sm text-white focus:outline-none focus:border-[#00D4FF]"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#00D4FF] hover:bg-[#33DDFF] text-[#07080D] font-semibold text-sm disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
};

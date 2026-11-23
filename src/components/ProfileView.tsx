import React, { useState } from 'react';
import {
  Check,
  CloudUpload,
  Copy,
  Edit3,
  Eye,
  FileText,
  Gamepad2,
  Headphones,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  Shield,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { AVATAR_PRESETS, apiRequest, readImageFileAsDataUrl } from '../lib/api';
import { PWAInstallButton } from './PWAInstallBanner';
import type { UserProfile } from '../types';

const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb65xZMCXC3OiHIqik2a';

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
  const [modal, setModal] = useState<'edit' | 'password' | 'chat' | 'terms' | 'privacy' | null>(
    null
  );
  const [copiedId, setCopiedId] = useState(false);

  // Quick photo upload & Edit Profile form
  const [username, setUsername] = useState(user.username);
  const [phone, setPhone] = useState(user.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  // Change password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  // Live chat / support form
  const [chatSubject, setChatSubject] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatMsg, setChatMsg] = useState('');
  const [chatErr, setChatErr] = useState('');

  const handleCopyPlayerId = () => {
    navigator.clipboard?.writeText(user.player_id).catch(() => {});
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  const handleDirectAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setProfileErr('');
      setProfileMsg('');
      const dataUrl = await readImageFileAsDataUrl(file, 900 * 1024);
      setAvatarUrl(dataUrl);
      setSaving(true);
      const res = await apiRequest<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        token,
        body: { avatarUrl: dataUrl },
      });
      onUserUpdated(res.user);
      setProfileMsg('Profile photo saved!');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Unable to upload photo.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setProfileErr('');
    setProfileMsg('');
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        token,
        body: {
          username: username.trim(),
          phone: phone.trim(),
          avatarUrl,
        },
      });
      onUserUpdated(res.user);
      setProfileMsg('Profile updated successfully.');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwErr('');
    setPwMsg('');
    if (newPassword !== confirmPassword) {
      setPwErr('New password and confirmation do not match.');
      return;
    }
    setPwSaving(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        token,
        body: { currentPassword, newPassword },
      });
      setPwMsg(res.message || 'Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Unable to change password.');
    } finally {
      setPwSaving(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setChatErr('');
    setChatMsg('');
    setChatSending(true);
    try {
      await apiRequest('/api/contact', {
        method: 'POST',
        token,
        body: {
          name: user.username,
          email: user.email,
          subject: chatSubject.trim() || 'Live Chat Support Request',
          message: chatMessage.trim(),
        },
      });
      setChatMsg('Support message received! Our admin team will respond shortly.');
      setChatSubject('');
      setChatMessage('');
    } catch (err) {
      setChatErr(err instanceof Error ? err.message : 'Failed to send support message.');
    } finally {
      setChatSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 1. Avatar & Player Hero (Matches Screenshot 4) */}
      <section className="pt-2 text-center space-y-3.5">
        <div className="relative inline-block">
          <img
            src={user.avatar_url || avatarUrl || AVATAR_PRESETS[0].url}
            alt={user.username}
            referrerPolicy="no-referrer"
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-[3px] border-[#FACC15] shadow-[0_0_32px_rgba(250,204,21,0.3)] bg-[#131A29]"
          />
          <span
            title="Online"
            className="w-5 h-5 rounded-full bg-[#22C55E] border-[3px] border-[#0A0E17] absolute bottom-1 right-1"
          />
        </div>

        <div>
          <label className="min-h-[38px] px-4 py-1.5 rounded-full bg-[#131A29] border border-[#FACC15]/45 hover:border-[#FACC15] text-[#FACC15] text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors">
            <CloudUpload className="w-4 h-4" />
            <span>{saving ? 'Uploading...' : 'Upload your profile photo'}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleDirectAvatarUpload}
              className="hidden"
            />
          </label>
        </div>

        {profileMsg && !modal && (
          <div className="text-xs text-[#4ADE80] font-semibold">{profileMsg}</div>
        )}
        {profileErr && !modal && (
          <div className="text-xs text-rose-400 font-semibold">{profileErr}</div>
        )}

        <div>
          <h1 className="font-display text-lg sm:text-xl font-extrabold text-[#FACC15] truncate px-2">
            {user.email}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">{user.username}</p>
        </div>

        {/* 2. 3-Column Stats (WINS / KILLS / POINTS) (Matches Screenshot 4) */}
        <div className="grid grid-cols-3 gap-3 max-w-md mx-auto pt-1">
          <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl py-3 px-2">
            <div className="font-display text-xl font-extrabold text-[#FACC15] tabular-nums">
              {user.wins}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
              WINS
            </div>
          </div>
          <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl py-3 px-2">
            <div className="font-display text-xl font-extrabold text-[#FACC15] tabular-nums">
              {user.kills ?? 0}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
              KILLS
            </div>
          </div>
          <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl py-3 px-2">
            <div className="font-display text-xl font-extrabold text-[#FACC15] tabular-nums">
              {user.points ?? 0}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
              POINTS
            </div>
          </div>
        </div>
      </section>

      {/* 3. 3-Column Quick Action Tiles (EDIT PROFILE / PASSWORD / LIVE CHAT) (Matches Screenshot 4) */}
      <section className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => {
            setUsername(user.username);
            setPhone(user.phone || '');
            setAvatarUrl(user.avatar_url);
            setProfileErr('');
            setProfileMsg('');
            setModal('edit');
          }}
          className="bg-[#131A29] border border-white/[0.08] hover:border-[#FACC15]/50 rounded-2xl py-4 px-2 flex flex-col items-center justify-center gap-2 transition-colors ff-card-glow"
        >
          <Edit3 className="w-5 h-5 text-[#FACC15]" />
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-300">
            EDIT PROFILE
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setPwErr('');
            setPwMsg('');
            setModal('password');
          }}
          className="bg-[#131A29] border border-white/[0.08] hover:border-[#FACC15]/50 rounded-2xl py-4 px-2 flex flex-col items-center justify-center gap-2 transition-colors ff-card-glow"
        >
          <KeyRound className="w-5 h-5 text-[#FACC15]" />
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-300">
            PASSWORD
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setChatErr('');
            setChatMsg('');
            setModal('chat');
          }}
          className="bg-[#131A29] border border-white/[0.08] hover:border-[#FACC15]/50 rounded-2xl py-4 px-2 flex flex-col items-center justify-center gap-2 transition-colors ff-card-glow"
        >
          <Headphones className="w-5 h-5 text-[#FACC15]" />
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-300">
            LIVE CHAT
          </span>
        </button>
      </section>

      {/* 4. | Account Info (Matches Screenshot 4) */}
      <section className="space-y-3">
        <h2 className="font-display text-base sm:text-lg font-extrabold text-white flex items-center gap-2.5">
          <span className="w-1 h-5 rounded-full bg-[#FACC15] inline-block" />
          <span>Account Info</span>
        </h2>

        <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl divide-y divide-white/[0.06]">
          <div className="p-4 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#FACC15]/10 border border-[#FACC15]/20 flex items-center justify-center text-[#FACC15] shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                EMAIL
              </div>
              <div className="text-sm font-bold text-white truncate mt-0.5">{user.email}</div>
            </div>
          </div>

          <div className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#FACC15]/10 border border-[#FACC15]/20 flex items-center justify-center text-[#FACC15] shrink-0">
                <Phone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  PHONE
                </div>
                <div className="text-sm font-bold text-white font-mono truncate mt-0.5">
                  {user.phone || 'Not added yet'}
                </div>
              </div>
            </div>
            {!user.phone && (
              <button
                type="button"
                onClick={() => setModal('edit')}
                className="text-xs font-bold text-[#FACC15] hover:underline shrink-0"
              >
                Add
              </button>
            )}
          </div>

          <div className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#FACC15]/10 border border-[#FACC15]/20 flex items-center justify-center text-[#FACC15] shrink-0">
                <Gamepad2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  PLAYER ID
                </div>
                <div className="text-sm font-bold text-white font-mono truncate mt-0.5">
                  {user.player_id}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyPlayerId}
              className="min-h-[34px] px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-slate-200 inline-flex items-center gap-1 shrink-0"
            >
              {copiedId ? <Check className="w-3.5 h-3.5 text-[#4ADE80]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedId ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 5. | Legal & Policies (Matches Screenshot 4) */}
      <section className="space-y-3">
        <h2 className="font-display text-base sm:text-lg font-extrabold text-white flex items-center gap-2.5">
          <span className="w-1 h-5 rounded-full bg-[#FACC15] inline-block" />
          <span>Legal &amp; Policies</span>
        </h2>

        <div className="space-y-3">
          <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#FACC15]/10 border border-[#FACC15]/20 flex items-center justify-center text-[#FACC15] shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">Terms &amp; Conditions</div>
                <div className="text-xs text-slate-400 truncate">Tournament participation rules</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setModal('terms')}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#FACC15] hover:bg-[#FDE047] text-[#0A0E17] text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>View</span>
            </button>
          </div>

          <div className="bg-[#131A29] border border-white/[0.08] rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/25 flex items-center justify-center text-[#4ADE80] shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">Privacy Policy</div>
                <div className="text-xs text-slate-400 truncate">How we handle your data</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setModal('privacy')}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#22C55E] hover:bg-[#4ADE80] text-[#0A0E17] text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>View</span>
            </button>
          </div>
        </div>
      </section>

      {/* Account Session Actions (Admin Panel if admin, PWA Install, Sign Out) */}
      <section className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <PWAInstallButton />
          {user.role === 'admin' && onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="ff-btn-ember min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold inline-flex items-center gap-2"
            >
              <Shield className="w-4 h-4" />
              <span>Open Admin Panel</span>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs sm:text-sm font-bold inline-flex items-center gap-2 ml-auto"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </section>

      {/* MODAL: EDIT PROFILE */}
      {modal === 'edit' && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setModal(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveProfile}
            className="w-full sm:max-w-md bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-white">Edit Profile</h3>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] text-slate-300 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {profileErr && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {profileErr}
              </div>
            )}
            {profileMsg && (
              <div className="p-3 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#4ADE80] text-xs">
                {profileMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Avatar Selection
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                {AVATAR_PRESETS.map((preset) => (
                  <button
                    key={preset.url}
                    type="button"
                    onClick={() => setAvatarUrl(preset.url)}
                    className={`w-11 h-11 rounded-full overflow-hidden border transition-all ${
                      avatarUrl === preset.url
                        ? 'border-[#FACC15] ring-2 ring-[#FACC15]/40'
                        : 'border-white/[0.1] opacity-75 hover:opacity-100'
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
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Display Username
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={24}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="03001234567"
                className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl font-mono text-sm text-white focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="ff-btn-ember w-full min-h-[46px] rounded-xl font-extrabold text-sm disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      )}

      {/* MODAL: CHANGE PASSWORD */}
      {modal === 'password' && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setModal(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleChangePassword}
            className="w-full sm:max-w-md bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-white">Change Password</h3>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] text-slate-300 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {pwErr && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {pwErr}
              </div>
            )}
            {pwMsg && (
              <div className="p-3 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#4ADE80] text-xs">
                {pwMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                New Password (min 6 characters)
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full min-h-[44px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            <button
              type="submit"
              disabled={pwSaving}
              className="ff-btn-ember w-full min-h-[46px] rounded-xl font-extrabold text-sm disabled:opacity-60"
            >
              {pwSaving ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      )}

      {/* MODAL: LIVE CHAT SUPPORT */}
      {modal === 'chat' && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-extrabold text-white">Live Chat &amp; Support</h3>
                <p className="text-xs text-slate-400">
                  Send a ticket directly to Admins or join our WhatsApp Channel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] text-slate-300 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <a
              href={WHATSAPP_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#22C55E] hover:bg-[#4ADE80] text-[#0A0E17] font-extrabold text-xs inline-flex items-center justify-center gap-2"
            >
              <Headphones className="w-4 h-4" />
              <span>Join Official WhatsApp Channel</span>
            </a>

            {chatErr && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {chatErr}
              </div>
            )}
            {chatMsg && (
              <div className="p-3 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#4ADE80] text-xs">
                {chatMsg}
              </div>
            )}

            <form onSubmit={handleSendChat} className="space-y-3">
              <input
                type="text"
                required
                value={chatSubject}
                onChange={(e) => setChatSubject(e.target.value)}
                placeholder="Subject (e.g. Deposit TID verification)"
                className="w-full min-h-[42px] px-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
              />
              <textarea
                rows={4}
                required
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Describe your question or issue..."
                className="w-full p-3.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white focus:outline-none focus:border-[#FACC15]"
              />
              <button
                type="submit"
                disabled={chatSending}
                className="ff-btn-ember w-full min-h-[46px] rounded-xl font-extrabold text-sm disabled:opacity-60"
              >
                {chatSending ? 'Sending...' : 'Send Message to Admin'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TERMS & PRIVACY */}
      {(modal === 'terms' || modal === 'privacy') && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-[#131A29] border border-white/[0.12] rounded-t-3xl sm:rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold text-white">
                {modal === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
              </h3>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] text-slate-300 hover:text-white flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {modal === 'terms' ? (
              <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
                <p>
                  1. All participants in FREE FIRE TOURNAMENT 09 must register with their accurate Free Fire In-Game Name (IGN) and UID.
                </p>
                <p>
                  2. Teaming, hacking, emulator bypass, or third-party cheats result in immediate disqualification without entry refund.
                </p>
                <p>
                  3. Tournament prize money for 1st, 2nd, and 3rd winners is credited automatically to each winner&apos;s verified app wallet upon match completion.
                </p>
                <p>
                  4. Deposits submitted with duplicate or fake Transaction IDs (TIDs) will be rejected. Withdrawals are processed via Easypaisa, JazzCash, or Bank Account.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
                <p>
                  We collect only the account details needed to run tournaments fairly: username, email, optional phone number, avatar, Free Fire IGN/UID, and wallet transaction records.
                </p>
                <p>
                  Your password is stored using strong salted cryptographic hashing and never exposed. Payment receipts and withdrawal account details are restricted strictly to authorized administrators for verification.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

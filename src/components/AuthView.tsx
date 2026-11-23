import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck, Upload, UserPlus, LogIn, X } from 'lucide-react';
import { AVATAR_PRESETS, apiRequest, readImageFileAsDataUrl } from '../lib/api';
import type { UserProfile } from '../types';

interface AuthViewProps {
  onSuccess: (token: string, user: UserProfile) => void;
  onClose?: () => void;
  initialMode?: 'login' | 'register' | 'admin';
}

export const AuthView: React.FC<AuthViewProps> = ({
  onSuccess,
  onClose,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'admin'>(initialMode);
  const [bootstrap, setBootstrap] = useState<{ adminClaimed: boolean; passcodeConfigured: boolean }>({
    adminClaimed: true,
    passcodeConfigured: false,
  });

  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(AVATAR_PRESETS[0].url);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest<{ adminClaimed: boolean; passcodeConfigured: boolean }>('/api/auth/bootstrap-status')
      .then(setBootstrap)
      .catch(() => {});
  }, []);

  const canClaimAdmin = !bootstrap.adminClaimed || bootstrap.passcodeConfigured;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/login', {
          method: 'POST',
          body: { identifier, password },
        });
        onSuccess(res.token, res.user);
      } else if (mode === 'register') {
        const res = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/register', {
          method: 'POST',
          body: { username, email, phone: phone.trim(), password, avatarUrl },
        });
        onSuccess(res.token, res.user);
      } else {
        const res = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/claim-admin', {
          method: 'POST',
          body: { username, email, password, passcode },
        });
        onSuccess(res.token, res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-[#131A29] border border-white/[0.12] rounded-2xl p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="font-display text-xl font-bold text-white tracking-tight">
            {mode === 'login'
              ? 'Sign in to FREE FIRE TOURNAMENT 09'
              : mode === 'register'
                ? 'Create Player Account'
                : 'Claim Administrator Access'}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {mode === 'login'
              ? 'Access your wallet, active rooms, and Free Fire stats.'
              : mode === 'register'
                ? 'Get your unique Player ID and join live brackets.'
                : bootstrap.passcodeConfigured
                  ? 'Verify the server admin passcode to register an admin account.'
                  : 'First-run setup: create the primary administrator account.'}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-2 sm:flex gap-1 p-1 bg-[#0D1320] border border-white/[0.08] rounded-xl mb-5">
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setError('');
          }}
          className={`flex-1 min-h-[40px] px-3 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
            mode === 'login'
              ? 'bg-[#FACC15] text-[#0A0E17]'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setError('');
          }}
          className={`flex-1 min-h-[40px] px-3 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
            mode === 'register'
              ? 'bg-[#FACC15] text-[#0A0E17]'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Sign Up
        </button>
        {canClaimAdmin && (
          <button
            type="button"
            onClick={() => {
              setMode('admin');
              setError('');
            }}
            className={`col-span-2 sm:col-span-1 flex-1 min-h-[40px] px-3 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
              mode === 'admin'
                ? 'bg-[#FACC15] text-[#0A0E17]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Admin Setup
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'login' ? (
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Username or Email
            </label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. shadow_pk or player@email.com"
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
            />
          </div>
        ) : (
          <>
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Profile Picture
                </label>
                <div className="flex items-center gap-3">
                  <img
                    src={avatarUrl}
                    alt="Selected avatar"
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-full object-cover border-2 border-[#FACC15]/70 bg-[#0D1320] shrink-0"
                  />
                  <div className="flex flex-wrap gap-2 items-center">
                    {AVATAR_PRESETS.map((preset) => (
                      <button
                        key={preset.url}
                        type="button"
                        onClick={() => setAvatarUrl(preset.url)}
                        title={preset.label}
                        className={`w-10 h-10 rounded-full overflow-hidden border transition-all ${
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
                    <label className="min-h-[40px] px-3 py-2 rounded-xl bg-[#0D1320] border border-white/[0.1] hover:border-[#FACC15]/60 text-xs font-medium text-slate-200 cursor-pointer inline-flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5 text-[#FACC15]" />
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleAvatarUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Gamer Username
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={24}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. KellyRunner_PK"
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="player@domain.com"
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 03001234567"
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#0D1320] border border-white/[0.1] rounded-xl font-mono text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
                />
              </div>
            )}

            {mode === 'admin' && bootstrap.passcodeConfigured && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Server Admin Passcode
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Enter configured ADMIN_PASSCODE"
                    className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
                  />
                </div>
              </div>
            )}
          </>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full min-h-[44px] pl-3.5 pr-11 py-2.5 bg-[#0D1320] border border-white/[0.1] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FACC15]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-white"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="ff-btn-ember w-full min-h-[46px] px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-60"
        >
          {mode === 'login' ? (
            <LogIn className="w-4 h-4" />
          ) : mode === 'register' ? (
            <UserPlus className="w-4 h-4" />
          ) : (
            <ShieldCheck className="w-4 h-4" />
          )}
          <span>
            {loading
              ? 'Processing...'
              : mode === 'login'
                ? 'Sign In'
                : mode === 'register'
                  ? 'Create Account'
                  : 'Claim Admin Account'}
          </span>
        </button>
      </form>
    </div>
  );
};

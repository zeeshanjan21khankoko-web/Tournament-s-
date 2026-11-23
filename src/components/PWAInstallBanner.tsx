import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  MoreVertical,
  Share,
  ShieldCheck,
  Smartphone,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface AppDownloadStatus {
  apkAvailable: boolean;
  fileName: string | null;
  sizeBytes: number | null;
  downloadUrl: string | null;
  appName: string;
  shortName: string;
  iconUrl: string;
  installMode: 'apk_and_pwa' | 'pwa';
}

const DEFAULT_DOWNLOAD_STATUS: AppDownloadStatus = {
  apkAvailable: false,
  fileName: null,
  sizeBytes: null,
  downloadUrl: null,
  appName: 'FREE FIRE TOURNAMENT 09',
  shortName: 'FF Tourney09',
  iconUrl: '/pwa-192x192.png',
  installMode: 'pwa',
};

// Module-level capture so early beforeinstallprompt events are never missed
let sharedDeferredPrompt: BeforeInstallPromptEvent | null = null;
let sharedIsInstalled = false;
const promptListeners = new Set<() => void>();

function notifyPromptListeners() {
  promptListeners.forEach((fn) => fn());
}

if (typeof window !== 'undefined') {
  sharedIsInstalled =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    sharedDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyPromptListeners();
  });

  window.addEventListener('appinstalled', () => {
    sharedIsInstalled = true;
    sharedDeferredPrompt = null;
    notifyPromptListeners();
  });
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => sharedDeferredPrompt
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => sharedIsInstalled);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);
  const [apkStatus, setApkStatus] = useState<AppDownloadStatus>(DEFAULT_DOWNLOAD_STATUS);
  const [statusLoading, setStatusLoading] = useState(false);

  const refreshApkStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/app-download/status', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as Partial<AppDownloadStatus>;
        setApkStatus({
          apkAvailable: Boolean(data.apkAvailable && data.downloadUrl),
          fileName: data.fileName ?? null,
          sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : null,
          downloadUrl: data.apkAvailable && data.downloadUrl ? data.downloadUrl : null,
          appName: data.appName || DEFAULT_DOWNLOAD_STATUS.appName,
          shortName: data.shortName || DEFAULT_DOWNLOAD_STATUS.shortName,
          iconUrl: data.iconUrl || DEFAULT_DOWNLOAD_STATUS.iconUrl,
          installMode: data.apkAvailable ? 'apk_and_pwa' : 'pwa',
        });
      }
    } catch {
      // Keep safe default (no fake APK link)
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      setDeferredPrompt(sharedDeferredPrompt);
      setIsInstalled(
        sharedIsInstalled ||
          window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as unknown as { standalone?: boolean }).standalone === true
      );
    };

    sync();
    promptListeners.add(sync);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsAndroid(/android/.test(ua));

    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    const media = window.matchMedia('(display-mode: standalone)');
    const onMediaChange = (ev: MediaQueryListEvent) => {
      if (ev.matches) {
        sharedIsInstalled = true;
        sync();
      }
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onMediaChange);
    }

    refreshApkStatus();

    return () => {
      promptListeners.delete(sync);
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', onMediaChange);
      }
    };
  }, [refreshApkStatus]);

  const install = async () => {
    const activePrompt = sharedDeferredPrompt || deferredPrompt;
    if (!activePrompt) return false;
    await activePrompt.prompt();
    const { outcome } = await activePrompt.userChoice;
    if (outcome === 'accepted') {
      sharedIsInstalled = true;
      sharedDeferredPrompt = null;
      notifyPromptListeners();
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt || sharedDeferredPrompt),
    isInstalled,
    isIOS,
    isAndroid,
    isInIframe,
    apkStatus,
    statusLoading,
    refreshApkStatus,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

interface DownloadAppModalProps {
  open: boolean;
  onClose: () => void;
}

export const DownloadAppModal: React.FC<DownloadAppModalProps> = ({ open, onClose }) => {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    isAndroid,
    isInIframe,
    apkStatus,
    statusLoading,
    refreshApkStatus,
    install,
  } = usePWAInstall();
  const [installing, setInstalling] = useState(false);
  const [installFeedback, setInstallFeedback] = useState<string>('');

  useEffect(() => {
    if (open) {
      setInstallFeedback('');
      refreshApkStatus();
    }
  }, [open, refreshApkStatus]);

  if (!open) return null;

  const handlePWAInstall = async () => {
    setInstalling(true);
    setInstallFeedback('');
    try {
      const accepted = await install();
      if (accepted) {
        setInstallFeedback(
          `${apkStatus.shortName} is installing! Look for the app icon on your phone's Home Screen.`
        );
      } else {
        setInstallFeedback(
          'Installation prompt dismissed. You can click Install App again anytime or add it from your browser menu.'
        );
      }
    } catch {
      setInstallFeedback('Please use your browser menu ("Install app" or "Add to Home screen").');
    } finally {
      setInstalling(false);
    }
  };

  const browserUrl = typeof window !== 'undefined' ? window.location.origin : '/';
  const sizeLabel = formatFileSize(apkStatus.sizeBytes);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-app-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-[#131A29] border border-[#FACC15]/30 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 space-y-5 shadow-[0_24px_64px_rgba(0,0,0,0.75)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative w-14 h-14 rounded-2xl overflow-hidden border-2 border-[#FACC15]/70 bg-[#0A0E17] shadow-[0_0_24px_rgba(250,204,21,0.3)] shrink-0">
              <img
                src={apkStatus.iconUrl || '/pwa-192x192.png'}
                alt={apkStatus.appName}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#FACC15] flex items-center gap-1">
                <Sparkles className="w-3 h-3 shrink-0" />
                <span>Official Tournament App</span>
              </div>
              <h3
                id="download-app-modal-title"
                className="font-display text-base sm:text-lg font-extrabold text-white leading-tight truncate mt-0.5"
              >
                {apkStatus.appName}
              </h3>
              <div className="text-xs text-slate-400 mt-0.5">
                Home Screen Name: <span className="text-slate-200 font-semibold">{apkStatus.shortName}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close download modal"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] text-slate-300 hover:text-white flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Highlights strip */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-[#0D1320] border border-white/[0.07] p-2.5">
            <Smartphone className="w-4 h-4 text-[#FACC15] mx-auto mb-1" />
            <div className="text-[11px] font-bold text-white">Android Ready</div>
          </div>
          <div className="rounded-xl bg-[#0D1320] border border-white/[0.07] p-2.5">
            <ShieldCheck className="w-4 h-4 text-[#4ADE80] mx-auto mb-1" />
            <div className="text-[11px] font-bold text-white">Verified App</div>
          </div>
          <div className="rounded-xl bg-[#0D1320] border border-white/[0.07] p-2.5">
            <Sparkles className="w-4 h-4 text-sky-400 mx-auto mb-1" />
            <div className="text-[11px] font-bold text-white">Home Icon</div>
          </div>
        </div>

        {installFeedback && (
          <div className="rounded-xl bg-[#FACC15]/10 border border-[#FACC15]/35 p-3 text-xs text-[#FDE047] font-medium">
            {installFeedback}
          </div>
        )}

        {/* Option 1: Real APK Download ONLY if a genuine APK exists on server */}
        {apkStatus.apkAvailable && apkStatus.downloadUrl && (
          <div className="rounded-2xl bg-[#0D1320] border border-[#FACC15]/35 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-[#FACC15]">
                  Android APK Package
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  {apkStatus.fileName || 'ff-tournament-09.apk'}
                  {sizeLabel ? ` · ${sizeLabel}` : ''}
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-[#22C55E]/15 text-[#4ADE80] text-[10px] font-bold">
                VERIFIED
              </span>
            </div>

            <a
              href={apkStatus.downloadUrl}
              download={apkStatus.fileName || 'FF-Tourney-09.apk'}
              className="ff-btn-ember w-full min-h-[46px] rounded-xl font-display font-extrabold text-sm inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Download Android APK{sizeLabel ? ` (${sizeLabel})` : ''}</span>
            </a>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              After downloading, tap the APK file in your Downloads notification and confirm Install to add{' '}
              <strong className="text-slate-200">{apkStatus.shortName}</strong> to your Android Home Screen.
            </p>
          </div>
        )}

        {/* Option 2: PWA Standalone App Installation */}
        <div className="rounded-2xl bg-[#0D1320] border border-white/[0.09] p-4 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-white">
                {apkStatus.apkAvailable ? 'Or Instant App Install (No APK Wait)' : 'Install App to Home Screen'}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {statusLoading
                  ? 'Checking package availability...'
                  : 'Installs full-screen standalone app with Home Screen icon'}
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-[#FACC15]/15 text-[#FACC15] text-[10px] font-bold shrink-0">
              PWA APP
            </span>
          </div>

          {isInstalled ? (
            <div className="rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/40 p-3.5 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#4ADE80] shrink-0" />
              <div className="text-xs text-emerald-200 font-semibold">
                {apkStatus.shortName} is already installed and running in standalone app mode on your device.
              </div>
            </div>
          ) : isInstallable ? (
            <button
              type="button"
              disabled={installing}
              onClick={handlePWAInstall}
              className="ff-btn-ember w-full min-h-[48px] rounded-xl font-display font-extrabold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              <span>{installing ? 'Installing App...' : `Install ${apkStatus.shortName} App`}</span>
            </button>
          ) : isIOS ? (
            <div className="space-y-2.5">
              <div className="text-xs font-bold text-[#FACC15]">iPhone / iPad Safari Install Steps:</div>
              <ol className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#FACC15]/15 text-[#FACC15] font-bold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>
                    Tap the <Share className="w-3.5 h-3.5 inline text-[#FACC15] mx-0.5" /> <strong>Share</strong> icon in Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#FACC15]/15 text-[#FACC15] font-bold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#FACC15]/15 text-[#FACC15] font-bold flex items-center justify-center shrink-0">
                    3
                  </span>
                  <span>
                    Tap <strong>Add</strong> — <strong>{apkStatus.shortName}</strong> will appear on your Home Screen.
                  </span>
                </li>
              </ol>
            </div>
          ) : (
            <div className="space-y-3">
              {isInIframe && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 space-y-2">
                  <p className="text-xs text-amber-200 leading-relaxed">
                    You are currently viewing inside an embedded frame. Open directly in Chrome/Android browser to trigger the 1-tap Home Screen install prompt:
                  </p>
                  <a
                    href={browserUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ff-btn-ember w-full min-h-[42px] rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
                  >
                    <span>Open in Browser to Install</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              <div className="text-xs font-bold text-[#FACC15]">
                {isAndroid ? 'Android Chrome / Edge Install Steps:' : 'Install to Phone or Desktop Home Screen:'}
              </div>
              <ol className="space-y-2 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#FACC15]/15 text-[#FACC15] font-bold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>
                    Tap the browser menu <MoreVertical className="w-3.5 h-3.5 inline text-[#FACC15]" /> (top-right corner in Chrome or Edge).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#FACC15]/15 text-[#FACC15] font-bold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>
                    Select <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#FACC15]/15 text-[#FACC15] font-bold flex items-center justify-center shrink-0">
                    3
                  </span>
                  <span>
                    Confirm <strong>Install</strong> — the <strong>{apkStatus.shortName}</strong> icon will be added to your Home Screen.
                  </span>
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface DownloadTournamentAppButtonProps {
  variant?: 'card' | 'button' | 'header';
  className?: string;
}

export const DownloadTournamentAppButton: React.FC<DownloadTournamentAppButtonProps> = ({
  variant = 'button',
  className = '',
}) => {
  const { isInstalled, apkStatus } = usePWAInstall();
  const [modalOpen, setModalOpen] = useState(false);

  if (variant === 'header') {
    return (
      <>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={`min-h-[34px] px-3 py-1 rounded-full bg-[#131A29] border border-[#FACC15]/45 hover:border-[#FACC15] text-xs font-bold text-[#FACC15] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${className}`}
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden xl:inline">Download Tournament App</span>
          <span className="xl:hidden">Get App</span>
        </button>
        <DownloadAppModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  if (variant === 'card') {
    return (
      <>
        <div
          className={`rounded-2xl bg-gradient-to-r from-[#141D2F] via-[#131A29] to-[#1A1A14] border border-[#FACC15]/30 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ff-card-glow ${className}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={apkStatus.iconUrl || '/pwa-192x192.png'}
              alt={apkStatus.appName}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl object-cover border border-[#FACC15]/60 bg-[#0A0E17] shrink-0"
            />
            <div className="min-w-0">
              <div className="font-display text-xs sm:text-sm font-extrabold text-white truncate">
                {apkStatus.appName}
              </div>
              <div className="text-[11px] text-slate-300 truncate">
                {isInstalled
                  ? 'Installed on your Home Screen'
                  : apkStatus.apkAvailable
                    ? 'Android APK & Home Screen App ready'
                    : 'Install on Android Home Screen (Standalone App)'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="ff-btn-ember w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl font-display text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Download Tournament App</span>
          </button>
        </div>
        <DownloadAppModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`ff-btn-ember min-h-[44px] px-4 py-2.5 rounded-xl font-display text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 ${className}`}
      >
        <img
          src={apkStatus.iconUrl || '/pwa-192x192.png'}
          alt=""
          className="w-5 h-5 rounded-md object-cover border border-[#0A0E17]/30 shrink-0"
        />
        <Download className="w-4 h-4 shrink-0" />
        <span>Download Tournament App</span>
      </button>
      <DownloadAppModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  return (
    <DownloadTournamentAppButton
      variant="button"
      className={compact ? 'min-h-[38px] px-3 py-1.5 text-xs' : ''}
    />
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="bg-[#FACC15]/15 border-b border-[#FACC15]/35 px-4 py-2 text-xs font-medium text-[#FDE047] flex items-center justify-center gap-2"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline Mode — Showing cached tournament schedule. Live wallet actions require connection.</span>
    </div>
  );
};

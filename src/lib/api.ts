import {
  PKT_TIMEZONE,
  formatPktCompact,
  formatPktDateTime,
  formatPktScheduleRange,
  getTournamentStatusLabel,
  computeTournamentStatus,
  pktDateTimeToIso,
  isoToPktParts,
  getDefaultPktSchedule,
  addHoursToPktParts,
} from '../../shared/pktTime';

export const KELLY_HERO_ARTWORK = '/src/assets/images/kelly_hero_banner_1795312122819.jpg';
export const KELLY_TOURNAMENT_ARTWORK = '/src/assets/images/kelly_tournament_banner_1795312123415.jpg';
export const CLASH_SQUAD_ARTWORK = '/src/assets/images/clash_squad_arena_1795312122438.jpg';

export const TOURNAMENT_MODES = ['Battle Royale', 'Clash Squad', 'Lone Wolf'] as const;

export const AVATAR_PRESETS = [
  {
    label: 'Kelly Sprinter',
    url: KELLY_HERO_ARTWORK,
  },
  {
    label: 'Pro Striker',
    url: '/src/assets/images/avatar_esports_pro_1795298801657.jpg',
  },
  {
    label: 'Bermuda Runner',
    url: KELLY_TOURNAMENT_ARTWORK,
  },
  {
    label: 'Squad Infernal',
    url: '/src/assets/images/tournament_freefire_clash_1795298801818.jpg',
  },
];

export const BANNER_PRESETS = [
  {
    label: 'Kelly Battle Royale',
    url: KELLY_TOURNAMENT_ARTWORK,
  },
  {
    label: 'Kelly Championship Stage',
    url: KELLY_HERO_ARTWORK,
  },
  {
    label: 'Clash Squad Arena',
    url: CLASH_SQUAD_ARTWORK,
  },
  {
    label: 'Bermuda Squad Clash',
    url: '/src/assets/images/tournament_freefire_clash_1795298801818.jpg',
  },
];

export {
  formatPktCompact,
  formatPktDateTime,
  formatPktScheduleRange,
  getTournamentStatusLabel,
  computeTournamentStatus,
  pktDateTimeToIso,
  isoToPktParts,
  getDefaultPktSchedule,
  addHoursToPktParts,
};

export function formatPKR(amount: number | undefined | null): string {
  const num = Number(amount) || 0;
  return `PKR ${num.toLocaleString('en-PK')}`;
}

export function splitPrizePoolDefaults(
  totalPrizePool: number,
  ratios: [number, number] = [0.5, 0.3]
): { prize1st: number; prize2nd: number; prize3rd: number } {
  const pool = Math.max(0, Math.floor(Number(totalPrizePool) || 0));
  const p1 = Math.round(pool * ratios[0]);
  const p2 = Math.round(pool * ratios[1]);
  const p3 = Math.max(0, pool - p1 - p2);
  return { prize1st: p1, prize2nd: p2, prize3rd: p3 };
}

export function formatMatchTime(iso: string): string {
  return formatPktCompact(iso);
}

export function formatShortDate(iso: string): string {
  const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toLocaleString('en-US', {
    timeZone: PKT_TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })} PKT`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export function readImageFileAsDataUrl(file: File, maxBytes = 1.8 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      reject(new Error('Only PNG, JPEG, or WEBP images are supported.'));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error('Image must be smaller than 1.8 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export function extractYouTubeVideoId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  let videoId = '';
  if (host === 'youtu.be') {
    videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
  } else {
    const vParam = parsed.searchParams.get('v');
    if (vParam) {
      videoId = vParam;
    } else {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
        videoId = parts[1];
      }
    }
  }

  return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
}

export function getYouTubeEmbedUrl(videoId: string): string {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return '';
  return `https://www.youtube.com/embed/${videoId}?rel=0`;
}

export function getYouTubeThumbnailUrl(videoId: string): string {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return '';
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}


export const AVATAR_PRESETS = [
  {
    label: 'Pro Striker',
    url: '/src/assets/images/avatar_esports_pro_1795298801657.jpg',
  },
  {
    label: 'Arena Vanguard',
    url: '/src/assets/images/tournament_pubg_arena_1795298801850.jpg',
  },
  {
    label: 'Cyber Tactician',
    url: '/src/assets/images/tournament_valorant_cyber_1795298801660.jpg',
  },
  {
    label: 'Night Raider',
    url: '/src/assets/images/tournament_freefire_clash_1795298801818.jpg',
  },
];

export const BANNER_PRESETS = [
  {
    label: 'Battle Royale Arena',
    url: '/src/assets/images/tournament_pubg_arena_1795298801850.jpg',
  },
  {
    label: 'Cyber FPS Stage',
    url: '/src/assets/images/tournament_valorant_cyber_1795298801660.jpg',
  },
  {
    label: 'Urban Squad Clash',
    url: '/src/assets/images/tournament_freefire_clash_1795298801818.jpg',
  },
];

export function formatPKR(amount: number | undefined | null): string {
  const num = Number(amount) || 0;
  return `PKR ${num.toLocaleString('en-PK')}`;
}

export function formatMatchTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatShortDate(iso: string): string {
  const normalized = iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string | null;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
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

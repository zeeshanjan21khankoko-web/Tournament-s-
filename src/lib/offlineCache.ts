import type { Tournament } from '../types';

const TOURNAMENTS_CACHE_KEY = 'pt_cached_tournaments_v1';
const CACHE_TIME_KEY = 'pt_cached_tournaments_time_v1';
const PREF_FILTER_KEY = 'pt_pref_arena_filter_v1';
const PREF_PAY_METHOD_KEY = 'pt_pref_pay_method_v1';

// Stores ONLY public non-sensitive tournament schedule data & UI preferences.
// Never store authentication tokens or sensitive user credentials in localStorage.
export function saveCachedTournaments(tournaments: Tournament[]): void {
  try {
    const publicSafe = tournaments.map((t) => ({
      ...t,
      room_id: '',
      room_pass: '',
    }));
    window.localStorage.setItem(TOURNAMENTS_CACHE_KEY, JSON.stringify(publicSafe));
    window.localStorage.setItem(CACHE_TIME_KEY, new Date().toISOString());
  } catch {
    // Ignore storage quota errors
  }
}

export function loadCachedTournaments(): { tournaments: Tournament[]; cachedAt: string | null } {
  try {
    const raw = window.localStorage.getItem(TOURNAMENTS_CACHE_KEY);
    if (!raw) return { tournaments: [], cachedAt: null };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { tournaments: [], cachedAt: null };
    return {
      tournaments: parsed as Tournament[],
      cachedAt: window.localStorage.getItem(CACHE_TIME_KEY),
    };
  } catch {
    return { tournaments: [], cachedAt: null };
  }
}

export function getPreferredArenaFilter(): 'all' | 'live' | 'upcoming' | 'completed' {
  try {
    const val = window.localStorage.getItem(PREF_FILTER_KEY);
    if (val === 'live' || val === 'upcoming' || val === 'completed' || val === 'all') {
      return val;
    }
  } catch {
    // Ignore
  }
  return 'all';
}

export function setPreferredArenaFilter(val: 'all' | 'live' | 'upcoming' | 'completed'): void {
  try {
    window.localStorage.setItem(PREF_FILTER_KEY, val);
  } catch {
    // Ignore
  }
}

export function getPreferredPayMethod(): 'jazzcash' | 'easypaisa' | 'bank_transfer' {
  try {
    const val = window.localStorage.getItem(PREF_PAY_METHOD_KEY);
    if (val === 'jazzcash' || val === 'easypaisa' || val === 'bank_transfer') {
      return val;
    }
  } catch {
    // Ignore
  }
  return 'jazzcash';
}

export function setPreferredPayMethod(val: 'jazzcash' | 'easypaisa' | 'bank_transfer'): void {
  try {
    window.localStorage.setItem(PREF_PAY_METHOD_KEY, val);
  } catch {
    // Ignore
  }
}

export type TournamentStatus = 'upcoming' | 'live' | 'completed' | 'cancelled';

export const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
export const PKT_TIMEZONE = 'Asia/Karachi';
const DEFAULT_NO_END_DURATION_MS = 3 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Converts a Pakistan Standard Time (UTC+5) calendar date ("YYYY-MM-DD")
 * and 24-hour time ("HH:mm") into an unambiguous UTC ISO-8601 string.
 */
export function pktDateTimeToIso(dateStr: string, timeStr: string): string | null {
  const cleanDate = dateStr.trim();
  const cleanTime = timeStr.trim();
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanDate);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(cleanTime);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  // Verify calendar day did not roll over (e.g., Feb 30)
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  const utcMs = check.getTime() - PKT_OFFSET_MS;
  return new Date(utcMs).toISOString();
}

/**
 * Converts any ISO timestamp into Pakistan Standard Time (UTC+5) date and time strings
 * suitable for HTML <input type="date"> and <input type="time">.
 */
export function isoToPktParts(iso: string | null | undefined): { date: string; time: string } {
  const parsed = iso ? Date.parse(iso) : NaN;
  const baseMs = Number.isFinite(parsed) ? parsed : Date.now();
  const pkt = new Date(baseMs + PKT_OFFSET_MS);
  return {
    date: `${pkt.getUTCFullYear()}-${pad2(pkt.getUTCMonth() + 1)}-${pad2(pkt.getUTCDate())}`,
    time: `${pad2(pkt.getUTCHours())}:${pad2(pkt.getUTCMinutes())}`,
  };
}

/**
 * Returns default PKT date & time strings rounded up cleanly from now + offsetHours.
 */
export function getDefaultPktSchedule(offsetHours = 2): { date: string; time: string } {
  const targetMs = Date.now() + offsetHours * 60 * 60 * 1000;
  // Round to nearest 15 minutes for cleaner UX
  const step = 15 * 60 * 1000;
  const roundedMs = Math.ceil(targetMs / step) * step;
  return isoToPktParts(new Date(roundedMs).toISOString());
}

/**
 * Adds a number of hours to a PKT date/time pair and returns the resulting PKT date/time pair.
 */
export function addHoursToPktParts(
  dateStr: string,
  timeStr: string,
  hours: number
): { date: string; time: string } | null {
  const iso = pktDateTimeToIso(dateStr, timeStr);
  if (!iso) return null;
  const nextMs = Date.parse(iso) + hours * 60 * 60 * 1000;
  return isoToPktParts(new Date(nextMs).toISOString());
}

/**
 * Formats an ISO timestamp in Pakistan Standard Time (UTC+5): e.g., "Nov 22, 2026 · 8:00 PM PKT"
 */
export function formatPktDateTime(iso: string | null | undefined): string {
  if (!iso) return 'TBA';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const datePart = date.toLocaleDateString('en-US', {
    timeZone: PKT_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    timeZone: PKT_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} · ${timePart} PKT`;
}

/**
 * Formats a compact PKT label for dense cards: e.g., "Nov 22 · 8:00 PM PKT"
 */
export function formatPktCompact(iso: string | null | undefined): string {
  if (!iso) return 'TBA';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const datePart = date.toLocaleDateString('en-US', {
    timeZone: PKT_TIMEZONE,
    month: 'short',
    day: 'numeric',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    timeZone: PKT_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} · ${timePart} PKT`;
}

/**
 * Formats a start & optional end schedule cleanly in PKT.
 */
export function formatPktScheduleRange(
  startIso: string | null | undefined,
  endIso?: string | null
): string {
  if (!startIso) return 'TBA';
  const startDate = new Date(startIso);
  if (Number.isNaN(startDate.getTime())) return startIso;

  if (!endIso) {
    return formatPktDateTime(startIso);
  }
  const endDate = new Date(endIso);
  if (Number.isNaN(endDate.getTime())) {
    return formatPktDateTime(startIso);
  }

  const startParts = isoToPktParts(startIso);
  const endParts = isoToPktParts(endIso);

  const startTimeStr = startDate.toLocaleTimeString('en-US', {
    timeZone: PKT_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const endTimeStr = endDate.toLocaleTimeString('en-US', {
    timeZone: PKT_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (startParts.date === endParts.date) {
    const dayStr = startDate.toLocaleDateString('en-US', {
      timeZone: PKT_TIMEZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${dayStr} · ${startTimeStr} – ${endTimeStr} PKT`;
  }

  const startShortDay = startDate.toLocaleDateString('en-US', {
    timeZone: PKT_TIMEZONE,
    month: 'short',
    day: 'numeric',
  });
  const endShortDay = endDate.toLocaleDateString('en-US', {
    timeZone: PKT_TIMEZONE,
    month: 'short',
    day: 'numeric',
  });
  return `${startShortDay}, ${startTimeStr} – ${endShortDay}, ${endTimeStr} PKT`;
}

/**
 * Automatically computes tournament status ('upcoming', 'live' = Ongoing, 'completed')
 * from start and optional end date/time, while respecting manual 'cancelled'
 * or finalized 'completed' states.
 */
export function computeTournamentStatus(
  tournament: {
    match_time: string;
    end_time?: string | null;
    status: TournamentStatus;
    winners?: unknown[];
  },
  nowMs: number = Date.now()
): TournamentStatus {
  if (tournament.status === 'cancelled') return 'cancelled';

  const startMs = Date.parse(tournament.match_time);
  const hasWinners = Array.isArray(tournament.winners) && tournament.winners.length > 0;

  if (tournament.status === 'completed') {
    if (hasWinners || !Number.isFinite(startMs) || nowMs >= startMs) {
      return 'completed';
    }
  }

  if (!Number.isFinite(startMs)) return tournament.status;

  if (nowMs < startMs) {
    return 'upcoming';
  }

  const endMs = tournament.end_time ? Date.parse(tournament.end_time) : NaN;
  if (Number.isFinite(endMs)) {
    return nowMs < endMs ? 'live' : 'completed';
  }

  return nowMs < startMs + DEFAULT_NO_END_DURATION_MS ? 'live' : 'completed';
}

export function getTournamentStatusLabel(status: TournamentStatus): string {
  switch (status) {
    case 'live':
      return 'Ongoing';
    case 'upcoming':
      return 'Upcoming';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
  }
}

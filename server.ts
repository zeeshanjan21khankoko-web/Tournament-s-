import 'dotenv/config';
import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  db,
  generateRegistrationCode,
  generateTicketCode,
  generateTxCode,
  generateUniquePlayerId,
  initDatabase,
  recalculateAllUserPoints,
} from './server/db.ts';
import {
  type AuthenticatedRequest,
  clearSessionCookie,
  createPersistentSession,
  extractBearerUser,
  getUserById,
  hashPassword,
  isAdminPasscodeConfigured,
  requireAdmin,
  requireAuth,
  resolveAuthToken,
  revokePersistentSession,
  setSessionCookie,
  signToken,
  verifyAdminPasscode,
  verifyPassword,
} from './server/auth.ts';
import {
  computeTournamentStatus,
  type TournamentStatus,
} from './shared/pktTime.ts';

initDatabase();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));

const ALLOWED_AVATARS = new Set([
  '/src/assets/images/avatar_esports_pro_1795298801657.jpg',
  '/src/assets/images/tournament_pubg_arena_1795298801850.jpg',
  '/src/assets/images/tournament_valorant_cyber_1795298801660.jpg',
  '/src/assets/images/tournament_freefire_clash_1795298801818.jpg',
  '/src/assets/images/kelly_hero_banner_1795312122819.jpg',
  '/src/assets/images/kelly_tournament_banner_1795312123415.jpg',
  '/src/assets/images/clash_squad_arena_1795312122438.jpg',
]);

const ALLOWED_MODES = ['Battle Royale', 'Clash Squad', 'Lone Wolf'] as const;
type TournamentModeValue = (typeof ALLOWED_MODES)[number];

function normalizeMode(value: unknown): TournamentModeValue {
  if (typeof value === 'string' && (ALLOWED_MODES as readonly string[]).includes(value)) {
    return value as TournamentModeValue;
  }
  return 'Battle Royale';
}

function validateImageInput(value: unknown, maxBytes = 2 * 1024 * 1024): string | null {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (ALLOWED_AVATARS.has(trimmed)) return trimmed;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    const base64Part = trimmed.split(',')[1] || '';
    const approxBytes = Math.floor((base64Part.length * 3) / 4);
    if (approxBytes > maxBytes) {
      return null;
    }
    return trimmed;
  }
  return null;
}

function sanitizeBannerUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return '/src/assets/images/kelly_tournament_banner_1795312123415.jpg';
  }
  const trimmed = value.trim();
  if (ALLOWED_AVATARS.has(trimmed)) return trimmed;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed;
  }
  return '/src/assets/images/kelly_tournament_banner_1795312123415.jpg';
}

const YOUTUBE_ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

function extractYouTubeVideoId(rawUrl: unknown): { videoId: string; normalizedUrl: string } | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 500) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_ALLOWED_HOSTS.has(host)) return null;

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

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  return {
    videoId,
    normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

const PAYMENT_CHANNELS = [
  {
    id: 'jazzcash',
    name: 'JazzCash Mobile Account',
    accountTitle: 'FREE FIRE TOURNAMENT 09',
    accountNumber: '03406690336',
    providerLabel: 'JazzCash (Mobilink Microfinance)',
    instructions: [
      'Open your JazzCash mobile app or dial *786#.',
      'Select Money Transfer -> Send to JazzCash Account.',
      'Enter account number 03406690336 and verify the recipient details.',
      'Copy the TID (Transaction ID) from your SMS confirmation and enter or upload it below.',
    ],
  },
  {
    id: 'easypaisa',
    name: 'Easypaisa Mobile Wallet',
    accountTitle: 'FREE FIRE TOURNAMENT 09',
    accountNumber: '03489674834',
    providerLabel: 'Easypaisa (Telenor Microfinance)',
    instructions: [
      'Open Easypaisa App -> Send Money -> Easypaisa Transfer.',
      'Transfer exact PKR amount to 03489674834.',
      'Save the Trx ID (e.g. EP-92837412) and capture a screenshot of the receipt.',
      'Submit the form below for admin verification within 5–15 minutes.',
    ],
  },
];

// --- HEALTH & PUBLIC CONFIG ---
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

function findAvailableApk(): { filePath: string; fileName: string; sizeBytes: number } | null {
  const candidateDirs = [
    path.resolve(process.cwd(), 'public', 'downloads'),
    path.resolve(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'release'),
    path.resolve(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'debug'),
  ];

  for (const dir of candidateDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir);
      const apkFiles = entries
        .filter((name) => name.toLowerCase().endsWith('.apk') && !name.startsWith('.'))
        .sort();
      for (const fileName of apkFiles) {
        const fullPath = path.join(dir, fileName);
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && stat.size > 100 * 1024) {
          return {
            filePath: fullPath,
            fileName,
            sizeBytes: stat.size,
          };
        }
      }
    } catch {
      // Ignore unreadable directories
    }
  }
  return null;
}

app.get('/api/app-download/status', (_req: Request, res: Response) => {
  const apk = findAvailableApk();
  res.json({
    apkAvailable: Boolean(apk),
    fileName: apk ? apk.fileName : null,
    sizeBytes: apk ? apk.sizeBytes : null,
    downloadUrl: apk ? '/api/app-download/apk' : null,
    appName: 'FREE FIRE TOURNAMENT 09',
    shortName: 'FF Tourney09',
    iconUrl: '/pwa-192x192.png',
    installMode: apk ? 'apk_and_pwa' : 'pwa',
  });
});

app.get('/api/app-download/apk', (_req: Request, res: Response) => {
  const apk = findAvailableApk();
  if (!apk) {
    res.status(404).json({
      error: 'No Android APK file is hosted on this server. Use Install App (PWA) for Home Screen installation.',
    });
    return;
  }
  const safeName = path.basename(apk.fileName).replace(/[^A-Za-z0-9._-]/g, '_');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.setHeader('Content-Length', String(apk.sizeBytes));
  res.sendFile(apk.filePath);
});

app.get('/api/payment-channels', (_req: Request, res: Response) => {
  res.json({ paymentChannels: PAYMENT_CHANNELS });
});

// --- PUBLIC ANNOUNCEMENTS & MATCH RESULTS ---
app.get('/api/announcements', (_req: Request, res: Response) => {
  const announcements = db
    .prepare(
      `SELECT a.id, a.title, a.category, a.tournament_id, t.title as tournament_title,
              a.content, a.is_pinned, a.created_at
       FROM announcements a
       LEFT JOIN tournaments t ON t.id = a.tournament_id
       ORDER BY a.is_pinned DESC, a.id DESC
       LIMIT 30`
    )
    .all();
  res.json({ announcements });
});

// --- PUBLIC YOUTUBE VIDEOS ---
app.get('/api/videos', (_req: Request, res: Response) => {
  const videos = db
    .prepare(
      `SELECT id, title, youtube_url, video_id, is_featured, created_at, updated_at
       FROM youtube_videos
       ORDER BY is_featured DESC, id DESC
       LIMIT 24`
    )
    .all() as Array<{
    id: number;
    title: string;
    youtube_url: string;
    video_id: string;
    is_featured: number;
    created_at: string;
    updated_at: string;
  }>;
  const featuredVideo = videos.find((v) => v.is_featured === 1) || videos[0] || null;
  res.json({ videos, featuredVideo });
});

// --- PUBLIC TOURNAMENT LEADERBOARD ---
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

function parseDbTimestampMs(raw: unknown): number {
  if (typeof raw !== 'string') return 0;
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const normalized = trimmed.includes('T') ? trimmed : `${trimmed.replace(' ', 'T')}Z`;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPktWindowStartMs(period: 'daily' | 'weekly' | 'monthly' | 'all'): number {
  if (period === 'all') return 0;
  const pktNow = new Date(Date.now() + PKT_OFFSET_MS);
  const startOfTodayPktMs =
    Date.UTC(pktNow.getUTCFullYear(), pktNow.getUTCMonth(), pktNow.getUTCDate()) - PKT_OFFSET_MS;
  if (period === 'daily') return startOfTodayPktMs;
  if (period === 'weekly') return startOfTodayPktMs - 6 * 24 * 60 * 60 * 1000;
  return startOfTodayPktMs - 29 * 24 * 60 * 60 * 1000;
}

app.get('/api/leaderboard', (req: Request, res: Response) => {
  try {
    const rawPeriod = typeof req.query.period === 'string' ? req.query.period.trim().toLowerCase() : 'all';
    const period: 'daily' | 'weekly' | 'monthly' | 'all' =
      rawPeriod === 'daily' || rawPeriod === 'weekly' || rawPeriod === 'monthly' ? rawPeriod : 'all';

    const rawMode = typeof req.query.mode === 'string' ? req.query.mode.trim() : 'all';
    const modeFilter =
      rawMode !== 'all' && (ALLOWED_MODES as readonly string[]).includes(rawMode)
        ? (rawMode as TournamentModeValue)
        : 'all';

    const windowStartMs = getPktWindowStartMs(period);
    const viewer = extractBearerUser(req);

    const userRows = db
      .prepare(
        `SELECT u.id, u.player_id, u.username, u.avatar_url, u.role, u.matches_played, u.wins, u.kills, u.points,
                COALESCE(w.total_won, 0) as total_won
         FROM users u
         LEFT JOIN wallet_accounts w ON w.user_id = u.id
         WHERE u.is_blocked = 0`
      )
      .all() as Array<{
      id: number;
      player_id: string;
      username: string;
      avatar_url: string;
      role: 'player' | 'admin';
      matches_played: number;
      wins: number;
      kills: number;
      points: number;
      total_won: number;
    }>;

    const regRows = db
      .prepare(
        `SELECT tr.user_id, tr.registered_at, t.mode, t.match_time
         FROM tournament_registrations tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE t.status != 'cancelled'`
      )
      .all() as Array<{
      user_id: number;
      registered_at: string;
      mode: string;
      match_time: string;
    }>;

    const winnerRows = db
      .prepare(
        `SELECT w.user_id, w.placement, w.prize_amount, w.declared_at, t.mode
         FROM winners w
         JOIN tournaments t ON t.id = w.tournament_id
         WHERE t.status != 'cancelled'`
      )
      .all() as Array<{
      user_id: number;
      placement: number;
      prize_amount: number;
      declared_at: string;
      mode: string;
    }>;

    const regMap = new Map<number, number>();
    for (const r of regRows) {
      if (modeFilter !== 'all' && normalizeMode(r.mode) !== modeFilter) continue;
      if (windowStartMs > 0) {
        const regMs = parseDbTimestampMs(r.registered_at);
        const matchMs = parseDbTimestampMs(r.match_time);
        if (Math.max(regMs, matchMs) < windowStartMs) continue;
      }
      regMap.set(r.user_id, (regMap.get(r.user_id) || 0) + 1);
    }

    const winMap = new Map<
      number,
      { p1: number; p2: number; p3: number; p4: number; p5: number; total: number; prizeSum: number }
    >();
    for (const w of winnerRows) {
      if (modeFilter !== 'all' && normalizeMode(w.mode) !== modeFilter) continue;
      if (windowStartMs > 0 && parseDbTimestampMs(w.declared_at) < windowStartMs) continue;
      const cur = winMap.get(w.user_id) || {
        p1: 0,
        p2: 0,
        p3: 0,
        p4: 0,
        p5: 0,
        total: 0,
        prizeSum: 0,
      };
      if (w.placement === 1) cur.p1 += 1;
      else if (w.placement === 2) cur.p2 += 1;
      else if (w.placement === 3) cur.p3 += 1;
      else if (w.placement === 4) cur.p4 += 1;
      else if (w.placement === 5) cur.p5 += 1;
      cur.total += 1;
      cur.prizeSum += Number(w.prize_amount || 0);
      winMap.set(w.user_id, cur);
    }

    const isUnfilteredAllTime = period === 'all' && modeFilter === 'all';
    const ranked = userRows
      .map((u) => {
        const regCount = regMap.get(u.id) || 0;
        const wStat = winMap.get(u.id) || {
          p1: 0,
          p2: 0,
          p3: 0,
          p4: 0,
          p5: 0,
          total: 0,
          prizeSum: 0,
        };
        const matches = isUnfilteredAllTime
          ? Math.max(regCount, Number(u.matches_played || 0), wStat.total)
          : Math.max(regCount, wStat.total);
        const wins = isUnfilteredAllTime
          ? Math.max(wStat.p1, Number(u.wins || 0))
          : wStat.p1;
        const losses = Math.max(0, matches - wins);
        const winRate =
          matches > 0 ? Math.min(100, Math.round((wins / matches) * 1000) / 10) : 0;
        const extraAdminWins = isUnfilteredAllTime ? Math.max(0, wins - wStat.p1) : 0;
        const points =
          wStat.p1 * 100 +
          wStat.p2 * 60 +
          wStat.p3 * 40 +
          wStat.p4 * 25 +
          wStat.p5 * 15 +
          extraAdminWins * 100 +
          matches * 10;
        const totalPrizeWon = isUnfilteredAllTime
          ? Math.max(wStat.prizeSum, Number(u.total_won || 0))
          : wStat.prizeSum;
        const podiums = wStat.p1 + wStat.p2 + wStat.p3 + wStat.p4 + wStat.p5;

        return {
          user_id: u.id,
          role: u.role,
          player_id: u.player_id,
          username: u.username,
          avatar_url: u.avatar_url || '/src/assets/images/avatar_esports_pro_1795298801657.jpg',
          points,
          matches,
          wins,
          kills: Number(u.kills || 0),
          losses,
          win_rate: winRate,
          first_places: wStat.p1,
          second_places: wStat.p2,
          third_places: wStat.p3,
          fourth_places: wStat.p4,
          fifth_places: wStat.p5,
          podiums,
          total_prize_won: totalPrizeWon,
        };
      })
      .filter((entry) => {
        const hasActivity = entry.matches > 0 || entry.wins > 0 || entry.points > 0;
        if (!isUnfilteredAllTime) return hasActivity;
        return entry.role === 'player' || hasActivity;
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.podiums !== a.podiums) return b.podiums - a.podiums;
        if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate;
        if (b.total_prize_won !== a.total_prize_won) return b.total_prize_won - a.total_prize_won;
        if (b.matches !== a.matches) return b.matches - a.matches;
        return a.user_id - b.user_id;
      })
      .map((entry, idx) => {
        const { role: _role, ...publicEntry } = entry;
        return {
          rank: idx + 1,
          ...publicEntry,
        };
      });

    const summary = {
      totalPlayers: ranked.length,
      totalMatches: ranked.reduce((sum, r) => sum + r.matches, 0),
      totalWins: ranked.reduce((sum, r) => sum + r.wins, 0),
      totalPrizesDistributed: ranked.reduce((sum, r) => sum + r.total_prize_won, 0),
      topScore: ranked[0]?.points ?? 0,
    };

    const viewerEntry = viewer ? ranked.find((r) => r.user_id === viewer.id) || null : null;

    res.json({
      period,
      mode: modeFilter,
      leaderboard: ranked,
      summary,
      viewerEntry,
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Failed to load tournament leaderboard.' });
  }
});

// --- PUBLIC TEAM REGISTRATION & LOOKUP ---
app.get('/api/team-registrations', (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code.trim().toUpperCase() : '';
  if (code) {
    const record = db
      .prepare(
        `SELECT tr.id, tr.registration_code, tr.tournament_id, t.title as tournament_title,
                t.mode as tournament_mode, t.match_time, tr.leader_name, tr.freefire_uid,
                tr.team_name, tr.squad_type, tr.teammates, tr.payment_method, tr.payment_ref,
                tr.status, tr.created_at
         FROM team_registrations tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE upper(tr.registration_code) = ?`
      )
      .get(code);
    if (!record) {
      res.status(404).json({ error: 'No registration found with that code.' });
      return;
    }
    res.json({ registration: record });
    return;
  }

  const registrations = db
    .prepare(
      `SELECT tr.id, tr.registration_code, tr.tournament_id, t.title as tournament_title,
              t.mode as tournament_mode, t.match_time, tr.leader_name, tr.freefire_uid,
              tr.team_name, tr.squad_type, tr.payment_method, tr.status, tr.created_at
       FROM team_registrations tr
       JOIN tournaments t ON t.id = tr.tournament_id
       WHERE tr.status != 'rejected'
       ORDER BY tr.id DESC
       LIMIT 25`
    )
    .all();
  res.json({ registrations });
});

app.post('/api/team-registrations', (req: Request, res: Response) => {
  try {
    const viewer = extractBearerUser(req);
    const tournamentId = Number(req.body.tournamentId);
    const leaderName = typeof req.body.leaderName === 'string' ? req.body.leaderName.trim() : '';
    const freefireUid = typeof req.body.freefireUid === 'string' ? req.body.freefireUid.trim() : '';
    const whatsappNumber = typeof req.body.whatsappNumber === 'string' ? req.body.whatsappNumber.trim() : '';
    const teamName = typeof req.body.teamName === 'string' ? req.body.teamName.trim() : '';
    const squadType = ['Solo', 'Duo', 'Squad'].includes(req.body.squadType) ? req.body.squadType : 'Squad';
    const teammates = typeof req.body.teammates === 'string' ? req.body.teammates.trim().slice(0, 500) : '';
    const reqPaymentMethod = typeof req.body.paymentMethod === 'string' ? req.body.paymentMethod.trim() : '';
    const paymentRef = typeof req.body.paymentRef === 'string' ? req.body.paymentRef.trim().toUpperCase() : '';

    if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
      res.status(400).json({ error: 'Please select a valid Free Fire tournament.' });
      return;
    }
    if (leaderName.length < 2 || leaderName.length > 50) {
      res.status(400).json({ error: 'Player / captain name must be 2–50 characters.' });
      return;
    }
    if (freefireUid.length < 5 || freefireUid.length > 24 || !/^[a-zA-Z0-9_-]+$/.test(freefireUid)) {
      res.status(400).json({ error: 'Enter a valid Free Fire UID (5–24 digits/characters).' });
      return;
    }
    if (whatsappNumber.length < 8 || whatsappNumber.length > 20 || !/^[0-9+\-\s()]+$/.test(whatsappNumber)) {
      res.status(400).json({ error: 'Enter a valid WhatsApp number (e.g. 03XX-XXXXXXX).' });
      return;
    }
    if (teamName.length < 2 || teamName.length > 48) {
      res.status(400).json({ error: 'Team / clan name must be 2–48 characters.' });
      return;
    }

    const result = db.transaction(() => {
      const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as
        | {
            id: number;
            title: string;
            entry_fee: number;
            max_slots: number;
            filled_slots: number;
            match_time: string;
            end_time: string;
            status: TournamentStatus;
          }
        | undefined;
      if (!t) return { status: 404, error: 'Selected tournament was not found.' };

      const hasWinners = db.prepare('SELECT 1 FROM winners WHERE tournament_id = ? LIMIT 1').get(tournamentId);
      const effectiveStatus = computeTournamentStatus({
        match_time: t.match_time,
        end_time: t.end_time,
        status: t.status,
        winners: hasWinners ? [hasWinners] : [],
      });
      if (effectiveStatus !== 'upcoming' && effectiveStatus !== 'live') {
        return { status: 400, error: 'Registration is closed for this tournament.' };
      }
      if (t.filled_slots >= t.max_slots) {
        return { status: 400, error: 'This tournament has reached maximum slot capacity.' };
      }

      const duplicateUid = db
        .prepare(
          "SELECT id FROM team_registrations WHERE tournament_id = ? AND lower(freefire_uid) = lower(?) AND status != 'rejected'"
        )
        .get(tournamentId, freefireUid);
      if (duplicateUid) {
        return { status: 409, error: 'This Free Fire UID is already registered for the selected tournament.' };
      }

      let paymentMethod: 'free' | 'wallet' | 'jazzcash' | 'easypaisa';
      let regStatus: 'pending' | 'confirmed' = 'pending';
      let finalRef = paymentRef;

      if (t.entry_fee === 0) {
        paymentMethod = 'free';
        regStatus = 'confirmed';
        finalRef = 'FREE-ENTRY';
      } else if (reqPaymentMethod === 'wallet') {
        if (!viewer) {
          return { status: 401, error: 'Sign in first to pay entry fee from your Wallet Balance.' };
        }
        const wallet = db
          .prepare('SELECT available_balance, pending_withdrawal FROM wallet_accounts WHERE user_id = ?')
          .get(viewer.id) as { available_balance: number; pending_withdrawal: number } | undefined;
        const available = wallet ? Math.max(0, wallet.available_balance - wallet.pending_withdrawal) : 0;
        if (available < t.entry_fee) {
          return {
            status: 400,
            error: `Insufficient spendable balance. Required: PKR ${t.entry_fee}, Available: PKR ${available}.`,
          };
        }

        const nextBal = available - t.entry_fee;
        db.prepare('UPDATE users SET wallet_balance = ?, matches_played = matches_played + 1 WHERE id = ?').run(
          nextBal,
          viewer.id
        );
        db.prepare(
          "UPDATE wallet_accounts SET available_balance = ?, updated_at = datetime('now') WHERE user_id = ?"
        ).run(nextBal, viewer.id);
        db.prepare(
          `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
           VALUES (?, ?, 'entry_fee', ?, 'debit', ?, 'completed', ?, ?)`
        ).run(
          generateTxCode(),
          viewer.id,
          t.entry_fee,
          nextBal,
          `TOUR-${tournamentId}`,
          `Team entry (${teamName}) for ${t.title}`
        );

        paymentMethod = 'wallet';
        regStatus = 'confirmed';
        finalRef = `WALLET-${viewer.player_id}`;
      } else {
        if (!['jazzcash', 'easypaisa'].includes(reqPaymentMethod)) {
          return { status: 400, error: 'Select JazzCash, Easypaisa, or Wallet payment method.' };
        }
        if (finalRef.length < 4 || finalRef.length > 64 || !/^[A-Z0-9_-]+$/.test(finalRef)) {
          return {
            status: 400,
            error: 'Enter a valid Transaction ID (TID) from JazzCash or Easypaisa (4–64 characters).',
          };
        }
        const dupTid = db
          .prepare("SELECT id FROM team_registrations WHERE payment_ref = ? AND status != 'rejected'")
          .get(finalRef);
        if (dupTid) {
          return { status: 409, error: 'This Transaction ID (TID) has already been used for a registration.' };
        }
        paymentMethod = reqPaymentMethod as 'jazzcash' | 'easypaisa';
        regStatus = 'pending';
      }

      const regCode = generateRegistrationCode();
      const info = db
        .prepare(
          `INSERT INTO team_registrations (
             registration_code, tournament_id, user_id, leader_name, freefire_uid,
             whatsapp_number, team_name, squad_type, teammates, payment_method, payment_ref, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          regCode,
          tournamentId,
          viewer?.id ?? null,
          leaderName,
          freefireUid,
          whatsappNumber,
          teamName,
          squadType,
          teammates,
          paymentMethod,
          finalRef,
          regStatus
        );

      if (regStatus === 'confirmed') {
        db.prepare('UPDATE tournaments SET filled_slots = filled_slots + 1 WHERE id = ?').run(tournamentId);
      }

      const created = db
        .prepare(
          `SELECT tr.id, tr.registration_code, tr.tournament_id, t.title as tournament_title,
                  t.mode as tournament_mode, t.match_time, tr.leader_name, tr.freefire_uid,
                  tr.team_name, tr.squad_type, tr.teammates, tr.payment_method, tr.payment_ref,
                  tr.status, tr.created_at
           FROM team_registrations tr
           JOIN tournaments t ON t.id = tr.tournament_id
           WHERE tr.id = ?`
        )
        .get(Number(info.lastInsertRowid));

      return { status: 201, registration: created };
    }).immediate();

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    recalculateAllUserPoints();
    res.status(201).json({
      ok: true,
      registration: result.registration,
      message:
        result.registration && (result.registration as { status: string }).status === 'confirmed'
          ? 'Team slot confirmed! Room details will arrive on WhatsApp before match start.'
          : 'Registration submitted! An admin will verify your TID and confirm your team slot shortly.',
    });
  } catch (err) {
    console.error('Team registration error:', err);
    res.status(500).json({ error: 'Failed to submit team registration.' });
  }
});

// --- PUBLIC CONTACT / SUPPORT ---
app.post('/api/contact', (req: Request, res: Response) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const whatsappNumber = typeof req.body.whatsappNumber === 'string' ? req.body.whatsappNumber.trim() : '';
    const freefireUid = typeof req.body.freefireUid === 'string' ? req.body.freefireUid.trim() : '';
    const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : '';
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';

    if (name.length < 2 || name.length > 60) {
      res.status(400).json({ error: 'Your name must be 2–60 characters.' });
      return;
    }
    if (whatsappNumber.length < 8 || whatsappNumber.length > 20 || !/^[0-9+\-\s()]+$/.test(whatsappNumber)) {
      res.status(400).json({ error: 'Please provide a valid WhatsApp number so we can reply.' });
      return;
    }
    if (subject.length < 3 || subject.length > 100) {
      res.status(400).json({ error: 'Subject must be 3–100 characters.' });
      return;
    }
    if (message.length < 8 || message.length > 1000) {
      res.status(400).json({ error: 'Message must be between 8 and 1000 characters.' });
      return;
    }

    const ticketCode = generateTicketCode();
    db.prepare(
      `INSERT INTO contact_messages (ticket_code, name, whatsapp_number, freefire_uid, subject, message)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(ticketCode, name, whatsappNumber, freefireUid.slice(0, 32), subject, message);

    res.status(201).json({
      ok: true,
      ticketCode,
      message: 'Message received! Our FREE FIRE TOURNAMENT 09 team will contact you on WhatsApp shortly.',
    });
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

// --- AUTH & BOOTSTRAP ---
app.get('/api/auth/bootstrap-status', (_req: Request, res: Response) => {
  const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as {
    count: number;
  };
  res.json({
    adminClaimed: adminCount.count > 0,
    passcodeConfigured: isAdminPasscodeConfigured(),
  });
});

app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim().slice(0, 24) : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const avatarChecked = validateImageInput(req.body.avatarUrl || '/src/assets/images/avatar_esports_pro_1795298801657.jpg', 1024 * 1024);

    if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      res.status(400).json({
        error: 'Username must be 3–24 characters using letters, numbers, underscores, dots, or hyphens.',
      });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) {
      res.status(400).json({ error: 'Please enter a valid phone number.' });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }
    if (avatarChecked === null) {
      res.status(400).json({ error: 'Avatar image must be PNG/JPEG/WEBP under 1MB.' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE lower(email) = ? OR lower(username) = ?')
      .get(email, username.toLowerCase());
    if (existing) {
      res.status(409).json({ error: 'Username or email is already registered.' });
      return;
    }

    const playerId = generateUniquePlayerId();
    const passwordHash = hashPassword(password);
    const avatarUrl = avatarChecked || '/src/assets/images/avatar_esports_pro_1795298801657.jpg';

    const userId = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO users (player_id, username, email, phone, password_hash, avatar_url, role, wallet_balance)
           VALUES (?, ?, ?, ?, ?, ?, 'player', 0)`
        )
        .run(playerId, username, email, phone, passwordHash, avatarUrl);
      const newId = Number(info.lastInsertRowid);
      db.prepare('INSERT INTO wallet_accounts (user_id, available_balance) VALUES (?, 0)').run(newId);
      return newId;
    }).immediate();

    const user = getUserById(userId)!;
    const sessionToken = createPersistentSession(user.id);
    setSessionCookie(req, res, sessionToken);
    const token = signToken(user.id, user.role);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const identifier = typeof req.body.identifier === 'string' ? req.body.identifier.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!identifier || !password) {
      res.status(400).json({ error: 'Username/email and password are required.' });
      return;
    }

    const row = db
      .prepare(
        `SELECT id, password_hash, role, is_blocked
         FROM users
         WHERE lower(email) = ? OR lower(username) = ?`
      )
      .get(identifier, identifier) as
      | { id: number; password_hash: string; role: 'player' | 'admin'; is_blocked: number }
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }
    if (row.is_blocked === 1) {
      res.status(403).json({ error: 'Your account is blocked. Contact an administrator.' });
      return;
    }

    const user = getUserById(row.id)!;
    const sessionToken = createPersistentSession(user.id);
    setSessionCookie(req, res, sessionToken);
    const token = signToken(user.id, user.role);
    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Sign in failed.' });
  }
});

app.post('/api/auth/claim-admin', (req: Request, res: Response) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const passcode = typeof req.body.passcode === 'string' ? req.body.passcode.trim() : '';

    const passcodeRequired = isAdminPasscodeConfigured();
    if (passcodeRequired && !verifyAdminPasscode(passcode)) {
      res.status(403).json({ error: 'Invalid server admin passcode.' });
      return;
    }

    if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      res.status(400).json({ error: 'Admin username must be 3–24 valid characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Valid admin email is required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const result = db.transaction(() => {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as {
        count: number;
      };
      if (!passcodeRequired && adminCount.count > 0) {
        return { conflict: 'Initial admin has already been claimed. Sign in with your admin account.' };
      }

      const duplicate = db
        .prepare('SELECT id FROM users WHERE lower(email) = ? OR lower(username) = ?')
        .get(email, username.toLowerCase());
      if (duplicate) {
        return { duplicate: 'That username or email is already in use.' };
      }

      const playerId = generateUniquePlayerId();
      const passwordHash = hashPassword(password);
      const info = db
        .prepare(
          `INSERT INTO users (player_id, username, email, password_hash, avatar_url, role, wallet_balance)
           VALUES (?, ?, ?, ?, ?, 'admin', 0)`
        )
        .run(
          playerId,
          username,
          email,
          passwordHash,
          '/src/assets/images/avatar_esports_pro_1795298801657.jpg'
        );
      const newId = Number(info.lastInsertRowid);
      db.prepare('INSERT INTO wallet_accounts (user_id, available_balance) VALUES (?, 0)').run(newId);
      db.prepare("INSERT INTO admins (user_id, admin_level) VALUES (?, 'super_admin')").run(newId);
      return { userId: newId };
    }).immediate();

    if ('conflict' in result) {
      res.status(403).json({ error: result.conflict });
      return;
    }
    if ('duplicate' in result) {
      res.status(409).json({ error: result.duplicate });
      return;
    }

    const user = getUserById(result.userId)!;
    const sessionToken = createPersistentSession(user.id);
    setSessionCookie(req, res, sessionToken);
    const token = signToken(user.id, 'admin');
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Claim admin error:', err);
    res.status(500).json({ error: 'Admin setup failed.' });
  }
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const resolved = resolveAuthToken(req);
  if (resolved) {
    revokePersistentSession(resolved.token);
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const wallet = db
    .prepare('SELECT * FROM wallet_accounts WHERE user_id = ?')
    .get(req.user!.id);
  const token = signToken(req.user!.id, req.user!.role);
  res.json({ token, user: req.user, wallet });
});

app.patch('/api/auth/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : req.user!.username;
    const phone =
      req.body.phone !== undefined
        ? (typeof req.body.phone === 'string' ? req.body.phone.trim() : '')
        : req.user!.phone;
    const avatarChecked =
      req.body.avatarUrl !== undefined
        ? validateImageInput(req.body.avatarUrl, 1024 * 1024)
        : req.user!.avatar_url;

    if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      res.status(400).json({ error: 'Username must be 3–24 valid characters.' });
      return;
    }
    if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) {
      res.status(400).json({ error: 'Phone number must be 6–20 valid phone characters.' });
      return;
    }
    if (avatarChecked === null) {
      res.status(400).json({ error: 'Avatar image must be PNG/JPEG/WEBP under 1MB.' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE lower(username) = ? AND id != ?')
      .get(username.toLowerCase(), req.user!.id);
    if (existing) {
      res.status(409).json({ error: 'Username is already taken.' });
      return;
    }

    db.prepare('UPDATE users SET username = ?, phone = ?, avatar_url = ? WHERE id = ?').run(
      username,
      phone,
      avatarChecked,
      req.user!.id
    );
    res.json({ user: getUserById(req.user!.id) });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

app.post('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required.' });
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({ error: 'New password must be between 6 and 128 characters.' });
      return;
    }

    const userRow = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(req.user!.id) as { password_hash: string } | undefined;
    if (!userRow || !verifyPassword(currentPassword, userRow.password_hash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const nextHash = hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(nextHash, req.user!.id);
    res.json({ ok: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

// --- TOURNAMENTS ---
function enrichTournament(t: Record<string, unknown>, viewer: ReturnType<typeof extractBearerUser>) {
  const tid = Number(t.id);
  const players = db
    .prepare(
      `SELECT tr.id, tr.user_id, tr.in_game_name, tr.in_game_id, tr.slot_number, tr.status, tr.registered_at,
              u.player_id, u.username, u.avatar_url
       FROM tournament_registrations tr
       JOIN users u ON u.id = tr.user_id
       WHERE tr.tournament_id = ?
       ORDER BY tr.slot_number ASC`
    )
    .all(tid) as Array<Record<string, unknown>>;

  const winners = db
    .prepare(
      `SELECT w.id, w.placement, w.prize_amount, w.declared_at, u.id as user_id, u.player_id, u.username, u.avatar_url
       FROM winners w
       JOIN users u ON u.id = w.user_id
       WHERE w.tournament_id = ?
       ORDER BY w.placement ASC`
    )
    .all(tid);

  const effectiveStatus = computeTournamentStatus({
    match_time: String(t.match_time || ''),
    end_time: String(t.end_time || ''),
    status: (t.status as TournamentStatus) || 'upcoming',
    winners,
  });

  const isRegistered = viewer ? players.some((p) => Number(p.user_id) === viewer.id) : false;
  const canSeeRoom = viewer ? viewer.role === 'admin' || isRegistered : false;

  const rawPool = Number(t.prize_pool ?? 0);
  const rawP1 = Number(t.prize_1st ?? 0);
  const rawP2 = Number(t.prize_2nd ?? 0);
  const rawP3 = Number(t.prize_3rd ?? 0);
  const rawP4 = Number(t.prize_4th ?? 0);
  const rawP5 = Number(t.prize_5th ?? 0);
  const hasExplicitBreakdown =
    rawP1 > 0 || rawP2 > 0 || rawP3 > 0 || rawP4 > 0 || rawP5 > 0;
  const fallbackP1 = Math.round(rawPool * 0.4);
  const fallbackP2 = Math.round(rawPool * 0.25);
  const fallbackP3 = Math.round(rawPool * 0.15);
  const fallbackP4 = Math.round(rawPool * 0.12);
  const fallbackP5 = Math.max(0, rawPool - fallbackP1 - fallbackP2 - fallbackP3 - fallbackP4);

  return {
    id: t.id,
    title: t.title,
    game_name: t.game_name,
    mode: normalizeMode(t.mode),
    entry_fee: t.entry_fee,
    prize_pool: rawPool,
    prize_1st: hasExplicitBreakdown ? rawP1 : fallbackP1,
    prize_2nd: hasExplicitBreakdown ? rawP2 : fallbackP2,
    prize_3rd: hasExplicitBreakdown ? rawP3 : fallbackP3,
    prize_4th: hasExplicitBreakdown ? rawP4 : fallbackP4,
    prize_5th: hasExplicitBreakdown ? rawP5 : fallbackP5,
    max_slots: t.max_slots,
    filled_slots: t.filled_slots,
    match_time: t.match_time,
    end_time: t.end_time || '',
    status: effectiveStatus,
    banner_url: t.banner_url,
    rules: t.rules,
    room_id: canSeeRoom ? t.room_id : '',
    room_pass: canSeeRoom ? t.room_pass : '',
    created_at: t.created_at,
    is_registered: isRegistered,
    registered_players: players,
    winners,
  };
}

app.get('/api/tournaments', (req: Request, res: Response) => {
  const viewer = extractBearerUser(req);
  const rows = db.prepare('SELECT * FROM tournaments').all() as Array<Record<string, unknown>>;
  const orderRank: Record<TournamentStatus, number> = {
    live: 0,
    upcoming: 1,
    completed: 2,
    cancelled: 3,
  };
  const enriched = rows
    .map((r) => enrichTournament(r, viewer))
    .sort((a, b) => {
      const rankDiff = orderRank[a.status] - orderRank[b.status];
      if (rankDiff !== 0) return rankDiff;
      return Date.parse(String(a.match_time)) - Date.parse(String(b.match_time));
    });
  res.json({ tournaments: enriched });
});

app.get('/api/tournaments/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid tournament ID.' });
    return;
  }
  const row = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Tournament not found.' });
    return;
  }
  const viewer = extractBearerUser(req);
  res.json({ tournament: enrichTournament(row, viewer) });
});

app.post('/api/tournaments/:id/join', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournamentId = Number(req.params.id);
    const inGameName = typeof req.body.inGameName === 'string' ? req.body.inGameName.trim() : '';
    const inGameId = typeof req.body.inGameId === 'string' ? req.body.inGameId.trim() : '';

    if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
      res.status(400).json({ error: 'Invalid tournament ID.' });
      return;
    }
    if (inGameName.length < 2 || inGameName.length > 32) {
      res.status(400).json({ error: 'In-game character name must be 2–32 characters.' });
      return;
    }
    if (inGameId.length < 2 || inGameId.length > 32) {
      res.status(400).json({ error: 'In-game ID is required (2–32 characters).' });
      return;
    }

    const result = db.transaction(() => {
      const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as
        | {
            id: number;
            title: string;
            entry_fee: number;
            max_slots: number;
            filled_slots: number;
            match_time: string;
            end_time: string;
            status: TournamentStatus;
          }
        | undefined;
      if (!t) return { status: 404, error: 'Tournament not found.' };
      const hasWinners = db
        .prepare('SELECT 1 FROM winners WHERE tournament_id = ? LIMIT 1')
        .get(tournamentId);
      const effectiveStatus = computeTournamentStatus({
        match_time: t.match_time,
        end_time: t.end_time,
        status: t.status,
        winners: hasWinners ? [hasWinners] : [],
      });
      if (effectiveStatus !== 'upcoming' && effectiveStatus !== 'live') {
        return { status: 400, error: 'Registration is closed for this tournament.' };
      }

      const already = db
        .prepare('SELECT id FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?')
        .get(tournamentId, req.user!.id);
      if (already) return { status: 409, error: 'You are already registered in this tournament.' };

      if (t.filled_slots >= t.max_slots) {
        return { status: 400, error: 'Tournament slots are completely full.' };
      }

      const wallet = db
        .prepare('SELECT available_balance, pending_withdrawal FROM wallet_accounts WHERE user_id = ?')
        .get(req.user!.id) as { available_balance: number; pending_withdrawal: number } | undefined;
      const available = wallet ? wallet.available_balance : 0;
      const spendable = wallet ? Math.max(0, wallet.available_balance - wallet.pending_withdrawal) : 0;
      if (spendable < t.entry_fee) {
        return {
          status: 400,
          error: `Insufficient spendable balance. Required: PKR ${t.entry_fee}, Spendable: PKR ${spendable}.`,
        };
      }

      const newBalance = available - t.entry_fee;
      db.prepare('UPDATE users SET wallet_balance = ?, matches_played = matches_played + 1 WHERE id = ?').run(
        newBalance,
        req.user!.id
      );
      db.prepare(
        "UPDATE wallet_accounts SET available_balance = ?, updated_at = datetime('now') WHERE user_id = ?"
      ).run(newBalance, req.user!.id);

      const slotRow = db
        .prepare('SELECT COALESCE(MAX(slot_number), 0) + 1 as nextSlot FROM tournament_registrations WHERE tournament_id = ?')
        .get(tournamentId) as { nextSlot: number };

      db.prepare(
        `INSERT INTO tournament_registrations (tournament_id, user_id, in_game_name, in_game_id, slot_number)
         VALUES (?, ?, ?, ?, ?)`
      ).run(tournamentId, req.user!.id, inGameName, inGameId, slotRow.nextSlot);

      db.prepare('UPDATE tournaments SET filled_slots = filled_slots + 1 WHERE id = ?').run(tournamentId);

      if (t.entry_fee > 0) {
        db.prepare(
          `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
           VALUES (?, ?, 'entry_fee', ?, 'debit', ?, 'completed', ?, ?)`
        ).run(
          generateTxCode(),
          req.user!.id,
          t.entry_fee,
          newBalance,
          `TOUR-${tournamentId}`,
          `Entry fee for ${t.title}`
        );
      }

      return { status: 200, slotNumber: slotRow.nextSlot, newBalance };
    }).immediate();

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    recalculateAllUserPoints();
    const updatedTournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as Record<
      string,
      unknown
    >;
    res.json({
      ok: true,
      slotNumber: result.slotNumber,
      user: getUserById(req.user!.id),
      tournament: enrichTournament(updatedTournament, getUserById(req.user!.id)!),
    });
  } catch (err) {
    console.error('Join tournament error:', err);
    res.status(500).json({ error: 'Failed to join tournament.' });
  }
});

// --- WALLET & PAYMENTS ---
app.get('/api/wallet', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  db.prepare('INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)').run(
    req.user!.id,
    req.user!.wallet_balance
  );
  const wallet = db.prepare('SELECT * FROM wallet_accounts WHERE user_id = ?').get(req.user!.id);
  const deposits = db
    .prepare(
      `SELECT id, amount, method, transaction_ref, sender_account, status, admin_note, created_at, reviewed_at
       FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(req.user!.id);
  const withdrawals = db
    .prepare(
      `SELECT id, amount, method, bank_name, account_title, account_number, status, admin_note, created_at, reviewed_at
       FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 50`
    )
    .all(req.user!.id);
  const transactions = db
    .prepare(
      `SELECT id, tx_code, type, amount, direction, balance_after, status, reference_id, description, created_at
       FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100`
    )
    .all(req.user!.id);
  const winnings = db
    .prepare(
      `SELECT w.id, w.tournament_id, t.title as tournament_title, t.mode as tournament_mode,
              w.placement, w.prize_amount, w.declared_at
       FROM winners w
       JOIN tournaments t ON t.id = w.tournament_id
       WHERE w.user_id = ?
       ORDER BY w.declared_at DESC`
    )
    .all(req.user!.id);

  res.json({
    wallet,
    deposits,
    withdrawals,
    transactions,
    winnings,
    paymentChannels: PAYMENT_CHANNELS,
  });
});

app.post('/api/wallet/deposit', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const amount = Number(req.body.amount);
    const method = typeof req.body.method === 'string' ? req.body.method.trim() : '';
    const transactionRef =
      typeof req.body.transactionRef === 'string' ? req.body.transactionRef.trim().toUpperCase() : '';
    const senderAccount =
      typeof req.body.senderAccount === 'string' ? req.body.senderAccount.trim() : '';
    const screenshot = validateImageInput(req.body.screenshotData, 2 * 1024 * 1024);

    if (!Number.isInteger(amount) || amount < 100 || amount > 500000) {
      res.status(400).json({ error: 'Deposit amount must be a whole number between PKR 100 and PKR 500,000.' });
      return;
    }
    if (!['jazzcash', 'easypaisa'].includes(method)) {
      res.status(400).json({ error: 'Invalid payment method selected. Choose JazzCash or Easypaisa.' });
      return;
    }
    if (transactionRef.length < 4 || transactionRef.length > 64 || !/^[A-Z0-9_-]+$/.test(transactionRef)) {
      res.status(400).json({
        error: 'Transaction ID (TID) must be 4–64 characters using letters, numbers, or hyphens.',
      });
      return;
    }
    if (senderAccount.length < 4 || senderAccount.length > 64) {
      res.status(400).json({ error: 'Sender phone/account number is required.' });
      return;
    }
    if (screenshot === null) {
      res.status(400).json({ error: 'Payment screenshot must be a valid PNG, JPEG, or WEBP under 2MB.' });
      return;
    }
    if (!screenshot) {
      res.status(400).json({ error: 'Please upload your payment receipt screenshot.' });
      return;
    }

    const result = db.transaction(() => {
      const dup = db.prepare('SELECT id FROM deposits WHERE transaction_ref = ?').get(transactionRef);
      if (dup) {
        return { conflict: 'Duplicate Transaction ID detected. This TID has already been submitted.' };
      }

      const wallet = db
        .prepare('SELECT available_balance FROM wallet_accounts WHERE user_id = ?')
        .get(req.user!.id) as { available_balance: number };

      const depInfo = db
        .prepare(
          `INSERT INTO deposits (user_id, amount, method, transaction_ref, sender_account, screenshot_data, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`
        )
        .run(req.user!.id, amount, method, transactionRef, senderAccount, screenshot);

      const depId = Number(depInfo.lastInsertRowid);
      db.prepare(
        `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
         VALUES (?, ?, 'deposit', ?, 'credit', ?, 'pending', ?, ?)`
      ).run(
        generateTxCode(),
        req.user!.id,
        amount,
        wallet.available_balance,
        `DEP-${depId}`,
        `Deposit request via ${method.replace('_', ' ')} (TID: ${transactionRef})`
      );

      return { depId };
    }).immediate();

    if ('conflict' in result) {
      res.status(409).json({ error: result.conflict });
      return;
    }

    res.status(201).json({
      ok: true,
      depositId: result.depId,
      message: 'Deposit submitted for manual verification.',
    });
  } catch (err) {
    console.error('Deposit request error:', err);
    res.status(500).json({ error: 'Failed to submit deposit request.' });
  }
});

app.post('/api/wallet/withdraw', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const amount = Number(req.body.amount);
    const method = typeof req.body.method === 'string' ? req.body.method.trim() : '';
    const bankName = typeof req.body.bankName === 'string' ? req.body.bankName.trim() : '';
    const accountTitle = typeof req.body.accountTitle === 'string' ? req.body.accountTitle.trim() : '';
    const accountNumber = typeof req.body.accountNumber === 'string' ? req.body.accountNumber.trim() : '';

    if (!Number.isInteger(amount) || amount < 200 || amount > 500000) {
      res.status(400).json({ error: 'Withdrawal amount must be a whole number between PKR 200 and PKR 500,000.' });
      return;
    }
    if (!['jazzcash', 'easypaisa', 'bank_account'].includes(method)) {
      res.status(400).json({ error: 'Invalid payout method selected. Choose Easypaisa, JazzCash, or Bank Account.' });
      return;
    }
    if (method === 'bank_account' && (bankName.length < 2 || bankName.length > 64)) {
      res.status(400).json({ error: 'Please enter the bank name (e.g. HBL, Meezan Bank, UBL).' });
      return;
    }
    if (accountTitle.length < 2 || accountTitle.length > 64) {
      res.status(400).json({ error: 'Account holder name is required (2–64 characters).' });
      return;
    }
    if (method === 'bank_account') {
      if (accountNumber.length < 8 || accountNumber.length > 34) {
        res.status(400).json({ error: 'Valid bank account number or IBAN (8–34 characters) is required.' });
        return;
      }
    } else if (accountNumber.length < 6 || accountNumber.length > 20) {
      res.status(400).json({ error: 'Valid Easypaisa or JazzCash mobile number is required.' });
      return;
    }

    const result = db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)').run(
        req.user!.id,
        req.user!.wallet_balance
      );
      const wallet = db
        .prepare('SELECT available_balance, pending_withdrawal FROM wallet_accounts WHERE user_id = ?')
        .get(req.user!.id) as { available_balance: number; pending_withdrawal: number };

      const spendable = Math.max(0, wallet.available_balance - wallet.pending_withdrawal);
      if (amount > spendable) {
        return {
          error: `Insufficient available balance. Spendable: PKR ${spendable} (Total: PKR ${wallet.available_balance}, Pending: PKR ${wallet.pending_withdrawal}).`,
        };
      }

      const newPending = wallet.pending_withdrawal + amount;

      db.prepare(
        "UPDATE wallet_accounts SET pending_withdrawal = ?, updated_at = datetime('now') WHERE user_id = ?"
      ).run(newPending, req.user!.id);

      const wInfo = db
        .prepare(
          `INSERT INTO withdrawals (user_id, amount, method, bank_name, account_title, account_number, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`
        )
        .run(req.user!.id, amount, method, method === 'bank_account' ? bankName : '', accountTitle, accountNumber);

      const wId = Number(wInfo.lastInsertRowid);
      const methodLabel =
        method === 'bank_account' ? `${bankName} Bank` : method === 'easypaisa' ? 'Easypaisa' : 'JazzCash';

      db.prepare(
        `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
         VALUES (?, ?, 'withdrawal', ?, 'debit', ?, 'pending', ?, ?)`
      ).run(
        generateTxCode(),
        req.user!.id,
        amount,
        wallet.available_balance,
        `WD-${wId}`,
        `Withdrawal request via ${methodLabel} (${accountNumber}) — Pending verification`
      );

      return { withdrawalId: wId };
    }).immediate();

    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json({
      ok: true,
      withdrawalId: result.withdrawalId,
      message: 'Withdrawal request sent to admin. Funds will be deducted once payment is confirmed.',
      user: getUserById(req.user!.id),
    });
  } catch (err) {
    console.error('Withdraw error:', err);
    res.status(500).json({ error: 'Failed to submit withdrawal request.' });
  }
});

// --- SEND TO FRIEND (P2P WALLET TRANSFER) ---
app.post('/api/wallet/transfer', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const recipientIdentifier =
      typeof req.body.recipientIdentifier === 'string' ? req.body.recipientIdentifier.trim() : '';
    const amount = Math.floor(Number(req.body.amount));
    const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 100) : '';

    if (!recipientIdentifier || recipientIdentifier.length < 2) {
      res.status(400).json({ error: 'Enter your friend’s Player ID, username, or email.' });
      return;
    }
    if (!Number.isInteger(amount) || amount < 10 || amount > 100000) {
      res.status(400).json({ error: 'Transfer amount must be between PKR 10 and PKR 100,000.' });
      return;
    }

    const result = db.transaction(() => {
      const recipient = db
        .prepare(
          `SELECT id, username, player_id, is_blocked, wallet_balance
           FROM users
           WHERE upper(player_id) = upper(?) OR lower(username) = lower(?) OR lower(email) = lower(?)`
        )
        .get(recipientIdentifier, recipientIdentifier, recipientIdentifier) as
        | { id: number; username: string; player_id: string; is_blocked: number; wallet_balance: number }
        | undefined;

      if (!recipient) {
        return { status: 404, error: 'No player found with that Player ID, username, or email.' };
      }
      if (recipient.id === req.user!.id) {
        return { status: 400, error: 'You cannot send funds to your own account.' };
      }
      if (recipient.is_blocked === 1) {
        return { status: 400, error: 'Recipient account is currently unavailable.' };
      }

      db.prepare('INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)').run(
        req.user!.id,
        req.user!.wallet_balance
      );
      db.prepare('INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)').run(
        recipient.id,
        recipient.wallet_balance
      );

      const senderWallet = db
        .prepare('SELECT available_balance, pending_withdrawal FROM wallet_accounts WHERE user_id = ?')
        .get(req.user!.id) as { available_balance: number; pending_withdrawal: number };
      const spendable = Math.max(0, senderWallet.available_balance - senderWallet.pending_withdrawal);

      if (amount > spendable) {
        return {
          status: 400,
          error: `Insufficient spendable balance. Available: PKR ${spendable}.`,
        };
      }

      const recipientWallet = db
        .prepare('SELECT available_balance FROM wallet_accounts WHERE user_id = ?')
        .get(recipient.id) as { available_balance: number };

      const nextSenderBal = senderWallet.available_balance - amount;
      const nextRecipientBal = recipientWallet.available_balance + amount;

      db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nextSenderBal, req.user!.id);
      db.prepare("UPDATE wallet_accounts SET available_balance = ?, updated_at = datetime('now') WHERE user_id = ?").run(
        nextSenderBal,
        req.user!.id
      );

      db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nextRecipientBal, recipient.id);
      db.prepare("UPDATE wallet_accounts SET available_balance = ?, updated_at = datetime('now') WHERE user_id = ?").run(
        nextRecipientBal,
        recipient.id
      );

      const noteSuffix = note ? ` (${note})` : '';
      db.prepare(
        `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
         VALUES (?, ?, 'transfer_out', ?, 'debit', ?, 'completed', ?, ?)`
      ).run(
        generateTxCode(),
        req.user!.id,
        amount,
        nextSenderBal,
        `XFER-${recipient.player_id}`,
        `Sent to ${recipient.username} (${recipient.player_id})${noteSuffix}`
      );

      db.prepare(
        `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
         VALUES (?, ?, 'transfer_in', ?, 'credit', ?, 'completed', ?, ?)`
      ).run(
        generateTxCode(),
        recipient.id,
        amount,
        nextRecipientBal,
        `XFER-${req.user!.player_id}`,
        `Received from ${req.user!.username} (${req.user!.player_id})${noteSuffix}`
      );

      return { status: 200, recipientUsername: recipient.username, recipientPlayerId: recipient.player_id };
    }).immediate();

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({
      ok: true,
      message: `Sent PKR ${amount.toLocaleString('en-PK')} to ${result.recipientUsername} (${result.recipientPlayerId}).`,
      user: getUserById(req.user!.id),
    });
  } catch (err) {
    console.error('Wallet transfer error:', err);
    res.status(500).json({ error: 'Failed to send funds.' });
  }
});

// --- DAILY LUCKY DRAW ---
function getTodayPktDateKey(): string {
  const pkt = new Date(Date.now() + PKT_OFFSET_MS);
  const y = pkt.getUTCFullYear();
  const m = String(pkt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(pkt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

app.get('/api/lucky-draw', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const todayPkt = getTodayPktDateKey();
  const todayEntry = db
    .prepare('SELECT id, draw_date_pkt, prize_amount, prize_label, created_at FROM lucky_draw_entries WHERE user_id = ? AND draw_date_pkt = ?')
    .get(req.user!.id, todayPkt);
  const recentEntries = db
    .prepare('SELECT id, draw_date_pkt, prize_amount, prize_label, created_at FROM lucky_draw_entries WHERE user_id = ? ORDER BY id DESC LIMIT 10')
    .all(req.user!.id);
  res.json({
    todayPkt,
    canSpin: !todayEntry,
    todayEntry: todayEntry || null,
    recentEntries,
  });
});

app.post('/api/lucky-draw/spin', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const todayPkt = getTodayPktDateKey();
    const rewardTable = [
      { weight: 30, amount: 5, label: 'PKR 5 Lucky Bonus' },
      { weight: 28, amount: 10, label: 'PKR 10 Arena Bonus' },
      { weight: 18, amount: 15, label: 'PKR 15 Booyah Spark' },
      { weight: 10, amount: 25, label: 'PKR 25 Gold Drop' },
      { weight: 4, amount: 50, label: 'PKR 50 Mega Jackpot' },
      { weight: 10, amount: 0, label: 'Better Luck Tomorrow' },
    ];
    const totalWeight = rewardTable.reduce((acc, r) => acc + r.weight, 0);
    let roll = crypto.randomInt(0, totalWeight);
    let chosen = rewardTable[0];
    for (const item of rewardTable) {
      if (roll < item.weight) {
        chosen = item;
        break;
      }
      roll -= item.weight;
    }

    const result = db.transaction(() => {
      const existing = db
        .prepare('SELECT id FROM lucky_draw_entries WHERE user_id = ? AND draw_date_pkt = ?')
        .get(req.user!.id, todayPkt);
      if (existing) {
        return { conflict: 'You have already claimed today’s Lucky Draw spin. Come back after 12:00 AM PKT!' };
      }

      const info = db
        .prepare(
          `INSERT INTO lucky_draw_entries (user_id, draw_date_pkt, prize_amount, prize_label)
           VALUES (?, ?, ?, ?)`
        )
        .run(req.user!.id, todayPkt, chosen.amount, chosen.label);

      if (chosen.amount > 0) {
        db.prepare('INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)').run(
          req.user!.id,
          req.user!.wallet_balance
        );
        const wallet = db
          .prepare('SELECT available_balance FROM wallet_accounts WHERE user_id = ?')
          .get(req.user!.id) as { available_balance: number };
        const nextBal = wallet.available_balance + chosen.amount;

        db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nextBal, req.user!.id);
        db.prepare("UPDATE wallet_accounts SET available_balance = ?, updated_at = datetime('now') WHERE user_id = ?").run(
          nextBal,
          req.user!.id
        );
        db.prepare(
          `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
           VALUES (?, ?, 'lucky_draw', ?, 'credit', ?, 'completed', ?, ?)`
        ).run(
          generateTxCode(),
          req.user!.id,
          chosen.amount,
          nextBal,
          `LUCKY-${todayPkt}`,
          `Daily Lucky Draw Reward — ${chosen.label}`
        );
      }

      const entry = db
        .prepare('SELECT id, draw_date_pkt, prize_amount, prize_label, created_at FROM lucky_draw_entries WHERE id = ?')
        .get(Number(info.lastInsertRowid));
      return { entry };
    }).immediate();

    if ('conflict' in result) {
      res.status(409).json({ error: result.conflict });
      return;
    }

    res.json({
      ok: true,
      entry: result.entry,
      user: getUserById(req.user!.id),
    });
  } catch (err) {
    console.error('Lucky draw spin error:', err);
    res.status(500).json({ error: 'Failed to spin Lucky Draw.' });
  }
});

// --- ADMIN PANEL ENDPOINTS ---
app.get('/api/admin/overview', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const userStats = db
    .prepare(
      `SELECT
         COUNT(*) as totalUsers,
         COALESCE(SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END), 0) as blockedUsers,
         COALESCE(SUM(wallet_balance), 0) as totalUserBalances
       FROM users`
    )
    .get() as Record<string, number>;

  const tournamentRows = db
    .prepare('SELECT id, match_time, end_time, status FROM tournaments')
    .all() as Array<{ id: number; match_time: string; end_time: string; status: TournamentStatus }>;
  const activeTournaments = tournamentRows.filter((row) => {
    const hasWinners = db.prepare('SELECT 1 FROM winners WHERE tournament_id = ? LIMIT 1').get(row.id);
    const st = computeTournamentStatus({
      match_time: row.match_time,
      end_time: row.end_time,
      status: row.status,
      winners: hasWinners ? [hasWinners] : [],
    });
    return st === 'upcoming' || st === 'live';
  }).length;
  const tournamentStats = {
    totalTournaments: tournamentRows.length,
    activeTournaments,
  };

  const depositStats = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pendingDeposits,
         COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as totalDeposited
       FROM deposits`
    )
    .get() as Record<string, number>;

  const withdrawalStats = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') THEN 1 ELSE 0 END), 0) as pendingWithdrawals,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as totalWithdrawn
       FROM withdrawals`
    )
    .get() as Record<string, number>;

  const ledgerStats = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'entry_fee' AND status = 'completed' THEN amount ELSE 0 END), 0) as totalEntryFees,
         COALESCE(SUM(CASE WHEN type = 'prize_win' AND status = 'completed' THEN amount ELSE 0 END), 0) as totalPrizesAwarded
       FROM transactions`
    )
    .get() as Record<string, number>;

  const extraStats = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM team_registrations WHERE status = 'pending') as pendingTeamRegistrations,
         (SELECT COUNT(*) FROM contact_messages WHERE status = 'open') as openContacts`
    )
    .get() as Record<string, number>;

  res.json({
    overview: {
      ...userStats,
      ...tournamentStats,
      ...depositStats,
      ...withdrawalStats,
      ...ledgerStats,
      ...extraStats,
    },
  });
});

app.get('/api/admin/users', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const users = db
    .prepare(
      `SELECT u.id, u.player_id, u.username, u.email, u.phone, u.avatar_url, u.role, u.is_blocked,
              u.wallet_balance, u.matches_played, u.wins, u.kills, u.points, u.created_at,
              w.pending_withdrawal, w.total_deposited, w.total_withdrawn, w.total_won
       FROM users u
       LEFT JOIN wallet_accounts w ON w.user_id = u.id
       ORDER BY u.created_at DESC`
    )
    .all();
  res.json({ users });
});

app.post('/api/admin/users', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const role = req.body.role === 'admin' ? 'admin' : 'player';
    const initialBalance = Math.max(0, Math.floor(Number(req.body.initialBalance) || 0));

    if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      res.status(400).json({ error: 'Username must be 3–24 valid characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Valid email is required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const exists = db
      .prepare('SELECT id FROM users WHERE lower(email) = ? OR lower(username) = ?')
      .get(email, username.toLowerCase());
    if (exists) {
      res.status(409).json({ error: 'Username or email already exists.' });
      return;
    }

    const playerId = generateUniquePlayerId();
    const passwordHash = hashPassword(password);

    const newUserId = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO users (player_id, username, email, password_hash, avatar_url, role, wallet_balance)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          playerId,
          username,
          email,
          passwordHash,
          '/src/assets/images/avatar_esports_pro_1795298801657.jpg',
          role,
          initialBalance
        );
      const uid = Number(info.lastInsertRowid);
      db.prepare('INSERT INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)').run(
        uid,
        initialBalance
      );
      if (role === 'admin') {
        db.prepare("INSERT INTO admins (user_id, admin_level) VALUES (?, 'moderator')").run(uid);
      }
      if (initialBalance > 0) {
        db.prepare(
          `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
           VALUES (?, ?, 'admin_adjustment', ?, 'credit', ?, 'completed', ?, ?)`
        ).run(
          generateTxCode(),
          uid,
          initialBalance,
          initialBalance,
          `ADM-${req.user!.id}`,
          `Initial wallet credit by admin ${req.user!.username}`
        );
      }
      return uid;
    }).immediate();

    res.status(201).json({ user: getUserById(newUserId) });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Failed to create user.' });
  }
});

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const result = db.transaction(() => {
      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as
        | { id: number; role: 'player' | 'admin'; is_blocked: number; wallet_balance: number; username: string }
        | undefined;
      if (!target) return { status: 404, error: 'User not found.' };

      if (req.body.isBlocked !== undefined) {
        const nextBlocked = req.body.isBlocked ? 1 : 0;
        if (targetId === req.user!.id && nextBlocked === 1) {
          return { status: 400, error: 'You cannot block your own administrator account.' };
        }
        db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(nextBlocked, targetId);
      }

      if (req.body.role === 'admin' || req.body.role === 'player') {
        if (targetId === req.user!.id && req.body.role !== 'admin') {
          return { status: 400, error: 'You cannot demote your own administrator account.' };
        }
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(req.body.role, targetId);
        if (req.body.role === 'admin') {
          db.prepare("INSERT OR IGNORE INTO admins (user_id, admin_level) VALUES (?, 'moderator')").run(targetId);
        } else {
          db.prepare('DELETE FROM admins WHERE user_id = ?').run(targetId);
        }
      }

      if (req.body.balanceAdjustment !== undefined) {
        const delta = Math.trunc(Number(req.body.balanceAdjustment));
        if (delta !== 0) {
          const wallet = db
            .prepare('SELECT available_balance FROM wallet_accounts WHERE user_id = ?')
            .get(targetId) as { available_balance: number };
          const nextBal = wallet.available_balance + delta;
          if (nextBal < 0) {
            return { status: 400, error: 'Adjustment would result in negative wallet balance.' };
          }
          db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nextBal, targetId);
          db.prepare(
            "UPDATE wallet_accounts SET available_balance = ?, updated_at = datetime('now') WHERE user_id = ?"
          ).run(nextBal, targetId);

          const note =
            typeof req.body.adjustmentNote === 'string' && req.body.adjustmentNote.trim()
              ? req.body.adjustmentNote.trim()
              : `Admin balance adjustment by ${req.user!.username}`;

          db.prepare(
            `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
             VALUES (?, ?, 'admin_adjustment', ?, ?, ?, 'completed', ?, ?)`
          ).run(
            generateTxCode(),
            targetId,
            Math.abs(delta),
            delta > 0 ? 'credit' : 'debit',
            nextBal,
            `ADM-${req.user!.id}`,
            note
          );
        }
      }

      return { status: 200 };
    }).immediate();

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ user: getUserById(targetId) });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    res.status(400).json({ error: 'Invalid user ID.' });
    return;
  }
  if (targetId === req.user!.id) {
    res.status(400).json({ error: 'You cannot delete your own active account.' });
    return;
  }
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  if (info.changes === 0) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/award-prize', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetId = Number(req.params.id);
    const amount = Math.floor(Number(req.body.amount));
    const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
    const tournamentId = req.body.tournamentId ? Number(req.body.tournamentId) : null;

    if (!Number.isInteger(targetId) || targetId <= 0) {
      res.status(400).json({ error: 'Invalid player user ID.' });
      return;
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 1000000) {
      res.status(400).json({ error: 'Prize amount must be between PKR 1 and PKR 1,000,000.' });
      return;
    }

    const result = db.transaction(() => {
      const targetUser = db
        .prepare('SELECT id, username, wallet_balance FROM users WHERE id = ?')
        .get(targetId) as { id: number; username: string; wallet_balance: number } | undefined;
      if (!targetUser) return { status: 404, error: 'Player account not found.' };

      db.prepare('INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)').run(
        targetId,
        targetUser.wallet_balance
      );
      const wallet = db
        .prepare('SELECT available_balance, total_won FROM wallet_accounts WHERE user_id = ?')
        .get(targetId) as { available_balance: number; total_won: number };

      const nextBal = wallet.available_balance + amount;
      const nextWon = wallet.total_won + amount;

      db.prepare('UPDATE users SET wallet_balance = ?, wins = wins + 1 WHERE id = ?').run(nextBal, targetId);
      db.prepare(
        "UPDATE wallet_accounts SET available_balance = ?, total_won = ?, updated_at = datetime('now') WHERE user_id = ?"
      ).run(nextBal, nextWon, targetId);

      let tourTitle = '';
      if (tournamentId && Number.isInteger(tournamentId)) {
        const t = db.prepare('SELECT title FROM tournaments WHERE id = ?').get(tournamentId) as
          | { title: string }
          | undefined;
        if (t) tourTitle = t.title;
      }

      const description =
        note ||
        (tourTitle
          ? `Tournament Winner Prize — ${tourTitle}`
          : `Tournament Winner Prize credited by admin ${req.user!.username}`);

      db.prepare(
        `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
         VALUES (?, ?, 'prize_win', ?, 'credit', ?, 'completed', ?, ?)`
      ).run(
        generateTxCode(),
        targetId,
        amount,
        nextBal,
        tournamentId ? `TOUR-${tournamentId}` : `PRIZE-${req.user!.id}`,
        description
      );

      return { status: 200 };
    }).immediate();

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    recalculateAllUserPoints();
    res.json({ ok: true, user: getUserById(targetId) });
  } catch (err) {
    console.error('Award prize error:', err);
    res.status(500).json({ error: 'Failed to credit prize money.' });
  }
});

// --- ADMIN TOURNAMENT MANAGEMENT ---
app.post('/api/admin/tournaments', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const gameName = typeof req.body.gameName === 'string' && req.body.gameName.trim() ? req.body.gameName.trim() : 'Free Fire';
    const mode = normalizeMode(req.body.mode);
    const entryFee = Math.floor(Number(req.body.entryFee));
    const hasSplitInputs =
      req.body.prize1st !== undefined ||
      req.body.prize2nd !== undefined ||
      req.body.prize3rd !== undefined ||
      req.body.prize4th !== undefined ||
      req.body.prize5th !== undefined;
    const rawPoolInput = req.body.prizePool !== undefined ? Math.floor(Number(req.body.prizePool)) : 0;
    let prize1st = req.body.prize1st !== undefined ? Math.floor(Number(req.body.prize1st)) : 0;
    let prize2nd = req.body.prize2nd !== undefined ? Math.floor(Number(req.body.prize2nd)) : 0;
    let prize3rd = req.body.prize3rd !== undefined ? Math.floor(Number(req.body.prize3rd)) : 0;
    let prize4th = req.body.prize4th !== undefined ? Math.floor(Number(req.body.prize4th)) : 0;
    let prize5th = req.body.prize5th !== undefined ? Math.floor(Number(req.body.prize5th)) : 0;

    if (!hasSplitInputs && Number.isFinite(rawPoolInput) && rawPoolInput > 0) {
      prize1st = Math.round(rawPoolInput * 0.4);
      prize2nd = Math.round(rawPoolInput * 0.25);
      prize3rd = Math.round(rawPoolInput * 0.15);
      prize4th = Math.round(rawPoolInput * 0.12);
      prize5th = Math.max(0, rawPoolInput - prize1st - prize2nd - prize3rd - prize4th);
    }

    const splitSum = prize1st + prize2nd + prize3rd + prize4th + prize5th;
    const prizePool = hasSplitInputs
      ? Math.max(splitSum, Number.isFinite(rawPoolInput) ? rawPoolInput : 0)
      : rawPoolInput;

    const maxSlots = Math.floor(Number(req.body.maxSlots));
    const matchTime = typeof req.body.matchTime === 'string' ? req.body.matchTime.trim() : '';
    const endTime = typeof req.body.endTime === 'string' ? req.body.endTime.trim() : '';
    const requestedStatus = typeof req.body.status === 'string' ? req.body.status : 'auto';
    const rules = typeof req.body.rules === 'string' ? req.body.rules.trim() : '';
    const roomId = typeof req.body.roomId === 'string' ? req.body.roomId.trim() : '';
    const roomPass = typeof req.body.roomPass === 'string' ? req.body.roomPass.trim() : '';
    const bannerUrl = sanitizeBannerUrl(req.body.bannerUrl);

    if (title.length < 3 || gameName.length < 2) {
      res.status(400).json({ error: 'Tournament title and game name are required.' });
      return;
    }
    if (
      !Number.isFinite(entryFee) ||
      entryFee < 0 ||
      !Number.isFinite(prizePool) ||
      prizePool < 0 ||
      !Number.isFinite(prize1st) ||
      prize1st < 0 ||
      !Number.isFinite(prize2nd) ||
      prize2nd < 0 ||
      !Number.isFinite(prize3rd) ||
      prize3rd < 0 ||
      !Number.isFinite(prize4th) ||
      prize4th < 0 ||
      !Number.isFinite(prize5th) ||
      prize5th < 0
    ) {
      res.status(400).json({ error: 'Entry fee and 1st–5th place prizes must be 0 or greater.' });
      return;
    }
    if (!Number.isFinite(maxSlots) || maxSlots < 2 || maxSlots > 500) {
      res.status(400).json({ error: 'Max slots must be between 2 and 500.' });
      return;
    }
    const startMs = Date.parse(matchTime);
    if (!matchTime || !Number.isFinite(startMs)) {
      res.status(400).json({ error: 'Valid tournament start date and time (PKT) are required.' });
      return;
    }
    if (endTime) {
      const endMs = Date.parse(endTime);
      if (!Number.isFinite(endMs)) {
        res.status(400).json({ error: 'Invalid optional tournament end date/time.' });
        return;
      }
      if (endMs <= startMs) {
        res.status(400).json({ error: 'End date and time must be later than the start date and time.' });
        return;
      }
    }

    const status: TournamentStatus =
      requestedStatus === 'cancelled'
        ? 'cancelled'
        : requestedStatus === 'completed'
          ? 'completed'
          : computeTournamentStatus({
              match_time: new Date(startMs).toISOString(),
              end_time: endTime ? new Date(Date.parse(endTime)).toISOString() : '',
              status: 'upcoming',
            });

    const normalizedStart = new Date(startMs).toISOString();
    const normalizedEnd = endTime ? new Date(Date.parse(endTime)).toISOString() : '';

    const info = db
      .prepare(
        `INSERT INTO tournaments (
           title, game_name, mode, entry_fee, prize_pool, prize_1st, prize_2nd, prize_3rd, prize_4th, prize_5th,
           max_slots, match_time, end_time, status, banner_url, rules, room_id, room_pass, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        title,
        gameName,
        mode,
        entryFee,
        prizePool,
        prize1st,
        prize2nd,
        prize3rd,
        prize4th,
        prize5th,
        maxSlots,
        normalizedStart,
        normalizedEnd,
        status,
        bannerUrl,
        rules,
        roomId,
        roomPass,
        req.user!.id
      );

    const created = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(Number(info.lastInsertRowid)) as Record<
      string,
      unknown
    >;
    res.status(201).json({ tournament: enrichTournament(created, req.user!) });
  } catch (err) {
    console.error('Create tournament error:', err);
    res.status(500).json({ error: 'Failed to create tournament.' });
  }
});

app.patch('/api/admin/tournaments/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Tournament not found.' });
      return;
    }

    const title = typeof req.body.title === 'string' && req.body.title.trim() ? req.body.title.trim() : existing.title;
    const gameName =
      typeof req.body.gameName === 'string' && req.body.gameName.trim()
        ? req.body.gameName.trim()
        : existing.game_name;
    const mode = req.body.mode !== undefined ? normalizeMode(req.body.mode) : normalizeMode(existing.mode);
    const entryFee =
      req.body.entryFee !== undefined ? Math.max(0, Math.floor(Number(req.body.entryFee))) : existing.entry_fee;
    const hasSplitPatch =
      req.body.prize1st !== undefined ||
      req.body.prize2nd !== undefined ||
      req.body.prize3rd !== undefined ||
      req.body.prize4th !== undefined ||
      req.body.prize5th !== undefined;
    const prize1st =
      req.body.prize1st !== undefined
        ? Math.max(0, Math.floor(Number(req.body.prize1st)) || 0)
        : Number(existing.prize_1st ?? 0);
    const prize2nd =
      req.body.prize2nd !== undefined
        ? Math.max(0, Math.floor(Number(req.body.prize2nd)) || 0)
        : Number(existing.prize_2nd ?? 0);
    const prize3rd =
      req.body.prize3rd !== undefined
        ? Math.max(0, Math.floor(Number(req.body.prize3rd)) || 0)
        : Number(existing.prize_3rd ?? 0);
    const prize4th =
      req.body.prize4th !== undefined
        ? Math.max(0, Math.floor(Number(req.body.prize4th)) || 0)
        : Number(existing.prize_4th ?? 0);
    const prize5th =
      req.body.prize5th !== undefined
        ? Math.max(0, Math.floor(Number(req.body.prize5th)) || 0)
        : Number(existing.prize_5th ?? 0);
    const basePool =
      req.body.prizePool !== undefined
        ? Math.max(0, Math.floor(Number(req.body.prizePool)) || 0)
        : Number(existing.prize_pool ?? 0);
    const prizePool = hasSplitPatch
      ? Math.max(basePool, prize1st + prize2nd + prize3rd + prize4th + prize5th)
      : basePool;

    const maxSlots =
      req.body.maxSlots !== undefined
        ? Math.max(Number(existing.filled_slots), Math.floor(Number(req.body.maxSlots)))
        : existing.max_slots;
    const rawMatchTime =
      typeof req.body.matchTime === 'string' && req.body.matchTime.trim()
        ? req.body.matchTime.trim()
        : String(existing.match_time);
    const rawEndTime =
      typeof req.body.endTime === 'string' ? req.body.endTime.trim() : String(existing.end_time || '');

    const startMs = Date.parse(rawMatchTime);
    if (!Number.isFinite(startMs)) {
      res.status(400).json({ error: 'Valid tournament start date and time (PKT) are required.' });
      return;
    }
    if (rawEndTime) {
      const endMs = Date.parse(rawEndTime);
      if (!Number.isFinite(endMs)) {
        res.status(400).json({ error: 'Invalid optional tournament end date/time.' });
        return;
      }
      if (endMs <= startMs) {
        res.status(400).json({ error: 'End date and time must be later than the start date and time.' });
        return;
      }
    }

    const matchTime = new Date(startMs).toISOString();
    const endTime = rawEndTime ? new Date(Date.parse(rawEndTime)).toISOString() : '';
    const hasWinners = db.prepare('SELECT 1 FROM winners WHERE tournament_id = ? LIMIT 1').get(id);

    const reqStatus = typeof req.body.status === 'string' ? req.body.status : '';
    let status: TournamentStatus;
    if (reqStatus === 'cancelled') {
      status = 'cancelled';
    } else if (reqStatus === 'completed') {
      status = 'completed';
    } else if (reqStatus === 'auto') {
      status = computeTournamentStatus({
        match_time: matchTime,
        end_time: endTime,
        status: 'upcoming',
        winners: hasWinners ? [hasWinners] : [],
      });
    } else if (['upcoming', 'live'].includes(reqStatus)) {
      status = computeTournamentStatus({
        match_time: matchTime,
        end_time: endTime,
        status: reqStatus as TournamentStatus,
        winners: hasWinners ? [hasWinners] : [],
      });
    } else {
      status = existing.status as TournamentStatus;
    }

    const rules = typeof req.body.rules === 'string' ? req.body.rules.trim() : existing.rules;
    const roomId = typeof req.body.roomId === 'string' ? req.body.roomId.trim() : existing.room_id;
    const roomPass = typeof req.body.roomPass === 'string' ? req.body.roomPass.trim() : existing.room_pass;
    const bannerUrl = req.body.bannerUrl ? sanitizeBannerUrl(req.body.bannerUrl) : existing.banner_url;

    db.prepare(
      `UPDATE tournaments
       SET title = ?, game_name = ?, mode = ?, entry_fee = ?, prize_pool = ?, prize_1st = ?, prize_2nd = ?, prize_3rd = ?, prize_4th = ?, prize_5th = ?, max_slots = ?,
           match_time = ?, end_time = ?, status = ?, banner_url = ?, rules = ?, room_id = ?, room_pass = ?
       WHERE id = ?`
    ).run(
      title,
      gameName,
      mode,
      entryFee,
      prizePool,
      prize1st,
      prize2nd,
      prize3rd,
      prize4th,
      prize5th,
      maxSlots,
      matchTime,
      endTime,
      status,
      bannerUrl,
      rules,
      roomId,
      roomPass,
      id
    );

    const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({ tournament: enrichTournament(updated, req.user!) });
  } catch (err) {
    console.error('Update tournament error:', err);
    res.status(500).json({ error: 'Failed to update tournament.' });
  }
});

app.delete('/api/admin/tournaments/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const result = db.transaction(() => {
      const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id) as
        | { id: number; title: string; entry_fee: number; status: string }
        | undefined;
      if (!t) return { notFound: true };

      if ((t.status === 'upcoming' || t.status === 'live') && t.entry_fee > 0) {
        const regs = db
          .prepare('SELECT user_id FROM tournament_registrations WHERE tournament_id = ?')
          .all(id) as Array<{ user_id: number }>;
        for (const r of regs) {
          const wallet = db
            .prepare('SELECT available_balance FROM wallet_accounts WHERE user_id = ?')
            .get(r.user_id) as { available_balance: number } | undefined;
          if (wallet) {
            const nextBal = wallet.available_balance + t.entry_fee;
            db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nextBal, r.user_id);
            db.prepare(
              "UPDATE wallet_accounts SET available_balance = ?, updated_at = datetime('now') WHERE user_id = ?"
            ).run(nextBal, r.user_id);
            db.prepare(
              `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
               VALUES (?, ?, 'refund', ?, 'credit', ?, 'completed', ?, ?)`
            ).run(
              generateTxCode(),
              r.user_id,
              t.entry_fee,
              nextBal,
              `TOUR-${id}`,
              `Entry fee refunded: ${t.title} removed`
            );
          }
        }
      }

      db.prepare('DELETE FROM tournaments WHERE id = ?').run(id);
      return { ok: true };
    }).immediate();

    if ('notFound' in result) {
      res.status(404).json({ error: 'Tournament not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete tournament error:', err);
    res.status(500).json({ error: 'Failed to delete tournament.' });
  }
});

app.post('/api/admin/tournaments/:id/players', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournamentId = Number(req.params.id);
    const identifier = typeof req.body.playerIdentifier === 'string' ? req.body.playerIdentifier.trim() : '';
    const inGameName = typeof req.body.inGameName === 'string' ? req.body.inGameName.trim() : '';
    const inGameId = typeof req.body.inGameId === 'string' ? req.body.inGameId.trim() : '';
    const chargeFee = Boolean(req.body.chargeFee);

    if (!identifier) {
      res.status(400).json({ error: 'Player ID, username, or email is required.' });
      return;
    }

    const result = db.transaction(() => {
      const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as
        | { id: number; title: string; entry_fee: number; max_slots: number; filled_slots: number }
        | undefined;
      if (!t) return { status: 404, error: 'Tournament not found.' };
      if (t.filled_slots >= t.max_slots) return { status: 400, error: 'Tournament is full.' };

      const targetUser = db
        .prepare(
          `SELECT id, username, player_id, wallet_balance FROM users
           WHERE upper(player_id) = upper(?) OR lower(username) = lower(?) OR lower(email) = lower(?)`
        )
        .get(identifier, identifier, identifier) as
        | { id: number; username: string; player_id: string; wallet_balance: number }
        | undefined;
      if (!targetUser) return { status: 404, error: 'No player found with that Player ID, username, or email.' };

      const already = db
        .prepare('SELECT id FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?')
        .get(tournamentId, targetUser.id);
      if (already) return { status: 409, error: 'Player is already registered in this tournament.' };

      if (chargeFee && t.entry_fee > 0) {
        if (targetUser.wallet_balance < t.entry_fee) {
          return { status: 400, error: `Player balance (PKR ${targetUser.wallet_balance}) is below entry fee.` };
        }
        const nextBal = targetUser.wallet_balance - t.entry_fee;
        db.prepare('UPDATE users SET wallet_balance = ?, matches_played = matches_played + 1 WHERE id = ?').run(
          nextBal,
          targetUser.id
        );
        db.prepare(
          "UPDATE wallet_accounts SET available_balance = ?, updated_at = datetime('now') WHERE user_id = ?"
        ).run(nextBal, targetUser.id);
        db.prepare(
          `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
           VALUES (?, ?, 'entry_fee', ?, 'debit', ?, 'completed', ?, ?)`
        ).run(
          generateTxCode(),
          targetUser.id,
          t.entry_fee,
          nextBal,
          `TOUR-${tournamentId}`,
          `Added to ${t.title} by admin`
        );
      } else {
        db.prepare('UPDATE users SET matches_played = matches_played + 1 WHERE id = ?').run(targetUser.id);
      }

      const slotRow = db
        .prepare('SELECT COALESCE(MAX(slot_number), 0) + 1 as nextSlot FROM tournament_registrations WHERE tournament_id = ?')
        .get(tournamentId) as { nextSlot: number };

      db.prepare(
        `INSERT INTO tournament_registrations (tournament_id, user_id, in_game_name, in_game_id, slot_number)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        tournamentId,
        targetUser.id,
        inGameName || targetUser.username,
        inGameId || targetUser.player_id,
        slotRow.nextSlot
      );

      db.prepare('UPDATE tournaments SET filled_slots = filled_slots + 1 WHERE id = ?').run(tournamentId);
      return { status: 200 };
    }).immediate();

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    recalculateAllUserPoints();
    const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as Record<string, unknown>;
    res.json({ tournament: enrichTournament(updated, req.user!) });
  } catch (err) {
    console.error('Admin add player error:', err);
    res.status(500).json({ error: 'Failed to add player.' });
  }
});

app.delete(
  '/api/admin/tournaments/:id/players/:userId',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const tournamentId = Number(req.params.id);
      const userId = Number(req.params.userId);
      const refund = req.query.refund === 'true';

      const result = db.transaction(() => {
        const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as
          | { id: number; title: string; entry_fee: number }
          | undefined;
        if (!t) return { status: 404, error: 'Tournament not found.' };

        const reg = db
          .prepare('SELECT id FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?')
          .get(tournamentId, userId);
        if (!reg) return { status: 404, error: 'Player registration not found.' };

        db.prepare('DELETE FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?').run(
          tournamentId,
          userId
        );
        db.prepare('UPDATE tournaments SET filled_slots = MAX(0, filled_slots - 1) WHERE id = ?').run(tournamentId);

        if (refund && t.entry_fee > 0) {
          const wallet = db
            .prepare('SELECT available_balance FROM wallet_accounts WHERE user_id = ?')
            .get(userId) as { available_balance: number };
          const nextBal = wallet.available_balance + t.entry_fee;
          db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nextBal, userId);
          db.prepare(
            "UPDATE wallet_accounts SET available_balance = ?, updated_at = datetime('now') WHERE user_id = ?"
          ).run(nextBal, userId);
          db.prepare(
            `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
             VALUES (?, ?, 'refund', ?, 'credit', ?, 'completed', ?, ?)`
          ).run(
            generateTxCode(),
            userId,
            t.entry_fee,
            nextBal,
            `TOUR-${tournamentId}`,
            `Removed from ${t.title} (refunded)`
          );
        }

        return { status: 200 };
      }).immediate();

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      recalculateAllUserPoints();
      const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as Record<
        string,
        unknown
      >;
      res.json({ tournament: enrichTournament(updated, req.user!) });
    } catch (err) {
      console.error('Remove player error:', err);
      res.status(500).json({ error: 'Failed to remove player.' });
    }
  }
);

function saveTournamentWinners(
  tournamentId: number,
  adminUserId: number,
  winnersInput: Array<{ userId?: unknown; placement?: unknown; prizeAmount?: unknown }>,
  allowReplace: boolean
): { status: number; error?: string } {
  return db.transaction(() => {
    const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as
      | { id: number; title: string; status: string }
      | undefined;
    if (!t) return { status: 404, error: 'Tournament not found.' };
    if (t.status === 'cancelled') {
      return { status: 400, error: 'Cannot declare winners for a cancelled tournament.' };
    }

    const previousWinners = db
      .prepare('SELECT id, user_id, placement, prize_amount FROM winners WHERE tournament_id = ?')
      .all(tournamentId) as Array<{
      id: number;
      user_id: number;
      placement: number;
      prize_amount: number;
    }>;

    if (previousWinners.length > 0 && !allowReplace) {
      return { status: 409, error: 'Winners have already been declared and paid for this tournament.' };
    }

    const selectableUsersRow = db
      .prepare('SELECT COUNT(*) as count FROM users WHERE is_blocked = 0')
      .get() as { count: number };
    const requiredCount = Math.min(5, Number(selectableUsersRow?.count || 0));
    if (requiredCount >= 5 && winnersInput.length !== 5) {
      return {
        status: 400,
        error: 'Please select exactly 5 distinct winners (1st, 2nd, 3rd, 4th, and 5th Winner).',
      };
    }

    const seenUsers = new Set<number>();
    const seenPlacements = new Set<number>();
    const rankLabels: Record<number, string> = {
      1: '1st Place Winner',
      2: '2nd Place Winner',
      3: '3rd Place Winner',
      4: '4th Place Winner',
      5: '5th Place Winner',
    };

    const sortedEntries = [...winnersInput].sort(
      (a, b) => Number(a.placement) - Number(b.placement)
    );

    // Pre-validate all entries before reversing previous winners
    const parsedEntries: Array<{
      uid: number;
      placement: number;
      prizeAmount: number;
      username: string;
      playerId: string;
      walletBalance: number;
    }> = [];

    for (const entry of sortedEntries) {
      const uid = Number(entry.userId);
      const placement = Number(entry.placement);
      const prizeAmount = Math.floor(Number(entry.prizeAmount));

      if (
        !Number.isInteger(uid) ||
        uid <= 0 ||
        !Number.isInteger(placement) ||
        placement < 1 ||
        placement > 5 ||
        !Number.isFinite(prizeAmount) ||
        prizeAmount < 0 ||
        prizeAmount > 5000000
      ) {
        return {
          status: 400,
          error: 'Invalid winner entry or prize amount (must be 1st through 5th place).',
        };
      }
      if (seenUsers.has(uid)) {
        return {
          status: 400,
          error: 'The same player cannot win more than one position in the same tournament.',
        };
      }
      if (seenPlacements.has(placement)) {
        return { status: 400, error: `Duplicate placement #${placement} selected.` };
      }
      seenUsers.add(uid);
      seenPlacements.add(placement);

      const targetUser = db
        .prepare('SELECT id, username, player_id, wallet_balance FROM users WHERE id = ?')
        .get(uid) as
        | { id: number; username: string; player_id: string; wallet_balance: number }
        | undefined;
      if (!targetUser) {
        return { status: 404, error: 'Selected winner player account was not found.' };
      }
      parsedEntries.push({
        uid,
        placement,
        prizeAmount,
        username: targetUser.username,
        playerId: targetUser.player_id,
        walletBalance: targetUser.wallet_balance,
      });
    }

    // If admin is editing previously declared winners, safely reverse old payouts & wins
    if (allowReplace && previousWinners.length > 0) {
      for (const prev of previousWinners) {
        if (prev.placement === 1) {
          db.prepare('UPDATE users SET wins = MAX(0, wins - 1) WHERE id = ?').run(prev.user_id);
        }
        if (prev.prize_amount > 0) {
          const prevWallet = db
            .prepare('SELECT available_balance, total_won FROM wallet_accounts WHERE user_id = ?')
            .get(prev.user_id) as { available_balance: number; total_won: number } | undefined;
          if (prevWallet) {
            const reversedBal = Math.max(0, prevWallet.available_balance - prev.prize_amount);
            const reversedWon = Math.max(0, prevWallet.total_won - prev.prize_amount);
            db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(reversedBal, prev.user_id);
            db.prepare(
              "UPDATE wallet_accounts SET available_balance = ?, total_won = ?, updated_at = datetime('now') WHERE user_id = ?"
            ).run(reversedBal, reversedWon, prev.user_id);
            db.prepare(
              `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
               VALUES (?, ?, 'admin_adjustment', ?, 'debit', ?, 'completed', ?, ?)`
            ).run(
              generateTxCode(),
              prev.user_id,
              prev.prize_amount,
              reversedBal,
              `TOUR-${tournamentId}`,
              `Winner update reversal (${rankLabels[prev.placement] || `#${prev.placement}`}) — ${t.title}`
            );
          }
        }
      }
      db.prepare('DELETE FROM winners WHERE tournament_id = ?').run(tournamentId);
    }

    for (const item of parsedEntries) {
      // Ensure winner appears in tournament roster if added directly by admin
      const isReg = db
        .prepare('SELECT id FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?')
        .get(tournamentId, item.uid);
      if (!isReg) {
        const slotRow = db
          .prepare('SELECT COALESCE(MAX(slot_number), 0) + 1 as nextSlot FROM tournament_registrations WHERE tournament_id = ?')
          .get(tournamentId) as { nextSlot: number };
        db.prepare(
          `INSERT INTO tournament_registrations (tournament_id, user_id, in_game_name, in_game_id, slot_number)
           VALUES (?, ?, ?, ?, ?)`
        ).run(tournamentId, item.uid, item.username, item.playerId, slotRow.nextSlot);
        db.prepare('UPDATE tournaments SET filled_slots = filled_slots + 1 WHERE id = ?').run(tournamentId);
      }

      db.prepare(
        `INSERT INTO winners (tournament_id, user_id, placement, prize_amount, declared_by)
         VALUES (?, ?, ?, ?, ?)`
      ).run(tournamentId, item.uid, item.placement, item.prizeAmount, adminUserId);

      if (item.placement === 1) {
        db.prepare('UPDATE users SET wins = wins + 1 WHERE id = ?').run(item.uid);
      }

      db.prepare('INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)').run(
        item.uid,
        item.walletBalance
      );

      if (item.prizeAmount > 0) {
        const wallet = db
          .prepare('SELECT available_balance, total_won FROM wallet_accounts WHERE user_id = ?')
          .get(item.uid) as { available_balance: number; total_won: number };
        const nextBal = wallet.available_balance + item.prizeAmount;
        const nextWon = wallet.total_won + item.prizeAmount;

        db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nextBal, item.uid);
        db.prepare(
          "UPDATE wallet_accounts SET available_balance = ?, total_won = ?, updated_at = datetime('now') WHERE user_id = ?"
        ).run(nextBal, nextWon, item.uid);

        db.prepare(
          `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
           VALUES (?, ?, 'prize_win', ?, 'credit', ?, 'completed', ?, ?)`
        ).run(
          generateTxCode(),
          item.uid,
          item.prizeAmount,
          nextBal,
          `TOUR-${tournamentId}`,
          `${rankLabels[item.placement] || `#${item.placement} Winner`} — ${t.title}`
        );
      }
    }

    db.prepare("UPDATE tournaments SET status = 'completed' WHERE id = ?").run(tournamentId);
    return { status: 200 };
  }).immediate();
}

app.post('/api/admin/tournaments/:id/winners', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournamentId = Number(req.params.id);
    if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
      res.status(400).json({ error: 'Invalid tournament ID.' });
      return;
    }

    const winnersInput = Array.isArray(req.body.winners) ? req.body.winners : [];
    if (winnersInput.length === 0 || winnersInput.length > 5) {
      res.status(400).json({ error: 'Select 5 distinct winners (1st, 2nd, 3rd, 4th, and 5th Place).' });
      return;
    }

    const result = saveTournamentWinners(tournamentId, req.user!.id, winnersInput, false);
    if ('error' in result && result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    recalculateAllUserPoints();
    const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as Record<string, unknown>;
    res.json({ tournament: enrichTournament(updated, req.user!) });
  } catch (err) {
    console.error('Declare winners error:', err);
    res.status(500).json({ error: 'Failed to declare winners.' });
  }
});

app.put('/api/admin/tournaments/:id/winners', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournamentId = Number(req.params.id);
    if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
      res.status(400).json({ error: 'Invalid tournament ID.' });
      return;
    }

    const winnersInput = Array.isArray(req.body.winners) ? req.body.winners : [];
    if (winnersInput.length === 0 || winnersInput.length > 5) {
      res.status(400).json({ error: 'Select 5 distinct winners (1st, 2nd, 3rd, 4th, and 5th Place).' });
      return;
    }

    const result = saveTournamentWinners(tournamentId, req.user!.id, winnersInput, true);
    if ('error' in result && result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    recalculateAllUserPoints();
    const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as Record<string, unknown>;
    res.json({ tournament: enrichTournament(updated, req.user!) });
  } catch (err) {
    console.error('Update winners error:', err);
    res.status(500).json({ error: 'Failed to update winners.' });
  }
});

// --- ADMIN DEPOSITS, WITHDRAWALS & LEDGER ---
app.get('/api/admin/deposits', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const deposits = db
    .prepare(
      `SELECT d.*, u.username, u.player_id, u.email
       FROM deposits d
       JOIN users u ON u.id = d.user_id
       ORDER BY CASE d.status WHEN 'pending' THEN 0 ELSE 1 END, d.created_at DESC`
    )
    .all();
  res.json({ deposits });
});

app.post('/api/admin/deposits/:id/review', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const depId = Number(req.params.id);
    const action = req.body.action === 'approve' ? 'approve' : req.body.action === 'reject' ? 'reject' : null;
    const adminNote = typeof req.body.adminNote === 'string' ? req.body.adminNote.trim() : '';

    if (!action) {
      res.status(400).json({ error: 'Action must be approve or reject.' });
      return;
    }

    const result = db.transaction(() => {
      const dep = db.prepare('SELECT * FROM deposits WHERE id = ?').get(depId) as
        | { id: number; user_id: number; amount: number; status: string; transaction_ref: string }
        | undefined;
      if (!dep) return { status: 404, error: 'Deposit request not found.' };
      if (dep.status !== 'pending') {
        return { status: 409, error: `Deposit has already been ${dep.status}.` };
      }

      const nextStatus = action === 'approve' ? 'approved' : 'rejected';
      db.prepare(
        "UPDATE deposits SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
      ).run(nextStatus, adminNote, req.user!.id, depId);

      const wallet = db
        .prepare('SELECT available_balance, total_deposited FROM wallet_accounts WHERE user_id = ?')
        .get(dep.user_id) as { available_balance: number; total_deposited: number };

      if (action === 'approve') {
        const nextBal = wallet.available_balance + dep.amount;
        const nextTotalDep = wallet.total_deposited + dep.amount;

        db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nextBal, dep.user_id);
        db.prepare(
          "UPDATE wallet_accounts SET available_balance = ?, total_deposited = ?, updated_at = datetime('now') WHERE user_id = ?"
        ).run(nextBal, nextTotalDep, dep.user_id);

        db.prepare(
          "UPDATE transactions SET status = 'completed', balance_after = ? WHERE reference_id = ? AND type = 'deposit'"
        ).run(nextBal, `DEP-${depId}`);
      } else {
        db.prepare(
          "UPDATE transactions SET status = 'rejected' WHERE reference_id = ? AND type = 'deposit'"
        ).run(`DEP-${depId}`);
      }

      return { status: 200 };
    }).immediate();

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Review deposit error:', err);
    res.status(500).json({ error: 'Failed to process deposit review.' });
  }
});

app.get('/api/admin/withdrawals', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const withdrawals = db
    .prepare(
      `SELECT w.*, u.username, u.player_id, u.email
       FROM withdrawals w
       JOIN users u ON u.id = w.user_id
       ORDER BY CASE w.status WHEN 'pending' THEN 0 ELSE 1 END, w.created_at DESC`
    )
    .all();
  res.json({ withdrawals });
});

app.post('/api/admin/withdrawals/:id/review', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const wId = Number(req.params.id);
    const action =
      req.body.action === 'approve'
        ? 'approve'
        : req.body.action === 'pay'
          ? 'pay'
          : req.body.action === 'reject'
            ? 'reject'
            : null;
    const adminNote = typeof req.body.adminNote === 'string' ? req.body.adminNote.trim() : '';

    if (!action) {
      res.status(400).json({ error: 'Action must be approve, pay, or reject.' });
      return;
    }

    const result = db.transaction(() => {
      const wd = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(wId) as
        | {
            id: number;
            user_id: number;
            amount: number;
            method: string;
            bank_name: string;
            account_number: string;
            status: string;
          }
        | undefined;
      if (!wd) return { status: 404, error: 'Withdrawal request not found.' };
      if (wd.status === 'paid' || wd.status === 'rejected') {
        return { status: 409, error: `Withdrawal has already been ${wd.status}.` };
      }

      const wallet = db
        .prepare('SELECT available_balance, pending_withdrawal, total_withdrawn FROM wallet_accounts WHERE user_id = ?')
        .get(wd.user_id) as {
        available_balance: number;
        pending_withdrawal: number;
        total_withdrawn: number;
      };

      if (action === 'approve') {
        if (wd.status !== 'pending') {
          return { status: 409, error: `Withdrawal is already ${wd.status}.` };
        }
        if (wallet.available_balance < wd.amount) {
          return { status: 400, error: 'Player wallet balance is insufficient for this withdrawal.' };
        }
        db.prepare(
          "UPDATE withdrawals SET status = 'approved', admin_note = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
        ).run(adminNote || 'Approved for payout', req.user!.id, wId);
        db.prepare(
          "UPDATE transactions SET status = 'approved' WHERE reference_id = ? AND type = 'withdrawal'"
        ).run(`WD-${wId}`);
        return { status: 200 };
      }

      const nextPending = Math.max(0, wallet.pending_withdrawal - wd.amount);

      if (action === 'pay') {
        if (wallet.available_balance < wd.amount) {
          return {
            status: 400,
            error: `Player available balance (PKR ${wallet.available_balance}) is below payout amount (PKR ${wd.amount}).`,
          };
        }
        const nextBal = wallet.available_balance - wd.amount;
        const nextTotalWd = wallet.total_withdrawn + wd.amount;

        db.prepare(
          "UPDATE withdrawals SET status = 'paid', admin_note = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
        ).run(adminNote || 'Payment confirmed & transferred', req.user!.id, wId);

        db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nextBal, wd.user_id);
        db.prepare(
          "UPDATE wallet_accounts SET available_balance = ?, pending_withdrawal = ?, total_withdrawn = ?, updated_at = datetime('now') WHERE user_id = ?"
        ).run(nextBal, nextPending, nextTotalWd, wd.user_id);

        const methodLabel =
          wd.method === 'bank_account'
            ? `${wd.bank_name || 'Bank'} Account`
            : wd.method === 'easypaisa'
              ? 'Easypaisa'
              : 'JazzCash';

        db.prepare(
          "UPDATE transactions SET status = 'paid', balance_after = ?, description = ? WHERE reference_id = ? AND type = 'withdrawal'"
        ).run(nextBal, `Paid via ${methodLabel} (${wd.account_number})`, `WD-${wId}`);
      } else {
        db.prepare(
          "UPDATE withdrawals SET status = 'rejected', admin_note = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
        ).run(adminNote || 'Rejected by admin', req.user!.id, wId);

        db.prepare(
          "UPDATE wallet_accounts SET pending_withdrawal = ?, updated_at = datetime('now') WHERE user_id = ?"
        ).run(nextPending, wd.user_id);

        db.prepare(
          "UPDATE transactions SET status = 'rejected' WHERE reference_id = ? AND type = 'withdrawal'"
        ).run(`WD-${wId}`);
      }

      return { status: 200 };
    }).immediate();

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Review withdrawal error:', err);
    res.status(500).json({ error: 'Failed to process withdrawal review.' });
  }
});

app.get('/api/admin/transactions', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const transactions = db
    .prepare(
      `SELECT t.*, u.username, u.player_id
       FROM transactions t
       JOIN users u ON u.id = t.user_id
       ORDER BY t.id DESC
       LIMIT 300`
    )
    .all();
  res.json({ transactions });
});

// --- ADMIN TEAM REGISTRATIONS, ANNOUNCEMENTS & CONTACT TICKETS ---
app.get('/api/admin/team-registrations', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const registrations = db
    .prepare(
      `SELECT tr.*, t.title as tournament_title, t.mode as tournament_mode, t.match_time
       FROM team_registrations tr
       JOIN tournaments t ON t.id = tr.tournament_id
       ORDER BY CASE tr.status WHEN 'pending' THEN 0 ELSE 1 END, tr.id DESC
       LIMIT 200`
    )
    .all();
  res.json({ registrations });
});

app.post(
  '/api/admin/team-registrations/:id/review',
  requireAuth,
  requireAdmin,
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const regId = Number(req.params.id);
      const action = req.body.action === 'confirm' ? 'confirm' : req.body.action === 'reject' ? 'reject' : null;
      if (!Number.isInteger(regId) || regId <= 0 || !action) {
        res.status(400).json({ error: 'Valid registration ID and action (confirm/reject) are required.' });
        return;
      }

      const result = db.transaction(() => {
        const reg = db.prepare('SELECT * FROM team_registrations WHERE id = ?').get(regId) as
          | { id: number; tournament_id: number; status: string }
          | undefined;
        if (!reg) return { status: 404, error: 'Team registration not found.' };
        if (reg.status === 'confirmed' && action === 'confirm') {
          return { status: 409, error: 'Team registration is already confirmed.' };
        }
        if (reg.status === 'rejected' && action === 'reject') {
          return { status: 409, error: 'Team registration is already rejected.' };
        }

        if (action === 'confirm') {
          const t = db
            .prepare('SELECT max_slots, filled_slots FROM tournaments WHERE id = ?')
            .get(reg.tournament_id) as { max_slots: number; filled_slots: number } | undefined;
          if (!t) return { status: 404, error: 'Tournament not found.' };
          if (t.filled_slots >= t.max_slots) {
            return { status: 400, error: 'Tournament slots are already full.' };
          }
          db.prepare("UPDATE team_registrations SET status = 'confirmed' WHERE id = ?").run(regId);
          db.prepare('UPDATE tournaments SET filled_slots = filled_slots + 1 WHERE id = ?').run(reg.tournament_id);
        } else {
          if (reg.status === 'confirmed') {
            db.prepare('UPDATE tournaments SET filled_slots = MAX(0, filled_slots - 1) WHERE id = ?').run(
              reg.tournament_id
            );
          }
          db.prepare("UPDATE team_registrations SET status = 'rejected' WHERE id = ?").run(regId);
        }

        return { status: 200 };
      }).immediate();

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('Review team registration error:', err);
      res.status(500).json({ error: 'Failed to update registration status.' });
    }
  }
);

app.post('/api/admin/announcements', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const category = ['Announcement', 'Match Result', 'Room Alert', 'Rules Update'].includes(req.body.category)
      ? req.body.category
      : 'Announcement';
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    const tournamentId = req.body.tournamentId ? Number(req.body.tournamentId) : null;
    const isPinned = req.body.isPinned ? 1 : 0;

    if (title.length < 3 || title.length > 140) {
      res.status(400).json({ error: 'Announcement title must be 3–140 characters.' });
      return;
    }
    if (content.length < 5 || content.length > 1500) {
      res.status(400).json({ error: 'Announcement details must be 5–1500 characters.' });
      return;
    }

    const info = db
      .prepare(
        `INSERT INTO announcements (title, category, tournament_id, content, is_pinned, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        title,
        category,
        tournamentId && Number.isInteger(tournamentId) ? tournamentId : null,
        content,
        isPinned,
        req.user!.id
      );

    const created = db
      .prepare(
        `SELECT a.id, a.title, a.category, a.tournament_id, t.title as tournament_title,
                a.content, a.is_pinned, a.created_at
         FROM announcements a
         LEFT JOIN tournaments t ON t.id = a.tournament_id
         WHERE a.id = ?`
      )
      .get(Number(info.lastInsertRowid));

    res.status(201).json({ announcement: created });
  } catch (err) {
    console.error('Create announcement error:', err);
    res.status(500).json({ error: 'Failed to publish announcement.' });
  }
});

app.delete('/api/admin/announcements/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid announcement ID.' });
    return;
  }
  const info = db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Announcement not found.' });
    return;
  }
  res.json({ ok: true });
});

app.get('/api/admin/contacts', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const contacts = db
    .prepare(
      `SELECT * FROM contact_messages
       ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, id DESC
       LIMIT 200`
    )
    .all();
  res.json({ contacts });
});

app.patch('/api/admin/contacts/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  const status = req.body.status === 'resolved' ? 'resolved' : req.body.status === 'open' ? 'open' : null;
  if (!Number.isInteger(id) || id <= 0 || !status) {
    res.status(400).json({ error: 'Valid contact ID and status are required.' });
    return;
  }
  const info = db.prepare('UPDATE contact_messages SET status = ? WHERE id = ?').run(status, id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Contact message not found.' });
    return;
  }
  res.json({ ok: true });
});

// --- ADMIN YOUTUBE VIDEOS MANAGEMENT ---
app.post('/api/admin/videos', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawTitle = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const title = (rawTitle || 'FREE FIRE TOURNAMENT 09 Highlights').slice(0, 120);
    const parsed = extractYouTubeVideoId(req.body.youtubeUrl);
    if (!parsed) {
      res.status(400).json({
        error: 'Please paste a valid YouTube video link (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...).',
      });
      return;
    }

    const reqFeatured = req.body.isFeatured !== false;
    const created = db.transaction(() => {
      const existingCount = (
        db.prepare('SELECT COUNT(*) as count FROM youtube_videos').get() as { count: number }
      ).count;
      const shouldFeature = reqFeatured || existingCount === 0 ? 1 : 0;

      if (shouldFeature === 1) {
        db.prepare('UPDATE youtube_videos SET is_featured = 0').run();
      }

      const info = db
        .prepare(
          `INSERT INTO youtube_videos (title, youtube_url, video_id, is_featured, created_by)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(title, parsed.normalizedUrl, parsed.videoId, shouldFeature, req.user!.id);

      return db
        .prepare('SELECT id, title, youtube_url, video_id, is_featured, created_at, updated_at FROM youtube_videos WHERE id = ?')
        .get(Number(info.lastInsertRowid));
    }).immediate();

    const videos = db
      .prepare('SELECT id, title, youtube_url, video_id, is_featured, created_at, updated_at FROM youtube_videos ORDER BY is_featured DESC, id DESC')
      .all();

    res.status(201).json({ video: created, videos });
  } catch (err) {
    console.error('Create YouTube video error:', err);
    res.status(500).json({ error: 'Failed to save YouTube video.' });
  }
});

app.patch('/api/admin/videos/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid video ID.' });
      return;
    }

    const existing = db.prepare('SELECT * FROM youtube_videos WHERE id = ?').get(id) as
      | { id: number; title: string; youtube_url: string; video_id: string; is_featured: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'YouTube video not found.' });
      return;
    }

    let nextUrl = existing.youtube_url;
    let nextVideoId = existing.video_id;
    if (req.body.youtubeUrl !== undefined) {
      const parsed = extractYouTubeVideoId(req.body.youtubeUrl);
      if (!parsed) {
        res.status(400).json({
          error: 'Please enter a valid YouTube video URL (youtube.com/watch?v=... or youtu.be/...).',
        });
        return;
      }
      nextUrl = parsed.normalizedUrl;
      nextVideoId = parsed.videoId;
    }

    const nextTitle =
      req.body.title !== undefined
        ? (typeof req.body.title === 'string' && req.body.title.trim()
            ? req.body.title.trim()
            : 'FREE FIRE TOURNAMENT 09 Highlights'
          ).slice(0, 120)
        : existing.title;

    const nextFeatured =
      req.body.isFeatured !== undefined ? (req.body.isFeatured ? 1 : 0) : existing.is_featured;

    db.transaction(() => {
      if (nextFeatured === 1) {
        db.prepare('UPDATE youtube_videos SET is_featured = 0 WHERE id != ?').run(id);
      }
      db.prepare(
        `UPDATE youtube_videos
         SET title = ?, youtube_url = ?, video_id = ?, is_featured = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(nextTitle, nextUrl, nextVideoId, nextFeatured, id);
    }).immediate();

    const updated = db
      .prepare('SELECT id, title, youtube_url, video_id, is_featured, created_at, updated_at FROM youtube_videos WHERE id = ?')
      .get(id);
    const videos = db
      .prepare('SELECT id, title, youtube_url, video_id, is_featured, created_at, updated_at FROM youtube_videos ORDER BY is_featured DESC, id DESC')
      .all();

    res.json({ video: updated, videos });
  } catch (err) {
    console.error('Update YouTube video error:', err);
    res.status(500).json({ error: 'Failed to update YouTube video.' });
  }
});

app.delete('/api/admin/videos/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid video ID.' });
      return;
    }

    const deleted = db.transaction(() => {
      const existing = db.prepare('SELECT id, is_featured FROM youtube_videos WHERE id = ?').get(id) as
        | { id: number; is_featured: number }
        | undefined;
      if (!existing) return false;

      db.prepare('DELETE FROM youtube_videos WHERE id = ?').run(id);

      if (existing.is_featured === 1) {
        const nextVideo = db
          .prepare('SELECT id FROM youtube_videos ORDER BY id DESC LIMIT 1')
          .get() as { id: number } | undefined;
        if (nextVideo) {
          db.prepare('UPDATE youtube_videos SET is_featured = 1 WHERE id = ?').run(nextVideo.id);
        }
      }
      return true;
    }).immediate();

    if (!deleted) {
      res.status(404).json({ error: 'YouTube video not found.' });
      return;
    }

    const videos = db
      .prepare('SELECT id, title, youtube_url, video_id, is_featured, created_at, updated_at FROM youtube_videos ORDER BY is_featured DESC, id DESC')
      .all();

    res.json({ ok: true, videos });
  } catch (err) {
    console.error('Delete YouTube video error:', err);
    res.status(500).json({ error: 'Failed to delete YouTube video.' });
  }
});

// --- FRONTEND STATIC / VITE MIDDLEWARE ---
async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrEnabled = process.env.DISABLE_HMR !== 'true';
    const vite = await createViteServer({
      plugins: hmrEnabled
        ? []
        : [
            {
              name: 'disable-hmr-client-ws',
              enforce: 'post',
              transform(code: string, id: string) {
                if (!id.endsWith('/vite/dist/client/client.mjs')) return;
                const patched = code
                  .replace(
                    /let wsTransport = createWebSocketModuleRunnerTransport\(\{[\s\S]*?\}\);/,
                    'let wsTransport = { async connect() {}, async disconnect() {}, send() {} };'
                  )
                  .replace(
                    /new WebSocket\(`\$\{socketProtocol\}:\/\/\$\{socketHost\}\?token=\$\{wsToken\}`[^)]*\)/g,
                    'null'
                  );
                if (patched !== code) {
                  return { code: patched, map: null };
                }
              },
            },
          ],
      server: {
        middlewareMode: true,
        hmr: hmrEnabled ? { server: httpServer } : false,
        ws: hmrEnabled ? { server: httpServer } : false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Pro Tournament server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

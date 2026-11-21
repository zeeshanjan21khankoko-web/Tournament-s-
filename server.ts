import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  db,
  generateTxCode,
  generateUniquePlayerId,
  initDatabase,
} from './server/db.ts';
import {
  type AuthenticatedRequest,
  extractBearerUser,
  getUserById,
  hashPassword,
  isAdminPasscodeConfigured,
  requireAdmin,
  requireAuth,
  signToken,
  verifyAdminPasscode,
  verifyPassword,
} from './server/auth.ts';

initDatabase();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));

const ALLOWED_AVATARS = new Set([
  '/src/assets/images/avatar_esports_pro_1795298801657.jpg',
  '/src/assets/images/tournament_pubg_arena_1795298801850.jpg',
  '/src/assets/images/tournament_valorant_cyber_1795298801660.jpg',
  '/src/assets/images/tournament_freefire_clash_1795298801818.jpg',
]);

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
    return '/src/assets/images/tournament_pubg_arena_1795298801850.jpg';
  }
  const trimmed = value.trim();
  if (ALLOWED_AVATARS.has(trimmed)) return trimmed;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed;
  }
  return '/src/assets/images/tournament_pubg_arena_1795298801850.jpg';
}

const PAYMENT_CHANNELS = [
  {
    id: 'jazzcash',
    name: 'JazzCash Mobile Account',
    accountTitle: 'Pro Tournament Esports',
    accountNumber: '03406690336',
    providerLabel: 'JazzCash (Mobilink Microfinance)',
    instructions: [
      'Open your JazzCash mobile app or dial *786#.',
      'Select Money Transfer -> Send to JazzCash Account.',
      'Enter account number 03406690336 and verify the recipient details.',
      'Copy the TID (Transaction ID) from your SMS confirmation and upload the payment screenshot below.',
    ],
  },
  {
    id: 'easypaisa',
    name: 'Easypaisa Mobile Wallet',
    accountTitle: 'Pro Tournament Esports',
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

// --- HEALTH ---
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
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
          `INSERT INTO users (player_id, username, email, password_hash, avatar_url, role, wallet_balance)
           VALUES (?, ?, ?, ?, ?, 'player', 0)`
        )
        .run(playerId, username, email, passwordHash, avatarUrl);
      const newId = Number(info.lastInsertRowid);
      db.prepare('INSERT INTO wallet_accounts (user_id, available_balance) VALUES (?, 0)').run(newId);
      return newId;
    }).immediate();

    const user = getUserById(userId)!;
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
    const token = signToken(user.id, 'admin');
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Claim admin error:', err);
    res.status(500).json({ error: 'Admin setup failed.' });
  }
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const wallet = db
    .prepare('SELECT * FROM wallet_accounts WHERE user_id = ?')
    .get(req.user!.id);
  res.json({ user: req.user, wallet });
});

app.patch('/api/auth/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : req.user!.username;
    const avatarChecked =
      req.body.avatarUrl !== undefined
        ? validateImageInput(req.body.avatarUrl, 1024 * 1024)
        : req.user!.avatar_url;

    if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      res.status(400).json({ error: 'Username must be 3–24 valid characters.' });
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

    db.prepare('UPDATE users SET username = ?, avatar_url = ? WHERE id = ?').run(
      username,
      avatarChecked,
      req.user!.id
    );
    res.json({ user: getUserById(req.user!.id) });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
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

  const isRegistered = viewer ? players.some((p) => Number(p.user_id) === viewer.id) : false;
  const canSeeRoom = viewer ? viewer.role === 'admin' || isRegistered : false;

  return {
    id: t.id,
    title: t.title,
    game_name: t.game_name,
    entry_fee: t.entry_fee,
    prize_pool: t.prize_pool,
    max_slots: t.max_slots,
    filled_slots: t.filled_slots,
    match_time: t.match_time,
    status: t.status,
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
  const rows = db
    .prepare(
      `SELECT * FROM tournaments
       ORDER BY CASE status WHEN 'live' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
                match_time ASC`
    )
    .all() as Array<Record<string, unknown>>;
  res.json({ tournaments: rows.map((r) => enrichTournament(r, viewer)) });
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
            status: string;
          }
        | undefined;
      if (!t) return { status: 404, error: 'Tournament not found.' };
      if (t.status !== 'upcoming' && t.status !== 'live') {
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
        .prepare('SELECT available_balance FROM wallet_accounts WHERE user_id = ?')
        .get(req.user!.id) as { available_balance: number } | undefined;
      const available = wallet ? wallet.available_balance : 0;
      if (available < t.entry_fee) {
        return {
          status: 400,
          error: `Insufficient wallet balance. Required: PKR ${t.entry_fee}, Available: PKR ${available}.`,
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
  const wallet = db.prepare('SELECT * FROM wallet_accounts WHERE user_id = ?').get(req.user!.id);
  const deposits = db
    .prepare(
      `SELECT id, amount, method, transaction_ref, sender_account, status, admin_note, created_at, reviewed_at
       FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(req.user!.id);
  const withdrawals = db
    .prepare(
      `SELECT id, amount, method, account_title, account_number, status, admin_note, created_at, reviewed_at
       FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(req.user!.id);
  const transactions = db
    .prepare(
      `SELECT id, tx_code, type, amount, direction, balance_after, status, reference_id, description, created_at
       FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100`
    )
    .all(req.user!.id);

  res.json({
    wallet,
    deposits,
    withdrawals,
    transactions,
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
    const accountTitle = typeof req.body.accountTitle === 'string' ? req.body.accountTitle.trim() : '';
    const accountNumber = typeof req.body.accountNumber === 'string' ? req.body.accountNumber.trim() : '';

    if (!Number.isInteger(amount) || amount < 200 || amount > 500000) {
      res.status(400).json({ error: 'Withdrawal amount must be a whole number between PKR 200 and PKR 500,000.' });
      return;
    }
    if (!['jazzcash', 'easypaisa'].includes(method)) {
      res.status(400).json({ error: 'Invalid payout method selected. Choose JazzCash or Easypaisa.' });
      return;
    }
    if (accountTitle.length < 2 || accountTitle.length > 64) {
      res.status(400).json({ error: 'Account holder title is required.' });
      return;
    }
    if (accountNumber.length < 6 || accountNumber.length > 20) {
      res.status(400).json({ error: 'Valid mobile wallet number is required.' });
      return;
    }

    const result = db.transaction(() => {
      const wallet = db
        .prepare('SELECT available_balance, pending_withdrawal FROM wallet_accounts WHERE user_id = ?')
        .get(req.user!.id) as { available_balance: number; pending_withdrawal: number };

      if (amount > wallet.available_balance) {
        return {
          error: `Insufficient available balance. Available: PKR ${wallet.available_balance}.`,
        };
      }

      const newBalance = wallet.available_balance - amount;
      const newPending = wallet.pending_withdrawal + amount;

      db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(newBalance, req.user!.id);
      db.prepare(
        "UPDATE wallet_accounts SET available_balance = ?, pending_withdrawal = ?, updated_at = datetime('now') WHERE user_id = ?"
      ).run(newBalance, newPending, req.user!.id);

      const wInfo = db
        .prepare(
          `INSERT INTO withdrawals (user_id, amount, method, account_title, account_number, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`
        )
        .run(req.user!.id, amount, method, accountTitle, accountNumber);

      const wId = Number(wInfo.lastInsertRowid);
      db.prepare(
        `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
         VALUES (?, ?, 'withdrawal', ?, 'debit', ?, 'pending', ?, ?)`
      ).run(
        generateTxCode(),
        req.user!.id,
        amount,
        newBalance,
        `WD-${wId}`,
        `Withdrawal request via ${method.replace('_', ' ')} (${accountNumber})`
      );

      return { withdrawalId: wId, newBalance };
    }).immediate();

    if ('error' in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json({
      ok: true,
      withdrawalId: result.withdrawalId,
      user: getUserById(req.user!.id),
    });
  } catch (err) {
    console.error('Withdraw error:', err);
    res.status(500).json({ error: 'Failed to submit withdrawal request.' });
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

  const tournamentStats = db
    .prepare(
      `SELECT
         COUNT(*) as totalTournaments,
         COALESCE(SUM(CASE WHEN status IN ('upcoming', 'live') THEN 1 ELSE 0 END), 0) as activeTournaments
       FROM tournaments`
    )
    .get() as Record<string, number>;

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
         COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pendingWithdrawals,
         COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as totalWithdrawn
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

  res.json({
    overview: {
      ...userStats,
      ...tournamentStats,
      ...depositStats,
      ...withdrawalStats,
      ...ledgerStats,
    },
  });
});

app.get('/api/admin/users', requireAuth, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const users = db
    .prepare(
      `SELECT u.id, u.player_id, u.username, u.email, u.avatar_url, u.role, u.is_blocked,
              u.wallet_balance, u.matches_played, u.wins, u.created_at,
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

// --- ADMIN TOURNAMENT MANAGEMENT ---
app.post('/api/admin/tournaments', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const gameName = typeof req.body.gameName === 'string' ? req.body.gameName.trim() : '';
    const entryFee = Math.floor(Number(req.body.entryFee));
    const prizePool = Math.floor(Number(req.body.prizePool));
    const maxSlots = Math.floor(Number(req.body.maxSlots));
    const matchTime = typeof req.body.matchTime === 'string' ? req.body.matchTime.trim() : '';
    const status = ['upcoming', 'live', 'completed', 'cancelled'].includes(req.body.status)
      ? req.body.status
      : 'upcoming';
    const rules = typeof req.body.rules === 'string' ? req.body.rules.trim() : '';
    const roomId = typeof req.body.roomId === 'string' ? req.body.roomId.trim() : '';
    const roomPass = typeof req.body.roomPass === 'string' ? req.body.roomPass.trim() : '';
    const bannerUrl = sanitizeBannerUrl(req.body.bannerUrl);

    if (title.length < 3 || gameName.length < 2) {
      res.status(400).json({ error: 'Tournament title and game name are required.' });
      return;
    }
    if (!Number.isFinite(entryFee) || entryFee < 0 || !Number.isFinite(prizePool) || prizePool < 0) {
      res.status(400).json({ error: 'Entry fee and prize pool must be 0 or greater.' });
      return;
    }
    if (!Number.isFinite(maxSlots) || maxSlots < 2 || maxSlots > 500) {
      res.status(400).json({ error: 'Max slots must be between 2 and 500.' });
      return;
    }
    if (!matchTime) {
      res.status(400).json({ error: 'Match date/time is required.' });
      return;
    }

    const info = db
      .prepare(
        `INSERT INTO tournaments (
           title, game_name, entry_fee, prize_pool, max_slots, match_time,
           status, banner_url, rules, room_id, room_pass, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        title,
        gameName,
        entryFee,
        prizePool,
        maxSlots,
        matchTime,
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
    const entryFee =
      req.body.entryFee !== undefined ? Math.max(0, Math.floor(Number(req.body.entryFee))) : existing.entry_fee;
    const prizePool =
      req.body.prizePool !== undefined ? Math.max(0, Math.floor(Number(req.body.prizePool))) : existing.prize_pool;
    const maxSlots =
      req.body.maxSlots !== undefined
        ? Math.max(Number(existing.filled_slots), Math.floor(Number(req.body.maxSlots)))
        : existing.max_slots;
    const matchTime =
      typeof req.body.matchTime === 'string' && req.body.matchTime.trim()
        ? req.body.matchTime.trim()
        : existing.match_time;
    const status = ['upcoming', 'live', 'completed', 'cancelled'].includes(req.body.status)
      ? req.body.status
      : existing.status;
    const rules = typeof req.body.rules === 'string' ? req.body.rules.trim() : existing.rules;
    const roomId = typeof req.body.roomId === 'string' ? req.body.roomId.trim() : existing.room_id;
    const roomPass = typeof req.body.roomPass === 'string' ? req.body.roomPass.trim() : existing.room_pass;
    const bannerUrl = req.body.bannerUrl ? sanitizeBannerUrl(req.body.bannerUrl) : existing.banner_url;

    db.prepare(
      `UPDATE tournaments
       SET title = ?, game_name = ?, entry_fee = ?, prize_pool = ?, max_slots = ?,
           match_time = ?, status = ?, banner_url = ?, rules = ?, room_id = ?, room_pass = ?
       WHERE id = ?`
    ).run(title, gameName, entryFee, prizePool, maxSlots, matchTime, status, bannerUrl, rules, roomId, roomPass, id);

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

app.post('/api/admin/tournaments/:id/winners', requireAuth, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tournamentId = Number(req.params.id);
    const winnersInput = Array.isArray(req.body.winners) ? req.body.winners : [];
    if (winnersInput.length === 0) {
      res.status(400).json({ error: 'Provide at least one winner with placement and prize amount.' });
      return;
    }

    const result = db.transaction(() => {
      const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as
        | { id: number; title: string; status: string }
        | undefined;
      if (!t) return { status: 404, error: 'Tournament not found.' };

      const existingWinners = db
        .prepare('SELECT COUNT(*) as count FROM winners WHERE tournament_id = ?')
        .get(tournamentId) as { count: number };
      if (existingWinners.count > 0) {
        return { status: 409, error: 'Winners have already been declared and paid for this tournament.' };
      }

      for (const entry of winnersInput) {
        const uid = Number(entry.userId);
        const placement = Number(entry.placement);
        const prizeAmount = Math.floor(Number(entry.prizeAmount));

        if (!Number.isInteger(uid) || !Number.isInteger(placement) || placement < 1 || prizeAmount < 0) {
          return { status: 400, error: 'Invalid winner entry data.' };
        }

        const isReg = db
          .prepare('SELECT id FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?')
          .get(tournamentId, uid);
        if (!isReg) {
          return { status: 400, error: 'Selected winner is not registered in this tournament.' };
        }

        db.prepare(
          `INSERT INTO winners (tournament_id, user_id, placement, prize_amount, declared_by)
           VALUES (?, ?, ?, ?, ?)`
        ).run(tournamentId, uid, placement, prizeAmount, req.user!.id);

        if (placement === 1) {
          db.prepare('UPDATE users SET wins = wins + 1 WHERE id = ?').run(uid);
        }

        if (prizeAmount > 0) {
          const wallet = db
            .prepare('SELECT available_balance, total_won FROM wallet_accounts WHERE user_id = ?')
            .get(uid) as { available_balance: number; total_won: number };
          const nextBal = wallet.available_balance + prizeAmount;
          const nextWon = wallet.total_won + prizeAmount;

          db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(nextBal, uid);
          db.prepare(
            "UPDATE wallet_accounts SET available_balance = ?, total_won = ?, updated_at = datetime('now') WHERE user_id = ?"
          ).run(nextBal, nextWon, uid);

          db.prepare(
            `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
             VALUES (?, ?, 'prize_win', ?, 'credit', ?, 'completed', ?, ?)`
          ).run(
            generateTxCode(),
            uid,
            prizeAmount,
            nextBal,
            `TOUR-${tournamentId}`,
            `#${placement} Prize Winner — ${t.title}`
          );
        }
      }

      db.prepare("UPDATE tournaments SET status = 'completed' WHERE id = ?").run(tournamentId);
      return { status: 200 };
    }).immediate();

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as Record<string, unknown>;
    res.json({ tournament: enrichTournament(updated, req.user!) });
  } catch (err) {
    console.error('Declare winners error:', err);
    res.status(500).json({ error: 'Failed to declare winners.' });
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
    const action = req.body.action === 'approve' ? 'approve' : req.body.action === 'reject' ? 'reject' : null;
    const adminNote = typeof req.body.adminNote === 'string' ? req.body.adminNote.trim() : '';

    if (!action) {
      res.status(400).json({ error: 'Action must be approve or reject.' });
      return;
    }

    const result = db.transaction(() => {
      const wd = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(wId) as
        | { id: number; user_id: number; amount: number; status: string }
        | undefined;
      if (!wd) return { status: 404, error: 'Withdrawal request not found.' };
      if (wd.status !== 'pending') {
        return { status: 409, error: `Withdrawal has already been ${wd.status}.` };
      }

      const nextStatus = action === 'approve' ? 'approved' : 'rejected';
      db.prepare(
        "UPDATE withdrawals SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
      ).run(nextStatus, adminNote, req.user!.id, wId);

      const wallet = db
        .prepare('SELECT available_balance, pending_withdrawal, total_withdrawn FROM wallet_accounts WHERE user_id = ?')
        .get(wd.user_id) as {
        available_balance: number;
        pending_withdrawal: number;
        total_withdrawn: number;
      };

      const nextPending = Math.max(0, wallet.pending_withdrawal - wd.amount);

      if (action === 'approve') {
        const nextTotalWd = wallet.total_withdrawn + wd.amount;
        db.prepare(
          "UPDATE wallet_accounts SET pending_withdrawal = ?, total_withdrawn = ?, updated_at = datetime('now') WHERE user_id = ?"
        ).run(nextPending, nextTotalWd, wd.user_id);

        db.prepare(
          "UPDATE transactions SET status = 'completed' WHERE reference_id = ? AND type = 'withdrawal'"
        ).run(`WD-${wId}`);
      } else {
        const refundedBal = wallet.available_balance + wd.amount;
        db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(refundedBal, wd.user_id);
        db.prepare(
          "UPDATE wallet_accounts SET available_balance = ?, pending_withdrawal = ?, updated_at = datetime('now') WHERE user_id = ?"
        ).run(refundedBal, nextPending, wd.user_id);

        db.prepare(
          "UPDATE transactions SET status = 'rejected' WHERE reference_id = ? AND type = 'withdrawal'"
        ).run(`WD-${wId}`);

        db.prepare(
          `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
           VALUES (?, ?, 'refund', ?, 'credit', ?, 'completed', ?, ?)`
        ).run(
          generateTxCode(),
          wd.user_id,
          wd.amount,
          refundedBal,
          `WD-${wId}`,
          `Withdrawal #${wId} rejected & refunded${adminNote ? `: ${adminNote}` : ''}`
        );
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

// --- FRONTEND STATIC / VITE MIDDLEWARE ---
async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pro Tournament server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

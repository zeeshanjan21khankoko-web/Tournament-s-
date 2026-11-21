import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'pro_tournament.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_url TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('player', 'admin')),
      is_blocked INTEGER NOT NULL DEFAULT 0 CHECK(is_blocked IN (0, 1)),
      wallet_balance INTEGER NOT NULL DEFAULT 0 CHECK(wallet_balance >= 0),
      matches_played INTEGER NOT NULL DEFAULT 0 CHECK(matches_played >= 0),
      wins INTEGER NOT NULL DEFAULT 0 CHECK(wins >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admin_level TEXT NOT NULL DEFAULT 'super_admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wallet_accounts (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      available_balance INTEGER NOT NULL DEFAULT 0 CHECK(available_balance >= 0),
      pending_withdrawal INTEGER NOT NULL DEFAULT 0 CHECK(pending_withdrawal >= 0),
      total_deposited INTEGER NOT NULL DEFAULT 0 CHECK(total_deposited >= 0),
      total_withdrawn INTEGER NOT NULL DEFAULT 0 CHECK(total_withdrawn >= 0),
      total_won INTEGER NOT NULL DEFAULT 0 CHECK(total_won >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      game_name TEXT NOT NULL,
      entry_fee INTEGER NOT NULL CHECK(entry_fee >= 0),
      prize_pool INTEGER NOT NULL CHECK(prize_pool >= 0),
      max_slots INTEGER NOT NULL CHECK(max_slots > 0),
      filled_slots INTEGER NOT NULL DEFAULT 0 CHECK(filled_slots >= 0),
      match_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'live', 'completed', 'cancelled')),
      banner_url TEXT NOT NULL DEFAULT '',
      rules TEXT NOT NULL DEFAULT '',
      room_id TEXT NOT NULL DEFAULT '',
      room_pass TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tournament_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      in_game_name TEXT NOT NULL,
      in_game_id TEXT NOT NULL,
      slot_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered', 'disqualified')),
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tournament_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL CHECK(amount > 0),
      method TEXT NOT NULL CHECK(method IN ('jazzcash', 'easypaisa', 'bank_transfer')),
      transaction_ref TEXT UNIQUE NOT NULL,
      sender_account TEXT NOT NULL,
      screenshot_data TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      admin_note TEXT NOT NULL DEFAULT '',
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL CHECK(amount > 0),
      method TEXT NOT NULL CHECK(method IN ('jazzcash', 'easypaisa', 'bank_transfer')),
      account_title TEXT NOT NULL,
      account_number TEXT NOT NULL,
      bank_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      admin_note TEXT NOT NULL DEFAULT '',
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_code TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'entry_fee', 'prize_win', 'refund', 'admin_adjustment')),
      amount INTEGER NOT NULL CHECK(amount >= 0),
      direction TEXT NOT NULL CHECK(direction IN ('credit', 'debit')),
      balance_after INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending', 'completed', 'rejected')),
      reference_id TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS winners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      placement INTEGER NOT NULL CHECK(placement >= 1 AND placement <= 10),
      prize_amount INTEGER NOT NULL CHECK(prize_amount >= 0),
      declared_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      declared_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tournament_id, placement),
      UNIQUE(tournament_id, user_id)
    );
  `);

  const tournamentCount = db.prepare('SELECT COUNT(*) as count FROM tournaments').get() as { count: number };
  if (tournamentCount.count === 0) {
    const insertTournament = db.prepare(`
      INSERT INTO tournaments (
        title, game_name, entry_fee, prize_pool, max_slots, filled_slots,
        match_time, status, banner_url, rules, room_id, room_pass
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    const hour = 3600 * 1000;

    insertTournament.run(
      'Erangel Champions Cup',
      'PUBG Mobile',
      500,
      25000,
      48,
      0,
      new Date(now + 15 * 60 * 1000).toISOString(),
      'live',
      '/src/assets/images/tournament_pubg_arena_1795298801850.jpg',
      'Solo TPP Erangel. No emulators or third-party tools. Room ID & password unlock upon registration.',
      'ER-9042',
      'PRO778'
    );

    insertTournament.run(
      'Cyber Strike Premier',
      'Valorant',
      1000,
      50000,
      16,
      0,
      new Date(now + 4 * hour).toISOString(),
      'upcoming',
      '/src/assets/images/tournament_valorant_cyber_1795298801660.jpg',
      '1v1 Skirmish & Deathmatch Bracket. Best of 3 maps. Standard tournament ruleset applies.',
      'VAL-3310',
      'STRIKE26'
    );

    insertTournament.run(
      'Bermuda Night Clash',
      'Free Fire',
      300,
      12000,
      32,
      0,
      new Date(now + 8 * hour).toISOString(),
      'upcoming',
      '/src/assets/images/tournament_freefire_clash_1795298801818.jpg',
      'Bermuda Full Map Classic. Mobile devices only. Screenshots of match summary required for dispute resolution.',
      'FF-8120',
      'CLASH99'
    );

    insertTournament.run(
      'Blackout Tactical Royale',
      'COD Mobile',
      400,
      18000,
      32,
      0,
      new Date(now + 24 * hour).toISOString(),
      'upcoming',
      '/src/assets/images/tournament_pubg_arena_1795298801850.jpg',
      'Isolated BR Solo. Controller prohibited. Join custom lobby 10 minutes before match start.',
      'COD-5541',
      'TAC404'
    );

    insertTournament.run(
      'Karachi Midnight Showdown',
      'PUBG Mobile',
      250,
      10000,
      24,
      0,
      new Date(now + 36 * hour).toISOString(),
      'upcoming',
      '/src/assets/images/tournament_freefire_clash_1795298801818.jpg',
      'Sanhok Fast-Paced Solo. Top 3 placements earn direct wallet prize payouts.',
      'KHI-2090',
      'NIGHT11'
    );
  }
}

export function generateUniquePlayerId(): string {
  for (let i = 0; i < 10; i++) {
    const digits = crypto.randomInt(100000, 999999);
    const candidate = `PT-${digits}`;
    const exists = db.prepare('SELECT 1 FROM users WHERE player_id = ?').get(candidate);
    if (!exists) return candidate;
  }
  return `PT-${Date.now().toString().slice(-6)}`;
}

export function generateTxCode(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TXN-${datePart}-${randPart}`;
}

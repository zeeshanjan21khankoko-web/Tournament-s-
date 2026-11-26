import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'pro_tournament.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
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
      points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0),
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
      mode TEXT NOT NULL DEFAULT 'Battle Royale' CHECK(mode IN ('Battle Royale', 'Clash Squad', 'Lone Wolf')),
      entry_fee INTEGER NOT NULL CHECK(entry_fee >= 0),
      prize_pool INTEGER NOT NULL CHECK(prize_pool >= 0),
      prize_1st INTEGER NOT NULL DEFAULT 0 CHECK(prize_1st >= 0),
      prize_2nd INTEGER NOT NULL DEFAULT 0 CHECK(prize_2nd >= 0),
      prize_3rd INTEGER NOT NULL DEFAULT 0 CHECK(prize_3rd >= 0),
      prize_4th INTEGER NOT NULL DEFAULT 0 CHECK(prize_4th >= 0),
      prize_5th INTEGER NOT NULL DEFAULT 0 CHECK(prize_5th >= 0),
      max_slots INTEGER NOT NULL CHECK(max_slots > 0),
      filled_slots INTEGER NOT NULL DEFAULT 0 CHECK(filled_slots >= 0),
      match_time TEXT NOT NULL,
      end_time TEXT NOT NULL DEFAULT '',
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
      firestore_key TEXT NOT NULL DEFAULT '',
      amount INTEGER NOT NULL CHECK(amount > 0),
      method TEXT NOT NULL CHECK(method IN ('jazzcash', 'easypaisa')),
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
      firestore_key TEXT NOT NULL DEFAULT '',
      amount INTEGER NOT NULL CHECK(amount > 0),
      method TEXT NOT NULL CHECK(method IN ('jazzcash', 'easypaisa', 'bank_account')),
      bank_name TEXT NOT NULL DEFAULT '',
      account_title TEXT NOT NULL,
      account_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'paid')),
      admin_note TEXT NOT NULL DEFAULT '',
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_code TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'entry_fee', 'prize_win', 'refund', 'admin_adjustment', 'transfer_out', 'transfer_in', 'lucky_draw')),
      amount INTEGER NOT NULL CHECK(amount >= 0),
      direction TEXT NOT NULL CHECK(direction IN ('credit', 'debit')),
      balance_after INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending', 'approved', 'paid', 'completed', 'rejected')),
      reference_id TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      idempotency_key TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS team_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_code TEXT UNIQUE NOT NULL,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      leader_name TEXT NOT NULL,
      freefire_uid TEXT NOT NULL,
      whatsapp_number TEXT NOT NULL,
      team_name TEXT NOT NULL,
      squad_type TEXT NOT NULL DEFAULT 'Squad' CHECK(squad_type IN ('Solo', 'Duo', 'Squad')),
      teammates TEXT NOT NULL DEFAULT '',
      payment_method TEXT NOT NULL DEFAULT 'jazzcash' CHECK(payment_method IN ('free', 'wallet', 'jazzcash', 'easypaisa')),
      payment_ref TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Announcement' CHECK(category IN ('Announcement', 'Match Result', 'Room Alert', 'Rules Update')),
      tournament_id INTEGER REFERENCES tournaments(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0 CHECK(is_pinned IN (0, 1)),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      whatsapp_number TEXT NOT NULL,
      freefire_uid TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS youtube_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      youtube_url TEXT NOT NULL,
      video_id TEXT NOT NULL,
      is_featured INTEGER NOT NULL DEFAULT 0 CHECK(is_featured IN (0, 1)),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deleted_tournaments (
      tournament_id INTEGER PRIMARY KEY,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deleted_users_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      player_id TEXT NOT NULL,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      deleted_by_admin_id INTEGER,
      deleted_by_username TEXT NOT NULL DEFAULT '',
      confirmation_note TEXT NOT NULL DEFAULT '',
      deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lucky_draw_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      draw_date_pkt TEXT NOT NULL,
      prize_amount INTEGER NOT NULL DEFAULT 0 CHECK(prize_amount >= 0),
      prize_label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, draw_date_pkt)
    );
  `);

  // Safe schema migration for existing SQLite databases
  const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!userColumns.some((col) => col.name === 'points')) {
    db.exec('ALTER TABLE users ADD COLUMN points INTEGER NOT NULL DEFAULT 0');
  }
  if (!userColumns.some((col) => col.name === 'phone')) {
    db.exec("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
  }
  if (!userColumns.some((col) => col.name === 'kills')) {
    db.exec('ALTER TABLE users ADD COLUMN kills INTEGER NOT NULL DEFAULT 0');
  }
  if (!userColumns.some((col) => col.name === 'firebase_uid')) {
    db.exec("ALTER TABLE users ADD COLUMN firebase_uid TEXT NOT NULL DEFAULT ''");
  }
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid != ''"
  );

  const withdrawalsSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'withdrawals'")
    .get() as { sql?: string } | undefined;
  if (
    withdrawalsSchema?.sql &&
    (!withdrawalsSchema.sql.includes('bank_account') || !withdrawalsSchema.sql.includes("'paid'"))
  ) {
    const wdColsBefore = (
      db.prepare('PRAGMA table_info(withdrawals)').all() as Array<{ name: string }>
    ).map((c) => c.name);
    const hasBankName = wdColsBefore.includes('bank_name');
    const hasFirestoreKey = wdColsBefore.includes('firestore_key');
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE withdrawals_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          firestore_key TEXT NOT NULL DEFAULT '',
          amount INTEGER NOT NULL CHECK(amount > 0),
          method TEXT NOT NULL CHECK(method IN ('jazzcash', 'easypaisa', 'bank_account')),
          bank_name TEXT NOT NULL DEFAULT '',
          account_title TEXT NOT NULL,
          account_number TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'paid')),
          admin_note TEXT NOT NULL DEFAULT '',
          reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          reviewed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO withdrawals_migrated (
          id, user_id, firestore_key, amount, method, bank_name, account_title, account_number,
          status, admin_note, reviewed_by, reviewed_at, created_at
        )
        SELECT id, user_id, ${hasFirestoreKey ? 'firestore_key' : "''"}, amount, method, ${hasBankName ? 'bank_name' : "''"}, account_title, account_number,
               status, admin_note, reviewed_by, reviewed_at, created_at
        FROM withdrawals;
        DROP TABLE withdrawals;
        ALTER TABLE withdrawals_migrated RENAME TO withdrawals;
      `);
    }).immediate();
    db.pragma('foreign_keys = ON');
  }

  const transactionsSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'")
    .get() as { sql?: string } | undefined;
  if (
    transactionsSchema?.sql &&
    (!transactionsSchema.sql.includes("'paid'") ||
      !transactionsSchema.sql.includes("'transfer_out'") ||
      !transactionsSchema.sql.includes("'lucky_draw'"))
  ) {
    const txColsBefore = (
      db.prepare('PRAGMA table_info(transactions)').all() as Array<{ name: string }>
    ).map((c) => c.name);
    const hasIdemKey = txColsBefore.includes('idempotency_key');
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE transactions_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tx_code TEXT UNIQUE NOT NULL,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'entry_fee', 'prize_win', 'refund', 'admin_adjustment', 'transfer_out', 'transfer_in', 'lucky_draw')),
          amount INTEGER NOT NULL CHECK(amount >= 0),
          direction TEXT NOT NULL CHECK(direction IN ('credit', 'debit')),
          balance_after INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending', 'approved', 'paid', 'completed', 'rejected')),
          reference_id TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL,
          idempotency_key TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO transactions_migrated (
          id, tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description, idempotency_key, created_at
        )
        SELECT id, tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description, ${hasIdemKey ? 'idempotency_key' : "''"}, created_at
        FROM transactions;
        DROP TABLE transactions;
        ALTER TABLE transactions_migrated RENAME TO transactions;
      `);
    }).immediate();
    db.pragma('foreign_keys = ON');
  }

  const tournamentColumns = db.prepare('PRAGMA table_info(tournaments)').all() as Array<{ name: string }>;
  if (!tournamentColumns.some((col) => col.name === 'end_time')) {
    db.exec("ALTER TABLE tournaments ADD COLUMN end_time TEXT NOT NULL DEFAULT ''");
  }
  if (!tournamentColumns.some((col) => col.name === 'mode')) {
    db.exec("ALTER TABLE tournaments ADD COLUMN mode TEXT NOT NULL DEFAULT 'Battle Royale'");
  }
  if (!tournamentColumns.some((col) => col.name === 'prize_1st')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN prize_1st INTEGER NOT NULL DEFAULT 0');
  }
  if (!tournamentColumns.some((col) => col.name === 'prize_2nd')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN prize_2nd INTEGER NOT NULL DEFAULT 0');
  }
  if (!tournamentColumns.some((col) => col.name === 'prize_3rd')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN prize_3rd INTEGER NOT NULL DEFAULT 0');
  }
  if (!tournamentColumns.some((col) => col.name === 'prize_4th')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN prize_4th INTEGER NOT NULL DEFAULT 0');
  }
  if (!tournamentColumns.some((col) => col.name === 'prize_5th')) {
    db.exec('ALTER TABLE tournaments ADD COLUMN prize_5th INTEGER NOT NULL DEFAULT 0');
  }

  const depositColumns = db.prepare('PRAGMA table_info(deposits)').all() as Array<{ name: string }>;
  if (!depositColumns.some((col) => col.name === 'firestore_key')) {
    db.exec("ALTER TABLE deposits ADD COLUMN firestore_key TEXT NOT NULL DEFAULT ''");
  }
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_firestore_key ON deposits(firestore_key) WHERE firestore_key != ''"
  );

  const withdrawalColumns = db.prepare('PRAGMA table_info(withdrawals)').all() as Array<{ name: string }>;
  if (!withdrawalColumns.some((col) => col.name === 'firestore_key')) {
    db.exec("ALTER TABLE withdrawals ADD COLUMN firestore_key TEXT NOT NULL DEFAULT ''");
  }
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_firestore_key ON withdrawals(firestore_key) WHERE firestore_key != ''"
  );

  const txColumns = db.prepare('PRAGMA table_info(transactions)').all() as Array<{ name: string }>;
  if (!txColumns.some((col) => col.name === 'idempotency_key')) {
    db.exec("ALTER TABLE transactions ADD COLUMN idempotency_key TEXT NOT NULL DEFAULT ''");
  }
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_idempotency_key ON transactions(idempotency_key) WHERE idempotency_key != ''"
  );

  // Clean up only expired sessions while keeping active persistent sessions intact
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());

  // Guarantee every registered player has a personal wallet record
  db.exec(`
    INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance)
    SELECT id, wallet_balance FROM users;
  `);

  // Reconcile any legacy balance mismatch safely without resetting valid balances
  const mismatchedWallets = db
    .prepare(
      `SELECT u.id as user_id, u.wallet_balance, w.available_balance, w.total_deposited, w.total_won
       FROM users u
       JOIN wallet_accounts w ON w.user_id = u.id
       WHERE u.wallet_balance != w.available_balance`
    )
    .all() as Array<{
    user_id: number;
    wallet_balance: number;
    available_balance: number;
    total_deposited: number;
    total_won: number;
  }>;
  for (const row of mismatchedWallets) {
    const authoritative =
      row.available_balance === 0 &&
      row.wallet_balance > 0 &&
      row.total_deposited === 0 &&
      row.total_won === 0
        ? row.wallet_balance
        : Math.max(0, row.available_balance);
    db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(authoritative, row.user_id);
    db.prepare(
      "UPDATE wallet_accounts SET available_balance = ?, updated_at = datetime('now') WHERE user_id = ?"
    ).run(authoritative, row.user_id);
  }

  // Automatic tournament/announcement creation is permanently disabled.
  // Only the Admin can manually create, edit, or delete tournaments.
  db.prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('auto_seed_disabled', 'true')").run();
  db.prepare(
    "INSERT OR IGNORE INTO app_meta (key, value) VALUES ('auto_tournament_creation_disabled', 'true')"
  ).run();
  db.prepare(
    "INSERT OR IGNORE INTO app_meta (key, value) VALUES ('manual_admin_only_tournaments', 'true')"
  ).run();

  // Automatic user account deletion is permanently disabled.
  // User registrations and balances are preserved permanently unless manually deleted by Admin with confirmation.
  db.prepare(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('auto_user_deletion_disabled', 'true')"
  ).run();
  db.prepare(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('manual_admin_only_user_deletion', 'true')"
  ).run();
  db.prepare(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('preserve_user_registrations', 'true')"
  ).run();

  recalculateAllUserPoints();
}

export interface WalletAccountRow {
  user_id: number;
  available_balance: number;
  pending_withdrawal: number;
  total_deposited: number;
  total_withdrawn: number;
  total_won: number;
  updated_at: string;
}

export function ensureAndReconcileWallet(userId: number): WalletAccountRow | null {
  const userRow = db
    .prepare('SELECT id, wallet_balance FROM users WHERE id = ?')
    .get(userId) as { id: number; wallet_balance: number } | undefined;
  if (!userRow) return null;

  db.prepare('INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)').run(
    userId,
    Math.max(0, Math.floor(Number(userRow.wallet_balance) || 0))
  );

  const wallet = db
    .prepare('SELECT * FROM wallet_accounts WHERE user_id = ?')
    .get(userId) as WalletAccountRow;

  if (wallet && userRow.wallet_balance !== wallet.available_balance) {
    const authoritative =
      wallet.available_balance === 0 &&
      userRow.wallet_balance > 0 &&
      wallet.total_deposited === 0 &&
      wallet.total_won === 0
        ? userRow.wallet_balance
        : Math.max(0, wallet.available_balance);
    db.prepare('UPDATE users SET wallet_balance = ? WHERE id = ?').run(authoritative, userId);
    if (authoritative !== wallet.available_balance) {
      db.prepare(
        "UPDATE wallet_accounts SET available_balance = ?, updated_at = datetime('now') WHERE user_id = ?"
      ).run(authoritative, userId);
      wallet.available_balance = authoritative;
    }
  }

  return wallet;
}

export function generateFirestoreRecordKey(prefix: 'DEP' | 'WD'): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `${prefix}-${datePart}-${randPart}`;
}

export function recalculateAllUserPoints(): void {
  const userRows = db
    .prepare('SELECT id, matches_played, wins FROM users')
    .all() as Array<{ id: number; matches_played: number; wins: number }>;

  const regCounts = new Map<number, number>();
  for (const row of db
    .prepare('SELECT user_id, COUNT(*) as cnt FROM tournament_registrations GROUP BY user_id')
    .all() as Array<{ user_id: number; cnt: number }>) {
    regCounts.set(row.user_id, row.cnt);
  }

  const winStats = new Map<
    number,
    { p1: number; p2: number; p3: number; p4: number; p5: number; total: number }
  >();
  for (const row of db
    .prepare(
      `SELECT user_id,
              SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) as p1,
              SUM(CASE WHEN placement = 2 THEN 1 ELSE 0 END) as p2,
              SUM(CASE WHEN placement = 3 THEN 1 ELSE 0 END) as p3,
              SUM(CASE WHEN placement = 4 THEN 1 ELSE 0 END) as p4,
              SUM(CASE WHEN placement = 5 THEN 1 ELSE 0 END) as p5,
              COUNT(*) as total
       FROM winners
       GROUP BY user_id`
    )
    .all() as Array<{
    user_id: number;
    p1: number;
    p2: number;
    p3: number;
    p4: number;
    p5: number;
    total: number;
  }>) {
    winStats.set(row.user_id, {
      p1: Number(row.p1 || 0),
      p2: Number(row.p2 || 0),
      p3: Number(row.p3 || 0),
      p4: Number(row.p4 || 0),
      p5: Number(row.p5 || 0),
      total: Number(row.total || 0),
    });
  }

  const updateStmt = db.prepare('UPDATE users SET points = ? WHERE id = ?');
  db.transaction(() => {
    for (const u of userRows) {
      const ws = winStats.get(u.id) || { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, total: 0 };
      const regCount = regCounts.get(u.id) || 0;
      const matches = Math.max(regCount, u.matches_played || 0, ws.total);
      const totalWins = Math.max(ws.p1, u.wins || 0);
      const extraAdminWins = Math.max(0, totalWins - ws.p1);
      const points =
        ws.p1 * 100 +
        ws.p2 * 60 +
        ws.p3 * 40 +
        ws.p4 * 25 +
        ws.p5 * 15 +
        extraAdminWins * 100 +
        matches * 10;
      updateStmt.run(points, u.id);
    }
  }).immediate();
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

export function generateRegistrationCode(): string {
  const num = crypto.randomInt(100000, 999999);
  return `FF09-${num}`;
}

export function generateTicketCode(): string {
  const num = crypto.randomInt(100000, 999999);
  return `MSG-${num}`;
}


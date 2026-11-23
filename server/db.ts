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
      type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'entry_fee', 'prize_win', 'refund', 'admin_adjustment')),
      amount INTEGER NOT NULL CHECK(amount >= 0),
      direction TEXT NOT NULL CHECK(direction IN ('credit', 'debit')),
      balance_after INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending', 'approved', 'paid', 'completed', 'rejected')),
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
  `);

  // Safe schema migration for existing SQLite databases
  const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!userColumns.some((col) => col.name === 'points')) {
    db.exec('ALTER TABLE users ADD COLUMN points INTEGER NOT NULL DEFAULT 0');
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
  db.exec(`
    UPDATE tournaments
    SET
      prize_1st = CAST(ROUND(prize_pool * 0.50) AS INTEGER),
      prize_2nd = CAST(ROUND(prize_pool * 0.30) AS INTEGER),
      prize_3rd = MAX(0, prize_pool - CAST(ROUND(prize_pool * 0.50) AS INTEGER) - CAST(ROUND(prize_pool * 0.30) AS INTEGER))
    WHERE prize_1st = 0 AND prize_2nd = 0 AND prize_3rd = 0 AND prize_pool > 0;
  `);

  const withdrawalsSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'withdrawals'")
    .get() as { sql?: string } | undefined;
  if (
    withdrawalsSchema?.sql &&
    (!withdrawalsSchema.sql.includes('bank_account') || !withdrawalsSchema.sql.includes("'paid'"))
  ) {
    const hasBankName = (
      db.prepare('PRAGMA table_info(withdrawals)').all() as Array<{ name: string }>
    ).some((c) => c.name === 'bank_name');
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE withdrawals_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
          id, user_id, amount, method, bank_name, account_title, account_number,
          status, admin_note, reviewed_by, reviewed_at, created_at
        )
        SELECT id, user_id, amount, method, ${hasBankName ? 'bank_name' : "''"}, account_title, account_number,
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
  if (transactionsSchema?.sql && !transactionsSchema.sql.includes("'paid'")) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE transactions_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tx_code TEXT UNIQUE NOT NULL,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'entry_fee', 'prize_win', 'refund', 'admin_adjustment')),
          amount INTEGER NOT NULL CHECK(amount >= 0),
          direction TEXT NOT NULL CHECK(direction IN ('credit', 'debit')),
          balance_after INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending', 'approved', 'paid', 'completed', 'rejected')),
          reference_id TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO transactions_migrated (
          id, tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description, created_at
        )
        SELECT id, tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description, created_at
        FROM transactions;
        DROP TABLE transactions;
        ALTER TABLE transactions_migrated RENAME TO transactions;
      `);
    }).immediate();
    db.pragma('foreign_keys = ON');
  }

  // Clean up only expired sessions while keeping active persistent sessions intact
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());

  // Guarantee every registered player has a personal wallet record
  db.exec(`
    INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance)
    SELECT id, wallet_balance FROM users;
  `);

  const seedMeta = db
    .prepare("SELECT value FROM app_meta WHERE key = 'initial_seed_v1'")
    .get() as { value?: string } | undefined;

  const tournamentCount = db.prepare('SELECT COUNT(*) as count FROM tournaments').get() as { count: number };
  if (!seedMeta && tournamentCount.count === 0) {
    const insertTournament = db.prepare(`
      INSERT INTO tournaments (
        title, game_name, mode, entry_fee, prize_pool, prize_1st, prize_2nd, prize_3rd, max_slots, filled_slots,
        match_time, end_time, status, banner_url, rules, room_id, room_pass
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    const hour = 3600 * 1000;

    insertTournament.run(
      'Kelly Sprint Bermuda Cup',
      'Free Fire',
      'Battle Royale',
      500,
      25000,
      12500,
      7500,
      5000,
      48,
      0,
      new Date(now - 15 * 60 * 1000).toISOString(),
      new Date(now + 2 * hour).toISOString(),
      'live',
      '/src/assets/images/kelly_tournament_banner_1795312123415.jpg',
      'Solo Battle Royale on Bermuda. Mobile devices only. No emulators or third-party scripts. Room ID & password unlock upon registration.',
      'FF-9042',
      'KELLY77'
    );

    insertTournament.run(
      'Clash Squad Infernal 4v4',
      'Free Fire',
      'Clash Squad',
      1000,
      50000,
      25000,
      15000,
      10000,
      16,
      0,
      new Date(now + 4 * hour).toISOString(),
      new Date(now + 6 * hour).toISOString(),
      'upcoming',
      '/src/assets/images/clash_squad_arena_1795312122438.jpg',
      '4v4 Clash Squad Knockout. Best of 3 maps, Limited Ammo ON, Character Skills ON. Standard esports ruleset applies.',
      'CS-3310',
      'FIRE26'
    );

    insertTournament.run(
      'Lone Wolf Cage Showdown',
      'Free Fire',
      'Lone Wolf',
      300,
      12000,
      6000,
      3600,
      2400,
      32,
      0,
      new Date(now + 8 * hour).toISOString(),
      new Date(now + 10 * hour).toISOString(),
      'upcoming',
      '/src/assets/images/kelly_hero_banner_1795312122819.jpg',
      '1v1 Lone Wolf Iron Cage Bracket. SMG & Shotgun rounds. Screenshot match victory screen for instant payout verification.',
      'LW-8120',
      'WOLF99'
    );

    insertTournament.run(
      'Purgatory Booyah Masters',
      'Free Fire',
      'Battle Royale',
      400,
      18000,
      9000,
      5400,
      3600,
      48,
      0,
      new Date(now + 24 * hour).toISOString(),
      new Date(now + 26 * hour).toISOString(),
      'upcoming',
      '/src/assets/images/tournament_freefire_clash_1795298801818.jpg',
      'Full Map Purgatory BR. Top 3 Booyah placements earn direct wallet prize payouts.',
      'BR-5541',
      'BOOYAH4'
    );

    insertTournament.run(
      'Karachi Clash Squad Night',
      'Free Fire',
      'Clash Squad',
      250,
      10000,
      5000,
      3000,
      2000,
      24,
      0,
      new Date(now + 36 * hour).toISOString(),
      new Date(now + 38 * hour).toISOString(),
      'upcoming',
      '/src/assets/images/clash_squad_arena_1795312122438.jpg',
      'Fast-paced Clash Squad custom lobby. Join 10 minutes prior to PKT kickoff.',
      'KHI-2090',
      'CSNIGHT'
    );
  }

  const announcementCount = db.prepare('SELECT COUNT(*) as count FROM announcements').get() as { count: number };
  if (!seedMeta && announcementCount.count === 0) {
    const insertAnnouncement = db.prepare(`
      INSERT INTO announcements (title, category, content, is_pinned)
      VALUES (?, ?, ?, ?)
    `);

    insertAnnouncement.run(
      'Season 09 Mega Cup Open — Daily Battle Royale & Clash Squad Lobbies',
      'Announcement',
      'Welcome to FREE FIRE TOURNAMENT 09! Team registrations are open for tonight’s Battle Royale, 4v4 Clash Squad, and 1v1 Lone Wolf brackets. Custom Room ID & Password are sent via WhatsApp 15 minutes before PKT kickoff.',
      1
    );

    insertAnnouncement.run(
      'Official Match Result — Team Crimson Strikers Claim PKR 25,000 Booyah',
      'Match Result',
      'Bermuda Night Cup Final Standings: #1 Crimson Strikers (14 Kills · PKR 15,000), #2 Viper Squad PK (9 Kills · PKR 6,500), #3 Karachi Phantoms (7 Kills · PKR 3,500). All prize payouts verified and transferred.',
      1
    );

    insertAnnouncement.run(
      'Strict Fair-Play Policy — Mobile Devices Only (No Emulators / Configs)',
      'Rules Update',
      'All FREE FIRE TOURNAMENT 09 lobbies require mobile gameplay with screen recording ready if requested. Any emulator, panel, or teaming violation results in instant disqualification without refund.',
      0
    );
  }

  db.prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES ('initial_seed_v1', 'done')").run();

  recalculateAllUserPoints();
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

  const winStats = new Map<number, { p1: number; p2: number; p3: number; total: number }>();
  for (const row of db
    .prepare(
      `SELECT user_id,
              SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) as p1,
              SUM(CASE WHEN placement = 2 THEN 1 ELSE 0 END) as p2,
              SUM(CASE WHEN placement = 3 THEN 1 ELSE 0 END) as p3,
              COUNT(*) as total
       FROM winners
       GROUP BY user_id`
    )
    .all() as Array<{ user_id: number; p1: number; p2: number; p3: number; total: number }>) {
    winStats.set(row.user_id, {
      p1: Number(row.p1 || 0),
      p2: Number(row.p2 || 0),
      p3: Number(row.p3 || 0),
      total: Number(row.total || 0),
    });
  }

  const updateStmt = db.prepare('UPDATE users SET points = ? WHERE id = ?');
  db.transaction(() => {
    for (const u of userRows) {
      const ws = winStats.get(u.id) || { p1: 0, p2: 0, p3: 0, total: 0 };
      const regCount = regCounts.get(u.id) || 0;
      const matches = Math.max(regCount, u.matches_played || 0, ws.total);
      const totalWins = Math.max(ws.p1, u.wins || 0);
      const extraAdminWins = Math.max(0, totalWins - ws.p1);
      const points =
        ws.p1 * 100 +
        ws.p2 * 60 +
        ws.p3 * 40 +
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


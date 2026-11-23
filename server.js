// server.ts
import "dotenv/config";
import express from "express";
import path2 from "node:path";

// server/db.ts
import Database from "better-sqlite3";
import crypto from "node:crypto";
import path from "node:path";
var dbPath = path.resolve(process.cwd(), "pro_tournament.db");
var db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
function initDatabase() {
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
      mode TEXT NOT NULL DEFAULT 'Battle Royale' CHECK(mode IN ('Battle Royale', 'Clash Squad', 'Lone Wolf')),
      entry_fee INTEGER NOT NULL CHECK(entry_fee >= 0),
      prize_pool INTEGER NOT NULL CHECK(prize_pool >= 0),
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
  `);
  const tournamentColumns = db.prepare("PRAGMA table_info(tournaments)").all();
  if (!tournamentColumns.some((col) => col.name === "end_time")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN end_time TEXT NOT NULL DEFAULT ''");
  }
  if (!tournamentColumns.some((col) => col.name === "mode")) {
    db.exec("ALTER TABLE tournaments ADD COLUMN mode TEXT NOT NULL DEFAULT 'Battle Royale'");
  }
  const withdrawalsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'withdrawals'").get();
  if (withdrawalsSchema?.sql && (!withdrawalsSchema.sql.includes("bank_account") || !withdrawalsSchema.sql.includes("'paid'"))) {
    const hasBankName = db.prepare("PRAGMA table_info(withdrawals)").all().some((c) => c.name === "bank_name");
    db.pragma("foreign_keys = OFF");
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
        SELECT id, user_id, amount, method, ${hasBankName ? "bank_name" : "''"}, account_title, account_number,
               status, admin_note, reviewed_by, reviewed_at, created_at
        FROM withdrawals;
        DROP TABLE withdrawals;
        ALTER TABLE withdrawals_migrated RENAME TO withdrawals;
      `);
    }).immediate();
    db.pragma("foreign_keys = ON");
  }
  const transactionsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'").get();
  if (transactionsSchema?.sql && !transactionsSchema.sql.includes("'paid'")) {
    db.pragma("foreign_keys = OFF");
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
    db.pragma("foreign_keys = ON");
  }
  db.exec(`
    INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance)
    SELECT id, wallet_balance FROM users;
  `);
  const tournamentCount = db.prepare("SELECT COUNT(*) as count FROM tournaments").get();
  if (tournamentCount.count === 0) {
    const insertTournament = db.prepare(`
      INSERT INTO tournaments (
        title, game_name, mode, entry_fee, prize_pool, max_slots, filled_slots,
        match_time, end_time, status, banner_url, rules, room_id, room_pass
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const hour = 3600 * 1e3;
    insertTournament.run(
      "Kelly Sprint Bermuda Cup",
      "Free Fire",
      "Battle Royale",
      500,
      25e3,
      48,
      0,
      new Date(now - 15 * 60 * 1e3).toISOString(),
      new Date(now + 2 * hour).toISOString(),
      "live",
      "/src/assets/images/kelly_tournament_banner_1795312123415.jpg",
      "Solo Battle Royale on Bermuda. Mobile devices only. No emulators or third-party scripts. Room ID & password unlock upon registration.",
      "FF-9042",
      "KELLY77"
    );
    insertTournament.run(
      "Clash Squad Infernal 4v4",
      "Free Fire",
      "Clash Squad",
      1e3,
      5e4,
      16,
      0,
      new Date(now + 4 * hour).toISOString(),
      new Date(now + 6 * hour).toISOString(),
      "upcoming",
      "/src/assets/images/clash_squad_arena_1795312122438.jpg",
      "4v4 Clash Squad Knockout. Best of 3 maps, Limited Ammo ON, Character Skills ON. Standard esports ruleset applies.",
      "CS-3310",
      "FIRE26"
    );
    insertTournament.run(
      "Lone Wolf Cage Showdown",
      "Free Fire",
      "Lone Wolf",
      300,
      12e3,
      32,
      0,
      new Date(now + 8 * hour).toISOString(),
      new Date(now + 10 * hour).toISOString(),
      "upcoming",
      "/src/assets/images/kelly_hero_banner_1795312122819.jpg",
      "1v1 Lone Wolf Iron Cage Bracket. SMG & Shotgun rounds. Screenshot match victory screen for instant payout verification.",
      "LW-8120",
      "WOLF99"
    );
    insertTournament.run(
      "Purgatory Booyah Masters",
      "Free Fire",
      "Battle Royale",
      400,
      18e3,
      48,
      0,
      new Date(now + 24 * hour).toISOString(),
      new Date(now + 26 * hour).toISOString(),
      "upcoming",
      "/src/assets/images/tournament_freefire_clash_1795298801818.jpg",
      "Full Map Purgatory BR. Top 3 Booyah placements earn direct wallet prize payouts.",
      "BR-5541",
      "BOOYAH4"
    );
    insertTournament.run(
      "Karachi Clash Squad Night",
      "Free Fire",
      "Clash Squad",
      250,
      1e4,
      24,
      0,
      new Date(now + 36 * hour).toISOString(),
      new Date(now + 38 * hour).toISOString(),
      "upcoming",
      "/src/assets/images/clash_squad_arena_1795312122438.jpg",
      "Fast-paced Clash Squad custom lobby. Join 10 minutes prior to PKT kickoff.",
      "KHI-2090",
      "CSNIGHT"
    );
  }
  const announcementCount = db.prepare("SELECT COUNT(*) as count FROM announcements").get();
  if (announcementCount.count === 0) {
    const insertAnnouncement = db.prepare(`
      INSERT INTO announcements (title, category, content, is_pinned)
      VALUES (?, ?, ?, ?)
    `);
    insertAnnouncement.run(
      "Season 09 Mega Cup Open \u2014 Daily Battle Royale & Clash Squad Lobbies",
      "Announcement",
      "Welcome to FREE FIRE TOURNAMENT 09! Team registrations are open for tonight\u2019s Battle Royale, 4v4 Clash Squad, and 1v1 Lone Wolf brackets. Custom Room ID & Password are sent via WhatsApp 15 minutes before PKT kickoff.",
      1
    );
    insertAnnouncement.run(
      "Official Match Result \u2014 Team Crimson Strikers Claim PKR 25,000 Booyah",
      "Match Result",
      "Bermuda Night Cup Final Standings: #1 Crimson Strikers (14 Kills \xB7 PKR 15,000), #2 Viper Squad PK (9 Kills \xB7 PKR 6,500), #3 Karachi Phantoms (7 Kills \xB7 PKR 3,500). All prize payouts verified and transferred.",
      1
    );
    insertAnnouncement.run(
      "Strict Fair-Play Policy \u2014 Mobile Devices Only (No Emulators / Configs)",
      "Rules Update",
      "All FREE FIRE TOURNAMENT 09 lobbies require mobile gameplay with screen recording ready if requested. Any emulator, panel, or teaming violation results in instant disqualification without refund.",
      0
    );
  }
}
function generateUniquePlayerId() {
  for (let i = 0; i < 10; i++) {
    const digits = crypto.randomInt(1e5, 999999);
    const candidate = `PT-${digits}`;
    const exists = db.prepare("SELECT 1 FROM users WHERE player_id = ?").get(candidate);
    if (!exists) return candidate;
  }
  return `PT-${Date.now().toString().slice(-6)}`;
}
function generateTxCode() {
  const datePart = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
  const randPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `TXN-${datePart}-${randPart}`;
}
function generateRegistrationCode() {
  const num = crypto.randomInt(1e5, 999999);
  return `FF09-${num}`;
}
function generateTicketCode() {
  const num = crypto.randomInt(1e5, 999999);
  return `MSG-${num}`;
}

// server/auth.ts
import crypto2 from "node:crypto";
var SESSION_SECRET = process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16 ? process.env.SESSION_SECRET : crypto2.randomBytes(32).toString("hex");
function hashPassword(password) {
  const salt = crypto2.randomBytes(16).toString("hex");
  const derived = crypto2.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}
function verifyPassword(password, storedHash) {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, "hex");
    const derivedBuf = crypto2.scryptSync(password, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto2.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}
function verifyAdminPasscode(candidate) {
  const configured = (process.env.ADMIN_PASSCODE || "").trim();
  if (!configured || !candidate) return false;
  const a = crypto2.createHash("sha256").update(configured).digest();
  const b = crypto2.createHash("sha256").update(candidate).digest();
  return crypto2.timingSafeEqual(a, b);
}
function isAdminPasscodeConfigured() {
  return Boolean((process.env.ADMIN_PASSCODE || "").trim());
}
function signToken(userId, role) {
  const payload = {
    uid: userId,
    role,
    exp: Date.now() + 24 * 60 * 60 * 1e3
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto2.createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}
function verifyToken(token) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;
  const expectedSig = crypto2.createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto2.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload || typeof payload.uid !== "number" || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
var USER_PUBLIC_COLUMNS = `
  id, player_id, username, email, avatar_url, role, is_blocked,
  wallet_balance, matches_played, wins, created_at
`;
function getUserById(userId) {
  return db.prepare(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(userId);
}
function extractBearerUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = getUserById(payload.uid);
  if (!user || user.is_blocked === 1) return null;
  return user;
}
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required. Please sign in." });
    return;
  }
  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Session expired or invalid. Please sign in again." });
    return;
  }
  const user = getUserById(payload.uid);
  if (!user) {
    res.status(401).json({ error: "Account no longer exists." });
    return;
  }
  if (user.is_blocked === 1) {
    res.status(403).json({ error: "This account has been suspended by an administrator." });
    return;
  }
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Administrator privileges required." });
    return;
  }
  const adminRecord = db.prepare("SELECT id FROM admins WHERE user_id = ?").get(req.user.id);
  if (!adminRecord) {
    res.status(403).json({ error: "Admin verification failed." });
    return;
  }
  next();
}

// shared/pktTime.ts
var PKT_OFFSET_MS = 5 * 60 * 60 * 1e3;
var DEFAULT_NO_END_DURATION_MS = 3 * 60 * 60 * 1e3;
function computeTournamentStatus(tournament, nowMs = Date.now()) {
  if (tournament.status === "cancelled") return "cancelled";
  const startMs = Date.parse(tournament.match_time);
  const hasWinners = Array.isArray(tournament.winners) && tournament.winners.length > 0;
  if (tournament.status === "completed") {
    if (hasWinners || !Number.isFinite(startMs) || nowMs >= startMs) {
      return "completed";
    }
  }
  if (!Number.isFinite(startMs)) return tournament.status;
  if (nowMs < startMs) {
    return "upcoming";
  }
  const endMs = tournament.end_time ? Date.parse(tournament.end_time) : NaN;
  if (Number.isFinite(endMs)) {
    return nowMs < endMs ? "live" : "completed";
  }
  return nowMs < startMs + DEFAULT_NO_END_DURATION_MS ? "live" : "completed";
}

// server.ts
initDatabase();
var app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "4mb" }));
var ALLOWED_AVATARS = /* @__PURE__ */ new Set([
  "/src/assets/images/avatar_esports_pro_1795298801657.jpg",
  "/src/assets/images/tournament_pubg_arena_1795298801850.jpg",
  "/src/assets/images/tournament_valorant_cyber_1795298801660.jpg",
  "/src/assets/images/tournament_freefire_clash_1795298801818.jpg",
  "/src/assets/images/kelly_hero_banner_1795312122819.jpg",
  "/src/assets/images/kelly_tournament_banner_1795312123415.jpg",
  "/src/assets/images/clash_squad_arena_1795312122438.jpg"
]);
var ALLOWED_MODES = ["Battle Royale", "Clash Squad", "Lone Wolf"];
function normalizeMode(value) {
  if (typeof value === "string" && ALLOWED_MODES.includes(value)) {
    return value;
  }
  return "Battle Royale";
}
function validateImageInput(value, maxBytes = 2 * 1024 * 1024) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (ALLOWED_AVATARS.has(trimmed)) return trimmed;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    const base64Part = trimmed.split(",")[1] || "";
    const approxBytes = Math.floor(base64Part.length * 3 / 4);
    if (approxBytes > maxBytes) {
      return null;
    }
    return trimmed;
  }
  return null;
}
function sanitizeBannerUrl(value) {
  if (typeof value !== "string") {
    return "/src/assets/images/kelly_tournament_banner_1795312123415.jpg";
  }
  const trimmed = value.trim();
  if (ALLOWED_AVATARS.has(trimmed)) return trimmed;
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed;
  }
  return "/src/assets/images/kelly_tournament_banner_1795312123415.jpg";
}
var YOUTUBE_ALLOWED_HOSTS = /* @__PURE__ */ new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com"
]);
function extractYouTubeVideoId(rawUrl) {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 500) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_ALLOWED_HOSTS.has(host)) return null;
  let videoId = "";
  if (host === "youtu.be") {
    videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
  } else {
    const vParam = parsed.searchParams.get("v");
    if (vParam) {
      videoId = vParam;
    } else {
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && ["embed", "shorts", "live", "v"].includes(parts[0])) {
        videoId = parts[1];
      }
    }
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  return {
    videoId,
    normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`
  };
}
var PAYMENT_CHANNELS = [
  {
    id: "jazzcash",
    name: "JazzCash Mobile Account",
    accountTitle: "FREE FIRE TOURNAMENT 09",
    accountNumber: "03406690336",
    providerLabel: "JazzCash (Mobilink Microfinance)",
    instructions: [
      "Open your JazzCash mobile app or dial *786#.",
      "Select Money Transfer -> Send to JazzCash Account.",
      "Enter account number 03406690336 and verify the recipient details.",
      "Copy the TID (Transaction ID) from your SMS confirmation and enter or upload it below."
    ]
  },
  {
    id: "easypaisa",
    name: "Easypaisa Mobile Wallet",
    accountTitle: "FREE FIRE TOURNAMENT 09",
    accountNumber: "03489674834",
    providerLabel: "Easypaisa (Telenor Microfinance)",
    instructions: [
      "Open Easypaisa App -> Send Money -> Easypaisa Transfer.",
      "Transfer exact PKR amount to 03489674834.",
      "Save the Trx ID (e.g. EP-92837412) and capture a screenshot of the receipt.",
      "Submit the form below for admin verification within 5\u201315 minutes."
    ]
  }
];
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.get("/api/payment-channels", (_req, res) => {
  res.json({ paymentChannels: PAYMENT_CHANNELS });
});
app.get("/api/announcements", (_req, res) => {
  const announcements = db.prepare(
    `SELECT a.id, a.title, a.category, a.tournament_id, t.title as tournament_title,
              a.content, a.is_pinned, a.created_at
       FROM announcements a
       LEFT JOIN tournaments t ON t.id = a.tournament_id
       ORDER BY a.is_pinned DESC, a.id DESC
       LIMIT 30`
  ).all();
  res.json({ announcements });
});
app.get("/api/videos", (_req, res) => {
  const videos = db.prepare(
    `SELECT id, title, youtube_url, video_id, is_featured, created_at, updated_at
       FROM youtube_videos
       ORDER BY is_featured DESC, id DESC
       LIMIT 24`
  ).all();
  const featuredVideo = videos.find((v) => v.is_featured === 1) || videos[0] || null;
  res.json({ videos, featuredVideo });
});
app.get("/api/team-registrations", (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code.trim().toUpperCase() : "";
  if (code) {
    const record = db.prepare(
      `SELECT tr.id, tr.registration_code, tr.tournament_id, t.title as tournament_title,
                t.mode as tournament_mode, t.match_time, tr.leader_name, tr.freefire_uid,
                tr.team_name, tr.squad_type, tr.teammates, tr.payment_method, tr.payment_ref,
                tr.status, tr.created_at
         FROM team_registrations tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE upper(tr.registration_code) = ?`
    ).get(code);
    if (!record) {
      res.status(404).json({ error: "No registration found with that code." });
      return;
    }
    res.json({ registration: record });
    return;
  }
  const registrations = db.prepare(
    `SELECT tr.id, tr.registration_code, tr.tournament_id, t.title as tournament_title,
              t.mode as tournament_mode, t.match_time, tr.leader_name, tr.freefire_uid,
              tr.team_name, tr.squad_type, tr.payment_method, tr.status, tr.created_at
       FROM team_registrations tr
       JOIN tournaments t ON t.id = tr.tournament_id
       WHERE tr.status != 'rejected'
       ORDER BY tr.id DESC
       LIMIT 25`
  ).all();
  res.json({ registrations });
});
app.post("/api/team-registrations", (req, res) => {
  try {
    const viewer = extractBearerUser(req);
    const tournamentId = Number(req.body.tournamentId);
    const leaderName = typeof req.body.leaderName === "string" ? req.body.leaderName.trim() : "";
    const freefireUid = typeof req.body.freefireUid === "string" ? req.body.freefireUid.trim() : "";
    const whatsappNumber = typeof req.body.whatsappNumber === "string" ? req.body.whatsappNumber.trim() : "";
    const teamName = typeof req.body.teamName === "string" ? req.body.teamName.trim() : "";
    const squadType = ["Solo", "Duo", "Squad"].includes(req.body.squadType) ? req.body.squadType : "Squad";
    const teammates = typeof req.body.teammates === "string" ? req.body.teammates.trim().slice(0, 500) : "";
    const reqPaymentMethod = typeof req.body.paymentMethod === "string" ? req.body.paymentMethod.trim() : "";
    const paymentRef = typeof req.body.paymentRef === "string" ? req.body.paymentRef.trim().toUpperCase() : "";
    if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
      res.status(400).json({ error: "Please select a valid Free Fire tournament." });
      return;
    }
    if (leaderName.length < 2 || leaderName.length > 50) {
      res.status(400).json({ error: "Player / captain name must be 2\u201350 characters." });
      return;
    }
    if (freefireUid.length < 5 || freefireUid.length > 24 || !/^[a-zA-Z0-9_-]+$/.test(freefireUid)) {
      res.status(400).json({ error: "Enter a valid Free Fire UID (5\u201324 digits/characters)." });
      return;
    }
    if (whatsappNumber.length < 8 || whatsappNumber.length > 20 || !/^[0-9+\-\s()]+$/.test(whatsappNumber)) {
      res.status(400).json({ error: "Enter a valid WhatsApp number (e.g. 03XX-XXXXXXX)." });
      return;
    }
    if (teamName.length < 2 || teamName.length > 48) {
      res.status(400).json({ error: "Team / clan name must be 2\u201348 characters." });
      return;
    }
    const result = db.transaction(() => {
      const t = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tournamentId);
      if (!t) return { status: 404, error: "Selected tournament was not found." };
      const hasWinners = db.prepare("SELECT 1 FROM winners WHERE tournament_id = ? LIMIT 1").get(tournamentId);
      const effectiveStatus = computeTournamentStatus({
        match_time: t.match_time,
        end_time: t.end_time,
        status: t.status,
        winners: hasWinners ? [hasWinners] : []
      });
      if (effectiveStatus !== "upcoming" && effectiveStatus !== "live") {
        return { status: 400, error: "Registration is closed for this tournament." };
      }
      if (t.filled_slots >= t.max_slots) {
        return { status: 400, error: "This tournament has reached maximum slot capacity." };
      }
      const duplicateUid = db.prepare(
        "SELECT id FROM team_registrations WHERE tournament_id = ? AND lower(freefire_uid) = lower(?) AND status != 'rejected'"
      ).get(tournamentId, freefireUid);
      if (duplicateUid) {
        return { status: 409, error: "This Free Fire UID is already registered for the selected tournament." };
      }
      let paymentMethod;
      let regStatus = "pending";
      let finalRef = paymentRef;
      if (t.entry_fee === 0) {
        paymentMethod = "free";
        regStatus = "confirmed";
        finalRef = "FREE-ENTRY";
      } else if (reqPaymentMethod === "wallet") {
        if (!viewer) {
          return { status: 401, error: "Sign in first to pay entry fee from your Wallet Balance." };
        }
        const wallet = db.prepare("SELECT available_balance, pending_withdrawal FROM wallet_accounts WHERE user_id = ?").get(viewer.id);
        const available = wallet ? Math.max(0, wallet.available_balance - wallet.pending_withdrawal) : 0;
        if (available < t.entry_fee) {
          return {
            status: 400,
            error: `Insufficient spendable balance. Required: PKR ${t.entry_fee}, Available: PKR ${available}.`
          };
        }
        const nextBal = available - t.entry_fee;
        db.prepare("UPDATE users SET wallet_balance = ?, matches_played = matches_played + 1 WHERE id = ?").run(
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
        paymentMethod = "wallet";
        regStatus = "confirmed";
        finalRef = `WALLET-${viewer.player_id}`;
      } else {
        if (!["jazzcash", "easypaisa"].includes(reqPaymentMethod)) {
          return { status: 400, error: "Select JazzCash, Easypaisa, or Wallet payment method." };
        }
        if (finalRef.length < 4 || finalRef.length > 64 || !/^[A-Z0-9_-]+$/.test(finalRef)) {
          return {
            status: 400,
            error: "Enter a valid Transaction ID (TID) from JazzCash or Easypaisa (4\u201364 characters)."
          };
        }
        const dupTid = db.prepare("SELECT id FROM team_registrations WHERE payment_ref = ? AND status != 'rejected'").get(finalRef);
        if (dupTid) {
          return { status: 409, error: "This Transaction ID (TID) has already been used for a registration." };
        }
        paymentMethod = reqPaymentMethod;
        regStatus = "pending";
      }
      const regCode = generateRegistrationCode();
      const info = db.prepare(
        `INSERT INTO team_registrations (
             registration_code, tournament_id, user_id, leader_name, freefire_uid,
             whatsapp_number, team_name, squad_type, teammates, payment_method, payment_ref, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
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
      if (regStatus === "confirmed") {
        db.prepare("UPDATE tournaments SET filled_slots = filled_slots + 1 WHERE id = ?").run(tournamentId);
      }
      const created = db.prepare(
        `SELECT tr.id, tr.registration_code, tr.tournament_id, t.title as tournament_title,
                  t.mode as tournament_mode, t.match_time, tr.leader_name, tr.freefire_uid,
                  tr.team_name, tr.squad_type, tr.teammates, tr.payment_method, tr.payment_ref,
                  tr.status, tr.created_at
           FROM team_registrations tr
           JOIN tournaments t ON t.id = tr.tournament_id
           WHERE tr.id = ?`
      ).get(Number(info.lastInsertRowid));
      return { status: 201, registration: created };
    }).immediate();
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json({
      ok: true,
      registration: result.registration,
      message: result.registration && result.registration.status === "confirmed" ? "Team slot confirmed! Room details will arrive on WhatsApp before match start." : "Registration submitted! An admin will verify your TID and confirm your team slot shortly."
    });
  } catch (err) {
    console.error("Team registration error:", err);
    res.status(500).json({ error: "Failed to submit team registration." });
  }
});
app.post("/api/contact", (req, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const whatsappNumber = typeof req.body.whatsappNumber === "string" ? req.body.whatsappNumber.trim() : "";
    const freefireUid = typeof req.body.freefireUid === "string" ? req.body.freefireUid.trim() : "";
    const subject = typeof req.body.subject === "string" ? req.body.subject.trim() : "";
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (name.length < 2 || name.length > 60) {
      res.status(400).json({ error: "Your name must be 2\u201360 characters." });
      return;
    }
    if (whatsappNumber.length < 8 || whatsappNumber.length > 20 || !/^[0-9+\-\s()]+$/.test(whatsappNumber)) {
      res.status(400).json({ error: "Please provide a valid WhatsApp number so we can reply." });
      return;
    }
    if (subject.length < 3 || subject.length > 100) {
      res.status(400).json({ error: "Subject must be 3\u2013100 characters." });
      return;
    }
    if (message.length < 8 || message.length > 1e3) {
      res.status(400).json({ error: "Message must be between 8 and 1000 characters." });
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
      message: "Message received! Our FREE FIRE TOURNAMENT 09 team will contact you on WhatsApp shortly."
    });
  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({ error: "Failed to send message. Please try again." });
  }
});
app.get("/api/auth/bootstrap-status", (_req, res) => {
  const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
  res.json({
    adminClaimed: adminCount.count > 0,
    passcodeConfigured: isAdminPasscodeConfigured()
  });
});
app.post("/api/auth/register", (req, res) => {
  try {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const avatarChecked = validateImageInput(req.body.avatarUrl || "/src/assets/images/avatar_esports_pro_1795298801657.jpg", 1024 * 1024);
    if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      res.status(400).json({
        error: "Username must be 3\u201324 characters using letters, numbers, underscores, dots, or hyphens."
      });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Please provide a valid email address." });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ error: "Password must be at least 6 characters long." });
      return;
    }
    if (avatarChecked === null) {
      res.status(400).json({ error: "Avatar image must be PNG/JPEG/WEBP under 1MB." });
      return;
    }
    const existing = db.prepare("SELECT id FROM users WHERE lower(email) = ? OR lower(username) = ?").get(email, username.toLowerCase());
    if (existing) {
      res.status(409).json({ error: "Username or email is already registered." });
      return;
    }
    const playerId = generateUniquePlayerId();
    const passwordHash = hashPassword(password);
    const avatarUrl = avatarChecked || "/src/assets/images/avatar_esports_pro_1795298801657.jpg";
    const userId = db.transaction(() => {
      const info = db.prepare(
        `INSERT INTO users (player_id, username, email, password_hash, avatar_url, role, wallet_balance)
           VALUES (?, ?, ?, ?, ?, 'player', 0)`
      ).run(playerId, username, email, passwordHash, avatarUrl);
      const newId = Number(info.lastInsertRowid);
      db.prepare("INSERT INTO wallet_accounts (user_id, available_balance) VALUES (?, 0)").run(newId);
      return newId;
    }).immediate();
    const user = getUserById(userId);
    const token = signToken(user.id, user.role);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});
app.post("/api/auth/login", (req, res) => {
  try {
    const identifier = typeof req.body.identifier === "string" ? req.body.identifier.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!identifier || !password) {
      res.status(400).json({ error: "Username/email and password are required." });
      return;
    }
    const row = db.prepare(
      `SELECT id, password_hash, role, is_blocked
         FROM users
         WHERE lower(email) = ? OR lower(username) = ?`
    ).get(identifier, identifier);
    if (!row || !verifyPassword(password, row.password_hash)) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }
    if (row.is_blocked === 1) {
      res.status(403).json({ error: "Your account is blocked. Contact an administrator." });
      return;
    }
    const user = getUserById(row.id);
    const token = signToken(user.id, user.role);
    res.json({ token, user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Sign in failed." });
  }
});
app.post("/api/auth/claim-admin", (req, res) => {
  try {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const passcode = typeof req.body.passcode === "string" ? req.body.passcode.trim() : "";
    const passcodeRequired = isAdminPasscodeConfigured();
    if (passcodeRequired && !verifyAdminPasscode(passcode)) {
      res.status(403).json({ error: "Invalid server admin passcode." });
      return;
    }
    if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      res.status(400).json({ error: "Admin username must be 3\u201324 valid characters." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Valid admin email is required." });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters." });
      return;
    }
    const result = db.transaction(() => {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
      if (!passcodeRequired && adminCount.count > 0) {
        return { conflict: "Initial admin has already been claimed. Sign in with your admin account." };
      }
      const duplicate = db.prepare("SELECT id FROM users WHERE lower(email) = ? OR lower(username) = ?").get(email, username.toLowerCase());
      if (duplicate) {
        return { duplicate: "That username or email is already in use." };
      }
      const playerId = generateUniquePlayerId();
      const passwordHash = hashPassword(password);
      const info = db.prepare(
        `INSERT INTO users (player_id, username, email, password_hash, avatar_url, role, wallet_balance)
           VALUES (?, ?, ?, ?, ?, 'admin', 0)`
      ).run(
        playerId,
        username,
        email,
        passwordHash,
        "/src/assets/images/avatar_esports_pro_1795298801657.jpg"
      );
      const newId = Number(info.lastInsertRowid);
      db.prepare("INSERT INTO wallet_accounts (user_id, available_balance) VALUES (?, 0)").run(newId);
      db.prepare("INSERT INTO admins (user_id, admin_level) VALUES (?, 'super_admin')").run(newId);
      return { userId: newId };
    }).immediate();
    if ("conflict" in result) {
      res.status(403).json({ error: result.conflict });
      return;
    }
    if ("duplicate" in result) {
      res.status(409).json({ error: result.duplicate });
      return;
    }
    const user = getUserById(result.userId);
    const token = signToken(user.id, "admin");
    res.status(201).json({ token, user });
  } catch (err) {
    console.error("Claim admin error:", err);
    res.status(500).json({ error: "Admin setup failed." });
  }
});
app.post("/api/auth/logout", (_req, res) => {
  res.json({ ok: true });
});
app.get("/api/auth/me", requireAuth, (req, res) => {
  const wallet = db.prepare("SELECT * FROM wallet_accounts WHERE user_id = ?").get(req.user.id);
  res.json({ user: req.user, wallet });
});
app.patch("/api/auth/profile", requireAuth, (req, res) => {
  try {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : req.user.username;
    const avatarChecked = req.body.avatarUrl !== void 0 ? validateImageInput(req.body.avatarUrl, 1024 * 1024) : req.user.avatar_url;
    if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      res.status(400).json({ error: "Username must be 3\u201324 valid characters." });
      return;
    }
    if (avatarChecked === null) {
      res.status(400).json({ error: "Avatar image must be PNG/JPEG/WEBP under 1MB." });
      return;
    }
    const existing = db.prepare("SELECT id FROM users WHERE lower(username) = ? AND id != ?").get(username.toLowerCase(), req.user.id);
    if (existing) {
      res.status(409).json({ error: "Username is already taken." });
      return;
    }
    db.prepare("UPDATE users SET username = ?, avatar_url = ? WHERE id = ?").run(
      username,
      avatarChecked,
      req.user.id
    );
    res.json({ user: getUserById(req.user.id) });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Failed to update profile." });
  }
});
function enrichTournament(t, viewer) {
  const tid = Number(t.id);
  const players = db.prepare(
    `SELECT tr.id, tr.user_id, tr.in_game_name, tr.in_game_id, tr.slot_number, tr.status, tr.registered_at,
              u.player_id, u.username, u.avatar_url
       FROM tournament_registrations tr
       JOIN users u ON u.id = tr.user_id
       WHERE tr.tournament_id = ?
       ORDER BY tr.slot_number ASC`
  ).all(tid);
  const winners = db.prepare(
    `SELECT w.id, w.placement, w.prize_amount, w.declared_at, u.id as user_id, u.player_id, u.username, u.avatar_url
       FROM winners w
       JOIN users u ON u.id = w.user_id
       WHERE w.tournament_id = ?
       ORDER BY w.placement ASC`
  ).all(tid);
  const effectiveStatus = computeTournamentStatus({
    match_time: String(t.match_time || ""),
    end_time: String(t.end_time || ""),
    status: t.status || "upcoming",
    winners
  });
  const isRegistered = viewer ? players.some((p) => Number(p.user_id) === viewer.id) : false;
  const canSeeRoom = viewer ? viewer.role === "admin" || isRegistered : false;
  return {
    id: t.id,
    title: t.title,
    game_name: t.game_name,
    mode: normalizeMode(t.mode),
    entry_fee: t.entry_fee,
    prize_pool: t.prize_pool,
    max_slots: t.max_slots,
    filled_slots: t.filled_slots,
    match_time: t.match_time,
    end_time: t.end_time || "",
    status: effectiveStatus,
    banner_url: t.banner_url,
    rules: t.rules,
    room_id: canSeeRoom ? t.room_id : "",
    room_pass: canSeeRoom ? t.room_pass : "",
    created_at: t.created_at,
    is_registered: isRegistered,
    registered_players: players,
    winners
  };
}
app.get("/api/tournaments", (req, res) => {
  const viewer = extractBearerUser(req);
  const rows = db.prepare("SELECT * FROM tournaments").all();
  const orderRank = {
    live: 0,
    upcoming: 1,
    completed: 2,
    cancelled: 3
  };
  const enriched = rows.map((r) => enrichTournament(r, viewer)).sort((a, b) => {
    const rankDiff = orderRank[a.status] - orderRank[b.status];
    if (rankDiff !== 0) return rankDiff;
    return Date.parse(String(a.match_time)) - Date.parse(String(b.match_time));
  });
  res.json({ tournaments: enriched });
});
app.get("/api/tournaments/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid tournament ID." });
    return;
  }
  const row = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(id);
  if (!row) {
    res.status(404).json({ error: "Tournament not found." });
    return;
  }
  const viewer = extractBearerUser(req);
  res.json({ tournament: enrichTournament(row, viewer) });
});
app.post("/api/tournaments/:id/join", requireAuth, (req, res) => {
  try {
    const tournamentId = Number(req.params.id);
    const inGameName = typeof req.body.inGameName === "string" ? req.body.inGameName.trim() : "";
    const inGameId = typeof req.body.inGameId === "string" ? req.body.inGameId.trim() : "";
    if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
      res.status(400).json({ error: "Invalid tournament ID." });
      return;
    }
    if (inGameName.length < 2 || inGameName.length > 32) {
      res.status(400).json({ error: "In-game character name must be 2\u201332 characters." });
      return;
    }
    if (inGameId.length < 2 || inGameId.length > 32) {
      res.status(400).json({ error: "In-game ID is required (2\u201332 characters)." });
      return;
    }
    const result = db.transaction(() => {
      const t = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tournamentId);
      if (!t) return { status: 404, error: "Tournament not found." };
      const hasWinners = db.prepare("SELECT 1 FROM winners WHERE tournament_id = ? LIMIT 1").get(tournamentId);
      const effectiveStatus = computeTournamentStatus({
        match_time: t.match_time,
        end_time: t.end_time,
        status: t.status,
        winners: hasWinners ? [hasWinners] : []
      });
      if (effectiveStatus !== "upcoming" && effectiveStatus !== "live") {
        return { status: 400, error: "Registration is closed for this tournament." };
      }
      const already = db.prepare("SELECT id FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?").get(tournamentId, req.user.id);
      if (already) return { status: 409, error: "You are already registered in this tournament." };
      if (t.filled_slots >= t.max_slots) {
        return { status: 400, error: "Tournament slots are completely full." };
      }
      const wallet = db.prepare("SELECT available_balance, pending_withdrawal FROM wallet_accounts WHERE user_id = ?").get(req.user.id);
      const available = wallet ? wallet.available_balance : 0;
      const spendable = wallet ? Math.max(0, wallet.available_balance - wallet.pending_withdrawal) : 0;
      if (spendable < t.entry_fee) {
        return {
          status: 400,
          error: `Insufficient spendable balance. Required: PKR ${t.entry_fee}, Spendable: PKR ${spendable}.`
        };
      }
      const newBalance = available - t.entry_fee;
      db.prepare("UPDATE users SET wallet_balance = ?, matches_played = matches_played + 1 WHERE id = ?").run(
        newBalance,
        req.user.id
      );
      db.prepare(
        "UPDATE wallet_accounts SET available_balance = ?, updated_at = datetime('now') WHERE user_id = ?"
      ).run(newBalance, req.user.id);
      const slotRow = db.prepare("SELECT COALESCE(MAX(slot_number), 0) + 1 as nextSlot FROM tournament_registrations WHERE tournament_id = ?").get(tournamentId);
      db.prepare(
        `INSERT INTO tournament_registrations (tournament_id, user_id, in_game_name, in_game_id, slot_number)
         VALUES (?, ?, ?, ?, ?)`
      ).run(tournamentId, req.user.id, inGameName, inGameId, slotRow.nextSlot);
      db.prepare("UPDATE tournaments SET filled_slots = filled_slots + 1 WHERE id = ?").run(tournamentId);
      if (t.entry_fee > 0) {
        db.prepare(
          `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
           VALUES (?, ?, 'entry_fee', ?, 'debit', ?, 'completed', ?, ?)`
        ).run(
          generateTxCode(),
          req.user.id,
          t.entry_fee,
          newBalance,
          `TOUR-${tournamentId}`,
          `Entry fee for ${t.title}`
        );
      }
      return { status: 200, slotNumber: slotRow.nextSlot, newBalance };
    }).immediate();
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const updatedTournament = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tournamentId);
    res.json({
      ok: true,
      slotNumber: result.slotNumber,
      user: getUserById(req.user.id),
      tournament: enrichTournament(updatedTournament, getUserById(req.user.id))
    });
  } catch (err) {
    console.error("Join tournament error:", err);
    res.status(500).json({ error: "Failed to join tournament." });
  }
});
app.get("/api/wallet", requireAuth, (req, res) => {
  db.prepare("INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)").run(
    req.user.id,
    req.user.wallet_balance
  );
  const wallet = db.prepare("SELECT * FROM wallet_accounts WHERE user_id = ?").get(req.user.id);
  const deposits = db.prepare(
    `SELECT id, amount, method, transaction_ref, sender_account, status, admin_note, created_at, reviewed_at
       FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
  ).all(req.user.id);
  const withdrawals = db.prepare(
    `SELECT id, amount, method, bank_name, account_title, account_number, status, admin_note, created_at, reviewed_at
       FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 50`
  ).all(req.user.id);
  const transactions = db.prepare(
    `SELECT id, tx_code, type, amount, direction, balance_after, status, reference_id, description, created_at
       FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100`
  ).all(req.user.id);
  const winnings = db.prepare(
    `SELECT w.id, w.tournament_id, t.title as tournament_title, t.mode as tournament_mode,
              w.placement, w.prize_amount, w.declared_at
       FROM winners w
       JOIN tournaments t ON t.id = w.tournament_id
       WHERE w.user_id = ?
       ORDER BY w.declared_at DESC`
  ).all(req.user.id);
  res.json({
    wallet,
    deposits,
    withdrawals,
    transactions,
    winnings,
    paymentChannels: PAYMENT_CHANNELS
  });
});
app.post("/api/wallet/deposit", requireAuth, (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const method = typeof req.body.method === "string" ? req.body.method.trim() : "";
    const transactionRef = typeof req.body.transactionRef === "string" ? req.body.transactionRef.trim().toUpperCase() : "";
    const senderAccount = typeof req.body.senderAccount === "string" ? req.body.senderAccount.trim() : "";
    const screenshot = validateImageInput(req.body.screenshotData, 2 * 1024 * 1024);
    if (!Number.isInteger(amount) || amount < 100 || amount > 5e5) {
      res.status(400).json({ error: "Deposit amount must be a whole number between PKR 100 and PKR 500,000." });
      return;
    }
    if (!["jazzcash", "easypaisa"].includes(method)) {
      res.status(400).json({ error: "Invalid payment method selected. Choose JazzCash or Easypaisa." });
      return;
    }
    if (transactionRef.length < 4 || transactionRef.length > 64 || !/^[A-Z0-9_-]+$/.test(transactionRef)) {
      res.status(400).json({
        error: "Transaction ID (TID) must be 4\u201364 characters using letters, numbers, or hyphens."
      });
      return;
    }
    if (senderAccount.length < 4 || senderAccount.length > 64) {
      res.status(400).json({ error: "Sender phone/account number is required." });
      return;
    }
    if (screenshot === null) {
      res.status(400).json({ error: "Payment screenshot must be a valid PNG, JPEG, or WEBP under 2MB." });
      return;
    }
    if (!screenshot) {
      res.status(400).json({ error: "Please upload your payment receipt screenshot." });
      return;
    }
    const result = db.transaction(() => {
      const dup = db.prepare("SELECT id FROM deposits WHERE transaction_ref = ?").get(transactionRef);
      if (dup) {
        return { conflict: "Duplicate Transaction ID detected. This TID has already been submitted." };
      }
      const wallet = db.prepare("SELECT available_balance FROM wallet_accounts WHERE user_id = ?").get(req.user.id);
      const depInfo = db.prepare(
        `INSERT INTO deposits (user_id, amount, method, transaction_ref, sender_account, screenshot_data, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`
      ).run(req.user.id, amount, method, transactionRef, senderAccount, screenshot);
      const depId = Number(depInfo.lastInsertRowid);
      db.prepare(
        `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
         VALUES (?, ?, 'deposit', ?, 'credit', ?, 'pending', ?, ?)`
      ).run(
        generateTxCode(),
        req.user.id,
        amount,
        wallet.available_balance,
        `DEP-${depId}`,
        `Deposit request via ${method.replace("_", " ")} (TID: ${transactionRef})`
      );
      return { depId };
    }).immediate();
    if ("conflict" in result) {
      res.status(409).json({ error: result.conflict });
      return;
    }
    res.status(201).json({
      ok: true,
      depositId: result.depId,
      message: "Deposit submitted for manual verification."
    });
  } catch (err) {
    console.error("Deposit request error:", err);
    res.status(500).json({ error: "Failed to submit deposit request." });
  }
});
app.post("/api/wallet/withdraw", requireAuth, (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const method = typeof req.body.method === "string" ? req.body.method.trim() : "";
    const bankName = typeof req.body.bankName === "string" ? req.body.bankName.trim() : "";
    const accountTitle = typeof req.body.accountTitle === "string" ? req.body.accountTitle.trim() : "";
    const accountNumber = typeof req.body.accountNumber === "string" ? req.body.accountNumber.trim() : "";
    if (!Number.isInteger(amount) || amount < 200 || amount > 5e5) {
      res.status(400).json({ error: "Withdrawal amount must be a whole number between PKR 200 and PKR 500,000." });
      return;
    }
    if (!["jazzcash", "easypaisa", "bank_account"].includes(method)) {
      res.status(400).json({ error: "Invalid payout method selected. Choose Easypaisa, JazzCash, or Bank Account." });
      return;
    }
    if (method === "bank_account" && (bankName.length < 2 || bankName.length > 64)) {
      res.status(400).json({ error: "Please enter the bank name (e.g. HBL, Meezan Bank, UBL)." });
      return;
    }
    if (accountTitle.length < 2 || accountTitle.length > 64) {
      res.status(400).json({ error: "Account holder name is required (2\u201364 characters)." });
      return;
    }
    if (method === "bank_account") {
      if (accountNumber.length < 8 || accountNumber.length > 34) {
        res.status(400).json({ error: "Valid bank account number or IBAN (8\u201334 characters) is required." });
        return;
      }
    } else if (accountNumber.length < 6 || accountNumber.length > 20) {
      res.status(400).json({ error: "Valid Easypaisa or JazzCash mobile number is required." });
      return;
    }
    const result = db.transaction(() => {
      db.prepare("INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)").run(
        req.user.id,
        req.user.wallet_balance
      );
      const wallet = db.prepare("SELECT available_balance, pending_withdrawal FROM wallet_accounts WHERE user_id = ?").get(req.user.id);
      const spendable = Math.max(0, wallet.available_balance - wallet.pending_withdrawal);
      if (amount > spendable) {
        return {
          error: `Insufficient available balance. Spendable: PKR ${spendable} (Total: PKR ${wallet.available_balance}, Pending: PKR ${wallet.pending_withdrawal}).`
        };
      }
      const newPending = wallet.pending_withdrawal + amount;
      db.prepare(
        "UPDATE wallet_accounts SET pending_withdrawal = ?, updated_at = datetime('now') WHERE user_id = ?"
      ).run(newPending, req.user.id);
      const wInfo = db.prepare(
        `INSERT INTO withdrawals (user_id, amount, method, bank_name, account_title, account_number, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`
      ).run(req.user.id, amount, method, method === "bank_account" ? bankName : "", accountTitle, accountNumber);
      const wId = Number(wInfo.lastInsertRowid);
      const methodLabel = method === "bank_account" ? `${bankName} Bank` : method === "easypaisa" ? "Easypaisa" : "JazzCash";
      db.prepare(
        `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
         VALUES (?, ?, 'withdrawal', ?, 'debit', ?, 'pending', ?, ?)`
      ).run(
        generateTxCode(),
        req.user.id,
        amount,
        wallet.available_balance,
        `WD-${wId}`,
        `Withdrawal request via ${methodLabel} (${accountNumber}) \u2014 Pending verification`
      );
      return { withdrawalId: wId };
    }).immediate();
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json({
      ok: true,
      withdrawalId: result.withdrawalId,
      message: "Withdrawal request sent to admin. Funds will be deducted once payment is confirmed.",
      user: getUserById(req.user.id)
    });
  } catch (err) {
    console.error("Withdraw error:", err);
    res.status(500).json({ error: "Failed to submit withdrawal request." });
  }
});
app.get("/api/admin/overview", requireAuth, requireAdmin, (_req, res) => {
  const userStats = db.prepare(
    `SELECT
         COUNT(*) as totalUsers,
         COALESCE(SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END), 0) as blockedUsers,
         COALESCE(SUM(wallet_balance), 0) as totalUserBalances
       FROM users`
  ).get();
  const tournamentRows = db.prepare("SELECT id, match_time, end_time, status FROM tournaments").all();
  const activeTournaments = tournamentRows.filter((row) => {
    const hasWinners = db.prepare("SELECT 1 FROM winners WHERE tournament_id = ? LIMIT 1").get(row.id);
    const st = computeTournamentStatus({
      match_time: row.match_time,
      end_time: row.end_time,
      status: row.status,
      winners: hasWinners ? [hasWinners] : []
    });
    return st === "upcoming" || st === "live";
  }).length;
  const tournamentStats = {
    totalTournaments: tournamentRows.length,
    activeTournaments
  };
  const depositStats = db.prepare(
    `SELECT
         COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pendingDeposits,
         COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as totalDeposited
       FROM deposits`
  ).get();
  const withdrawalStats = db.prepare(
    `SELECT
         COALESCE(SUM(CASE WHEN status IN ('pending', 'approved') THEN 1 ELSE 0 END), 0) as pendingWithdrawals,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as totalWithdrawn
       FROM withdrawals`
  ).get();
  const ledgerStats = db.prepare(
    `SELECT
         COALESCE(SUM(CASE WHEN type = 'entry_fee' AND status = 'completed' THEN amount ELSE 0 END), 0) as totalEntryFees,
         COALESCE(SUM(CASE WHEN type = 'prize_win' AND status = 'completed' THEN amount ELSE 0 END), 0) as totalPrizesAwarded
       FROM transactions`
  ).get();
  const extraStats = db.prepare(
    `SELECT
         (SELECT COUNT(*) FROM team_registrations WHERE status = 'pending') as pendingTeamRegistrations,
         (SELECT COUNT(*) FROM contact_messages WHERE status = 'open') as openContacts`
  ).get();
  res.json({
    overview: {
      ...userStats,
      ...tournamentStats,
      ...depositStats,
      ...withdrawalStats,
      ...ledgerStats,
      ...extraStats
    }
  });
});
app.get("/api/admin/users", requireAuth, requireAdmin, (_req, res) => {
  const users = db.prepare(
    `SELECT u.id, u.player_id, u.username, u.email, u.avatar_url, u.role, u.is_blocked,
              u.wallet_balance, u.matches_played, u.wins, u.created_at,
              w.pending_withdrawal, w.total_deposited, w.total_withdrawn, w.total_won
       FROM users u
       LEFT JOIN wallet_accounts w ON w.user_id = u.id
       ORDER BY u.created_at DESC`
  ).all();
  res.json({ users });
});
app.post("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
  try {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const role = req.body.role === "admin" ? "admin" : "player";
    const initialBalance = Math.max(0, Math.floor(Number(req.body.initialBalance) || 0));
    if (username.length < 3 || username.length > 24 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      res.status(400).json({ error: "Username must be 3\u201324 valid characters." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Valid email is required." });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters." });
      return;
    }
    const exists = db.prepare("SELECT id FROM users WHERE lower(email) = ? OR lower(username) = ?").get(email, username.toLowerCase());
    if (exists) {
      res.status(409).json({ error: "Username or email already exists." });
      return;
    }
    const playerId = generateUniquePlayerId();
    const passwordHash = hashPassword(password);
    const newUserId = db.transaction(() => {
      const info = db.prepare(
        `INSERT INTO users (player_id, username, email, password_hash, avatar_url, role, wallet_balance)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        playerId,
        username,
        email,
        passwordHash,
        "/src/assets/images/avatar_esports_pro_1795298801657.jpg",
        role,
        initialBalance
      );
      const uid = Number(info.lastInsertRowid);
      db.prepare("INSERT INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)").run(
        uid,
        initialBalance
      );
      if (role === "admin") {
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
          `ADM-${req.user.id}`,
          `Initial wallet credit by admin ${req.user.username}`
        );
      }
      return uid;
    }).immediate();
    res.status(201).json({ user: getUserById(newUserId) });
  } catch (err) {
    console.error("Admin create user error:", err);
    res.status(500).json({ error: "Failed to create user." });
  }
});
app.patch("/api/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      res.status(400).json({ error: "Invalid user ID." });
      return;
    }
    const result = db.transaction(() => {
      const target = db.prepare("SELECT * FROM users WHERE id = ?").get(targetId);
      if (!target) return { status: 404, error: "User not found." };
      if (req.body.isBlocked !== void 0) {
        const nextBlocked = req.body.isBlocked ? 1 : 0;
        if (targetId === req.user.id && nextBlocked === 1) {
          return { status: 400, error: "You cannot block your own administrator account." };
        }
        db.prepare("UPDATE users SET is_blocked = ? WHERE id = ?").run(nextBlocked, targetId);
      }
      if (req.body.role === "admin" || req.body.role === "player") {
        if (targetId === req.user.id && req.body.role !== "admin") {
          return { status: 400, error: "You cannot demote your own administrator account." };
        }
        db.prepare("UPDATE users SET role = ? WHERE id = ?").run(req.body.role, targetId);
        if (req.body.role === "admin") {
          db.prepare("INSERT OR IGNORE INTO admins (user_id, admin_level) VALUES (?, 'moderator')").run(targetId);
        } else {
          db.prepare("DELETE FROM admins WHERE user_id = ?").run(targetId);
        }
      }
      if (req.body.balanceAdjustment !== void 0) {
        const delta = Math.trunc(Number(req.body.balanceAdjustment));
        if (delta !== 0) {
          const wallet = db.prepare("SELECT available_balance FROM wallet_accounts WHERE user_id = ?").get(targetId);
          const nextBal = wallet.available_balance + delta;
          if (nextBal < 0) {
            return { status: 400, error: "Adjustment would result in negative wallet balance." };
          }
          db.prepare("UPDATE users SET wallet_balance = ? WHERE id = ?").run(nextBal, targetId);
          db.prepare(
            "UPDATE wallet_accounts SET available_balance = ?, updated_at = datetime('now') WHERE user_id = ?"
          ).run(nextBal, targetId);
          const note = typeof req.body.adjustmentNote === "string" && req.body.adjustmentNote.trim() ? req.body.adjustmentNote.trim() : `Admin balance adjustment by ${req.user.username}`;
          db.prepare(
            `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
             VALUES (?, ?, 'admin_adjustment', ?, ?, ?, 'completed', ?, ?)`
          ).run(
            generateTxCode(),
            targetId,
            Math.abs(delta),
            delta > 0 ? "credit" : "debit",
            nextBal,
            `ADM-${req.user.id}`,
            note
          );
        }
      }
      return { status: 200 };
    }).immediate();
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ user: getUserById(targetId) });
  } catch (err) {
    console.error("Admin update user error:", err);
    res.status(500).json({ error: "Failed to update user." });
  }
});
app.delete("/api/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    res.status(400).json({ error: "Invalid user ID." });
    return;
  }
  if (targetId === req.user.id) {
    res.status(400).json({ error: "You cannot delete your own active account." });
    return;
  }
  const info = db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
  if (info.changes === 0) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  res.json({ ok: true });
});
app.post("/api/admin/users/:id/award-prize", requireAuth, requireAdmin, (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const amount = Math.floor(Number(req.body.amount));
    const note = typeof req.body.note === "string" ? req.body.note.trim() : "";
    const tournamentId = req.body.tournamentId ? Number(req.body.tournamentId) : null;
    if (!Number.isInteger(targetId) || targetId <= 0) {
      res.status(400).json({ error: "Invalid player user ID." });
      return;
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 1e6) {
      res.status(400).json({ error: "Prize amount must be between PKR 1 and PKR 1,000,000." });
      return;
    }
    const result = db.transaction(() => {
      const targetUser = db.prepare("SELECT id, username, wallet_balance FROM users WHERE id = ?").get(targetId);
      if (!targetUser) return { status: 404, error: "Player account not found." };
      db.prepare("INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)").run(
        targetId,
        targetUser.wallet_balance
      );
      const wallet = db.prepare("SELECT available_balance, total_won FROM wallet_accounts WHERE user_id = ?").get(targetId);
      const nextBal = wallet.available_balance + amount;
      const nextWon = wallet.total_won + amount;
      db.prepare("UPDATE users SET wallet_balance = ?, wins = wins + 1 WHERE id = ?").run(nextBal, targetId);
      db.prepare(
        "UPDATE wallet_accounts SET available_balance = ?, total_won = ?, updated_at = datetime('now') WHERE user_id = ?"
      ).run(nextBal, nextWon, targetId);
      let tourTitle = "";
      if (tournamentId && Number.isInteger(tournamentId)) {
        const t = db.prepare("SELECT title FROM tournaments WHERE id = ?").get(tournamentId);
        if (t) tourTitle = t.title;
      }
      const description = note || (tourTitle ? `Tournament Winner Prize \u2014 ${tourTitle}` : `Tournament Winner Prize credited by admin ${req.user.username}`);
      db.prepare(
        `INSERT INTO transactions (tx_code, user_id, type, amount, direction, balance_after, status, reference_id, description)
         VALUES (?, ?, 'prize_win', ?, 'credit', ?, 'completed', ?, ?)`
      ).run(
        generateTxCode(),
        targetId,
        amount,
        nextBal,
        tournamentId ? `TOUR-${tournamentId}` : `PRIZE-${req.user.id}`,
        description
      );
      return { status: 200 };
    }).immediate();
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, user: getUserById(targetId) });
  } catch (err) {
    console.error("Award prize error:", err);
    res.status(500).json({ error: "Failed to credit prize money." });
  }
});
app.post("/api/admin/tournaments", requireAuth, requireAdmin, (req, res) => {
  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const gameName = typeof req.body.gameName === "string" && req.body.gameName.trim() ? req.body.gameName.trim() : "Free Fire";
    const mode = normalizeMode(req.body.mode);
    const entryFee = Math.floor(Number(req.body.entryFee));
    const prizePool = Math.floor(Number(req.body.prizePool));
    const maxSlots = Math.floor(Number(req.body.maxSlots));
    const matchTime = typeof req.body.matchTime === "string" ? req.body.matchTime.trim() : "";
    const endTime = typeof req.body.endTime === "string" ? req.body.endTime.trim() : "";
    const requestedStatus = typeof req.body.status === "string" ? req.body.status : "auto";
    const rules = typeof req.body.rules === "string" ? req.body.rules.trim() : "";
    const roomId = typeof req.body.roomId === "string" ? req.body.roomId.trim() : "";
    const roomPass = typeof req.body.roomPass === "string" ? req.body.roomPass.trim() : "";
    const bannerUrl = sanitizeBannerUrl(req.body.bannerUrl);
    if (title.length < 3 || gameName.length < 2) {
      res.status(400).json({ error: "Tournament title and game name are required." });
      return;
    }
    if (!Number.isFinite(entryFee) || entryFee < 0 || !Number.isFinite(prizePool) || prizePool < 0) {
      res.status(400).json({ error: "Entry fee and prize pool must be 0 or greater." });
      return;
    }
    if (!Number.isFinite(maxSlots) || maxSlots < 2 || maxSlots > 500) {
      res.status(400).json({ error: "Max slots must be between 2 and 500." });
      return;
    }
    const startMs = Date.parse(matchTime);
    if (!matchTime || !Number.isFinite(startMs)) {
      res.status(400).json({ error: "Valid tournament start date and time (PKT) are required." });
      return;
    }
    if (endTime) {
      const endMs = Date.parse(endTime);
      if (!Number.isFinite(endMs)) {
        res.status(400).json({ error: "Invalid optional tournament end date/time." });
        return;
      }
      if (endMs <= startMs) {
        res.status(400).json({ error: "End date and time must be later than the start date and time." });
        return;
      }
    }
    const status = requestedStatus === "cancelled" ? "cancelled" : requestedStatus === "completed" ? "completed" : computeTournamentStatus({
      match_time: new Date(startMs).toISOString(),
      end_time: endTime ? new Date(Date.parse(endTime)).toISOString() : "",
      status: "upcoming"
    });
    const normalizedStart = new Date(startMs).toISOString();
    const normalizedEnd = endTime ? new Date(Date.parse(endTime)).toISOString() : "";
    const info = db.prepare(
      `INSERT INTO tournaments (
           title, game_name, mode, entry_fee, prize_pool, max_slots, match_time, end_time,
           status, banner_url, rules, room_id, room_pass, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      title,
      gameName,
      mode,
      entryFee,
      prizePool,
      maxSlots,
      normalizedStart,
      normalizedEnd,
      status,
      bannerUrl,
      rules,
      roomId,
      roomPass,
      req.user.id
    );
    const created = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(Number(info.lastInsertRowid));
    res.status(201).json({ tournament: enrichTournament(created, req.user) });
  } catch (err) {
    console.error("Create tournament error:", err);
    res.status(500).json({ error: "Failed to create tournament." });
  }
});
app.patch("/api/admin/tournaments/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(id);
    if (!existing) {
      res.status(404).json({ error: "Tournament not found." });
      return;
    }
    const title = typeof req.body.title === "string" && req.body.title.trim() ? req.body.title.trim() : existing.title;
    const gameName = typeof req.body.gameName === "string" && req.body.gameName.trim() ? req.body.gameName.trim() : existing.game_name;
    const mode = req.body.mode !== void 0 ? normalizeMode(req.body.mode) : normalizeMode(existing.mode);
    const entryFee = req.body.entryFee !== void 0 ? Math.max(0, Math.floor(Number(req.body.entryFee))) : existing.entry_fee;
    const prizePool = req.body.prizePool !== void 0 ? Math.max(0, Math.floor(Number(req.body.prizePool))) : existing.prize_pool;
    const maxSlots = req.body.maxSlots !== void 0 ? Math.max(Number(existing.filled_slots), Math.floor(Number(req.body.maxSlots))) : existing.max_slots;
    const rawMatchTime = typeof req.body.matchTime === "string" && req.body.matchTime.trim() ? req.body.matchTime.trim() : String(existing.match_time);
    const rawEndTime = typeof req.body.endTime === "string" ? req.body.endTime.trim() : String(existing.end_time || "");
    const startMs = Date.parse(rawMatchTime);
    if (!Number.isFinite(startMs)) {
      res.status(400).json({ error: "Valid tournament start date and time (PKT) are required." });
      return;
    }
    if (rawEndTime) {
      const endMs = Date.parse(rawEndTime);
      if (!Number.isFinite(endMs)) {
        res.status(400).json({ error: "Invalid optional tournament end date/time." });
        return;
      }
      if (endMs <= startMs) {
        res.status(400).json({ error: "End date and time must be later than the start date and time." });
        return;
      }
    }
    const matchTime = new Date(startMs).toISOString();
    const endTime = rawEndTime ? new Date(Date.parse(rawEndTime)).toISOString() : "";
    const hasWinners = db.prepare("SELECT 1 FROM winners WHERE tournament_id = ? LIMIT 1").get(id);
    const reqStatus = typeof req.body.status === "string" ? req.body.status : "";
    let status;
    if (reqStatus === "cancelled") {
      status = "cancelled";
    } else if (reqStatus === "completed") {
      status = "completed";
    } else if (reqStatus === "auto") {
      status = computeTournamentStatus({
        match_time: matchTime,
        end_time: endTime,
        status: "upcoming",
        winners: hasWinners ? [hasWinners] : []
      });
    } else if (["upcoming", "live"].includes(reqStatus)) {
      status = computeTournamentStatus({
        match_time: matchTime,
        end_time: endTime,
        status: reqStatus,
        winners: hasWinners ? [hasWinners] : []
      });
    } else {
      status = existing.status;
    }
    const rules = typeof req.body.rules === "string" ? req.body.rules.trim() : existing.rules;
    const roomId = typeof req.body.roomId === "string" ? req.body.roomId.trim() : existing.room_id;
    const roomPass = typeof req.body.roomPass === "string" ? req.body.roomPass.trim() : existing.room_pass;
    const bannerUrl = req.body.bannerUrl ? sanitizeBannerUrl(req.body.bannerUrl) : existing.banner_url;
    db.prepare(
      `UPDATE tournaments
       SET title = ?, game_name = ?, mode = ?, entry_fee = ?, prize_pool = ?, max_slots = ?,
           match_time = ?, end_time = ?, status = ?, banner_url = ?, rules = ?, room_id = ?, room_pass = ?
       WHERE id = ?`
    ).run(
      title,
      gameName,
      mode,
      entryFee,
      prizePool,
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
    const updated = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(id);
    res.json({ tournament: enrichTournament(updated, req.user) });
  } catch (err) {
    console.error("Update tournament error:", err);
    res.status(500).json({ error: "Failed to update tournament." });
  }
});
app.delete("/api/admin/tournaments/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = db.transaction(() => {
      const t = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(id);
      if (!t) return { notFound: true };
      if ((t.status === "upcoming" || t.status === "live") && t.entry_fee > 0) {
        const regs = db.prepare("SELECT user_id FROM tournament_registrations WHERE tournament_id = ?").all(id);
        for (const r of regs) {
          const wallet = db.prepare("SELECT available_balance FROM wallet_accounts WHERE user_id = ?").get(r.user_id);
          if (wallet) {
            const nextBal = wallet.available_balance + t.entry_fee;
            db.prepare("UPDATE users SET wallet_balance = ? WHERE id = ?").run(nextBal, r.user_id);
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
      db.prepare("DELETE FROM tournaments WHERE id = ?").run(id);
      return { ok: true };
    }).immediate();
    if ("notFound" in result) {
      res.status(404).json({ error: "Tournament not found." });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete tournament error:", err);
    res.status(500).json({ error: "Failed to delete tournament." });
  }
});
app.post("/api/admin/tournaments/:id/players", requireAuth, requireAdmin, (req, res) => {
  try {
    const tournamentId = Number(req.params.id);
    const identifier = typeof req.body.playerIdentifier === "string" ? req.body.playerIdentifier.trim() : "";
    const inGameName = typeof req.body.inGameName === "string" ? req.body.inGameName.trim() : "";
    const inGameId = typeof req.body.inGameId === "string" ? req.body.inGameId.trim() : "";
    const chargeFee = Boolean(req.body.chargeFee);
    if (!identifier) {
      res.status(400).json({ error: "Player ID, username, or email is required." });
      return;
    }
    const result = db.transaction(() => {
      const t = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tournamentId);
      if (!t) return { status: 404, error: "Tournament not found." };
      if (t.filled_slots >= t.max_slots) return { status: 400, error: "Tournament is full." };
      const targetUser = db.prepare(
        `SELECT id, username, player_id, wallet_balance FROM users
           WHERE upper(player_id) = upper(?) OR lower(username) = lower(?) OR lower(email) = lower(?)`
      ).get(identifier, identifier, identifier);
      if (!targetUser) return { status: 404, error: "No player found with that Player ID, username, or email." };
      const already = db.prepare("SELECT id FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?").get(tournamentId, targetUser.id);
      if (already) return { status: 409, error: "Player is already registered in this tournament." };
      if (chargeFee && t.entry_fee > 0) {
        if (targetUser.wallet_balance < t.entry_fee) {
          return { status: 400, error: `Player balance (PKR ${targetUser.wallet_balance}) is below entry fee.` };
        }
        const nextBal = targetUser.wallet_balance - t.entry_fee;
        db.prepare("UPDATE users SET wallet_balance = ?, matches_played = matches_played + 1 WHERE id = ?").run(
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
        db.prepare("UPDATE users SET matches_played = matches_played + 1 WHERE id = ?").run(targetUser.id);
      }
      const slotRow = db.prepare("SELECT COALESCE(MAX(slot_number), 0) + 1 as nextSlot FROM tournament_registrations WHERE tournament_id = ?").get(tournamentId);
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
      db.prepare("UPDATE tournaments SET filled_slots = filled_slots + 1 WHERE id = ?").run(tournamentId);
      return { status: 200 };
    }).immediate();
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const updated = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tournamentId);
    res.json({ tournament: enrichTournament(updated, req.user) });
  } catch (err) {
    console.error("Admin add player error:", err);
    res.status(500).json({ error: "Failed to add player." });
  }
});
app.delete(
  "/api/admin/tournaments/:id/players/:userId",
  requireAuth,
  requireAdmin,
  (req, res) => {
    try {
      const tournamentId = Number(req.params.id);
      const userId = Number(req.params.userId);
      const refund = req.query.refund === "true";
      const result = db.transaction(() => {
        const t = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tournamentId);
        if (!t) return { status: 404, error: "Tournament not found." };
        const reg = db.prepare("SELECT id FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?").get(tournamentId, userId);
        if (!reg) return { status: 404, error: "Player registration not found." };
        db.prepare("DELETE FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?").run(
          tournamentId,
          userId
        );
        db.prepare("UPDATE tournaments SET filled_slots = MAX(0, filled_slots - 1) WHERE id = ?").run(tournamentId);
        if (refund && t.entry_fee > 0) {
          const wallet = db.prepare("SELECT available_balance FROM wallet_accounts WHERE user_id = ?").get(userId);
          const nextBal = wallet.available_balance + t.entry_fee;
          db.prepare("UPDATE users SET wallet_balance = ? WHERE id = ?").run(nextBal, userId);
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
      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      const updated = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tournamentId);
      res.json({ tournament: enrichTournament(updated, req.user) });
    } catch (err) {
      console.error("Remove player error:", err);
      res.status(500).json({ error: "Failed to remove player." });
    }
  }
);
app.post("/api/admin/tournaments/:id/winners", requireAuth, requireAdmin, (req, res) => {
  try {
    const tournamentId = Number(req.params.id);
    const winnersInput = Array.isArray(req.body.winners) ? req.body.winners : [];
    if (winnersInput.length === 0) {
      res.status(400).json({ error: "Provide at least one winner with placement and prize amount." });
      return;
    }
    const result = db.transaction(() => {
      const t = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tournamentId);
      if (!t) return { status: 404, error: "Tournament not found." };
      const existingWinners = db.prepare("SELECT COUNT(*) as count FROM winners WHERE tournament_id = ?").get(tournamentId);
      if (existingWinners.count > 0) {
        return { status: 409, error: "Winners have already been declared and paid for this tournament." };
      }
      const seenUsers = /* @__PURE__ */ new Set();
      const seenPlacements = /* @__PURE__ */ new Set();
      for (const entry of winnersInput) {
        const uid = Number(entry.userId);
        const placement = Number(entry.placement);
        const prizeAmount = Math.floor(Number(entry.prizeAmount));
        if (!Number.isInteger(uid) || !Number.isInteger(placement) || placement < 1 || prizeAmount < 0) {
          return { status: 400, error: "Invalid winner entry data." };
        }
        if (seenUsers.has(uid) || seenPlacements.has(placement)) {
          return { status: 400, error: "Duplicate winner player or placement selected." };
        }
        seenUsers.add(uid);
        seenPlacements.add(placement);
        const targetUser = db.prepare("SELECT id, username, player_id, wallet_balance FROM users WHERE id = ?").get(uid);
        if (!targetUser) {
          return { status: 404, error: "Selected winner player account was not found." };
        }
        const isReg = db.prepare("SELECT id FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?").get(tournamentId, uid);
        if (!isReg) {
          const slotRow = db.prepare("SELECT COALESCE(MAX(slot_number), 0) + 1 as nextSlot FROM tournament_registrations WHERE tournament_id = ?").get(tournamentId);
          db.prepare(
            `INSERT INTO tournament_registrations (tournament_id, user_id, in_game_name, in_game_id, slot_number)
             VALUES (?, ?, ?, ?, ?)`
          ).run(tournamentId, uid, targetUser.username, targetUser.player_id, slotRow.nextSlot);
          db.prepare("UPDATE tournaments SET filled_slots = filled_slots + 1 WHERE id = ?").run(tournamentId);
        }
        db.prepare(
          `INSERT INTO winners (tournament_id, user_id, placement, prize_amount, declared_by)
           VALUES (?, ?, ?, ?, ?)`
        ).run(tournamentId, uid, placement, prizeAmount, req.user.id);
        if (placement === 1) {
          db.prepare("UPDATE users SET wins = wins + 1 WHERE id = ?").run(uid);
        }
        db.prepare("INSERT OR IGNORE INTO wallet_accounts (user_id, available_balance) VALUES (?, ?)").run(
          uid,
          targetUser.wallet_balance
        );
        if (prizeAmount > 0) {
          const wallet = db.prepare("SELECT available_balance, total_won FROM wallet_accounts WHERE user_id = ?").get(uid);
          const nextBal = wallet.available_balance + prizeAmount;
          const nextWon = wallet.total_won + prizeAmount;
          db.prepare("UPDATE users SET wallet_balance = ? WHERE id = ?").run(nextBal, uid);
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
            `#${placement} Prize Winner \u2014 ${t.title}`
          );
        }
      }
      db.prepare("UPDATE tournaments SET status = 'completed' WHERE id = ?").run(tournamentId);
      return { status: 200 };
    }).immediate();
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const updated = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tournamentId);
    res.json({ tournament: enrichTournament(updated, req.user) });
  } catch (err) {
    console.error("Declare winners error:", err);
    res.status(500).json({ error: "Failed to declare winners." });
  }
});
app.get("/api/admin/deposits", requireAuth, requireAdmin, (_req, res) => {
  const deposits = db.prepare(
    `SELECT d.*, u.username, u.player_id, u.email
       FROM deposits d
       JOIN users u ON u.id = d.user_id
       ORDER BY CASE d.status WHEN 'pending' THEN 0 ELSE 1 END, d.created_at DESC`
  ).all();
  res.json({ deposits });
});
app.post("/api/admin/deposits/:id/review", requireAuth, requireAdmin, (req, res) => {
  try {
    const depId = Number(req.params.id);
    const action = req.body.action === "approve" ? "approve" : req.body.action === "reject" ? "reject" : null;
    const adminNote = typeof req.body.adminNote === "string" ? req.body.adminNote.trim() : "";
    if (!action) {
      res.status(400).json({ error: "Action must be approve or reject." });
      return;
    }
    const result = db.transaction(() => {
      const dep = db.prepare("SELECT * FROM deposits WHERE id = ?").get(depId);
      if (!dep) return { status: 404, error: "Deposit request not found." };
      if (dep.status !== "pending") {
        return { status: 409, error: `Deposit has already been ${dep.status}.` };
      }
      const nextStatus = action === "approve" ? "approved" : "rejected";
      db.prepare(
        "UPDATE deposits SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
      ).run(nextStatus, adminNote, req.user.id, depId);
      const wallet = db.prepare("SELECT available_balance, total_deposited FROM wallet_accounts WHERE user_id = ?").get(dep.user_id);
      if (action === "approve") {
        const nextBal = wallet.available_balance + dep.amount;
        const nextTotalDep = wallet.total_deposited + dep.amount;
        db.prepare("UPDATE users SET wallet_balance = ? WHERE id = ?").run(nextBal, dep.user_id);
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
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Review deposit error:", err);
    res.status(500).json({ error: "Failed to process deposit review." });
  }
});
app.get("/api/admin/withdrawals", requireAuth, requireAdmin, (_req, res) => {
  const withdrawals = db.prepare(
    `SELECT w.*, u.username, u.player_id, u.email
       FROM withdrawals w
       JOIN users u ON u.id = w.user_id
       ORDER BY CASE w.status WHEN 'pending' THEN 0 ELSE 1 END, w.created_at DESC`
  ).all();
  res.json({ withdrawals });
});
app.post("/api/admin/withdrawals/:id/review", requireAuth, requireAdmin, (req, res) => {
  try {
    const wId = Number(req.params.id);
    const action = req.body.action === "approve" ? "approve" : req.body.action === "pay" ? "pay" : req.body.action === "reject" ? "reject" : null;
    const adminNote = typeof req.body.adminNote === "string" ? req.body.adminNote.trim() : "";
    if (!action) {
      res.status(400).json({ error: "Action must be approve, pay, or reject." });
      return;
    }
    const result = db.transaction(() => {
      const wd = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(wId);
      if (!wd) return { status: 404, error: "Withdrawal request not found." };
      if (wd.status === "paid" || wd.status === "rejected") {
        return { status: 409, error: `Withdrawal has already been ${wd.status}.` };
      }
      const wallet = db.prepare("SELECT available_balance, pending_withdrawal, total_withdrawn FROM wallet_accounts WHERE user_id = ?").get(wd.user_id);
      if (action === "approve") {
        if (wd.status !== "pending") {
          return { status: 409, error: `Withdrawal is already ${wd.status}.` };
        }
        if (wallet.available_balance < wd.amount) {
          return { status: 400, error: "Player wallet balance is insufficient for this withdrawal." };
        }
        db.prepare(
          "UPDATE withdrawals SET status = 'approved', admin_note = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
        ).run(adminNote || "Approved for payout", req.user.id, wId);
        db.prepare(
          "UPDATE transactions SET status = 'approved' WHERE reference_id = ? AND type = 'withdrawal'"
        ).run(`WD-${wId}`);
        return { status: 200 };
      }
      const nextPending = Math.max(0, wallet.pending_withdrawal - wd.amount);
      if (action === "pay") {
        if (wallet.available_balance < wd.amount) {
          return {
            status: 400,
            error: `Player available balance (PKR ${wallet.available_balance}) is below payout amount (PKR ${wd.amount}).`
          };
        }
        const nextBal = wallet.available_balance - wd.amount;
        const nextTotalWd = wallet.total_withdrawn + wd.amount;
        db.prepare(
          "UPDATE withdrawals SET status = 'paid', admin_note = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
        ).run(adminNote || "Payment confirmed & transferred", req.user.id, wId);
        db.prepare("UPDATE users SET wallet_balance = ? WHERE id = ?").run(nextBal, wd.user_id);
        db.prepare(
          "UPDATE wallet_accounts SET available_balance = ?, pending_withdrawal = ?, total_withdrawn = ?, updated_at = datetime('now') WHERE user_id = ?"
        ).run(nextBal, nextPending, nextTotalWd, wd.user_id);
        const methodLabel = wd.method === "bank_account" ? `${wd.bank_name || "Bank"} Account` : wd.method === "easypaisa" ? "Easypaisa" : "JazzCash";
        db.prepare(
          "UPDATE transactions SET status = 'paid', balance_after = ?, description = ? WHERE reference_id = ? AND type = 'withdrawal'"
        ).run(nextBal, `Paid via ${methodLabel} (${wd.account_number})`, `WD-${wId}`);
      } else {
        db.prepare(
          "UPDATE withdrawals SET status = 'rejected', admin_note = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
        ).run(adminNote || "Rejected by admin", req.user.id, wId);
        db.prepare(
          "UPDATE wallet_accounts SET pending_withdrawal = ?, updated_at = datetime('now') WHERE user_id = ?"
        ).run(nextPending, wd.user_id);
        db.prepare(
          "UPDATE transactions SET status = 'rejected' WHERE reference_id = ? AND type = 'withdrawal'"
        ).run(`WD-${wId}`);
      }
      return { status: 200 };
    }).immediate();
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Review withdrawal error:", err);
    res.status(500).json({ error: "Failed to process withdrawal review." });
  }
});
app.get("/api/admin/transactions", requireAuth, requireAdmin, (_req, res) => {
  const transactions = db.prepare(
    `SELECT t.*, u.username, u.player_id
       FROM transactions t
       JOIN users u ON u.id = t.user_id
       ORDER BY t.id DESC
       LIMIT 300`
  ).all();
  res.json({ transactions });
});
app.get("/api/admin/team-registrations", requireAuth, requireAdmin, (_req, res) => {
  const registrations = db.prepare(
    `SELECT tr.*, t.title as tournament_title, t.mode as tournament_mode, t.match_time
       FROM team_registrations tr
       JOIN tournaments t ON t.id = tr.tournament_id
       ORDER BY CASE tr.status WHEN 'pending' THEN 0 ELSE 1 END, tr.id DESC
       LIMIT 200`
  ).all();
  res.json({ registrations });
});
app.post(
  "/api/admin/team-registrations/:id/review",
  requireAuth,
  requireAdmin,
  (req, res) => {
    try {
      const regId = Number(req.params.id);
      const action = req.body.action === "confirm" ? "confirm" : req.body.action === "reject" ? "reject" : null;
      if (!Number.isInteger(regId) || regId <= 0 || !action) {
        res.status(400).json({ error: "Valid registration ID and action (confirm/reject) are required." });
        return;
      }
      const result = db.transaction(() => {
        const reg = db.prepare("SELECT * FROM team_registrations WHERE id = ?").get(regId);
        if (!reg) return { status: 404, error: "Team registration not found." };
        if (reg.status === "confirmed" && action === "confirm") {
          return { status: 409, error: "Team registration is already confirmed." };
        }
        if (reg.status === "rejected" && action === "reject") {
          return { status: 409, error: "Team registration is already rejected." };
        }
        if (action === "confirm") {
          const t = db.prepare("SELECT max_slots, filled_slots FROM tournaments WHERE id = ?").get(reg.tournament_id);
          if (!t) return { status: 404, error: "Tournament not found." };
          if (t.filled_slots >= t.max_slots) {
            return { status: 400, error: "Tournament slots are already full." };
          }
          db.prepare("UPDATE team_registrations SET status = 'confirmed' WHERE id = ?").run(regId);
          db.prepare("UPDATE tournaments SET filled_slots = filled_slots + 1 WHERE id = ?").run(reg.tournament_id);
        } else {
          if (reg.status === "confirmed") {
            db.prepare("UPDATE tournaments SET filled_slots = MAX(0, filled_slots - 1) WHERE id = ?").run(
              reg.tournament_id
            );
          }
          db.prepare("UPDATE team_registrations SET status = 'rejected' WHERE id = ?").run(regId);
        }
        return { status: 200 };
      }).immediate();
      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("Review team registration error:", err);
      res.status(500).json({ error: "Failed to update registration status." });
    }
  }
);
app.post("/api/admin/announcements", requireAuth, requireAdmin, (req, res) => {
  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const category = ["Announcement", "Match Result", "Room Alert", "Rules Update"].includes(req.body.category) ? req.body.category : "Announcement";
    const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
    const tournamentId = req.body.tournamentId ? Number(req.body.tournamentId) : null;
    const isPinned = req.body.isPinned ? 1 : 0;
    if (title.length < 3 || title.length > 140) {
      res.status(400).json({ error: "Announcement title must be 3\u2013140 characters." });
      return;
    }
    if (content.length < 5 || content.length > 1500) {
      res.status(400).json({ error: "Announcement details must be 5\u20131500 characters." });
      return;
    }
    const info = db.prepare(
      `INSERT INTO announcements (title, category, tournament_id, content, is_pinned, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      title,
      category,
      tournamentId && Number.isInteger(tournamentId) ? tournamentId : null,
      content,
      isPinned,
      req.user.id
    );
    const created = db.prepare(
      `SELECT a.id, a.title, a.category, a.tournament_id, t.title as tournament_title,
                a.content, a.is_pinned, a.created_at
         FROM announcements a
         LEFT JOIN tournaments t ON t.id = a.tournament_id
         WHERE a.id = ?`
    ).get(Number(info.lastInsertRowid));
    res.status(201).json({ announcement: created });
  } catch (err) {
    console.error("Create announcement error:", err);
    res.status(500).json({ error: "Failed to publish announcement." });
  }
});
app.delete("/api/admin/announcements/:id", requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid announcement ID." });
    return;
  }
  const info = db.prepare("DELETE FROM announcements WHERE id = ?").run(id);
  if (info.changes === 0) {
    res.status(404).json({ error: "Announcement not found." });
    return;
  }
  res.json({ ok: true });
});
app.get("/api/admin/contacts", requireAuth, requireAdmin, (_req, res) => {
  const contacts = db.prepare(
    `SELECT * FROM contact_messages
       ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, id DESC
       LIMIT 200`
  ).all();
  res.json({ contacts });
});
app.patch("/api/admin/contacts/:id", requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = req.body.status === "resolved" ? "resolved" : req.body.status === "open" ? "open" : null;
  if (!Number.isInteger(id) || id <= 0 || !status) {
    res.status(400).json({ error: "Valid contact ID and status are required." });
    return;
  }
  const info = db.prepare("UPDATE contact_messages SET status = ? WHERE id = ?").run(status, id);
  if (info.changes === 0) {
    res.status(404).json({ error: "Contact message not found." });
    return;
  }
  res.json({ ok: true });
});
app.post("/api/admin/videos", requireAuth, requireAdmin, (req, res) => {
  try {
    const rawTitle = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const title = (rawTitle || "FREE FIRE TOURNAMENT 09 Highlights").slice(0, 120);
    const parsed = extractYouTubeVideoId(req.body.youtubeUrl);
    if (!parsed) {
      res.status(400).json({
        error: "Please paste a valid YouTube video link (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...)."
      });
      return;
    }
    const reqFeatured = req.body.isFeatured !== false;
    const created = db.transaction(() => {
      const existingCount = db.prepare("SELECT COUNT(*) as count FROM youtube_videos").get().count;
      const shouldFeature = reqFeatured || existingCount === 0 ? 1 : 0;
      if (shouldFeature === 1) {
        db.prepare("UPDATE youtube_videos SET is_featured = 0").run();
      }
      const info = db.prepare(
        `INSERT INTO youtube_videos (title, youtube_url, video_id, is_featured, created_by)
           VALUES (?, ?, ?, ?, ?)`
      ).run(title, parsed.normalizedUrl, parsed.videoId, shouldFeature, req.user.id);
      return db.prepare("SELECT id, title, youtube_url, video_id, is_featured, created_at, updated_at FROM youtube_videos WHERE id = ?").get(Number(info.lastInsertRowid));
    }).immediate();
    const videos = db.prepare("SELECT id, title, youtube_url, video_id, is_featured, created_at, updated_at FROM youtube_videos ORDER BY is_featured DESC, id DESC").all();
    res.status(201).json({ video: created, videos });
  } catch (err) {
    console.error("Create YouTube video error:", err);
    res.status(500).json({ error: "Failed to save YouTube video." });
  }
});
app.patch("/api/admin/videos/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid video ID." });
      return;
    }
    const existing = db.prepare("SELECT * FROM youtube_videos WHERE id = ?").get(id);
    if (!existing) {
      res.status(404).json({ error: "YouTube video not found." });
      return;
    }
    let nextUrl = existing.youtube_url;
    let nextVideoId = existing.video_id;
    if (req.body.youtubeUrl !== void 0) {
      const parsed = extractYouTubeVideoId(req.body.youtubeUrl);
      if (!parsed) {
        res.status(400).json({
          error: "Please enter a valid YouTube video URL (youtube.com/watch?v=... or youtu.be/...)."
        });
        return;
      }
      nextUrl = parsed.normalizedUrl;
      nextVideoId = parsed.videoId;
    }
    const nextTitle = req.body.title !== void 0 ? (typeof req.body.title === "string" && req.body.title.trim() ? req.body.title.trim() : "FREE FIRE TOURNAMENT 09 Highlights").slice(0, 120) : existing.title;
    const nextFeatured = req.body.isFeatured !== void 0 ? req.body.isFeatured ? 1 : 0 : existing.is_featured;
    db.transaction(() => {
      if (nextFeatured === 1) {
        db.prepare("UPDATE youtube_videos SET is_featured = 0 WHERE id != ?").run(id);
      }
      db.prepare(
        `UPDATE youtube_videos
         SET title = ?, youtube_url = ?, video_id = ?, is_featured = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(nextTitle, nextUrl, nextVideoId, nextFeatured, id);
    }).immediate();
    const updated = db.prepare("SELECT id, title, youtube_url, video_id, is_featured, created_at, updated_at FROM youtube_videos WHERE id = ?").get(id);
    const videos = db.prepare("SELECT id, title, youtube_url, video_id, is_featured, created_at, updated_at FROM youtube_videos ORDER BY is_featured DESC, id DESC").all();
    res.json({ video: updated, videos });
  } catch (err) {
    console.error("Update YouTube video error:", err);
    res.status(500).json({ error: "Failed to update YouTube video." });
  }
});
app.delete("/api/admin/videos/:id", requireAuth, requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid video ID." });
      return;
    }
    const deleted = db.transaction(() => {
      const existing = db.prepare("SELECT id, is_featured FROM youtube_videos WHERE id = ?").get(id);
      if (!existing) return false;
      db.prepare("DELETE FROM youtube_videos WHERE id = ?").run(id);
      if (existing.is_featured === 1) {
        const nextVideo = db.prepare("SELECT id FROM youtube_videos ORDER BY id DESC LIMIT 1").get();
        if (nextVideo) {
          db.prepare("UPDATE youtube_videos SET is_featured = 1 WHERE id = ?").run(nextVideo.id);
        }
      }
      return true;
    }).immediate();
    if (!deleted) {
      res.status(404).json({ error: "YouTube video not found." });
      return;
    }
    const videos = db.prepare("SELECT id, title, youtube_url, video_id, is_featured, created_at, updated_at FROM youtube_videos ORDER BY is_featured DESC, id DESC").all();
    res.json({ ok: true, videos });
  } catch (err) {
    console.error("Delete YouTube video error:", err);
    res.status(500).json({ error: "Failed to delete YouTube video." });
  }
});
async function startServer() {
  const PORT = Number(process.env.PORT) || 3e3;
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path2.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path2.join(distDir, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Pro Tournament server listening on http://0.0.0.0:${PORT}`);
  });
}
startServer();

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'rewardzone.db');
const db = new Database(dbPath);

// Enable WAL (Write-Ahead Logging) for superior concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  // 1. Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      referral_code TEXT UNIQUE NOT NULL,
      referred_by INTEGER,
      balance_coins INTEGER DEFAULT 0,
      total_earned INTEGER DEFAULT 0,
      country_code TEXT DEFAULT '+1',
      phone_number TEXT,
      total_watch_seconds INTEGER DEFAULT 0,
      ip_address TEXT,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Auto-migration for existing users table
  try {
    const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    if (!userCols.includes('country_code')) {
      db.exec('ALTER TABLE users ADD COLUMN country_code TEXT DEFAULT "+1"');
    }
    if (!userCols.includes('phone_number')) {
      db.exec('ALTER TABLE users ADD COLUMN phone_number TEXT');
    }
    if (!userCols.includes('total_watch_seconds')) {
      db.exec('ALTER TABLE users ADD COLUMN total_watch_seconds INTEGER DEFAULT 0');
    }
  } catch (err) {
    console.warn('[Database Migration Warning]', err.message);
  }

  // 2. Video Tasks Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS video_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      youtube_embed_url TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      reward_coins INTEGER NOT NULL,
      ad_direct_link TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Task Sessions Table (Anti-cheat verification)
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      session_token TEXT UNIQUE NOT NULL,
      start_time INTEGER NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES video_tasks(id) ON DELETE CASCADE
    );
  `);

  // 4. Completed Tasks Table (Audit log, deduplication, S2S tracking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS completed_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_type TEXT NOT NULL,
      task_id INTEGER,
      external_tx_id TEXT UNIQUE,
      reward_coins INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 5. Withdrawals Table (Supports Crypto, EcoCash, Visa Card)
  db.exec(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount_coins INTEGER NOT NULL,
      amount_usd REAL NOT NULL,
      payout_method TEXT NOT NULL DEFAULT 'CRYPTO',
      crypto_network TEXT,
      wallet_address TEXT NOT NULL,
      account_details TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Auto-migration for existing withdrawals table
  try {
    const wCols = db.prepare('PRAGMA table_info(withdrawals)').all().map(c => c.name);
    if (!wCols.includes('payout_method')) {
      db.exec('ALTER TABLE withdrawals ADD COLUMN payout_method TEXT NOT NULL DEFAULT "CRYPTO"');
    }
    if (!wCols.includes('account_details')) {
      db.exec('ALTER TABLE withdrawals ADD COLUMN account_details TEXT');
    }
  } catch (err) {
    console.warn('[Database Migration Warning]', err.message);
  }

  // Indices for rapid query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_referral ON users(referral_code);
    CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
    CREATE INDEX IF NOT EXISTS idx_task_sessions_token ON task_sessions(session_token);
    CREATE INDEX IF NOT EXISTS idx_task_sessions_user_task ON task_sessions(user_id, task_id);
    CREATE INDEX IF NOT EXISTS idx_completed_tasks_user ON completed_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_completed_tasks_tx ON completed_tasks(external_tx_id);
    CREATE INDEX IF NOT EXISTS idx_completed_tasks_user_type ON completed_tasks(user_id, task_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
  `);

  seedData();
}

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function seedData() {
  // 1. Seed Video Tasks if empty
  const videoCount = db.prepare('SELECT COUNT(*) AS count FROM video_tasks').get().count;
  if (videoCount === 0) {
    const insertVideo = db.prepare(`
      INSERT INTO video_tasks (title, youtube_embed_url, duration_seconds, reward_coins, ad_direct_link)
      VALUES (?, ?, ?, ?, ?)
    `);

    const sampleVideos = [
      {
        title: 'Bitcoin Fundamentals: How Decentralized Money Works',
        url: 'https://www.youtube.com/embed/bBC-nXj3Ng4',
        duration: 30,
        reward: 50,
        adLink: 'https://example.com/sponsor/crypto-exchange'
      },
      {
        title: 'Ethereum & Smart Contracts: The World Computer Explained',
        url: 'https://www.youtube.com/embed/ZE2HxTmxfrI',
        duration: 45,
        reward: 80,
        adLink: 'https://example.com/sponsor/web3-wallet'
      },
      {
        title: 'Crypto Security 101: Hardware Wallets & Phishing Defense',
        url: 'https://www.youtube.com/embed/1YyAzVmP9xQ',
        duration: 60,
        reward: 120,
        adLink: 'https://example.com/sponsor/vpn-deal'
      },
      {
        title: 'DeFi Mastery: Liquidity Pools & Automated Market Makers',
        url: 'https://www.youtube.com/embed/17QRFlml4pA',
        duration: 30,
        reward: 60,
        adLink: 'https://example.com/sponsor/defi-aggregator'
      }
    ];

    const insertMany = db.transaction((videos) => {
      for (const v of videos) {
        insertVideo.run(v.title, v.url, v.duration, v.reward, v.adLink);
      }
    });

    insertMany(sampleVideos);
    console.log('[Database] Seeded 4 sample video tasks successfully.');
  }

  // 2. Seed Admin User or synchronize with process.env.ADMIN_PASSWORD
  const adminPassword = process.env.ADMIN_PASSWORD || 'Adm!WQHtCHWcmlOdaPa1#9xZ';
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(adminPassword, salt);

  const adminExists = db.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
  if (!adminExists) {
    db.prepare(`
      INSERT INTO users (username, email, password_hash, referral_code, balance_coins, total_earned, country_code, phone_number, is_admin)
      VALUES (?, ?, ?, ?, ?, ?, '+1', '5550199', 1)
    `).run('admin', 'admin@rewardzone.local', hash, 'ADMIN1', 50000, 50000);
    console.log('[Database] Seeded secure administrator account.');
  } else {
    // Keep existing admin password synchronized with environment variable
    db.prepare('UPDATE users SET password_hash = ? WHERE is_admin = 1').run(hash);
    console.log('[Database] Synchronized admin password hash with environment configuration.');
  }

  // 3. Seed Demo User only in non-production environments if absent
  if (process.env.NODE_ENV !== 'production') {
    const demoExists = db.prepare('SELECT id FROM users WHERE username = ?').get('demouser');
    if (!demoExists) {
      const demoSalt = bcrypt.genSaltSync(10);
      const demoHash = bcrypt.hashSync('DemoUser123!', demoSalt);
      const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
      db.prepare(`
        INSERT INTO users (username, email, password_hash, referral_code, referred_by, balance_coins, total_earned, country_code, phone_number, is_admin)
        VALUES (?, ?, ?, ?, ?, ?, ?, '+263', '771234567', 0)
      `).run('demouser', 'demo@rewardzone.local', demoHash, 'DEMO99', adminUser ? adminUser.id : null, 1500, 1500);
      console.log('[Database] Seeded dev demo user: demouser');
    }
  }
}

// Transaction helper for executing multi-statement operations safely
function runTransaction(fn) {
  const transaction = db.transaction(fn);
  return transaction();
}

module.exports = {
  db,
  initDatabase,
  generateReferralCode,
  runTransaction
};

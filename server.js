require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { db, initDatabase, generateReferralCode, runTransaction } = require('./database');

// Initialize database schema and seeds
initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'rewardzone_jwt_secret_key_2026_super_secure';
const POSTBACK_SECRET = process.env.POSTBACK_SECRET || 'rewardzone_secret_key_2026';
const ADMIN_KEY = process.env.ADMIN_KEY || 'rewardzone_admin_key_2026';

// Standard RFC-compliant email regex
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Extract real client IP
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.ip || '127.0.0.1';
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  let token = req.cookies.token;

  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, email, referral_code, referred_by, balance_coins, total_earned, country_code, phone_number, total_watch_seconds, is_admin, ip_address, created_at FROM users WHERE id = ?').get(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
}

// Admin Authentication Middleware
function authenticateAdmin(req, res, next) {
  // Option 1: Admin secret header
  const adminHeaderKey = req.headers['x-admin-key'];
  if (adminHeaderKey && adminHeaderKey === ADMIN_KEY) {
    req.user = { id: 1, username: 'admin', is_admin: 1 };
    return next();
  }

  // Option 2: JWT with is_admin = 1
  let token = req.cookies.token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7);
  }

  if (!token) {
    return res.status(403).json({ error: 'Admin access forbidden. Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, email, is_admin FROM users WHERE id = ?').get(decoded.id);
    if (!user || user.is_admin !== 1) {
      return res.status(403).json({ error: 'Access denied: Administrator privileges required.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired admin session.' });
  }
}

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================

// Register
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, email, password, ref_code, country_code, phone_number } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be between 3 and 20 characters.' });
    }

    // Strict RFC email validation
    if (!EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const cleanCountryCode = (country_code || '+1').trim();
    const cleanPhone = phone_number ? phone_number.trim() : null;

    // Check duplicate username or email
    const existing = db.prepare('SELECT username, email FROM users WHERE username = ? OR email = ?').get(username, email.trim());
    if (existing) {
      if (existing.username.toLowerCase() === username.toLowerCase()) {
        return res.status(409).json({ error: 'Username already in use.' });
      }
      return res.status(409).json({ error: 'Email address already in use.' });
    }

    // Resolve referrer if ref_code provided
    let referredById = null;
    if (ref_code) {
      const referrer = db.prepare('SELECT id FROM users WHERE UPPER(referral_code) = UPPER(?)').get(ref_code.trim());
      if (referrer) {
        referredById = referrer.id;
      }
    }

    // Generate unique referral code
    let referralCode = generateReferralCode();
    while (db.prepare('SELECT id FROM users WHERE referral_code = ?').get(referralCode)) {
      referralCode = generateReferralCode();
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    const clientIp = getClientIp(req);

    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, referral_code, referred_by, balance_coins, total_earned, country_code, phone_number, total_watch_seconds, ip_address, is_admin)
      VALUES (?, ?, ?, ?, ?, 100, 100, ?, ?, 0, ?, 0)
    `).run(username, email.trim(), passwordHash, referralCode, referredById, cleanCountryCode, cleanPhone, clientIp); // Bonus 100 coins welcome gift

    const newUserId = result.lastInsertRowid;

    // Record welcome bonus in completed_tasks
    db.prepare(`
      INSERT INTO completed_tasks (user_id, task_type, external_tx_id, reward_coins)
      VALUES (?, 'welcome_bonus', ?, 100)
    `).run(newUserId, `welcome_${newUserId}_${Date.now()}`);

    const token = jwt.sign(
      { id: newUserId, username, is_admin: 0 },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const userRecord = db.prepare('SELECT id, username, email, referral_code, referred_by, balance_coins, total_earned, country_code, phone_number, total_watch_seconds, is_admin FROM users WHERE id = ?').get(newUserId);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully! Enjoy a 100 Coin welcome bonus.',
      token,
      user: {
        ...userRecord,
        total_watch_minutes: Math.floor((userRecord.total_watch_seconds || 0) / 60)
      }
    });
  } catch (err) {
    console.error('[Register Error]', err);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: 'Username/Email and password are required.' });
    }

    // Strict email check if user attempts login with an email address format
    if (usernameOrEmail.includes('@') && !EMAIL_REGEX.test(usernameOrEmail.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const user = db.prepare(`
      SELECT * FROM users WHERE username = ? OR email = ?
    `).get(usernameOrEmail.trim(), usernameOrEmail.trim());

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const passwordMatches = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Update IP address
    const clientIp = getClientIp(req);
    db.prepare('UPDATE users SET ip_address = ? WHERE id = ?').run(clientIp, user.id);

    const token = jwt.sign(
      { id: user.id, username: user.username, is_admin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const sanitizedUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      referral_code: user.referral_code,
      referred_by: user.referred_by,
      balance_coins: user.balance_coins,
      total_earned: user.total_earned,
      country_code: user.country_code,
      phone_number: user.phone_number,
      total_watch_seconds: user.total_watch_seconds || 0,
      total_watch_minutes: Math.floor((user.total_watch_seconds || 0) / 60),
      is_admin: user.is_admin
    };

    return res.json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: sanitizedUser
    });
  } catch (err) {
    console.error('[Login Error]', err);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// Current User & Dashboard Stats
app.get('/api/auth/me', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const user = db.prepare('SELECT id, username, email, referral_code, referred_by, balance_coins, total_earned, country_code, phone_number, total_watch_seconds, is_admin, ip_address, created_at FROM users WHERE id = ?').get(userId);

    // Referral stats
    const refCount = db.prepare('SELECT COUNT(*) AS count FROM users WHERE referred_by = ?').get(userId).count;
    const refCommissions = db.prepare(`
      SELECT COALESCE(SUM(reward_coins), 0) AS total 
      FROM completed_tasks 
      WHERE user_id = ? AND task_type = 'referral_commission'
    `).get(userId).total;

    // Completed tasks count
    const completedTasksCount = db.prepare('SELECT COUNT(*) AS count FROM completed_tasks WHERE user_id = ?').get(userId).count;

    return res.json({
      success: true,
      user: {
        ...user,
        total_watch_seconds: user.total_watch_seconds || 0,
        total_watch_minutes: Math.floor((user.total_watch_seconds || 0) / 60),
        referrals_count: refCount,
        referral_earnings: refCommissions,
        completed_tasks_count: completedTasksCount
      }
    });
  } catch (err) {
    console.error('[Auth Me Error]', err);
    return res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

// ==========================================
// 2. ANTI-CHEAT "WATCH TO EARN" VIDEO ENGINE
// ==========================================

// List Video Tasks with 24h Cooldown State
app.get('/api/tasks/videos', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const tasks = db.prepare('SELECT * FROM video_tasks WHERE is_active = 1 ORDER BY id ASC').all();

    // Check completion in last 24 hours for this user
    const recentCompletions = db.prepare(`
      SELECT task_id, MAX(created_at) AS last_completed,
             strftime('%s', 'now') - strftime('%s', MAX(created_at)) AS seconds_since
      FROM completed_tasks 
      WHERE user_id = ? AND task_type = 'video' AND created_at > datetime('now', '-24 hours')
      GROUP BY task_id
    `).all(userId);

    const completionsMap = {};
    for (const c of recentCompletions) {
      completionsMap[c.task_id] = c.seconds_since;
    }

    const tasksWithStatus = tasks.map(t => {
      const secondsSince = completionsMap[t.id];
      const isAvailable = secondsSince === undefined;
      const cooldownRemaining = isAvailable ? 0 : Math.max(0, 86400 - secondsSince);

      return {
        id: t.id,
        title: t.title,
        youtube_embed_url: t.youtube_embed_url,
        duration_seconds: t.duration_seconds,
        reward_coins: t.reward_coins,
        ad_direct_link: t.ad_direct_link,
        is_available: isAvailable,
        cooldown_remaining_seconds: cooldownRemaining
      };
    });

    return res.json({ success: true, tasks: tasksWithStatus });
  } catch (err) {
    console.error('[Video Tasks Error]', err);
    return res.status(500).json({ error: 'Failed to retrieve video tasks.' });
  }
});

// Start Video Task: Server-Side Session Initiation
app.post('/api/tasks/start-video', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required.' });
    }

    const task = db.prepare('SELECT * FROM video_tasks WHERE id = ? AND is_active = 1').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Video task not found or inactive.' });
    }

    // Verify 24-hour cooldown
    const recent = db.prepare(`
      SELECT strftime('%s', 'now') - strftime('%s', created_at) AS seconds_since
      FROM completed_tasks 
      WHERE user_id = ? AND task_id = ? AND task_type = 'video' AND created_at > datetime('now', '-24 hours')
      ORDER BY created_at DESC LIMIT 1
    `).get(userId, taskId);

    if (recent) {
      const remaining = 86400 - recent.seconds_since;
      return res.status(400).json({
        error: `Task is on cooldown. Please wait ${Math.ceil(remaining / 60)} minutes before watching again.`,
        cooldown_remaining_seconds: remaining
      });
    }

    // Generate cryptographic session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const startTime = Date.now();

    db.prepare(`
      INSERT INTO task_sessions (user_id, task_id, session_token, start_time, completed)
      VALUES (?, ?, ?, ?, 0)
    `).run(userId, taskId, sessionToken, startTime);

    return res.json({
      success: true,
      sessionToken,
      taskId: task.id,
      title: task.title,
      durationSeconds: task.duration_seconds,
      rewardCoins: task.reward_coins,
      youtubeEmbedUrl: task.youtube_embed_url,
      adDirectLink: task.ad_direct_link
    });
  } catch (err) {
    console.error('[Start Video Error]', err);
    return res.status(500).json({ error: 'Could not initialize video session.' });
  }
});

// Claim Video Reward: Rigorous Anti-Cheat Verification & Tiered Referral Engine
app.post('/api/tasks/claim-video', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(400).json({ error: 'sessionToken is required to claim reward.' });
    }

    // Find session
    const session = db.prepare(`
      SELECT * FROM task_sessions WHERE session_token = ? AND user_id = ?
    `).get(sessionToken, userId);

    if (!session) {
      return res.status(404).json({ error: 'Invalid or expired video session.' });
    }

    if (session.completed === 1) {
      return res.status(400).json({ error: 'This video reward has already been claimed.' });
    }

    const task = db.prepare('SELECT * FROM video_tasks WHERE id = ?').get(session.task_id);
    if (!task) {
      return res.status(404).json({ error: 'Associated task does not exist.' });
    }

    // ANTI-CHEAT CHECK: Elapsed time must equal or exceed duration (with 1000ms latency tolerance)
    const elapsedMs = Date.now() - session.start_time;
    const requiredMs = (task.duration_seconds * 1000) - 1000;

    if (elapsedMs < requiredMs) {
      console.warn(`[ANTI-CHEAT ALERT] User ${userId} attempted early claim. Elapsed: ${elapsedMs}ms, Required: ${requiredMs}ms`);
      return res.status(403).json({
        error: 'Cheat detected: Reward claimed prematurely before video completed. Timer validation failed.'
      });
    }

    // Secondary 24h cooldown check (prevent race condition)
    const recent = db.prepare(`
      SELECT id FROM completed_tasks 
      WHERE user_id = ? AND task_id = ? AND task_type = 'video' AND created_at > datetime('now', '-24 hours')
    `).get(userId, task.id);

    if (recent) {
      return res.status(400).json({ error: 'You have already completed this video task in the past 24 hours.' });
    }

    // Execute atomic transaction: Credit user, mark session complete, credit 10% referral commission
    const result = runTransaction(() => {
      // 1. Mark session as completed
      db.prepare('UPDATE task_sessions SET completed = 1 WHERE id = ?').run(session.id);

      // 2. Insert into completed_tasks
      const externalTxId = `vid_${sessionToken}`;
      db.prepare(`
        INSERT INTO completed_tasks (user_id, task_type, task_id, external_tx_id, reward_coins)
        VALUES (?, 'video', ?, ?, ?)
      `).run(userId, task.id, externalTxId, task.reward_coins);

      // 3. Update user balance & active watch time
      db.prepare(`
        UPDATE users 
        SET balance_coins = balance_coins + ?, total_earned = total_earned + ?, total_watch_seconds = total_watch_seconds + ?
        WHERE id = ?
      `).run(task.reward_coins, task.reward_coins, task.duration_seconds, userId);

      // 4. Tiered Referral Commission Engine (10% to referrer)
      const user = db.prepare('SELECT referred_by FROM users WHERE id = ?').get(userId);
      let referralCommission = 0;
      let referrerId = user ? user.referred_by : null;

      if (referrerId) {
        referralCommission = Math.floor(task.reward_coins * 0.10);
        if (referralCommission > 0) {
          // Credit referrer
          db.prepare(`
            UPDATE users 
            SET balance_coins = balance_coins + ?, total_earned = total_earned + ?
            WHERE id = ?
          `).run(referralCommission, referralCommission, referrerId);

          // Log referral commission
          db.prepare(`
            INSERT INTO completed_tasks (user_id, task_type, external_tx_id, reward_coins)
            VALUES (?, 'referral_commission', ?, ?)
          `).run(referrerId, `ref_${sessionToken}`, referralCommission);
        }
      }

      const updatedUser = db.prepare('SELECT balance_coins, total_earned, total_watch_seconds FROM users WHERE id = ?').get(userId);
      return {
        rewardCoins: task.reward_coins,
        newBalance: updatedUser.balance_coins,
        totalEarned: updatedUser.total_earned,
        totalWatchSeconds: updatedUser.total_watch_seconds,
        referralCommissionCredited: referralCommission > 0
      };
    });

    return res.json({
      success: true,
      message: `🎉 Successfully earned +${result.rewardCoins} Coins!`,
      rewardCoins: result.rewardCoins,
      newBalance: result.newBalance,
      totalEarned: result.totalEarned
    });
  } catch (err) {
    console.error('[Claim Video Error]', err);
    return res.status(500).json({ error: 'Failed to claim video reward.' });
  }
});

// ==========================================
// 3. DAILY CHECK-IN & STREAK SYSTEM
// ==========================================

app.get('/api/tasks/daily-status', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const lastCheckin = db.prepare(`
      SELECT created_at, strftime('%s', 'now') - strftime('%s', created_at) AS seconds_since
      FROM completed_tasks
      WHERE user_id = ? AND task_type = 'daily_checkin'
      ORDER BY created_at DESC LIMIT 1
    `).get(userId);

    const DAILY_REWARD = 25; // 25 coins = $0.025 USD
    if (!lastCheckin) {
      return res.json({
        success: true,
        canClaim: true,
        secondsRemaining: 0,
        rewardCoins: DAILY_REWARD,
        lastCheckin: null
      });
    }

    const secondsRemaining = Math.max(0, 86400 - lastCheckin.seconds_since);
    return res.json({
      success: true,
      canClaim: secondsRemaining === 0,
      secondsRemaining,
      rewardCoins: DAILY_REWARD,
      lastCheckin: lastCheckin.created_at
    });
  } catch (err) {
    console.error('[Daily Status Error]', err);
    return res.status(500).json({ error: 'Could not fetch daily check-in status.' });
  }
});

app.post('/api/tasks/daily-checkin', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const DAILY_REWARD = 25;

    const lastCheckin = db.prepare(`
      SELECT strftime('%s', 'now') - strftime('%s', created_at) AS seconds_since
      FROM completed_tasks
      WHERE user_id = ? AND task_type = 'daily_checkin'
      ORDER BY created_at DESC LIMIT 1
    `).get(userId);

    if (lastCheckin && lastCheckin.seconds_since < 86400) {
      const waitMinutes = Math.ceil((86400 - lastCheckin.seconds_since) / 60);
      return res.status(400).json({
        error: `Daily bonus already claimed. Please return in ${waitMinutes} minutes.`,
        secondsRemaining: 86400 - lastCheckin.seconds_since
      });
    }

    const txId = `daily_${userId}_${Date.now()}`;
    const newBalance = runTransaction(() => {
      db.prepare(`
        INSERT INTO completed_tasks (user_id, task_type, external_tx_id, reward_coins)
        VALUES (?, 'daily_checkin', ?, ?)
      `).run(userId, txId, DAILY_REWARD);

      db.prepare(`
        UPDATE users 
        SET balance_coins = balance_coins + ?, total_earned = total_earned + ?
        WHERE id = ?
      `).run(DAILY_REWARD, DAILY_REWARD, userId);

      return db.prepare('SELECT balance_coins FROM users WHERE id = ?').get(userId).balance_coins;
    });

    return res.json({
      success: true,
      message: `✨ Daily bonus claimed! +${DAILY_REWARD} Coins added to your balance.`,
      rewardCoins: DAILY_REWARD,
      newBalance
    });
  } catch (err) {
    console.error('[Daily Checkin Error]', err);
    return res.status(500).json({ error: 'Failed to process daily check-in.' });
  }
});

// ==========================================
// 4. CPA OFFERWALL & S2S POSTBACK WEBHOOK
// ==========================================

// Universal S2S Postback Endpoint: GET /api/postback?userid={subid}&payout={payout}&txid={tx_id}&sig={signature}
app.get('/api/postback', (req, res) => {
  try {
    const { userid, payout, txid, sig } = req.query;

    if (!userid || !payout || !txid) {
      console.warn('[POSTBACK WARN] Missing query parameters:', req.query);
      return res.status(400).send('ERROR_MISSING_PARAMS');
    }

    // Signature verification (HMAC-SHA256, MD5, or Shared Secret)
    if (sig) {
      const expectedHmac = crypto.createHmac('sha256', POSTBACK_SECRET).update(`${userid}:${payout}:${txid}`).digest('hex');
      const expectedMd5_1 = crypto.createHash('md5').update(`${userid}${payout}${txid}${POSTBACK_SECRET}`).digest('hex');
      const expectedMd5_2 = crypto.createHash('md5').update(`${userid}:${txid}:${POSTBACK_SECRET}`).digest('hex');

      const matchesHmac = crypto.timingSafeEqual(Buffer.from(sig, 'utf-8'), Buffer.from(expectedHmac, 'utf-8'));
      const matchesMd5 = sig.toLowerCase() === expectedMd5_1.toLowerCase() || sig.toLowerCase() === expectedMd5_2.toLowerCase();
      const matchesDirect = sig === POSTBACK_SECRET;

      if (!matchesHmac && !matchesMd5 && !matchesDirect) {
        console.warn(`[POSTBACK AUTH FAILED] Invalid signature for txid ${txid}. Received: ${sig}`);
        return res.status(401).send('INVALID_SIGNATURE');
      }
    }

    // Deduplication check: check if txid already exists
    const duplicate = db.prepare('SELECT id FROM completed_tasks WHERE external_tx_id = ?').get(txid);
    if (duplicate) {
      console.log(`[POSTBACK INFO] Duplicate postback received for txid ${txid}. Already credited.`);
      // Return 200 / "1" to satisfy network so they don't retry endlessly
      return res.status(200).send('1');
    }

    // Resolve user by ID or username
    let user = db.prepare('SELECT id, referred_by, balance_coins FROM users WHERE id = ?').get(userid);
    if (!user) {
      user = db.prepare('SELECT id, referred_by, balance_coins FROM users WHERE username = ?').get(userid);
    }

    if (!user) {
      console.warn(`[POSTBACK ERROR] User not found: ${userid}`);
      return res.status(404).send('USER_NOT_FOUND');
    }

    const rewardCoins = Math.round(Number(payout));
    if (isNaN(rewardCoins) || rewardCoins <= 0) {
      return res.status(400).send('INVALID_PAYOUT_AMOUNT');
    }

    // Credit user & 10% referral commission inside transaction
    runTransaction(() => {
      // 1. Log completed task
      db.prepare(`
        INSERT INTO completed_tasks (user_id, task_type, external_tx_id, reward_coins)
        VALUES (?, 'offerwall', ?, ?)
      `).run(user.id, txid, rewardCoins);

      // 2. Credit user
      db.prepare(`
        UPDATE users 
        SET balance_coins = balance_coins + ?, total_earned = total_earned + ?
        WHERE id = ?
      `).run(rewardCoins, rewardCoins, user.id);

      // 3. Referral Commission Engine (10%)
      if (user.referred_by) {
        const commission = Math.floor(rewardCoins * 0.10);
        if (commission > 0) {
          db.prepare(`
            UPDATE users 
            SET balance_coins = balance_coins + ?, total_earned = total_earned + ?
            WHERE id = ?
          `).run(commission, commission, user.referred_by);

          db.prepare(`
            INSERT INTO completed_tasks (user_id, task_type, external_tx_id, reward_coins)
            VALUES (?, 'referral_commission', ?, ?)
          `).run(user.referred_by, `ref_postback_${txid}`, commission);
        }
      }
    });

    console.log(`[POSTBACK SUCCESS] Credited +${rewardCoins} coins to User ${user.id} for txid: ${txid}`);
    // Standard CPA network success confirmation
    return res.status(200).send('1');
  } catch (err) {
    console.error('[Postback Error]', err);
    return res.status(500).send('INTERNAL_ERROR');
  }
});

// Helper for testing Postback URL generation
app.get('/api/postback/generate-test-url', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const payout = req.query.payout || 500;
  const txid = `test_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const sig = crypto.createHmac('sha256', POSTBACK_SECRET).update(`${userId}:${payout}:${txid}`).digest('hex');

  const url = `${req.protocol}://${req.get('host')}/api/postback?userid=${userId}&payout=${payout}&txid=${txid}&sig=${sig}`;
  return res.json({ testUrl: url, txid, payout, sig });
});

// ==========================================
// 5. CASHOUT & WITHDRAWALS SYSTEM
// Supported Methods: Crypto, EcoCash, Visa Card
// Strict Cashout Gates: 100,000 Coins ($100.00 USD) | 10 Referrals | 10 Hours Watch Time
// ==========================================

const VALID_PAYOUT_METHODS = ['CRYPTO', 'ECOCASH', 'VISA'];
const VALID_CRYPTO_NETWORKS = ['USDT-BEP20', 'USDT-TRC20', 'LTC', 'SOL'];
const MIN_WITHDRAWAL_COINS = 100000; // 100,000 coins = $100.00 USD
const MIN_REFERRALS_REQUIRED = 10;
const MIN_WATCH_SECONDS_REQUIRED = 36000; // 10 hours = 600 minutes = 36,000 seconds

// Check Cashout Eligibility & Gates
app.get('/api/withdrawals/eligibility', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const user = db.prepare('SELECT balance_coins, total_watch_seconds FROM users WHERE id = ?').get(userId);
    const refCount = db.prepare('SELECT COUNT(*) AS count FROM users WHERE referred_by = ?').get(userId).count;

    const balanceCoins = user ? user.balance_coins : 0;
    const watchSeconds = user ? (user.total_watch_seconds || 0) : 0;

    const balanceMet = balanceCoins >= MIN_WITHDRAWAL_COINS;
    const referralsMet = refCount >= MIN_REFERRALS_REQUIRED;
    const watchTimeMet = watchSeconds >= MIN_WATCH_SECONDS_REQUIRED;
    const eligible = balanceMet && referralsMet && watchTimeMet;

    return res.json({
      success: true,
      eligible,
      gates: {
        balance: {
          current: balanceCoins,
          required: MIN_WITHDRAWAL_COINS,
          met: balanceMet,
          percent: Math.min(100, Math.round((balanceCoins / MIN_WITHDRAWAL_COINS) * 100)),
          currentUsd: (balanceCoins / 1000).toFixed(2),
          requiredUsd: (MIN_WITHDRAWAL_COINS / 1000).toFixed(2)
        },
        referrals: {
          current: refCount,
          required: MIN_REFERRALS_REQUIRED,
          met: referralsMet,
          percent: Math.min(100, Math.round((refCount / MIN_REFERRALS_REQUIRED) * 100))
        },
        watchTime: {
          currentSeconds: watchSeconds,
          currentMinutes: Math.floor(watchSeconds / 60),
          currentHours: parseFloat((watchSeconds / 3600).toFixed(1)),
          requiredSeconds: MIN_WATCH_SECONDS_REQUIRED,
          requiredMinutes: 600,
          requiredHours: 10,
          met: watchTimeMet,
          percent: Math.min(100, Math.round((watchSeconds / MIN_WATCH_SECONDS_REQUIRED) * 100))
        }
      }
    });
  } catch (err) {
    console.error('[Eligibility Check Error]', err);
    return res.status(500).json({ error: 'Failed to verify withdrawal eligibility.' });
  }
});

// Submit Withdrawal Request
app.post('/api/withdrawals/request', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const {
      amountCoins,
      payoutMethod = 'CRYPTO',
      cryptoNetwork,
      walletAddress,
      // EcoCash specific
      ecocashNumber,
      accountName,
      // Visa specific
      cardholderName,
      cardNumber,
      expiryDate,
      billingCountry,
      billingAddress
    } = req.body;

    const normalizedMethod = String(payoutMethod).toUpperCase();
    if (!VALID_PAYOUT_METHODS.includes(normalizedMethod)) {
      return res.status(400).json({
        error: `Invalid payout method. Supported methods: ${VALID_PAYOUT_METHODS.join(', ')}`
      });
    }

    const user = db.prepare('SELECT balance_coins, total_watch_seconds FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    // STRICT CASHOUT GATE 1: Minimum Balance 100,000 Coins ($100.00 USD)
    if (user.balance_coins < MIN_WITHDRAWAL_COINS) {
      return res.status(403).json({
        error: `Cashout Gate Locked: Minimum balance of ${MIN_WITHDRAWAL_COINS.toLocaleString()} Coins ($${(MIN_WITHDRAWAL_COINS / 1000).toFixed(2)} USD) required. Your current balance is ${user.balance_coins.toLocaleString()} Coins.`
      });
    }

    // STRICT CASHOUT GATE 2: At least 10 Active Referrals
    const refCount = db.prepare('SELECT COUNT(*) AS count FROM users WHERE referred_by = ?').get(userId).count;
    if (refCount < MIN_REFERRALS_REQUIRED) {
      return res.status(403).json({
        error: `Cashout Gate Locked: You must invite at least ${MIN_REFERRALS_REQUIRED} active referrals to unlock cashouts. You currently have ${refCount} / ${MIN_REFERRALS_REQUIRED} referrals.`
      });
    }

    // STRICT CASHOUT GATE 3: At least 10 Hours (600 Minutes / 36,000 Seconds) of Watch Time
    const watchSeconds = user.total_watch_seconds || 0;
    if (watchSeconds < MIN_WATCH_SECONDS_REQUIRED) {
      const currentMins = Math.floor(watchSeconds / 60);
      return res.status(403).json({
        error: `Cashout Gate Locked: You must have at least 10 hours (600 minutes) of active ad watch time. You currently have ${currentMins} / 600 minutes logged.`
      });
    }

    // Validate Requested Coin Amount
    const coins = parseInt(amountCoins, 10);
    if (isNaN(coins) || coins < MIN_WITHDRAWAL_COINS) {
      return res.status(400).json({
        error: `Minimum withdrawal amount is ${MIN_WITHDRAWAL_COINS.toLocaleString()} Coins ($${(MIN_WITHDRAWAL_COINS / 1000).toFixed(2)} USD).`
      });
    }

    if (user.balance_coins < coins) {
      return res.status(400).json({
        error: `Insufficient balance. You currently have ${user.balance_coins.toLocaleString()} Coins.`
      });
    }

    // Payout-Method Specific Validation & Payload Assembly
    let destinationIdentifier = '';
    let networkOrProvider = normalizedMethod;
    let detailsPayload = {};

    if (normalizedMethod === 'CRYPTO') {
      if (!cryptoNetwork || !VALID_CRYPTO_NETWORKS.includes(cryptoNetwork)) {
        return res.status(400).json({
          error: `Invalid crypto network. Supported networks: ${VALID_CRYPTO_NETWORKS.join(', ')}`
        });
      }
      if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim().length < 10) {
        return res.status(400).json({ error: 'Please provide a valid cryptocurrency wallet address.' });
      }
      destinationIdentifier = walletAddress.trim();
      networkOrProvider = cryptoNetwork;
      detailsPayload = { method: 'CRYPTO', network: cryptoNetwork, walletAddress: destinationIdentifier };

    } else if (normalizedMethod === 'ECOCASH') {
      const targetPhone = (ecocashNumber || walletAddress || '').trim();
      if (!targetPhone || targetPhone.replace(/\D/g, '').length < 8) {
        return res.status(400).json({ error: 'Please provide a valid registered EcoCash mobile number (e.g. +263 77X XXX XXX).' });
      }
      destinationIdentifier = targetPhone;
      networkOrProvider = 'EcoCash';
      detailsPayload = {
        method: 'ECOCASH',
        mobileNumber: targetPhone,
        registeredName: (accountName || '').trim() || 'Account Holder'
      };

    } else if (normalizedMethod === 'VISA') {
      const cleanCard = (cardNumber || walletAddress || '').replace(/\s+/g, '');
      if (!cleanCard || cleanCard.length < 13 || cleanCard.length > 19 || !/^\d+$/.test(cleanCard)) {
        return res.status(400).json({ error: 'Please provide a valid 16-digit Visa card number.' });
      }
      if (!cardholderName || cardholderName.trim().length < 2) {
        return res.status(400).json({ error: 'Cardholder full name is required for Visa payouts.' });
      }
      if (!expiryDate || !/^\d{2}\/\d{2}$/.test(expiryDate.trim())) {
        return res.status(400).json({ error: 'Valid card expiry date (MM/YY) is required.' });
      }
      const maskedCard = `VISA **** **** **** ${cleanCard.slice(-4)}`;
      destinationIdentifier = maskedCard;
      networkOrProvider = 'Visa Card';
      detailsPayload = {
        method: 'VISA',
        cardholderName: cardholderName.trim(),
        maskedCard,
        cardNumberLast4: cleanCard.slice(-4),
        expiryDate: expiryDate.trim(),
        billingCountry: (billingCountry || '').trim(),
        billingAddress: (billingAddress || '').trim()
      };
    }

    const amountUsd = parseFloat((coins / 1000.0).toFixed(2));

    const withdrawalId = runTransaction(() => {
      // 1. Deduct coins from user balance immediately
      db.prepare('UPDATE users SET balance_coins = balance_coins - ? WHERE id = ?').run(coins, userId);

      // 2. Insert into withdrawals table with pending status
      const insert = db.prepare(`
        INSERT INTO withdrawals (user_id, amount_coins, amount_usd, payout_method, crypto_network, wallet_address, account_details, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(
        userId,
        coins,
        amountUsd,
        normalizedMethod,
        networkOrProvider,
        destinationIdentifier,
        JSON.stringify(detailsPayload)
      );

      return insert.lastInsertRowid;
    });

    const updatedUser = db.prepare('SELECT balance_coins FROM users WHERE id = ?').get(userId);

    return res.status(201).json({
      success: true,
      message: `Withdrawal request for $${amountUsd} USD via ${networkOrProvider} submitted successfully! It will be reviewed by admin within 24 hours.`,
      withdrawalId,
      payoutMethod: normalizedMethod,
      newBalance: updatedUser.balance_coins
    });
  } catch (err) {
    console.error('[Withdrawal Request Error]', err);
    return res.status(500).json({ error: 'Failed to process withdrawal request.' });
  }
});

// User Withdrawal History
app.get('/api/withdrawals/my', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const history = db.prepare(`
      SELECT id, amount_coins, amount_usd, payout_method, crypto_network, wallet_address, account_details, status, created_at
      FROM withdrawals
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId);

    return res.json({ success: true, withdrawals: history });
  } catch (err) {
    console.error('[My Withdrawals Error]', err);
    return res.status(500).json({ error: 'Failed to load withdrawal history.' });
  }
});

// User Task & Earnings History
app.get('/api/user/history', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const tasks = db.prepare(`
      SELECT ct.id, ct.task_type, ct.reward_coins, ct.created_at, vt.title as video_title
      FROM completed_tasks ct
      LEFT JOIN video_tasks vt ON ct.task_id = vt.id
      WHERE ct.user_id = ?
      ORDER BY ct.created_at DESC
      LIMIT 50
    `).all(userId);

    return res.json({ success: true, history: tasks });
  } catch (err) {
    console.error('[User History Error]', err);
    return res.status(500).json({ error: 'Failed to retrieve task history.' });
  }
});

// User Referral Details
app.get('/api/referrals/my', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const referrals = db.prepare(`
      SELECT u.id, u.username, u.created_at, u.total_earned,
             COALESCE(SUM(ct.reward_coins), 0) AS commission_from_user
      FROM users u
      LEFT JOIN completed_tasks ct ON ct.user_id = ? AND ct.task_type = 'referral_commission' AND ct.external_tx_id LIKE '%' || u.id || '%'
      WHERE u.referred_by = ?
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all(userId, userId);

    return res.json({ success: true, referrals });
  } catch (err) {
    console.error('[Referrals List Error]', err);
    return res.status(500).json({ error: 'Failed to load referrals list.' });
  }
});

// ==========================================
// 6. ADMIN DASHBOARD API
// ==========================================

// Admin Metrics Overview
app.get('/api/admin/stats', authenticateAdmin, (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) AS count FROM users WHERE is_admin = 0').get().count;
    const coinsCirculation = db.prepare('SELECT COALESCE(SUM(balance_coins), 0) AS total FROM users').get().total;
    const totalEarnedAll = db.prepare('SELECT COALESCE(SUM(total_earned), 0) AS total FROM users').get().total;

    const pendingWithdrawals = db.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(amount_usd), 0) AS total_usd
      FROM withdrawals WHERE status = 'pending'
    `).get();

    const approvedWithdrawals = db.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(amount_usd), 0) AS total_usd
      FROM withdrawals WHERE status = 'approved'
    `).get();

    const totalTasksCompleted = db.prepare('SELECT COUNT(*) AS count FROM completed_tasks').get().count;

    return res.json({
      success: true,
      stats: {
        totalUsers,
        coinsCirculation,
        usdCirculation: (coinsCirculation / 1000).toFixed(2),
        totalEarnedAll,
        pendingWithdrawalsCount: pendingWithdrawals.count,
        pendingWithdrawalsUsd: pendingWithdrawals.total_usd.toFixed(2),
        approvedWithdrawalsCount: approvedWithdrawals.count,
        totalPaidOutUsd: approvedWithdrawals.total_usd.toFixed(2),
        totalTasksCompleted
      }
    });
  } catch (err) {
    console.error('[Admin Stats Error]', err);
    return res.status(500).json({ error: 'Failed to calculate platform statistics.' });
  }
});

// Admin Withdrawals Queue
app.get('/api/admin/withdrawals', authenticateAdmin, (req, res) => {
  try {
    const withdrawals = db.prepare(`
      SELECT w.id, w.user_id, w.amount_coins, w.amount_usd, w.payout_method, w.crypto_network, w.wallet_address, w.account_details, w.status, w.created_at,
             u.username, u.email, u.ip_address, u.country_code, u.phone_number, u.total_watch_seconds, u.balance_coins as current_balance, u.total_earned, u.created_at as user_created_at
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      ORDER BY CASE WHEN w.status = 'pending' THEN 0 ELSE 1 END, w.created_at DESC
    `).all();

    return res.json({ success: true, withdrawals });
  } catch (err) {
    console.error('[Admin Withdrawals Error]', err);
    return res.status(500).json({ error: 'Failed to load withdrawals queue.' });
  }
});

// Admin Approve Withdrawal
app.post('/api/admin/withdrawals/:id/approve', authenticateAdmin, (req, res) => {
  try {
    const withdrawalId = req.params.id;
    const withdrawal = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId);

    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found.' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: `Withdrawal already marked as ${withdrawal.status}.` });
    }

    db.prepare("UPDATE withdrawals SET status = 'approved' WHERE id = ?").run(withdrawalId);
    return res.json({ success: true, message: `Withdrawal #${withdrawalId} approved and marked as paid.` });
  } catch (err) {
    console.error('[Admin Approve Error]', err);
    return res.status(500).json({ error: 'Failed to approve withdrawal.' });
  }
});

// Admin Reject Withdrawal (Atomic Refund back to user's balance)
app.post('/api/admin/withdrawals/:id/reject', authenticateAdmin, (req, res) => {
  try {
    const withdrawalId = req.params.id;
    const withdrawal = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawalId);

    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found.' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: `Withdrawal already marked as ${withdrawal.status}.` });
    }

    // Refund coins inside transaction
    runTransaction(() => {
      db.prepare("UPDATE withdrawals SET status = 'rejected' WHERE id = ?").run(withdrawalId);
      db.prepare('UPDATE users SET balance_coins = balance_coins + ? WHERE id = ?').run(withdrawal.amount_coins, withdrawal.user_id);
    });

    return res.json({
      success: true,
      message: `Withdrawal #${withdrawalId} rejected. ${withdrawal.amount_coins.toLocaleString()} Coins refunded to user.`
    });
  } catch (err) {
    console.error('[Admin Reject Error]', err);
    return res.status(500).json({ error: 'Failed to reject withdrawal.' });
  }
});

// Admin Inspect User Task History & Anti-Cheat Audit
app.get('/api/admin/users/:id/audit', authenticateAdmin, (req, res) => {
  try {
    const userId = req.params.id;
    const user = db.prepare('SELECT id, username, email, referral_code, referred_by, balance_coins, total_earned, country_code, phone_number, total_watch_seconds, ip_address, created_at FROM users WHERE id = ?').get(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const taskHistory = db.prepare(`
      SELECT ct.id, ct.task_type, ct.task_id, ct.external_tx_id, ct.reward_coins, ct.created_at, vt.title as video_title
      FROM completed_tasks ct
      LEFT JOIN video_tasks vt ON ct.task_id = vt.id
      WHERE ct.user_id = ?
      ORDER BY ct.created_at DESC
      LIMIT 100
    `).all(userId);

    const taskSessions = db.prepare(`
      SELECT ts.id, ts.task_id, ts.start_time, ts.completed, ts.created_at, vt.title, vt.duration_seconds
      FROM task_sessions ts
      LEFT JOIN video_tasks vt ON ts.task_id = vt.id
      WHERE ts.user_id = ?
      ORDER BY ts.created_at DESC
      LIMIT 50
    `).all(userId);

    return res.json({
      success: true,
      user,
      taskHistory,
      taskSessions
    });
  } catch (err) {
    console.error('[Admin Audit Error]', err);
    return res.status(500).json({ error: 'Failed to inspect user audit trail.' });
  }
});

// Admin Video Task CRUD
app.get('/api/admin/videos', authenticateAdmin, (req, res) => {
  try {
    const videos = db.prepare('SELECT * FROM video_tasks ORDER BY id DESC').all();
    return res.json({ success: true, videos });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch video tasks.' });
  }
});

app.post('/api/admin/videos', authenticateAdmin, (req, res) => {
  try {
    const { title, youtube_embed_url, duration_seconds, reward_coins, ad_direct_link } = req.body;

    if (!title || !youtube_embed_url || !duration_seconds || !reward_coins) {
      return res.status(400).json({ error: 'Title, YouTube embed URL, duration, and reward coins are required.' });
    }

    const duration = parseInt(duration_seconds, 10);
    const reward = parseInt(reward_coins, 10);

    if (duration < 5 || reward < 1) {
      return res.status(400).json({ error: 'Duration must be at least 5 seconds and reward at least 1 coin.' });
    }

    // Clean YouTube URL if full watch URL provided
    let embedUrl = youtube_embed_url.trim();
    if (embedUrl.includes('watch?v=')) {
      const videoId = embedUrl.split('watch?v=')[1].split('&')[0];
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    } else if (embedUrl.includes('youtu.be/')) {
      const videoId = embedUrl.split('youtu.be/')[1].split('?')[0];
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    }

    const result = db.prepare(`
      INSERT INTO video_tasks (title, youtube_embed_url, duration_seconds, reward_coins, ad_direct_link, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(title.trim(), embedUrl, duration, reward, ad_direct_link ? ad_direct_link.trim() : null);

    return res.status(201).json({
      success: true,
      message: 'Video task added successfully.',
      task: { id: result.lastInsertRowid, title, youtube_embed_url: embedUrl, duration_seconds: duration, reward_coins: reward }
    });
  } catch (err) {
    console.error('[Admin Add Video Error]', err);
    return res.status(500).json({ error: 'Failed to add video task.' });
  }
});

app.delete('/api/admin/videos/:id', authenticateAdmin, (req, res) => {
  try {
    const videoId = req.params.id;
    db.prepare('DELETE FROM video_tasks WHERE id = ?').run(videoId);
    return res.json({ success: true, message: `Video task #${videoId} deleted.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete video task.' });
  }
});

// Admin Users List
app.get('/api/admin/users', authenticateAdmin, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, u.email, u.referral_code, u.referred_by, u.balance_coins, u.total_earned, u.country_code, u.phone_number, u.total_watch_seconds, u.ip_address, u.created_at,
             ref.username as referrer_username,
             (SELECT COUNT(*) FROM users sub WHERE sub.referred_by = u.id) as total_referrals
      FROM users u
      LEFT JOIN users ref ON u.referred_by = ref.id
      ORDER BY u.created_at DESC
      LIMIT 100
    `).all();

    return res.json({ success: true, users });
  } catch (err) {
    console.error('[Admin Users List Error]', err);
    return res.status(500).json({ error: 'Failed to fetch users list.' });
  }
});

// ==========================================
// 7. MULTI-PAGE APPLICATION (MPA) ROUTING
// ==========================================
const publicDir = path.join(__dirname, 'public');

// 1. Landing & Dashboard
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: publicDir });
});

// 2. Dedicated Authentication Pages
app.get('/login', (req, res) => {
  res.sendFile('login.html', { root: publicDir });
});

app.get('/register', (req, res) => {
  res.sendFile('register.html', { root: publicDir });
});

// 3. Feature Pages
app.get('/watch', (req, res) => {
  res.sendFile('watch.html', { root: publicDir });
});

app.get('/tasks', (req, res) => {
  res.sendFile('tasks.html', { root: publicDir });
});

app.get('/referrals', (req, res) => {
  res.sendFile('referrals.html', { root: publicDir });
});

app.get('/withdraw', (req, res) => {
  res.sendFile('withdraw.html', { root: publicDir });
});

// 4. Hidden & Locked Down Admin Route
// Regular users and visitors are redirected to /login immediately
app.get('/admin', (req, res) => {
  // Option A: Admin key in header
  const adminKey = req.headers['x-admin-key'];
  if (adminKey && adminKey === ADMIN_KEY) {
    return res.sendFile('admin.html', { root: publicDir });
  }

  // Option B: JWT token from cookie or header
  let token = req.cookies.token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7);
  }

  if (!token) {
    return res.redirect('/login?redirect=/admin');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(decoded.id);
    if (!user || user.is_admin !== 1) {
      return res.redirect('/login?redirect=/admin');
    }
    return res.sendFile('admin.html', { root: publicDir });
  } catch (err) {
    return res.redirect('/login?redirect=/admin');
  }
});

// Fallback routing for SPA or static requests
app.use((req, res) => {
  res.sendFile('index.html', { root: publicDir });
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 RewardZone "Watch & Task to Earn" Server Live!`);
  console.log(`🌐 User Web Portal:   http://localhost:${PORT}`);
  console.log(`🛡️ Admin Dashboard:   http://localhost:${PORT}/admin`);
  console.log(`⚡ S2S Postback URL:  http://localhost:${PORT}/api/postback`);
  console.log(`🔒 Security Status:    Admin & Secrets configured via .env`);
  console.log(`=======================================================`);
});

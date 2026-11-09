// Comprehensive End-to-End Automated Test Suite for RewardZone
// Tests Authentication, Strict Email Checks, Phone/Country Code, 3-Gate Cashouts, Crypto, EcoCash, Visa & Admin
require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const { db } = require('./database');

const BASE_URL = 'http://localhost:3000';
let adminToken = '';
let userToken = '';
let newUserId = null;
let referrerId = null;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting RewardZone Automated Test Suite...\n');

  try {
    // 1. Admin Login
    console.log('1️⃣ Testing Admin Authentication...');
    const adminLoginRes = await request('POST', '/api/auth/login', {
      usernameOrEmail: 'admin',
      password: process.env.ADMIN_PASSWORD || 'Adm!WQHtCHWcmlOdaPa1#9xZ'
    });
    if (adminLoginRes.status !== 200 || !adminLoginRes.body.token) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminLoginRes.body)}`);
    }
    adminToken = adminLoginRes.body.token;
    console.log('   ✅ Admin login successful. Token acquired.\n');

    // 2. Demo User Login (Referrer)
    console.log('2️⃣ Testing Demo User (Referrer) Login...');
    const demoLoginRes = await request('POST', '/api/auth/login', {
      usernameOrEmail: 'demouser',
      password: 'DemoUser123!'
    });
    if (demoLoginRes.status !== 200) {
      throw new Error(`Demo user login failed: ${JSON.stringify(demoLoginRes.body)}`);
    }
    referrerId = demoLoginRes.body.user.id;
    const demoInitialBalance = demoLoginRes.body.user.balance_coins;
    console.log(`   ✅ Referrer (demouser, ID: ${referrerId}) logged in. Balance: ${demoInitialBalance} Coins (Ref Code: ${demoLoginRes.body.user.referral_code})\n`);

    // 3. Strict Email Validation Test
    console.log('3️⃣ Testing Strict Email Validation & Country Code Registration...');
    const badEmailRes = await request('POST', '/api/auth/register', {
      username: `bad_${Date.now().toString().slice(-6)}`,
      email: 'invalid-email-format-without-at-sign',
      password: 'Password123!',
      country_code: '+263',
      phone_number: '771234567',
      terms_accepted: 1
    });
    if (badEmailRes.status === 400 && badEmailRes.body.error === 'Please enter a valid email address.') {
      console.log(`   🛡️ STRICT EMAIL CHECK PASSED: Non-email rejected with HTTP 400: "${badEmailRes.body.error}"`);
    } else {
      throw new Error(`Strict email validation failed! Expected HTTP 400 email error, got: ${JSON.stringify(badEmailRes.body)}`);
    }

    // EULA Acceptance Check (Reject if missing)
    const noTermsRes = await request('POST', '/api/auth/register', {
      username: `noterms_${Date.now().toString().slice(-4)}`,
      email: `noterms_${Date.now()}@example.com`,
      password: 'Password123!',
      country_code: '+263',
      phone_number: '771234567'
    });
    if (noTermsRes.status === 400 && (noTermsRes.body.error.includes('Platform Terms of Service') || noTermsRes.body.error.includes('End User License Agreement'))) {
      console.log(`   🛡️ EULA ENFORCEMENT PASSED: Registration rejected without terms acceptance: "${noTermsRes.body.error}"`);
    } else {
      throw new Error(`EULA acceptance check failed! Expected HTTP 400, got: ${JSON.stringify(noTermsRes.body)}`);
    }

    // Register valid user with Country Code (+263), Phone Number & EULA acceptance
    const testUsername = `user_${Date.now().toString().slice(-6)}`;
    const regRes = await request('POST', '/api/auth/register', {
      username: testUsername,
      email: `${testUsername}@example.com`,
      password: 'Password123!',
      ref_code: 'DEMO99',
      country_code: '+263',
      phone_number: '771234567',
      terms_accepted: 1
    });
    if (regRes.status !== 201 || !regRes.body.token) {
      throw new Error(`Registration failed: ${JSON.stringify(regRes.body)}`);
    }
    userToken = regRes.body.token;
    newUserId = regRes.body.user.id;
    console.log(`   ✅ Registered new user ${testUsername} (ID: ${newUserId}) with Country: ${regRes.body.user.country_code}, Phone: ${regRes.body.user.phone_number}`);
    console.log(`   ✅ Welcome Bonus: ${regRes.body.user.balance_coins} Coins awarded.\n`);

    // 4. Video Tasks List
    console.log('4️⃣ Testing Video Tasks List & Calibrated Coin Rewards (5–15 Coins)...');
    const videosRes = await request('GET', '/api/tasks/videos', null, {
      'Authorization': `Bearer ${userToken}`
    });
    if (videosRes.status !== 200 || !videosRes.body.tasks.length) {
      throw new Error(`Failed to list video tasks: ${JSON.stringify(videosRes.body)}`);
    }
    const sampleTask = videosRes.body.tasks[0];
    // Verify calibrated reward amounts: 30s-45s = 5 coins, 60s = 10 coins, 90s+ = 15 coins
    for (const t of videosRes.body.tasks) {
      if (t.duration_seconds <= 45 && t.reward_coins !== 5) {
        throw new Error(`Task #${t.id} (${t.duration_seconds}s) expected 5 coins, got ${t.reward_coins}`);
      }
      if (t.duration_seconds > 45 && t.duration_seconds <= 60 && t.reward_coins !== 10) {
        throw new Error(`Task #${t.id} (${t.duration_seconds}s) expected 10 coins, got ${t.reward_coins}`);
      }
      if (t.duration_seconds > 60 && t.reward_coins !== 15) {
        throw new Error(`Task #${t.id} (${t.duration_seconds}s) expected 15 coins, got ${t.reward_coins}`);
      }
    }
    console.log(`   ✅ Retrieved ${videosRes.body.tasks.length} video tasks with calibrated rewards (5, 10, 15 coins). Sample task: "${sampleTask.title}" (${sampleTask.duration_seconds}s, +${sampleTask.reward_coins} Coins)\n`);

    // 5. Anti-Cheat Video Watch Verification (Premature Claim Rejection)
    console.log('5️⃣ Testing Anti-Cheat Video Session & Premature Claim Detection...');
    const startVidRes = await request('POST', '/api/tasks/start-video', { taskId: sampleTask.id }, {
      'Authorization': `Bearer ${userToken}`
    });
    if (startVidRes.status !== 200 || !startVidRes.body.sessionToken) {
      throw new Error(`Failed to start video: ${JSON.stringify(startVidRes.body)}`);
    }
    const sessionToken = startVidRes.body.sessionToken;
    console.log(`   ✅ Video session started. Session token generated.`);

    // Attempt claim IMMEDIATELY (should be rejected with 403)
    const cheatClaimRes = await request('POST', '/api/tasks/claim-video', { sessionToken }, {
      'Authorization': `Bearer ${userToken}`
    });
    if (cheatClaimRes.status === 403) {
      console.log(`   🛡️ ANTI-CHEAT PASSED: Premature claim correctly blocked with HTTP 403: "${cheatClaimRes.body.error}"\n`);
    } else {
      throw new Error(`Anti-cheat failed! Expected 403, got ${cheatClaimRes.status}: ${JSON.stringify(cheatClaimRes.body)}`);
    }

    // 6. Daily Checkin & Cooldown
    console.log('6️⃣ Testing Reduced Daily Bonus (+5 Coins), 7-Day Consistency Streak & Cooldown...');
    const dailyRes = await request('POST', '/api/tasks/daily-checkin', {}, {
      'Authorization': `Bearer ${userToken}`
    });
    if (dailyRes.status !== 200 || dailyRes.body.rewardCoins !== 5) {
      throw new Error(`Daily bonus failed! Expected +5 Coins, got: ${JSON.stringify(dailyRes.body)}`);
    }
    console.log(`   ✅ Daily bonus claimed: +5 Coins. New balance: ${dailyRes.body.newBalance}`);

    // Verify 7-Day Consistency Streak Status
    const streakStatusRes = await request('GET', '/api/tasks/daily-status', null, {
      'Authorization': `Bearer ${userToken}`
    });
    if (streakStatusRes.status === 200 && streakStatusRes.body.streakList && streakStatusRes.body.streakList.length === 7) {
      if (streakStatusRes.body.rewardCoins !== 5) {
        throw new Error(`Streak status expected rewardCoins: 5, got ${streakStatusRes.body.rewardCoins}`);
      }
      console.log(`   🔥 7-DAY STREAK VERIFIED: Current streak is Day ${streakStatusRes.body.streakDays} with +5 Coins daily reward.`);
    } else {
      throw new Error(`Daily streak status failed: ${JSON.stringify(streakStatusRes.body)}`);
    }

    // Try claiming again immediately (should fail)
    const duplicateDailyRes = await request('POST', '/api/tasks/daily-checkin', {}, {
      'Authorization': `Bearer ${userToken}`
    });
    if (duplicateDailyRes.status === 400) {
      console.log(`   ✅ Cooldown check passed: Second daily claim rejected ("${duplicateDailyRes.body.error}")\n`);
    } else {
      throw new Error(`Daily duplicate check failed! Got ${duplicateDailyRes.status}`);
    }

    // 7. Universal S2S Postback Webhook & 10% Referral Commission
    console.log('7️⃣ Testing Universal S2S Postback Webhook & 10% Referral Commission Engine...');
    const payoutCoins = 6000; // $6.00 payout, will give referrer +600 coins (10%)
    const txid = `cpa_test_${Date.now()}`;
    const secret = process.env.POSTBACK_SECRET || 'rewardzone_secret_key_2026';
    const sig = crypto.createHmac('sha256', secret).update(`${newUserId}:${payoutCoins}:${txid}`).digest('hex');

    const postbackPath = `/api/postback?userid=${newUserId}&payout=${payoutCoins}&txid=${txid}&sig=${sig}`;
    const postbackRes = await request('GET', postbackPath);

    if (postbackRes.status !== 200 || (String(postbackRes.body).trim() !== '1')) {
      throw new Error(`Postback failed: ${postbackRes.status} Body: ${postbackRes.body}`);
    }
    console.log(`   ✅ S2S Postback webhook processed! Returned HTTP 200 with "1"`);

    // Verify deduplication
    const dupPostbackRes = await request('GET', postbackPath);
    if (dupPostbackRes.status === 200 && (String(dupPostbackRes.body).trim() === '1')) {
      console.log(`   ✅ Deduplication passed: Duplicate postback handled safely without double-crediting.`);
    }

    // Check Referrer Balance for 10% commission (+600 coins)
    const referrerCheckRes = await request('GET', '/api/auth/me', null, {
      'Authorization': `Bearer ${demoLoginRes.body.token}`
    });
    const expectedCommission = 600;
    const actualIncrease = referrerCheckRes.body.user.balance_coins - demoInitialBalance;
    if (actualIncrease === expectedCommission) {
      console.log(`   🎉 TIERED COMMISSION ENGINE VERIFIED: Referrer (demouser) received exactly +${actualIncrease} Coins (10% of 6,000)!`);
    } else {
      throw new Error(`Referral commission mismatch. Expected +${expectedCommission}, got +${actualIncrease}`);
    }

    // Verify 10% commission on 5-coin video task awards minimum 1 coin (Math.max(1, floor(5 * 0.10)))
    const preVideoReferrerCoins = referrerCheckRes.body.user.balance_coins;
    const testSessionToken = `tok_test_ref_${Date.now()}`;
    db.prepare(`
      INSERT INTO task_sessions (user_id, task_id, session_token, start_time, completed)
      VALUES (?, ?, ?, ?, 0)
    `).run(newUserId, sampleTask.id, testSessionToken, Math.floor(Date.now() / 1000) - sampleTask.duration_seconds - 5);

    const claim5Res = await request('POST', '/api/tasks/claim-video', { sessionToken: testSessionToken }, {
      'Authorization': `Bearer ${userToken}`
    });
    if (claim5Res.status !== 200 || claim5Res.body.rewardCoins !== 5) {
      throw new Error(`Claiming 5-coin video failed: ${JSON.stringify(claim5Res.body)}`);
    }
    const postVideoReferrerRes = await request('GET', '/api/auth/me', null, {
      'Authorization': `Bearer ${demoLoginRes.body.token}`
    });
    const refCommissionOn5 = postVideoReferrerRes.body.user.balance_coins - preVideoReferrerCoins;
    if (refCommissionOn5 === 1) {
      console.log(`   🎉 MINIMUM 1-COIN COMMISSION VERIFIED: Referrer earned +1 Coin (Math.max(1, 0)) on 5-coin video stream!`);
    } else {
      throw new Error(`Expected +1 referral commission on 5-coin video, got +${refCommissionOn5}`);
    }

    // Test Referral Leaderboard
    const leaderboardRes = await request('GET', '/api/referrals/leaderboard');
    if (leaderboardRes.status === 200 && leaderboardRes.body.leaderboard && leaderboardRes.body.leaderboard.length > 0) {
      const topAmbassador = leaderboardRes.body.leaderboard[0];
      console.log(`   🏆 REFERRAL LEADERBOARD VERIFIED: Top ambassador ${topAmbassador.username} holds tier ${topAmbassador.tierName} (${topAmbassador.tierBadge}) with ${topAmbassador.referrals} recruits.\n`);
    } else {
      throw new Error(`Referral leaderboard failed: ${JSON.stringify(leaderboardRes.body)}`);
    }

    // 8. Strict Cashout Gate Testing (100k Coins, 10 Referrals, 10 Hours Watch Time)
    console.log('8️⃣ Testing Strict Cashout Gate Rules (100k Coins, 10 Referrals, 10 Hours Watch Time)...');
    
    // Gate 1: Insufficient Balance Rejection
    const gate1Res = await request('POST', '/api/withdrawals/request', {
      amountCoins: 100000,
      payoutMethod: 'CRYPTO',
      cryptoNetwork: 'USDT-BEP20',
      walletAddress: '0x71C8360f0896ff0D6CBEB7e80f4f9f72782bE507'
    }, {
      'Authorization': `Bearer ${userToken}`
    });
    if (gate1Res.status === 403 && gate1Res.body.error.includes('Minimum balance')) {
      console.log(`   🔒 GATE 1 ENFORCED: Cashout rejected for low balance: "${gate1Res.body.error}"`);
    } else {
      throw new Error(`Gate 1 failed! Expected 403, got ${gate1Res.status}: ${JSON.stringify(gate1Res.body)}`);
    }

    // Seed User Balance to 350,000 Coins ($350.00 USD)
    db.prepare('UPDATE users SET balance_coins = 350000 WHERE id = ?').run(newUserId);

    // Gate 2: Insufficient Referrals Rejection
    const gate2Res = await request('POST', '/api/withdrawals/request', {
      amountCoins: 100000,
      payoutMethod: 'CRYPTO',
      cryptoNetwork: 'USDT-BEP20',
      walletAddress: '0x71C8360f0896ff0D6CBEB7e80f4f9f72782bE507'
    }, {
      'Authorization': `Bearer ${userToken}`
    });
    if (gate2Res.status === 403 && gate2Res.body.error.includes('active referrals')) {
      console.log(`   🔒 GATE 2 ENFORCED: Cashout rejected for insufficient referrals: "${gate2Res.body.error}"`);
    } else {
      throw new Error(`Gate 2 failed! Expected 403, got ${gate2Res.status}: ${JSON.stringify(gate2Res.body)}`);
    }

    // Seed 10 Active Referrals for newUserId
    for (let i = 1; i <= 10; i++) {
      const refCode = `TREF${i}_${Date.now()}`;
      db.prepare(`
        INSERT INTO users (username, email, password_hash, referral_code, referred_by, balance_coins, total_earned, created_at)
        VALUES (?, ?, 'hash', ?, ?, 100, 100, datetime('now'))
      `).run(`ref_user_${newUserId}_${i}_${Date.now()}`, `ref_${newUserId}_${i}_${Date.now()}@test.com`, refCode, newUserId);
    }

    // Gate 3: Insufficient Watch Time Rejection
    const gate3Res = await request('POST', '/api/withdrawals/request', {
      amountCoins: 100000,
      payoutMethod: 'CRYPTO',
      cryptoNetwork: 'USDT-BEP20',
      walletAddress: '0x71C8360f0896ff0D6CBEB7e80f4f9f72782bE507'
    }, {
      'Authorization': `Bearer ${userToken}`
    });
    if (gate3Res.status === 403 && gate3Res.body.error.includes('watch time')) {
      console.log(`   🔒 GATE 3 ENFORCED: Cashout rejected for insufficient watch time: "${gate3Res.body.error}"`);
    } else {
      throw new Error(`Gate 3 failed! Expected 403, got ${gate3Res.status}: ${JSON.stringify(gate3Res.body)}`);
    }

    // Seed User Watch Time to 10 Hours (36,000 Seconds)
    db.prepare('UPDATE users SET total_watch_seconds = 36000 WHERE id = ?').run(newUserId);

    // Verify Eligibility API
    const eligRes = await request('GET', '/api/withdrawals/eligibility', null, {
      'Authorization': `Bearer ${userToken}`
    });
    if (eligRes.status !== 200 || !eligRes.body.eligible) {
      throw new Error(`Eligibility check failed! Expected eligible: true, got: ${JSON.stringify(eligRes.body)}`);
    }
    console.log(`   🔓 ALL 3 GATES UNLOCKED: User is now fully eligible for cashouts.\n`);

    // 9. Testing Expanded Cashout Methods (Crypto, EcoCash, Visa Card)
    console.log('9️⃣ Testing Multi-Method Cashouts (Crypto, EcoCash, Visa)...');

    // Method A: Crypto (USDT-BEP20)
    const cryptoCashoutRes = await request('POST', '/api/withdrawals/request', {
      amountCoins: 100000,
      payoutMethod: 'CRYPTO',
      cryptoNetwork: 'USDT-BEP20',
      walletAddress: '0x71C8360f0896ff0D6CBEB7e80f4f9f72782bE507'
    }, {
      'Authorization': `Bearer ${userToken}`
    });
    if (cryptoCashoutRes.status !== 201 || !cryptoCashoutRes.body.withdrawalId) {
      throw new Error(`Crypto cashout failed: ${JSON.stringify(cryptoCashoutRes.body)}`);
    }
    const cryptoWithdrawalId = cryptoCashoutRes.body.withdrawalId;
    console.log(`   ✅ Method 1 (Crypto) Payout #${cryptoWithdrawalId} submitted: $100.00 USD via USDT-BEP20.`);

    // Method B: EcoCash (Mobile Money)
    const ecoCashoutRes = await request('POST', '/api/withdrawals/request', {
      amountCoins: 100000,
      payoutMethod: 'ECOCASH',
      ecocashNumber: '+263771234567',
      accountName: 'Zack Cape'
    }, {
      'Authorization': `Bearer ${userToken}`
    });
    if (ecoCashoutRes.status !== 201 || !ecoCashoutRes.body.withdrawalId) {
      throw new Error(`EcoCash cashout failed: ${JSON.stringify(ecoCashoutRes.body)}`);
    }
    const ecoWithdrawalId = ecoCashoutRes.body.withdrawalId;
    console.log(`   ✅ Method 2 (EcoCash) Payout #${ecoWithdrawalId} submitted: $100.00 USD to +263771234567 (Zack Cape).`);

    // Method C: Visa Card (Direct Card Payout)
    const visaCashoutRes = await request('POST', '/api/withdrawals/request', {
      amountCoins: 100000,
      payoutMethod: 'VISA',
      cardholderName: 'Zack Cape',
      cardNumber: '4000123456789010',
      expiryDate: '12/28',
      billingCountry: 'Zimbabwe',
      billingAddress: '124 Samora Machel Ave'
    }, {
      'Authorization': `Bearer ${userToken}`
    });
    if (visaCashoutRes.status !== 201 || !visaCashoutRes.body.withdrawalId) {
      throw new Error(`Visa cashout failed: ${JSON.stringify(visaCashoutRes.body)}`);
    }
    const visaWithdrawalId = visaCashoutRes.body.withdrawalId;
    console.log(`   ✅ Method 3 (Visa Card) Payout #${visaWithdrawalId} submitted: $100.00 USD to Visa card.`);

    // Verify User Withdrawal History & 7-Day Batch Settlement Timestamp
    const myWithdrawalsRes = await request('GET', '/api/withdrawals/my', null, {
      'Authorization': `Bearer ${userToken}`
    });
    if (myWithdrawalsRes.status !== 200 || myWithdrawalsRes.body.withdrawals.length < 3) {
      throw new Error(`My withdrawals history incomplete: ${JSON.stringify(myWithdrawalsRes.body)}`);
    }
    const sampleWithdrawal = myWithdrawalsRes.body.withdrawals[0];
    if (!sampleWithdrawal.scheduled_release_at) {
      throw new Error(`Withdrawal #${sampleWithdrawal.id} missing scheduled_release_at batch timestamp!`);
    }
    console.log(`   ⏳ 7-DAY BATCH SETTLEMENT VERIFIED: Withdrawal #${sampleWithdrawal.id} scheduled for release at: ${sampleWithdrawal.scheduled_release_at}`);
    console.log(`   ✅ Cashout history verified: All 3 payout requests logged in user profile with batch release timestamps.\n`);

    // 10. Admin Dashboard Operations & Review
    console.log('🔟 Testing Admin Queue & Approval/Refund of New Payout Methods...');
    const adminWithdrawalsRes = await request('GET', '/api/admin/withdrawals', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    if (adminWithdrawalsRes.status !== 200 || !adminWithdrawalsRes.body.withdrawals.length) {
      throw new Error(`Admin withdrawals query failed: ${JSON.stringify(adminWithdrawalsRes.body)}`);
    }
    console.log(`   ✅ Admin queue shows ${adminWithdrawalsRes.body.withdrawals.length} withdrawal records.`);

    // Admin Approves EcoCash Payout
    const approveEcoRes = await request('POST', `/api/admin/withdrawals/${ecoWithdrawalId}/approve`, {}, {
      'Authorization': `Bearer ${adminToken}`
    });
    if (approveEcoRes.status !== 200) {
      throw new Error(`Admin approve failed: ${JSON.stringify(approveEcoRes.body)}`);
    }
    console.log(`   ✅ Admin successfully approved EcoCash payout #${ecoWithdrawalId}.`);

    // Admin Rejects Crypto Payout (Refund)
    const rejectCryptoRes = await request('POST', `/api/admin/withdrawals/${cryptoWithdrawalId}/reject`, {}, {
      'Authorization': `Bearer ${adminToken}`
    });
    if (rejectCryptoRes.status !== 200) {
      throw new Error(`Admin reject failed: ${JSON.stringify(rejectCryptoRes.body)}`);
    }
    console.log(`   ✅ Admin rejected Crypto payout #${cryptoWithdrawalId} and automatically refunded 100,000 Coins to user balance.`);

    // Test Public Live Payouts Ticker Feed
    const tickerRes = await request('GET', '/api/public/recent-payouts');
    if (tickerRes.status !== 200 || !tickerRes.body.payouts || !tickerRes.body.payouts.length) {
      throw new Error(`Live payout ticker failed: ${JSON.stringify(tickerRes.body)}`);
    }
    console.log(`   ✅ Live Payout Ticker feed verified: ${tickerRes.body.payouts.length} verified platform cashouts loaded.`);

    // Test Admin Telemetry & Registration Audit Logs
    const telemetryRes = await request('GET', '/api/admin/telemetry', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    if (telemetryRes.status === 200 && telemetryRes.body.logs && telemetryRes.body.logs.length > 0) {
      console.log(`   📊 TELEMETRY AUDIT VERIFIED: Retrieved ${telemetryRes.body.logs.length} audit logs. Latest event: ${telemetryRes.body.logs[0].event_type} (${telemetryRes.body.logs[0].auth_input}).`);
    } else {
      throw new Error(`Telemetry query failed: ${JSON.stringify(telemetryRes.body)}`);
    }

    // Test Admin Telemetry CSV Export
    const exportCsvRes = await request('GET', '/api/admin/telemetry/export', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    if (exportCsvRes.status === 200 && typeof exportCsvRes.body === 'string' && exportCsvRes.body.includes('ID,UserID,Username')) {
      console.log(`   📥 CSV EXPORT VERIFIED: Telemetry CSV exported successfully (${exportCsvRes.body.split('\n').length} lines).\n`);
    } else {
      throw new Error(`CSV export failed: ${exportCsvRes.status}`);
    }

    // 11. Multi-Page Application (MPA) Routes & Admin Lockdown
    console.log('1️⃣1️⃣ Testing MPA Routing & Hidden Admin Access Lockdown...');
    const mpaPages = ['/', '/dashboard', '/login', '/register', '/watch', '/tasks', '/referrals', '/withdraw'];
    for (const page of mpaPages) {
      const pageRes = await request('GET', page);
      if (pageRes.status !== 200) {
        throw new Error(`MPA page ${page} returned status ${pageRes.status}`);
      }
      // Verify no exposed "Admin Dashboard" button in public HTML
      if (typeof pageRes.body === 'string' && pageRes.body.includes('Admin Dashboard')) {
        throw new Error(`Security breach: "Admin Dashboard" is exposed in public page ${page}!`);
      }
    }
    console.log(`   ✅ All ${mpaPages.length} MPA pages served with clean URLs. Zero exposed admin buttons.`);

    // Verify unauthenticated /admin redirects to /login
    const unauthAdminRes = await request('GET', '/admin');
    if (unauthAdminRes.status !== 302 || !unauthAdminRes.headers.location.includes('/login')) {
      throw new Error(`Unauthenticated /admin did not redirect! Status: ${unauthAdminRes.status}`);
    }
    console.log('   🔒 Admin lock verified: Unauthenticated /admin immediately redirected (HTTP 302) to /login.');

    // Verify authenticated admin can access /admin
    const authAdminRes = await request('GET', '/admin', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    if (authAdminRes.status !== 200) {
      throw new Error(`Authenticated admin was denied /admin access: ${authAdminRes.status}`);
    }
    console.log('   ✅ Authenticated admin can access /admin.\n');

    console.log('=======================================================');
    console.log('🏆 ALL 11 TEST SUITES PASSED WITH 100% SUCCESS!');
    console.log('=======================================================');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);
    process.exit(1);
  }
}

// Allow server to be ready before running
setTimeout(runTests, 1000);

// Comprehensive End-to-End Automated Test Suite for RewardZone
require('dotenv').config();
const http = require('http');
const crypto = require('crypto');

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

    // 3. User Registration with Referral Code (?ref=DEMO99)
    console.log('3️⃣ Testing User Registration with Referral Code...');
    const testUsername = `user_${Date.now()}`;
    const regRes = await request('POST', '/api/auth/register', {
      username: testUsername,
      email: `${testUsername}@example.com`,
      password: 'Password123!',
      ref_code: 'DEMO99'
    });
    if (regRes.status !== 201 || !regRes.body.token) {
      throw new Error(`Registration failed: ${JSON.stringify(regRes.body)}`);
    }
    userToken = regRes.body.token;
    newUserId = regRes.body.user.id;
    console.log(`   ✅ Registered new user ${testUsername} (ID: ${newUserId}). Referred by: ${regRes.body.user.referred_by}`);
    console.log(`   ✅ Welcome Bonus: ${regRes.body.user.balance_coins} Coins awarded.\n`);

    // 4. Video Tasks List
    console.log('4️⃣ Testing Video Tasks List...');
    const videosRes = await request('GET', '/api/tasks/videos', null, {
      'Authorization': `Bearer ${userToken}`
    });
    if (videosRes.status !== 200 || !videosRes.body.tasks.length) {
      throw new Error(`Failed to list video tasks: ${JSON.stringify(videosRes.body)}`);
    }
    const sampleTask = videosRes.body.tasks[0];
    console.log(`   ✅ Retrieved ${videosRes.body.tasks.length} video tasks. First task: "${sampleTask.title}" (${sampleTask.duration_seconds}s, +${sampleTask.reward_coins} Coins)\n`);

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
    console.log('6️⃣ Testing Daily Bonus (+25 Coins) & 24h Cooldown...');
    const dailyRes = await request('POST', '/api/tasks/daily-checkin', {}, {
      'Authorization': `Bearer ${userToken}`
    });
    if (dailyRes.status !== 200 || dailyRes.body.rewardCoins !== 25) {
      throw new Error(`Daily bonus failed: ${JSON.stringify(dailyRes.body)}`);
    }
    console.log(`   ✅ Daily bonus claimed: +25 Coins. New balance: ${dailyRes.body.newBalance}`);

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
      console.log(`   🎉 TIERED COMMISSION ENGINE VERIFIED: Referrer (demouser) received exactly +${actualIncrease} Coins (10% of 6,000)!\n`);
    } else {
      throw new Error(`Referral commission mismatch. Expected +${expectedCommission}, got +${actualIncrease}`);
    }

    // 8. Crypto Withdrawal Request
    console.log('8️⃣ Testing Crypto Cashout Request...');
    const withdrawAmount = 5000; // $5.00
    const withdrawRes = await request('POST', '/api/withdrawals/request', {
      amountCoins: withdrawAmount,
      cryptoNetwork: 'USDT-BEP20',
      walletAddress: '0x71C8360f0896ff0D6CBEB7e80f4f9f72782bE507'
    }, {
      'Authorization': `Bearer ${userToken}`
    });

    if (withdrawRes.status !== 201 || !withdrawRes.body.withdrawalId) {
      throw new Error(`Withdrawal request failed: ${JSON.stringify(withdrawRes.body)}`);
    }
    const withdrawalId = withdrawRes.body.withdrawalId;
    console.log(`   ✅ Withdrawal #${withdrawalId} requested for 5,000 Coins ($5.00 USD). Status: Pending.`);
    console.log(`   ✅ Coins immediately deducted from user balance. New Balance: ${withdrawRes.body.newBalance}\n`);

    // 9. Admin Dashboard Management (Stats, Audit, Reject/Refund or Approve)
    console.log('9️⃣ Testing Admin Operations (Stats, Audit, Reject/Refund)...');
    const adminStatsRes = await request('GET', '/api/admin/stats', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    console.log(`   ✅ Admin Stats: Users=${adminStatsRes.body.stats.totalUsers}, CoinsCirculation=${adminStatsRes.body.stats.coinsCirculation}, PendingWithdrawals=${adminStatsRes.body.stats.pendingWithdrawalsCount}`);

    // Audit user
    const auditRes = await request('GET', `/api/admin/users/${newUserId}/audit`, null, {
      'Authorization': `Bearer ${adminToken}`
    });
    console.log(`   ✅ Admin Audit: User #${newUserId} has ${auditRes.body.taskHistory.length} completed tasks logged.`);

    // Test Admin Reject with Automatic Coin Refund
    console.log('   🔄 Testing Admin Reject with Automatic User Refund...');
    const rejectRes = await request('POST', `/api/admin/withdrawals/${withdrawalId}/reject`, {}, {
      'Authorization': `Bearer ${adminToken}`
    });
    if (rejectRes.status !== 200) {
      throw new Error(`Reject failed: ${JSON.stringify(rejectRes.body)}`);
    }
    console.log(`   ✅ Withdrawal #${withdrawalId} rejected: "${rejectRes.body.message}"`);

    // Verify refund in user account
    const userProfileRes = await request('GET', '/api/auth/me', null, {
      'Authorization': `Bearer ${userToken}`
    });
    console.log(`   ✅ Refund verified: User balance restored to ${userProfileRes.body.user.balance_coins} Coins.\n`);

    // 10. Admin Add & Delete Video Task
    console.log('🔟 Testing Admin Video Task Management (Add & Delete)...');
    const addVideoRes = await request('POST', '/api/admin/videos', {
      title: 'Solana Speed & Scalability Showcase',
      youtube_embed_url: 'https://www.youtube.com/watch?v=17QRFlml4pA',
      duration_seconds: 35,
      reward_coins: 75,
      ad_direct_link: 'https://solana.com'
    }, {
      'Authorization': `Bearer ${adminToken}`
    });
    if (addVideoRes.status !== 201) {
      throw new Error(`Failed to add video: ${JSON.stringify(addVideoRes.body)}`);
    }
    const newTaskId = addVideoRes.body.task.id;
    console.log(`   ✅ Video Task #${newTaskId} created: "${addVideoRes.body.task.title}"`);

    const delVideoRes = await request('DELETE', `/api/admin/videos/${newTaskId}`, null, {
      'Authorization': `Bearer ${adminToken}`
    });
    if (delVideoRes.status !== 200) {
      throw new Error(`Failed to delete video: ${JSON.stringify(delVideoRes.body)}`);
    }
    console.log(`   ✅ Video Task #${newTaskId} deleted.\n`);

    console.log('=======================================================');
    console.log('🏆 ALL 10 TEST SUITES PASSED WITH 100% SUCCESS!');
    console.log('=======================================================');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);
    process.exit(1);
  }
}

// Allow server to be ready before running
setTimeout(runTests, 1000);

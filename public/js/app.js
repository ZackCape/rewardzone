// RewardZone Frontend Single Page Application Logic
// Inspired by modern crypto reward platforms (AdSelect / Stremio)

const state = {
  user: null,
  token: localStorage.getItem('rewardzone_token') || null,
  activeTab: 'watch',
  videoSession: null,
  videoTimer: null,
  videoSecondsRemaining: 0,
  videoTotalDuration: 0,
  isTabActive: true,
  dailyTimerInterval: null
};

// ==========================================
// 1. INITIALIZATION & ROUTING
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  initReferralCode();
  setupAntiCheatListeners();
  await checkAuthSession();
  
  // Hash routing support (e.g. #offerwalls, #referrals)
  const hash = window.location.hash.replace('#', '');
  if (['watch', 'offerwalls', 'daily', 'referrals', 'withdraw', 'history'].includes(hash)) {
    switchTab(hash);
  } else {
    switchTab('watch');
  }

  // Auto refresh user balance & video states periodically
  setInterval(() => {
    if (state.user) {
      refreshUserData();
    }
  }, 30000);
});

// Extract & Persist Referral Code from URL (?ref=CODE)
function initReferralCode() {
  const urlParams = new URLSearchParams(window.location.search);
  const refFromUrl = urlParams.get('ref');

  if (refFromUrl && refFromUrl.trim()) {
    const cleanRef = refFromUrl.trim().toUpperCase();
    localStorage.setItem('rewardzone_ref', cleanRef);
  }

  const storedRef = localStorage.getItem('rewardzone_ref');
  if (storedRef) {
    const banner = document.getElementById('referral-banner');
    const badge = document.getElementById('inviter-code-badge');
    if (banner && badge) {
      badge.textContent = storedRef;
      banner.classList.remove('hidden');
    }

    const regRefInput = document.getElementById('reg-refcode');
    const regRefIndicator = document.getElementById('reg-ref-indicator');
    if (regRefInput) {
      regRefInput.value = storedRef;
      if (regRefIndicator) {
        regRefIndicator.textContent = `Applied referral code from Ambassador: ${storedRef}`;
        regRefIndicator.classList.remove('hidden');
      }
    }
  }
}

// Anti-Cheat Tab Focus & Visibility Detection
function setupAntiCheatListeners() {
  const updateTabState = () => {
    const hasFocus = document.hasFocus();
    const isVisible = document.visibilityState === 'visible';
    const active = hasFocus && isVisible;

    state.isTabActive = active;

    const warningEl = document.getElementById('tab-inactive-warning');
    if (warningEl) {
      if (!active && state.videoSession && state.videoSecondsRemaining > 0) {
        warningEl.classList.remove('hidden');
      } else {
        warningEl.classList.add('hidden');
      }
    }
  };

  document.addEventListener('visibilitychange', updateTabState);
  window.addEventListener('blur', updateTabState);
  window.addEventListener('focus', updateTabState);
}

// Tab Switching Mechanism
function switchTab(tabId) {
  state.activeTab = tabId;
  window.location.hash = tabId;

  // Update nav buttons
  const tabs = ['watch', 'offerwalls', 'daily', 'referrals', 'withdraw', 'history'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const section = document.getElementById(`tab-${t}`);
    if (btn) {
      if (t === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
    if (section) {
      if (t === tabId) {
        section.classList.remove('hidden');
      } else {
        section.classList.add('hidden');
      }
    }
  });

  // Load specific data when switching
  if (tabId === 'watch') loadVideoTasks();
  if (tabId === 'offerwalls') syncOfferwallTab();
  if (tabId === 'daily') loadDailyBonusStatus();
  if (tabId === 'referrals') loadReferralHub();
  if (tabId === 'withdraw') loadWithdrawalTab();
  if (tabId === 'history') loadUserHistory();
}

// ==========================================
// 2. AUTHENTICATION & SESSION
// ==========================================
async function checkAuthSession() {
  try {
    const res = await fetch('/api/auth/me', {
      headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {}
    });

    if (res.ok) {
      const data = await res.json();
      state.user = data.user;
      renderUserLoggedIn(data.user);
    } else {
      state.user = null;
      renderUserLoggedOut();
    }
  } catch (err) {
    console.error('Session check failed', err);
    state.user = null;
    renderUserLoggedOut();
  }
}

async function refreshUserData() {
  if (!state.user) return;
  try {
    const res = await fetch('/api/auth/me', {
      headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {}
    });
    if (res.ok) {
      const data = await res.json();
      state.user = data.user;
      renderUserLoggedIn(data.user);
    }
  } catch (err) {
    console.error('Failed to refresh user data', err);
  }
}

function renderUserLoggedIn(user) {
  document.getElementById('nav-user-stats').classList.remove('hidden');
  document.getElementById('nav-user-stats').classList.add('flex');
  document.getElementById('nav-guest-actions').classList.add('hidden');

  document.getElementById('nav-username').textContent = user.username;
  document.getElementById('dropdown-username').textContent = user.username;
  document.getElementById('user-avatar-initial').textContent = user.username.charAt(0).toUpperCase();

  const balanceFormatted = (user.balance_coins || 0).toLocaleString();
  const usdValue = ((user.balance_coins || 0) / 1000).toFixed(2);

  document.getElementById('nav-coins-balance').textContent = balanceFormatted;
  document.getElementById('nav-usd-balance').textContent = `$${usdValue}`;

  if (user.is_admin === 1) {
    const adminLink = document.getElementById('admin-menu-link');
    if (adminLink) adminLink.classList.remove('hidden');
  }

  // Update offerwall SubID label
  const offerwallUserId = document.getElementById('offerwall-user-id');
  const offerwallSubidLabel = document.getElementById('offerwall-subid-label');
  if (offerwallUserId) offerwallUserId.textContent = `#${user.id} (${user.username})`;
  if (offerwallSubidLabel) offerwallSubidLabel.textContent = user.id;

  // Update withdraw tab available balance
  const withdrawCoins = document.getElementById('withdraw-available-coins');
  const withdrawUsd = document.getElementById('withdraw-available-usd');
  if (withdrawCoins) withdrawCoins.textContent = `${balanceFormatted} Coins`;
  if (withdrawUsd) withdrawUsd.textContent = `($${usdValue} USD)`;
}

function renderUserLoggedOut() {
  document.getElementById('nav-user-stats').classList.add('hidden');
  document.getElementById('nav-user-stats').classList.remove('flex');
  document.getElementById('nav-guest-actions').classList.remove('hidden');
}

// Modal Controls
function openLoginModal() {
  document.getElementById('login-modal').classList.remove('hidden');
}

function closeLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
}

function openRegisterModal() {
  document.getElementById('register-modal').classList.remove('hidden');
  const storedRef = localStorage.getItem('rewardzone_ref');
  if (storedRef) {
    const input = document.getElementById('reg-refcode');
    if (input) input.value = storedRef;
  }
}

function closeRegisterModal() {
  document.getElementById('register-modal').classList.add('hidden');
}

function fillDemoLogin(username, password) {
  document.getElementById('login-identifier').value = username;
  document.getElementById('login-password').value = password;
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const identifier = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail: identifier, password })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Login failed.', 'error');
      return;
    }

    state.token = data.token;
    localStorage.setItem('rewardzone_token', data.token);
    state.user = data.user;
    renderUserLoggedIn(data.user);
    closeLoginModal();
    showToast(`Welcome back, ${data.user.username}!`, 'success');
    switchTab(state.activeTab);
  } catch (err) {
    showToast('Failed to connect to authentication server.', 'error');
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const refCode = document.getElementById('reg-refcode').value.trim();

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, ref_code: refCode })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Registration failed.', 'error');
      return;
    }

    state.token = data.token;
    localStorage.setItem('rewardzone_token', data.token);
    state.user = data.user;
    renderUserLoggedIn(data.user);
    closeRegisterModal();
    showToast(data.message || 'Account created! +100 Welcome Coins added.', 'success');
    switchTab(state.activeTab);
  } catch (err) {
    showToast('Registration request failed.', 'error');
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}

  state.token = null;
  state.user = null;
  localStorage.removeItem('rewardzone_token');
  renderUserLoggedOut();
  showToast('Logged out successfully.', 'info');
  switchTab('watch');
}

// ==========================================
// 3. WATCH TO EARN VIDEO ENGINE
// ==========================================
async function loadVideoTasks() {
  const container = document.getElementById('video-tasks-grid');
  if (!container) return;

  try {
    const res = await fetch('/api/tasks/videos', {
      headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {}
    });

    if (res.status === 401) {
      // Guest view: Show sample video cards with sign in required
      container.innerHTML = getGuestVideoCardsHtml();
      return;
    }

    const data = await res.json();
    if (!res.ok) {
      container.innerHTML = `<div class="col-span-full text-center text-rose-400 py-6">Failed to load video tasks: ${data.error}</div>`;
      return;
    }

    if (!data.tasks || data.tasks.length === 0) {
      container.innerHTML = `<div class="col-span-full text-center text-slate-500 py-10">No video tasks currently available. Check back soon!</div>`;
      return;
    }

    container.innerHTML = data.tasks.map(task => {
      const rewardFormatted = `+${task.reward_coins} Coins`;
      const usdFormatted = `$${(task.reward_coins / 1000).toFixed(2)}`;
      const durationFormatted = `${task.duration_seconds}s`;

      if (task.is_available) {
        return `
          <div class="glass-card glass-card-hover rounded-2xl overflow-hidden border border-slate-700/60 flex flex-col justify-between">
            <div>
              <!-- Video Preview Frame -->
              <div class="relative bg-slate-950 aspect-video overflow-hidden group">
                <iframe src="${task.youtube_embed_url}?controls=0&mute=1" class="w-full h-full pointer-events-none opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300" loading="lazy"></iframe>
                <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
                <div class="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-slate-900/90 text-[11px] font-mono-num font-bold text-slate-300 border border-slate-700 flex items-center gap-1">
                  <i class="fa-solid fa-clock text-violet-400"></i> ${durationFormatted}
                </div>
                <div class="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-mono-num font-bold border border-emerald-500/30">
                  ${rewardFormatted}
                </div>
              </div>

              <!-- Content Info -->
              <div class="p-5">
                <h3 class="font-bold text-white text-base line-clamp-2 leading-snug">${task.title}</h3>
                <div class="flex items-center gap-2 mt-2 text-xs text-slate-400">
                  <span class="inline-flex items-center gap-1 text-emerald-400 font-semibold"><i class="fa-solid fa-dollar-sign"></i> ${usdFormatted} USD</span>
                  <span>&bull;</span>
                  <span>Daily Task</span>
                </div>
              </div>
            </div>

            <!-- Action Button -->
            <div class="p-5 pt-0">
              <button onclick="startVideoTask(${task.id})" class="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 hover:from-violet-500 hover:to-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20 hover:shadow-violet-600/40 transition-all">
                <i class="fa-solid fa-play"></i> Watch & Earn ${rewardFormatted}
              </button>
            </div>
          </div>
        `;
      } else {
        // Cooldown State
        const remainingMinutes = Math.ceil(task.cooldown_remaining_seconds / 60);
        return `
          <div class="glass-card rounded-2xl overflow-hidden border border-slate-800 opacity-60 flex flex-col justify-between">
            <div>
              <div class="relative bg-slate-950 aspect-video overflow-hidden">
                <iframe src="${task.youtube_embed_url}?controls=0&mute=1" class="w-full h-full pointer-events-none opacity-30 grayscale" loading="lazy"></iframe>
                <div class="absolute inset-0 bg-slate-950/70 flex items-center justify-center">
                  <span class="px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-xs font-mono-num text-amber-400 font-semibold flex items-center gap-1.5">
                    <i class="fa-solid fa-lock"></i> Cooldown Active
                  </span>
                </div>
              </div>

              <div class="p-5">
                <h3 class="font-bold text-slate-400 text-base line-clamp-2">${task.title}</h3>
                <div class="text-xs text-amber-400/90 font-mono-num mt-2 flex items-center gap-1.5">
                  <i class="fa-solid fa-hourglass-half"></i> Available again in ~${remainingMinutes} min
                </div>
              </div>
            </div>

            <div class="p-5 pt-0">
              <button disabled class="w-full py-3 rounded-xl bg-slate-800 text-slate-500 font-bold text-sm cursor-not-allowed">
                Watched Today (${rewardFormatted})
              </button>
            </div>
          </div>
        `;
      }
    }).join('');

  } catch (err) {
    container.innerHTML = `<div class="col-span-full text-center text-rose-400 py-6">Error connecting to server.</div>`;
  }
}

function getGuestVideoCardsHtml() {
  return `
    <div class="col-span-full glass-card p-8 rounded-2xl text-center border border-slate-700/60 max-w-xl mx-auto my-6">
      <div class="w-16 h-16 rounded-2xl bg-violet-600/20 text-violet-400 flex items-center justify-center text-2xl mx-auto mb-4 border border-violet-500/30">
        <i class="fa-solid fa-play"></i>
      </div>
      <h3 class="text-xl font-bold text-white mb-2">Sign In to Start Watching & Earning</h3>
      <p class="text-sm text-slate-400 mb-6">Create a free account to unlock high-yield video streams, daily bonuses, and instant crypto cashouts.</p>
      <div class="flex items-center justify-center gap-4">
        <button onclick="openLoginModal()" class="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm border border-slate-700">
          Sign In
        </button>
        <button onclick="openRegisterModal()" class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 hover:from-violet-500 hover:to-emerald-500 text-white font-bold text-sm shadow-lg shadow-violet-600/20">
          Register +100 Coins
        </button>
      </div>
    </div>
  `;
}

// Start Video Watch Session
async function startVideoTask(taskId) {
  if (!state.user) {
    openLoginModal();
    return;
  }

  try {
    const res = await fetch('/api/tasks/start-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ taskId })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to start video task.', 'error');
      return;
    }

    state.videoSession = data;
    state.videoTotalDuration = data.durationSeconds;
    state.videoSecondsRemaining = data.durationSeconds;

    // Populate modal
    document.getElementById('modal-video-title').textContent = data.title;
    document.getElementById('modal-reward-display').textContent = `+${data.rewardCoins} Coins ($${(data.rewardCoins / 1000).toFixed(2)})`;
    
    // Auto-embed with autoplay and allow params
    const iframe = document.getElementById('modal-video-iframe');
    const autoPlayUrl = data.youtubeEmbedUrl.includes('?') 
      ? `${data.youtubeEmbedUrl}&autoplay=1` 
      : `${data.youtubeEmbedUrl}?autoplay=1`;
    iframe.src = autoPlayUrl;

    // Sponsor link
    const sponsorBox = document.getElementById('modal-sponsor-link-box');
    const sponsorBtn = document.getElementById('modal-sponsor-link-btn');
    if (data.adDirectLink) {
      sponsorBtn.href = data.adDirectLink;
      sponsorBox.classList.remove('hidden');
    } else {
      sponsorBox.classList.add('hidden');
    }

    // Reset button & timer display
    const claimBtn = document.getElementById('claim-video-btn');
    claimBtn.disabled = true;
    claimBtn.className = 'w-full py-3 rounded-xl bg-slate-800 text-slate-500 font-black text-sm uppercase tracking-wider cursor-not-allowed transition-all';
    claimBtn.innerHTML = '<i class="fa-solid fa-lock mr-2"></i> Complete Timer To Claim';

    updateTimerDisplay();
    document.getElementById('video-modal').classList.remove('hidden');

    // Launch Anti-Cheat active tab interval
    startAntiCheatTimer();
  } catch (err) {
    showToast('Failed to initialize video session.', 'error');
  }
}

function startAntiCheatTimer() {
  if (state.videoTimer) clearInterval(state.videoTimer);

  state.videoTimer = setInterval(() => {
    // ANTI-CHEAT CHECK: Tab must be actively focused and visible
    const hasFocus = document.hasFocus();
    const isVisible = document.visibilityState === 'visible';
    const isTabEligible = hasFocus && isVisible;

    const warningEl = document.getElementById('tab-inactive-warning');

    if (!isTabEligible) {
      // User switched tabs or minimized window -> PAUSE TIMER
      if (warningEl) warningEl.classList.remove('hidden');
      return;
    } else {
      if (warningEl) warningEl.classList.add('hidden');
    }

    // Decrement countdown
    if (state.videoSecondsRemaining > 0) {
      state.videoSecondsRemaining--;
      updateTimerDisplay();

      if (state.videoSecondsRemaining === 0) {
        clearInterval(state.videoTimer);
        unlockClaimButton();
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  const mins = Math.floor(state.videoSecondsRemaining / 60);
  const secs = state.videoSecondsRemaining % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const countdownEl = document.getElementById('countdown-display');
  if (countdownEl) countdownEl.textContent = formatted;

  const percent = Math.min(100, Math.round(((state.videoTotalDuration - state.videoSecondsRemaining) / state.videoTotalDuration) * 100));
  const progressBar = document.getElementById('timer-progress-bar');
  if (progressBar) progressBar.style.width = `${percent}%`;
}

function unlockClaimButton() {
  const claimBtn = document.getElementById('claim-video-btn');
  if (!claimBtn) return;

  claimBtn.disabled = false;
  claimBtn.className = 'w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black text-sm uppercase tracking-wider glow-emerald shadow-lg shadow-emerald-500/20 cursor-pointer transition-all animate-bounce';
  claimBtn.innerHTML = `<i class="fa-solid fa-gift mr-2"></i> Claim +${state.videoSession.rewardCoins} Coins!`;
  showToast('Watch completed! Click Claim to receive your coins.', 'success');
}

async function handleClaimVideoReward() {
  if (!state.videoSession) return;

  const claimBtn = document.getElementById('claim-video-btn');
  claimBtn.disabled = true;
  claimBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Verifying Server Anti-Cheat...';

  try {
    const res = await fetch('/api/tasks/claim-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ sessionToken: state.videoSession.sessionToken })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Cheat detected or claim rejected.', 'error');
      claimBtn.disabled = false;
      claimBtn.innerHTML = 'Try Claim Again';
      return;
    }

    showToast(data.message || `+${data.rewardCoins} Coins added to your balance!`, 'success');
    closeVideoModal();
    await refreshUserData();
    loadVideoTasks();
  } catch (err) {
    showToast('Failed to claim reward. Please check your connection.', 'error');
    claimBtn.disabled = false;
  }
}

function closeVideoModal() {
  if (state.videoTimer) clearInterval(state.videoTimer);
  state.videoSession = null;
  const iframe = document.getElementById('modal-video-iframe');
  if (iframe) iframe.src = ''; // Stop video playback
  document.getElementById('video-modal').classList.add('hidden');
}

// ==========================================
// 4. CPA OFFERWALLS & S2S POSTBACKS
// ==========================================
function syncOfferwallTab() {
  if (state.user) {
    const offerwallUserId = document.getElementById('offerwall-user-id');
    const offerwallSubidLabel = document.getElementById('offerwall-subid-label');
    if (offerwallUserId) offerwallUserId.textContent = `#${state.user.id} (${state.user.username})`;
    if (offerwallSubidLabel) offerwallSubidLabel.textContent = state.user.id;
  }
}

// Simulate Offerwall Postback Completion (Instant Test Tool)
async function simulateOfferwallPostback(payout, offerName) {
  if (!state.user) {
    openLoginModal();
    return;
  }

  showToast(`Simulating S2S Postback for "${offerName}" (+${payout} Coins)...`, 'info');

  try {
    // Call test helper to generate signed test URL
    const genRes = await fetch(`/api/postback/generate-test-url?payout=${payout}`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const genData = await genRes.json();

    // Trigger the generated postback webhook
    const postbackRes = await fetch(genData.testUrl);
    const postbackText = await postbackRes.text();

    if (postbackText === '1' || postbackRes.ok) {
      showToast(`🎉 Offer completed! Credited +${payout} Coins via S2S Postback Webhook.`, 'success');
      await refreshUserData();
    } else {
      showToast(`Postback response: ${postbackText}`, 'error');
    }
  } catch (err) {
    showToast('Error simulating postback webhook.', 'error');
  }
}

// ==========================================
// 5. DAILY BONUS SYSTEM
// ==========================================
async function loadDailyBonusStatus() {
  if (!state.user) return;

  try {
    const res = await fetch('/api/tasks/daily-status', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();

    const claimBtn = document.getElementById('claim-daily-btn');
    const countdownWrapper = document.getElementById('daily-countdown-wrapper');
    const navDailyText = document.getElementById('nav-daily-text');

    if (data.canClaim) {
      if (claimBtn) {
        claimBtn.disabled = false;
        claimBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      }
      if (countdownWrapper) countdownWrapper.classList.add('hidden');
      if (navDailyText) navDailyText.textContent = 'Daily Bonus Ready!';
    } else {
      if (claimBtn) {
        claimBtn.disabled = true;
        claimBtn.classList.add('opacity-50', 'cursor-not-allowed');
      }
      if (countdownWrapper) countdownWrapper.classList.remove('hidden');
      startDailyCountdown(data.secondsRemaining);
    }
  } catch (err) {
    console.error('Failed to load daily bonus status', err);
  }
}

function startDailyCountdown(seconds) {
  if (state.dailyTimerInterval) clearInterval(state.dailyTimerInterval);
  let rem = seconds;

  const update = () => {
    if (rem <= 0) {
      clearInterval(state.dailyTimerInterval);
      loadDailyBonusStatus();
      return;
    }
    const h = Math.floor(rem / 3600);
    const m = Math.floor((rem % 3600) / 60);
    const s = rem % 60;
    const formatted = `${h}h ${m}m ${s}s`;

    const timerEl = document.getElementById('daily-timer');
    if (timerEl) timerEl.textContent = formatted;

    const navDailyText = document.getElementById('nav-daily-text');
    if (navDailyText) navDailyText.textContent = `Daily: ${formatted}`;

    rem--;
  };

  update();
  state.dailyTimerInterval = setInterval(update, 1000);
}

async function handleClaimDailyBonus() {
  if (!state.user) {
    openLoginModal();
    return;
  }

  try {
    const res = await fetch('/api/tasks/daily-checkin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to claim daily bonus.', 'error');
      return;
    }

    showToast(data.message || '+25 Coins added to your balance!', 'success');
    await refreshUserData();
    loadDailyBonusStatus();
  } catch (err) {
    showToast('Failed to claim daily bonus.', 'error');
  }
}

function handleQuickDailyCheckin() {
  switchTab('daily');
  handleClaimDailyBonus();
}

// ==========================================
// 6. REFERRAL HUB & COMMISSION SYSTEM
// ==========================================
async function loadReferralHub() {
  if (!state.user) return;

  const origin = window.location.origin;
  const refLink = `${origin}/?ref=${state.user.referral_code}`;

  const linkInput = document.getElementById('referral-link-input');
  if (linkInput) linkInput.value = refLink;

  document.getElementById('stat-referral-code').textContent = state.user.referral_code;
  document.getElementById('stat-referrals-count').textContent = state.user.referrals_count || 0;
  document.getElementById('stat-referrals-earnings').textContent = (state.user.referral_earnings || 0).toLocaleString();
  document.getElementById('stat-referrals-earnings-usd').textContent = `$${(((state.user.referral_earnings || 0)) / 1000).toFixed(2)} USD earned from 10% commission`;

  // Load referrals list
  try {
    const res = await fetch('/api/referrals/my', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('referrals-table-body');
    if (!tbody) return;

    if (!data.referrals || data.referrals.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="px-4 py-6 text-center text-slate-500">
            No referrals yet. Share your link above to start earning passive 10% commissions!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.referrals.map(r => `
      <tr class="hover:bg-slate-800/40">
        <td class="px-4 py-3 font-semibold text-white flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-violet-600/30 text-violet-300 text-xs flex items-center justify-center font-bold">
            ${r.username.charAt(0).toUpperCase()}
          </div>
          ${r.username}
        </td>
        <td class="px-4 py-3 text-slate-400 font-mono-num text-xs">${new Date(r.created_at).toLocaleDateString()}</td>
        <td class="px-4 py-3 text-slate-300 font-mono-num">${(r.total_earned || 0).toLocaleString()} Coins</td>
        <td class="px-4 py-3 text-emerald-400 font-mono-num font-bold">+${(r.commission_from_user || 0).toLocaleString()} Coins</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load referrals list', err);
  }
}

function copyReferralLink() {
  const input = document.getElementById('referral-link-input');
  if (!input) return;

  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Referral link copied to clipboard!', 'success');
  }).catch(() => {
    input.select();
    document.execCommand('copy');
    showToast('Referral link copied to clipboard!', 'success');
  });
}

function shareOnWhatsApp() {
  if (!state.user) return;
  const refLink = `${window.location.origin}/?ref=${state.user.referral_code}`;
  const text = encodeURIComponent(`🔥 Join me on RewardZone! Watch short crypto videos and complete tasks to earn free USDT, LTC, and Solana. Sign up with my link for a +100 Coins Welcome Bonus:\n${refLink}`);
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function shareOnTwitter() {
  if (!state.user) return;
  const refLink = `${window.location.origin}/?ref=${state.user.referral_code}`;
  const text = encodeURIComponent(`Earning free crypto every day with @RewardZone! Watch short videos & get paid in USDT, LTC, or SOL. Get +100 Coins bonus using my link:\n${refLink}`);
  window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
}

// ==========================================
// 7. CASHOUT & WITHDRAWALS
// ==========================================
async function loadWithdrawalTab() {
  if (!state.user) return;
  updateWithdrawalUsdPreview();
  loadUserWithdrawals();
}

function updateWithdrawalUsdPreview() {
  const coinsInput = document.getElementById('withdraw-amount-coins');
  const usdPreview = document.getElementById('withdraw-usd-preview');
  if (!coinsInput || !usdPreview) return;

  const coins = parseInt(coinsInput.value, 10) || 0;
  const usd = (coins / 1000).toFixed(2);
  usdPreview.textContent = `= $${usd} USD`;
}

function setWithdrawAmount(coins) {
  const input = document.getElementById('withdraw-amount-coins');
  if (input) {
    input.value = coins;
    updateWithdrawalUsdPreview();
  }
}

function setMaxWithdrawAmount() {
  if (!state.user) return;
  const input = document.getElementById('withdraw-amount-coins');
  if (input) {
    input.value = state.user.balance_coins || 0;
    updateWithdrawalUsdPreview();
  }
}

async function handleWithdrawalSubmit(e) {
  e.preventDefault();
  if (!state.user) {
    openLoginModal();
    return;
  }

  const networkRadio = document.querySelector('input[name="cryptoNetwork"]:checked');
  const cryptoNetwork = networkRadio ? networkRadio.value : 'USDT-BEP20';
  const walletAddress = document.getElementById('withdraw-wallet-addr').value.trim();
  const amountCoins = parseInt(document.getElementById('withdraw-amount-coins').value, 10);

  if (!amountCoins || amountCoins < 5000) {
    showToast('Minimum withdrawal is 5,000 Coins ($5.00 USD).', 'error');
    return;
  }

  if (amountCoins > state.user.balance_coins) {
    showToast(`Insufficient balance. You have ${state.user.balance_coins.toLocaleString()} Coins.`, 'error');
    return;
  }

  try {
    const res = await fetch('/api/withdrawals/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ amountCoins, cryptoNetwork, walletAddress })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Withdrawal request failed.', 'error');
      return;
    }

    showToast(data.message || 'Withdrawal request submitted successfully!', 'success');
    document.getElementById('withdrawal-form').reset();
    updateWithdrawalUsdPreview();
    await refreshUserData();
    loadUserWithdrawals();
  } catch (err) {
    showToast('Failed to submit withdrawal request.', 'error');
  }
}

async function loadUserWithdrawals() {
  if (!state.user) return;
  try {
    const res = await fetch('/api/withdrawals/my', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('user-withdrawals-table-body');
    if (!tbody) return;

    if (!data.withdrawals || data.withdrawals.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="px-4 py-6 text-center text-slate-500">
            No withdrawal requests yet. Complete tasks to reach the 5,000 Coins threshold!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.withdrawals.map(w => {
      let statusBadge = '';
      if (w.status === 'pending') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30"><i class="fa-solid fa-hourglass-start mr-1"></i> Pending Review</span>';
      } else if (w.status === 'approved') {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"><i class="fa-solid fa-circle-check mr-1"></i> Paid / Approved</span>';
      } else {
        statusBadge = '<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30"><i class="fa-solid fa-circle-xmark mr-1"></i> Rejected (Refunded)</span>';
      }

      const shortAddr = `${w.wallet_address.substring(0, 8)}...${w.wallet_address.substring(w.wallet_address.length - 6)}`;

      return `
        <tr class="hover:bg-slate-800/40">
          <td class="px-4 py-3 font-mono-num text-xs text-slate-400">#${w.id}</td>
          <td class="px-4 py-3 text-slate-400 font-mono-num text-xs">${new Date(w.created_at).toLocaleString()}</td>
          <td class="px-4 py-3 font-semibold text-white">${w.crypto_network}</td>
          <td class="px-4 py-3 font-mono-num text-xs text-slate-300" title="${w.wallet_address}">${shortAddr}</td>
          <td class="px-4 py-3 font-mono-num text-white">${w.amount_coins.toLocaleString()} Coins</td>
          <td class="px-4 py-3 font-mono-num text-emerald-400 font-bold">$${w.amount_usd.toFixed(2)}</td>
          <td class="px-4 py-3">${statusBadge}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load withdrawals', err);
  }
}

// ==========================================
// 8. ACTIVITY & TASK LOG
// ==========================================
async function loadUserHistory() {
  if (!state.user) return;
  try {
    const res = await fetch('/api/user/history', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('user-history-table-body');
    if (!tbody) return;

    if (!data.history || data.history.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="px-4 py-6 text-center text-slate-500">
            No activity logged yet. Watch a video stream to start earning!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.history.map(item => {
      let typeLabel = '';
      let typeColor = 'bg-slate-700 text-slate-200';

      if (item.task_type === 'video') {
        typeLabel = 'Video Stream Watch';
        typeColor = 'bg-violet-500/20 text-violet-300 border border-violet-500/30';
      } else if (item.task_type === 'offerwall') {
        typeLabel = 'Offerwall / CPA Task';
        typeColor = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      } else if (item.task_type === 'daily_checkin') {
        typeLabel = 'Daily Loyalty Bonus';
        typeColor = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
      } else if (item.task_type === 'referral_commission') {
        typeLabel = '10% Referral Commission';
        typeColor = 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
      } else if (item.task_type === 'welcome_bonus') {
        typeLabel = 'Welcome Signup Bonus';
        typeColor = 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
      } else {
        typeLabel = item.task_type;
      }

      const details = item.video_title || (item.task_type === 'referral_commission' ? 'Tiered Commission from Partner Task' : 'Completed Task');

      return `
        <tr class="hover:bg-slate-800/40">
          <td class="px-4 py-3">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${typeColor}">
              ${typeLabel}
            </span>
          </td>
          <td class="px-4 py-3 text-slate-200 font-medium text-xs sm:text-sm">${details}</td>
          <td class="px-4 py-3 text-slate-400 font-mono-num text-xs">${new Date(item.created_at).toLocaleString()}</td>
          <td class="px-4 py-3 font-mono-num text-emerald-400 font-bold">+${item.reward_coins} Coins</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load history', err);
  }
}

// ==========================================
// 9. TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium';

  if (type === 'success') {
    toast.className += ' bg-slate-900 border-emerald-500/50 text-white';
    toast.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400 text-lg"></i> <span>${message}</span>`;
  } else if (type === 'error') {
    toast.className += ' bg-slate-900 border-rose-500/50 text-white';
    toast.innerHTML = `<i class="fa-solid fa-circle-exclamation text-rose-400 text-lg"></i> <span>${message}</span>`;
  } else {
    toast.className += ' bg-slate-900 border-cyan-500/50 text-white';
    toast.innerHTML = `<i class="fa-solid fa-circle-info text-cyan-400 text-lg"></i> <span>${message}</span>`;
  }

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

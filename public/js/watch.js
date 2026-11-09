// RewardZone Dedicated Watch & Earn Client Logic
// Enhanced with Active Tab-Focus Anti-Cheat & Automatic Pause

const watchState = {
  session: null,
  interval: null,
  secondsRemaining: 0,
  totalDuration: 0,
  isPaused: false,
  captchaCode: ''
};

document.addEventListener('DOMContentLoaded', () => {
  setupFocusListeners();
  loadVideoTasks();
});

// Helper: Determine if user is legitimately engaged with current browser tab
function isUserTabActive() {
  // If tab is hidden or minimized, user is definitely away
  if (document.hidden || document.visibilityState !== 'visible') {
    return false;
  }
  // If main document has focus or user is interacting with iframe inside this tab
  if (document.hasFocus()) {
    return true;
  }
  if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
    return true;
  }
  return false;
}

// Pause session immediately with prominent visual indicators
function pauseWatchSession(message = 'Tab Inactive — Timer Paused! Stay focused on this window to earn.') {
  if (watchState.isPaused) return;
  watchState.isPaused = true;

  const warning = document.getElementById('tab-warning');
  if (warning) {
    warning.textContent = message;
    warning.classList.remove('hidden');
  }

  const timerEl = document.getElementById('timer-display');
  if (timerEl) {
    timerEl.classList.add('timer-paused');
  }

  const badge = document.getElementById('timer-paused-badge');
  if (badge) {
    badge.classList.remove('hidden');
  }

  const overlay = document.getElementById('video-paused-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
  }

  const claimBtn = document.getElementById('claim-btn');
  if (claimBtn && watchState.secondsRemaining > 0) {
    claimBtn.textContent = 'Stream Paused — Keep Tab Focused';
  }
}

// Resume session and restore countdown visuals
function resumeWatchSession() {
  if (!watchState.isPaused) return;
  watchState.isPaused = false;

  const warning = document.getElementById('tab-warning');
  if (warning) {
    warning.classList.add('hidden');
  }

  const timerEl = document.getElementById('timer-display');
  if (timerEl) {
    timerEl.classList.remove('timer-paused');
  }

  const badge = document.getElementById('timer-paused-badge');
  if (badge) {
    badge.classList.add('hidden');
  }

  const overlay = document.getElementById('video-paused-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }

  const claimBtn = document.getElementById('claim-btn');
  if (claimBtn && watchState.secondsRemaining > 0) {
    claimBtn.textContent = 'Complete Timer To Claim';
  }
}

// Global window and tab focus listeners for instantaneous pause response
function setupFocusListeners() {
  const evaluateState = () => {
    if (!watchState.session || watchState.secondsRemaining <= 0) return;

    if (!isUserTabActive()) {
      pauseWatchSession();
    } else {
      resumeWatchSession();
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && watchState.session && watchState.secondsRemaining > 0) {
      showToast('⚠️ Tab Inactive: Browser tab must remain active to accumulate watch time.', 'warning');
    }
    evaluateState();
  });
  window.addEventListener('blur', evaluateState);
  window.addEventListener('focus', evaluateState);
}

// Load Video Tasks Grid
async function loadVideoTasks() {
  const container = document.getElementById('video-grid');
  if (!container) return;

  const token = localStorage.getItem('rewardzone_token');
  try {
    const res = await fetch('/api/tasks/videos', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });

    if (res.status === 401) {
      container.innerHTML = `
        <div class="col-span-full mono-card p-8 text-center max-w-md mx-auto my-6">
          <h3 class="text-base font-bold text-white mb-2">Sign In Required</h3>
          <p class="text-xs text-zinc-400 mb-5">Please sign in to your account to view and complete reward streams.</p>
          <div class="flex items-center justify-center gap-3">
            <a href="/login?redirect=/watch" class="btn-primary text-xs py-2 px-4">Sign In</a>
            <a href="/register" class="btn-secondary text-xs py-2 px-4">Register</a>
          </div>
        </div>
      `;
      return;
    }

    const data = await res.json();
    if (!res.ok) {
      container.innerHTML = `<div class="col-span-full text-center text-xs text-red-400 py-6">${data.error}</div>`;
      return;
    }

    if (!data.tasks || data.tasks.length === 0) {
      container.innerHTML = `<div class="col-span-full text-center text-xs text-zinc-500 py-8 font-mono">No video tasks available right now.</div>`;
      return;
    }

    container.innerHTML = data.tasks.map(t => {
      const rewardText = `+${t.reward_coins} Coins`;
      const usdValue = `$${(t.reward_coins / 1000).toFixed(2)}`;

      if (t.is_available) {
        return `
          <div class="mono-card mono-card-interactive p-4 flex flex-col justify-between">
            <div>
              <div class="relative bg-zinc-950 aspect-video rounded-lg overflow-hidden border border-zinc-800 mb-3">
                <iframe src="${t.youtube_embed_url}?controls=0&mute=1" class="w-full h-full pointer-events-none opacity-80" loading="lazy"></iframe>
                <div class="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-zinc-300 border border-zinc-800">
                  ${t.duration_seconds}s
                </div>
                <div class="absolute top-2 right-2 px-2 py-0.5 rounded bg-white text-black text-[11px] font-mono font-bold">
                  ${rewardText}
                </div>
              </div>

              <h3 class="font-semibold text-white text-sm line-clamp-2 leading-snug">${t.title}</h3>
              <div class="text-[11px] text-zinc-400 font-mono mt-1">
                Value: ${usdValue} USD &bull; Refreshes daily
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-zinc-800/80">
              <button onclick="startStream(${t.id})" class="btn-primary w-full text-xs py-2">
                Watch & Earn ${rewardText}
              </button>
            </div>
          </div>
        `;
      } else {
        const remMin = Math.ceil(t.cooldown_remaining_seconds / 60);
        return `
          <div class="mono-card p-4 opacity-50 flex flex-col justify-between">
            <div>
              <div class="relative bg-zinc-950 aspect-video rounded-lg overflow-hidden border border-zinc-900 mb-3">
                <iframe src="${t.youtube_embed_url}?controls=0&mute=1" class="w-full h-full pointer-events-none opacity-20 grayscale" loading="lazy"></iframe>
                <div class="absolute inset-0 flex items-center justify-center">
                  <span class="px-2.5 py-1 rounded bg-black/90 border border-zinc-800 text-[10px] font-mono text-zinc-400">
                    Cooldown Active
                  </span>
                </div>
              </div>

              <h3 class="font-medium text-zinc-500 text-sm line-clamp-2">${t.title}</h3>
              <div class="text-[11px] text-zinc-500 font-mono mt-1">
                Available again in ~${remMin} min
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-zinc-900">
              <button disabled class="btn-primary w-full text-xs py-2 opacity-30 cursor-not-allowed">
                Completed (${rewardText})
              </button>
            </div>
          </div>
        `;
      }
    }).join('');

  } catch (err) {
    container.innerHTML = `<div class="col-span-full text-center text-xs text-red-400 py-6">Error loading tasks.</div>`;
  }
}

// Start Stream & Open Cinema Modal
async function startStream(taskId) {
  const token = localStorage.getItem('rewardzone_token');
  if (!token) {
    window.location.href = '/login?redirect=/watch';
    return;
  }

  try {
    const res = await fetch('/api/tasks/start-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ taskId })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to start stream.', 'error');
      return;
    }

    watchState.session = data;
    watchState.totalDuration = data.durationSeconds;
    watchState.secondsRemaining = data.durationSeconds;
    watchState.isPaused = false;

    document.getElementById('modal-title').textContent = data.title;
    document.getElementById('modal-reward').textContent = `+${data.rewardCoins} Coins ($${(data.rewardCoins / 1000).toFixed(2)})`;

    const iframe = document.getElementById('modal-iframe');
    const autoUrl = data.youtubeEmbedUrl.includes('?') 
      ? `${data.youtubeEmbedUrl}&autoplay=1` 
      : `${data.youtubeEmbedUrl}?autoplay=1`;
    iframe.src = autoUrl;

    const sponsorBox = document.getElementById('sponsor-link-box');
    const sponsorBtn = document.getElementById('sponsor-link-btn');
    if (data.adDirectLink) {
      sponsorBtn.href = data.adDirectLink;
      sponsorBox.classList.remove('hidden');
    } else {
      sponsorBox.classList.add('hidden');
    }

    const claimBtn = document.getElementById('claim-btn');
    claimBtn.disabled = true;
    claimBtn.textContent = 'Complete Timer To Claim';

    // Clear any previous pause visual states
    resumeWatchSession();
    updateTimerDisplay();
    document.getElementById('watch-modal').classList.remove('hidden');

    launchAntiCheatCountdown();
  } catch (err) {
    showToast('Failed to start session.', 'error');
  }
}

// Anti-Cheat Countdown Engine (Active Tab Verification)
function launchAntiCheatCountdown() {
  if (watchState.interval) clearInterval(watchState.interval);

  watchState.interval = setInterval(() => {
    // 1. Strict Active-Tab Check
    const active = isUserTabActive();
    if (!active) {
      pauseWatchSession();
      return; // Strictly DO NOT decrement timer when inactive
    }

    // 2. If user returned to tab, resume
    if (watchState.isPaused) {
      resumeWatchSession();
    }

    // 3. Decrement countdown tick
    if (watchState.secondsRemaining > 0) {
      watchState.secondsRemaining--;
      updateTimerDisplay();

      if (watchState.secondsRemaining === 0) {
        clearInterval(watchState.interval);
        const claimBtn = document.getElementById('claim-btn');
        claimBtn.disabled = false;
        claimBtn.textContent = `Claim +${watchState.session.rewardCoins} Coins`;
        showToast('🎉 Stream completed! Click claim to receive your reward.', 'success');
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(watchState.secondsRemaining / 60);
  const s = watchState.secondsRemaining % 60;
  const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const timerEl = document.getElementById('timer-display');
  if (timerEl) timerEl.textContent = formatted;

  const percent = Math.min(100, Math.round(((watchState.totalDuration - watchState.secondsRemaining) / watchState.totalDuration) * 100));
  const bar = document.getElementById('timer-bar');
  if (bar) bar.style.width = `${percent}%`;
}

// Open 4-digit captcha verification modal before claiming
function handleClaimVideo() {
  if (!watchState.session) return;

  // Generate random 4-digit code
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  watchState.captchaCode = code;

  const codeDisplay = document.getElementById('captcha-code-display');
  if (codeDisplay) codeDisplay.textContent = code;

  const input = document.getElementById('captcha-input');
  if (input) {
    input.value = '';
    input.onkeyup = (e) => {
      if (e.key === 'Enter') submitCaptchaVerification();
    };
  }

  const err = document.getElementById('captcha-error');
  if (err) err.classList.add('hidden');

  const modal = document.getElementById('claim-captcha-modal');
  if (modal) modal.classList.remove('hidden');

  setTimeout(() => {
    if (input) input.focus();
  }, 100);
}

function closeCaptchaModal() {
  const modal = document.getElementById('claim-captcha-modal');
  if (modal) modal.classList.add('hidden');
  const claimBtn = document.getElementById('claim-btn');
  if (claimBtn && watchState.session && watchState.secondsRemaining === 0) {
    claimBtn.disabled = false;
    claimBtn.textContent = `Claim +${watchState.session.rewardCoins} Coins`;
  }
}

async function submitCaptchaVerification() {
  const input = document.getElementById('captcha-input');
  const err = document.getElementById('captcha-error');
  const userEntered = input ? input.value.trim() : '';

  if (userEntered !== watchState.captchaCode) {
    if (err) {
      err.textContent = 'Incorrect verification code. Please try again.';
      err.classList.remove('hidden');
    }
    // Generate new code on mismatch
    const newCode = Math.floor(1000 + Math.random() * 9000).toString();
    watchState.captchaCode = newCode;
    const codeDisplay = document.getElementById('captcha-code-display');
    if (codeDisplay) codeDisplay.textContent = newCode;
    if (input) {
      input.value = '';
      input.focus();
    }
    return;
  }

  // Captcha passed!
  if (err) err.classList.add('hidden');
  const submitBtn = document.getElementById('captcha-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';
  }

  await executeClaimVideo();

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Confirm & Claim';
  }
}

// Execute Claim Video Reward with backend
async function executeClaimVideo() {
  if (!watchState.session) return;

  const claimBtn = document.getElementById('claim-btn');
  if (claimBtn) {
    claimBtn.disabled = true;
    claimBtn.textContent = 'Verifying Server...';
  }

  const token = localStorage.getItem('rewardzone_token');

  try {
    const res = await fetch('/api/tasks/claim-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ sessionToken: watchState.session.sessionToken })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Claim failed.', 'error');
      if (claimBtn) {
        claimBtn.disabled = false;
        claimBtn.textContent = 'Retry Claim';
      }
      return;
    }

    showToast(data.message || `+${data.rewardCoins} Coins earned!`, 'success');
    closeCaptchaModal();
    closeWatchModal();
    checkSession();
    loadVideoTasks();
  } catch (err) {
    showToast('Network error claiming reward.', 'error');
    if (claimBtn) {
      claimBtn.disabled = false;
      claimBtn.textContent = 'Retry Claim';
    }
  }
}

// Close Cinema Modal & Clean Up State
function closeWatchModal() {
  if (watchState.interval) clearInterval(watchState.interval);
  watchState.session = null;
  watchState.isPaused = false;

  const warning = document.getElementById('tab-warning');
  if (warning) warning.classList.add('hidden');

  const timerEl = document.getElementById('timer-display');
  if (timerEl) timerEl.classList.remove('timer-paused');

  const badge = document.getElementById('timer-paused-badge');
  if (badge) badge.classList.add('hidden');

  const overlay = document.getElementById('video-paused-overlay');
  if (overlay) overlay.classList.add('hidden');

  const iframe = document.getElementById('modal-iframe');
  if (iframe) iframe.src = '';

  document.getElementById('watch-modal').classList.add('hidden');
}

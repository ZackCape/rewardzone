// RewardZone Dedicated Dashboard & 7-Day Consistency Streak Client Logic
// Standard Daily Bonus Reward: +5 Coins

let streakTimerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  // Check session via common.js
  if (typeof checkSession === 'function') {
    checkSession();
  }
});

function onUserLoaded(user) {
  const userEl = document.getElementById('dash-username');
  if (userEl) userEl.textContent = user.username;

  const balanceEl = document.getElementById('dash-balance-coins');
  if (balanceEl) balanceEl.textContent = (user.balance_coins || 0).toLocaleString();

  const usdEl = document.getElementById('dash-balance-usd');
  if (usdEl) usdEl.textContent = `$${((user.balance_coins || 0) / 1000).toFixed(2)} USD`;

  const totalEl = document.getElementById('dash-total-earned');
  if (totalEl) totalEl.textContent = (user.total_earned || 0).toLocaleString();

  const refCountEl = document.getElementById('dash-referrals-count');
  if (refCountEl) refCountEl.textContent = user.referrals_count || 0;

  const refEarningsEl = document.getElementById('dash-referral-earnings');
  if (refEarningsEl) refEarningsEl.textContent = `${(user.referral_earnings || 0).toLocaleString()} commission coins`;

  const tasksCountEl = document.getElementById('dash-tasks-count');
  if (tasksCountEl) tasksCountEl.textContent = user.completed_tasks_count || 0;

  loadStreakStatus();
}

function onUserLoggedOut() {
  if (streakTimerInterval) clearInterval(streakTimerInterval);
  window.location.href = '/login?redirect=/dashboard';
}

async function loadStreakStatus() {
  const token = localStorage.getItem('rewardzone_token');
  if (!token) return;

  try {
    const res = await fetch('/api/tasks/daily-status', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) return;

    const streakBadge = document.getElementById('streak-counter-badge');
    if (streakBadge) {
      streakBadge.textContent = `${data.streakDays || 0} Day Streak`;
    }

    const claimBtn = document.getElementById('streak-claim-btn');
    const cooldownText = document.getElementById('streak-cooldown-text');
    const cooldownTimer = document.getElementById('streak-cooldown-timer');

    if (streakTimerInterval) clearInterval(streakTimerInterval);

    if (data.canClaim) {
      if (claimBtn) {
        claimBtn.disabled = false;
        claimBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        claimBtn.textContent = "Claim Today's +5 Coins";
      }
      if (cooldownText) cooldownText.classList.add('hidden');
    } else {
      if (claimBtn) {
        claimBtn.disabled = true;
        claimBtn.classList.add('opacity-50', 'cursor-not-allowed');
        claimBtn.textContent = 'Claimed for Today ✓';
      }
      if (cooldownText) cooldownText.classList.remove('hidden');

      let remaining = data.secondsRemaining || 0;
      const updateTimer = () => {
        if (remaining <= 0) {
          clearInterval(streakTimerInterval);
          loadStreakStatus();
          return;
        }
        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        const s = remaining % 60;
        if (cooldownTimer) {
          cooldownTimer.textContent = `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
        }
        remaining--;
      };
      updateTimer();
      streakTimerInterval = setInterval(updateTimer, 1000);
    }

    const grid = document.getElementById('streak-days-grid');
    if (grid && data.streakList) {
      grid.innerHTML = data.streakList.map(item => {
        const isDone = item.completed;
        const isCurrent = item.isCurrent && data.canClaim;
        let borderClass = 'border-zinc-800 bg-zinc-950/60 text-zinc-500';
        let badgeIcon = '🔒';

        if (isDone) {
          borderClass = 'border-zinc-500 bg-zinc-900 text-white';
          badgeIcon = '✓';
        } else if (isCurrent) {
          borderClass = 'border-white bg-zinc-900/90 text-white shadow-sm ring-1 ring-white/20';
          badgeIcon = '🔥';
        }

        return `
          <div class="rounded-lg border ${borderClass} p-2.5 sm:p-3 text-center flex flex-col items-center justify-between min-h-[90px] transition-all">
            <span class="text-[10px] font-mono uppercase tracking-wider block text-zinc-400">Day ${item.day}</span>
            <div class="text-base sm:text-lg my-1">${badgeIcon}</div>
            <span class="text-[10px] font-mono font-bold block">+${item.rewardCoins} Coins</span>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Streak status error', err);
  }
}

async function claimDailyStreak() {
  const token = localStorage.getItem('rewardzone_token');
  if (!token) return;

  const btn = document.getElementById('streak-claim-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Claiming...';
  }

  try {
    const res = await fetch('/api/tasks/daily-checkin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to claim daily bonus.', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Claim Today's +5 Coins";
      }
      return;
    }

    showToast(data.message || '✨ Daily bonus claimed! +5 Coins', 'success');
    if (typeof checkSession === 'function') {
      checkSession();
    }
    loadStreakStatus();
  } catch (err) {
    showToast('Network error claiming bonus.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Claim Today's +5 Coins";
    }
  }
}

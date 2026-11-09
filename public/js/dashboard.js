// RewardZone Dedicated Dashboard & 7-Day Consistency Streak Client Logic
// Standard Daily Bonus Reward: +5 Coins

let streakTimerInterval = null;
let currentPayoutsList = [];

document.addEventListener('DOMContentLoaded', () => {
  // Check session via common.js
  if (typeof checkSession === 'function') {
    checkSession();
  }
  loadRecentPayouts();
  setInterval(loadRecentPayouts, 60000);
});

// Load Live Recent Payouts Ticker
async function loadRecentPayouts() {
  try {
    const res = await fetch('/api/public/recent-payouts');
    const data = await res.json();
    const track = document.getElementById('payout-ticker-track');
    if (!track || !data.payouts || !data.payouts.length) return;
    currentPayoutsList = data.payouts;

    const renderItem = (p, idx) => `
      <div onclick="openReceiptModal(${idx % data.payouts.length})" class="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-zinc-900/60 hover:bg-zinc-800/90 border border-zinc-800/80 hover:border-zinc-500 text-xs font-mono shrink-0 cursor-pointer transition-all duration-150" title="Click to view verified settlement receipt">
        <span>${p.flag || '🌐'}</span>
        <span class="font-semibold text-white">${p.user}</span>
        <span class="text-zinc-500">&bull;</span>
        <span class="text-emerald-400 font-bold">${p.amount}</span>
        <span class="text-zinc-400">via</span>
        <span class="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 text-[10px]">${p.network || p.method}</span>
        <span class="text-zinc-500 text-[11px]">${p.timestamp}</span>
        <span class="text-[10px] text-zinc-400 underline ml-1">Receipt &rarr;</span>
      </div>
    `;

    // Duplicate array so marquee scrolls continuously without seams
    const duplicated = [...data.payouts, ...data.payouts];
    track.innerHTML = duplicated.map((p, idx) => renderItem(p, idx)).join('');
  } catch (err) {
    console.error('Failed to load recent payouts ticker', err);
  }
}

function openReceiptModal(idx) {
  const p = currentPayoutsList[idx];
  if (!p) return;
  const refIdEl = document.getElementById('receipt-ref-id');
  const userEl = document.getElementById('receipt-user');
  const amountEl = document.getElementById('receipt-amount');
  const networkEl = document.getElementById('receipt-network');
  const methodEl = document.getElementById('receipt-method');
  const timeEl = document.getElementById('receipt-timestamp');

  if (refIdEl) refIdEl.textContent = p.refId || `TX-${p.id}`;
  if (userEl) userEl.innerHTML = `<span>${p.flag || '🌐'}</span> <span>${p.user}</span>`;
  if (amountEl) amountEl.textContent = p.amount;
  if (networkEl) networkEl.textContent = p.network || p.method;
  if (methodEl) methodEl.textContent = p.method;
  if (timeEl) timeEl.textContent = p.timestamp;

  const modal = document.getElementById('receipt-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeReceiptModal() {
  const modal = document.getElementById('receipt-modal');
  if (modal) modal.classList.add('hidden');
}

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

// RewardZone Tasks & Daily Bonus Client Logic

let dailyCountdownInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  loadDailyStatus();
});

function onUserLoaded(user) {
  const subidEl = document.getElementById('offerwall-subid');
  if (subidEl) {
    subidEl.textContent = `#${user.id} (${user.username})`;
  }
}

async function loadDailyStatus() {
  const token = localStorage.getItem('rewardzone_token');
  if (!token) return;

  try {
    const res = await fetch('/api/tasks/daily-status', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    const claimBtn = document.getElementById('claim-daily-btn');
    const cooldownText = document.getElementById('daily-cooldown-text');

    if (data.canClaim) {
      if (claimBtn) {
        claimBtn.disabled = false;
        claimBtn.textContent = 'Claim +5 Coins';
      }
      if (cooldownText) cooldownText.classList.add('hidden');
    } else {
      if (claimBtn) {
        claimBtn.disabled = true;
        claimBtn.textContent = 'Claimed Today';
      }
      if (cooldownText) cooldownText.classList.remove('hidden');
      startDailyCountdown(data.secondsRemaining);
    }
  } catch (err) {
    console.error('Daily status error', err);
  }
}

function startDailyCountdown(seconds) {
  if (dailyCountdownInterval) clearInterval(dailyCountdownInterval);
  let rem = seconds;

  const update = () => {
    if (rem <= 0) {
      clearInterval(dailyCountdownInterval);
      loadDailyStatus();
      return;
    }
    const h = Math.floor(rem / 3600);
    const m = Math.floor((rem % 3600) / 60);
    const s = rem % 60;
    const formatted = `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;

    const timerEl = document.getElementById('daily-timer');
    if (timerEl) timerEl.textContent = formatted;
    rem--;
  };

  update();
  dailyCountdownInterval = setInterval(update, 1000);
}

async function claimDailyBonus() {
  const token = localStorage.getItem('rewardzone_token');
  if (!token) {
    window.location.href = '/login?redirect=/tasks';
    return;
  }

  const claimBtn = document.getElementById('claim-daily-btn');
  claimBtn.disabled = true;
  claimBtn.textContent = 'Claiming...';

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
      showToast(data.error || 'Failed to claim bonus.', 'error');
      claimBtn.disabled = false;
      claimBtn.textContent = 'Claim +5 Coins';
      return;
    }

    showToast(data.message || '+5 Coins added!', 'success');
    checkSession();
    loadDailyStatus();
  } catch (err) {
    showToast('Network error claiming bonus.', 'error');
    claimBtn.disabled = false;
  }
}

async function simulateOffer(payout, title) {
  const token = localStorage.getItem('rewardzone_token');
  if (!token) {
    window.location.href = '/login?redirect=/tasks';
    return;
  }

  showToast(`Simulating S2S Postback for "${title}" (+${payout} Coins)...`, 'info');

  try {
    const genRes = await fetch(`/api/postback/generate-test-url?payout=${payout}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const genData = await genRes.json();

    const postbackRes = await fetch(genData.testUrl);
    const text = await postbackRes.text();

    if (text === '1' || postbackRes.ok) {
      showToast(`Offer completed! Credited +${payout} Coins via S2S Webhook.`, 'success');
      checkSession();
    } else {
      showToast(`Postback result: ${text}`, 'error');
    }
  } catch (err) {
    showToast('Failed to trigger simulated postback.', 'error');
  }
}

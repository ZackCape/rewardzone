// RewardZone Cashout Client Logic (Crypto, EcoCash, Visa & 3-Gate Enforcement)

let cashoutEligibility = {
  eligible: false,
  gates: null
};

let selectedMethod = 'CRYPTO';

document.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem('rewardzone_token')) {
    window.location.href = '/login?redirect=/withdraw';
    return;
  }
  updateUsdPreview();
  loadEligibility();
  loadWithdrawals();
});

function onUserLoaded(user) {
  const coinsEl = document.getElementById('withdraw-available-coins');
  const usdEl = document.getElementById('withdraw-available-usd');
  if (coinsEl) coinsEl.textContent = `${(user.balance_coins || 0).toLocaleString()} Coins`;
  if (usdEl) usdEl.textContent = `($${((user.balance_coins || 0) / 1000).toFixed(2)} USD)`;
  loadEligibility();
}

// ==========================================
// 1. CASH-OUT GATE ELIGIBILITY
// ==========================================
async function loadEligibility() {
  const token = localStorage.getItem('rewardzone_token');
  if (!token) return;

  try {
    const res = await fetch('/api/withdrawals/eligibility', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || !data.success) return;

    cashoutEligibility = data;
    renderEligibilityGates(data);
  } catch (err) {
    console.error('Failed to load cashout eligibility', err);
  }
}

function renderEligibilityGates(data) {
  const { eligible, gates } = data;
  const overallBadge = document.getElementById('gate-overall-badge');
  const banner = document.getElementById('gate-alert-banner');
  const submitBtn = document.getElementById('withdraw-btn');

  // Overall Status
  if (eligible) {
    if (overallBadge) {
      overallBadge.textContent = 'Unlocked';
      overallBadge.className = 'px-2 py-0.5 text-[11px] font-mono rounded-md bg-white text-black font-bold';
    }
    if (banner) {
      banner.innerHTML = '<span class="text-white font-semibold">Ready for Cashout:</span> All 3 gate requirements unlocked!';
      banner.className = 'text-xs py-1.5 px-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white font-mono';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Submit Cashout Request</span>';
      submitBtn.className = 'btn-primary w-full py-3 flex items-center justify-center gap-2';
    }
  } else {
    if (overallBadge) {
      overallBadge.textContent = 'Locked (Incomplete)';
      overallBadge.className = 'px-2 py-0.5 text-[11px] font-mono rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800';
    }
    if (banner) {
      banner.innerHTML = '<span class="text-zinc-300 font-semibold">Locked:</span> Meet the 3 gate milestones below to withdraw.';
      banner.className = 'text-xs py-1.5 px-3 rounded-lg bg-zinc-950 border border-zinc-900 text-zinc-400 font-mono';
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Complete All 3 Gates Above to Unlock</span>';
      submitBtn.className = 'w-full py-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 font-medium text-xs cursor-not-allowed flex items-center justify-center gap-2';
    }
  }

  // 1. Balance Gate
  if (gates && gates.balance) {
    const b = gates.balance;
    const bar = document.getElementById('gate-progress-balance');
    const status = document.getElementById('gate-status-balance');
    const badge = document.getElementById('gate-badge-balance');
    const usd = document.getElementById('gate-balance-usd');

    if (bar) bar.style.width = `${b.percent}%`;
    if (status) status.textContent = `${b.current.toLocaleString()} / 100,000`;
    if (usd) usd.textContent = `$${b.currentUsd} / $${b.requiredUsd}`;
    if (badge) {
      badge.textContent = b.met ? 'Unlocked' : 'Locked';
      badge.className = b.met ? 'text-white font-bold' : 'text-zinc-500';
    }
  }

  // 2. Referrals Gate
  if (gates && gates.referrals) {
    const r = gates.referrals;
    const bar = document.getElementById('gate-progress-referrals');
    const status = document.getElementById('gate-status-referrals');
    const badge = document.getElementById('gate-badge-referrals');

    if (bar) bar.style.width = `${r.percent}%`;
    if (status) status.textContent = `${r.current} / ${r.required}`;
    if (badge) {
      badge.textContent = r.met ? 'Unlocked' : 'Locked';
      badge.className = r.met ? 'text-white font-bold' : 'text-zinc-500';
    }
  }

  // 3. Watch Time Gate
  if (gates && gates.watchTime) {
    const w = gates.watchTime;
    const bar = document.getElementById('gate-progress-watch');
    const status = document.getElementById('gate-status-watch');
    const hours = document.getElementById('gate-watch-hours');
    const badge = document.getElementById('gate-badge-watch');

    if (bar) bar.style.width = `${w.percent}%`;
    if (status) status.textContent = `${w.currentMinutes} / 600m`;
    if (hours) hours.textContent = `${w.currentHours} / 10.0 hrs`;
    if (badge) {
      badge.textContent = w.met ? 'Unlocked' : 'Locked';
      badge.className = w.met ? 'text-white font-bold' : 'text-zinc-500';
    }
  }
}

// ==========================================
// 2. DYNAMIC PAYOUT METHOD SWITCHER
// ==========================================
function switchPayoutMethod(method) {
  selectedMethod = method;
  const cryptoBox = document.getElementById('method-fields-crypto');
  const ecocashBox = document.getElementById('method-fields-ecocash');
  const visaBox = document.getElementById('method-fields-visa');

  if (cryptoBox) cryptoBox.classList.add('hidden');
  if (ecocashBox) ecocashBox.classList.add('hidden');
  if (visaBox) visaBox.classList.add('hidden');

  if (method === 'CRYPTO' && cryptoBox) cryptoBox.classList.remove('hidden');
  if (method === 'ECOCASH' && ecocashBox) ecocashBox.classList.remove('hidden');
  if (method === 'VISA' && visaBox) visaBox.classList.remove('hidden');
}

// ==========================================
// 3. AMOUNT PRESETS & PREVIEW
// ==========================================
function updateUsdPreview() {
  const input = document.getElementById('withdraw-amount');
  const preview = document.getElementById('usd-preview');
  if (!input || !preview) return;

  const coins = parseInt(input.value, 10) || 0;
  preview.textContent = `= $${(coins / 1000).toFixed(2)} USD`;
}

function setAmount(coins) {
  const input = document.getElementById('withdraw-amount');
  if (input) {
    input.value = coins;
    updateUsdPreview();
  }
}

function setMaxAmount() {
  if (appState.user) {
    setAmount(appState.user.balance_coins || 100000);
  }
}

// ==========================================
// 4. SUBMIT CASHOUT REQUEST
// ==========================================
async function handleCashout(e) {
  e.preventDefault();
  const token = localStorage.getItem('rewardzone_token');
  if (!token) {
    window.location.href = '/login?redirect=/withdraw';
    return;
  }

  // Pre-check eligibility
  if (!cashoutEligibility.eligible) {
    showToast('You must satisfy all 3 cashout gates (100k coins, 10 referrals, 10h watch time) to request a payout.', 'error');
    return;
  }

  const amountCoins = parseInt(document.getElementById('withdraw-amount').value, 10);
  if (!amountCoins || amountCoins < 100000) {
    showToast('Minimum cashout is 100,000 Coins ($100.00 USD).', 'error');
    return;
  }

  if (appState.user && amountCoins > appState.user.balance_coins) {
    showToast(`Insufficient balance. You currently have ${appState.user.balance_coins.toLocaleString()} Coins.`, 'error');
    return;
  }

  const payload = {
    amountCoins,
    payoutMethod: selectedMethod
  };

  if (selectedMethod === 'CRYPTO') {
    const netRadio = document.querySelector('input[name="cryptoNetwork"]:checked');
    payload.cryptoNetwork = netRadio ? netRadio.value : 'USDT-BEP20';
    payload.walletAddress = document.getElementById('wallet-address').value.trim();
    if (!payload.walletAddress || payload.walletAddress.length < 10) {
      showToast('Please enter a valid crypto wallet address.', 'error');
      return;
    }
  } else if (selectedMethod === 'ECOCASH') {
    payload.ecocashNumber = document.getElementById('ecocash-number').value.trim();
    payload.accountName = document.getElementById('ecocash-name').value.trim();
    if (!payload.ecocashNumber || payload.ecocashNumber.replace(/\D/g, '').length < 8) {
      showToast('Please enter a valid registered EcoCash mobile phone number.', 'error');
      return;
    }
  } else if (selectedMethod === 'VISA') {
    payload.cardholderName = document.getElementById('visa-name').value.trim();
    payload.cardNumber = document.getElementById('visa-number').value.trim();
    payload.expiryDate = document.getElementById('visa-expiry').value.trim();
    payload.billingCountry = document.getElementById('visa-country').value.trim();
    payload.billingAddress = document.getElementById('visa-address').value.trim();

    if (!payload.cardholderName) {
      showToast('Cardholder full name is required.', 'error');
      return;
    }
    const cleanDigits = payload.cardNumber.replace(/\D/g, '');
    if (cleanDigits.length < 13 || cleanDigits.length > 19) {
      showToast('Please enter a valid Visa card number.', 'error');
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(payload.expiryDate)) {
      showToast('Please enter a valid card expiry date (MM/YY).', 'error');
      return;
    }
  }

  const btn = document.getElementById('withdraw-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting Request...';

  try {
    const res = await fetch('/api/withdrawals/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to submit cashout request.', 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Cashout Request';
      return;
    }

    showToast('Withdrawal request submitted! Status: Pending review.', 'success');
    document.getElementById('cashout-form').reset();
    updateUsdPreview();
    switchPayoutMethod('CRYPTO');

    checkSession();
    loadEligibility();
    loadWithdrawals();
  } catch (err) {
    showToast('Network error submitting request.', 'error');
    btn.disabled = false;
    btn.textContent = 'Submit Cashout Request';
  }
}

// ==========================================
// 5. USER WITHDRAWALS HISTORY
// ==========================================
async function loadWithdrawals() {
  const token = localStorage.getItem('rewardzone_token');
  if (!token) return;

  try {
    const res = await fetch('/api/withdrawals/my', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('withdrawals-tbody');
    if (!tbody) return;

    if (!data.withdrawals || data.withdrawals.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-6 text-center text-zinc-600 font-mono">
            No withdrawal requests yet. Minimum cashout threshold is 100,000 Coins ($100.00 USD).
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.withdrawals.map(w => {
      let statusBadge = '';
      if (w.status === 'pending') {
        statusBadge = '<span class="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono text-[10px]">Pending</span>';
      } else if (w.status === 'approved') {
        statusBadge = '<span class="px-2 py-0.5 rounded bg-white text-black font-mono font-bold text-[10px]">Paid</span>';
      } else {
        statusBadge = '<span class="px-2 py-0.5 rounded bg-zinc-900 border border-red-900 text-red-400 font-mono text-[10px]">Refunded</span>';
      }

      // Display destination identifier
      let destDisplay = w.wallet_address || '';
      if (w.payout_method === 'CRYPTO' && destDisplay.length > 12) {
        destDisplay = `${destDisplay.substring(0, 6)}...${destDisplay.substring(destDisplay.length - 4)}`;
      }

      const methodBadge = `<span class="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono text-[10px] text-zinc-400 mr-1.5">${w.payout_method || 'CRYPTO'}</span>`;

      return `
        <tr class="hover:bg-zinc-900/50">
          <td class="py-2.5 px-3 font-mono text-zinc-500">#${w.id}</td>
          <td class="py-2.5 px-3 font-mono text-zinc-400">${new Date(w.created_at).toLocaleDateString()}</td>
          <td class="py-2.5 px-3 font-semibold text-white">
            ${methodBadge}${w.crypto_network || w.payout_method}
          </td>
          <td class="py-2.5 px-3 font-mono text-zinc-300" title="${w.wallet_address}">${destDisplay}</td>
          <td class="py-2.5 px-3 font-mono text-white">${w.amount_coins.toLocaleString()}</td>
          <td class="py-2.5 px-3 font-mono font-semibold text-white">$${w.amount_usd.toFixed(2)}</td>
          <td class="py-2.5 px-3 text-right">${statusBadge}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load withdrawals', err);
  }
}

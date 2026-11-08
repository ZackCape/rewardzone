// RewardZone Cashout Client Logic

document.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem('rewardzone_token')) {
    window.location.href = '/login?redirect=/withdraw';
    return;
  }
  updateUsdPreview();
  loadWithdrawals();
});

function onUserLoaded(user) {
  const coinsEl = document.getElementById('withdraw-available-coins');
  const usdEl = document.getElementById('withdraw-available-usd');
  if (coinsEl) coinsEl.textContent = `${(user.balance_coins || 0).toLocaleString()} Coins`;
  if (usdEl) usdEl.textContent = `($${((user.balance_coins || 0) / 1000).toFixed(2)} USD)`;
}

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
    setAmount(appState.user.balance_coins || 0);
  }
}

async function handleCashout(e) {
  e.preventDefault();
  const token = localStorage.getItem('rewardzone_token');
  if (!token) {
    window.location.href = '/login?redirect=/withdraw';
    return;
  }

  const networkRadio = document.querySelector('input[name="cryptoNetwork"]:checked');
  const cryptoNetwork = networkRadio ? networkRadio.value : 'USDT-BEP20';
  const walletAddress = document.getElementById('wallet-address').value.trim();
  const amountCoins = parseInt(document.getElementById('withdraw-amount').value, 10);
  const btn = document.getElementById('withdraw-btn');

  if (!amountCoins || amountCoins < 5000) {
    showToast('Minimum cashout is 5,000 Coins ($5.00 USD).', 'error');
    return;
  }

  if (appState.user && amountCoins > appState.user.balance_coins) {
    showToast(`Insufficient balance. You currently have ${appState.user.balance_coins.toLocaleString()} Coins.`, 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting Request...';

  try {
    const res = await fetch('/api/withdrawals/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ amountCoins, cryptoNetwork, walletAddress })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to submit request.', 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Cashout Request';
      return;
    }

    showToast('Withdrawal request submitted! Status: Pending review.', 'success');
    document.getElementById('cashout-form').reset();
    updateUsdPreview();
    btn.disabled = false;
    btn.textContent = 'Submit Cashout Request';

    checkSession();
    loadWithdrawals();
  } catch (err) {
    showToast('Network error submitting request.', 'error');
    btn.disabled = false;
    btn.textContent = 'Submit Cashout Request';
  }
}

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
          <td colspan="7" class="py-6 text-center text-zinc-600">
            No withdrawal requests yet. Minimum cashout threshold is 5,000 Coins ($5.00 USD).
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

      const shortAddr = `${w.wallet_address.substring(0, 6)}...${w.wallet_address.substring(w.wallet_address.length - 4)}`;

      return `
        <tr class="hover:bg-zinc-900/50">
          <td class="py-2.5 px-3 font-mono text-zinc-500">#${w.id}</td>
          <td class="py-2.5 px-3 font-mono text-zinc-400">${new Date(w.created_at).toLocaleDateString()}</td>
          <td class="py-2.5 px-3 font-semibold text-white">${w.crypto_network}</td>
          <td class="py-2.5 px-3 font-mono text-zinc-400" title="${w.wallet_address}">${shortAddr}</td>
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

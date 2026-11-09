// RewardZone Referrals Hub Client Logic

document.addEventListener('DOMContentLoaded', () => {
  // Common.js checkSession will invoke onUserLoaded
  loadReferralLeaderboard();
});

function onUserLoaded(user) {
  const origin = window.location.origin;
  const refLink = `${origin}/register?ref=${user.referral_code}`;

  const linkInput = document.getElementById('ref-link-input');
  if (linkInput) linkInput.value = refLink;

  document.getElementById('stat-my-code').textContent = user.referral_code;
  document.getElementById('stat-recruits-count').textContent = user.referrals_count || 0;
  document.getElementById('stat-recruits-earnings').textContent = `${(user.referral_earnings || 0).toLocaleString()} Coins`;
  document.getElementById('stat-recruits-usd').textContent = `$${(((user.referral_earnings || 0)) / 1000).toFixed(2)} USD from 10% rate`;

  loadReferralsList();
  loadReferralLeaderboard();
}

async function loadReferralLeaderboard() {
  const tbody = document.getElementById('leaderboard-table-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/referrals/leaderboard');
    const data = await res.json();
    if (!res.ok || !data.leaderboard || data.leaderboard.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-6 text-center text-zinc-600">
            No leaderboard data yet. Start recruiting to be ranked #1!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.leaderboard.map(item => {
      let rankBadge = `<span class="font-mono text-zinc-500">#${item.rank}</span>`;
      if (item.rank === 1) rankBadge = `<span class="text-amber-400 font-bold">🥇 1st</span>`;
      else if (item.rank === 2) rankBadge = `<span class="text-zinc-300 font-bold">🥈 2nd</span>`;
      else if (item.rank === 3) rankBadge = `<span class="text-amber-600 font-bold">🥉 3rd</span>`;

      return `
        <tr class="hover:bg-zinc-900/50">
          <td class="py-2.5 px-3 font-mono">${rankBadge}</td>
          <td class="py-2.5 px-3 font-semibold text-white">
            <span class="mr-1.5">${item.flag || '🌐'}</span>
            <span>${item.username}</span>
          </td>
          <td class="py-2.5 px-3">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border bg-zinc-900 ${item.tierColor}">
              <span>${item.tierBadge}</span>
              <span>${item.tierName}</span>
            </span>
          </td>
          <td class="py-2.5 px-3 font-mono text-zinc-300 font-semibold">${item.referrals}</td>
          <td class="py-2.5 px-3 font-mono font-bold text-white text-right">+${(item.earningsCoins || 0).toLocaleString()} Coins</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load referral leaderboard', err);
  }
}

async function loadReferralsList() {
  const token = localStorage.getItem('rewardzone_token');
  if (!token) return;

  try {
    const res = await fetch('/api/referrals/my', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('referrals-table-tbody');
    if (!tbody) return;

    if (!data.referrals || data.referrals.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="py-6 text-center text-zinc-600">
            No referrals recorded yet. Share your invite link to start earning!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.referrals.map(r => `
      <tr class="hover:bg-zinc-900/50">
        <td class="py-2.5 px-3 font-semibold text-white">@${r.username}</td>
        <td class="py-2.5 px-3 font-mono text-zinc-500">${new Date(r.created_at).toLocaleDateString()}</td>
        <td class="py-2.5 px-3 font-mono text-zinc-300">${(r.total_earned || 0).toLocaleString()} Coins</td>
        <td class="py-2.5 px-3 font-mono font-bold text-white text-right">+${(r.commission_from_user || 0).toLocaleString()} Coins</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load referrals', err);
  }
}

function copyRefLink() {
  const input = document.getElementById('ref-link-input');
  if (!input) return;

  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Referral link copied to clipboard.', 'success');
  }).catch(() => {
    input.select();
    document.execCommand('copy');
    showToast('Referral link copied to clipboard.', 'success');
  });
}

function shareWhatsApp() {
  const link = document.getElementById('ref-link-input').value;
  const text = encodeURIComponent(`Join me on RewardZone! Watch short streams, complete tasks, and earn real money with direct EcoCash, Visa & crypto cashouts: ${link}`);
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function shareX() {
  const link = document.getElementById('ref-link-input').value;
  const text = encodeURIComponent(`Earn real money every day on @RewardZone watching short streams! Direct USD cashouts via EcoCash, Visa & Crypto. Claim +100 Coins welcome bonus using my link: ${link}`);
  window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
}

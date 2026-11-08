// RewardZone Referrals Hub Client Logic

document.addEventListener('DOMContentLoaded', () => {
  // Common.js checkSession will invoke onUserLoaded
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
  const text = encodeURIComponent(`Join me on RewardZone! Watch short video streams and earn free crypto: ${link}`);
  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function shareX() {
  const link = document.getElementById('ref-link-input').value;
  const text = encodeURIComponent(`Earn free crypto every day on @RewardZone by watching short streams. Claim a +100 Coins welcome bonus using my link: ${link}`);
  window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
}

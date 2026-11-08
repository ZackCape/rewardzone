// RewardZone Admin Command Center JavaScript Logic (Minimalist Monochrome Theme)

const adminState = {
  token: localStorage.getItem('rewardzone_token') || null,
  adminKey: localStorage.getItem('rewardzone_admin_key') || '',
  activeTab: 'withdrawals'
};

document.addEventListener('DOMContentLoaded', async () => {
  await verifyAdminAccess();
  loadAdminStats();
  switchAdminTab('withdrawals');

  setInterval(() => {
    loadAdminStats();
  }, 30000);
});

function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (adminState.token) {
    headers['Authorization'] = `Bearer ${adminState.token}`;
  }
  if (adminState.adminKey) {
    headers['x-admin-key'] = adminState.adminKey;
  }
  return headers;
}

// Verify Admin Session: redirect to /login if unauthenticated
async function verifyAdminAccess() {
  try {
    const res = await fetch('/api/admin/stats', { headers: getAuthHeaders() });
    if (!res.ok) {
      window.location.href = '/login?redirect=/admin';
    }
  } catch (err) {
    console.error('Admin verification error', err);
    window.location.href = '/login?redirect=/admin';
  }
}

function switchAdminTab(tabId) {
  adminState.activeTab = tabId;

  const tabs = ['withdrawals', 'videos', 'users', 'postback'];
  tabs.forEach(t => {
    const btn = document.getElementById(`admin-tab-btn-${t}`);
    const sec = document.getElementById(`admin-sec-${t}`);
    if (btn) {
      if (t === tabId) btn.classList.add('active');
      else btn.classList.remove('active');
    }
    if (sec) {
      if (t === tabId) sec.classList.remove('hidden');
      else sec.classList.add('hidden');
    }
  });

  if (tabId === 'withdrawals') loadAdminWithdrawals();
  if (tabId === 'videos') loadAdminVideos();
  if (tabId === 'users') loadAdminUsers();
}

async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/stats', { headers: getAuthHeaders() });
    if (!res.ok) return;
    const { stats } = await res.json();

    document.getElementById('kpi-users').textContent = stats.totalUsers;
    document.getElementById('kpi-coins').textContent = stats.coinsCirculation.toLocaleString();
    document.getElementById('kpi-usd-circulation').textContent = `~$${stats.usdCirculation} USD`;
    document.getElementById('kpi-pending-withdrawals').textContent = stats.pendingWithdrawalsCount;
    document.getElementById('badge-pending-count').textContent = stats.pendingWithdrawalsCount;
    document.getElementById('kpi-pending-usd').textContent = `$${stats.pendingWithdrawalsUsd} queued`;
    document.getElementById('kpi-paid-out-usd').textContent = `$${stats.totalPaidOutUsd}`;
    document.getElementById('kpi-approved-count').textContent = `${stats.approvedWithdrawalsCount} approved`;
    document.getElementById('kpi-total-earned').textContent = stats.totalEarnedAll.toLocaleString();
    document.getElementById('kpi-tasks-completed').textContent = stats.totalTasksCompleted.toLocaleString();
  } catch (err) {
    console.error('Failed to load admin stats', err);
  }
}

// ==========================================
// 1. WITHDRAWALS QUEUE
// ==========================================
async function loadAdminWithdrawals() {
  const tbody = document.getElementById('admin-withdrawals-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/withdrawals', { headers: getAuthHeaders() });
    const data = await res.json();

    if (!data.withdrawals || data.withdrawals.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="py-6 text-center text-zinc-600">
            No withdrawal requests in queue.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.withdrawals.map(w => {
      let statusBadge = '';
      let actions = '';

      if (w.status === 'pending') {
        statusBadge = '<span class="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono text-[10px]">Pending</span>';
        actions = `
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="inspectUserAudit(${w.user_id})" class="btn-secondary text-[11px] py-1 px-2.5">
              Audit
            </button>
            <button onclick="approveWithdrawal(${w.id})" class="btn-primary text-[11px] py-1 px-2.5">
              Approve
            </button>
            <button onclick="rejectWithdrawal(${w.id}, ${w.amount_coins})" class="btn-secondary text-[11px] py-1 px-2.5 text-zinc-400 hover:text-red-300">
              Reject
            </button>
          </div>
        `;
      } else if (w.status === 'approved') {
        statusBadge = '<span class="px-2 py-0.5 rounded bg-white text-black font-mono font-bold text-[10px]">Paid</span>';
        actions = `
          <button onclick="inspectUserAudit(${w.user_id})" class="btn-secondary text-[11px] py-1 px-2.5">
            Audit
          </button>
        `;
      } else {
        statusBadge = '<span class="px-2 py-0.5 rounded bg-zinc-900 border border-red-900 text-red-400 font-mono text-[10px]">Refunded</span>';
        actions = `
          <button onclick="inspectUserAudit(${w.user_id})" class="btn-secondary text-[11px] py-1 px-2.5">
            Audit
          </button>
        `;
      }

      return `
        <tr class="hover:bg-zinc-900/50">
          <td class="py-2.5 px-3 font-mono text-zinc-500">#${w.id}</td>
          <td class="py-2.5 px-3">
            <div class="font-semibold text-white">${w.username}</div>
            <div class="text-[10px] text-zinc-500 font-mono">${w.ip_address || '127.0.0.1'}</div>
          </td>
          <td class="py-2.5 px-3 font-medium text-white">${w.crypto_network}</td>
          <td class="py-2.5 px-3 font-mono text-zinc-400 select-all" title="${w.wallet_address}">
            ${w.wallet_address.substring(0, 6)}...${w.wallet_address.substring(w.wallet_address.length - 4)}
          </td>
          <td class="py-2.5 px-3 font-mono text-white">${w.amount_coins.toLocaleString()}</td>
          <td class="py-2.5 px-3 font-mono font-bold text-white">$${w.amount_usd.toFixed(2)}</td>
          <td class="py-2.5 px-3 font-mono text-zinc-500">${new Date(w.created_at).toLocaleDateString()}</td>
          <td class="py-2.5 px-3">${statusBadge}</td>
          <td class="py-2.5 px-3 text-right">${actions}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-red-400">Failed to load withdrawals.</td></tr>`;
  }
}

async function approveWithdrawal(id) {
  if (!confirm(`Approve Withdrawal #${id}? This marks it as paid.`)) return;

  try {
    const res = await fetch(`/api/admin/withdrawals/${id}/approve`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to approve withdrawal.', 'error');
      return;
    }
    showToast('Withdrawal marked as paid.', 'success');
    loadAdminStats();
    loadAdminWithdrawals();
  } catch (err) {
    showToast('Network error approving withdrawal.', 'error');
  }
}

async function rejectWithdrawal(id, amountCoins) {
  if (!confirm(`Reject Withdrawal #${id}?\n\nThis will automatically REFUND ${amountCoins.toLocaleString()} Coins back to the user.`)) return;

  try {
    const res = await fetch(`/api/admin/withdrawals/${id}/reject`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to reject withdrawal.', 'error');
      return;
    }
    showToast('Withdrawal rejected and coins refunded.', 'info');
    loadAdminStats();
    loadAdminWithdrawals();
  } catch (err) {
    showToast('Network error rejecting withdrawal.', 'error');
  }
}

// ==========================================
// 2. USER AUDIT TRAIL
// ==========================================
async function inspectUserAudit(userId) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/audit`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to load audit.', 'error');
      return;
    }

    document.getElementById('audit-username').textContent = data.user.username;
    document.getElementById('audit-user-details').textContent = `User ID: #${data.user.id} • Email: ${data.user.email} • IP: ${data.user.ip_address || 'None'} • Balance: ${data.user.balance_coins.toLocaleString()} Coins`;

    const taskTbody = document.getElementById('audit-tasks-tbody');
    if (!data.taskHistory || data.taskHistory.length === 0) {
      taskTbody.innerHTML = `<tr><td colspan="5" class="py-3 px-3 text-center text-zinc-600">No completed tasks logged.</td></tr>`;
    } else {
      taskTbody.innerHTML = data.taskHistory.map(t => `
        <tr class="hover:bg-zinc-900">
          <td class="py-1.5 px-3 font-mono text-zinc-500">#${t.id}</td>
          <td class="py-1.5 px-3 font-semibold text-white">${t.task_type}</td>
          <td class="py-1.5 px-3 text-zinc-300">${t.video_title || 'Completed Task'}</td>
          <td class="py-1.5 px-3 font-mono font-semibold text-white">+${t.reward_coins}</td>
          <td class="py-1.5 px-3 font-mono text-zinc-500">${new Date(t.created_at).toLocaleString()}</td>
        </tr>
      `).join('');
    }

    const sessTbody = document.getElementById('audit-sessions-tbody');
    if (!data.taskSessions || data.taskSessions.length === 0) {
      sessTbody.innerHTML = `<tr><td colspan="4" class="py-3 px-3 text-center text-zinc-600">No video sessions logged.</td></tr>`;
    } else {
      sessTbody.innerHTML = data.taskSessions.map(s => `
        <tr class="hover:bg-zinc-900">
          <td class="py-1.5 px-3 text-zinc-300">${s.title || `Task #${s.task_id}`}</td>
          <td class="py-1.5 px-3 font-mono">${s.duration_seconds}s</td>
          <td class="py-1.5 px-3 font-mono text-zinc-500">${new Date(s.start_time).toLocaleString()}</td>
          <td class="py-1.5 px-3">
            ${s.completed === 1 
              ? '<span class="text-white font-mono font-bold">Verified</span>' 
              : '<span class="text-zinc-500 font-mono">Uncompleted</span>'}
          </td>
        </tr>
      `).join('');
    }

    document.getElementById('audit-modal').classList.remove('hidden');
  } catch (err) {
    showToast('Failed to open audit modal.', 'error');
  }
}

function closeAuditModal() {
  document.getElementById('audit-modal').classList.add('hidden');
}

// ==========================================
// 3. VIDEO TASKS CRUD
// ==========================================
async function loadAdminVideos() {
  const tbody = document.getElementById('admin-videos-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/videos', { headers: getAuthHeaders() });
    const data = await res.json();

    if (!data.videos || data.videos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-zinc-600">No video tasks created yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.videos.map(v => `
      <tr class="hover:bg-zinc-900/50">
        <td class="py-2.5 px-3 font-mono text-zinc-500">#${v.id}</td>
        <td class="py-2.5 px-3 font-medium text-white max-w-xs truncate">${v.title}</td>
        <td class="py-2.5 px-3 font-mono text-zinc-400">${v.duration_seconds}s</td>
        <td class="py-2.5 px-3 font-mono font-semibold text-white">+${v.reward_coins}</td>
        <td class="py-2.5 px-3 font-mono text-zinc-500 truncate max-w-[120px]">${v.ad_direct_link || 'None'}</td>
        <td class="py-2.5 px-3 text-right">
          <button onclick="deleteVideoTask(${v.id})" class="btn-secondary text-[11px] py-1 px-2.5 text-zinc-400 hover:text-red-300">
            Delete
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-red-400">Failed to load video tasks.</td></tr>`;
  }
}

async function handleAddVideoSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('video-title').value.trim();
  const youtube_embed_url = document.getElementById('video-url').value.trim();
  const duration_seconds = document.getElementById('video-duration').value;
  const reward_coins = document.getElementById('video-reward').value;
  const ad_direct_link = document.getElementById('video-adlink').value.trim();

  try {
    const res = await fetch('/api/admin/videos', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title, youtube_embed_url, duration_seconds, reward_coins, ad_direct_link })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to add video task.', 'error');
      return;
    }
    showToast('Video task created.', 'success');
    document.getElementById('add-video-form').reset();
    loadAdminVideos();
  } catch (err) {
    showToast('Network error adding video task.', 'error');
  }
}

async function deleteVideoTask(id) {
  if (!confirm(`Delete Video Task #${id}?`)) return;

  try {
    const res = await fetch(`/api/admin/videos/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to delete task.', 'error');
      return;
    }
    showToast('Video task deleted.', 'info');
    loadAdminVideos();
  } catch (err) {
    showToast('Network error deleting task.', 'error');
  }
}

// ==========================================
// 4. USERS LIST
// ==========================================
async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/users', { headers: getAuthHeaders() });
    const data = await res.json();

    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="py-6 text-center text-zinc-600">No users found.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.users.map(u => `
      <tr class="hover:bg-zinc-900/50">
        <td class="py-2.5 px-3 font-mono text-zinc-500">#${u.id}</td>
        <td class="py-2.5 px-3 font-semibold text-white">${u.username}</td>
        <td class="py-2.5 px-3 text-zinc-400 font-mono text-[11px]">${u.email}</td>
        <td class="py-2.5 px-3 font-mono text-zinc-500 text-[11px]">${u.ip_address || '127.0.0.1'}</td>
        <td class="py-2.5 px-3 font-mono font-bold text-white">${u.referral_code}</td>
        <td class="py-2.5 px-3 text-zinc-400 text-xs">${u.referrer_username ? `@${u.referrer_username}` : 'Direct'}</td>
        <td class="py-2.5 px-3 font-mono text-zinc-300">${u.total_referrals}</td>
        <td class="py-2.5 px-3 font-mono font-semibold text-white">${u.balance_coins.toLocaleString()}</td>
        <td class="py-2.5 px-3 font-mono text-zinc-400">${u.total_earned.toLocaleString()}</td>
        <td class="py-2.5 px-3 text-right">
          <button onclick="inspectUserAudit(${u.id})" class="btn-secondary text-[11px] py-1 px-2.5">
            Audit
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="py-6 text-center text-red-400">Failed to load users.</td></tr>`;
  }
}

// ==========================================
// 5. LIVE S2S SIMULATOR
// ==========================================
async function triggerSimulatedPostback() {
  const userId = document.getElementById('test-postback-userid').value;
  const payout = document.getElementById('test-postback-payout').value;
  let txid = document.getElementById('test-postback-txid').value.trim();
  if (!txid) {
    txid = `cpa_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }

  const resultBox = document.getElementById('postback-test-result');
  resultBox.classList.remove('hidden');
  resultBox.innerHTML = `Firing postback for User #${userId} (+${payout} Coins, TxID: ${txid})...`;

  try {
    const genRes = await fetch(`/api/postback/generate-test-url?payout=${payout}`);
    const genData = await genRes.json();

    const postbackRes = await fetch(`/api/postback?userid=${userId}&payout=${payout}&txid=${txid}&sig=${genData.sig}`);
    const text = await postbackRes.text();

    resultBox.innerHTML = `
      <div class="text-white font-bold mb-1">Response: ${postbackRes.status} OK (Body: "${text}")</div>
      <div class="text-zinc-500 text-[11px] break-all">URL: /api/postback?userid=${userId}&payout=${payout}&txid=${txid}&sig=${genData.sig}</div>
      <div class="text-zinc-400 mt-2">Credited: +${payout} Coins to User #${userId}. If user has a referrer, 10% was automatically credited.</div>
    `;

    showToast(`Postback processed (+${payout} Coins).`, 'success');
    loadAdminStats();
  } catch (err) {
    resultBox.innerHTML = `<span class="text-red-400">Postback error: ${err.message}</span>`;
  }
}

function handleAdminLogout() {
  localStorage.removeItem('rewardzone_token');
  window.location.href = '/login';
}

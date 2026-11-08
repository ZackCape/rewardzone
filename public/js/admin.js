// RewardZone Admin Command Center JavaScript Logic

const adminState = {
  token: localStorage.getItem('rewardzone_token') || null,
  adminKey: localStorage.getItem('rewardzone_admin_key') || '',
  activeTab: 'withdrawals'
};

document.addEventListener('DOMContentLoaded', async () => {
  await verifyAdminAccess();
  loadAdminStats();
  switchAdminTab('withdrawals');

  // Auto refresh stats every 30 seconds
  setInterval(() => {
    loadAdminStats();
  }, 30000);
});

// Admin Authorization Header Helper
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

// Verify Admin Session
async function verifyAdminAccess() {
  try {
    const res = await fetch('/api/admin/stats', { headers: getAuthHeaders() });
    if (!res.ok) {
      // Prompt for login if unauthorized
      const pass = prompt('RewardZone Admin Access Required.\nEnter Administrator Password:');
      if (pass) {
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernameOrEmail: 'admin', password: pass })
        });
        const loginData = await loginRes.json();
        if (loginRes.ok && loginData.user.is_admin === 1) {
          adminState.token = loginData.token;
          localStorage.setItem('rewardzone_token', loginData.token);
          showToast('Admin authenticated successfully.', 'success');
        } else {
          alert('Invalid admin credentials.');
          window.location.href = '/';
        }
      } else {
        window.location.href = '/';
      }
    }
  } catch (err) {
    console.error('Admin verification error', err);
  }
}

// Tab Switching
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

// Load KPIs Overview
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
    document.getElementById('kpi-pending-usd').textContent = `$${stats.pendingWithdrawalsUsd} awaiting review`;
    document.getElementById('kpi-paid-out-usd').textContent = `$${stats.totalPaidOutUsd}`;
    document.getElementById('kpi-approved-count').textContent = `${stats.approvedWithdrawalsCount} requests paid`;
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
          <td colspan="9" class="px-4 py-8 text-center text-slate-500">
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
        statusBadge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">Pending</span>';
        actions = `
          <div class="flex items-center justify-end gap-2">
            <button onclick="inspectUserAudit(${w.user_id})" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold border border-slate-700" title="Inspect user earnings & task audit trail">
              <i class="fa-solid fa-magnifying-glass"></i> Audit
            </button>
            <button onclick="approveWithdrawal(${w.id})" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm">
              Approve
            </button>
            <button onclick="rejectWithdrawal(${w.id}, ${w.amount_coins})" class="px-2.5 py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-bold transition-all" title="Refunds coins back to user balance">
              Reject
            </button>
          </div>
        `;
      } else if (w.status === 'approved') {
        statusBadge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Paid</span>';
        actions = `
          <button onclick="inspectUserAudit(${w.user_id})" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold border border-slate-700">
            <i class="fa-solid fa-magnifying-glass"></i> Audit
          </button>
        `;
      } else {
        statusBadge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">Rejected</span>';
        actions = `
          <button onclick="inspectUserAudit(${w.user_id})" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold border border-slate-700">
            <i class="fa-solid fa-magnifying-glass"></i> Audit
          </button>
        `;
      }

      return `
        <tr class="hover:bg-slate-800/40">
          <td class="px-4 py-3 font-mono-num text-xs text-slate-400">#${w.id}</td>
          <td class="px-4 py-3">
            <div class="font-bold text-white text-xs sm:text-sm">${w.username}</div>
            <div class="text-[11px] text-slate-400 font-mono-num">${w.ip_address || 'Unknown IP'}</div>
          </td>
          <td class="px-4 py-3 font-semibold text-xs sm:text-sm text-slate-200">${w.crypto_network}</td>
          <td class="px-4 py-3 font-mono-num text-xs text-slate-300 select-all" title="${w.wallet_address}">
            ${w.wallet_address.substring(0, 8)}...${w.wallet_address.substring(w.wallet_address.length - 6)}
          </td>
          <td class="px-4 py-3 font-mono-num text-white">${w.amount_coins.toLocaleString()}</td>
          <td class="px-4 py-3 font-mono-num font-bold text-emerald-400">$${w.amount_usd.toFixed(2)}</td>
          <td class="px-4 py-3 font-mono-num text-xs text-slate-400">${new Date(w.created_at).toLocaleDateString()}</td>
          <td class="px-4 py-3">${statusBadge}</td>
          <td class="px-4 py-3 text-right">${actions}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="px-4 py-6 text-center text-rose-400">Failed to load withdrawals.</td></tr>`;
  }
}

async function approveWithdrawal(id) {
  if (!confirm(`Are you sure you want to approve Withdrawal #${id}? This marks it as paid to the user.`)) return;

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
    showToast(data.message || 'Withdrawal approved.', 'success');
    loadAdminStats();
    loadAdminWithdrawals();
  } catch (err) {
    showToast('Network error during approval.', 'error');
  }
}

async function rejectWithdrawal(id, amountCoins) {
  if (!confirm(`Are you sure you want to REJECT Withdrawal #${id}?\n\nThis will automatically REFUND ${amountCoins.toLocaleString()} Coins back to the user's account.`)) return;

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
    showToast(data.message || 'Withdrawal rejected and coins refunded.', 'info');
    loadAdminStats();
    loadAdminWithdrawals();
  } catch (err) {
    showToast('Network error during rejection.', 'error');
  }
}

// ==========================================
// 2. USER AUDIT TRAIL & ANTI-CHEAT INSPECT
// ==========================================
async function inspectUserAudit(userId) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/audit`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to load user audit.', 'error');
      return;
    }

    document.getElementById('audit-username').textContent = data.user.username;
    document.getElementById('audit-user-details').textContent = `User ID: #${data.user.id} &bull; Email: ${data.user.email} &bull; IP: ${data.user.ip_address || 'None'} &bull; Balance: ${data.user.balance_coins.toLocaleString()} Coins &bull; Total Earned: ${data.user.total_earned.toLocaleString()} Coins`;

    // Tasks audit table
    const taskTbody = document.getElementById('audit-tasks-tbody');
    if (!data.taskHistory || data.taskHistory.length === 0) {
      taskTbody.innerHTML = `<tr><td colspan="6" class="px-3 py-4 text-center text-slate-500">No completed tasks logged.</td></tr>`;
    } else {
      taskTbody.innerHTML = data.taskHistory.map(t => `
        <tr class="hover:bg-slate-900">
          <td class="px-3 py-2 font-mono-num text-slate-400">#${t.id}</td>
          <td class="px-3 py-2 font-semibold text-white">${t.task_type}</td>
          <td class="px-3 py-2 text-slate-300 text-xs">${t.video_title || 'Direct Task'}</td>
          <td class="px-3 py-2 font-mono-num text-emerald-400 font-bold">+${t.reward_coins}</td>
          <td class="px-3 py-2 font-mono-num text-slate-500 text-[10px] truncate max-w-[120px]">${t.external_tx_id || '-'}</td>
          <td class="px-3 py-2 font-mono-num text-slate-400 text-[11px]">${new Date(t.created_at).toLocaleString()}</td>
        </tr>
      `).join('');
    }

    // Sessions audit table
    const sessTbody = document.getElementById('audit-sessions-tbody');
    if (!data.taskSessions || data.taskSessions.length === 0) {
      sessTbody.innerHTML = `<tr><td colspan="4" class="px-3 py-4 text-center text-slate-500">No video sessions logged.</td></tr>`;
    } else {
      sessTbody.innerHTML = data.taskSessions.map(s => `
        <tr class="hover:bg-slate-900">
          <td class="px-3 py-2 text-slate-200">${s.title || `Task #${s.task_id}`}</td>
          <td class="px-3 py-2 font-mono-num">${s.duration_seconds}s</td>
          <td class="px-3 py-2 font-mono-num text-slate-400 text-[11px]">${new Date(s.start_time).toLocaleString()}</td>
          <td class="px-3 py-2">
            ${s.completed === 1 
              ? '<span class="text-emerald-400 font-bold text-xs"><i class="fa-solid fa-check"></i> Verified</span>' 
              : '<span class="text-amber-400 font-bold text-xs"><i class="fa-solid fa-clock"></i> Uncompleted</span>'}
          </td>
        </tr>
      `).join('');
    }

    document.getElementById('audit-modal').classList.remove('hidden');
  } catch (err) {
    showToast('Failed to open user audit modal.', 'error');
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
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-slate-500">No video tasks created yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.videos.map(v => `
      <tr class="hover:bg-slate-800/40">
        <td class="px-4 py-3 font-mono-num text-xs text-slate-400">#${v.id}</td>
        <td class="px-4 py-3">
          <div class="w-16 h-10 rounded overflow-hidden bg-black border border-slate-700">
            <iframe src="${v.youtube_embed_url}" class="w-full h-full pointer-events-none scale-75 origin-top-left"></iframe>
          </div>
        </td>
        <td class="px-4 py-3 font-bold text-white text-xs sm:text-sm max-w-xs truncate">${v.title}</td>
        <td class="px-4 py-3 font-mono-num text-xs text-slate-300">${v.duration_seconds}s</td>
        <td class="px-4 py-3 font-mono-num font-bold text-emerald-400 text-xs sm:text-sm">+${v.reward_coins}</td>
        <td class="px-4 py-3 font-mono-num text-xs text-slate-400 truncate max-w-[150px]">${v.ad_direct_link || 'None'}</td>
        <td class="px-4 py-3 text-right">
          <button onclick="deleteVideoTask(${v.id})" class="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/30">
            <i class="fa-solid fa-trash mr-1"></i> Delete
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-rose-400">Failed to load video tasks.</td></tr>`;
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
    showToast('Video task created and live!', 'success');
    document.getElementById('add-video-form').reset();
    loadAdminVideos();
  } catch (err) {
    showToast('Network error adding video task.', 'error');
  }
}

async function deleteVideoTask(id) {
  if (!confirm(`Are you sure you want to delete Video Task #${id}?`)) return;

  try {
    const res = await fetch(`/api/admin/videos/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to delete video task.', 'error');
      return;
    }
    showToast(data.message || 'Video task removed.', 'info');
    loadAdminVideos();
  } catch (err) {
    showToast('Network error deleting video task.', 'error');
  }
}

// ==========================================
// 4. USERS MANAGEMENT
// ==========================================
async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/admin/users', { headers: getAuthHeaders() });
    const data = await res.json();

    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="px-4 py-6 text-center text-slate-500">No users found.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.users.map(u => `
      <tr class="hover:bg-slate-800/40">
        <td class="px-4 py-3 font-mono-num text-xs text-slate-400">#${u.id}</td>
        <td class="px-4 py-3 font-bold text-white text-xs sm:text-sm">${u.username}</td>
        <td class="px-4 py-3 text-slate-300 text-xs">${u.email}</td>
        <td class="px-4 py-3 font-mono-num text-xs text-slate-400">${u.ip_address || '127.0.0.1'}</td>
        <td class="px-4 py-3 font-mono-num font-bold text-cyan-300 text-xs">${u.referral_code}</td>
        <td class="px-4 py-3 text-slate-400 text-xs">${u.referrer_username ? `@${u.referrer_username}` : 'Direct'}</td>
        <td class="px-4 py-3 font-mono-num text-violet-300 font-semibold">${u.total_referrals}</td>
        <td class="px-4 py-3 font-mono-num font-bold text-emerald-400">${u.balance_coins.toLocaleString()}</td>
        <td class="px-4 py-3 font-mono-num text-slate-300">${u.total_earned.toLocaleString()}</td>
        <td class="px-4 py-3 text-right">
          <button onclick="inspectUserAudit(${u.id})" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold border border-slate-700">
            <i class="fa-solid fa-magnifying-glass"></i> Audit
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="px-4 py-6 text-center text-rose-400">Failed to load user accounts.</td></tr>`;
  }
}

// ==========================================
// 5. LIVE S2S POSTBACK SIMULATOR
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
  resultBox.innerHTML = `Firing Postback Webhook for User #${userId} (Payout: ${payout} Coins, TxID: ${txid})...`;

  try {
    const genRes = await fetch(`/api/postback/generate-test-url?payout=${payout}`);
    const genData = await genRes.json();

    // Execute the postback URL
    const postbackRes = await fetch(`/api/postback?userid=${userId}&payout=${payout}&txid=${txid}&sig=${genData.sig}`);
    const text = await postbackRes.text();

    resultBox.innerHTML = `
      <div class="text-emerald-400 font-bold mb-1">Response: ${postbackRes.status} OK (Body: "${text}")</div>
      <div class="text-slate-400 text-[11px]">Webhook Endpoint: /api/postback?userid=${userId}&payout=${payout}&txid=${txid}&sig=${genData.sig}</div>
      <div class="text-slate-300 mt-2">Database credited: +${payout} Coins to User #${userId}. If user has a referrer, 10% was atomically credited!</div>
    `;

    showToast(`Postback successfully processed! Credited +${payout} Coins.`, 'success');
    loadAdminStats();
  } catch (err) {
    resultBox.innerHTML = `<span class="text-rose-400">Postback error: ${err.message}</span>`;
  }
}

function handleAdminLogout() {
  localStorage.removeItem('rewardzone_token');
  window.location.href = '/';
}

// Toast Notifications
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
    toast.className += ' bg-slate-900 border-amber-500/50 text-white';
    toast.innerHTML = `<i class="fa-solid fa-circle-info text-amber-400 text-lg"></i> <span>${message}</span>`;
  }

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

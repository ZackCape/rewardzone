// RewardZone Shared Client Module (Auth, Header, Session & Utilities)

const appState = {
  user: null,
  token: localStorage.getItem('rewardzone_token') || null
};

// ==========================================
// 1. INITIALIZATION ON EVERY PAGE
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  captureReferralParam();
  highlightActiveNav();
  await checkSession();
});

// Capture and persist ?ref=CODE across all pages
function captureReferralParam() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref && ref.trim()) {
    const clean = ref.trim().toUpperCase();
    localStorage.setItem('rewardzone_ref', clean);
  }
}

// Highlight the active navigation link based on window.location.pathname
function highlightActiveNav() {
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

// ==========================================
// 2. SESSION & USER BALANCE
// ==========================================
async function checkSession() {
  const token = localStorage.getItem('rewardzone_token');
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch('/api/auth/me', { headers });
    if (res.ok) {
      const data = await res.json();
      appState.user = data.user;
      renderHeaderLoggedIn(data.user);
      if (typeof onUserLoaded === 'function') {
        onUserLoaded(data.user);
      }
    } else {
      appState.user = null;
      renderHeaderLoggedOut();
      if (typeof onUserLoggedOut === 'function') {
        onUserLoggedOut();
      }
    }
  } catch (err) {
    console.error('Session check error', err);
    appState.user = null;
    renderHeaderLoggedOut();
  }
}

function renderHeaderLoggedIn(user) {
  const guestBtns = document.getElementById('header-guest-buttons');
  const userMenu = document.getElementById('header-user-menu');
  const balanceCoins = document.getElementById('header-coins-balance');
  const balanceUsd = document.getElementById('header-usd-balance');
  const usernameEl = document.getElementById('header-username');
  const avatarEl = document.getElementById('header-avatar');

  if (guestBtns) guestBtns.classList.add('hidden');
  if (userMenu) {
    userMenu.classList.remove('hidden');
    userMenu.classList.add('flex');
  }

  if (balanceCoins) {
    balanceCoins.textContent = (user.balance_coins || 0).toLocaleString();
  }
  if (balanceUsd) {
    balanceUsd.textContent = `$${((user.balance_coins || 0) / 1000).toFixed(2)}`;
  }
  if (usernameEl) {
    usernameEl.textContent = user.username;
  }
  if (avatarEl) {
    avatarEl.textContent = user.username.charAt(0).toUpperCase();
  }
}

function renderHeaderLoggedOut() {
  const guestBtns = document.getElementById('header-guest-buttons');
  const userMenu = document.getElementById('header-user-menu');

  if (guestBtns) {
    guestBtns.classList.remove('hidden');
    guestBtns.classList.add('flex');
  }
  if (userMenu) userMenu.classList.add('hidden');
}

// User Logout
async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}

  localStorage.removeItem('rewardzone_token');
  appState.user = null;
  appState.token = null;
  window.location.href = '/login';
}

// Require Auth Guard Helper for Protected Pages
function requireAuth() {
  if (!localStorage.getItem('rewardzone_token')) {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    return false;
  }
  return true;
}

// Toast Notifications Helper
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm font-medium';

  let icon = '<span class="w-2 h-2 rounded-full bg-zinc-400"></span>';
  if (type === 'success') {
    icon = '<span class="w-2 h-2 rounded-full bg-white"></span>';
  } else if (type === 'error') {
    icon = '<span class="w-2 h-2 rounded-full bg-red-400"></span>';
  }

  toast.innerHTML = `${icon}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

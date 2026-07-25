document.addEventListener('DOMContentLoaded', function () {
  const BACKEND_URL = 'https://web-production-2401b.up.railway.app';

  // ── ELEMENTS ──
  const inputText     = document.getElementById('inputText');
  const charCount      = document.getElementById('charCount');
  const runBtn          = document.getElementById('runBtn');
  const runLabel        = document.getElementById('runLabel');
  const clearBtn        = document.getElementById('clearBtn');
  const copyBtn          = document.getElementById('copyBtn');
  const toolTabs        = document.getElementById('toolTabs');

  const outputEmpty    = document.getElementById('outputEmpty');
  const outputLoading  = document.getElementById('outputLoading');
  const outputResult   = document.getElementById('outputResult');
  const outputTextEl   = document.getElementById('outputTextEl');

  const historySection = document.getElementById('historySection');
  const historyList     = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistory');
  const historyNavLink  = document.getElementById('historyNavLink');

  const toast            = document.getElementById('toast');
  const loginBtn         = document.getElementById('loginBtn');
  const signupBtn        = document.getElementById('signupBtn');
  const modalOverlay     = document.getElementById('modalOverlay');
  const modalClose       = document.getElementById('modalClose');
  const loginForm        = document.getElementById('loginForm');
  const registerForm     = document.getElementById('registerForm');

  let currentAction = 'generate';
  let authToken = localStorage.getItem('textgen_token') || null;

  const ACTION_LABELS = {
    generate: 'Generating…',
    rephrase: 'Rephrasing…',
    grammar:  'Fixing grammar…',
    script:   'Writing script…',
  };

  // ── CHAR COUNTER ──
  inputText.addEventListener('input', () => {
    const len = inputText.value.length;
    charCount.textContent = len;
    charCount.parentElement.style.color = len >= 500 ? '#e0245e' : '';
  });

  // ── TOOL TABS ──
  toolTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tool-tab');
    if (!btn) return;
    toolTabs.querySelectorAll('.tool-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentAction = btn.dataset.action;
    runLabel.textContent = 'Run';
  });

  // ── CLEAR ──
  clearBtn.addEventListener('click', () => {
    inputText.value = '';
    charCount.textContent = '0';
    inputText.focus();
  });

  // ── OUTPUT STATE HELPERS ──
  function showState(state) {
    outputEmpty.hidden = state !== 'empty';
    outputLoading.hidden = state !== 'loading';
    outputResult.hidden = state !== 'result';
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  // ── RUN ──
  runBtn.addEventListener('click', async () => {
    const text = inputText.value.trim();
    if (!text) {
      showToast('Type or paste some text first');
      inputText.focus();
      return;
    }

    runBtn.disabled = true;
    document.getElementById('loadingLabel').textContent = ACTION_LABELS[currentAction] || 'Working on it…';
    showState('loading');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${BACKEND_URL}/api/process`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, action: currentAction }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        outputTextEl.textContent = data.result;
        showState('result');
        copyBtn.hidden = false;
        saveToHistory(currentAction, text, data.result);
      } else {
        showState('empty');
        showToast(data.error || 'Something went wrong');
      }
    } catch (err) {
      console.error(err);
      showState('empty');
      showToast('Could not reach the server — try again in a moment');
    } finally {
      runBtn.disabled = false;
    }
  });

  // ── COPY ──
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(outputTextEl.textContent);
    showToast('Copied to clipboard');
  });

  // ── HISTORY (local, per-browser) ──
  function getHistory() {
    try { return JSON.parse(localStorage.getItem('textgen_history') || '[]'); }
    catch { return []; }
  }

  function saveToHistory(action, input, result) {
    const history = getHistory();
    history.unshift({ action, input, result, time: Date.now() });
    localStorage.setItem('textgen_history', JSON.stringify(history.slice(0, 20)));
    renderHistory();
  }

  function renderHistory() {
    const history = getHistory();
    if (!history.length) { historySection.hidden = true; return; }
    historySection.hidden = false;
    historyList.innerHTML = history.map((item, i) => `
      <div class="history-item" data-index="${i}">
        <span class="history-badge">${item.action}</span>
        <span class="history-text">${escapeHtml(item.input)}</span>
        <span class="history-time">${timeAgo(item.time)}</span>
      </div>
    `).join('');
  }

  historyList.addEventListener('click', (e) => {
    const row = e.target.closest('.history-item');
    if (!row) return;
    const item = getHistory()[Number(row.dataset.index)];
    if (!item) return;
    inputText.value = item.input;
    charCount.textContent = item.input.length;
    outputTextEl.textContent = item.result;
    showState('result');
    copyBtn.hidden = false;
    toolTabs.querySelectorAll('.tool-tab').forEach(t => t.classList.toggle('active', t.dataset.action === item.action));
    currentAction = item.action;
  });

  clearHistoryBtn.addEventListener('click', () => {
    localStorage.removeItem('textgen_history');
    renderHistory();
  });

  historyNavLink.addEventListener('click', (e) => {
    e.preventDefault();
    historySection.scrollIntoView({ behavior: 'smooth' });
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function timeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  // ── AUTH MODAL ──
  function openModal() { modalOverlay.hidden = false; }
  function closeModal() { modalOverlay.hidden = true; }

  loginBtn.addEventListener('click', openModal);
  signupBtn.addEventListener('click', openModal);
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  document.querySelectorAll('.mtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      loginForm.hidden = !isLogin;
      registerForm.hidden = isLogin;
    });
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('loginMsg');
    msg.textContent = 'Signing in…';
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('loginEmail').value,
          password: document.getElementById('loginPassword').value,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        authToken = data.token;
        localStorage.setItem('textgen_token', authToken);
        msg.textContent = '';
        closeModal();
        showToast(`Welcome back, ${data.user.name}`);
      } else {
        msg.textContent = data.error || 'Could not sign in.';
      }
    } catch {
      msg.textContent = 'Could not reach the server.';
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('registerMsg');
    msg.textContent = 'Creating account…';
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('regName').value,
          email: document.getElementById('regEmail').value,
          password: document.getElementById('regPassword').value,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        authToken = data.token;
        localStorage.setItem('textgen_token', authToken);
        msg.textContent = '';
        closeModal();
        showToast(`Welcome, ${data.user.name}`);
      } else {
        msg.textContent = data.error || 'Could not create account.';
      }
    } catch {
      msg.textContent = 'Could not reach the server.';
    }
  });

  // ── INIT ──
  renderHistory();
});

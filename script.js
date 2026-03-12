'use strict';

const BACKEND_URL = 'https://web-production-2401b.up.railway.app';

document.addEventListener('DOMContentLoaded', function () {

    let activeAction = 'generate';
    let history = [];
    let currentUser = null;

    const cursorGlow   = document.getElementById('cursorGlow');
    const inputText    = document.getElementById('inputText');
    const charCount    = document.getElementById('charCount');
    const charHint     = document.getElementById('charHint');
    const meterRing    = document.getElementById('meterRing');
    const runBtn       = document.getElementById('runBtn');
    const clearBtn     = document.getElementById('clearBtn');
    const copyBtn      = document.getElementById('copyBtn');
    const saveBtn      = document.getElementById('saveBtn');
    const outputEmpty  = document.getElementById('outputEmpty');
    const outputLoad   = document.getElementById('outputLoading');
    const outputResult = document.getElementById('outputResult');
    const outputText   = document.getElementById('outputText');
    const loadingLabel = document.getElementById('loadingLabel');
    const toast        = document.getElementById('toast');
    const histSection  = document.getElementById('historySection');
    const histList     = document.getElementById('historyList');
    const loginBtn     = document.getElementById('loginBtn');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalClose   = document.getElementById('modalClose');
    const toolPills    = document.querySelectorAll('.tool-pill');

    document.addEventListener('mousemove', e => {
        if (cursorGlow) {
            cursorGlow.style.left = e.clientX + 'px';
            cursorGlow.style.top  = e.clientY + 'px';
        }
    });

    window.addEventListener('scroll', () => {
        const nav = document.getElementById('nav');
        if (nav) nav.classList.toggle('scrolled', window.scrollY > 10);
    });

    toolPills.forEach(pill => {
        pill.addEventListener('click', () => {
            toolPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeAction = pill.dataset.action;
        });
    });

    const LABEL_MAP = {
        generate: 'Generating…',
        rephrase: 'Rephrasing…',
        grammar:  'Fixing grammar…',
        script:   'Writing script…',
    };

    inputText.addEventListener('input', () => {
        const len = inputText.value.length;
        const pct = (len / 500) * 100;

        charCount.textContent = len;
        charHint.textContent  = `${len} / 500 characters`;

        const circ = 2 * Math.PI * 15.9;
        const fill = (pct / 100) * circ;
        meterRing.style.strokeDasharray = `${fill} ${circ}`;
        meterRing.style.stroke = pct >= 90 ? '#ff5e5e' : '#a855f7';
        charCount.style.color  = pct >= 90 ? '#ff5e5e' : '';
    });

    clearBtn.addEventListener('click', () => {
        inputText.value = '';
        inputText.dispatchEvent(new Event('input'));
        inputText.focus();
    });

    runBtn.addEventListener('click', processText);

    inputText.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') processText();
    });

    async function processText() {
        const text = inputText.value.trim();
        if (!text) {
            inputText.style.outline = '1.5px solid rgba(168,85,247,0.5)';
            setTimeout(() => { inputText.style.outline = ''; }, 600);
            showToast('Please enter some text first');
            return;
        }

        outputEmpty.style.display  = 'none';
        outputResult.style.display = 'none';
        outputLoad.style.display   = 'flex';
        loadingLabel.textContent   = LABEL_MAP[activeAction] || 'Processing…';
        copyBtn.style.display = 'none';
        saveBtn.style.display = 'none';

        runBtn.style.transform = 'scale(0.92)';
        setTimeout(() => { runBtn.style.transform = ''; }, 150);

        try {
            const headers = { 'Content-Type': 'application/json' };
            const token = localStorage.getItem('tg_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`${BACKEND_URL}/api/process`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ text, action: activeAction }),
            });

            const data = await res.json();
            outputLoad.style.display = 'none';

            if (res.ok && data.success) {
                showResult(data.result);
                addToHistory(activeAction, text, data.result);
            } else {
                showResult(`Error: ${data.error || 'Unknown error'}`, true);
            }

        } catch (err) {
            outputLoad.style.display = 'none';
            showResult('Could not reach the server. Make sure the backend is running.', true);
            console.error(err);
        }
    }

    function showResult(text, isError = false) {
        outputResult.style.display = 'flex';
        outputText.textContent     = text;
        outputText.style.color     = isError ? 'var(--red)' : '';

        if (!isError) {
            copyBtn.style.display = 'inline-flex';
            saveBtn.style.display = 'inline-flex';
        }

        outputResult.style.opacity = '0';
        requestAnimationFrame(() => {
            outputResult.style.transition = 'opacity .4s ease';
            outputResult.style.opacity    = '1';
        });
    }

    copyBtn.addEventListener('click', () => {
        const text = outputText.textContent;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard ✓');
            copyBtn.innerHTML = '<span>✓</span> Copied';
            setTimeout(() => { copyBtn.innerHTML = '<span>⎘</span> Copy'; }, 2000);
        });
    });

    saveBtn.addEventListener('click', () => {
        showToast('Saved to history ✓');
        renderHistory();
    });

    function addToHistory(action, input, result) {
        history.unshift({ action, input, result, time: new Date() });
        if (history.length > 20) history.pop();
        renderHistory();
    }

    function renderHistory() {
        if (history.length === 0) { histSection.style.display = 'none'; return; }
        histSection.style.display = 'block';
        histList.innerHTML = '';

        history.forEach((item, i) => {
            const el = document.createElement('div');
            el.className = 'history-item';
            const timeStr = item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            el.innerHTML = `
                <span class="history-badge">${item.action}</span>
                <span class="history-text">${escHtml(item.input)}</span>
                <span class="history-time">${timeStr}</span>
                <button class="history-restore" data-index="${i}">Restore</button>
            `;
            histList.appendChild(el);
        });

        histList.querySelectorAll('.history-restore').forEach(btn => {
            btn.addEventListener('click', e => {
                const idx  = parseInt(e.target.dataset.index, 10);
                const item = history[idx];
                inputText.value = item.input;
                inputText.dispatchEvent(new Event('input'));
                showResult(item.result);
                showToast('Restored ✓');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    }

    document.getElementById('clearHistory').addEventListener('click', () => {
        history = [];
        histSection.style.display = 'none';
        showToast('History cleared');
    });

    let toastTimer;
    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    }

    if (loginBtn) loginBtn.addEventListener('click', () => openModal());
    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', e => {
        if (e.target === modalOverlay) closeModal();
    });

    function openModal()  { modalOverlay.style.display = 'flex'; }
    function closeModal() { modalOverlay.style.display = 'none'; }

    document.querySelectorAll('.mtab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const which = tab.dataset.tab;
            document.getElementById('loginForm').style.display    = which === 'login'    ? 'flex' : 'none';
            document.getElementById('registerForm').style.display = which === 'register' ? 'flex' : 'none';
        });
    });

    document.getElementById('loginSubmit').addEventListener('click', async () => {
        const email    = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const msg      = document.getElementById('loginMsg');

        if (!email || !password) { msg.textContent = 'Please fill in all fields.'; return; }
        msg.textContent = 'Signing in…';

        try {
            const res  = await fetch(`${BACKEND_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (res.ok && data.token) {
                currentUser = data.user;
                localStorage.setItem('tg_token', data.token);
                closeModal();
                loginBtn.textContent = currentUser.name || 'Account';
                showToast(`Welcome back, ${currentUser.name || 'User'} ✓`);
            } else {
                msg.textContent = data.error || 'Login failed.';
            }
        } catch {
            msg.textContent = 'Server unreachable.';
        }
    });

    document.getElementById('registerSubmit').addEventListener('click', async () => {
        const name     = document.getElementById('regName').value.trim();
        const email    = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;
        const msg      = document.getElementById('registerMsg');

        if (!name || !email || !password) { msg.textContent = 'Please fill in all fields.'; return; }
        if (password.length < 6) { msg.textContent = 'Password must be at least 6 characters.'; return; }
        msg.textContent = 'Creating account…';

        try {
            const res  = await fetch(`${BACKEND_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password }),
            });
            const data = await res.json();
            if (res.ok && data.token) {
                currentUser = data.user;
                localStorage.setItem('tg_token', data.token);
                closeModal();
                loginBtn.textContent = currentUser.name || 'Account';
                showToast(`Welcome, ${name} ✓`);
            } else {
                msg.textContent = data.error || 'Registration failed.';
            }
        } catch {
            msg.textContent = 'Server unreachable.';
        }
    });

    function escHtml(str) {
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    const token = localStorage.getItem('tg_token');
    if (token) {
        loginBtn.textContent = 'Account';
    }

});

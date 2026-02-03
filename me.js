/*
 * KnowEasy OS – Me page enhancements
 *
 * This module implements a lightweight daily tasks checklist. Students can
 * add, complete and persist tasks locally without any backend. Tasks are
 * stored in localStorage under a versioned key. The modal uses the
 * existing modal styles from study.js and styles.css. Whenever the
 * checklist is opened, the list refreshes to reflect the latest state.
 */
(function () {
  'use strict';

  // --- Role lock (v10) ---
  // If a parent is logged in and no student session exists, block student Me.
  try{
    if(window.KnowEasyAuth){
      const parentToken = window.KnowEasyAuth.getToken ? window.KnowEasyAuth.getToken('parent') : '';
      const studentToken = window.KnowEasyAuth.getToken ? window.KnowEasyAuth.getToken('student') : '';
      if(parentToken && !studentToken){
        window.location.replace('parent.html');
        return;
      }
      // Ensure student surface uses student session
      if(window.KnowEasyAuth.setActiveRole) window.KnowEasyAuth.setActiveRole('student');
    }
  }catch(_e){}

  const TASKS_KEY = 'ke_daily_tasks_v1';

  function loadTasks() {
    try {
      const raw = localStorage.getItem(TASKS_KEY);
      const tasks = raw ? JSON.parse(raw) : [];
      if (Array.isArray(tasks)) return tasks;
      return [];
    } catch (_) {
      return [];
    }
  }

  function saveTasks(tasks) {
    try {
      localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
    } catch (_) {}
  }

  /**
   * Render the tasks list into the DOM. Applies a `.done` class for
   * completed items. If no tasks exist, shows an empty state message.
   */
  function renderTasks() {
    const listEl = document.getElementById('tasks-list');
    const emptyEl = document.getElementById('tasks-empty');
    if (!listEl) return;
    const tasks = loadTasks();
    listEl.innerHTML = '';
    if (!tasks.length) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    tasks.forEach((task, index) => {
      const li = document.createElement('li');
      if (task.done) li.classList.add('done');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!task.done;
      cb.addEventListener('change', () => {
        const tasksNew = loadTasks();
        tasksNew[index].done = cb.checked;
        saveTasks(tasksNew);
        renderTasks();
      });
      const span = document.createElement('span');
      span.textContent = task.text;
      li.appendChild(cb);
      li.appendChild(span);
      listEl.appendChild(li);
    });
  }

  /**
   * Opens the daily tasks modal. If the modal exists, it becomes visible
   * and the current tasks are rendered. Also ensures that modal close
   * handlers are bound (defined in study.js). Calling this multiple
   * times is safe.
   */
  function openTasksModal() {
    const overlay = document.getElementById('tasks-modal');
    if (!overlay) return;
    renderTasks();
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    if (typeof updateModalOpenClass === 'function') {
      updateModalOpenClass();
    }
    if (typeof bindModalClosersOnce === 'function') {
      bindModalClosersOnce();
    }
  }

  function addTask() {
    const input = document.getElementById('new-task-input');
    if (!input) return;
    const text = String(input.value || '').trim();
    if (!text) return;
    const tasks = loadTasks();
    tasks.push({ text, done: false });
    saveTasks(tasks);
    input.value = '';
    renderTasks();
  }

  // Event bindings on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('add-task-btn');
    if (addBtn) addBtn.addEventListener('click', addTask);
    const input = document.getElementById('new-task-input');
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addTask();
        }
      });
    }
  });

  // Expose openTasksModal globally so inline onclick can call it
  window.openTasksModal = openTasksModal;
})();

/* Phase-1: Student Profile + Parent Access (front-end ready)
   - Stores student profile locally (and auto-syncs if backend endpoint exists)
   - Generates Parent Code (calls backend if available)
*/
(function(){
  'use strict';

  // Phase-1 CEO decision:
  // - Class/Board selection remains owned by the existing onboarding flow (welcome/setup)
  //   stored under: knoweasy_student_profile_v1
  // - This "Student profile" card is only for parent insights identity: name + target exams.
  //   It must NOT ask for class 11/12 only (KnowEasy supports class 5-12).
  const IDENTITY_LOCAL_KEY = 'ke_student_identity_v1';
  const ONBOARD_PROFILE_KEY = 'knoweasy_student_profile_v1';
  const ACTIVE_YEAR_KEY = 'knoweasy_active_year_v1';

  const summaryEl = document.getElementById('studentProfileSummary');
  const hintEl = document.getElementById('studentProfileHint');
  const editBtn = document.getElementById('editStudentProfileBtn');
  const clearBtn = document.getElementById('clearStudentProfileBtn');

  const genCodeBtn = document.getElementById('generateParentCodeBtn');
  const openParentBtn = document.getElementById('openParentDashboardBtn');
  const codeBox = document.getElementById('parentCodeBox');
  const codeText = document.getElementById('parentCodeText');
  const codeMeta = document.getElementById('parentCodeMeta');
  const copyCodeBtn = document.getElementById('copyParentCodeBtn');
  const codeMsg = document.getElementById('parentCodeMsg');

  function safeParse(raw){
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  function escapeHtml(s){
    return String(s==null?'' : s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function getIdentity(){
    return safeParse(localStorage.getItem(IDENTITY_LOCAL_KEY));
  }

  function setIdentity(p){
    try{
      if(!p) localStorage.removeItem(IDENTITY_LOCAL_KEY);
      else localStorage.setItem(IDENTITY_LOCAL_KEY, JSON.stringify({...p, updated_at: Date.now()}));
    }catch{}
  }

  // Best-effort: keep backend student profile in sync so Parent Dashboard shows the latest student name/class.
  // Never blocks UI; safe to fail silently.
  const PROFILE_SYNC_KEY = 'ke_student_profile_last_sync_v1';
  async function syncStudentProfileFromLocal(){
    try{
      if(!(window.KnowEasyAuth && window.KnowEasyAuth.getToken)) return;
      const token = window.KnowEasyAuth.getToken('student');
      if(!token) return;

      const ident = getIdentity();
      if(!ident || !ident.full_name) return;

      const onboard = getOnboardProfile();
      const payload = {
        full_name: String(ident.full_name || '').trim(),
        board: onboard ? String(onboard.board || '').trim() : null,
        class: onboard ? String(effectiveClass(onboard) || '').trim() : null,
      };
      if(!payload.full_name) return;

      const fingerprint = JSON.stringify(payload);
      const last = String(localStorage.getItem(PROFILE_SYNC_KEY) || '');
      if(last === fingerprint) return;

      await ensureConfigLoaded();
      const api = window.KnowEasyAuth.apiFetch;
      if(typeof api !== 'function') return;
      await api('/student/profile', { method:'POST', body: JSON.stringify(payload), noAuthRedirect: true });
      localStorage.setItem(PROFILE_SYNC_KEY, fingerprint);
    }catch(_){ /* ignore */ }
  }

  function getOnboardProfile(){
    const p = safeParse(localStorage.getItem(ONBOARD_PROFILE_KEY)) || null;
    if(!p) return null;
    const cls = String(p.class || '').trim();
    const board = String(p.board || '').trim().toLowerCase();
    if(!cls || !board) return null;
    return { class: cls, board };
  }

  function effectiveClass(onboard){
    if(!onboard) return '';
    if(String(onboard.class) === '11_12'){
      const y = String(localStorage.getItem(ACTIVE_YEAR_KEY) || '11');
      return (y === '12') ? '12' : '11';
    }
    return String(onboard.class || '');
  }

  function showMsg(el, text, ok){
    if(!el) return;
    el.textContent = text || '';
    el.style.opacity = text ? '1' : '0';
    el.style.color = ok ? 'inherit' : '#b91c1c';
  }

  // Some actions on this page call the backend directly (e.g., parent-code).
  // Ensure config.json is loaded first so the API base URL is correct.
  async function ensureConfigLoaded(){
    try{ await KE.loadConfig(); } catch(_){ /* ignore */ }
  }

  async function pingBackend(){
    // Lightweight connection hint for Phase-1 readiness.
    await ensureConfigLoaded();
    try{
      const res = await KE.fetchJson(KE.apiUrl('/health'), { method: 'GET' });
      if(res && res.ok){
        showMsg(codeMsg, 'Backend connected ✅', true);
        return true;
      }
    } catch(_){ /* ignore */ }
    // Keep message subtle; don’t block UI.
    showMsg(codeMsg, 'Backend not reachable. If this continues, try refreshing.', false);
    return false;
  }

  function renderProfile(){
    if(!summaryEl) return;
    const identity = getIdentity() || {};
    const onboard = getOnboardProfile();
    // Use raw class for display so integrated 11_12 shows as 11–12. Keep effectiveClass for logic.
    const clsRaw = onboard ? String(onboard.class || '') : '';
    const classDisplay = (clsRaw === '11_12') ? '11–12' : clsRaw;
    const clsEff = effectiveClass(onboard);

    const name = (identity.full_name || '').trim();
    // Target exams are meaningful only for classes 11 & 12 (including integrated 11_12). Use numeric effective class.
    const classNum = (clsRaw === '11_12') ? 11 : Number(clsEff || 0);
    const exams = (classNum >= 11)
      ? (Array.isArray(identity.target_exams) ? identity.target_exams.join(', ') : (identity.target_exams || ''))
      : '';

    if(!name && !exams){
      summaryEl.innerHTML = `<div style="opacity:0.72; font-size:13px; line-height:1.45;">No student identity yet.</div>`;
      if(hintEl) hintEl.innerHTML = onboard ? 'Add your name for premium parent insights. Class/board comes from onboarding.' : 'First set your class & board in onboarding, then add your name here.';
      return;
    }

    const boardText = onboard ? String(onboard.board||'').toUpperCase() : '--';
    const classText = classDisplay || '--';

    summaryEl.innerHTML = `
      <div style="font-weight:950;">${escapeHtml(name || 'Student')}</div>
      <div style="opacity:0.72; font-size:13px; margin-top:4px; line-height:1.45;">
        ${escapeHtml(boardText)} • Class ${escapeHtml(classText)}${exams ? ' • ' + escapeHtml(exams) : ''}
      </div>
    `;
    if(hintEl) hintEl.innerHTML = 'Parents only see summaries. No personal notes or AI chats.';
  }

  // Premium editor: uses the built-in modal (no window.prompt)
  const modal = document.getElementById('student-profile-modal');
  const modalName = document.getElementById('sp-name');
  const modalClass = document.getElementById('sp-class');
  const modalExams = document.getElementById('sp-exams');
  const modalSave = document.getElementById('sp-save');
  const modalCancel = document.getElementById('sp-cancel');
  const modalClose = document.querySelector('[data-close-student-profile]');

  function openModal(){
    if(!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden','false');
    try{ if(typeof updateModalOpenClass === 'function') updateModalOpenClass(); }catch{}
  }

  function closeModal(){
    if(!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden','true');
    try{ if(typeof updateModalOpenClass === 'function') updateModalOpenClass(); }catch{}
  }

  function openProfileEditor(){
    const identity = getIdentity() || {};
    const onboard = getOnboardProfile();
    const clsEff = effectiveClass(onboard);
    const clsRaw = onboard ? String(onboard.class || '') : '';
    const classLabel = (clsRaw === '11_12') ? '11–12' : clsRaw;
    const classNum = (clsRaw === '11_12') ? 11 : Number(clsEff || 0);
    const boardText = onboard ? String(onboard.board||'').toUpperCase() : '';

    if(modalName) modalName.value = identity.full_name || '';
    if(modalExams) modalExams.value = Array.isArray(identity.target_exams) ? identity.target_exams.join(', ') : (identity.target_exams || '');

    // Hide target exams for Class 5–10
    try{
      const wrap = modalExams ? modalExams.closest('div') : null;
      if(wrap) wrap.style.display = (classNum >= 11) ? '' : 'none';
    }catch{}

    if(modalClass){
      // Keep the field for layout compatibility, but make it read-only.
      modalClass.readOnly = true;
      modalClass.value = (boardText && classLabel) ? `${boardText} • Class ${classLabel}` : 'Set class & board in Manage profile';
    }

    openModal();
  }

  async function saveProfileFromModal(){
    const onboard = getOnboardProfile();
    const clsEff = effectiveClass(onboard);
    const board = onboard ? String(onboard.board||'').toLowerCase() : '';
    if(!clsEff || !board){
      showMsg(codeMsg, 'Please set your Class & Board first (Manage profile).', false);
      closeModal();
      return;
    }

    const name = String(modalName && modalName.value || '').trim();
    const classNum = Number(clsEff || 0);
    const examsRaw = String(modalExams && modalExams.value || '').trim();
    const target = (classNum >= 11 && examsRaw)
      ? examsRaw.split(',').map(x=>x.trim()).filter(Boolean)
      : [];

    setIdentity({ full_name: name, target_exams: target });
    renderProfile();
    closeModal();

    // Best-effort sync to backend (if endpoint exists)
    try{
      if(window.KnowEasyAuth && window.KnowEasyAuth.apiFetch){
        window.KnowEasyAuth.apiFetch('/student/profile', {
          method:'POST',
          body: JSON.stringify({ full_name: name, class: Number(clsEff), board, target_exams: target })
        }).catch(()=>{});
      }
    }catch{}
  }

  async function generateParentCode(){
    showMsg(codeMsg, 'Generating…', true);
    codeBox && codeBox.classList.add('hidden');
    // Need login to generate
    const u = window.KnowEasyAuth && window.KnowEasyAuth.getUser ? window.KnowEasyAuth.getUser() : null;
    if(!u){
      showMsg(codeMsg, 'Login required to generate a Parent Code.', false);
      return;
    }

    try{
      // Attempt primary Phase‑1 endpoint first. If it fails with 404/405, fall back to legacy endpoint.
      const endpoints = ['/student/parent/link-code', '/student/parent-code'];
      let finalRes = null;
      let finalData = null;
      let lastError = null;
      for (let i = 0; i < endpoints.length; i++) {
        try {
          const {res, data, error} = await window.KnowEasyAuth.apiFetch(endpoints[i], {method:'POST', body: JSON.stringify({})});
          // network error: error present and no res
          if(!res){
            lastError = (error && error.message) ? error.message : 'Network/API error.';
            continue;
          }
          // If endpoint exists but method not allowed (405) or not found (404), try next
          if(res.status === 404 || res.status === 405){
            lastError = (data && (data.message || data.detail)) ? data.message || data.detail : `Endpoint ${endpoints[i]} unavailable`;
            continue;
          }
          finalRes = res;
          finalData = data;
          break;
        } catch(err){
          // Save last error and continue fallback
          lastError = (err && err.message) ? err.message : 'Network error';
        }
      }
      // If no response from any endpoint
      if(!finalRes){
        showMsg(codeMsg, lastError || 'Network error. Please try again.', false);
        return;
      }
      // Handle successful response
      if(finalRes.ok && finalData && finalData.code){
        if(codeText) codeText.textContent = finalData.code;
        if(codeMeta) codeMeta.textContent = `Valid for ${(finalData.expires_in_seconds||900)/60} minutes`;
        if(codeBox) codeBox.classList.remove('hidden');
        showMsg(codeMsg, 'Share this code with your parent. It is one‑time use.', true);
        // Track event asynchronously; ignore errors silently
        try{ window.KnowEasyAuth.apiFetch('/events/track', {method:'POST', body: JSON.stringify({event_type:'parent_code_generated', meta:{}})}).catch(()=>{}); }catch{}
        return;
      }
      // If response is not ok, show message from backend or generic error
      const msg = (finalData && (finalData.message || finalData.detail)) ? (finalData.message || finalData.detail) : 'Could not generate code.';
      showMsg(codeMsg, `Error ${finalRes.status}: ${msg}`, false);
    }catch(e){
      showMsg(codeMsg, (e && e.message) ? e.message : 'Network error. Please try again.', false);
    }
  }

  function copyParentCode(){
    const code = (codeText && codeText.textContent) ? codeText.textContent.trim() : '';
    if(!code) return;
    try{
      navigator.clipboard.writeText(code);
      showMsg(codeMsg, 'Copied. Send it to your parent.', true);
    }catch{
      // fallback
      try{
        const ta = document.createElement('textarea');
        ta.value = code; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        ta.remove();
        showMsg(codeMsg, 'Copied. Send it to your parent.', true);
      }catch{}
    }
  }

  function openParentDashboard(){
    window.location.href = 'parent.html';
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderProfile();

    // Background sync so Parent Dashboard shows the latest student name/class.
    syncStudentProfileFromLocal();

    // Show backend connectivity (helps debug Parent Code generation).
    pingBackend();

    // Premium UX: Student identity + Parent access are features for logged-in student accounts.
    // When logged out, keep the cards visible but lock actions to avoid confusing states.
    try{
      const u = window.KnowEasyAuth && window.KnowEasyAuth.getUser ? window.KnowEasyAuth.getUser() : null;
      const role = u && u.role ? String(u.role) : '';
      const loggedIn = !!u;
      const isStudent = role ? (role === 'student') : true; // if role missing, treat as student until backend enforces

      if(!loggedIn){
        if(editBtn) editBtn.disabled = true;
        if(clearBtn) clearBtn.disabled = true;
        if(genCodeBtn) genCodeBtn.disabled = true;
        if(openParentBtn) openParentBtn.disabled = true;
        showMsg(codeMsg, 'Login required to enable Parent Access and dashboards.', false);
      }

      if(role === 'parent'){
        // Parent accounts should not manage student identity from Me.
        if(editBtn) editBtn.disabled = true;
        if(clearBtn) clearBtn.disabled = true;
        if(genCodeBtn) genCodeBtn.disabled = true;
        showMsg(codeMsg, 'This is a Parent account. Use Parent Dashboard only.', false);
      }
    }catch(_){ }
    if(editBtn) editBtn.addEventListener('click', openProfileEditor);
    if(clearBtn) clearBtn.addEventListener('click', () => { setIdentity(null); renderProfile(); });
    if(modalSave) modalSave.addEventListener('click', saveProfileFromModal);
    if(modalCancel) modalCancel.addEventListener('click', closeModal);
    if(modalClose) modalClose.addEventListener('click', closeModal);
    if(modal){
      modal.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(); });
    }
    if(genCodeBtn) genCodeBtn.addEventListener('click', generateParentCode);
    if(copyCodeBtn) copyCodeBtn.addEventListener('click', copyParentCode);
    if(openParentBtn) openParentBtn.addEventListener('click', openParentDashboard);
  });
})();

/* Phase-Next: Billing & Usage (trust layer)
   - Reads /payments/me
   - Shows plan, validity, credits, reset date
   - Links to upgrade + booster section
*/
(function(){
  'use strict';

  function esc(s){
    return String(s==null? '' : s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function fmtDate(iso){
    if(!iso) return '';
    try{
      const d = new Date(iso);
      if(isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { day:'2-digit', month:'short', year:'numeric' });
    }catch(_e){
      return '';
    }
  }

  function planLabel(p){
    const v = String(p||'free').toLowerCase();
    if(v === 'max') return 'Max';
    if(v === 'pro') return 'Pro';
    return 'Free';
  }

  function showMsg(el, text, ok){
    if(!el) return;
    el.textContent = text || '';
    el.style.opacity = text ? '1' : '0';
    el.style.color = ok ? 'inherit' : '#b91c1c';
  }

  async function loadBilling(){
    const summary = document.getElementById('billingSummary');
    const msg = document.getElementById('billingMsg');
    if(!summary) return;

    // Default skeleton
    summary.innerHTML = '<div style="opacity:0.72; font-size:13px;">Loading…</div>';

    try{
      if(window.KE && typeof KE.loadConfig === 'function'){
        try{ await KE.loadConfig(); }catch(_e){}
      }

      const api = window.KnowEasyAuth && window.KnowEasyAuth.apiFetch;
      const token = window.KnowEasyAuth && window.KnowEasyAuth.getToken ? window.KnowEasyAuth.getToken('student') : null;
      if(typeof api !== 'function'){
        summary.innerHTML = '<div style="opacity:0.72; font-size:13px;">Billing unavailable.</div>';
        return;
      }

      // If not logged in as student, don't show scary network errors.
      if(!token){
        summary.innerHTML = '<div style="opacity:0.78; font-size:13px; line-height:1.55;">Login to view your plan and AI usage.</div>';
        showMsg(msg, '', true);
        // Hide actions until login
        const up = document.getElementById('billingUpgradeBtn');
        const boosterBtn = document.getElementById('billingBuyBoosterBtn');
        const histBtn = document.getElementById('billingHistoryBtn');
        if(up) up.style.display = 'none';
        if(boosterBtn) boosterBtn.style.display = 'none';
        if(histBtn) histBtn.style.display = 'none';
        return;
      }else{
        const up = document.getElementById('billingUpgradeBtn');
        const boosterBtn = document.getElementById('billingBuyBoosterBtn');
        if(up) up.style.display = '';
        if(boosterBtn) boosterBtn.style.display = '';
        const histBtn = document.getElementById('billingHistoryBtn');
        if(histBtn) histBtn.style.display = '';
      }

      const { res, data, error } = await api('/payments/me', { method:'GET' });
      if(error){
        // Treat auth errors as logged-out state.
        const status = (res && typeof res.status === 'number') ? res.status : 0;
        if(status === 401 || status === 403){
          summary.innerHTML = '<div style="opacity:0.78; font-size:13px; line-height:1.55;">Login to view your plan and AI usage.</div>';
          showMsg(msg, '', true);
          return;
        }
        summary.innerHTML = '<div style="opacity:0.72; font-size:13px;">Could not load billing.</div>';
        showMsg(msg, 'Network error. Try refreshing.', false);
        return;
      }
      if(!res || !res.ok || !data || !data.ok){
        summary.innerHTML = '<div style="opacity:0.72; font-size:13px;">Could not load billing.</div>';
        showMsg(msg, 'Billing not available right now.', false);
        return;
      }

      const sub = (data.subscription || {});
      const wallet = (data.wallet || data.credits || {});

      const plan = planLabel(sub.plan);
      const rawCycle = (sub.billing_cycle || wallet.billing_cycle || '').toString().toLowerCase();
      const cycle = rawCycle === 'yearly' ? 'Yearly' : (rawCycle === 'monthly' ? 'Monthly' : (rawCycle || 'Monthly'));
      const validTill = fmtDate(sub.expires_at || sub.valid_till || sub.validTill) || '—';
      const resetOn = fmtDate(wallet.resets_on || wallet.reset_on || wallet.cycle_end_at);

      const includedTotal = Number(wallet.included_total ?? wallet.included ?? wallet.plan_included ?? 0);
      const includedRemaining = Number(wallet.included_remaining ?? wallet.remaining ?? wallet.plan_remaining ?? 0);
      const used = Math.max(0, includedTotal - includedRemaining);
      const booster = Number(wallet.booster_remaining ?? wallet.booster ?? 0);

      const showCredits = (includedTotal > 0) || (includedRemaining > 0) || (booster > 0);

      const creditsBlock = showCredits ? `
        <div style="margin-top:10px;">
          <div style="font-weight:900;">AI usage (this cycle)</div>
          <div style="opacity:0.82; font-size:13px; margin-top:8px; line-height:1.55;">
            <span style="display:inline-block; margin-right:10px;">Included: <b>${esc(includedTotal)}</b></span>
            <span style="display:inline-block; margin-right:10px;">Used: <b>${esc(used)}</b></span>
            <span style="display:inline-block; margin-right:10px;">Left: <b>${esc(includedRemaining)}</b></span>
            <span style="display:inline-block;">Booster: <b>${esc(booster)}</b></span>
          </div>
          <div style="opacity:0.76; font-size:12px; margin-top:8px; line-height:1.55;">
            ${resetOn ? `Included credits reset on <b>${esc(resetOn)}</b>.` : 'Included credits reset every billing cycle.'}
            &nbsp; Booster credits <b>never expire</b>.
          </div>
        </div>
      ` : `
        <div style="opacity:0.72; font-size:13px; margin-top:10px; line-height:1.55;">
          AI usage details will appear here once available.
        </div>
      `;

      const pct = (includedTotal > 0) ? Math.min(100, Math.max(0, (used / includedTotal) * 100)) : 0;

      summary.innerHTML = `
        <div class="ke-chip-row" style="margin-top:2px;">
          <span class="chip"><b>Plan</b>: ${esc(plan)}</span>
          <span class="chip"><b>Cycle</b>: ${esc(cycle)}</span>
          <span class="chip"><b>Access till</b>: ${esc(validTill)}</span>
          <span class="chip"><b>Booster</b>: ${esc(booster)} <span style="opacity:.72;">(never expires)</span></span>
        </div>

        <div class="ke-meter" style="margin-top:12px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div style="font-weight:900;">Included credits <span class="ke-info" title="Credits are used in this order: (1) Included plan credits, (2) Booster credits (never expire)">i</span></div>
            <div style="opacity:0.78; font-size:12px;">${esc(includedRemaining)} left • ${esc(used)}/${esc(includedTotal)} used</div>
          </div>
          <div class="ke-meter__track" style="margin-top:8px;">
            <div class="ke-meter__fill" style="width:${pct.toFixed(0)}%;"></div>
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:8px; flex-wrap:wrap;">
            <div style="opacity:0.76; font-size:12px;">${resetOn ? `Resets on <b>${esc(resetOn)}</b>` : 'Resets every billing cycle'}</div>
            <div style="opacity:0.76; font-size:12px;">Typical doubt costs ~80–150 credits.</div>
          </div>
        </div>

        <details style="margin-top:12px;">
          <summary style="cursor:pointer; font-weight:900; font-size:13px; opacity:0.92;">Billing help</summary>
          <div style="margin-top:8px; opacity:0.78; font-size:12px; line-height:1.6;">
            • One active plan at a time.<br/>
            • Billing-cycle changes apply at the next renewal (prevents double payments).<br/>
            • If a payment fails or is cancelled, nothing changes — you can safely try again.
          </div>
        </details>
`;

      showMsg(msg, '', true);
    }catch(e){
      summary.innerHTML = '<div style="opacity:0.72; font-size:13px;">Could not load billing.</div>';
      showMsg(document.getElementById('billingMsg'), 'Something went wrong. Try refreshing.', false);
    }
  }

  function bindBillingButtons(){
    const up = document.getElementById('billingUpgradeBtn');
    if(up){
      up.addEventListener('click', () => {
        try{ window.location.href = 'upgrade.html'; }catch(_e){}
      });
    }
    const booster = document.getElementById('billingBuyBoosterBtn');
    if(booster){
      booster.addEventListener('click', () => {
        try{ window.location.href = 'upgrade.html#booster'; }catch(_e){}
      });
    }

    const hist = document.getElementById('billingHistoryBtn');
    if(hist){
      hist.addEventListener('click', () => {
        try{ window.location.href = 'payments.html'; }catch(_e){}
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindBillingButtons();
    loadBilling();
  });

})();

  const goUpgradeBtn = document.getElementById('goUpgradeBtn');
  if (goUpgradeBtn) {
    goUpgradeBtn.addEventListener('click', () => { window.location.href = 'upgrade.html'; });
  }

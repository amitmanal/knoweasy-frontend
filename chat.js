/* KnowEasy Chat (Phase1) - stable UI -> API bridge */
(() => {
  "use strict";
function keEscapeHtmlFallback(input) {
  const s = String(input == null ? "" : input);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


  function $(id){ return document.getElementById(id); }

  // -------------------------------------------------------------------------
  // Premium gating + Answer Mode (Quick/Deep/Exam)
  // -------------------------------------------------------------------------

  const premiumState = {
    plan: 'free',
    boosterRemaining: 0,
    includedRemaining: 0,
    isAuthed: false,
    canUseLiveAI: false,
    uiMode: 'tutor' // lite | tutor | mastery
  };

  function mapUiModeToAnswerMode(uiMode){
    const m = String(uiMode || '').toLowerCase();
    // Phase-4 canonical 3 modes
    if (m === 'mastery') return 'mastery';
    if (m === 'lite') return 'lite';
    return 'tutor';
  }

  function getSelectedAnswerMode(){
    return mapUiModeToAnswerMode(premiumState.uiMode);
  }

  function setModeUI(mode){
    premiumState.uiMode = mode;
    const btns = ['modeLite','modeTutor','modeMastery'];
    btns.forEach(id => {
      const b = $(id);
      if (!b) return;
      const isActive = b.dataset && b.dataset.mode === mode;
      b.classList.toggle('ke-seg__btn--active', !!isActive);
    });
    const hint = $('answerModeHint');
    if (hint) {
      hint.textContent = mode === 'mastery'
        ? 'Mastery is deeper and exam-ready (age-safe).'
        : (mode === 'tutor' ? 'Tutor teaches step-by-step.' : 'Lite is fastest clarity.');
    }
  }

  async function loadPlanAndGate(){
    try {
      try { if (window.KnowEasyAuth && typeof window.KnowEasyAuth.setActiveRole === 'function') window.KnowEasyAuth.setActiveRole('student'); } catch (e) {}
      const token = window.KnowEasyAuth && window.KnowEasyAuth.getToken ? (window.KnowEasyAuth.getToken('student') || window.KnowEasyAuth.getToken()) : null;
      premiumState.isAuthed = !!token;
      if (!premiumState.isAuthed) {
        premiumState.plan = 'free';
        premiumState.canUseLiveAI = false;
        return;
      }

      const { res, data } = await window.KnowEasyAuth.apiFetch('/payments/me', { method: 'GET', noAuthRedirect: true, role: 'student' });
      if (!res || !res.ok || !data || !data.ok) {
        // Fail safe: do not enable premium if we cannot verify
        premiumState.plan = 'free';
        premiumState.canUseLiveAI = false;
        return;
      }

      const sub = data.subscription || null;
      const wallet = data.wallet || null;
      const plan = String((sub && sub.plan) || (wallet && wallet.plan) || 'free').toLowerCase();
      premiumState.plan = plan;

      const includedRemaining = Number((wallet && (wallet.included_remaining ?? wallet.plan_remaining ?? wallet.remaining ?? wallet.included_credits_balance ?? 0)) ?? 0);
      const boosterRemaining = Number((wallet && (wallet.booster_remaining ?? wallet.booster ?? wallet.booster_credits_balance ?? 0)) ?? 0);
      premiumState.includedRemaining = Number.isFinite(includedRemaining) ? includedRemaining : 0;
      premiumState.boosterRemaining = Number.isFinite(boosterRemaining) ? boosterRemaining : 0;

      // Business rule: No live AI for free plan unless user has paid booster credits.
      const hasAnyCredits = (premiumState.boosterRemaining > 0) || (premiumState.includedRemaining > 0);
      premiumState.canUseLiveAI = (plan === 'pro' || plan === 'max') ? true : (hasAnyCredits ? true : false);
    } catch (e) {
      premiumState.plan = 'free';
      premiumState.canUseLiveAI = false;
      // Fallback (debug-friendly): if user is logged in but /payments/me is unavailable,
      // allow solving so chat doesn't appear "broken". Billing can still be enforced server-side.
      try {
        if (premiumState.isAuthed && window.KE && typeof window.KE.pingHealth === 'function') {
          const ok = await window.KE.pingHealth();
          if (ok) premiumState.canUseLiveAI = true;
        }
      } catch (_e2) {}
    }
  }

  function applyGateToUI(){
    const wrap = $('answerModeWrap');
    if (wrap) wrap.style.display = premiumState.canUseLiveAI ? 'block' : 'none';

    const solveBtn = $('solveBtn');
    if (solveBtn) solveBtn.disabled = !premiumState.canUseLiveAI;

    if (!premiumState.isAuthed) {
      // Not logged in: allow them to login
      const result = $('result');
      if (result) {
        result.innerHTML = `<div class="answer-card"><div class="answer-head"><div class="answer-title">Login required</div></div><div class="answer-final">Please login to use AI.
<br><br><a class="chat-btn chat-btn--primary" href="login.html?role=student&next=chat.html">Login</a></div></div>`;
      }
      return;
    }

    if (!premiumState.canUseLiveAI) {
      const result = $('result');
      if (result) {
        result.innerHTML = `<div class="answer-card"><div class="answer-head"><div class="answer-title">AI is a premium feature</div></div>
<div class="answer-final">To keep costs safe, Live AI is available only on <b>Pro</b>/<b>Max</b> (or with Booster credits).
<br><br>✅ You can still explore demos below:</div>
<div class="answer-meta-row" style="margin-top:10px">
  <a class="ke-chip" href="demos/demo_photosynthesis.html">Demo: Photosynthesis</a>
  <a class="ke-chip" href="demos/demo_numerical.html">Demo: Numerical</a>
  <a class="ke-chip" href="demos/demo_test_insights.html">Demo: Test insights</a>
  <a class="ke-chip ke-chip--ok" href="upgrade.html">Upgrade</a>
</div></div>`;
      }
    }
  }

  function setLoading(isLoading){
    const solveBtn = $("solveBtn");
    if (!solveBtn) return;
    // If premium gate is closed, keep disabled.
    solveBtn.disabled = premiumState.canUseLiveAI ? !!isLoading : true;
    solveBtn.textContent = isLoading ? "Solving…" : "Solve";
  }

  function setError(msg){
    const result = $("result");
    if (!result) return;
    if (!msg) return;
    result.innerHTML = `<div class="ke-error">${(window.KE && typeof window.KE.escapeHtml === "function") ? window.KE.escapeHtml(msg) : keEscapeHtmlFallback(msg)}</div>`;
  }

  /**
   * Render a gentle offline message into the result container. When the
   * service is unreachable or the user is offline, we avoid showing a
   * generic network error and instead explain what’s happening in plain
   * language. This helper constructs a small panel with a title and
   * description. Styles live in styles.css under `.ke-offline*`.
   *
   * @param {HTMLElement} result The container where the answer normally
   *   appears.
   */
  function renderOfflineMessage(result) {
    if (!result) return;
    const html = `
      <div class="ke-offline">
        <div class="ke-offline-title">Luma is offline</div>
        <p class="ke-offline-desc">Our AI service is temporarily unavailable or you’re currently offline. This feature works only when you have an internet connection.\nUse your study materials for now and come back soon!</p>
      </div>
    `;
    result.innerHTML = html;
  }

  
  const PROFILE_KEY = "knoweasy_student_profile_v1";

  function normalizeBoardForSelect(board){
    const b = String(board || "").toLowerCase().trim();
    const map = {
      cbse: "CBSE",
      "cbse_board": "CBSE",
      mh: "MH",
      maharashtra: "MH",
      "maharashtra_board": "MH",
      msb: "MH",
      icse: "ICSE",
      "icse_board": "ICSE",
      other: "Other"
    };
    return map[b] || (b ? (b.toUpperCase()==="CBSE"?"CBSE":b.toUpperCase()==="MH"?"MH":b.toUpperCase()==="ICSE"?"ICSE":"") : "");
  }

  function normalizeBoardForStorage(selectValue){
    const v = String(selectValue || "").trim();
    if (v === "CBSE") return "cbse";
    if (v === "MH") return "maharashtra";
    if (v === "ICSE") return "icse";
    return "other";
  }

  function normalizeClassForSelect(k){
    const s = String(k || "").trim();
    if (!s) return "";
    if (s === "11+12") return "11_12";
    return s;
  }

  function readProfileFallback(){
    try{
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(_){
      return null;
    }
  }

  function writeProfile(p){
    try{ localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }catch(_){}
  }

  function initFromProfile(){
    const boardEl = $("board");
    const classEl = $("klass");
    const subjEl  = $("subject");
    let p = null;

    try{
      if (window.KE && typeof window.KE.getProfile === "function"){
        p = window.KE.getProfile();
      }
    }catch(_){}

    if (!p) p = readProfileFallback();
    if (!p) return;

    if (boardEl){
      const bSel = normalizeBoardForSelect(p.board);
      if (bSel && Array.from(boardEl.options).some(o => o.value === bSel)) boardEl.value = bSel;
    }
    if (classEl){
      const cSel = normalizeClassForSelect(p.class || p.klass);
      if (cSel && Array.from(classEl.options).some(o => o.value === cSel)) classEl.value = cSel;
    }
    if (subjEl){
      const s = String(p.subject || "").trim();
      if (s && Array.from(subjEl.options).some(o => String(o.value) === s)) subjEl.value = s;
    }
  }

  function syncProfileFromForm(){
    const boardEl = $("board");
    const classEl = $("klass");
    if (!boardEl || !classEl) return;

    const profile = readProfileFallback() || {};
    profile.class = normalizeClassForSelect(classEl.value) || profile.class;
    profile.board = normalizeBoardForStorage(boardEl.value) || profile.board;
    profile.updatedAt = Date.now();
    writeProfile(profile);
  }


function getPayload(){
    // Capture the user question
    const question = ($("q")?.value || "").trim();
    // Determine answer mode from the mode selector (lite, tutor, mastery)
    const answer_mode = getSelectedAnswerMode();
    const exam_mode = answer_mode === 'mastery' ? 'BOARD' : undefined;
    // Session flags
    const private_session = !!($('privateSessionToggle') && $('privateSessionToggle').checked);
    const memory_opt_in = !!($('rememberToggle') && $('rememberToggle').checked);
    const surface = 'chat_ai';
    // Infer board, class and subject from the stored profile (if available).  Do not read from UI dropdowns.
    let board = "";
    let klass = "";
    let subject = "";
    try {
      const profile = window.KE && typeof window.KE.getProfile === 'function' ? window.KE.getProfile() : null;
      if (profile) {
        board = profile.board || '';
        klass = profile.class || profile.klass || '';
        subject = profile.subject || '';
      }
    } catch (_e) {}
    const payload = { question, answer_mode, exam_mode, private_session, memory_opt_in, surface };
    if (board) payload.board = board;
    if (klass) payload.class = klass;
    if (subject) payload.subject = subject;
    return payload;
  }

  function validate(p){
    if (!p.question) return "Type your question";
    return null;
  }

  async function onSolve(){
    const KE = window.KE;
    if (!KE) return setError("Core not loaded.");
    const result = $("result");

    // Premium gating: no live AI for free users (demos + upgrade only)
    if (!premiumState.canUseLiveAI) {
      applyGateToUI();
      return;
    }
    const p = getPayload();
    const err = validate(p);
    if (err) return setError(err);

    setError(""); // clear
    setLoading(true);

    try{
      // keep payload small and backend-friendly
      const payload = {
        question: p.question,
        // Phase-4: allow auto-detect if these are missing
        ...(p.board ? { board: p.board } : {}),
        ...(p.klass || p.class ? { class: (p.klass || p.class) } : {}),
        ...(p.subject ? { subject: p.subject } : {}),
        // 3 modes: lite | tutor | mastery
        answer_mode: p.answer_mode,
        ...(p.exam_mode ? { exam_mode: p.exam_mode } : {}),
      };
      const data = await KE.postSolve({
        ...payload,
        private_session: !!payload.private_session,
        memory_opt_in: !!payload.memory_opt_in,
        surface: payload.surface || 'chat_ai'
      });
      KE.setApiBadge("ok","API: connected");
      if (window.PremiumRenderer && typeof window.PremiumRenderer.render === "function") {
        try { window.PremiumRenderer.render(data, result); }
        catch(_e){ KE.renderAnswer(result, data); }
      } else {
        KE.renderAnswer(result, data);
      }
    }catch(e){
      // Set API badge to error so the UI reflects connectivity issues
      KE.setApiBadge("bad","API: error");
      const offline = !navigator.onLine || (e && /Failed to fetch/i.test(e.message || ""));
      console.error("[KE] solve failed:", e);
      if (offline) {
        // When offline or network fetch failed, show a friendly message
        renderOfflineMessage(result);
      } else {
        const msg = e?.message || "Failed to solve. Please try again.";
        setError(msg);
      }
    }finally{
      setLoading(false);
    }
  }

  function onClear(){
    const q = $("q"); if (q) q.value = "";
    const result = $("result"); if (result) result.innerHTML = "";
  }

  async function onCopy(){
    const result = $("result");
    if (!result) return;
    const text = result.innerText || "";
    if (!text.trim()) return;
    try{
      await navigator.clipboard.writeText(text);
    }catch(_){
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const KE = window.KE;
    // Updated page contract: board/class/subject selectors removed as profile is inferred silently
    if (KE) KE.pageContract(["q","solveBtn","clearBtn","copyBtn","result","apiDot","apiText"]);
    // Removed board/class/subject selectors; profile is loaded silently in getPayload()


    // Premium: Answer mode selector
    ['modeLite','modeTutor','modeMastery'].forEach(id => {
      const b = $(id);
      if (!b) return;
      b.addEventListener('click', () => setModeUI(b.dataset.mode || 'quick'));
    });
    setModeUI('tutor');

    // Load plan + apply gate (non-blocking)
    (async () => {
      await loadPlanAndGate();
      applyGateToUI();
    })();

    $("solveBtn")?.addEventListener("click", onSolve);
    $("clearBtn")?.addEventListener("click", onClear);
    $("copyBtn")?.addEventListener("click", onCopy);

    // Enter to solve
    $("q")?.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onSolve();
    });
  });
})();

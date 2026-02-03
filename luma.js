(() => {
  'use strict';

  // =========================
  // UI language (EN/HI/MR)
  // =========================
  const UI_STRINGS = {
    en: {
      restart: 'Restart',
      back: '← Back',
      next: 'Next →',
      loading: 'Loading…',
      focused_assist: 'Focused Assist',
      type_doubt_placeholder: 'Type your doubt…',
      type_doubt_toast: 'Type your doubt',
      explain_like_im: "Explain like I’m",
      ask: 'Ask',
      clear: 'Clear',
      thinking: 'Thinking…',
      close_when_ready: 'Close when ready',
      tricky_msg: 'This part is tricky for many students. Want me to explain it differently?',
      yes_explain: 'Yes, explain',
      no_ill_try: "No, I’ll try",
      restart_confirm: 'Restart this Luma lesson?',
      promise_title: 'Before we start',
      promise_text: 'I won’t rush you. I won’t give up on you. We’ll get this.',
      promise_ok: "Let’s learn",
    },
    hi: {
      restart: 'रीस्टार्ट',
      back: '← वापस',
      next: 'आगे →',
      loading: 'लोड हो रहा है…',
      focused_assist: 'फोकस्ड असिस्ट',
      type_doubt_placeholder: 'अपना सवाल लिखें…',
      type_doubt_toast: 'कृपया सवाल लिखें',
      explain_like_im: 'समझाइए जैसे मैं',
      ask: 'पूछें',
      clear: 'क्लियर',
      thinking: 'सोच रहा हूँ…',
      close_when_ready: 'तैयार हों तो बंद करें',
      tricky_msg: 'यह हिस्सा कई छात्रों के लिए कठिन होता है। क्या मैं इसे अलग तरीके से समझाऊँ?',
      yes_explain: 'हाँ, समझाइए',
      no_ill_try: 'नहीं, मैं कोशिश करूँगा/करूँगी',
      restart_confirm: 'क्या आप इस लूमा लेसन को रीस्टार्ट करना चाहते हैं?',
      promise_title: 'शुरू करने से पहले',
      promise_text: 'मैं आपको जल्दी नहीं करूँगी। मैं हार नहीं मानूँगी। हम समझ लेंगे।',
      promise_ok: 'चलिए सीखते हैं',
    },
    mr: {
      restart: 'पुन्हा सुरू',
      back: '← मागे',
      next: 'पुढे →',
      loading: 'लोड होत आहे…',
      focused_assist: 'फोकस्ड असिस्ट',
      type_doubt_placeholder: 'तुमचा प्रश्न लिहा…',
      type_doubt_toast: 'कृपया प्रश्न लिहा',
      explain_like_im: 'समजावून सांगा जणू मी',
      ask: 'विचारा',
      clear: 'क्लियर',
      thinking: 'विचार करत आहे…',
      close_when_ready: 'तयार झाल्यावर बंद करा',
      tricky_msg: 'हा भाग अनेक विद्यार्थ्यांना अवघड वाटतो. मी वेगळ्या पद्धतीने समजावून सांगू का?',
      yes_explain: 'हो, समजवा',
      no_ill_try: 'नाही, मी प्रयत्न करतो/करते',
      restart_confirm: 'हा लूमा लेसन पुन्हा सुरू करायचा?',
      promise_title: 'सुरुवातीला',
      promise_text: 'मी तुम्हाला घाई करणार नाही. मी हार मानणार नाही. आपण समजून घेऊ.',
      promise_ok: 'चला शिकूया',
    }
  };

  function getUiLang(){
    const p = (typeof getParams === 'function') ? getParams() : {};
    const fromUrl = String(p.lang || p.language || '').trim().toLowerCase();
    const saved = String(localStorage.getItem('ke_ui_lang_v1') || '').trim().toLowerCase();
    const nav = (navigator.language || 'en').slice(0,2).toLowerCase();
    const v = (fromUrl || saved || nav || 'en');
    return (v === 'hi' || v === 'mr' || v === 'en') ? v : 'en';
  }
  function t(key){
    const lang = state.uiLang || 'en';
    return (UI_STRINGS[lang] && UI_STRINGS[lang][key]) || UI_STRINGS.en[key] || key;
  }

  const $ = (sel, root=document) => {
    const FALLBACKS = {
  "#chapterTitle": [
    "#txtChapter"
  ],
  "#sectionSubtitle": [
    "#txtSubject"
  ],
  "#uiLangSelect": [
    "#selLang"
  ],
  "#btnPrev": [
    "#btnBack"
  ],
  "#progressText": [
    "#txtProgress"
  ],
  "#sectionPills": [
    "#pillsContainer"
  ],
  "#cardRoot": [
    "#cardContent"
  ],
  "#btnAssistFab": [
    "#fabAssist"
  ],
  "#assistDrawer": [
    "#drawerAssist"
  ],
  "#btnAssistClose": [
    "#btnCloseAssist"
  ],
  "#assistAsk": [
    "#btnAskAssist"
  ],
  "#assistClear": [
    "#btnClearAssist"
  ],
  "#assistInput": [
    "#txtAssistQuestion"
  ],
  "#assistAutoClose": [
    "#assistAutoclose"
  ],
  "#lumaPromise": [
    "#promiseModal"
  ],
  "#assistReply": [
    "#assistReply"
  ],
  "#assistContext": [
    "#assistContext"
  ]
};
    if (sel.startsWith('#') && FALLBACKS[sel]) {
      const alt = FALLBACKS[sel].join(', ');
      const combined = `${sel}, ${alt}`;
      return root.querySelector(combined);
    }
    return root.querySelector(sel);
  };

  const state = {
    doc: null,
    sectionIdx: 0,
    cardIdx: 0,
    progress: { doneSections: {}, answered: {} },
    ui: {},
    uiLang: 'en',
    stuck: { timer: null, shownKey: null, navBounces: 0, lastNav: null, lastActivity: Date.now() }
  };

  function toast(msg, ms=1600){
    const el = $('#toast');
    if(!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, ms);
  }


  const SUPPORTED_TYPES = new Set([
    'explain','visual','gallery','activity','table','graph','analogy','math',
    'common_mistake','fact','quick_check','section_closure','practice'
  ]);

  function isRenderableCard(card){
    if(!card || typeof card !== 'object') return false;
    const t = String(card.type || '').trim();
    if(!SUPPORTED_TYPES.has(t)) return false;
    const p = (card.payload != null ? card.payload : card) || {};
    try{
      if(t === 'visual'){
        return !!(p.image || p.src);
      }
      if(t === 'gallery'){
        const items = p.items || [];
        return Array.isArray(items) && items.length > 0 && !!(items[0].image || items[0].src);
      }
      if(t === 'graph'){
        const data = p.data || [];
        return Array.isArray(data) && data.length > 0;
      }
      if(t === 'math'){
        return !!(p.expression || p.expr || (Array.isArray(p.steps) && p.steps.length));
      }
      if(t === 'quick_check'){
        return !!p.question && Array.isArray(p.options) && p.options.length >= 2;
      }
      if(t === 'practice'){
        const qs = p.questions || p.items || [];
        return Array.isArray(qs) && qs.length > 0;
      }
      // lenient for other types
      return true;
    }catch(_e){
      return false;
    }
  }

  function findNearestValidPosition(){
    // Returns {sectionIdx, cardIdx} or null if none.
    const secs = (state.doc && state.doc.sections) ? state.doc.sections : [];
    for(let si = 0; si < secs.length; si++){
      const sec = secs[si];
      const cards = (sec && Array.isArray(sec.cards)) ? sec.cards : [];
      for(let ci = 0; ci < cards.length; ci++){
        if(isRenderableCard(cards[ci])) return { sectionIdx: si, cardIdx: ci };
      }
    }
    return null;
  }

  function ensureValidCurrentCard(){
    const sec = currentSection();
    const cards = sec.cards || [];
    const startSi = state.sectionIdx, startCi = state.cardIdx;

    // try forward within section
    for(let ci = startCi; ci < cards.length; ci++){
      if(isRenderableCard(cards[ci])) { state.cardIdx = ci; return true; }
      console.error('[Luma] Skipping invalid card', { sectionIdx: startSi, cardIdx: ci, card: cards[ci] });
    }
    // try next sections
    for(let si = startSi + 1; si < state.doc.sections.length; si++){
      const s = state.doc.sections[si];
      const cs = s.cards || [];
      for(let ci = 0; ci < cs.length; ci++){
        if(isRenderableCard(cs[ci])) { state.sectionIdx = si; state.cardIdx = ci; return true; }
        console.error('[Luma] Skipping invalid card', { sectionIdx: si, cardIdx: ci, card: cs[ci] });
      }
    }
    // try previous sections (rare deep link)
    for(let si = startSi - 1; si >= 0; si--){
      const s = state.doc.sections[si];
      const cs = s.cards || [];
      for(let ci = cs.length - 1; ci >= 0; ci--){
        if(isRenderableCard(cs[ci])) { state.sectionIdx = si; state.cardIdx = ci; return true; }
      }
    }
    return false;
  }
  function esc(s){
    return String(s ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  // Extract plain-text context from a Luma card safely (used for Assist payload context)
  function safeTextFromCard(card){
    if(!card) return '';
    if(typeof card === 'string') return card;

    const parts = [];
    const pick = (k) => {
      const v = card[k];
      if(v == null) return;
      if(Array.isArray(v)) parts.push(v.join(' '));
      else parts.push(String(v));
    };

    // Common fields across card types
    ['title','heading','subheading','prompt','question','text','content','body','explanation','hint','answer'].forEach(pick);

    // Nested / structured content (best-effort)
    if(card.points && Array.isArray(card.points)) parts.push(card.points.join(' '));
    if(card.bullets && Array.isArray(card.bullets)) parts.push(card.bullets.join(' '));
    if(card.rows && Array.isArray(card.rows)) {
      try { parts.push(card.rows.map(r => Array.isArray(r) ? r.join(' ') : String(r)).join(' ')); } catch(_) {}
    }

    let s = parts.filter(Boolean).join(' ');
    // Strip HTML tags
    s = s.replace(/<[^>]*>/g, ' ');
    // Normalize whitespace
    s = s.replace(/\s+/g, ' ').trim();
    // Limit size so we don't spam the backend
    if(s.length > 600) s = s.slice(0, 600) + '…';
    return s;
  }

  function getParams(){
    const u = new URL(window.location.href);
    return {
      cls: u.searchParams.get('cls') || '',
      board: u.searchParams.get('board') || '',
      subject: u.searchParams.get('subject') || '',
      chapter: u.searchParams.get('chapter') || '',
      title: u.searchParams.get('title') || ''
    };
  }

  function buildJsonUrl(){
    const p = getParams();
    const contentId = (p.content_id || "").trim();
    if (contentId) {
        // Deep-link directly to a published Luma asset stored in DB
        return `${API_BASE}/api/study/asset/get?content_id=${encodeURIComponent(contentId)}`;
    }
    const cls = String(p.cls || '').trim();
    const board = String(p.board || '').trim();
    const subject = String(p.subject || '').trim();
    const chapter = String(p.chapter || '').trim();

    // locked content structure: content/class_X/board/subject/chapter_slug/luma.json
    const url = `content/class_${encodeURIComponent(cls)}/${encodeURIComponent(board)}/${encodeURIComponent(subject)}/${encodeURIComponent(chapter)}/luma.json`;
return url;
  }


  // Resolve media URLs relative to the currently loaded chapter folder (luma.json location)
  function resolveMediaSrc(src){
    const s = String(src || '').trim();
    if(!s) return '';
    // allow absolute URLs and data URIs
    if(/^https?:\/\//i.test(s) || /^data:/i.test(s)) return s;
    // site-root absolute
    if(s.startsWith('/')) return s;
    // already full content path
    if(s.startsWith('content/')) return s;
    const base = state.basePath || '';
    // if author already used luma_assets/ prefix, keep it relative to chapter base
    if(s.startsWith('luma_assets/')) return base + s;
    // default: assume file lives inside luma_assets/
    return base + 'luma_assets/' + s;
  }
  async function loadJson(){
    const url = buildJsonUrl();
    state.jsonUrl = url;
    state.basePath = url.replace(/\/luma\.json(\?.*)?$/, '/');
    try{
      const res = await fetch(url, { cache: 'no-store' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const doc = await res.json();
      validate(doc);
      state.doc = doc;
      init();
    } catch(err){
      console.warn('Luma load failed', err);
      showComingSoon(url);
    }
  }

  function validate(doc){
    if(!doc || typeof doc !== 'object') throw new Error('Invalid JSON');
    if(!Array.isArray(doc.sections)) throw new Error('Missing sections[]');
    // normalize: ensure sec.cards exists
    doc.sections.forEach((s) => {
      if(!Array.isArray(s.cards)) s.cards = [];
      s.cards.forEach((c) => { if(!c.type) c.type = 'explain'; });
    });
  }

  function init(){
    state.uiLang = getUiLang();
    const p = getParams();
    const title = (state.doc?.meta?.chapterTitle) || p.title || 'Learn with Luma';
    $('#chapterTitle').textContent = title;

    applyUiStrings();
    updateSubtitle();
    bindHeader();
    renderPills();
    renderCard();
    showPromiseIfNeeded();
    bindNav();
    bindAssist();
    bindActivitySignals();
  }

  function applyUiStrings(){
    // Header
    const restart = $('#btnRestart');
    if(restart) restart.textContent = t('restart');
    const prev = $('#btnPrev');
    if(prev) prev.textContent = t('back');
    const next = $('#btnNext');
    if(next) next.textContent = t('next');

    // Promise
    const pt = document.querySelector('.luma-promise-title');
    if(pt) pt.textContent = t('promise_title');
    const ptx = document.querySelector('.luma-promise-text');
    if(ptx) ptx.textContent = t('promise_text');
    const pok = $('#btnPromiseOk');
    if(pok) pok.textContent = t('promise_ok');

    // Assist
    const at = document.querySelector('.luma-assist-title');
    if(at) at.textContent = t('focused_assist');
    const pl = $('#assistInput');
    if(pl) pl.setAttribute('placeholder', t('type_doubt_placeholder'));
    const lvl = document.querySelector('.luma-assist-level-h');
    if(lvl) lvl.textContent = t('explain_like_im');
    const ask = $('#assistAsk');
    if(ask) ask.textContent = t('ask');
    const clr = $('#assistClear');
    if(clr) clr.textContent = t('clear');
    const closeHint = $('#assistAutoClose');
    if(closeHint) closeHint.textContent = t('close_when_ready');

    // Loading subtitle (only if still default)
    const sub = $('#sectionSubtitle');
    if(sub && String(sub.textContent||'').trim() === 'Loading…') sub.textContent = t('loading');

    // Language selector value
    const sel = $('#uiLangSelect');
    if(sel) sel.value = state.uiLang;
  }

  function setUiLang(lang){
    const v = (lang === 'hi' || lang === 'mr' || lang === 'en') ? lang : 'en';
    state.uiLang = v;
    try{ localStorage.setItem('ke_ui_lang_v1', v); }catch(_){ }
    // Persist into URL without reload
    try{
      const url = new URL(window.location.href);
      url.searchParams.set('lang', v);
      history.replaceState({}, '', url.toString());
    }catch(_){ }
    applyUiStrings();
    // Also refresh stuck prompt (if visible)
    if(!$('#stuckPrompt')?.hidden){
      hideStuckPrompt();
      scheduleStuckTimer();
    }
  }


  function resetStuck(){
    try{
      if(state.stuck && state.stuck.timer) clearTimeout(state.stuck.timer);
    }catch(_){}
    if(!state.stuck) state.stuck = { timer:null, shownKey:null, navBounces:0, lastNav:null, lastActivity: Date.now() };
    state.stuck.timer = null;
    state.stuck.lastActivity = Date.now();
    // do not reset navBounces here; navigation patterns are informative across a short window
  }

  function bindActivitySignals(){
    // Reset "stuck" timer only on real user activity (calm, non-pushy).
    const onAct = () => {
      try{ state.stuck.lastActivity = Date.now(); }catch(_){ }
      // Don't constantly reschedule if prompt already shown
      if(state.stuck && state.stuck.shownKey === `${state.sectionIdx}:${state.cardIdx}`) return;
      // Avoid rescheduling when Assist is open (student is already engaging)
      const drawer = $('#assistDrawer');
      if(drawer && drawer.getAttribute('aria-hidden') === 'false') return;
      if(state.stuck && state.stuck.timer){
        clearTimeout(state.stuck.timer);
        state.stuck.timer = null;
      }
      // soft reschedule
      state.stuck.timer = setTimeout(() => {
        const nowKey = `${state.sectionIdx}:${state.cardIdx}`;
        const idleFor = Date.now() - (state.stuck.lastActivity || 0);
        const drawerNow = $('#assistDrawer');
        if(drawerNow && drawerNow.getAttribute('aria-hidden') === 'false') return;
        if(idleFor >= 70000 && nowKey === `${state.sectionIdx}:${state.cardIdx}`){
          showStuckPrompt('idle');
        }
      }, 70000);
    };

    ['scroll','click','keydown','touchstart','wheel'].forEach((ev) => {
      window.addEventListener(ev, onAct, true);
    });
  }

  function hideStuckPrompt(){
    const el = $('#stuckPrompt');
    if(el){ el.hidden = true; el.innerHTML = ''; }
  }

  function showStuckPrompt(reason){
    const el = $('#stuckPrompt');
    if(!el) return;
    const key = `${state.sectionIdx}:${state.cardIdx}`;
    if(state.stuck.shownKey === key) return;
    state.stuck.shownKey = key;

    el.hidden = false;
    el.innerHTML = `
      <div class="luma-stuck-msg">${escapeHtml(t('tricky_msg'))}</div>
      <div class="luma-stuck-actions">
        <button class="luma-btn luma-btn-primary" type="button" id="stuckYes">${escapeHtml(t('yes_explain'))}</button>
        <button class="luma-btn luma-btn-ghost" type="button" id="stuckNo">${escapeHtml(t('no_ill_try'))}</button>
      </div>
    `;
    setTimeout(() => {
      const y = $('#stuckYes');
      const n = $('#stuckNo');
      if(y) y.onclick = () => { try{ $('#btnAssistFab').click(); }catch(_e){} };
      if(n) n.onclick = () => hideStuckPrompt();
    }, 0);
  }

  function scheduleStuckTimer(){
    hideStuckPrompt();
    resetStuck();
    const key = `${state.sectionIdx}:${state.cardIdx}`;
    // Timer-based stuck: ~70 seconds of *idle* time on same card
    state.stuck.timer = setTimeout(() => {
      // Only show if still on same card
      const nowKey = `${state.sectionIdx}:${state.cardIdx}`;
      const idleMs = Date.now() - (state.stuck.lastActivity || 0);
      const drawerOpen = !($('#assistDrawer')?.getAttribute('aria-hidden') || 'true').includes('true');
      if(nowKey === key && idleMs >= 68000 && !drawerOpen){
        showStuckPrompt('time');
      }
    }, 70000);
  }

  function updateSubtitle(){
    const sec = state.doc.sections[state.sectionIdx];
    const sub = sec ? sec.title : '—';
    $('#sectionSubtitle').textContent = sub;
  }

  function bindHeader(){
    $('#btnBack').onclick = () => history.back();
    $('#btnRestart').onclick = () => {
      if(confirm(t('restart_confirm'))){
        state.sectionIdx = 0; state.cardIdx = 0;
        state.progress = { doneSections:{}, answered:{} };
        renderPills(); renderCard(); updateSubtitle();
        toast(t('restart'));
      }
    };

    const sel = $('#uiLangSelect');
    if(sel){
      sel.value = state.uiLang;
      sel.onchange = () => {
        const v = String(sel.value || 'en').trim().toLowerCase();
        state.uiLang = (v === 'hi' || v === 'mr' || v === 'en') ? v : 'en';
        try{ localStorage.setItem('ke_ui_lang_v1', state.uiLang); }catch(_){ }
        try{
          const url = new URL(window.location.href);
          url.searchParams.set('lang', state.uiLang);
          history.replaceState({}, '', url.toString());
        }catch(_){ }
        applyUiStrings();
        hideStuckPrompt();
        scheduleStuckTimer();
      };
    }
  }

  function renderPills(){
    const wrap = $('#sectionPills');
    wrap.innerHTML = '';
    state.doc.sections.forEach((sec, idx) => {
      if(!sec || !sec.cards || sec.cards.length === 0) return; // skip empty sections (edge-case rule)
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'luma-pill';
      b.textContent = sec.title || `Section ${idx+1}`;
      b.setAttribute('aria-current', idx === state.sectionIdx ? 'true' : 'false');
      if(state.progress.doneSections[sec.id || idx]) b.dataset.done = '1';
      b.onclick = () => { state.sectionIdx = idx; state.cardIdx = 0; updateSubtitle(); renderPills(); renderCard(); };
      wrap.appendChild(b);
    });
  }

  function currentSection(){
    return state.doc.sections[state.sectionIdx] || { cards: [] };
  }

  function clampToValid(){
    // if current section is empty (after skipping), find next non-empty
    const secs = state.doc.sections;
    let si = state.sectionIdx;
    for(let k=0;k<secs.length;k++){
      const s = secs[si];
      if(s && Array.isArray(s.cards) && s.cards.length) { state.sectionIdx = si; state.cardIdx = Math.min(state.cardIdx, s.cards.length-1); return; }
      si = (si + 1) % secs.length;
    }
  }

  function renderCard(){
    clampToValid();
    // Skip invalid cards safely (never white-screen)
    const ok = ensureValidCurrentCard();
    const sec = currentSection();
    const cards = sec.cards || [];
    const card = cards[state.cardIdx];

    const root = $('#cardRoot');
    root.innerHTML = '';

    if(!ok || !card){
      const pos = findNearestValidPosition();
      if(pos){
        state.sectionIdx = pos.sectionIdx;
        state.cardIdx = pos.cardIdx;
        updateSubtitle();
        renderPills();
        return renderCard();
      }
      root.innerHTML = `<h2>Coming soon</h2><p class="luma-muted">This lesson is being prepared. Please try again later.</p>`;
      $('#progressText').textContent = '—';
      $('#btnNext').disabled = true;
      $('#btnPrev').disabled = (state.sectionIdx===0 && state.cardIdx===0);
      return;
    }
    if(card.title){
      const h2 = document.createElement('h2');
      h2.textContent = card.title;
      root.appendChild(h2);
    }

    const body = renderByType(card);
    root.appendChild(body);

    $('#progressText').textContent = `${state.cardIdx + 1} / ${cards.length}`;

    // prev button state
    $('#btnPrev').disabled = (state.sectionIdx===0 && state.cardIdx===0);

    // Next disabled rule for quick_check until answered
    const isQuick = String(card.type) === 'quick_check';
    if(isQuick){
      const key = `${state.sectionIdx}:${state.cardIdx}`;
      $('#btnNext').disabled = !state.progress.answered[key];
    }else{
      $('#btnNext').disabled = false;
    }

    // Stuck signal timer
    scheduleStuckTimer();

    updateSubtitle();
  }

  function renderByType(card){
    const t = String(card.type || 'explain');
    const wrap = document.createElement('div');

    // Kimi spec formats can be either {content} or {payload}; support both.
    const payload = card.payload || card;

    if(t === 'explain'){
      // content: markdown-ish OR payload.paras
      const content = payload.content;
      const paras = Array.isArray(payload.paras) ? payload.paras : null;

      if(paras && paras.length){
        paras.forEach(p => {
          const el = document.createElement('p');
          el.innerHTML = toMiniMarkdown(p);
          wrap.appendChild(el);
        });
      } else if(content){
        const parts = String(content).split(/\n\n+/).map(s=>s.trim()).filter(Boolean);
        parts.forEach(p => {
          const el = document.createElement('p');
          el.innerHTML = toMiniMarkdown(p);
          wrap.appendChild(el);
        });
      } else {
        wrap.innerHTML = `<p class="luma-muted">[Missing content]</p>`;
      }

      if(Array.isArray(payload.highlight) && payload.highlight.length){
        const kv = document.createElement('div');
        kv.className = 'luma-kv';
        payload.highlight.slice(0,8).forEach(h => {
          const chip = document.createElement('div');
          chip.className = 'luma-chip';
          chip.textContent = String(h);
          kv.appendChild(chip);
        });
        wrap.appendChild(kv);
      }
      return wrap;
    }

    if(t === 'visual'){
      const src = payload.image || payload.src;
      const caption = payload.caption || '';
      if(!src){
        wrap.innerHTML = `<p class="luma-muted">[Image missing]</p>`;
        return wrap;
      }
      const img = document.createElement('img');
      img.className = 'luma-img';
      img.loading = 'lazy';
      img.alt = payload.alt || caption || card.title || 'Image';
      img.src = resolveMediaSrc(src);
      img.onerror = () => {
        img.replaceWith(makePlaceholder(`Image not found: ${src}`));
      };
      wrap.appendChild(img);
      if(caption){
        const p = document.createElement('p');
        p.className = 'luma-muted';
        p.textContent = caption;
        wrap.appendChild(p);
      }
      return wrap;
    }

    if(t === 'gallery'){
      const items = Array.isArray(payload.items) ? payload.items : [];
      if(items.length <= 1){
        // edge-case: treat as visual
        const it = items[0] || {};
        return renderByType({ type:'visual', payload: { image: it.image, caption: it.caption, alt: it.alt } });
      }
      // progressive reveal: show 1 item per cardIdx within the card
      let gi = payload._galleryIndex || 0;
      gi = Math.max(0, Math.min(gi, items.length-1));
      const it = items[gi];

      const img = document.createElement('img');
      img.className = 'luma-img';
      img.loading = 'lazy';
      img.alt = it.alt || it.caption || 'Gallery image';
      img.src = resolveMediaSrc(it.image);
      img.onerror = () => img.replaceWith(makePlaceholder(`Image not found: ${it.image}`));
      wrap.appendChild(img);

      const cap = document.createElement('p');
      cap.className = 'luma-muted';
      cap.textContent = it.caption || `Image ${gi+1}`;
      wrap.appendChild(cap);

      const nav = document.createElement('div');
      nav.className = 'luma-nav';
      nav.style.marginTop = '10px';

      const prev = document.createElement('button');
      prev.className = 'luma-btn luma-btn-ghost';
      prev.textContent = '←';
      prev.disabled = gi===0;

      const meta = document.createElement('div');
      meta.className = 'luma-progress';
      meta.textContent = `${gi+1} / ${items.length}`;
      meta.style.marginLeft = 'auto';

      const next = document.createElement('button');
      next.className = 'luma-btn luma-btn-primary';
      next.textContent = '→';
      next.disabled = gi===items.length-1;

      prev.onclick = () => { payload._galleryIndex = gi-1; renderCard(); };
      next.onclick = () => { payload._galleryIndex = gi+1; renderCard(); };

      nav.appendChild(prev);
      nav.appendChild(meta);
      nav.appendChild(next);
      wrap.appendChild(nav);

      return wrap;
    }

    if(t === 'activity'){
      const ins = payload.instructions || '';
      const steps = Array.isArray(payload.steps) ? payload.steps : [];
      const materials = Array.isArray(payload.materials) ? payload.materials : [];
      if(ins) wrap.appendChild(pEl(ins, true));
      if(materials.length){
        wrap.appendChild(hr());
        wrap.appendChild(pEl('Materials', false, true));
        const ul = document.createElement('ul');
        materials.slice(0,12).forEach(m => { const li=document.createElement('li'); li.textContent=String(m); ul.appendChild(li); });
        wrap.appendChild(ul);
      }
      if(steps.length){
        wrap.appendChild(hr());
        wrap.appendChild(pEl('Steps', false, true));
        const ol = document.createElement('ol');
        steps.slice(0,20).forEach(s => { const li=document.createElement('li'); li.innerHTML=toMiniMarkdown(s); ol.appendChild(li); });
        wrap.appendChild(ol);
      }
      return wrap;
    }

    if(t === 'table'){
      const headers = payload.headers || payload.header || [];
      const rows = payload.rows || [];
      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.marginTop = '10px';
      table.style.background = 'rgba(255,255,255,0.55)';
      table.style.border = '1px solid rgba(12,24,48,0.08)';
      table.style.borderRadius = '14px';
      table.style.overflow = 'hidden';

      if(Array.isArray(headers) && headers.length){
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        headers.slice(0,8).forEach(h => {
          const th = document.createElement('th');
          th.textContent = String(h);
          th.style.textAlign='left';
          th.style.padding='10px';
          th.style.fontWeight='900';
          th.style.fontSize='13px';
          th.style.borderBottom='1px solid rgba(12,24,48,0.10)';
          tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);
      }

      const tbody = document.createElement('tbody');
      (Array.isArray(rows) ? rows : []).slice(0,30).forEach((r,i) => {
        const tr = document.createElement('tr');
        (Array.isArray(r)? r : []).slice(0,8).forEach(c => {
          const td=document.createElement('td');
          td.textContent=String(c);
          td.style.padding='10px';
          td.style.borderBottom='1px solid rgba(12,24,48,0.08)';
          td.style.fontWeight='750';
          td.style.color='#111827';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);

      if(payload.caption){
        const cap = document.createElement('p');
        cap.className = 'luma-muted';
        cap.textContent = payload.caption;
        wrap.appendChild(cap);
      }
      return wrap;
    }

    if(t === 'graph'){
      // simple SVG graphs; static; no 3D; no animation
      const gType = payload.graph_type || payload.type || 'bar';
      const data = Array.isArray(payload.data) ? payload.data : [];
      wrap.appendChild(renderGraph(gType, data, payload.title));
      return wrap;
    }

    if(t === 'analogy'){
      wrap.appendChild(pEl(payload.concept ? `Concept: ${payload.concept}` : ''));
      if(payload.analogy) wrap.appendChild(pEl(payload.analogy, true));
      if(Array.isArray(payload.mapping) && payload.mapping.length){
        wrap.appendChild(hr());
        const table = document.createElement('table');
        table.style.width='100%';
        table.style.borderCollapse='collapse';
        const thead = document.createElement('thead');
        thead.innerHTML = `<tr><th style="text-align:left;padding:10px;border-bottom:1px solid rgba(12,24,48,0.10)">Concept</th><th style="text-align:left;padding:10px;border-bottom:1px solid rgba(12,24,48,0.10)">Analogy</th></tr>`;
        table.appendChild(thead);
        const tbody=document.createElement('tbody');
        payload.mapping.slice(0,12).forEach(m => {
          const tr=document.createElement('tr');
          tr.innerHTML = `<td style="padding:10px;border-bottom:1px solid rgba(12,24,48,0.08);font-weight:800">${esc(m.concept_part||'')}</td>
                          <td style="padding:10px;border-bottom:1px solid rgba(12,24,48,0.08)">${esc(m.analogy_part||'')}</td>`;
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
      }
      return wrap;
    }

    if(t === 'math'){
      // Calm, step-by-step whiteboard (KaTeX if available; safe fallback if not)
      const expr = payload.expression || payload.expr || '';
      const steps = Array.isArray(payload.steps) ? payload.steps : [];
      const expl = payload.explanation || '';

      const box = document.createElement('div');
      box.className = 'luma-panel luma-mathbox';

      const renderLatexLine = (latex, cls='') => {
        const clean = String(latex || '').replace(/\$/g,'').trim();
        const line = document.createElement('div');
        line.className = cls || 'luma-mathline';
        if(window.katex){
          try{
            window.katex.render(clean, line, { throwOnError:false });
          }catch{
            line.textContent = clean;
            line.classList.add('luma-math-fallback');
          }
        }else{
          line.textContent = clean;
          line.classList.add('luma-math-fallback');
        }
        return line;
      };

      if(expr){
        box.appendChild(renderLatexLine(expr, 'luma-mathline luma-math-main'));
      }

      if(steps.length){
        const stepsWrap = document.createElement('div');
        stepsWrap.className = 'luma-math-steps';
        steps.slice(0,18).forEach((s) => {
          const stepLine = renderLatexLine(s, 'luma-mathline luma-math-step');
          stepsWrap.appendChild(stepLine);
        });
        box.appendChild(stepsWrap);
      }

      wrap.appendChild(box);

      if(expl){
        const note = document.createElement('div');
        note.className = 'luma-note';
        note.appendChild(pEl(expl, true));
        wrap.appendChild(note);
      }
      return wrap;
    }

    if(t === 'common_mistake'){
      const m = payload.mistake || '';
      const c = payload.correction || '';
      const w = payload.why_wrong || '';
      const ew = payload.example_wrong || '';
      const er = payload.example_right || '';

      const box = document.createElement('div');
      box.className = 'luma-callout luma-callout-warn';
      box.innerHTML = `
        <div class="luma-callout-title">Easy to mix up</div>
        <div class="luma-callout-row"><b>Mistake:</b> ${esc(m)}</div>
        <div class="luma-callout-row"><b>Correct:</b> ${esc(c)}</div>
        ${w ? `<div class="luma-callout-row luma-muted"><b>Why:</b> ${esc(w)}</div>` : ''}
      `;

      if(ew || er){
        const ex = document.createElement('div');
        ex.className = 'luma-examples';
        ex.innerHTML = `
          ${ew ? `<div class="luma-panel luma-ex-bad"><div class="luma-ex-h">Wrong</div><div class="luma-ex-b">${esc(ew)}</div></div>` : ''}
          ${er ? `<div class="luma-panel luma-ex-good"><div class="luma-ex-h">Right</div><div class="luma-ex-b">${esc(er)}</div></div>` : ''}
        `;
        box.appendChild(ex);
      }

      wrap.appendChild(box);
      return wrap;
    }

    if(t === 'fact'){
      wrap.innerHTML = `
        <div style="padding:14px;border-radius:18px;border:1px solid rgba(79,141,255,0.22);background:rgba(79,141,255,0.06);">
          <div style="font-weight:950;">Did you know?</div>
          <div style="margin-top:8px;font-weight:800;">${esc(payload.fact || '')}</div>
          ${payload.context ? `<div style="margin-top:8px;color:#6b7280;font-weight:800;">${esc(payload.context)}</div>` : ''}
        </div>
      `;
      return wrap;
    }

    if(t === 'quick_check'){
      const q = payload.question || '';
      const opts = Array.isArray(payload.options) ? payload.options : [];
      const correct = Number.isFinite(payload.correct) ? payload.correct : payload.answerIndex;

      wrap.appendChild(pEl(q, false, true));

      const box = document.createElement('div');
      box.style.marginTop = '12px';
      opts.slice(0,8).forEach((op, i) => {
        const b = document.createElement('button');
        b.type='button';
        b.className = 'luma-btn luma-btn-ghost';
        b.style.display='block';
        b.style.width='100%';
        b.style.textAlign='left';
        b.style.margin='10px 0';
        b.textContent = String(op);
        b.onclick = () => {
          const key = `${state.sectionIdx}:${state.cardIdx}`;
          state.progress.answered[key] = true;
          // mark UI
          [...box.querySelectorAll('button')].forEach(x => x.disabled = true);
          if(i === correct){
            b.style.background = 'rgba(22,163,74,0.14)';
            b.style.borderColor = 'rgba(22,163,74,0.35)';
            toast('✅ Correct');
          }else{
            b.style.background = 'rgba(239,68,68,0.10)';
            b.style.borderColor = 'rgba(239,68,68,0.30)';
            toast('❌ Not quite');
            // highlight correct if known
            const btns=[...box.querySelectorAll('button')];
            if(Number.isFinite(correct) && btns[correct]){
              btns[correct].style.background='rgba(22,163,74,0.14)';
              btns[correct].style.borderColor='rgba(22,163,74,0.35)';
            }
          }

          if(payload.explanation){
            const ex = document.createElement('p');
            ex.className = 'luma-muted';
            ex.innerHTML = toMiniMarkdown(payload.explanation);
            wrap.appendChild(ex);
          }
          // enable next
          $('#btnNext').disabled = false;
        };
        box.appendChild(b);
      });
      wrap.appendChild(box);

      if(payload.hint){
        const h = document.createElement('p');
        h.className = 'luma-muted';
        h.textContent = `Hint: ${payload.hint}`;
        wrap.appendChild(h);
      }

      return wrap;
    }

    if(t === 'section_closure'){
      const box = document.createElement('div');
      box.className = 'luma-panel luma-closure';

      if(payload.summary){
        const s = document.createElement('div');
        s.className = 'luma-closure-summary';
        s.appendChild(pEl(payload.summary, true));
        box.appendChild(s);
      }

      const takeaways = Array.isArray(payload.key_takeaways) ? payload.key_takeaways : [];
      if(takeaways.length){
        const h = document.createElement('div');
        h.className = 'luma-closure-h';
        h.textContent = 'Key takeaways';
        box.appendChild(h);

        const ul = document.createElement('ul');
        ul.className = 'luma-closure-list';
        takeaways.slice(0,12).forEach((k) => {
          const li = document.createElement('li');
          li.innerHTML = `<span class="luma-ck">✓</span><span class="luma-ck-txt">${toMiniMarkdown(k)}</span>`;
          ul.appendChild(li);
        });
        box.appendChild(ul);
      }

      if(payload.next_section_preview){
        const n = document.createElement('div');
        n.className = 'luma-closure-next luma-muted';
        n.textContent = `Next: ${payload.next_section_preview}`;
        box.appendChild(n);
      }

      wrap.appendChild(box);
      return wrap;
    }

    if(t === 'practice'){
      const qs = payload.questions || payload.items || [];
      if(!Array.isArray(qs) || !qs.length){
        wrap.innerHTML = `<p class="luma-muted">No practice questions.</p>`;
        return wrap;
      }
      qs.slice(0,12).forEach((it, i) => {
        const block = document.createElement('div');
        block.style.marginTop='12px';
        block.style.padding='12px';
        block.style.borderRadius='18px';
        block.style.border='1px solid rgba(12,24,48,0.10)';
        block.style.background='rgba(255,255,255,0.65)';

        const q = document.createElement('div');
        q.style.fontWeight='900';
        q.innerHTML = `${i+1}. ${toMiniMarkdown(it.question || it.q || '')}`;
        block.appendChild(q);

        if(it.hint){
          const h = document.createElement('div');
          h.className='luma-muted';
          h.style.marginTop='6px';
          h.textContent = `Hint: ${it.hint}`;
          block.appendChild(h);
        }

        const btn = document.createElement('button');
        btn.type='button';
        btn.className='luma-btn luma-btn-ghost';
        btn.style.marginTop='10px';
        btn.textContent='Show answer';

        const ans = document.createElement('div');
        ans.style.marginTop='10px';
        ans.style.display='none';
        ans.style.fontWeight='850';
        ans.innerHTML = `Answer: ${toMiniMarkdown(it.answer || '')}`;

        btn.onclick = () => {
          const on = ans.style.display === 'none';
          ans.style.display = on ? 'block' : 'none';
          btn.textContent = on ? 'Hide answer' : 'Show answer';
        };

        block.appendChild(btn);
        block.appendChild(ans);
        wrap.appendChild(block);
      });
      return wrap;
    }

    wrap.innerHTML = `<p class="luma-muted">Unknown card type: ${esc(t)}</p>`;
    return wrap;
  }

  function bindNav(){
    $('#btnPrev').onclick = () => {
      const sec = currentSection();
      if(state.cardIdx > 0){
        state.cardIdx--;
      } else if(state.sectionIdx > 0){
        state.sectionIdx--;
        const prevSec = currentSection();
        state.cardIdx = Math.max(0, (prevSec.cards||[]).length - 1);
      }
      renderPills(); renderCard();
    };

    $('#btnNext').onclick = () => {
      const sec = currentSection();
      const cards = sec.cards || [];
      if(state.cardIdx < cards.length - 1){
        state.cardIdx++;
        renderCard();
        renderPills();
        return;
      }

      // section complete
      state.progress.doneSections[sec.id || state.sectionIdx] = true;

      // move to next non-empty section
      let si = state.sectionIdx + 1;
      while(si < state.doc.sections.length){
        const ns = state.doc.sections[si];
        if(ns && Array.isArray(ns.cards) && ns.cards.length){
          state.sectionIdx = si;
          state.cardIdx = 0;
          renderPills(); renderCard();
          toast('Section complete ✨');
          return;
        }
        si++;
      }

      // chapter complete
      showComplete();
    };
  }

  function showComplete(){
    hideStuckPrompt();
    resetStuck();
    const root = $('#cardRoot');

    root.innerHTML = `
      <h2>Chapter complete ✨</h2>
      <p class="luma-muted">Take a moment — do you feel confident?</p>

      <div class="luma-hr"></div>

      <div class="luma-panel" style="padding:14px; border-radius:18px;">
        <div style="font-weight:950; margin-bottom:10px;">After this lesson, I can…</div>
        <label style="display:flex; gap:10px; align-items:flex-start; margin:8px 0; font-weight:850;">
          <input type="checkbox" id="cc1"> <span>Explain the core idea in my own words</span>
        </label>
        <label style="display:flex; gap:10px; align-items:flex-start; margin:8px 0; font-weight:850;">
          <input type="checkbox" id="cc2"> <span>Solve a basic exam-level question on this topic</span>
        </label>
        <label style="display:flex; gap:10px; align-items:flex-start; margin:8px 0; font-weight:850;">
          <input type="checkbox" id="cc3"> <span>Avoid common mistakes</span>
        </label>
        <div id="ccHint" class="luma-muted" style="margin-top:10px;"></div>
      </div>

      <div class="luma-hr"></div>

      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        <button class="luma-btn luma-btn-primary" type="button" id="doneBack">Back to course</button>
        <button class="luma-btn luma-btn-ghost" type="button" id="doneAssist">Ask Luma about anything</button>
        <button class="luma-btn luma-btn-ghost" type="button" id="doneRestart">Restart</button>
      </div>
    `;
    $('#btnNext').disabled = true;
    $('#btnPrev').disabled = false;
    $('#progressText').textContent = 'Done';

    setTimeout(() => {
      const a = $('#doneBack'); if(a) a.onclick = () => history.back();
      const b = $('#doneRestart'); if(b) b.onclick = () => $('#btnRestart').click();
      const c = $('#doneAssist'); if(c) c.onclick = () => { try{ $('#btnAssistFab').click(); }catch(_e){} };

      const hint = $('#ccHint');
      const updateHint = () => {
        const v1 = !!($('#cc1') && $('#cc1').checked);
        const v2 = !!($('#cc2') && $('#cc2').checked);
        const v3 = !!($('#cc3') && $('#cc3').checked);
        const ok = v1 && v2 && v3;
        if(!hint) return;
        if(ok){
          hint.textContent = 'Nice. You’re ready — try PYQs or the quiz next.';
        }else{
          hint.textContent = 'If you’re not fully confident, tap “Ask Luma” and tell me what felt confusing.';
        }
      };
      ['cc1','cc2','cc3'].forEach(id => { const el = $('#'+id); if(el) el.onchange = updateHint; });
      updateHint();
    }, 0);
  }

  function showComingSoon(expectedUrl){
    const p = getParams();
    $('#chapterTitle').textContent = p.title || 'Learn with Luma';
    $('#sectionSubtitle').textContent = 'Coming soon';

    $('#cardRoot').innerHTML = `
      <div style="text-align:center; padding: 18px 6px;">
        <div style="font-size:34px;">✨</div>
        <h2 style="margin-top:10px;">Coming soon</h2>
        <p class="luma-muted">This Luma lesson is not available yet for this chapter.</p>
        <div class="luma-hr"></div>
        <p class="luma-muted" style="font-size:12px; word-break: break-all;">
          Expected: <span style="font-family: ui-monospace,monospace;">${esc(expectedUrl)}</span>
        </p>
        <div style="margin-top:14px;">
          <button class="luma-btn luma-btn-primary" type="button" id="btnBack2">Back</button>
        </div>
      </div>
    `;

    $('#sectionPills').innerHTML = '';
    $('#btnPrev').disabled = true;
    $('#btnNext').disabled = true;
    $('#progressText').textContent = '—';

    setTimeout(() => {
      const b = $('#btnBack2'); if(b) b.onclick = () => history.back();
    }, 0);

    // still bind header so it stays clickable
    bindHeader();
    bindAssist();
  }

  function toMiniMarkdown(s){
    let x = esc(s);
    // **bold**
    x = x.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // *italic*
    x = x.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // `code`
    x = x.replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.7);padding:2px 6px;border-radius:8px;border:1px solid rgba(12,24,48,0.10)">$1</code>');
    // line breaks
    x = x.replace(/\n/g, '<br/>');
    return x;
  }

  function pEl(text, md=false, strong=false){
    const p = document.createElement('p');
    if(strong) p.style.fontWeight = '900';
    p.innerHTML = md ? toMiniMarkdown(text) : esc(text);
    return p;
  }
  function hr(){
    const d=document.createElement('div');
    d.className='luma-hr';
    return d;
  }
  function makePlaceholder(msg){
    const d=document.createElement('div');
    d.style.padding='14px';
    d.style.borderRadius='18px';
    d.style.border='1px dashed rgba(12,24,48,0.20)';
    d.style.background='rgba(255,255,255,0.60)';
    d.style.color='#6b7280';
    d.style.fontWeight='800';
    d.textContent=msg;
    return d;
  }

  function renderGraph(type, data, title){
    const box = document.createElement('div');
    box.style.marginTop='10px';
    box.style.padding='12px';
    box.style.borderRadius='18px';
    box.style.border='1px solid rgba(12,24,48,0.10)';
    box.style.background='rgba(255,255,255,0.65)';

    if(title){
      const t = document.createElement('div');
      t.style.fontWeight='950';
      t.style.marginBottom='8px';
      t.textContent = title;
      box.appendChild(t);
    }

    const w = 520, h = 220, pad = 28;
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label', 'Graph');
    svg.style.width='100%';
    svg.style.height='auto';

    const clean = (Array.isArray(data)? data: []).slice(0,12).map(d => ({
      label: String(d.label ?? ''),
      value: Number(d.value ?? 0)
    }));

    const max = Math.max(1, ...clean.map(d=>d.value));
    const n = clean.length || 1;

    // axes
    const ax = document.createElementNS(svg.namespaceURI,'line');
    ax.setAttribute('x1', pad); ax.setAttribute('y1', h-pad);
    ax.setAttribute('x2', w-pad); ax.setAttribute('y2', h-pad);
    ax.setAttribute('stroke','rgba(12,24,48,0.25)'); ax.setAttribute('stroke-width','2');
    svg.appendChild(ax);

    if(String(type).toLowerCase() === 'line'){
      let dpath = '';
      clean.forEach((d,i)=>{
        const x = pad + (i*( (w-2*pad)/(Math.max(1,n-1)) ));
        const y = (h-pad) - ( (d.value/max) * (h-2*pad) );
        dpath += (i===0 ? 'M':'L') + x + ' ' + y + ' ';
      });
      const path = document.createElementNS(svg.namespaceURI,'path');
      path.setAttribute('d', dpath.trim());
      path.setAttribute('fill','none');
      path.setAttribute('stroke','rgba(79,141,255,0.9)');
      path.setAttribute('stroke-width','4');
      path.setAttribute('stroke-linecap','round');
      svg.appendChild(path);

      clean.forEach((d,i)=>{
        const x = pad + (i*( (w-2*pad)/(Math.max(1,n-1)) ));
        const y = (h-pad) - ( (d.value/max) * (h-2*pad) );
        const c = document.createElementNS(svg.namespaceURI,'circle');
        c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 5);
        c.setAttribute('fill','rgba(79,141,255,1)');
        svg.appendChild(c);
      });
    } else {
      // bar default
      const bw = (w-2*pad) / n;
      clean.forEach((d,i)=>{
        const x = pad + i*bw + 8;
        const bh = (d.value/max) * (h-2*pad);
        const y = (h-pad) - bh;
        const r = document.createElementNS(svg.namespaceURI,'rect');
        r.setAttribute('x', x);
        r.setAttribute('y', y);
        r.setAttribute('width', Math.max(10, bw-16));
        r.setAttribute('height', Math.max(2, bh));
        r.setAttribute('rx', 10);
        r.setAttribute('fill','rgba(79,141,255,0.8)');
        svg.appendChild(r);
      });
    }

    box.appendChild(svg);

    // labels (simple)
    if(clean.length){
      const lab = document.createElement('div');
      lab.className='luma-muted';
      lab.style.marginTop='8px';
      lab.textContent = clean.map(d=>d.label).join(' • ');
      box.appendChild(lab);
    }

    return box;
  }


  function getAssistLevel(){
    try{
      const sel = document.querySelector('input[name="assist_level"]:checked');
      return sel ? String(sel.value) : '15';
    }catch(_e){
      return '15';
    }
  }

  // Focused Assist: uses existing backend /solve via KE.postSolve if present; else offline hint.
  function bindAssist(){
    const fab = $('#btnAssistFab');
    const drawer = $('#assistDrawer');
    const close = $('#btnAssistClose');
    const ask = $('#assistAsk');
    const clear = $('#assistClear');
    const input = $('#assistInput');
    const reply = $('#assistReply');
    const ctx = $('#assistContext');
    const auto = $('#assistAutoClose');

    if(!fab || !drawer) return;

    function open(){
      const sec = state.doc ? currentSection() : null;
      const card = state.doc ? (sec.cards || [])[state.cardIdx] : null;
      ctx.textContent = sec && card
        ? `Section: ${sec.title || ''} • Card: ${card.title || card.type || ''}`
        : 'Ask a doubt about this lesson.';
      drawer.dataset.open = '1';
      drawer.setAttribute('aria-hidden','false');
      setTimeout(()=> input && input.focus(), 0);
    }
    function closeIt(){
      drawer.dataset.open = '0';
      drawer.setAttribute('aria-hidden','true');
      reply.textContent = ''; reply.style.display = 'none';
      auto.hidden = true;
    }

    fab.onclick = open;
    close.onclick = closeIt;
    drawer.addEventListener('click', (e)=>{ if(e.target === drawer) closeIt(); });

    clear.onclick = () => {  input.value=''; reply.textContent=''; auto.hidden=true; reply.style.display='none'; input.focus();  };

    ask.onclick = async () => {
      const q = String(input.value || '').trim();
      if (!q) return toast(t('type_doubt_toast'));

      // Re-read params from URL to avoid stale values
      const p = (typeof getParams === 'function') ? getParams() : {};
      const klass = String(p.cls || p.klass || p.class || p.class_level || '').trim();
      const board = String(p.board || '').trim();
      const subject = String(p.subject || '').trim();

      reply.textContent = t('thinking'); reply.style.display = 'block';
      auto.hidden = true;

      // Phase-4: auto-detect profile; do NOT block if class/board/subject are missing.
      if (window.KE && typeof window.KE.fetchJson === 'function') {
        try {
          // Ensure configuration is loaded
          if (typeof window.KE.loadConfig === 'function') {
            try { await window.KE.loadConfig(); } catch (_) {}
          }
          // Derive solve endpoint from config
          const solvePath = (window.KE.config && (window.KE.config.solve_path || window.KE.config.solvePath)) || '/solve';
          const url = (typeof window.KE.apiUrl === 'function') ? window.KE.apiUrl(solvePath) : solvePath;
          // Build request payload using FastAPI contract (class instead of klass)
          const sec = state.doc ? currentSection() : null;
          const card = state.doc ? ((sec && sec.cards) ? sec.cards[state.cardIdx] : null) : null;

          const payload = {
            question: q,
            ...(board ? { board } : {}),
            ...(klass ? { class: klass } : {}),
            ...(subject ? { subject } : {}),
            chapter: String(p.chapter || '').trim() || undefined,
            // Phase-4 3 modes: lite | tutor | mastery
            answer_mode: (window.__ke_luma_mode || 'tutor'),
            ...(String(window.__ke_luma_mode || 'tutor') === 'mastery' ? { exam_mode: 'BOARD' } : {}),
            // UI language drives assistant language (content remains as authored)
            language: String(state.uiLang || (p.lang || p.language || 'en')),
            study_mode: 'luma',
            context: {
              section: sec ? (sec.title || '') : '',
              card_type: card ? (card.type || card.card_type || card.title || '') : '',
              visible_text: safeTextFromCard(card),
              anchor_example: (state.doc && state.doc.meta) ? (state.doc.meta.anchor_example || state.doc.meta.anchorExample || '') : ''
            }
          };
          
          // DEBUG: Log request payload to help diagnose any issues
          console.log('[Luma Assist] Sending AI request:', {
            question_preview: q.substring(0, 50) + (q.length > 50 ? '...' : ''),
            class: payload.class,
            board: payload.board,
            subject: payload.subject,
            answer_mode: payload.answer_mode,
            exam_mode: payload.exam_mode || null,
            chapter: payload.chapter,
            language: payload.language,
            study_mode: payload.study_mode
          });
          
          // Generate idempotent request id
          try {
            const rid = (window.crypto && typeof window.crypto.randomUUID === 'function')
              ? window.crypto.randomUUID()
              : ('rid_' + Date.now() + '_' + Math.random().toString(16).slice(2));
            payload.request_id = rid;
          } catch (_) {}
          // Compose headers; include auth if available
          const headers = { 'Content-Type': 'application/json' };
          try {
            const tkn = (window.KnowEasyAuth && typeof window.KnowEasyAuth.getToken === 'function')
              ? (window.KnowEasyAuth.getToken('student') || window.KnowEasyAuth.getToken() || '')
              : '';
            const tok = String(tkn || localStorage.getItem('knoweasy_session_token_student_v1') || localStorage.getItem('knoweasy_session_token_v1') || '').trim();
            if (tok) headers['Authorization'] = 'Bearer ' + tok;
          } catch (_) {}

          // Premium gate: no live AI for free users (unless they have paid Booster credits)
          try {
            const mePath = (window.KE.config && (window.KE.config.payments_me_path || window.KE.config.paymentsMePath)) || '/payments/me';
            const meUrl = (typeof window.KE.apiUrl === 'function') ? window.KE.apiUrl(mePath) : mePath;
            const me = await window.KE.fetchJson(meUrl, {
              method: 'GET',
              headers: headers,
              timeout_ms: 12000
            });
            const sub = me && me.subscription ? me.subscription : null;
            const w = me && me.wallet ? me.wallet : null;
            const plan = String((sub && sub.plan) || (w && w.plan) || 'free').toLowerCase();
            const boosterRemaining = Number((w && (w.booster_remaining ?? w.booster ?? w.booster_credits_balance ?? 0)) ?? 0);
            const includedRemaining = Number((w && (w.included_remaining ?? w.plan_remaining ?? w.remaining ?? w.included_credits_balance ?? 0)) ?? 0);
            const canLive = (plan === 'pro' || plan === 'max') ? true : (boosterRemaining > 0 && (boosterRemaining + includedRemaining) > 0);
            const modeWrap = document.getElementById('lumaAnswerModeWrap');
            if (modeWrap) modeWrap.style.display = canLive ? 'block' : 'none';
            if (!canLive) {
              reply.innerHTML = `<div style="font-weight:900;margin-bottom:8px">AI is a premium feature</div>
                <div style="opacity:0.85;line-height:1.5">To keep costs safe, Focused Assist is available on <b>Pro</b>/<b>Max</b> or with Booster credits.</div>
                <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
                  <a class="ke-chip ke-chip--ok" href="upgrade.html">Upgrade</a>
                  <a class="ke-chip" href="study.html">Back to Study</a>
                </div>`;
              reply.style.display = 'block';
              return;
            }
          } catch (e) {
            // If we can't verify, fail safe (do not spend credits)
            reply.innerHTML = `<div style="font-weight:900;margin-bottom:8px">Unable to verify plan</div>
              <div style="opacity:0.85;line-height:1.5">Please check your internet and try again.</div>`;
            reply.style.display = 'block';
            return;
          }
          // Determine generous timeout: minimum 20s or double configured net_timeout_ms
          const timeoutMs = (window.KE.config && window.KE.config.net_timeout_ms)
            ? Math.max(20000, window.KE.config.net_timeout_ms * 2)
            : 20000;
          // Perform the API call
          const out = await window.KE.fetchJson(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
            timeout_ms: timeoutMs
          });
          
          // DEBUG: Log response metadata
          console.log('[Luma Assist] Received AI response:', {
            has_answer: !!out?.final_answer || !!out?.answer,
            answer_length: (out?.final_answer || out?.answer || '').length,
            has_sections: !!out?.sections,
            credits_used: out?.credits_used || out?.usage?.credits_used || 'unknown',
            credits_left: out?.credits_left || out?.usage?.credits_left || 'unknown',
            providers_used: out?.providers_used || out?.provider || 'unknown',
            ai_strategy: out?.ai_strategy || 'unknown',
            cached: out?.flags?.includes('CACHED') || false
          });
          
          // Use PremiumRenderer if available and response has premium format
          if (window.PremiumRenderer) {
            try {
              console.log('[Luma Assist] Using premium renderer');
              reply.innerHTML = ''; // Clear previous content
              window.PremiumRenderer.render(out, reply);
              
              // Show multi-AI badge if applicable
              const badge = document.getElementById('premiumBadge');
              const providers = (out && out.meta && Array.isArray(out.meta.providers_used)) ? out.meta.providers_used : (Array.isArray(out?.providers_used) ? out.providers_used : []);
              if (badge && providers && providers.length > 1) {
                badge.style.display = 'inline-flex';
                if (providers.length === 3) {
                  badge.textContent = '✨ Powered by 3 AIs';
                } else if (providers.length === 2) {
                  badge.textContent = '✨ Enhanced by 2 AIs';
                }
              }
            } catch (err) {
              console.error('[Luma Assist] Premium renderer error:', err);
              // Fallback to plain text
              const ans = String(out?.answer || out?.final_answer || '').trim();
              reply.textContent = ans || offlineHint(q);
            }
          } else {
            // Plain text fallback (for simple responses or if renderer not loaded)
            const ans = String(out?.answer || out?.final_answer || out?.result || out?.text || out?.reply || '').trim();
            reply.textContent = ans ? ans : offlineHint(q);
          }

          // Append calm metadata chips (non-technical)
          try {
            const meta = (out && out.meta && typeof out.meta === 'object') ? out.meta : {};
            const bits = [];
            if (meta.verified) bits.push({ t: '✅ Verified', cls: 'ke-chip ke-chip--ok' });
            const label = String(meta.confidence_label || '').toUpperCase();
            if (label && !meta.verified) bits.push({ t: label.replace(/_/g,' '), cls: 'ke-chip ke-chip--warn' });
            const cu = Number(meta.credits_used || 0);
            if (cu && Number.isFinite(cu)) bits.push({ t: `${cu} credits used`, cls: 'ke-chip' });
            const prov = Array.isArray(meta.providers_used) ? meta.providers_used : [];
            if (prov.length) bits.push({ t: `AI: ${prov.join(', ')}`, cls: 'ke-chip' });

            if (bits.length) {
              const row = document.createElement('div');
              row.style.marginTop = '12px';
              row.style.display = 'flex';
              row.style.flexWrap = 'wrap';
              row.style.gap = '8px';
              bits.forEach(b => {
                const el = document.createElement('span');
                el.className = b.cls;
                el.textContent = b.t;
                row.appendChild(el);
              });
              reply.appendChild(row);
            }
          } catch (_) {}
        } catch (e) {
          console.warn('Assist call failed', e);
          reply.textContent = offlineHint(q);
        }
      } else {
        // Without KE helpers, default to offline
        reply.textContent = offlineHint(q);
      }

      // Nudge user to return to lesson if not already asked
      if (reply.textContent && !/Ready to continue\?|Back to the lesson\?/i.test(reply.textContent)) {
        reply.textContent = reply.textContent.trim() + '\n\nReady to continue?';
      }

      // No auto-close: student dismisses when ready
      auto.hidden = false;
};
  }

  function extractVisibleText(card){
    if(!card) return '';
    const p = card.payload || card;
    if(card.type === 'explain') return String(p.content || (Array.isArray(p.paras)? p.paras.join(' '): '') || '');
    if(card.type === 'math') return String(p.expression || (Array.isArray(p.steps)? p.steps.join(' '): '') || '');
    if(card.type === 'quick_check') return String(p.question || '');
    return '';
  }

  function offlineHint(q){
    const lower = String(q||'').toLowerCase();
    if(lower.includes('example')) return 'Try thinking of a real-life example that matches the definition shown above. Back to the lesson?';
    if(lower.includes('why')) return 'Look at the key words in the card title and explanation. Usually “why” is answered by the cause + the rule. Back to the lesson?';
    return 'Read the last 2 lines again and connect them to the example in the card. Back to the lesson?';
  }


  function showPromiseIfNeeded(){
    const key = 'luma_promise_seen_v1';
    try{
      if(localStorage.getItem(key) === '1') return;
      const modal = $('#lumaPromise');
      const btn = $('#btnPromiseOk');
      if(!modal || !btn) return;
      modal.setAttribute('aria-hidden','false');
      btn.onclick = () => {
        try{ localStorage.setItem(key,'1'); }catch(_){}
        modal.setAttribute('aria-hidden','true');
        // focus next
        try{ $('#btnNext').focus(); }catch(_e){}
      };
    }catch(_e){}
  }

  // Boot
  document.addEventListener('DOMContentLoaded', () => {
    // Try to load core.js so KE.postSolve exists (non-breaking: ignore if missing)
    // Most pages already load core.js globally; luma.html is standalone, so we load it here safely.
    const s = document.createElement('script');
    // Add version query to core.js so service worker and browser do not load stale script
    s.src = 'core.js?v=20260129v1';
    s.defer = true;
    s.onerror = () => {};
    document.head.appendChild(s);

    // Premium answer mode selector (Quick/Deep/Exam)
    try {
      window.__ke_luma_mode = 'tutor';
      const btnIds = ['lumaModeLite','lumaModeTutor','lumaModeMastery'];
      const setMode = (mode) => {
        const m = String(mode || 'tutor').toLowerCase();
        window.__ke_luma_mode = (m === 'mastery') ? 'mastery' : (m === 'lite' ? 'lite' : 'tutor');
        btnIds.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          const active = (el.dataset && el.dataset.mode) ? (el.dataset.mode === m) : false;
          el.classList.toggle('ke-seg__btn--active', !!active);
        });
        const hint = document.getElementById('lumaAnswerModeHint');
        if (hint) hint.textContent = (m === 'mastery') ? 'Mastery is deeper & exam-ready (age-safe).' : (m === 'lite' ? 'Lite is fastest clarity (lowest cost).' : 'Tutor teaches step-by-step (recommended).');
      };
      btnIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', () => setMode(el.dataset.mode || 'deep'));
      });
      setMode('deep');
    } catch (_) {}

    loadJson();
  });
})();

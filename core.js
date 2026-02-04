"use strict";

// --- Role-aware session sync (v10) ---
// Ensures student pages use student token and parent pages use parent token,
// while keeping legacy keys (knoweasy_session_token_v1, knoweasy_user_v1) aligned
// for older scripts (app.js).
(function(){
  try{
    var page = ((location.pathname || "").split("/").pop() || "index.html").toLowerCase();
    var url = new URL(location.href);
    var qpRole = String(url.searchParams.get("role") || "").toLowerCase();
    var role = (qpRole === "parent" || qpRole === "student") ? qpRole : (page === "parent.html" ? "parent" : "student");

    var LEGACY_TOKEN_KEY = "knoweasy_session_token_v1";
    var LEGACY_USER_KEY  = "knoweasy_user_v1";
    var ROLE_TOKEN_KEY = { student: "knoweasy_session_token_student_v1", parent: "knoweasy_session_token_parent_v1" };
    var ROLE_USER_KEY  = { student: "knoweasy_user_student_v1", parent: "knoweasy_user_parent_v1" };

    var roleTokenKey = ROLE_TOKEN_KEY[role];
    var roleUserKey  = ROLE_USER_KEY[role];

    function safeParse(raw){ try{ return raw ? JSON.parse(raw) : null; } catch(e){ return null; } }
    function safeStr(obj){ try{ return JSON.stringify(obj); } catch(e){ return ""; } }

    // If legacy exists and role-specific missing, migrate into role-specific
    var legacyToken = (localStorage.getItem(LEGACY_TOKEN_KEY) || "").trim();
    var roleToken = (localStorage.getItem(roleTokenKey) || "").trim();
    if(!roleToken && legacyToken){
      localStorage.setItem(roleTokenKey, legacyToken);
      roleToken = legacyToken;
    }
    if(roleToken){
      localStorage.setItem(LEGACY_TOKEN_KEY, roleToken);
    }

    // Same idea for user profile
    var legacyUser = safeParse(localStorage.getItem(LEGACY_USER_KEY));
    var roleUser = safeParse(localStorage.getItem(roleUserKey));
    if(!roleUser && legacyUser && typeof legacyUser === "object"){
      var lr = String(legacyUser.role || "").toLowerCase();
      if(!lr || lr === role){
        localStorage.setItem(roleUserKey, safeStr(Object.assign({}, legacyUser, { role: role })));
      }
    }
    if(roleUser){
      localStorage.setItem(LEGACY_USER_KEY, safeStr(roleUser));
    }

    localStorage.setItem("knoweasy_active_role_v1", role);
    sessionStorage.setItem("knoweasy_active_role_v1", role);
  } catch(e){}
})();



/**********************************************************************
   KnowEasy OS — Stability Layer (v1)
   - Debug-only logging (no noisy console in production)
   - Global error & unhandled rejection capture (prevents silent death)
   - Page contract checks (prevents blank/half-render pages after edits)
   **********************************************************************/

  var KE_DEBUG_KEY = window.KE_DEBUG_KEY || "knoweasy_debug_v1"; window.KE_DEBUG_KEY = KE_DEBUG_KEY;          // set to "1" to enable debug logs
  var KE_ERROR_RING_KEY = window.KE_ERROR_RING_KEY || "knoweasy_error_ring_v1"; window.KE_ERROR_RING_KEY = KE_ERROR_RING_KEY; // stores last client errors (for your debugging)

  function keIsDebug() {
    try { return localStorage.getItem(KE_DEBUG_KEY) === "1"; } catch (_) { return false; }
  }

  function kePushError(scope, err) {
    try {
      const entry = {
        t: new Date().toISOString(),
        scope: String(scope || "unknown"),
        msg: String(err && (err.message || err) || "unknown"),
        stack: String(err && err.stack || "").slice(0, 2000)
      };
      const raw = localStorage.getItem(KE_ERROR_RING_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      arr.unshift(entry);
      if (arr.length > 20) arr.length = 20;
      localStorage.setItem(KE_ERROR_RING_KEY, JSON.stringify(arr));
    } catch (_) {}
  }

  function keToast(msg, ms) {
    try {
      const text = String(msg || "").trim();
      if (!text) return;
      let t = document.querySelector(".app-toast");
      if (!t) {
        t = document.createElement("div");
        t.className = "app-toast";
        document.body.appendChild(t);
      }
      t.textContent = text;
      t.style.opacity = "1";
      t.style.pointerEvents = "none";
      clearTimeout(t.__ke_to);
      t.__ke_to = setTimeout(() => { try { t.style.opacity = "0"; } catch (_) {} }, ms || 2200);
    } catch (_) {}
  }

  function keLogError(scope, err, opts) {
    try {
      kePushError(scope, err);
      if (keIsDebug()) {
        console.error("[KE]", scope, err);
      }
      if (opts && opts.toast) {
        keToast(opts.toast);
      }
    } catch (_) {}
  }

  // Expose stable helpers (used by app.js and any future pages)
  try {
    window.KE = window.KE || {};
    window.KE.isDebug = keIsDebug;
    window.KE.logError = keLogError;
    window.KE.toast = keToast;
  } catch (_) {}

  // Global crash capture (keeps app alive + visible debug signal)
  (function installGlobalGuards(){
    try {
      let lastToastAt = 0;
      const TOAST_COOLDOWN_MS = 30000;

      window.addEventListener("error", (ev) => {
        const err = ev && (ev.error || ev.message);
        keLogError("window.onerror", err || ev);
        if (!keIsDebug()) {
          const now = Date.now();
          if (now - lastToastAt > TOAST_COOLDOWN_MS) {
            lastToastAt = now;
            keToast("Something went wrong. Please refresh.");
          }
        }
      });

      window.addEventListener("unhandledrejection", (ev) => {
        const err = ev && (ev.reason || ev);
        keLogError("unhandledrejection", err);
        if (!keIsDebug()) {
          const now = Date.now();
          if (now - lastToastAt > TOAST_COOLDOWN_MS) {
            lastToastAt = now;
            keToast("Network or app error. Please try again.");
          }
        }
      });
    } catch (_) {}
  })();

  // Page contract checks (prevents silent UI breakage)
  function keCheckPageContract() {
    try {
      const path = (location.pathname || "").toLowerCase();
      const page = path.split("/").pop() || "index.html";

      const contracts = {
        "index.html":  ["profileMeta"],
        "welcome.html": ["startBtn","classRow","boardRow","continueBtn"],
        "study.html":  ["profileMeta","subjectRow","chapterList"],
        "chat.html":   ["q","solveBtn","result"],
        "test.html":   ["profileMeta"],
        "me.html":     ["profileMeta"]
      };

      const req = contracts[page];
      if (!req) return;

      const missing = req.filter(id => !document.getElementById(id));
      if (missing.length) {
        keLogError("page_contract", new Error("Missing IDs: " + missing.join(", ")), {
          toast: "App UI mismatch. Please refresh."
        });
      }
    } catch (err) {
      keLogError("page_contract_check_failed", err);
    }
  }

  // Run light guards after DOM is ready
  try {
    document.addEventListener("DOMContentLoaded", () => {
      try { bindImageErrorHider(); } catch (e) { keLogError("bindImageErrorHider", e); }
      keCheckPageContract();
    });
  } catch (_) {}


  function bindImageErrorHider(){
    try{
      document.querySelectorAll("img").forEach((img)=>{
        if (img.dataset.keImgSafe) return;
        img.dataset.keImgSafe = "1";
        img.addEventListener("error", ()=>{ img.style.display = "none"; }, { once:true });
      });
    }catch(_){}
  }
  /**********************************************************************
   KnowEasy OS — CLEAN + SAFE app.js (Performance-fixed)
   - NO UI redesign
   - Fix: Entrance exam chips visibility (already working)
   - Fix: Lag caused by duplicate event listeners on each toggle click
   - Add: Subject icon system -> assets/subjects/{subject}.png (global icons)
   **********************************************************************/

  // -------- Storage keys (LOCKED) --------
  const KEY_PROFILE      = "knoweasy_student_profile_v1";
  const KEY_STUDY_MODE   = "knoweasy_study_mode_v1";      // 'boards' | 'entrance'
  const KEY_EXAM_MODE    = "knoweasy_exam_mode_v1";       // 'jee' | 'jee_adv' | 'neet' | 'cet_engg' | 'cet_med'
  const KEY_ACTIVE_YEAR  = "knoweasy_active_year_v1";     // '11' | '12'

  // Cache for HEAD checks
  const EXISTS_CACHE = Object.create(null);

  // -------- Student mastery (local, deterministic) --------
  // Lightweight offline-first confidence layer per chapter.
  // This does NOT affect syllabus truth or PDF discovery.
  const KEY_CHAPTER_MASTERY = "knoweasy_chapter_mastery_v1"; // { [chapterId]: {score:int,last:string} }

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // Engine-connected attempts + mastery (optional, safe, offline-first)
  // If a backend exists later, we can sync attempts/mastery without changing UI.
  // Attempts are stored locally as a list; each attempt may include chapter_slug for direct mapping.
  const KEY_ATTEMPTS_LOG = "knoweasy_attempts_log_v1"; // [{timestamp, subjectId, chapterId, mode, delta, source}]
  const KEY_ENGINE_MASTERY = "knoweasy_engine_mastery_map_v1"; // { tags?: {tag:score}, chapters?: {chapterId:score} }

  function getAttemptsLog() {
    const arr = _readJson(KEY_ATTEMPTS_LOG, []);
    return Array.isArray(arr) ? arr : [];
  }

  function appendAttempt(entry) {
    const e = entry && typeof entry === "object" ? entry : null;
    if (!e) return;
    const ts = typeof e.timestamp === "string" ? e.timestamp : new Date().toISOString();
    const clean = {
      timestamp: ts,
      subjectId: e.subjectId || "",
      chapterId: e.chapterId || "",
      mode: e.mode || "",
      delta: Number.isFinite(e.delta) ? e.delta : 0,
      source: e.source || "ui"
    };
    const log = getAttemptsLog();
    log.push(clean);
    // keep only last 500 attempts to prevent storage bloat
    while (log.length > 500) log.shift();
    _writeJson(KEY_ATTEMPTS_LOG, log);
  }

  function recomputeChapterMasteryFromAttempts() {
    const base = 50;
    const log = getAttemptsLog();
    if (!log.length) return;
    const m = getChapterMasteryMap();
    // Build per-chapter delta sum
    const sums = Object.create(null);
    for (const a of log) {
      if (!a || !a.chapterId) continue;
      sums[a.chapterId] = (sums[a.chapterId] || 0) + (Number.isFinite(a.delta) ? a.delta : 0);
    }
    for (const chapId of Object.keys(sums)) {
      const score = clamp(base + sums[chapId], 0, 100);
      m[chapId] = { score, last: new Date().toISOString() };
    }
    _writeJson(KEY_CHAPTER_MASTERY, m);
  }

  async function trySyncEngineMastery() {
    // Optional sync: if these files/endpoints exist, we consume them.
    // 1) Static JSON drop-in (Hostinger-friendly): /data/engine/mastery_map_v1.json
    // 2) Future API: /api/mastery?user_id=...
    const candidates = [
      "data/engine/mastery_map_v1.json",
      "data/mastery_map_v1.json"
    ];
    for (const url of candidates) {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) continue;
        const obj = await r.json();
        if (obj && typeof obj === "object") {
          _writeJson(KEY_ENGINE_MASTERY, obj);
          // If engine provides per-chapter scores, apply immediately
          if (obj.chapters && typeof obj.chapters === "object") {
            const m = getChapterMasteryMap();
            for (const [cid, sc] of Object.entries(obj.chapters)) {
              const score = clamp(parseInt(String(sc), 10) || 0, 0, 100);
              m[cid] = { score, last: new Date().toISOString() };
            }
            _writeJson(KEY_CHAPTER_MASTERY, m);
          }
          return true;
        }
      } catch {}
    }
    return false;
  }

  function _readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const obj = JSON.parse(raw);
      return (obj && typeof obj === "object") ? obj : fallback;
    } catch {
      return fallback;
    }
  }

  function _writeJson(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
  }

  // -------- Mastery cache (scale/perf hardening) --------
  // Avoid JSON.parse(localStorage) on every getChapterScore call.
  // Cache is kept in-memory and written back only on mutations.
  let __keMasteryCache = null;

  function getChapterMasteryMap() {
    if (__keMasteryCache) return __keMasteryCache;
    __keMasteryCache = _readJson(KEY_CHAPTER_MASTERY, {});
    if (!__keMasteryCache || typeof __keMasteryCache !== "object") __keMasteryCache = {};
    return __keMasteryCache;
  }

  function getChapterScore(chapId) {
    const m = getChapterMasteryMap();
    const v = m && m[chapId];
    const sc = (v && typeof v.score === "number") ? v.score : 0;
    return clamp(Math.round(sc), 0, 100);
  }

  function setChapterScore(chapId, score) {
    const m = getChapterMasteryMap();
    m[chapId] = { score: clamp(Math.round(score), 0, 100), last: new Date().toISOString() };
    _writeJson(KEY_CHAPTER_MASTERY, m);
  }

  function bumpChapterScore(chapId, delta) {
    const cur = getChapterScore(chapId);
    setChapterScore(chapId, cur + delta);
  }

  function masteryStateFromScore(score) {
    if (score >= 80) return "STRONG";
    if (score >= 40) return "LEARNING";
    return "WEAK";
  }

  function masteryUiFor(score) {
    const state = masteryStateFromScore(score);
    if (state === "STRONG") return { chipText: "Strong", chipClass: "study-chip--strong", fillClass: "study-progress-fill--strong" };
    if (state === "LEARNING") return { chipText: "Learning", chipClass: "study-chip--average", fillClass: "study-progress-fill--average" };
    return { chipText: "Needs", chipClass: "study-chip--weak", fillClass: "study-progress-fill--weak" };
  }

  function pickSuggestedChapter(visibleChapters) {
    // Choose the lowest-score chapter as "next", deterministic.
    let best = null;
    let bestScore = 101;
    (visibleChapters || []).forEach((ch, idx) => {
      const title = (ch && ch.title) ? String(ch.title) : `Chapter ${idx+1}`;
      const id = (ch && ch.id) ? String(ch.id) : slugify(title);
      const sc = getChapterScore(id);
      if (sc < bestScore) { bestScore = sc; best = { id, title, score: sc }; }
    });
    return best;
  }

  // -------- DOM helpers --------
  // Safe-by-default: missing elements should never crash the app.
  // If an element isn't present on a page, we return a lightweight "null element"
  // that no-ops common DOM calls.
  const NULL_EL = new Proxy(function(){}, {
    get(_t, prop){
      if(prop === "classList") return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
      if(prop === "style") return {};
      if(prop === "dataset") return {};
      if(prop === "addEventListener" || prop === "removeEventListener") return () => {};
      if(prop === "querySelector") return () => NULL_EL;
      if(prop === "querySelectorAll") return () => [];
      if(prop === "closest") return () => null;
      if(prop === "getAttribute") return () => null;
      if(prop === "setAttribute") return () => {};
      if(prop === "appendChild" || prop === "removeChild") return () => {};
      if(prop === "insertAdjacentHTML") return () => {};
      if(prop === "scrollIntoView" || prop === "focus" || prop === "blur" || prop === "click" || prop === "remove") return () => {};
      if(prop === "value") return "";
      if(prop === "innerHTML" || prop === "textContent") return "";
      return undefined;
    },
    set(t, prop, value){ t[prop] = value; return true; }
  });

  // Debug mode (OFF by default):
  // - enable once via URL: ?debug=1 (persists in localStorage)
  // - or permanently via localStorage: knoweasy_debug_v1 = "1"
  const KEY_DEBUG = "knoweasy_debug_v1";
  const __missingDomOnce = new Set();
  // Page-aware missing-DOM warnings (debug-only).
  // We warn only for elements that are expected to exist on the CURRENT page,
  // to avoid noisy logs in a multi-page app where scripts are shared.
  const __kePageName = (() => {
    try {
      const p = (window.location && window.location.pathname) ? window.location.pathname : "";
      const f = (p.split("/").pop() || "index.html").toLowerCase();
      return f || "index.html";
    } catch {
      return "index.html";
    }
  })();

  const __keExpectedIdsByPage = {
    // Setup/onboarding
    "welcome.html": new Set(["setupSave","setupCancel","setupModal"]),
    // Study library
    "study.html": new Set([
      "syllabusList","chapterList","chapterTitle","chapterMeta",
      "chapters-check-btn","chapters-copy-missing","chapters-missing-only"
    ]),
    // Chat / Ask Doubt
    "chat.html": new Set(["askInput","askBtn","askClear","askOut","apiStatusDot","apiStatusText"]),
    // Test
    "test.html": new Set(["testList","testModal"]),
    // Me/Profile
    "me.html": new Set(["profileCard","logoutBtn"])
  };

  function __keShouldWarnMissingId(id){
    try {
      const key = String(id || "");
      if (!key) return false;
      const set = __keExpectedIdsByPage[__kePageName];
      return !!(set && set.has(key));
    } catch {
      return false;
    }
  }

  function isDebugOn(){
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("debug") === "1") {
        localStorage.setItem(KEY_DEBUG, "1");
      }
      return localStorage.getItem(KEY_DEBUG) === "1";
    } catch {
      return false;
    }
  }
  function warnMissingIdOnce(id){
    if (!isDebugOn()) return;
    if (!__keShouldWarnMissingId(id)) return;
    const key = String(id || "");
    if (!key || __missingDomOnce.has(key)) return;
    __missingDomOnce.add(key);
    try { console.warn(`[KnowEasy] Missing element #${key} on this page (safe-noop applied).`); } catch {}
  }

  // DOM getter (safe): returns a real element if present, otherwise NULL_EL.
  // In debug mode, it logs missing IDs once (helps catch hidden UI issues without crashing).
  const $ = (id) => {
    const el = document.getElementById(id);
    if (!el) warnMissingIdOnce(id);
    return el || NULL_EL;
  };
  const on = (el, evt, fn) => el && el.addEventListener(evt, fn);

  // HTML escaping (safe for innerHTML templates)
  function escapeHtml(input){
    const s = String(input ?? "");
    return s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

// -------- Creator/Admin mode (hidden) --------
  // Default: OFF.
  // Enable ONLY with a token in the URL (once), then it persists locally on that device.
  // Supported enable params: ?ke_admin=1 or ?admin=1 or ?creator=1
  // Token param: ?token=ke2026
  const CREATOR_MODE_KEY = "knoweasy_creator_mode_v1";

  const isCreatorMode = () => {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const q = (params.get("ke_admin") || params.get("creator") || params.get("admin") || "").trim();
      const ql = q.toLowerCase();

      const token = (params.get("token") || "").trim();
      const hasValidToken = token === "ke2026";

      // Enable: ?ke_admin=1&token=ke2026 (or ?admin=1 / ?creator=1)
      if (q === "1" || ql === "true" || ql === "on") {
        if (!hasValidToken) {
          // Refuse to enable without token
          localStorage.removeItem(CREATOR_MODE_KEY);
          return false;
        }
        localStorage.setItem(CREATOR_MODE_KEY, "1");
        return true;
      }

      // Disable/clear: ?ke_admin=0  OR  ?creator=false  OR  ?admin=off  OR  ?creator=clear
      if (q === "0" || ql === "false" || ql === "off" || ql === "clear") {
        localStorage.removeItem(CREATOR_MODE_KEY);
        return false;
      }

      return localStorage.getItem(CREATOR_MODE_KEY) === "1";
    } catch {
      return false;
    }
  };

  const applyCreatorVisibility = () => {
    const isCreator = isCreatorMode();

    // Admin-only top-level controls
    const viewAllBtn = $("btnViewAll");
    if (viewAllBtn) {
      viewAllBtn.classList.toggle("is-on", isCreator);
      viewAllBtn.style.display = isCreator ? "" : "none";
    }

    // Admin-only controls in Chapters modal
    const checkBtn = $("chapters-check-btn");
    const copyBtn = $("chapters-copy-missing");
    const missingOnly = $("chapters-missing-only");

    if (checkBtn) checkBtn.style.display = isCreator ? "" : "none";
    if (copyBtn) copyBtn.style.display = isCreator ? "" : "none";

    if (missingOnly) {
      // hide checkbox + its label/row cleanly
      const wrap = missingOnly.closest("label") || missingOnly.closest(".toggle") || missingOnly.parentElement;
      if (wrap) wrap.style.display = isCreator ? "" : "none";
      else missingOnly.style.display = isCreator ? "" : "none";
    }

    // Slug hints (admin-only)
    document.querySelectorAll(".chapter-slug").forEach(el => {
      el.style.display = isCreator ? "" : "none";
    });

    // Copy buttons in chapter list (admin-only)
    document.querySelectorAll(".copy-btn,[data-copy-slug]").forEach(el => {
      el.style.display = isCreator ? "" : "none";
    });

    // Status pills can remain for everyone (they\'re harmless),
    // but "Not checked" is cosmetic. Keep visible.
  };


  // -------- mode/exam visibility helpers (LOCKED)
  // Chapter object may include:
  //   tags: ["jee_main","neet","cet_engg","cet_med"]  (metadata-only tags in syllabus files)
  //
  // Visibility rule (Phase-5: activate filtering):
  // - Boards mode: show ALL board chapters (ignore tags)
  // - Entrance mode: show ONLY chapters whose tags include the selected exam tag
  // - JEE Advanced: show JEE Main-tagged chapters + show advExtras as a separate section
  function examToTag(exam) {
    const e = String(exam || "").toLowerCase();
    if (e === "jee") return "jee_main";
    if (e === "neet") return "neet";
    if (e === "cet_engg") return "cet_engg";
    if (e === "cet_med") return "cet_med";
    if (e === "jee_adv") return "jee_main"; // Adv uses the same base portion + extras
    return "";
  }

  function chapterVisibleForProfile(ch, profile) {
    try {
      const cls = effectiveClass(profile);
      const mode = getStudyMode(profile);

      // 5–10: Boards only
      if (cls !== "11" && cls !== "12") return true;

      // Boards mode: show everything
      if (mode !== "entrance") return true;

      // Entrance mode: show only tagged chapters
      const tag = examToTag(getExamMode());
      const tags = Array.isArray(ch && ch.tags) ? ch.tags.map(t => String(t).toLowerCase()) : [];
      if (!tag) return false;
      return tags.includes(String(tag).toLowerCase());
    } catch (_) {
      return true;
    }
  }

  const IS_STUDY = () => !!document.getElementById("subjectRow");

  // -------- Toast --------
  function toast(msg) {
    let t = document.querySelector(".app-toast");
    if (t) t.remove();
    t = document.createElement("div");
    t.className = "app-toast";
    t.textContent = msg;
    Object.assign(t.style, {
      position: "fixed",
      left: "50%",
      bottom: "110px",
      transform: "translateX(-50%)",
      padding: "10px 14px",
      borderRadius: "14px",
      background: "rgba(15,23,42,0.92)",
      color: "white",
      fontWeight: "800",
      fontSize: "12px",
      zIndex: "20000"
    });
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 250);
    }, 1800);
  }

  // -------- Profile --------
  function loadProfileRaw() {
    try {
      const raw = localStorage.getItem(KEY_PROFILE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveProfile(p) {
    localStorage.setItem(KEY_PROFILE, JSON.stringify(p));
  }

  function normalizeProfile(p) {
    const out = Object.assign({}, p || {});
    out.class = String(out.class || "");
    out.board = String(out.board || "").toLowerCase();

    // --- Legacy/alias board values (important for old localStorage) ---
    // We keep ONE canonical value used by data/syllabus/{class}_{board}.js
    // Otherwise syllabus fetch fails and Study page falls back to the demo chapter.
    const boardAliasMap = {
      msb: "maharashtra",
      maha: "maharashtra",
      mh: "maharashtra",
      maharastra: "maharashtra",
      maharashtra_board: "maharashtra",
      cbse_board: "cbse",
      icse_board: "icse",
    };
    if (boardAliasMap[out.board]) out.board = boardAliasMap[out.board];

    // ICSE blocked for 11–12
    if (out.class === "11_12" && out.board === "icse") out.board = "cbse";
    return out;
  }

  function getProfile() {
    const p = normalizeProfile(loadProfileRaw());
    if (!p.class || !p.board) return null;
    saveProfile(p);
    return p;
  }

  function isIntegrated1112(profile) {
    return profile && String(profile.class) === "11_12";
  }

  function activeYear() {
    const y = String(localStorage.getItem(KEY_ACTIVE_YEAR) || "11");
    return (y === "12") ? "12" : "11";
  }

  function setActiveYear(y) {
    localStorage.setItem(KEY_ACTIVE_YEAR, (String(y) === "12") ? "12" : "11");
  }

  function effectiveClass(profile) {
    if (!profile) return "";
    if (isIntegrated1112(profile)) return activeYear();
    return String(profile.class || "");
  }

  // -------- Study/exam modes --------
  function getStudyMode(profile) {
    const cls = effectiveClass(profile);
    if (cls !== "11" && cls !== "12") return "boards"; // 5–10: no toggle
    return (localStorage.getItem(KEY_STUDY_MODE) === "entrance") ? "entrance" : "boards";
  }

  function setStudyMode(mode) {
    localStorage.setItem(KEY_STUDY_MODE, (mode === "entrance") ? "entrance" : "boards");
  }
  function allowedExamsForBoard(board) {
    const b = String(board || "").toLowerCase();
    if (b === "cbse") return ["jee", "jee_adv", "neet"];
    if (b === "maharashtra") return ["cet_engg", "cet_med"];
    return ["jee", "neet"]; // safe fallback
  }

  function defaultExamForProfile(profile) {
    const board = profile ? String(profile.board || "").toLowerCase() : "";
    const group = profile ? String(profile.group || "").toLowerCase() : "";
    if (board === "cbse") {
      return (group === "pcb" || group === "pcmb") ? "neet" : "jee";
    }
    if (board === "maharashtra") {
      return (group === "pcb" || group === "pcmb") ? "cet_med" : "cet_engg";
    }
    return "jee";
  }

  function getExamMode(profile) {
    const p = profile || getProfile();
    const allowed = allowedExamsForBoard(p && p.board);
    const raw = String(localStorage.getItem(KEY_EXAM_MODE) || "").toLowerCase();
    const fallback = defaultExamForProfile(p);
    const e = allowed.includes(raw) ? raw : (allowed.includes(fallback) ? fallback : allowed[0]);
    if (raw !== e) localStorage.setItem(KEY_EXAM_MODE, e);
    return e;
  }

  function setExamMode(exam, profile) {
    const p = profile || getProfile();
    const allowed = allowedExamsForBoard(p && p.board);
    const wanted = String(exam || "").toLowerCase();
    const fallback = defaultExamForProfile(p);
    const e = allowed.includes(wanted) ? wanted : (allowed.includes(fallback) ? fallback : allowed[0]);
    localStorage.setItem(KEY_EXAM_MODE, e);
  }

  // -------- Setup modal --------
  function openSetup() {
    const o = $("setupOverlay");
    if (!o) return;
    o.classList.remove("hidden");
    o.setAttribute("aria-hidden", "false");
  }

  function closeSetup() {
    const o = $("setupOverlay");
    if (!o) return;
    o.classList.add("hidden");
    o.setAttribute("aria-hidden", "true");
  }

  function bindSetupModal() {
    const overlay = $("setupOverlay");
    if (!overlay) return;

    const classBtns = Array.from(overlay.querySelectorAll("[data-class]"));
    const boardBtns = Array.from(overlay.querySelectorAll("[data-board]"));
    const btnSave = $("setupSave");
    const btnCancel = $("setupCancel");

    let tempClass = "";
    let tempBoard = "";

    function applyVisibility() {
      const is1112 = (tempClass === "11_12");
      boardBtns.forEach(b => {
        const v = String(b.getAttribute("data-board") || "").toLowerCase();
        b.style.display = (is1112 && v === "icse") ? "none" : "";
      });
      if (is1112 && tempBoard === "icse") tempBoard = "cbse";
    }

    function paint() {
      classBtns.forEach(b => b.classList.toggle("is-active", (b.getAttribute("data-class") || "") === tempClass));
      boardBtns.forEach(b => {
        let v = String(b.getAttribute("data-board") || "").toLowerCase();
        if (v === "msb") v = "maharashtra";
        b.classList.toggle("is-active", v === tempBoard);
      });
      applyVisibility();
    }

    classBtns.forEach(b => {
      b.addEventListener("click", () => {
        tempClass = b.getAttribute("data-class") || "";
        applyVisibility();
        paint();
      });
    });

    boardBtns.forEach(b => {
      b.addEventListener("click", () => {
        let v = String(b.getAttribute("data-board") || "").toLowerCase();
        if (v === "msb") v = "maharashtra";
        tempBoard = v;
        paint();
      });
    });

    on(btnCancel, "click", () => closeSetup());

    on(btnSave, "click", () => {
      if (!tempClass || !tempBoard) {
        toast("Select class and board first.");
        return;
      }
      saveProfile({ class: tempClass, board: tempBoard });
      closeSetup();
      refreshStudy();
    });

    const existing = getProfile();
    if (existing) {
      tempClass = String(existing.class || "");
      tempBoard = String(existing.board || "");
      paint();
    }
  }

  // -------- Utils --------
  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function stripLeadingNumber(s) {
    return String(s || "").replace(/^\s*\d+[\.\)\-:\s]+/, "").trim();
  }

  function subjectIconPath(name) {
    const n = String(name || "").toLowerCase();
    if (!n) return "assets/subjects/science.png";

    // Languages
    if (n.includes("hindi")) return "assets/subjects/hindi.png";
    if (n.includes("marathi") || n.includes("marāṭhī")) return "assets/subjects/marathi.png";
    if (n.includes("english")) return "assets/subjects/english.png";

    // Core STEM
    if (n.includes("math")) return "assets/subjects/mathematics.png";
    if (n.includes("physics")) return "assets/subjects/physics.png";
    if (n.includes("chem")) return "assets/subjects/chemistry.png";
    if (n.includes("bio")) return "assets/subjects/biology.png";
    if (n.includes("science") || n.includes("evs") || n.includes("environment")) return "assets/subjects/science.png";

    // Social Sciences
    if (n.includes("social")) return "assets/subjects/social_science.png";
    if (n.includes("history")) return "assets/subjects/history.png";
    if (n.includes("geo")) return "assets/subjects/geography.png";
    if (n.includes("civics")) return "assets/subjects/civics.png";
    if (n.includes("econ")) return "assets/subjects/economics.png";

    return "assets/subjects/science.png";
  }

  // Hostinger/CDN note: some setups block or mis-handle HEAD requests.
  // To avoid false "missing" files, fall back to a tiny ranged GET.
  async function headOk(url) {
    if (!url) return false;
    if (EXISTS_CACHE[url] !== undefined) return EXISTS_CACHE[url];

    const remember = (val) => {
      EXISTS_CACHE[url] = !!val;
      return !!val;
    };

    // 1) Prefer HEAD (fast, no body)
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-cache" });
      if (res && res.ok) return remember(true);

      // Some hosts return 403/405 for HEAD even when GET works.
      const st = Number(res && res.status);
      if (![403, 405, 400].includes(st)) return remember(false);
      // else fall through to GET
    } catch {
      // fall through to GET
    }

    // 2) Fallback: GET a single byte
    try {
      const res2 = await fetch(url, {
        method: "GET",
        cache: "no-cache",
        headers: { Range: "bytes=0-0" }
      });
      return remember(!!(res2 && res2.ok));
    } catch {
      return remember(false);
    }
  }

  function basePath(profile) {
    const cls = effectiveClass(profile);
    const board = String(profile.board || "").toLowerCase();

    // LOCKED CONTENT ROUTING (v1):
    // Content is stored ONCE per board syllabus.
    // Exams (JEE/NEET/CET) are overlays ONLY and must NOT create separate folder trees.
    // Therefore base path is ALWAYS:
    //   content/class_{N}/{board}
    return `content/class_${cls}/${board}`;
  }

  function fileFor(kind) {
    if (kind === "mindmap") return "mindmap.pdf";
    if (kind === "pyq") return "pyq.pdf";
    if (kind === "formula") return "formula.pdf";
    if (kind === "diagram") return "diagram.pdf";
    if (kind === "textbook") return "textbook.pdf";
    if (kind === "worksheet") return "worksheet.pdf";
    if (kind === "keypoints") return "keypoints.pdf";
    if (kind === "revision") return "revision.json"; // app-native revision cards (json/html), not PDF
    if (kind === "quiz") return "quiz.json";
    return "notes.pdf";
  }

  // In entrance mode, we may prefer exam-specific assets (optional),
  // but they live INSIDE the same board chapter folder.
  // Example: notes_jee.pdf, pyq_neet.pdf, formula_cet.pdf
  function candidateFilesFor(kind, profile) {
    const mode = getStudyMode(profile);
    const rawExam = String(getExamMode(profile) || "").toLowerCase();
    let exam = rawExam === "jee_adv" ? "jee" : rawExam;
    if (exam === "cet_engg") exam = "cet_pcm";
    if (exam === "cet_med") exam = "cet_pcb";

    // Revision cards are app-native (json/html), not PDFs.
    if (kind === "revision") {
      if (mode !== "entrance") {
        return ["revision.json", "revision.html"];
      }
      // Entrance may optionally have exam-specific revision packs.
      return [
        `revision_${exam}.json`,
        `revision_${exam}.html`,
        "revision.json",
        "revision.html"
      ];
    }

    const base = fileFor(kind);

    // Boards mode: only canonical board file.
    if (mode !== "entrance") return [base];

    if (!exam) return [base];

    // Strict separation: in Entrance mode, PYQs must NEVER fall back to board PYQs.
    // (Board PYQs = pyq.pdf; Entrance PYQs = pyq_{exam}.pdf)
    if (kind === "pyq") {
      return [`pyq_${exam}.pdf`]; // no fallback
    }

    // For other assets, try exam-specific first then base.
    const ext = (kind === "quiz") ? "json" : "pdf";
    const stem = (kind === "quiz") ? "quiz" : (base.replace(/\.pdf$/i, ""));

    const preferred = `${stem}_${exam}.${ext}`;
    return preferred === base ? [base] : [preferred, base];
  }

  /**********************************************************************
   * Tab logic (LOCKED v1)
   * - Deterministic tabs by Class band + Subject + Mode
   * - Board mode for 11–12 hides Quiz/Mindmap entirely
   * - Class 10 includes Board PYQs
   * - Younger classes use lighter labels (Challenge Yourself / Quick Check)
   **********************************************************************/
  (function installTabLogic(){
    try {
      window.KE = window.KE || {};
      KE.tabs = KE.tabs || {};

      function clsNum(profile){
        const c = String(effectiveClass(profile) || "").trim();
        const m = c.match(/\d+/);
        return m ? parseInt(m[0], 10) : 0;
      }

      function subjectKind(name){
        const s = String(name || "").toLowerCase();
        if (s.includes("math")) return "math";
        if (s.includes("physics")) return "physics";
        if (s.includes("chem")) return "chemistry";
        if (s.includes("bio")) return "biology";
        if (s.includes("science")) return "science";
        if (s.includes("social") || s.includes("sst") || s.includes("history") || s.includes("geography") || s.includes("civics")) return "sst";
        return "lang";
      }

      function labelFor(action, profile, subjKind){
        const c = clsNum(profile);
        const junior = c && c <= 9;
        const is10 = c === 10;
        const mode = String(getStudyMode(profile) || "boards").toLowerCase();
        if (action === "notes") return "Notes";
        if (action === "revision") {
          // Naming by age band (kid-friendly) + mode.
          if (c >= 5 && c <= 8) return "Quick Recall";
          if (is10) return "Revision";
          if ((c === 11 || c === 12) && mode === "boards") return ""; // hidden anyway
          return "1‑min";
        }
        if (action === "textbook") return "Textbook Q&A";
        if (action === "worksheet") return junior ? "Practice Sheets" : "Practice";
        if (action === "mindmap") return (c <= 8) ? "Quick Map" : "Mindmap";
        if (action === "pyq") return (c >= 10 && getStudyMode(profile) === "boards") ? "Board PYQs" : "PYQs";
        if (action === "quiz") return (c <= 8) ? "Challenge" : (c <= 10 ? "Quick Check" : "Practice" );
        if (action === "formula") return "Formula";
        if (action === "diagram") return "Diagrams";
        if (action === "keypoints") return (subjKind === "chemistry") ? "Key Reactions" : "Key Points";
        return "Open";
      }

      // Returns ordered list of action keys.
      KE.tabs.getActions = function(profile, subjectName){
        const c = clsNum(profile);
        const mode = String(getStudyMode(profile) || "boards").toLowerCase();
        const k = subjectKind(subjectName);

        // Base: always include Notes from class 5 onward.
        const actions = [];
        const add = (a) => { if (!actions.includes(a)) actions.push(a); };

        add("notes");
        // Textbook Q&A is BOARD-ONLY (Entrance never shows it)
        if (mode === "boards") add("textbook");
        // Revision is a lightweight AI view, not a file. Hide in 11–12 board mode.
        if (!(mode === "boards" && (c === 11 || c === 12))) add("revision");

        // Class bands
        if (c >= 5 && c <= 8) {
          if (k === "science") add("diagram");
          add("worksheet");
          add("quiz");
          return actions;
        }

        if (c === 9) {
          if (k === "math" || k === "physics") add("formula");
          if (k === "biology") add("diagram");
          if (k === "chemistry") add("keypoints");
          if (k === "sst") add("mindmap");
          add("worksheet");
          add("quiz");
          return actions;
        }

        if (c === 10) {
          if (k === "math" || k === "physics") add("formula");
          if (k === "biology") add("diagram");
          if (k === "chemistry") add("keypoints");
          add("pyq");
          add("quiz");
          return actions;
        }

        // 11–12
        if (c === 11 || c === 12) {
          if (k === "math" || k === "physics") add("formula");
          if (k === "biology") add("diagram");
          if (k === "chemistry") add("keypoints");
          add("pyq");

          if (mode === "boards") {
            // LOCK: board mode hides quiz + mindmap
            return actions;
          }

          // Entrance overlays: allow MCQ practice + mindmap (revision speed)
          add("mindmap");
          add("quiz");
          return actions;
        }

        // Fallback for unknown classes
        add("quiz");
        return actions;
      };

      // Returns [{action,label}]
      KE.tabs.getActionButtons = function(profile, subjectName){
        const kind = subjectKind(subjectName);
        return (KE.tabs.getActions(profile, subjectName) || []).map(a => ({ action: a, label: labelFor(a, profile, kind) }));
      };

    } catch (e) {
      console.warn("[KE] tab logic install failed", e);
    }
  })();

  // Resolve a resource URL for a given chapter.
  // Prefer stable chapterId (folder name) when available; fall back to title slug.
  async function resolveResourceUrl(profile, subject, chapterId, chapterTitle, kind) {
    const cls = effectiveClass(profile);
    const board = String(profile.board || "").toLowerCase();

    const mode = getStudyMode(profile);
    const examRaw = String(getExamMode() || "jee").toLowerCase();
    const exam = (examRaw === "jee_adv") ? "jee" : examRaw; // content can be shared for adv & main

    // Primary base: mode-aware (boards OR entrance/exam)
    const basePrimary = basePath(profile);

    // Fallback base: always board path (so shared PDFs live only once)
    const baseFallback = `content/class_${cls}/${board}`;

    const subj = slugify(subject);
    const files = candidateFilesFor(kind, profile);

    const rawTitle = String(chapterTitle || "");
    const idRaw = String(chapterId || "").trim();
    const candidates = Array.from(
      new Set(
        [
          // chapterId is already the folder name (preferred)
          idRaw,
          // safe fallbacks
          slugify(rawTitle),
          slugify(stripLeadingNumber(rawTitle))
        ].filter(Boolean)
      )
    );

    // 1) Try primary base (exam overlay when in entrance mode)
    for (const chap of candidates) {
      for (const file of files) {
        const url = `${basePrimary}/${subj}/${chap}/${file}`;
        if (await headOk(url)) return url;
      }
    }

    // 2) If entrance mode, fall back to board content automatically
    if (mode === "entrance") {
      for (const chap of candidates) {
      for (const file of files) {
        const url = `${baseFallback}/${subj}/${chap}/${file}`;
        if (await headOk(url)) return url;
      }
    }
    }

    return null;
  }

  function pdfParams(url) {
    if (!url) return url;
    if (url.includes("#")) return url;
    return url + "#toolbar=0&navpanes=0&scrollbar=0";
  }

  // -------- Safe fallback syllabus (so UI never breaks) --------
  function fallbackSyllabus(profile) {
    const cls = effectiveClass(profile);

    if (cls !== "11" && cls !== "12") {
      // 5–10: always show main subjects (placeholders until syllabus files exist)
      // Calm fallback: avoid "Coming soon" / technical instructions.
      return {
        subjects: [
          { name: "English", icon: subjectIconPath("English"), total: 12, chapters: [{ title: "Chapter list", note: "" }] },
          { name: "Mathematics", icon: subjectIconPath("Mathematics"), total: 15, chapters: [{ title: "Chapter list", note: "" }] },
          { name: "Science", icon: subjectIconPath("Science"), total: 18, chapters: [{ title: "Chapter list", note: "" }] },
          { name: "Social Science", icon: subjectIconPath("Social Science"), total: 14, chapters: [{ title: "Chapter list", note: "" }] },
          { name: "Hindi", icon: subjectIconPath("Hindi"), total: 10, chapters: [{ title: "Chapter list", note: "" }] },
          { name: "Marathi", icon: subjectIconPath("Marathi"), total: 10, chapters: [{ title: "Chapter list", note: "" }] }
        ]
      };
    }

    // 11–12: calm fallback (avoid "Coming soon" / technical instructions).
    return {
      subjects: [
        { name: "Physics", icon: subjectIconPath("Physics"), total: 24, chapters: [{ title: "Chapter list", note: "" }] },
        { name: "Chemistry", icon: subjectIconPath("Chemistry"), total: 20, chapters: [{ title: "Chapter list", note: "" }] },
        { name: "Maths", icon: subjectIconPath("Maths"), total: 22, chapters: [{ title: "Chapter list", note: "" }] },
        { name: "Biology", icon: subjectIconPath("Biology"), total: 18, chapters: [{ title: "Chapter list", note: "" }] },
        { name: "English", icon: subjectIconPath("English"), total: 10, chapters: [{ title: "Chapter list", note: "" }] }
      ]
    };
  }

  function getSyllabus(profile) {
    const bank = window.KnowEasySyllabus || null;
    const cls = effectiveClass(profile);
    const board = String(profile.board || "").toLowerCase();

    // Canonical board syllabus only. Entrance exams are overlays (tags/extras) inside the board syllabus.
    const key = `${cls}_${board}`;
    if (bank && bank[key]) return bank[key];
    return fallbackSyllabus(profile);
  }

  /**********************************************************************
   * Tab Logic (LOCKED v1.0)
   * Deterministic chapter resources based on:
   *  - class band (5–8 / 9 / 10 / 11–12)
   *  - subject family (math/phy/chem/bio/science/sst/lang)
   *  - mode (boards vs entrance)
   *
   * Goals:
   *  - Younger classes: minimal, friendly
   *  - Class 10+: board-ready (PYQs in 10)
   *  - 11–12 Boards: no quiz/mindmap
   *  - Entrance overlays: allow MCQ practice
   **********************************************************************/
  function _keSubjectFamily(subjectName) {
    const s = String(subjectName || "").toLowerCase();
    if (s.includes("math")) return "math";
    if (s.includes("physics")) return "physics";
    if (s.includes("chem")) return "chemistry";
    if (s.includes("bio")) return "biology";
    if (s.includes("science")) return "science";
    if (s.includes("social") || s.includes("sst") || s.includes("history") || s.includes("geography") || s.includes("civics") || s.includes("econom")) return "sst";
    return "lang";
  }

  function _keNumClass(profile) {
    const c = String(effectiveClass(profile) || "").trim();
    const m = c.match(/\d+/);
    return m ? Number(m[0]) : NaN;
  }

  function _keLabelForAction(action, clsNum, mode) {
    const m = String(mode || "boards");
    if (action === "notes") return (clsNum >= 5 && clsNum <= 8) ? "Learn" : "Notes";

    // Luma is a special, always-available guided learning mode.
    if (action === "luma") return "Learn with Luma";

    if (action === "revision") {
      if (m === "boards" && (clsNum === 11 || clsNum === 12)) return ""; // hidden
      if (clsNum >= 5 && clsNum <= 8) return "Quick Recall";
      if (clsNum === 9 || clsNum === 10) return "Revision";
      if ((clsNum === 11 || clsNum === 12) && m === "entrance") return "Rapid Revision";
      return "Revision";
    }

    if (action === "textbook") return "Textbook Q&A";
    if (action === "worksheet") return (clsNum <= 8) ? "Practice Sheets" : "Practice";

    if (action === "quiz") {
      if (clsNum <= 8) return "Challenge Yourself";
      if (clsNum <= 10) return "Quick Check";
      return "Practice (MCQ)";
    }

    if (action === "mindmap") return "Mindmap";
    if (action === "pyq") return (m === "boards") ? "Board PYQs" : "PYQs";

    if (action === "formula") return "Formula";
    if (action === "diagram") return "Diagrams";
    if (action === "keypoints") return "Key Points";

    return action;
  }

  // Public: returns ordered actions for a chapter.
  // Each item: { action, label }
  function _keChapterActions(profile, subjectName) {
    const clsNum = _keNumClass(profile);
    const mode = getStudyMode(profile); // 'boards' | 'entrance'
    const fam = _keSubjectFamily(subjectName);

    const actions = [];
    const add = (a) => { if (!actions.includes(a)) actions.push(a); };

    // Always: Notes
    add("notes");

    // Always: Luma (guided learning)
    add("luma");

    // Board-only backbone: Textbook Q&A
    if (mode === "boards") add("textbook");

    // ---------- Class 5–8 (Board only, kid-friendly) ----------
    if (clsNum >= 5 && clsNum <= 8) {
      add("worksheet");
      add("revision");
      if (fam === "science" || fam === "biology") add("diagram");
      add("quiz");
      return actions.map(a => ({ action: a, label: _keLabelForAction(a, clsNum, mode) })).filter(x => x.label);
    }

    // ---------- Class 9 (Board) ----------
    if (clsNum === 9) {
      add("revision");
      if (fam === "math" || fam === "physics") add("formula");
      if (fam === "biology") add("diagram");
      if (fam === "chemistry") add("keypoints");
      add("worksheet");
      add("quiz");
      return actions.map(a => ({ action: a, label: _keLabelForAction(a, clsNum, mode) })).filter(x => x.label);
    }

    // ---------- Class 10 (Board year) ----------
    if (clsNum === 10) {
      add("revision");
      if (fam === "math" || fam === "physics") add("formula");
      if (fam === "biology") add("diagram");
      if (fam === "chemistry") add("keypoints");
      add("pyq"); // Board PYQs ON
      add("quiz"); // Quick Check (Quiz)
      return actions.map(a => ({ action: a, label: _keLabelForAction(a, clsNum, mode) })).filter(x => x.label);
    }

    // ---------- Class 11–12 ----------
    if (clsNum === 11 || clsNum === 12) {
      // Subject tools
      if (fam === "math" || fam === "physics") add("formula");
      if (fam === "biology") add("diagram");
      if (fam === "chemistry") add("keypoints");

      if (mode === "boards") {
        add("pyq"); // Board PYQs
        return actions.map(a => ({ action: a, label: _keLabelForAction(a, clsNum, mode) })).filter(x => x.label);
      }

      // Entrance mode: exam-focused, no board noise
      add("revision");   // Rapid Revision
      add("mindmap");
      add("pyq");        // Entrance PYQs (strictly exam-specific file)
      add("quiz");       // Practice (MCQ)
      return actions.map(a => ({ action: a, label: _keLabelForAction(a, clsNum, mode) })).filter(x => x.label);
    }

    // Fallback minimal
    add("worksheet");
    add("quiz");
    return actions.map(a => ({ action: a, label: _keLabelForAction(a, clsNum, mode) })).filter(x => x.label);
  }

  try {
    window.KE = window.KE || {};
    window.KE.tabs = window.KE.tabs || {};
    window.KE.tabs.getChapterActions = (profile, subjectName) => _keChapterActions(profile, subjectName);
  } catch (_) {}
  // -------- Syllabus script loader (SAFE, minimal) --------
  // Your syllabus files live at: data/syllabus/{class}_{board}.js
  // Example: data/syllabus/6_cbse.js sets window.KnowEasySyllabus["6_cbse"] = {...}
  const SYLLABUS_SCRIPT_CACHE = Object.create(null); // key -> true/false

  function loadSyllabusScriptOnce(key) {
    if (SYLLABUS_SCRIPT_CACHE[key] !== undefined) return Promise.resolve(SYLLABUS_SCRIPT_CACHE[key]);

    return new Promise((resolve) => {
      const src = `data/syllabus/${key}.js?v=20251220_entrancefix1`;
      const s = document.createElement("script");
      s.src = src;
      s.async = true;

      const done = (ok) => {
        SYLLABUS_SCRIPT_CACHE[key] = !!ok;
        resolve(!!ok);
      };

      s.onload = () => {
        // confirm the expected key is now present
        const bank = window.KnowEasySyllabus || null;
        done(!!(bank && bank[key]));
      };
      s.onerror = () => done(false);

      document.head.appendChild(s);
    });
  }

  async function ensureSyllabusLoaded(profile) {
    try {
      if (!profile) return false;
      const cls = effectiveClass(profile);
      const board = String(profile.board || "").toLowerCase();
      const bank = window.KnowEasySyllabus || null;

      // Load canonical board syllabus only. Entrance exams are overlays (tags/extras) inside the board syllabus.
      const key = `${cls}_${board}`;
      if (bank && bank[key]) return true;
      return await loadSyllabusScriptOnce(key);
    } catch (_) {
      return false;
    }
  }


  /**********************************************************************
   TOON (Token-Oriented Object Notation) helpers
   - Purpose: prompt-only serialization for LLM calls (NOT for storage/APIs)
   - Safe: unused unless you explicitly call it
   - Why here: shared utility for future Engine → LLM “prompt packing”
   **********************************************************************/

  function _toonEscapeCell(v){
    // Keep row format CSV-like but safe.
    // If value contains comma/newline/quote, we JSON-quote it (cheap + unambiguous).
    const s = (v === null || v === undefined) ? "" : String(v);
    if (/[\n\r,"]/.test(s)) return JSON.stringify(s);
    return s;
  }

  function toonEncodeTable(name, keys, rows){
    // name: string label
    // keys: ["id","name",...]
    // rows: array of arrays OR array of objects with those keys
    const n = String(name || "data");
    const k = Array.isArray(keys) ? keys.map(x => String(x).trim()).filter(Boolean) : [];
    const r = Array.isArray(rows) ? rows : [];
    const out = [];
    out.push(`${n}[${r.length}]{${k.join(",")}}:`);

    for (const row of r){
      let arr;
      if (Array.isArray(row)) {
        arr = row;
      } else if (row && typeof row === "object") {
        arr = k.map(key => row[key]);
      } else {
        arr = [];
      }
      const cells = k.map((_, i) => _toonEscapeCell(arr[i]));
      out.push(`  ${cells.join(",")}`);
    }
    return out.join("\n");
  }

  function toonEncodeKV(name, obj){
    // YAML-like key/value, prompt-friendly. Not strict.
    const n = String(name || "object");
    const o = (obj && typeof obj === "object") ? obj : {};
    const out = [`${n}:`];
    for (const [k, v] of Object.entries(o)){
      const key = String(k);
      if (v && typeof v === "object") {
        // nested objects: JSON stringify for safety
        out.push(`  ${key}: ${JSON.stringify(v)}`);
      } else {
        out.push(`  ${key}: ${String(v)}`);
      }
    }
    return out.join("\n");
  }

  // Expose as a tiny namespace (non-breaking)
  try {
    window.KnowEasyUtils = window.KnowEasyUtils || {};
    window.KnowEasyUtils.toon = { encodeTable: toonEncodeTable, encodeKV: toonEncodeKV };
  } catch {}




  // -------- Profile Gate (Welcome Flow) --------
  function requireProfileOrRedirect(welcomePath = "welcome.html") {
    try {
      const p = getProfile();
      if (!p) {
        // Avoid redirect loops
        const here = (location.pathname || "").toLowerCase();
        if (!here.endsWith("/" + welcomePath.toLowerCase()) && !here.endsWith(welcomePath.toLowerCase())) {
          location.href = welcomePath;
        }
        return null;
      }
      return p;
    } catch {
      try { location.href = welcomePath; } catch {}
      return null;
    }
  }

  // Expose a tiny, stable API for pages to use
  try { window.requireProfileOrRedirect = requireProfileOrRedirect; } catch {}


/* --- KnowEasy API helpers (merged from stable chat runtime) --- */
(function(){
  try { window.KE = window.KE || {}; } catch(_) { return; }
  const KE = window.KE;
  if (KE.__api_helpers_v1) return; KE.__api_helpers_v1 = true;
const DEFAULT_CONFIG = {
  // Default API base (config.json overrides this). Keep this correct so pages
  // that call APIs before config loads still work.
  api_base_url: "https://knoweasy-engine-api.onrender.com",
  health_path: "/health",
  solve_path: "/solve",
  request_timeout_ms: 45000
};
 const CONFIG_URLS = ["config.json"];
 function mergeConfig(base, override) {
  const out = { ...(base || {}) };
  if (override && typeof override === "object") {
    for (const k of Object.keys(override)) out[k] = override[k];
  }
  return out;
}
 // Always keep a non-null config
KE.config = mergeConfig(DEFAULT_CONFIG, KE.config);
 KE.toast = (msg) => {
  try {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = String(msg || "").slice(0, 300);
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.hidden = true), 3500);
  } catch (_) {}
};
 KE.fetchJson = async (url, opts = {}) => {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeout_ms || KE.config.request_timeout_ms || 45000);
  try {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: opts.headers || {},
      body: opts.body,
      signal: ctrl.signal,
      mode: "cors",
      cache: "no-store"
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
};
 KE.loadConfig = async () => {
  // If already loaded once, return it.
  if (KE._configLoaded) return KE.config;
   // Start with defaults so nothing can crash.
  KE.config = mergeConfig(DEFAULT_CONFIG, KE.config);
   try {
    const bust = `?v=${encodeURIComponent(Date.now())}`;
    let cfg = null;
    for (const url of CONFIG_URLS) {
      try {
        cfg = await KE.fetchJson(`${url}${bust}`, { timeout_ms: 15000 });
        break;
      } catch (err) {
        // fallback to next config url
      }
    }
    if (cfg) {
      // Merge to preserve required defaults.
      KE.config = mergeConfig(DEFAULT_CONFIG, cfg);
    }
    KE._configLoaded = true;
    return KE.config;
  } catch (e) {
    // Config fetch failing should not kill the app.
    console.warn("[KE] config.json load failed, using defaults", e);
    KE._configLoaded = true;
    return KE.config;
  }
};
 KE.apiUrl = (path) => {
  const base = (KE.config && KE.config.api_base_url) ? KE.config.api_base_url : DEFAULT_CONFIG.api_base_url;
  const p = String(path || "");
  if (/^https?:\/\//i.test(p)) return p;
  return base.replace(/\/+$/, "") + "/" + p.replace(/^\/+/, "");
};

// Lightweight health ping (used for UI gating fallbacks)
KE.pingHealth = async () => {
  try{
    const healthPath = (KE.config && KE.config.health_path) || DEFAULT_CONFIG.health_path || "/health";
    const data = await KE.fetchJson(KE.apiUrl(healthPath), { method: "GET", timeout_ms: 8000 });
    return !!(data && (data.ok === true || data.status === "ok"));
  }catch(_e){
    return false;
  }
};

 
// ---- UI helpers (required by chat.js) ----
KE.pageContract = (requiredIds = []) => {
  try {
    // Soft-check required DOM IDs (never throw)
    const missing = [];
    requiredIds.forEach((id) => {
      if (!id) return;
      if (!document.getElementById(id)) missing.push(id);
    });
    if (missing.length) console.warn("[KE] Missing DOM ids:", missing.join(", "));
     // Kick off API health check (with a bit more time for Render cold starts)
    KE.setApiBadge("checking", "API: checking…");
    KE.checkApiOnce?.().then((r) => {
      if (r && r.ok) KE.setApiBadge("ok", "API: connected");
      else KE.setApiBadge("bad", "API: offline");
    });

    // Keep status fresh (avoids stale 'offline' after a temporary glitch)
    if (!KE.__apiPoll) {
      KE.__apiPoll = setInterval(() => {
        KE.checkApiOnce?.().then((r2) => {
          if (r2 && r2.ok) KE.setApiBadge("ok", "API: connected");
          else KE.setApiBadge("bad", "API: offline");
        }).catch(() => {
          KE.setApiBadge("bad", "API: offline");
        });
      }, 30000);
    }
  } catch (e) {
    console.warn("[KE] pageContract error", e);
  }
};
 KE.setApiBadge = (state, text) => {
  try {
    const dot = document.getElementById("apiDot");
    const t = document.getElementById("apiText");
    if (t && typeof text === "string") t.textContent = text;
     if (dot) {
      dot.classList.remove("chat-dot--ok", "chat-dot--bad");
      if (state === "ok") dot.classList.add("chat-dot--ok");
      if (state === "bad") dot.classList.add("chat-dot--bad");
    }
  } catch (_) {}
};
 const _escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
 KE.renderAnswer = (containerEl, data, opts = {}) => {
  try {
    if (!containerEl) return;

    const meta = (data && data.meta && typeof data.meta === "object") ? data.meta : {};
    const loRaw = (data && data.learning_object && typeof data.learning_object === "object") ? data.learning_object : null;

    const finalText = String((data && (data.final_answer ?? data.answer ?? "")) || "").trim();
    const safeNote = data && data.safe_note ? String(data.safe_note) : "";
    const creditsUsed = Number(meta.credits_used || 0);
    const providers = Array.isArray(meta.providers_used) ? meta.providers_used : [];
    const mode = String((loRaw && loRaw.mode) || meta.ai_strategy || "").toLowerCase();
    const language = String((loRaw && loRaw.language) || "en").toLowerCase();

    const escape = (s) => keEscapeHtmlFallback(s);
    const asArray = (v) => Array.isArray(v) ? v : [];

    // Ensure AnswerObject shape (never ship raw text as UI product)
    const lo = (() => {
      if (loRaw && typeof loRaw === "object") {
        const hasBlocks = Array.isArray(loRaw.explanation_blocks);
        const hasTitle = typeof loRaw.title === "string";
        if (hasBlocks && hasTitle) return loRaw;
      }
      // Fallback: wrap final text into a minimal AnswerObject
      return {
        title: (finalText ? finalText.split("\n")[0].slice(0, 80) : "Answer"),
        why_this_matters: "This helps you learn the concept clearly and apply it.",
        explanation_blocks: [{ title: "Explanation", content: finalText || "No answer available." }],
        visuals: [],
        examples: [],
        common_mistakes: [],
        exam_relevance_footer: "",
        follow_up_chips: ["Give me a 2-line recap", "Show 2 practice questions"],
        language,
        mode: mode || "tutor"
      };
    })();

    // UI helpers
    const renderList = (items) => {
      const arr = asArray(items).filter(Boolean);
      if (!arr.length) return "";
      return `<ul class="chat-ul">${arr.map(x => `<li>${escape(String(x))}</li>`).join("")}</ul>`;
    };

    const renderBlocks = () => {
      const blocks = asArray(lo.explanation_blocks);
      return blocks.map((b, idx) => {
        const t = (b && typeof b === "object") ? (b.title || "") : "";
        const c = (b && typeof b === "object") ? (b.content || "") : String(b || "");
        const label = t || `Explanation ${idx + 1}`;
        // Preserve bullets/newlines
        const contentHtml = escape(String(c)).replace(/\n/g, "<br>");
        return `
          <div class="chat-details">
            <div class="chat-summary">${escape(label)}</div>
            <div class="chat-block__value" style="margin-top:8px;">${contentHtml}</div>
          </div>
        `;
      }).join("");
    };

    const renderVisuals = () => {
      const visuals = asArray(lo.visuals);
      if (!visuals.length) return "";
      const vHtml = visuals.map((v, idx) => {
        if (!v) return "";
        const vt = (typeof v === "object") ? (v.title || `Visual ${idx + 1}`) : `Visual ${idx + 1}`;
        const vtype = (typeof v === "object") ? (v.type || "diagram") : "diagram";
        const vfmt = (typeof v === "object") ? (v.format || "text") : "text";
        const code = (typeof v === "object") ? (v.code || "") : String(v);

        if (String(vfmt).toLowerCase() === "mermaid" && code) {
          // Mermaid rendering if library is present; else show as code
          const hasMermaid = !!window.mermaid;
          if (hasMermaid) {
            return `
              <div class="chat-details">
                <div class="chat-summary">${escape(vt)} <span style="color:rgba(15,23,42,0.6);font-weight:500;">(${escape(vtype)})</span></div>
                <div class="mermaid" style="margin-top:10px;">${escape(code)}</div>
              </div>
            `;
          }
        }
        const codeHtml = escape(code).replace(/\n/g, "<br>");
        return `
          <div class="chat-details">
            <div class="chat-summary">${escape(vt)} <span style="color:rgba(15,23,42,0.6);font-weight:500;">(${escape(vtype)})</span></div>
            <div class="chat-block__value" style="margin-top:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:12px;line-height:1.4;">${codeHtml}</div>
          </div>
        `;
      }).join("");
      return `
        <div class="chat-block">
          <div class="chat-block__label">Visual</div>
          ${vHtml}
        </div>
      `;
    };

    const renderFooter = () => {
      const footer = String(lo.exam_relevance_footer || "").trim();
      if (!footer) return "";
      return `
        <div class="chat-chip" title="Exam relevance">${escape(footer)}</div>
      `;
    };

    const modeLabel = (() => {
      const m = String(lo.mode || "").toLowerCase();
      if (m === "lite") return "Luma Lite";
      if (m === "mastery") return "Luma Mastery";
      return "Luma Tutor";
    })();

    const providerLabel = providers.length ? ` • ${providers.map(p=>String(p)).join("+")}` : "";
    const creditsLabel = creditsUsed ? ` • credits ${creditsUsed}` : "";

    // Build HTML
    containerEl.innerHTML = `
      <div class="chat-block">
        <div class="chat-block__label">${escape(modeLabel)}${escape(providerLabel)}${escape(creditsLabel)}</div>
        <div class="chat-block__value" style="font-size:16px;font-weight:750;line-height:1.25;">${escape(lo.title || "Answer")}</div>
        <div class="chat-muted" style="margin-top:6px;">${escape(lo.why_this_matters || "")}</div>
      </div>

      ${safeNote ? `<div class="chat-chip">🛡️ ${escape(safeNote)}</div>` : ""}

      ${renderBlocks()}

      ${renderVisuals()}

      ${(asArray(lo.examples).length) ? `
        <div class="chat-block">
          <div class="chat-block__label">Examples</div>
          <div class="chat-block__value">${renderList(lo.examples)}</div>
        </div>
      ` : ""}

      ${(asArray(lo.common_mistakes).length) ? `
        <details class="chat-details">
          <summary class="chat-summary">Common mistakes (avoid these)</summary>
          <div class="chat-block__value" style="margin-top:8px;">${renderList(lo.common_mistakes)}</div>
        </details>
      ` : ""}

      ${renderFooter()}

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
        <button class="chat-btn chat-btn--primary" type="button" id="kePdfBtn">Download PDF</button>
        ${asArray(lo.follow_up_chips).slice(0,4).map((c, i) => `
          <button class="chat-btn" type="button" data-ke-chip="1" data-chip="${escape(String(c))}">${escape(String(c))}</button>
        `).join("")}
      </div>
    `;

    // Wire PDF download
    const pdfBtn = containerEl.querySelector("#kePdfBtn");
    if (pdfBtn) {
      pdfBtn.addEventListener("click", async () => {
        try {
          pdfBtn.disabled = true;
          pdfBtn.textContent = "Preparing PDF…";
          await KE.downloadLearningObjectPdf(lo);
        } catch (e) {
          alert("PDF export failed. Please try again.");
          if (keIsDebug()) console.warn("[KE] PDF export failed", e);
        } finally {
          pdfBtn.disabled = false;
          pdfBtn.textContent = "Download PDF";
        }
      });
    }

    // Wire follow-up chips to input if present
    containerEl.querySelectorAll('button[data-ke-chip="1"]').forEach(btn => {
      btn.addEventListener("click", () => {
        const chip = btn.getAttribute("data-chip") || "";
        const q = document.getElementById("q") || document.getElementById("assistInput");
        if (q) {
          q.value = chip;
          try { q.focus(); } catch(_e){}
        }
      });
    });

    // Mermaid run if present
    if (window.mermaid && typeof window.mermaid.run === "function") {
      try { window.mermaid.run(); } catch(_e){}
    }

  } catch (e) {
    if (keIsDebug()) console.warn("[KE] renderAnswer failed", e);
    // last resort
    containerEl.innerHTML = `<div class="chat-error">Failed to render answer.</div>`;
  }
};

// Download PDF for AnswerObject
KE.downloadLearningObjectPdf = async (learningObject) => {
  await KE.loadConfig();
  const pdfPath = (KE.config && KE.config.pdf_path) || "/export/pdf";
  const url = (KE.config && KE.config.api_base_url ? KE.config.api_base_url : DEFAULT_CONFIG.api_base_url) + pdfPath;

  const token = KE.getToken ? KE.getToken() : null;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": "Bearer " + token } : {})
    },
    body: JSON.stringify({ learning_object: learningObject, mode: learningObject && learningObject.mode })
  });

  if (!res.ok) {
    throw new Error("PDF_EXPORT_FAILED");
  }

  const blob = await res.blob();
  const filenameBase = (learningObject && learningObject.title ? String(learningObject.title) : "KnowEasy_Answer")
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 60);
  const filename = filenameBase + ".pdf";

  // Trigger download
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { URL.revokeObjectURL(a.href); } catch(_e){}
    a.remove();
  }, 500);
};



// PDF export (premium answer as learning object)
KE.exportPdf = async ({ learning_object, mode }) => {
  await KE.loadConfig();
  const path = (KE.config && KE.config.pdf_path) || '/export/pdf';
  const url = KE.apiUrl(path);
  const token = window.KnowEasyAuth && window.KnowEasyAuth.getToken ? (window.KnowEasyAuth.getToken('student') || window.KnowEasyAuth.getToken()) : null;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ learning_object, mode })
  });
  if (!res.ok) throw new Error('PDF export failed');
  const blob = await res.blob();
  return blob;
};

KE.checkApiOnce = async () => {
  // Never throw here — only set UI state.
  try {
    await KE.loadConfig();
    const healthPath = (KE.config && KE.config.health_path) || DEFAULT_CONFIG.health_path;
    await KE.fetchJson(KE.apiUrl(healthPath), { timeout_ms: 15000 });
    return { ok: true };
  } catch (e) {
    if (keIsDebug()) console.warn("[KE] API check failed", e);
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
};
 KE.postSolve = async ({ question, board, klass, subject, study_mode, answer_mode, exam_mode, private_session, memory_opt_in, surface }) => {
  await KE.loadConfig();
  const solvePath = (KE.config && KE.config.solve_path) || DEFAULT_CONFIG.solve_path;

  // Trust-safe retry idempotency:
  // Use one request_id for all retry attempts in this call so if the network
  // drops mid-request, a retry will fetch the same response without double-charging.
  const request_id = (() => {
    try {
      if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    } catch (e) {}
    // Fallback (still unique enough for client retries)
    return "rid_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  })();

  const payload = {
    question: String(question || "").trim(),
    board: String(board || "").trim(),
    class: String(klass || "").trim(),
    subject: String(subject || "").trim(),
    study_mode: String(study_mode || "Boards").trim(),
    request_id,
    ...(answer_mode ? { answer_mode: String(answer_mode) } : {}),
    ...(exam_mode ? { exam_mode: String(exam_mode) } : {}),
    ...(typeof private_session !== "undefined" ? { private_session: !!private_session } : {}),
    ...(typeof memory_opt_in !== "undefined" ? { memory_opt_in: !!memory_opt_in } : {}),
    ...(surface ? { surface: String(surface) } : {})
  };

  // Render free-tier can cold-start; keep UX snappy with timeout + retries.
  const mode = String(answer_mode || "").toLowerCase();
  const base = (KE.config && KE.config.net_timeout_ms) || 20000;
  // Dynamic timeouts per mode (prevents Mastery abort at 20s)
  const timeoutMs =
    mode === "mastery" ? Math.max(base, 90000) :
    mode === "tutor"   ? Math.max(base, 45000) :
                         Math.max(base, 20000);
  const retries = (KE.config && Number.isFinite(KE.config.net_retries)) ? KE.config.net_retries : 2; // extra retries
  const maxAttempts = 1 + Math.max(0, retries);

  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) KE.setApiBadge("checking", `API: retrying (${attempt}/${maxAttempts})…`);
      const token = (() => {
        try {
          const t = (window.KnowEasyAuth && typeof window.KnowEasyAuth.getToken === "function") ? (window.KnowEasyAuth.getToken("student") || window.KnowEasyAuth.getToken() || "") : "";
          return String(t || localStorage.getItem("knoweasy_session_token_student_v1") || localStorage.getItem("knoweasy_session_token_v1") || "").trim();
        } catch (e) { return ""; }
      })();
      const hdrs = { "Content-Type": "application/json" };
      if (token) hdrs["Authorization"] = "Bearer " + token;

      const data = await KE.fetchJson(KE.apiUrl(solvePath), {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify(payload),
        timeout_ms: timeoutMs
      });
      KE.setApiBadge("ok", "API: connected");
      return data;
    } catch (e) {
      lastErr = e;

      // If it's a client error (4xx), don't retry.
      const status = e && (e.status || e.statusCode);
      if (status && status >= 400 && status < 500) break;

      // Abort/timeout → retry (cold-start) but keep attempts bounded.
      if (attempt < maxAttempts) {
        const backoff = 1000 * attempt; // 1s, 2s, 3s
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
    }
  }

  // Normalize errors so UI can show a friendly message (no silent hangs)
  const msg = (() => {
    const m = (lastErr && lastErr.message) ? String(lastErr.message) : "";
    if (/aborted|abort/i.test(m)) return "API timeout. Please try again in a few seconds.";
    if (lastErr && lastErr.status === 429) return "Too many requests. Please wait a minute and try again.";
    if (lastErr && lastErr.status === 401) return "Unauthorized. Please refresh and try again.";
    if (lastErr && lastErr.status === 404) return "API route not found. Please refresh the app.";
    if (m) return m;
    return "Unable to connect to the API. Please check your internet and try again.";
  })();

  const err = new Error(msg);
  err.cause = lastErr;
  throw err;
};

// /ask is an alias of /solve on our backend, but keep a dedicated helper for clarity.
KE.postAsk = async ({ question, board, klass, subject, study_mode }) => {
  await KE.loadConfig();
  const askPath = (KE.config && (KE.config.ask_path || KE.config.askPath)) || "/ask";
  try {
    return await KE.fetchJson(KE.apiUrl(askPath), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: String(question || "").trim(),
        board: String(board || "").trim(),
        class: String(klass || "").trim(),
        subject: String(subject || "").trim(),
        study_mode: String(study_mode || "Boards").trim()
      })
    });
  } catch (e) {
    // Fallback to /solve if /ask is not configured.
    return await KE.postSolve({ question, board, klass, subject, study_mode });
  }
};

// A tiny prompt builder for chapter micro-revision (used by Study page).
KE.makeRevisionPrompt = ({ gradeBand, subject, chapterTitle, board, mode, examLabel }) => {
  const band = String(gradeBand || "");
  const sub = String(subject || "Subject");
  const chap = String(chapterTitle || "this chapter");
  const b = String(board || "");
  const m = String(mode || "boards");
  const ex = String(examLabel || "");

  // Child-friendly for 5–8, crisp for 9–10, exam-focused for entrance.
  if (band === "5-8") {
    return `Give a Quick Recall (very simple) for ${sub} — ${chap}.\n\nRules:\n- Use easy words (kid-friendly).\n- 6–8 bullet points max.\n- If diagrams are important, mention what to draw.\n- End with 2 tiny check questions (very easy).`;
  }

  if (band === "9-10") {
    return `Give a 1-minute revision for ${sub} — ${chap}.\n\nRules:\n- Bullet points only (8–12 bullets).\n- Include key definitions/formulas if any.\n- Add 2 quick check questions at the end (no solutions).`;
  }

  // 11–12 entrance
  return `Give a 60-second exam revision for ${sub} — ${chap}${ex ? ` (${ex})` : ""}.\n\nRules:\n- Bullet points only (10–14 bullets).\n- Include must-remember formulas / reactions / NCERT lines depending on subject.\n- Add 3 MCQ-style quick checks at the end (no solutions).`;
};
// -----------------------------
// Global helpers (legacy pages)
// -----------------------------
const PROFILE_KEY = "knoweasy_student_profile_v1";
 // DOM helpers used across pages
window.$ = window.$ || ((id) => document.getElementById(id));
window.$$ = window.$$ || ((sel, root = document) => root.querySelector(sel));
window.$$$ = window.$$$ || ((sel, root = document) => Array.from(root.querySelectorAll(sel)));
 function safeJsonParse(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}
 window.normalizeProfile = window.normalizeProfile || function normalizeProfile(p) {
  const out = (p && typeof p === "object") ? { ...p } : {};
  // common fields
  if (out.board) out.board = String(out.board).toLowerCase();
  if (out.subject) out.subject = String(out.subject);
  if (out.studyMode) out.studyMode = String(out.studyMode).toLowerCase();
  if (out.mode && !out.studyMode) out.studyMode = String(out.mode).toLowerCase();
   // class can be number or string (e.g., "11+12")
  if (out.class === undefined && out.cls !== undefined) out.class = out.cls;
  if (out.class !== undefined) out.class = (typeof out.class === "number") ? out.class : String(out.class);
  // defaults (safe): never force board/class defaults (prevents CBSE/Class-5 flash)
  if (!out.studyMode) out.studyMode = "boards";
   return out;
};
 window.loadProfile = window.loadProfile || function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = window.normalizeProfile(safeJsonParse(raw, null));
    if (!p || !p.board || !p.class) return null;
    return p;
  } catch {
    return null;
  }
};
 window.saveProfile = window.saveProfile || function saveProfile(profile) {
  try {
    const normalized = window.normalizeProfile(profile);
    if (!normalized || !normalized.board || !normalized.class) return null;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return null;
  }
};
 window.effectiveClass = window.effectiveClass || function effectiveClass(profile) {
  const p = window.normalizeProfile(profile || {});
  return String(p.class);
};
 window.getStudyMode = window.getStudyMode || function getStudyMode(profile) {
  const p = window.normalizeProfile(profile || {});
  return String(p.studyMode || "boards");
};
 window.requireProfileOrRedirect = window.requireProfileOrRedirect || function requireProfileOrRedirect(target = "welcome.html") {
  try {
    const p = window.loadProfile();
    if (!p) {
      window.location.href = target;
      return null;
    }
    return p;
  } catch {
    window.location.href = target;
    return null;
  }
};
 // Backward-compatible aliases
window.toast = window.toast || ((msg) => KE.toast(msg));

})();

/*
 * Low-credit warnings (soft, non-scary) – v2026-01-16
 *
 * Goal: gently warn students before they hit 0 credits, without fear messaging.
 * Shows at most once per browser session.
 */
(function () {
  'use strict';

  const SHOWN_KEY = 'ke_low_credit_shown_v1';
  const CACHE_KEY = 'ke_wallet_summary_v1';
  const CACHE_TTL_MS = 60 * 1000; // 1 min

  function isLoggedIn() {
    try {
      return !!window.KnowEasyAuth && !!window.KnowEasyAuth.getToken && !!window.KnowEasyAuth.getToken();
    } catch {
      return false;
    }
  }

  function safeJsonParse(raw) {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function now() { return Date.now(); }

  function normalizeWallet(data) {
    // Accept multiple shapes to keep this resilient.
    if (!data || typeof data !== 'object') return null;

    // Common shapes:
    // { wallet: { remaining_credits, monthly_credits, cycle_end_at } }
    // { remaining_credits, monthly_credits, cycle_end_at }
    // { credits: { remaining, limit, cycle_end_at } }
    const root = data.wallet || data.credits || data;

    const remaining = Number(root.remaining_credits ?? root.remaining ?? root.balance ?? NaN);
    const limit = Number(root.monthly_credits ?? root.limit ?? root.cycle_credits ?? NaN);
    const cycleEnd = root.cycle_end_at || root.cycleEndAt || root.cycle_end || null;
    const cycleStart = root.cycle_start_at || root.cycleStartAt || root.cycle_start || null;

    if (!Number.isFinite(remaining)) return null;
    return {
      remaining: Math.max(0, remaining),
      limit: Number.isFinite(limit) ? Math.max(0, limit) : null,
      cycleEndAt: cycleEnd ? String(cycleEnd) : null,
      cycleStartAt: cycleStart ? String(cycleStart) : null
    };
  }

  async function apiGet(path) {
    if (!window.KnowEasyAuth || typeof window.KnowEasyAuth.apiFetch !== 'function') return null;
    const { res, data, error } = await window.KnowEasyAuth.apiFetch(path, { method: 'GET', noAuthRedirect: true });
    if (error || !res || !res.ok) return null;
    return data;
  }

  async function loadWalletSummaryFresh() {
    // Best-effort: try billing wallet endpoints, then payments/me.
    const candidates = ['/billing/wallet/me', '/billing/wallet', '/payments/me'];
    for (const p of candidates) {
      try {
        const data = await apiGet(p);
        const norm = normalizeWallet(data);
        if (norm) return norm;
      } catch {
        // continue
      }
    }
    return null;
  }

  async function getWalletSummary() {
    try {
      const cached = safeJsonParse(sessionStorage.getItem(CACHE_KEY));
      if (cached && cached.t && (now() - cached.t) < CACHE_TTL_MS && cached.v) return cached.v;
    } catch {}

    const fresh = await loadWalletSummaryFresh();
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: now(), v: fresh }));
    } catch {}
    return fresh;
  }

  function daysLeft(isoDate) {
    try {
      if (!isoDate) return null;
      const end = new Date(isoDate).getTime();
      if (!Number.isFinite(end)) return null;
      const d = Math.ceil((end - now()) / (24 * 3600 * 1000));
      return Number.isFinite(d) ? d : null;
    } catch {
      return null;
    }
  }

  function shouldWarn(wallet) {
    if (!wallet) return false;
    const r = Number(wallet.remaining);
    if (!Number.isFinite(r)) return false;
    if (r <= 0) return true;

    const limit = wallet.limit;
    if (Number.isFinite(limit) && limit > 0) {
      const frac = r / limit;
      return frac <= 0.15;
    }
    // If limit unknown, warn only when very low.
    return r <= 20;
  }

  function buildMessage(wallet) {
    const r = Math.max(0, Number(wallet.remaining) || 0);
    const d = daysLeft(wallet.cycleEndAt);

    if (r <= 0) {
      return {
        title: 'AI credits finished',
        body: 'You can still use Notes/PYQ/Quiz. Add a Booster pack to continue AI instantly.',
        cta: 'Buy Booster',
        href: 'upgrade.html'
      };
    }

    const tail = (d != null && d >= 0) ? `(${d} day${d === 1 ? '' : 's'} left in this cycle)` : '';
    return {
      title: 'Low AI credits',
      body: `You have ${r} credit${r === 1 ? '' : 's'} left ${tail}. Keep learning — add a Booster anytime.`.trim(),
      cta: 'View plans',
      href: 'upgrade.html'
    };
  }

  function ensureBannerEl() {
    // Insert at top of main content if not already present.
    const existing = document.getElementById('keCreditBanner');
    if (existing) return existing;
    const main = document.querySelector('.app-main');
    if (!main) return null;

    const wrap = document.createElement('div');
    wrap.id = 'keCreditBanner';
    wrap.style.margin = '12px 0 0';
    wrap.style.padding = '12px 12px';
    wrap.style.borderRadius = '16px';
    wrap.style.border = '1px solid rgba(148,163,184,0.22)';
    wrap.style.background = 'rgba(255,255,255,0.78)';
    wrap.style.backdropFilter = 'blur(14px)';
    wrap.style.webkitBackdropFilter = 'blur(14px)';
    wrap.style.boxShadow = '0 14px 34px rgba(2,6,23,0.10), 0 0 0 1px rgba(255,255,255,0.22) inset';
    wrap.style.display = 'none';

    // Keep styling minimal and consistent with existing glass cards.
    wrap.innerHTML = `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
        <div style="min-width:0;">
          <div id="keCreditBannerTitle" style="font-weight:950;">Low AI credits</div>
          <div id="keCreditBannerBody" style="margin-top:6px; opacity:0.82; font-size:13px; line-height:1.45;"></div>
        </div>
        <a id="keCreditBannerCta" href="upgrade.html" style="white-space:nowrap; align-self:center; padding:8px 10px; border-radius:12px; text-decoration:none; font-weight:900; font-size:12.5px; background:rgba(15,23,42,0.92); color:#fff;">View</a>
      </div>
    `;

    // Insert as first block inside main.
    main.insertBefore(wrap, main.firstChild);
    return wrap;
  }

  async function maybeShowLowCreditWarning() {
    try {
      if (!isLoggedIn()) return;
      if (sessionStorage.getItem(SHOWN_KEY) === '1') return;

      const wallet = await getWalletSummary();
      if (!shouldWarn(wallet)) return;

      const banner = ensureBannerEl();
      if (!banner) return;

      const msg = buildMessage(wallet);
      const t = banner.querySelector('#keCreditBannerTitle');
      const b = banner.querySelector('#keCreditBannerBody');
      const c = banner.querySelector('#keCreditBannerCta');
      if (t) t.textContent = msg.title;
      if (b) b.textContent = msg.body;
      if (c) {
        c.textContent = msg.cta;
        c.setAttribute('href', msg.href);
      }
      banner.style.display = 'block';
      try { sessionStorage.setItem(SHOWN_KEY, '1'); } catch {}
    } catch {
      // never block UI
    }
  }

  // Trigger after DOM is ready (does not block app).
  document.addEventListener('DOMContentLoaded', () => {
    // Small delay so page layout stabilizes.
    setTimeout(maybeShowLowCreditWarning, 450);
  });

// --- KNOWEASY EXPORTS (required for split JS files) ---
// Feature scripts (study.js, luma.js, chat.js) historically relied on these
// helpers being global. core.js is wrapped in an IIFE, so we expose a safe,
// backward-compatible surface on `window`.
try {
  const w = window;
  const exp = (name, val) => {
    try {
      if (typeof val === "function" || typeof val === "object") {
        if (w[name] === undefined) w[name] = val;
      }
    } catch {}
  };

  // DOM + events
  exp("$", $);
  exp("on", on);

  // UI
  exp("toast", toast);

  // Page guards
  exp("IS_STUDY", IS_STUDY);
  exp("IS_LUMA", IS_LUMA);
  exp("IS_CHAT", IS_CHAT);

  // Profile + study state
  exp("getProfile", getProfile);
  exp("saveProfile", saveProfile);
  exp("normalizeProfile", normalizeProfile);
  exp("effectiveClass", effectiveClass);
  exp("isIntegrated1112", isIntegrated1112);
  exp("activeYear", activeYear);
  exp("setActiveYear", setActiveYear);
  exp("getStudyMode", getStudyMode);
  exp("setStudyMode", setStudyMode);
  exp("getExamMode", getExamMode);
  exp("setExamMode", setExamMode);
  exp("allowedExamsForBoard", allowedExamsForBoard);

  // Syllabus
  exp("ensureSyllabusLoaded", ensureSyllabusLoaded);
  exp("getSyllabus", getSyllabus);
  exp("chapterVisibleForProfile", chapterVisibleForProfile);
  exp("subjectIconPath", subjectIconPath);

  // Utils
  exp("clamp", clamp);
  exp("slugify", slugify);
  exp("escapeHtml", escapeHtml);

  // Suggestions + mastery
  exp("pickSuggestedChapter", pickSuggestedChapter);
  exp("masteryUiFor", masteryUiFor);
  exp("getChapterScore", getChapterScore);
  exp("bumpChapterScore", bumpChapterScore);
  exp("appendAttempt", appendAttempt);
  exp("recomputeChapterMasteryFromAttempts", recomputeChapterMasteryFromAttempts);
  exp("trySyncEngineMastery", trySyncEngineMastery);

  // Setup modal
  exp("bindSetupModal", bindSetupModal);
  exp("openSetup", openSetup);

  // Creator tools
  exp("applyCreatorVisibility", applyCreatorVisibility);

  // Resource resolution
  exp("resolveResourceUrl", resolveResourceUrl);
  exp("fileFor", fileFor);
  exp("pdfParams", pdfParams);
  exp("headOk", headOk);

  // Also mirror on KE namespace for future code (non-breaking)
  try {
    if (w.KE && typeof w.KE === "object") {
      w.KE.util = w.KE.util || {};
      w.KE.util.slugify = w.KE.util.slugify || slugify;
      w.KE.util.escapeHtml = w.KE.util.escapeHtml || escapeHtml;
      w.KE.util.clamp = w.KE.util.clamp || clamp;
    }
  } catch {}
} catch {}
})();
